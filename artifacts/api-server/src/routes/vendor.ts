import { db } from "@workspace/db";
import {
  deliveryAccessRequestsTable,
  deliveryWhitelistTable,
  liveLocationsTable,
  notificationsTable,
  orderAuditLogTable,
  ordersTable,
  productsTable,
  productStockHistoryTable,
  promoCodesTable,
  reviewsTable,
  usersTable,
  vendorProfilesTable,
  vendorSchedulesTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { t } from "@workspace/i18n";
import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { getUserLanguage } from "../lib/getUserLanguage.js";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import {
  sendCreated,
  sendError,
  sendErrorWithData,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../lib/response.js";
import { emitRiderNewRequest, getIO } from "../lib/socketio.js";
import { requireRole } from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";
import { getCachedSettings } from "./admin.js";

const router: IRouter = Router();

/* ── Auth: replaced duplicated vendorAuth with the shared requireRole factory ── */
router.use(requireRole("vendor", { vendorApprovalCheck: true }));

/* ── Load full vendor user object so req.vendorUser is available to all routes ──
   requireRole sets req.vendorId but not req.vendorUser. Routes that call
   formatUser(req.vendorUser!) crash with "Cannot read properties of undefined".
   This middleware fetches the user row once per request and caches it on req. ── */
router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vendorId = req.vendorId;
    if (!vendorId) {
      next();
      return;
    }
    if (req.vendorUser) {
      next();
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, vendorId)).limit(1);
    if (!user) {
      res.status(403).json({ success: false, error: "Vendor account not found" });
      return;
    }
    req.vendorUser = user as typeof user & typeof req.vendorUser;
    next();
  } catch (err) {
    logger.error({ err }, "[vendor] user-load middleware error");
    next(err);
  }
});

/* ── Vendor PATCH schemas ── */
const patchProfileSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    cnic: z.string().max(20).optional(),
    address: z.string().max(300).optional(),
    city: z.string().max(100).optional(),
    bankName: z.string().max(100).optional(),
    bankAccount: z.string().max(50).optional(),
    bankAccountTitle: z.string().max(100).optional(),
    businessType: z.string().max(50).optional(),
    cnicFrontUrl: z.string().url().optional().nullable(),
    cnicBackUrl: z.string().url().optional().nullable(),
    businessDocUrl: z.string().url().optional().nullable(),
  })
  .strict();

const patchStoreSchema = z.object({
  storeName: z.string().min(1).max(100).optional(),
  storeCategory: z.string().max(50).optional(),
  storeBanner: z.string().url().optional().nullable(),
  storeDescription: z.string().max(1000).optional(),
  storeAnnouncement: z.string().max(500).optional(),
  storeDeliveryTime: z.string().max(50).optional(),
  storeIsOpen: z.boolean().optional(),
  storeMinOrder: z.number().min(0).optional(),
  storeAddress: z.string().max(300).optional(),
  storeHours: z.any().optional(),
  storeLat: z.union([z.string(), z.number()]).optional().nullable(),
  storeLng: z.union([z.string(), z.number()]).optional().nullable(),
});

/* ── Idempotency cache for vendor withdrawal (prevents double-submit) ─────────
   Same pattern as rider/index.ts — keyed by vendorId + method + path + header. */
interface VendorIdempotencyEntry { status: number; body: unknown; ts: number }
const vendorIdempotencyCache = new Map<string, VendorIdempotencyEntry>();
const VENDOR_IDEM_TTL_MS = 5 * 60_000;

function checkVendorIdempotency(req: Request, res: Response): boolean {
  const key = req.headers["x-idempotency-key"];
  if (!key || typeof key !== "string") return false;
  const vendorId = req.vendorId ?? "anon";
  const cacheKey = `${vendorId}:${req.method}:${req.path}:${key}`;
  const now = Date.now();
  vendorIdempotencyCache.forEach((v, k) => { if (now - v.ts > VENDOR_IDEM_TTL_MS) vendorIdempotencyCache.delete(k); });
  const existing = vendorIdempotencyCache.get(cacheKey);
  if (existing) { res.status(existing.status).json(existing.body); return true; }
  return false;
}
function storeVendorIdempotency(req: Request, status: number, body: unknown): void {
  const key = req.headers["x-idempotency-key"];
  if (!key || typeof key !== "string") return;
  const vendorId = req.vendorId ?? "anon";
  const cacheKey = `${vendorId}:${req.method}:${req.path}:${key}`;
  vendorIdempotencyCache.set(cacheKey, { status, body, ts: Date.now() });
}

function safeNum(v: unknown, def = 0) {
  return parseFloat(String(v ?? def)) || def;
}
function formatUser(user: Record<string, unknown>) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    username: user.username,
    avatar: user.avatar,
    cnicFrontUrl: user.cnicFrontUrl,
    cnicBackUrl: user.cnicBackUrl,
    businessDocUrl: user.businessDocUrl,
    storeName: user.storeName,
    storeCategory: user.storeCategory,
    storeBanner: user.storeBanner,
    storeDescription: user.storeDescription,
    storeHours: user.storeHours
      ? typeof user.storeHours === "string"
        ? (() => {
            try {
              return JSON.parse(user.storeHours);
            } catch (err) {
              logger.debug(
                { error: err instanceof Error ? err.message : String(err) },
                "[fn] error with fallback return"
              );
              return null;
            }
          })()
        : user.storeHours
      : null,
    storeAnnouncement: user.storeAnnouncement,
    storeMinOrder: safeNum(user.storeMinOrder),
    storeDeliveryTime: user.storeDeliveryTime,
    storeIsOpen: user.storeIsOpen ?? true,
    storeLat: user.storeLat,
    storeLng: user.storeLng,
    walletBalance: safeNum(user.walletBalance),
    cnic: user.cnic,
    address: user.address,
    city: user.city,
    area: user.area,
    bankName: user.bankName,
    bankAccount: user.bankAccount,
    bankAccountTitle: user.bankAccountTitle,
    businessType: user.businessType,
    accountLevel: user.accountLevel,
    kycStatus: user.kycStatus,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

/* ── GET /vendor/me ── */
router.get("/me", async (req, res, next) => {
  try {
    /* appRole guard — client must supply ?appRole=vendor so the server can
     reject tokens that belong to a different app context. Returns WRONG_ROLE
     so clients can surface a meaningful "wrong app" error. */
    const appRole = req.query.appRole as string | undefined;
    if (appRole && appRole !== "vendor") {
      sendErrorWithData(
        res,
        "Access denied. This endpoint requires a vendor session.",
        { code: "WRONG_ROLE" },
        403
      );
      return;
    }
    const user = req.vendorUser!;
    const vendorId = user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const s = await getCachedSettings();
    const vendorShare = 1 - parseFloat(s["vendor_commission_pct"] ?? "15") / 100;

    const [todayOrders, todayRev, totalOrders, totalRev] = await Promise.all([
      db
        .select({ c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, vendorId),
            gte(ordersTable.createdAt, today),
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ s: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, vendorId),
            gte(ordersTable.createdAt, today),
            or(eq(ordersTable.status, "delivered"), eq(ordersTable.status, "completed")),
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ c: count() })
        .from(ordersTable)
        .where(and(eq(ordersTable.vendorId, vendorId), isNull(ordersTable.deletedAt))),
      db
        .select({ s: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, vendorId),
            or(eq(ordersTable.status, "delivered"), eq(ordersTable.status, "completed")),
            isNull(ordersTable.deletedAt)
          )
        ),
    ]);
    sendSuccess(res, {
      ...formatUser(user),
      stats: {
        todayOrders: todayOrders[0]?.c ?? 0,
        todayRevenue: parseFloat((safeNum(todayRev[0]?.s) * vendorShare).toFixed(2)),
        totalOrders: totalOrders[0]?.c ?? 0,
        totalRevenue: parseFloat((safeNum(totalRev[0]?.s) * vendorShare).toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendor/profile ── */
router.patch("/profile", validateBody(patchProfileSchema), async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const {
      name,
      email,
      cnic,
      address,
      city,
      bankName,
      bankAccount,
      bankAccountTitle,
      businessType,
      cnicFrontUrl,
      cnicBackUrl,
      businessDocUrl,
    } = req.body;
    const userUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) userUpdates.name = name;
    if (email !== undefined) userUpdates.email = email;
    if (cnic !== undefined) userUpdates.cnic = cnic;
    if (address !== undefined) userUpdates.address = address;
    if (city !== undefined) userUpdates.city = city;
    if (bankName !== undefined) userUpdates.bankName = bankName;
    if (bankAccount !== undefined) userUpdates.bankAccount = bankAccount;
    if (bankAccountTitle !== undefined) userUpdates.bankAccountTitle = bankAccountTitle;
    const [user] = await db
      .update(usersTable)
      .set(userUpdates)
      .where(eq(usersTable.id, vendorId))
      .returning();
    const profileUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (businessType !== undefined) profileUpdates.businessType = businessType;
    if (cnicFrontUrl !== undefined) profileUpdates.cnicFrontUrl = cnicFrontUrl;
    if (cnicBackUrl !== undefined) profileUpdates.cnicBackUrl = cnicBackUrl;
    if (businessDocUrl !== undefined) profileUpdates.businessDocUrl = businessDocUrl;
    if (Object.keys(profileUpdates).length > 1) {
      await db
        .insert(vendorProfilesTable)
        .values({ userId: vendorId, ...profileUpdates })
        .onConflictDoUpdate({ target: vendorProfilesTable.userId, set: profileUpdates });
    }
    const [profile] = await db
      .select({
        cnicFrontUrl: vendorProfilesTable.cnicFrontUrl,
        cnicBackUrl: vendorProfilesTable.cnicBackUrl,
        businessDocUrl: vendorProfilesTable.businessDocUrl,
        businessType: vendorProfilesTable.businessType,
      })
      .from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.userId, vendorId));
    sendSuccess(res, formatUser({ ...user, ...(profile ?? {}) }));
  } catch (err) {
    next(err);
  }
});

/* ── GET /vendor/profile/quick-replies ── */
router.get("/profile/quick-replies", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const [profile] = await db
      .select({ quickReplies: vendorProfilesTable.quickReplies })
      .from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.userId, vendorId));
    let shortcuts: string[] = [];
    if (profile?.quickReplies) {
      try {
        const parsed = JSON.parse(profile.quickReplies);
        if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
          shortcuts = parsed;
        }
      } catch (e) {
        logger.warn(
          { vendorId, err: (e as Error).message },
          "[vendor/quick-replies] corrupted quickReplies data, returning empty array"
        );
      }
    }
    sendSuccess(res, { quickReplies: shortcuts });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendor/profile/quick-replies ── */
const patchQuickRepliesSchema = z.object({
  quickReplies: z.array(z.string().max(120)).max(8),
});

router.patch(
  "/profile/quick-replies",
  validateBody(patchQuickRepliesSchema),
  async (req, res, next) => {
    try {
      const vendorId = req.vendorId!;
      const { quickReplies } = req.body as { quickReplies: string[] };
      const serialized = JSON.stringify(quickReplies.slice(0, 8));
      await db
        .insert(vendorProfilesTable)
        .values({ userId: vendorId, quickReplies: serialized })
        .onConflictDoUpdate({
          target: vendorProfilesTable.userId,
          set: { quickReplies: serialized, updatedAt: new Date() },
        });
      sendSuccess(res, { quickReplies });
    } catch (err) {
      next(err);
    }
  }
);

/* ── GET /vendor/store ── */
router.get("/store", async (req, res, next) => {
  try {
    const user = req.vendorUser!;
    sendSuccess(res, formatUser(user));
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendor/store ── */
router.patch("/store", validateBody(patchStoreSchema), async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const body = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const fields = [
      "storeName",
      "storeCategory",
      "storeBanner",
      "storeDescription",
      "storeAnnouncement",
      "storeDeliveryTime",
      "storeIsOpen",
      "storeMinOrder",
      "storeAddress",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.storeHours !== undefined)
      updates.storeHours =
        typeof body.storeHours === "string" ? body.storeHours : JSON.stringify(body.storeHours);
    if (body.storeLat !== undefined && body.storeLat != null)
      updates.storeLat = String(body.storeLat);
    if (body.storeLng !== undefined && body.storeLng != null)
      updates.storeLng = String(body.storeLng);
    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, vendorId))
      .returning();
    sendSuccess(res, formatUser(user));
  } catch (err) {
    next(err);
  }
});

/* ── GET /vendor/stats ── */
router.get("/stats", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const s = await getCachedSettings();
    const vendorShare = 1 - parseFloat(s["vendor_commission_pct"] ?? "15") / 100;

    const [tData, wData, mData, pending, lowStock] = await Promise.all([
      db
        .select({ c: count(), s: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, vendorId),
            gte(ordersTable.createdAt, today),
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ c: count(), s: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, vendorId),
            gte(ordersTable.createdAt, weekAgo),
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ c: count(), s: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, vendorId),
            gte(ordersTable.createdAt, monthAgo),
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, vendorId),
            eq(ordersTable.status, "pending"),
            isNull(ordersTable.deletedAt)
          )
        ),
      getCachedSettings().then((cfg) => {
        const threshold = parseInt(cfg["low_stock_threshold"] ?? "10", 10) || 10;
        return db
          .select({ c: count() })
          .from(productsTable)
          .where(
            and(
              eq(productsTable.vendorId, vendorId),
              isNull(productsTable.deletedAt),
              sql`stock IS NOT NULL AND stock < ${threshold} AND stock > 0`
            )
          );
      }),
    ]);
    sendSuccess(res, {
      today: {
        orders: tData[0]?.c ?? 0,
        revenue: parseFloat((safeNum(tData[0]?.s) * vendorShare).toFixed(2)),
      },
      week: {
        orders: wData[0]?.c ?? 0,
        revenue: parseFloat((safeNum(wData[0]?.s) * vendorShare).toFixed(2)),
      },
      month: {
        orders: mData[0]?.c ?? 0,
        revenue: parseFloat((safeNum(mData[0]?.s) * vendorShare).toFixed(2)),
      },
      pending: pending[0]?.c ?? 0,
      lowStock: lowStock[0]?.c ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

/* ── GET /vendors/orders/available-riders ── list online riders ──
   MUST be registered BEFORE /orders/:id so "available-riders" isn't
   swallowed by the parameterised route. ── */
router.get("/orders/available-riders", async (req, res, next) => {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const riders = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        avatar: usersTable.avatar,
        lat: liveLocationsTable.latitude,
        lng: liveLocationsTable.longitude,
        updatedAt: liveLocationsTable.updatedAt,
      })
      .from(liveLocationsTable)
      .innerJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
      .where(
        and(
          eq(liveLocationsTable.role, "rider"),
          ilike(usersTable.roles, "%rider%"),
          eq(usersTable.isOnline, true),
          gte(liveLocationsTable.updatedAt, tenMinAgo)
        )
      )
      .limit(50);
    sendSuccess(res, { riders });
  } catch (err) {
    next(err);
  }
});

/* ── GET /vendors/orders/:id ── single order detail ── */
router.get("/orders/:id", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const orderId = req.params["id"] as string;
    const [row] = await db
      .select({
        order: ordersTable,
        riderName: usersTable.name,
        riderPhone: usersTable.phone,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.riderId, usersTable.id))
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
      .limit(1);
    if (!row) {
      sendNotFound(res, "Order not found");
      return;
    }
    sendSuccess(res, {
      order: {
        ...row.order,
        total: safeNum(row.order.total),
        riderName: row.riderName ?? undefined,
        riderPhone: row.riderPhone ?? undefined,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── GET /vendor/orders ── */
router.get("/orders", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const status = req.query["status"] as string | undefined;
    const conditions: SQL[] = [eq(ordersTable.vendorId, vendorId), isNull(ordersTable.deletedAt)];
    if (status && status !== "all") {
      if (status === "new")
        conditions.push(
          or(eq(ordersTable.status, "pending"), eq(ordersTable.status, "confirmed"))!
        );
      else if (status === "active")
        conditions.push(
          or(
            eq(ordersTable.status, "preparing"),
            eq(ordersTable.status, "ready"),
            eq(ordersTable.status, "picked_up"),
            eq(ordersTable.status, "out_for_delivery")
          )!
        );
      else conditions.push(eq(ordersTable.status, status));
    }
    const orders = await db
      .select({
        order: ordersTable,
        riderName: usersTable.name,
        riderPhone: usersTable.phone,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.riderId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt))
      .limit(100);
    sendSuccess(res, {
      orders: orders.map((row) => ({
        ...row.order,
        total: safeNum(row.order.total),
        riderName: row.riderName ?? undefined,
        riderPhone: row.riderPhone ?? undefined,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendor/orders/:id/status ── */
router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    /* Strict: only status and note accepted — reject price/total etc. explicitly */
    const allowedKeys = new Set(["status", "note"]);
    const extraKeys = Object.keys(req.body).filter((k) => !allowedKeys.has(k));
    if (extraKeys.length > 0) {
      sendValidationError(
        res,
        `Unexpected fields: ${extraKeys.join(", ")}. Only "status" and "note" are accepted.`
      );
      return;
    }
    const { status, note } = req.body as { status?: string; note?: string };
    const validStatuses = ["confirmed", "preparing", "ready", "cancelled"];
    if (!status || !validStatuses.includes(status)) {
      sendValidationError(res, "Invalid status");
      return;
    }
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(
        and(eq(ordersTable.id, req.params["id"] as string), eq(ordersTable.vendorId, vendorId))
      )
      .limit(1);
    if (!order) {
      sendNotFound(res, "Order not found");
      return;
    }

    /* ── Cancellation time window: vendor can only cancel within 5 minutes ── */
    if (status === "cancelled") {
      const msSincePlaced = Date.now() - new Date(order.createdAt).getTime();
      if (msSincePlaced > 5 * 60 * 1000) {
        sendForbidden(
          res,
          "Cancellation window has passed. Orders can only be cancelled within 5 minutes of being placed."
        );
        return;
      }
    }

    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: [],
      delivered: [],
      cancelled: [],
      completed: [],
    };
    const allowed = ALLOWED_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status)) {
      sendValidationError(
        res,
        `Cannot change order from "${order.status}" to "${status}". Allowed: ${allowed.join(", ") || "none"}.`
      );
      return;
    }

    const orderId = req.params["id"] as string;
    const custLang = await getUserLanguage(order.userId);
    const msgs: Record<string, { title: string; body: string }> = {
      confirmed: {
        title: t("notifOrderConfirmed", custLang) + " ✅",
        body: t("notifOrderConfirmedBody", custLang),
      },
      preparing: {
        title: t("notifOrderPreparing", custLang) + " 🍳",
        body: t("notifOrderPreparingBody", custLang),
      },
      ready: {
        title: t("notifOrderReady", custLang) + " 📦",
        body: t("notifOrderReadyBody", custLang),
      },
      cancelled: {
        title: t("notifOrderCancelled", custLang) + " ❌",
        body: t("notifOrderCancelledBody", custLang),
      },
    };

    let updated: typeof order;
    let auditLogged = false;

    if (status === "confirmed") {
      /*
       * SINGLE-DECREMENT DESIGN — DO NOT RE-INTRODUCE STOCK DECREMENT HERE.
       *
       * Stock was already decremented atomically at order placement time inside
       * the `decrementStock()` call in orders.ts (within the placement db.transaction).
       * That path uses SELECT FOR UPDATE row-locking and writes a full audit record
       * to product_stock_history with quantityDelta and orderId.
       *
       * Adding a second decrement here would silently halve vendor stock on every
       * confirmed order, causing vendors to run out of inventory at double the real
       * rate. The confirmation step only needs to advance the order status.
       *
       * If you need to guard against oversell at confirmation time, add a
       * stock-check READ (no UPDATE) here and return 409 if stock has somehow
       * gone negative — but do NOT decrement again.
       */

      /* Informational audit entries — quantityDelta is 0 to make clear no stock moved */
      const confirmItems = Array.isArray(order.items)
        ? (order.items as Array<{ productId?: string; quantity?: number }>)
        : [];
      const confirmItemsWithProducts = confirmItems.filter((it) => it.productId);

      try {
        /* Wrap status update + audit log in ONE transaction so a failed log insert
         rolls back the status change and prevents phantom confirmed orders with no trail. */
        const result = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(ordersTable)
            .set({ status, updatedAt: new Date() })
            .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
            .returning();
          if (!row) throw new Error("ORDER_NOT_FOUND");
          await tx.insert(orderAuditLogTable).values({
            id: generateId(),
            orderId,
            vendorId,
            fromStatus: order.status,
            toStatus: status,
            note: note || null,
          });
          return row;
        });
        updated = result;
        auditLogged = true;

        /* Informational stock-history entries — non-critical, outside the tx */
        for (const item of confirmItemsWithProducts) {
          const [prod] = await db
            .select({ id: productsTable.id, stock: productsTable.stock })
            .from(productsTable)
            .where(and(eq(productsTable.id, item.productId!), eq(productsTable.vendorId, vendorId)))
            .limit(1);
          if (!prod) continue;
          await db
            .insert(productStockHistoryTable)
            .values({
              id: generateId(),
              productId: prod.id,
              vendorId,
              previousStock: prod.stock,
              newStock: prod.stock,
              quantityDelta: 0,
              reason: "order_confirmed",
              orderId,
              source: `confirm:${orderId}`,
            })
            .catch((err: unknown) => {
              logger.warn(
                {
                  err: err instanceof Error ? err.message : String(err),
                  productId: prod.id,
                  orderId,
                },
                "[vendor] stock log insert failed (non-critical)"
              );
            });
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.message === "ORDER_NOT_FOUND") {
          sendNotFound(res, "Order not found");
          return;
        }
        sendNotFound(res, err.message || "Failed to confirm order");
        return;
      }
    } else if (status === "cancelled" && order.paymentMethod === "wallet") {
      /* Atomic: status update + wallet credit + refund stamp in one tx.
       WHERE refunded_at IS NULL guard prevents double-credit under concurrent requests. */
      const refundAmt = safeNum(order.total);
      const now = new Date();
      const txResult = await db
        .transaction(async (tx) => {
          const result = await tx
            .update(ordersTable)
            .set({
              status,
              refundedAt: now,
              refundedAmount: refundAmt.toFixed(2),
              paymentStatus: "refunded",
              updatedAt: now,
            })
            .where(
              and(
                eq(ordersTable.id, orderId),
                eq(ordersTable.vendorId, vendorId),
                isNull(ordersTable.refundedAt)
              )
            )
            .returning();
          if (result.length === 0) throw new Error("ALREADY_REFUNDED");
          await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: now })
            .where(eq(usersTable.id, order.userId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: order.userId,
            type: "credit",
            amount: refundAmt.toFixed(2),
            description: `Refund — Order #${orderId.slice(-6).toUpperCase()} cancelled by store`,
          });
          return result[0];
        })
        .catch((err: Error) => {
          if (err.message === "ALREADY_REFUNDED") return null;
          throw err;
        });
      if (!txResult) {
        sendError(res, "Order has already been refunded", 409);
        return;
      }
      updated = txResult;
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: order.userId,
          title: t("notifRefundProcessed", custLang) + " 💰",
          body: t("notifRefundProcessedBody", custLang).replace(
            "{amount}",
            safeNum(order.total).toFixed(0)
          ),
          type: "wallet",
          icon: "wallet-outline",
        })
        .catch((e: Error) =>
          logger.warn(
            {
              message: "[vendor/order-status] refund notification insert failed",
              error: e.message,
              code: "VENDOR_NOTIF_REFUND_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
              orderId,
              userId: order.userId,
            },
            "[vendor/order-status] refund notification insert failed"
          )
        );
    } else {
      /* Non-wallet or non-cancel: plain status update — vendorId in WHERE closes TOCTOU window */
      const [result] = await db
        .update(ordersTable)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
        .returning();
      if (!result) {
        sendNotFound(res, "Order not found");
        return;
      }
      updated = result;
    }

    /* ── Audit trail: record every status transition (skip confirmed — already logged atomically above) ── */
    if (!auditLogged) {
      await db
        .insert(orderAuditLogTable)
        .values({
          id: generateId(),
          orderId,
          vendorId,
          fromStatus: order.status,
          toStatus: status,
          note: note || null,
        })
        .catch((e: Error) =>
          logger.warn(
            {
              message: "[vendor/order-status] audit log insert failed",
              error: e.message,
              code: "VENDOR_AUDIT_LOG_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
              orderId,
              vendorId,
            },
            "[vendor/order-status] audit log insert failed"
          )
        );
    }

    if (msgs[status]) {
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: order.userId,
          title: msgs[status]!.title,
          body: msgs[status]!.body,
          type: "order",
          icon: "bag-outline",
        })
        .catch((e: Error) =>
          logger.warn(
            {
              message: "[vendor/order-status] status notification insert failed",
              error: e.message,
              code: "VENDOR_NOTIF_STATUS_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
              orderId,
              userId: order.userId,
              status,
            },
            "[vendor/order-status] status notification insert failed"
          )
        );
    }

    /* ── Push notification to customer ── */
    void (async () => {
      try {
        const { sendPushToUsers } = await import("../lib/webpush.js");
        if (msgs[status]) {
          await sendPushToUsers([order.userId], {
            title: msgs[status]!.title,
            body: msgs[status]!.body,
            tag: `order-${orderId}-${status}`,
            data: {
              orderId,
              type: status === "cancelled" ? "order_cancelled" : "order_status",
              status,
            },
          });
        }
      } catch (e) {
        logger.warn(
          { orderId, err: (e as Error).message },
          "[vendor/order-status] push notification failed"
        );
      }
    })();

    const io = getIO();
    if (io) {
      const mapped = { ...updated, total: safeNum(updated.total) };
      io.to("admin-fleet").emit("order:update", mapped);
      io.to(`vendor:${vendorId}`).emit("order:update", mapped);
      if (updated.riderId) io.to(`rider:${updated.riderId}`).emit("order:update", mapped);
    }

    if (status === "ready" && !updated.riderId) {
      void (async () => {
        try {
          const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
          const onlineRiders = await db
            .select({ userId: liveLocationsTable.userId })
            .from(liveLocationsTable)
            .innerJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
            .where(
              and(
                eq(liveLocationsTable.role, "rider"),
                ilike(usersTable.roles, "%rider%"),
                eq(usersTable.isOnline, true),
                gte(liveLocationsTable.updatedAt, tenMinAgo)
              )
            );
          for (const { userId } of onlineRiders) {
            try {
              emitRiderNewRequest(userId, {
                type: "order",
                requestId: orderId,
                summary: order.type,
              });
            } catch (emitErr) {
              logger.warn(
                { orderId, riderId: userId, err: (emitErr as Error).message },
                "[vendor/order-status] Failed to notify rider on order ready"
              );
            }
          }
        } catch (err) {
          logger.warn(
            { orderId, err: (err as Error).message },
            "[vendor/order-status] rider notification loop failed"
          );
        }
      })();
    }
    sendSuccess(res, { ...updated, total: safeNum(updated.total) });
  } catch (err) {
    next(err);
  }
});

/* ── GET /vendor/promos ── list promos owned by vendor ── */
router.get("/promos", async (req, res, next) => {
  try {
    const vendorId = (req as Request & { vendorId?: string }).vendorId;
    if (!vendorId) {
      sendForbidden(res, "Vendor auth required");
      return;
    }
    const promos = await db
      .select()
      .from(promoCodesTable)
      .where(eq(promoCodesTable.vendorId, vendorId))
      .orderBy(desc(promoCodesTable.createdAt));
    sendSuccess(res, { promos });
  } catch (err) {
    next(err);
  }
});

/* ── POST /vendor/promos ── create a promo ── */
router.post("/promos", async (req, res, next) => {
  try {
    const vendorId = (req as Request & { vendorId?: string }).vendorId;
    if (!vendorId) {
      sendForbidden(res, "Vendor auth required");
      return;
    }
    const {
      code,
      discountPct,
      discountFlat,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      expiresAt,
      description,
      appliesTo,
    } = req.body as Record<string, unknown>;
    if (!code || (discountPct === undefined && discountFlat === undefined)) {
      sendValidationError(res, "code and either discountPct or discountFlat are required");
      return;
    }
    const [promo] = await db
      .insert(promoCodesTable)
      .values({
        id: generateId(),
        code: String(code).toUpperCase().trim(),
        discountPct: discountPct !== undefined ? String(discountPct) : null,
        discountFlat: discountFlat !== undefined ? String(discountFlat) : null,
        minOrderAmount: minOrderAmount !== undefined ? String(minOrderAmount) : "0",
        maxDiscount: maxDiscount !== undefined ? String(maxDiscount) : null,
        usageLimit: usageLimit !== undefined ? Number(usageLimit) : null,
        expiresAt: expiresAt ? new Date(String(expiresAt)) : null,
        description: description ? String(description) : null,
        appliesTo: appliesTo ? String(appliesTo) : "all",
        vendorId,
        isActive: true,
      })
      .returning();
    sendCreated(res, { promo });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendor/promos/:id ── update a promo ── */
router.patch("/promos/:id", async (req, res, next) => {
  try {
    const vendorId = (req as Request & { vendorId?: string }).vendorId;
    if (!vendorId) {
      sendForbidden(res, "Vendor auth required");
      return;
    }
    const [existing] = await db
      .select()
      .from(promoCodesTable)
      .where(
        and(
          eq(promoCodesTable.id, req.params["id"] as string),
          eq(promoCodesTable.vendorId, vendorId)
        )
      )
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Promo not found");
      return;
    }
    const {
      discountPct,
      discountFlat,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      expiresAt,
      description,
      appliesTo,
    } = req.body as Record<string, unknown>;
    const updates: Partial<typeof promoCodesTable.$inferInsert> = {};
    if (discountPct !== undefined) updates.discountPct = discountPct ? String(discountPct) : null;
    if (discountFlat !== undefined)
      updates.discountFlat = discountFlat ? String(discountFlat) : null;
    if (minOrderAmount !== undefined)
      updates.minOrderAmount = minOrderAmount ? String(minOrderAmount) : "0";
    if (maxDiscount !== undefined) updates.maxDiscount = maxDiscount ? String(maxDiscount) : null;
    if (usageLimit !== undefined) updates.usageLimit = usageLimit ? Number(usageLimit) : null;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(String(expiresAt)) : null;
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (appliesTo !== undefined) updates.appliesTo = String(appliesTo);
    const [promo] = await db
      .update(promoCodesTable)
      .set(updates)
      .where(eq(promoCodesTable.id, existing.id))
      .returning();
    sendSuccess(res, { promo });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendor/promos/:id/toggle ── activate / deactivate a promo ── */
router.patch("/promos/:id/toggle", async (req, res, next) => {
  try {
    const vendorId = (req as Request & { vendorId?: string }).vendorId;
    if (!vendorId) {
      sendForbidden(res, "Vendor auth required");
      return;
    }
    const [existing] = await db
      .select()
      .from(promoCodesTable)
      .where(
        and(
          eq(promoCodesTable.id, req.params["id"] as string),
          eq(promoCodesTable.vendorId, vendorId)
        )
      )
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Promo not found");
      return;
    }
    const [promo] = await db
      .update(promoCodesTable)
      .set({ isActive: !existing.isActive })
      .where(eq(promoCodesTable.id, existing.id))
      .returning();
    sendSuccess(res, { promo });
  } catch (err) {
    next(err);
  }
});

/* ── DELETE /vendor/promos/:id ── delete a promo ── */
router.delete("/promos/:id", async (req, res, next) => {
  try {
    const vendorId = (req as Request & { vendorId?: string }).vendorId;
    if (!vendorId) {
      sendForbidden(res, "Vendor auth required");
      return;
    }
    const [existing] = await db
      .select()
      .from(promoCodesTable)
      .where(
        and(
          eq(promoCodesTable.id, req.params["id"] as string),
          eq(promoCodesTable.vendorId, vendorId)
        )
      )
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Promo not found");
      return;
    }
    await db.delete(promoCodesTable).where(eq(promoCodesTable.id, existing.id));
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   PRODUCTS
══════════════════════════════════════════════════════════════ */

/* ── GET /vendors/products ── list vendor's products ── */
router.get("/products", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const {
      category,
      search,
      inStock,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions: SQL[] = [
      eq(productsTable.vendorId, vendorId),
      isNull(productsTable.deletedAt),
    ];
    if (category) conditions.push(eq(productsTable.category, category));
    if (inStock === "true") conditions.push(eq(productsTable.inStock, true));
    if (inStock === "false") conditions.push(eq(productsTable.inStock, false));
    if (search)
      conditions.push(
        or(ilike(productsTable.name, `%${search}%`), ilike(productsTable.category, `%${search}%`))!
      );

    const [products, totalResult] = await Promise.all([
      db
        .select()
        .from(productsTable)
        .where(and(...conditions))
        .orderBy(desc(productsTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ c: count() })
        .from(productsTable)
        .where(and(...conditions)),
    ]);
    const total = totalResult[0]?.c ?? 0;
    sendSuccess(res, {
      products: products.map((p) => ({
        ...p,
        price: safeNum(p.price),
        originalPrice: p.originalPrice ? safeNum(p.originalPrice) : null,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST /vendors/products ── create product ── */
router.post("/products", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const user = req.vendorUser!;
    const {
      name,
      description,
      price,
      originalPrice,
      category,
      type,
      image,
      images,
      stock,
      unit,
      deliveryTime,
      inStock,
      lowStockThreshold,
      maxQuantityPerOrder,
    } = req.body as Record<string, unknown>;
    if (!name || !price || !category) {
      sendValidationError(res, "name, price, and category are required");
      return;
    }
    const s = await getCachedSettings();
    const autoApprove = (s["product_auto_approve"] ?? "on") === "on";
    const [product] = await db
      .insert(productsTable)
      .values({
        id: generateId(),
        name: String(name),
        description: description ? String(description) : null,
        price: String(parseFloat(String(price)).toFixed(2)),
        originalPrice: originalPrice ? String(parseFloat(String(originalPrice)).toFixed(2)) : null,
        category: String(category),
        type: type ? String(type) : "mart",
        image: image ? String(image) : null,
        images: Array.isArray(images) ? images.map(String) : null,
        vendorId,
        vendorName: user.name ?? user.storeName ?? null,
        inStock: inStock !== false,
        stock: stock !== undefined && stock != null ? Number(stock) : null,
        unit: unit ? String(unit) : null,
        deliveryTime: deliveryTime ? String(deliveryTime) : null,
        approvalStatus: autoApprove ? "approved" : "pending",
        lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : null,
        maxQuantityPerOrder: maxQuantityPerOrder !== undefined ? Number(maxQuantityPerOrder) : null,
      })
      .returning();
    sendCreated(res, {
      product: {
        ...product,
        price: safeNum(product.price),
        originalPrice: product.originalPrice ? safeNum(product.originalPrice) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST /vendors/products/bulk ── bulk add products ── */
router.post("/products/bulk", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const user = req.vendorUser!;
    const { products: items } = req.body as { products: Record<string, unknown>[] };
    if (!Array.isArray(items) || items.length === 0) {
      sendValidationError(res, "products array is required");
      return;
    }
    if (items.length > 500) {
      sendValidationError(res, "Max 500 products per bulk import");
      return;
    }
    const s = await getCachedSettings();
    const autoApprove = (s["product_auto_approve"] ?? "on") === "on";
    const rows = items.map((p) => ({
      id: generateId(),
      name: String(p.name ?? ""),
      description: p.description ? String(p.description) : null,
      price: String(parseFloat(String(p.price ?? 0)).toFixed(2)),
      originalPrice: p.originalPrice
        ? String(parseFloat(String(p.originalPrice)).toFixed(2))
        : null,
      category: String(p.category ?? "General"),
      type: p.type ? String(p.type) : "mart",
      image: p.image ? String(p.image) : null,
      vendorId,
      vendorName: user.name ?? null,
      inStock: p.inStock !== false,
      stock: p.stock !== undefined && p.stock != null ? Number(p.stock) : null,
      unit: p.unit ? String(p.unit) : null,
      approvalStatus: autoApprove ? "approved" : "pending",
    }));
    const inserted = await db
      .insert(productsTable)
      .values(rows)
      .returning({ id: productsTable.id });
    sendCreated(res, { inserted: inserted.length, ids: inserted.map((r) => r.id) });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendors/products/bulk ── bulk edit price/stock ── */
router.patch("/products/bulk", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const { products: items } = req.body as {
      products: Array<{ id: string; price?: number; stock?: number | null; inStock?: boolean }>;
    };
    if (!Array.isArray(items) || items.length === 0) {
      sendValidationError(res, "products array required");
      return;
    }
    let updated = 0;
    for (const item of items) {
      if (!item.id) continue;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (item.price !== undefined)
        updates.price = String(parseFloat(String(item.price)).toFixed(2));
      if (item.stock !== undefined) {
        updates.stock = item.stock != null ? Number(item.stock) : null;
        updates.inStock = item.stock == null || Number(item.stock) > 0;
      }
      if (item.inStock !== undefined) updates.inStock = item.inStock;
      await db
        .update(productsTable)
        .set(updates)
        .where(and(eq(productsTable.id, item.id), eq(productsTable.vendorId, vendorId)));
      updated++;
    }
    sendSuccess(res, { updated });
  } catch (err) {
    next(err);
  }
});

/* ── GET /vendors/products/:id/stock-history ── */
router.get("/products/:id/stock-history", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const productId = req.params["id"] as string;
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, productId),
          eq(productsTable.vendorId, vendorId),
          isNull(productsTable.deletedAt)
        )
      )
      .limit(1);
    if (!product) {
      sendNotFound(res, "Product not found");
      return;
    }
    const history = await db
      .select()
      .from(productStockHistoryTable)
      .where(eq(productStockHistoryTable.productId, productId))
      .orderBy(desc(productStockHistoryTable.changedAt))
      .limit(100);
    sendSuccess(res, { history });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendors/products/:id ── update product ── */
router.patch("/products/:id", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const productId = req.params["id"] as string;
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, productId),
          eq(productsTable.vendorId, vendorId),
          isNull(productsTable.deletedAt)
        )
      )
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Product not found");
      return;
    }
    const {
      name,
      description,
      price,
      originalPrice,
      category,
      type,
      image,
      images,
      stock,
      unit,
      deliveryTime,
      inStock,
      lowStockThreshold,
      maxQuantityPerOrder,
    } = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name);
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (price !== undefined) updates.price = String(parseFloat(String(price)).toFixed(2));
    if (originalPrice !== undefined)
      updates.originalPrice = originalPrice
        ? String(parseFloat(String(originalPrice)).toFixed(2))
        : null;
    if (category !== undefined) updates.category = String(category);
    if (type !== undefined) updates.type = String(type);
    if (image !== undefined) updates.image = image ? String(image) : null;
    if (images !== undefined) updates.images = Array.isArray(images) ? images.map(String) : null;
    if (stock !== undefined) {
      updates.stock = stock != null ? Number(stock) : null;
      updates.inStock = stock == null || Number(stock) > 0;
    }
    if (inStock !== undefined) updates.inStock = Boolean(inStock);
    if (unit !== undefined) updates.unit = unit ? String(unit) : null;
    if (deliveryTime !== undefined)
      updates.deliveryTime = deliveryTime ? String(deliveryTime) : null;
    if (lowStockThreshold !== undefined) updates.lowStockThreshold = Number(lowStockThreshold);
    if (maxQuantityPerOrder !== undefined)
      updates.maxQuantityPerOrder = Number(maxQuantityPerOrder);
    const [updated] = await db
      .update(productsTable)
      .set(updates)
      .where(eq(productsTable.id, productId))
      .returning();
    sendSuccess(res, {
      product: {
        ...updated,
        price: safeNum(updated.price),
        originalPrice: updated.originalPrice ? safeNum(updated.originalPrice) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── DELETE /vendors/products/:id ── soft delete ── */
router.delete("/products/:id", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const productId = req.params["id"] as string;
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, productId),
          eq(productsTable.vendorId, vendorId),
          isNull(productsTable.deletedAt)
        )
      )
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Product not found");
      return;
    }
    await db
      .update(productsTable)
      .set({ deletedAt: new Date() })
      .where(eq(productsTable.id, productId));
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════════════════════ */

/* ── GET /vendors/analytics ── sales analytics with optional date range ── */
router.get("/analytics", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const { days, from, to } = req.query as Record<string, string>;
    const s = await getCachedSettings();
    const vendorShare = 1 - parseFloat(s["vendor_commission_pct"] ?? "15") / 100;

    let startDate: Date;
    let endDate: Date = new Date();
    if (from && to) {
      startDate = new Date(from);
      endDate = new Date(to);
    } else {
      const d = parseInt(days ?? "30", 10) || 30;
      startDate = new Date();
      startDate.setDate(startDate.getDate() - d);
    }

    const [daily, topProducts, ordersByStatus] = await Promise.all([
      db.execute(sql`
        SELECT DATE(created_at) as date,
               COUNT(*) as orders,
               COALESCE(SUM(CASE WHEN status IN ('delivered','completed') THEN total ELSE 0 END), 0) as revenue
        FROM orders
        WHERE vendor_id = ${vendorId}
          AND deleted_at IS NULL
          AND created_at >= ${startDate}
          AND created_at <= ${endDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),
      db
        .execute(
          sql`
        SELECT p.id, p.name, p.image, p.price,
               COUNT(DISTINCT o.id) as order_count,
               COALESCE(SUM(oi.quantity), 0) as units_sold
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.items::jsonb) AS oi_raw
        CROSS JOIN LATERAL (SELECT (oi_raw->>'productId')::text as pid, (oi_raw->>'quantity')::int as quantity) AS oi
        JOIN products p ON p.id = oi.pid AND p.vendor_id = ${vendorId}
        WHERE o.vendor_id = ${vendorId}
          AND o.deleted_at IS NULL
          AND o.created_at >= ${startDate}
          AND o.created_at <= ${endDate}
        GROUP BY p.id, p.name, p.image, p.price
        ORDER BY units_sold DESC
        LIMIT 10
      `
        )
        .catch(() => ({ rows: [] })),
      db
        .select({ status: ordersTable.status, c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.vendorId, vendorId),
            isNull(ordersTable.deletedAt),
            gte(ordersTable.createdAt, startDate),
            lte(ordersTable.createdAt, endDate)
          )
        )
        .groupBy(ordersTable.status),
    ]);

    const dailyRows = (daily.rows as Array<Record<string, unknown>>).map((r) => ({
      date: r.date,
      orders: Number(r.orders),
      revenue: parseFloat((parseFloat(String(r.revenue)) * vendorShare).toFixed(2)),
    }));
    const totalRevenue = dailyRows.reduce((a, r) => a + r.revenue, 0);
    const totalOrders = dailyRows.reduce((a, r) => a + r.orders, 0);

    sendSuccess(res, {
      daily: dailyRows,
      summary: { totalRevenue: parseFloat(totalRevenue.toFixed(2)), totalOrders, vendorShare },
      topProducts: (topProducts.rows as Array<Record<string, unknown>>).map((r) => ({
        ...r,
        price: safeNum(r.price as unknown),
        orderCount: Number(r["order_count"]),
        unitsSold: Number(r["units_sold"]),
      })),
      ordersByStatus: ordersByStatus.reduce((acc: Record<string, number>, row) => {
        acc[row.status] = Number(row.c);
        return acc;
      }, {}),
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   WALLET
══════════════════════════════════════════════════════════════ */

/* ── GET /vendors/wallet/transactions ── */
router.get("/wallet/transactions", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const user = req.vendorUser!;
    const { page = "1", limit = "30" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 30);
    const offset = (pageNum - 1) * limitNum;
    const [txns, totalResult] = await Promise.all([
      db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, vendorId))
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ c: count() })
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, vendorId)),
    ]);
    sendSuccess(res, {
      balance: safeNum(user.walletBalance),
      transactions: txns.map((t) => ({ ...t, amount: safeNum(t.amount) })),
      total: totalResult[0]?.c ?? 0,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST /vendors/wallet/withdraw ── request a withdrawal ── */
router.post("/wallet/withdraw", async (req, res, next) => {
  try {
    if (checkVendorIdempotency(req, res)) return;
    const vendorId = req.vendorId!;
    const _user = req.vendorUser!;
    const {
      amount,
      bankName,
      bankAccount: _bankAccount,
      bankAccountTitle: _bankAccountTitle,
      method,
      notes: _notes,
    } = req.body as Record<string, unknown>;
    if (!amount || parseFloat(String(amount)) <= 0) {
      sendValidationError(res, "Valid amount is required");
      return;
    }
    const amt = parseFloat(String(amount));
    const id = generateId();
    await db.transaction(async (tx) => {
      /* Lock the vendor row so concurrent withdrawals cannot both pass the balance check */
      const [locked] = await tx
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, vendorId))
        .limit(1)
        .for("update");
      const liveBalance = safeNum(locked?.walletBalance);
      if (amt > liveBalance) {
        throw Object.assign(
          new Error(`Insufficient balance. Available: ${liveBalance.toFixed(2)}`),
          { code: "INSUFFICIENT", httpStatus: 400 }
        );
      }
      await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance - ${amt}`, updatedAt: new Date() })
        .where(eq(usersTable.id, vendorId));
      const idemKey = (() => {
        const k = req.headers["x-idempotency-key"];
        return k && typeof k === "string" ? `${vendorId}:withdraw:${k}` : undefined;
      })();
      await tx.insert(walletTransactionsTable).values({
        id,
        userId: vendorId,
        type: "debit",
        amount: amt.toFixed(2),
        description: `Withdrawal request — ${method ?? bankName ?? "bank transfer"}`,
        reference: `WD-${id.slice(-8).toUpperCase()}`,
        paymentMethod: method ? String(method) : "bank_transfer",
        ...(idemKey ? { idempotencyKey: idemKey } : {}),
      });
    });
    const responseBody = {
      success: true,
      transactionId: id,
      amount: amt,
      reference: `WD-${id.slice(-8).toUpperCase()}`,
    };
    storeVendorIdempotency(req, 201, responseBody);
    sendCreated(res, responseBody);
  } catch (err) {
    /* Unique constraint violation on idempotency_key — concurrent duplicate request */
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === "23505" && pgErr?.constraint?.includes("idempotency")) {
      /* Return cached response from in-memory store for the duplicate */
      if (checkVendorIdempotency(req, res)) return;
      sendError(res, "Duplicate withdrawal request — please retry in a moment.", 409);
      return;
    }
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException & { code?: string }).code === "INSUFFICIENT"
    ) {
      sendError(res, err.message, 400);
      return;
    }
    next(err);
  }
});

/* ── POST /vendors/wallet/deposit ── report a manual deposit ── */
router.post("/wallet/deposit", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const { amount, method, reference, notes: _notes } = req.body as Record<string, unknown>;
    if (!amount || parseFloat(String(amount)) <= 0) {
      sendValidationError(res, "Valid amount is required");
      return;
    }
    const amt = parseFloat(String(amount));
    const id = generateId();
    await db.insert(walletTransactionsTable).values({
      id,
      userId: vendorId,
      type: "deposit_pending",
      amount: amt.toFixed(2),
      description: `Deposit reported — awaiting admin verification (${method ?? "bank_transfer"})`,
      reference: reference ? String(reference) : `DEP-${id.slice(-8).toUpperCase()}`,
      paymentMethod: method ? String(method) : "bank_transfer",
    });
    sendCreated(res, {
      success: true,
      transactionId: id,
      message: "Deposit reported. Admin will verify and credit your account.",
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   SCHEDULE
══════════════════════════════════════════════════════════════ */

/* ── GET /vendors/schedule ── get weekly schedule ── */
router.get("/schedule", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const rows = await db
      .select()
      .from(vendorSchedulesTable)
      .where(eq(vendorSchedulesTable.vendorId, vendorId))
      .orderBy(vendorSchedulesTable.dayOfWeek);
    if (rows.length === 0) {
      const defaults = Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        openTime: "09:00",
        closeTime: "21:00",
        isEnabled: true,
      }));
      sendSuccess(res, { schedule: defaults });
    } else {
      sendSuccess(res, { schedule: rows });
    }
  } catch (err) {
    next(err);
  }
});

/* ── PUT /vendors/schedule ── update weekly schedule ── */
router.put("/schedule", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const { schedule } = req.body as {
      schedule: Array<{
        dayOfWeek: number;
        openTime: string;
        closeTime: string;
        isEnabled: boolean;
      }>;
    };
    if (!Array.isArray(schedule) || schedule.length === 0) {
      sendValidationError(res, "schedule array required");
      return;
    }
    for (const day of schedule) {
      await db
        .insert(vendorSchedulesTable)
        .values({
          id: generateId(),
          vendorId,
          dayOfWeek: Number(day.dayOfWeek),
          openTime: String(day.openTime ?? "09:00"),
          closeTime: String(day.closeTime ?? "21:00"),
          isEnabled: day.isEnabled !== false,
        })
        .onConflictDoUpdate({
          target: [vendorSchedulesTable.vendorId, vendorSchedulesTable.dayOfWeek],
          set: {
            openTime: String(day.openTime ?? "09:00"),
            closeTime: String(day.closeTime ?? "21:00"),
            isEnabled: day.isEnabled !== false,
            updatedAt: new Date(),
          },
        });
    }
    const updated = await db
      .select()
      .from(vendorSchedulesTable)
      .where(eq(vendorSchedulesTable.vendorId, vendorId))
      .orderBy(vendorSchedulesTable.dayOfWeek);
    sendSuccess(res, { schedule: updated });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════════════════════ */

/* ── GET /vendors/notifications ── */
router.get("/notifications", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const { page = "1", limit = "30" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 30);
    const offset = (pageNum - 1) * limitNum;
    const [notifs, unreadResult] = await Promise.all([
      db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, vendorId))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ c: count() })
        .from(notificationsTable)
        .where(and(eq(notificationsTable.userId, vendorId), eq(notificationsTable.isRead, false))),
    ]);
    sendSuccess(res, { notifications: notifs, unread: unreadResult[0]?.c ?? 0 });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendors/notifications/read-all ── */
router.patch("/notifications/read-all", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.userId, vendorId), eq(notificationsTable.isRead, false)));
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /vendors/notifications/:id/read ── mark single notification read ── */
router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const notifId = req.params["id"] as string;
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, notifId), eq(notificationsTable.userId, vendorId)));
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   DELIVERY ACCESS
══════════════════════════════════════════════════════════════ */

/* ── GET /vendors/delivery-access/status ── */
router.get("/delivery-access/status", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const [whitelist, request] = await Promise.all([
      db
        .select()
        .from(deliveryWhitelistTable)
        .where(
          and(
            eq(deliveryWhitelistTable.targetId, vendorId),
            eq(deliveryWhitelistTable.type, "vendor"),
            eq(deliveryWhitelistTable.status, "active")
          )
        )
        .limit(1),
      db
        .select()
        .from(deliveryAccessRequestsTable)
        .where(eq(deliveryAccessRequestsTable.vendorId, vendorId))
        .orderBy(desc(deliveryAccessRequestsTable.requestedAt))
        .limit(1),
    ]);
    const hasAccess = whitelist.length > 0;
    const pendingRequest = request[0] ?? null;
    sendSuccess(res, {
      hasDeliveryAccess: hasAccess,
      accessDetails: whitelist[0] ?? null,
      pendingRequest: pendingRequest?.status === "pending" ? pendingRequest : null,
      requestHistory: request,
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST /vendors/delivery-access/request ── */
router.post("/delivery-access/request", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const { serviceType = "all", reason } = req.body as Record<string, unknown>;
    const [existing] = await db
      .select({ id: deliveryAccessRequestsTable.id, status: deliveryAccessRequestsTable.status })
      .from(deliveryAccessRequestsTable)
      .where(
        and(
          eq(deliveryAccessRequestsTable.vendorId, vendorId),
          eq(deliveryAccessRequestsTable.status, "pending")
        )
      )
      .limit(1);
    if (existing) {
      sendError(res, "You already have a pending delivery access request", 409);
      return;
    }
    const [request] = await db
      .insert(deliveryAccessRequestsTable)
      .values({
        id: generateId(),
        vendorId,
        serviceType: String(serviceType),
        status: "pending",
        notes: reason ? String(reason) : null,
      })
      .returning();
    sendCreated(res, {
      request,
      message: "Delivery access request submitted. Admin will review it shortly.",
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   ORDERS — RIDER ASSIGNMENT
══════════════════════════════════════════════════════════════ */

/* ── GET /vendors/orders/:id/available-riders ── riders for specific order ── */
router.get("/orders/:id/available-riders", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const orderId = req.params["id"] as string;
    const [order] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
      .limit(1);
    if (!order) {
      sendNotFound(res, "Order not found");
      return;
    }
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const riders = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        avatar: usersTable.avatar,
        lat: liveLocationsTable.latitude,
        lng: liveLocationsTable.longitude,
      })
      .from(liveLocationsTable)
      .innerJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
      .where(
        and(
          eq(liveLocationsTable.role, "rider"),
          ilike(usersTable.roles, "%rider%"),
          eq(usersTable.isOnline, true),
          gte(liveLocationsTable.updatedAt, tenMinAgo)
        )
      )
      .limit(20);
    sendSuccess(res, { riders });
  } catch (err) {
    next(err);
  }
});

/* ── POST /vendors/orders/:id/assign-rider ── manually assign rider ── */
router.post("/orders/:id/assign-rider", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const orderId = req.params["id"] as string;
    const { riderId } = req.body as { riderId: string };
    if (!riderId) {
      sendValidationError(res, "riderId is required");
      return;
    }
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
      .limit(1);
    if (!order) {
      sendNotFound(res, "Order not found");
      return;
    }
    const [rider] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.id, riderId), ilike(usersTable.roles, "%rider%")))
      .limit(1);
    if (!rider) {
      sendNotFound(res, "Rider not found");
      return;
    }
    const [updated] = await db
      .update(ordersTable)
      .set({ riderId, updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId))
      .returning();
    const io = getIO();
    if (io) {
      io.to(`rider:${riderId}`).emit("order:assigned", {
        orderId,
        order: { ...updated, total: safeNum(updated.total) },
      });
      io.to(`vendor:${vendorId}`).emit("order:update", {
        ...updated,
        total: safeNum(updated.total),
      });
    }
    sendSuccess(res, {
      success: true,
      riderId,
      riderName: rider.name,
      order: { ...updated, total: safeNum(updated.total) },
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST /vendors/orders/:id/auto-assign ── auto dispatch to nearest rider ── */
router.post("/orders/:id/auto-assign", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const orderId = req.params["id"] as string;
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
      .limit(1);
    if (!order) {
      sendNotFound(res, "Order not found");
      return;
    }
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const onlineRiders = await db
      .select({ userId: liveLocationsTable.userId })
      .from(liveLocationsTable)
      .innerJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
      .where(
        and(
          eq(liveLocationsTable.role, "rider"),
          ilike(usersTable.roles, "%rider%"),
          eq(usersTable.isOnline, true),
          gte(liveLocationsTable.updatedAt, tenMinAgo)
        )
      )
      .limit(10);
    if (onlineRiders.length === 0) {
      sendError(res, "No riders available at the moment", 404);
      return;
    }
    for (const { userId } of onlineRiders) {
      emitRiderNewRequest(userId, {
        type: "order",
        requestId: orderId,
        summary: order.type ?? "delivery",
      });
    }
    sendSuccess(res, {
      success: true,
      notified: onlineRiders.length,
      message: `Dispatch request sent to ${onlineRiders.length} nearby rider(s)`,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   REVIEWS
══════════════════════════════════════════════════════════════ */

/* ── GET /vendors/reviews ── paginated reviews for this vendor ── */
router.get("/reviews", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const { page = "1", limit = "20", rating } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const offset = (pageNum - 1) * limitNum;
    const conditions: SQL[] = [
      eq(reviewsTable.vendorId, vendorId),
      eq(reviewsTable.hidden, false),
      isNull(reviewsTable.deletedAt),
    ];
    if (rating) conditions.push(eq(reviewsTable.rating, parseInt(rating, 10)));
    const [reviews, totalResult, avgResult] = await Promise.all([
      db
        .select({
          review: reviewsTable,
          customerName: usersTable.name,
          customerAvatar: usersTable.avatar,
        })
        .from(reviewsTable)
        .leftJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
        .where(and(...conditions))
        .orderBy(desc(reviewsTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ c: count() })
        .from(reviewsTable)
        .where(and(...conditions)),
      db
        .select({ avg: avg(reviewsTable.rating) })
        .from(reviewsTable)
        .where(and(...conditions)),
    ]);
    sendSuccess(res, {
      reviews: reviews.map((r) => ({
        ...r.review,
        customerName: r.customerName,
        customerAvatar: r.customerAvatar,
      })),
      total: totalResult[0]?.c ?? 0,
      averageRating: parseFloat(String(avgResult[0]?.avg ?? "0")),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
