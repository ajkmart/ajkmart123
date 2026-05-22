import { db } from "@workspace/db";
import {
  bannersTable,
  categoriesTable,
  flashDealsTable,
  notificationsTable,
  productsTable,
  productStockHistoryTable,
  promoCodesTable,
  stockSubscriptionsTable,
  usersTable,
} from "@workspace/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import {
  sendCreated,
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../lib/response.js";
import { getIO } from "../../lib/socketio.js";
import { storageUpload } from "../../lib/storage.js";
import { sendPushToUsers } from "../../lib/webpush.js";
import {
  addAuditEntry,
  adminAuth,
  generateId,
  getCachedSettings,
  getClientIp,
  getUserLanguage,
  logger,
  t,
  type AdminRequest,
  type TranslationKey,
} from "../admin-shared.js";

const router = Router();
/* ── GET /admin/products ─────────────────────────────────────────────────
   Cursor-paginated (newest-first). Accepts ?after=<cursor>&limit=<n>.
   Legacy callers that omit both receive a default page of 50.
─────────────────────────────────────────────────────────────────────────── */
router.get("/products", async (req, res) => {
  try {
    const settings = await getCachedSettings();
    const isDemoMode = (settings["platform_mode"] ?? "demo") === "demo";

    if (isDemoMode) {
      const { getDemoSnapshot } = await import("../../lib/demo-snapshot.js");
      const snap = await getDemoSnapshot();
      sendSuccess(res, {
        products: snap.products,
        total: snap.products.length,
        isDemo: true,
      });
      return;
    }

    const { buildCursorPage, decodeCursor } = await import("../../lib/pagination/cursor.js");
    const limit = Math.min(Math.max(parseInt(String(req.query["limit"] || "50")), 1), 200);
    const after = req.query["after"] as string | undefined;
    const cursor = after ? decodeCursor(after) : null;

    /* Optional vendor filter for scoped admin views */
    const vendorId = req.query["vendor"] as string | undefined;

    const conditions = [
      isNull(productsTable.deletedAt),
      ...(vendorId ? [eq(productsTable.vendorId, vendorId)] : []),
      ...(cursor ? [sql`${productsTable.createdAt} < ${cursor}::timestamptz`] : []),
    ];

    const [rows, [countRow]] = await Promise.all([
      db
        .select()
        .from(productsTable)
        .where(and(...conditions))
        .orderBy(desc(productsTable.createdAt))
        .limit(limit + 1),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(productsTable)
        .where(
          and(
            isNull(productsTable.deletedAt),
            ...(vendorId ? [eq(productsTable.vendorId, vendorId)] : [])
          )
        ),
    ]);

    const page = buildCursorPage({
      data: rows,
      limit,
      getCursorValue: (p: (typeof rows)[0]) => p.createdAt.toISOString(),
    });

    const mapP = (p: typeof productsTable.$inferSelect) => ({
      ...p,
      price: parseFloat(p.price),
      originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : null,
      rating: p.rating ? parseFloat(p.rating) : null,
      createdAt: p.createdAt.toISOString(),
    });

    sendSuccess(res, {
      products: page.data.map(mapP),
      total: countRow?.total ?? 0,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      isDemo: false,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/products/pending", async (_req, res) => {
  try {
    const products = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.approvalStatus, "pending"), isNull(productsTable.deletedAt)))
      .orderBy(desc(productsTable.createdAt));
    sendSuccess(res, {
      products: products.map((p) => ({
        ...p,
        price: parseFloat(p.price),
        originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : null,
        rating: p.rating ? parseFloat(p.rating) : null,
        createdAt: p.createdAt.toISOString(),
      })),
      total: products.length,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/products/:id/approve", async (req, res) => {
  try {
    const { note } = req.body;
    /* Fetch previous state before approve to detect back-in-stock transition */
    const [prevProduct] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, req.params["id"] as string))
      .limit(1);
    const [product] = await db
      .update(productsTable)
      .set({ approvalStatus: "approved", inStock: true, updatedAt: new Date() })
      .where(eq(productsTable.id, req.params["id"] as string))
      .returning();
    if (!product) {
      sendNotFound(res, "Product not found");
      return;
    }
    if (product.vendorId && product.vendorId !== "ajkmart_system") {
      const [vendor] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, product.vendorId))
        .limit(1);
      if (vendor) {
        const vLang = await getUserLanguage(vendor.id);
        const vBody = note
          ? t("notifProductApprovedBodyNote", vLang)
              .replace("{name}", product.name)
              .replace("{note}", note)
          : t("notifProductApprovedBody", vLang).replace("{name}", product.name);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: vendor.id,
            title: t("notifProductApproved", vLang),
            body: vBody,
            type: "system",
            icon: "checkmark-circle-outline",
          })
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err), userId: vendor.id },
              "[content] product-approved notification insert failed"
            );
          });
      }
    }
    /* Back-in-stock: notify subscribers when previously out-of-stock product is approved */
    if (
      prevProduct &&
      (!prevProduct.inStock || (prevProduct.stock != null && prevProduct.stock <= 0))
    ) {
      try {
        const subs = await db
          .select({ userId: stockSubscriptionsTable.userId })
          .from(stockSubscriptionsTable)
          .where(eq(stockSubscriptionsTable.productId, product.id));
        if (subs.length > 0) {
          const userIds = subs.map((s) => s.userId);
          await sendPushToUsers(userIds, {
            title: "Back in Stock!",
            body: `${product.name} is now available. Order before it sells out!`,
            data: { productId: product.id },
          });
          await db
            .delete(stockSubscriptionsTable)
            .where(eq(stockSubscriptionsTable.productId, product.id));
        }
      } catch (e) {
        logger.warn({ err: e }, "[back-in-stock] approve notify failed");
      }
    }
    getIO()?.to("admin-fleet").emit("product:approved", { id: product.id });
    sendSuccess(res, { ...product, price: parseFloat(product.price) });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/products/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      sendValidationError(res, "reason is required");
      return;
    }
    const [product] = await db
      .update(productsTable)
      .set({
        approvalStatus: "rejected",
        inStock: false,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, req.params["id"] as string))
      .returning();
    if (!product) {
      sendNotFound(res, "Product not found");
      return;
    }
    if (product.vendorId && product.vendorId !== "ajkmart_system") {
      const [vendor] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, product.vendorId))
        .limit(1);
      if (vendor) {
        const vLang = await getUserLanguage(vendor.id);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: vendor.id,
            title: t("notifProductRejected", vLang),
            body: t("notifProductRejectedBody", vLang)
              .replace("{name}", product.name)
              .replace("{reason}", reason),
            type: "system",
            icon: "close-circle-outline",
          })
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err), userId: vendor.id },
              "[content] product-rejected notification insert failed"
            );
          });
      }
    }
    getIO()?.to("admin-fleet").emit("product:rejected", { id: product.id });
    sendSuccess(res, { ...product, price: parseFloat(product.price) });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── GET /products/:id/stock-history ── Admin: paginated history with vendor/date filters ── */
router.get("/products/:id/stock-history", async (req, res) => {
  try {
    const productId = req.params["id"] as string;
    const vendorId = req.query["vendorId"] as string | undefined;
    const from = req.query["from"] as string | undefined;
    const to = req.query["to"] as string | undefined;
    const page = Math.max(1, parseInt(req.query["page"] as string) || 1);
    const limit = Math.min(100, parseInt(req.query["limit"] as string) || 50);
    const offset = (page - 1) * limit;

    const [product] = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (!product) {
      sendNotFound(res, "Product not found");
      return;
    }

    const rows = await db
      .select()
      .from(productStockHistoryTable)
      .where(
        and(
          eq(productStockHistoryTable.productId, productId),
          vendorId ? eq(productStockHistoryTable.vendorId, vendorId) : undefined,
          from ? gte(productStockHistoryTable.changedAt, new Date(from)) : undefined,
          to ? lte(productStockHistoryTable.changedAt, new Date(to)) : undefined
        )
      )
      .orderBy(desc(productStockHistoryTable.changedAt))
      .limit(limit)
      .offset(offset);

    const history = rows.map((r) => ({
      id: r.id,
      delta: (r.newStock ?? 0) - (r.previousStock ?? 0),
      previousStock: r.previousStock,
      newStock: r.newStock,
      reason: r.reason,
      source: r.source,
      orderId: r.orderId,
      vendorId: r.vendorId,
      changedAt: r.changedAt,
    }));

    sendSuccess(res, {
      history,
      page,
      limit,
      productId,
      productName: product.name,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

const SYSTEM_VENDOR_ID = "ajkmart_system";

async function ensureSystemVendor(): Promise<void> {
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, SYSTEM_VENDOR_ID));
  if (existing.length === 0) {
    await db.insert(usersTable).values({
      id: SYSTEM_VENDOR_ID,
      phone: "+920000000000",
      name: "AJKMart System",
      roles: "vendor",
      city: "Muzaffarabad",
      area: "System",
      phoneVerified: true,
      approvalStatus: "approved",
      isActive: true,
      walletBalance: "0",
    });
  }
}

const createProductSchema = z.object({
  name: z.string().min(1, "name is required"),
  price: z.number({ coerce: true }).positive("price must be a positive number"),
  category: z.string().min(1, "category is required"),
  description: z.string().optional().nullable(),
  originalPrice: z.number({ coerce: true }).positive().optional().nullable(),
  type: z.string().optional(),
  unit: z.string().optional().nullable(),
  vendorName: z.string().optional(),
  inStock: z.boolean().optional(),
  deliveryTime: z.string().optional(),
  image: z.string().optional().nullable(),
});

router.post("/products", async (req, res) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors[0]?.message ?? "Invalid request body");
      return;
    }
    const {
      name,
      description,
      price,
      originalPrice,
      category,
      type,
      unit,
      vendorName,
      inStock,
      deliveryTime,
      image,
    } = parsed.data;
    await ensureSystemVendor();
    const [product] = await db
      .insert(productsTable)
      .values({
        id: generateId(),
        name,
        description: description || null,
        price: String(price),
        originalPrice: originalPrice ? String(originalPrice) : null,
        category,
        type: type || "mart",
        vendorId: SYSTEM_VENDOR_ID,
        vendorName: vendorName || "AJKMart Store",
        unit: unit || null,
        inStock: inStock !== false,
        deliveryTime: deliveryTime || "30-45 min",
        rating: "4.5",
        reviewCount: 0,
        image: image || null,
      })
      .returning();
    if (!product) {
      sendError(res, "Failed to create product", 500);
      return;
    }
    sendCreated(res, { ...product, price: parseFloat(product.price) });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── POST /products/bulk-refill-reminder — notify vendors of selected low-stock products ── */
router.post("/products/bulk-refill-reminder", adminAuth, async (req, res) => {
  try {
    const { productIds } = req.body as { productIds?: string[] };
    if (!Array.isArray(productIds) || productIds.length === 0) {
      sendValidationError(res, "productIds must be a non-empty array");
      return;
    }
    const { inArray } = await import("drizzle-orm");
    const prods = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        vendorId: productsTable.vendorId,
      })
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));

    /* Group product names by vendor, skip system-owned products */
    const vendorProductMap = new Map<string, string[]>();
    for (const p of prods) {
      if (!p.vendorId || p.vendorId === SYSTEM_VENDOR_ID) continue;
      const names = vendorProductMap.get(p.vendorId) ?? [];
      names.push(p.name);
      vendorProductMap.set(p.vendorId, names);
    }

    const notifiedVendorIds: string[] = [];
    const failedVendorIds: string[] = [];

    for (const [vendorId, productNames] of vendorProductMap) {
      const [vendor] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, vendorId))
        .limit(1);
      if (!vendor) {
        failedVendorIds.push(vendorId);
        continue;
      }

      /* One combined in-app notification per vendor listing all affected products */
      const body =
        productNames.length === 1
          ? `Restock needed: ${productNames[0]} is running low. Please refill inventory.`
          : `Restock needed: ${productNames.join(", ")} are running low. Please refill inventory.`;

      let delivered = false;
      try {
        await db.insert(notificationsTable).values({
          id: generateId(),
          userId: vendorId,
          title: "Restock Needed",
          body,
          type: "system",
          icon: "alert-circle-outline",
        });
        delivered = true;
      } catch (e) {
        logger.warn(
          { err: e, vendorId },
          "[bulk-refill-reminder] in-app notification insert failed"
        );
      }

      try {
        await sendPushToUsers([vendorId], { title: "Restock Needed", body });
      } catch (e) {
        logger.warn({ err: e, vendorId }, "[bulk-refill-reminder] push send failed");
      }

      if (delivered) {
        notifiedVendorIds.push(vendorId);
      } else {
        failedVendorIds.push(vendorId);
      }
    }

    sendSuccess(res, {
      notified: notifiedVendorIds.length,
      vendorIds: notifiedVendorIds,
      failed: failedVendorIds.length,
      failedVendorIds,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── PATCH /products/bulk — single atomic bulk update for price/category/stock ── */
router.patch("/products/bulk", async (req, res) => {
  try {
    const { ids, update } = req.body as {
      ids: string[];
      update: {
        price?: number;
        category?: string;
        inStock?: boolean;
        stock?: number;
      };
    };
    if (!Array.isArray(ids) || ids.length === 0) {
      sendValidationError(res, "ids must be a non-empty array");
      return;
    }
    if (!update || typeof update !== "object" || Object.keys(update).length === 0) {
      sendValidationError(res, "update must contain at least one field");
      return;
    }
    const updates: Partial<typeof productsTable.$inferInsert> = {};
    if (update.price !== undefined) updates.price = String(update.price);
    if (update.category !== undefined) updates.category = update.category;
    if (update.inStock !== undefined) updates.inStock = update.inStock;
    if (update.stock !== undefined) updates.stock = update.stock;
    const { inArray } = await import("drizzle-orm");
    const updated = await db
      .update(productsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(inArray(productsTable.id, ids))
      .returning({ id: productsTable.id });
    sendSuccess(res, {
      updated: updated.length,
      ids: updated.map((r) => r.id),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/products/:id", async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      originalPrice,
      category,
      unit,
      inStock,
      stock,
      vendorName,
      deliveryTime,
      image,
    } = req.body;
    const updates: Partial<typeof productsTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = String(price);
    if (originalPrice !== undefined)
      updates.originalPrice = originalPrice ? String(originalPrice) : null;
    if (category !== undefined) updates.category = category;
    if (unit !== undefined) updates.unit = unit;
    if (inStock !== undefined) updates.inStock = inStock;
    if (stock !== undefined) updates.stock = stock;
    if (vendorName !== undefined) updates.vendorName = vendorName;
    if (deliveryTime !== undefined) updates.deliveryTime = deliveryTime;
    if (image !== undefined) updates.image = image;

    /* Fetch previous state to detect back-in-stock transition */
    const [prevProduct] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, req.params["id"] as string))
      .limit(1);

    const [product] = await db
      .update(productsTable)
      .set(updates)
      .where(eq(productsTable.id, req.params["id"] as string))
      .returning();
    if (!product) {
      sendNotFound(res, "Product not found");
      return;
    }

    /* Back-in-stock: notify subscribers when product becomes available again */
    if (prevProduct) {
      const wasOutOfStock =
        !prevProduct.inStock || (prevProduct.stock != null && prevProduct.stock <= 0);
      const isNowAvailable = product.inStock || (product.stock != null && product.stock > 0);
      if (wasOutOfStock && isNowAvailable) {
        try {
          const subs = await db
            .select({ userId: stockSubscriptionsTable.userId })
            .from(stockSubscriptionsTable)
            .where(eq(stockSubscriptionsTable.productId, product.id));
          if (subs.length > 0) {
            const userIds = subs.map((s) => s.userId);
            await sendPushToUsers(userIds, {
              title: "Back in Stock!",
              body: `${product.name} is now available. Order before it sells out!`,
              data: { productId: product.id },
            });
            await db
              .delete(stockSubscriptionsTable)
              .where(eq(stockSubscriptionsTable.productId, product.id));
          }
        } catch (e) {
          logger.warn({ err: e }, "[back-in-stock] admin notify failed");
        }
      }
    }

    /* ── Real-time broadcast: notify vendor room and admin fleet of stock change ── */
    if (stock !== undefined || inStock !== undefined) {
      const io = getIO();
      if (io) {
        const LOW_STOCK_THRESHOLD = 5;
        const payload = {
          productId: product.id,
          vendorId: product.vendorId,
          stock: product.stock,
          inStock: product.inStock,
          productName: product.name,
        };
        if (product.vendorId)
          io.to(`vendor:${product.vendorId}`).emit("product:stock_updated", payload);
        io.to("admin-fleet").emit("product:stock_updated", payload);
        if (product.stock != null && product.stock < LOW_STOCK_THRESHOLD) {
          io.to("admin-fleet").emit("product:stock_low", {
            ...payload,
            isLow: true,
            threshold: LOW_STOCK_THRESHOLD,
          });
        }
      }
      const adminReq = req as AdminRequest;
      void addAuditEntry({
        action: "stock:updated",
        ip: getClientIp(req),
        adminId: adminReq.adminId,
        adminName: adminReq.admin?.name,
        details: `Admin manually set stock for "${product.name}" (${product.id}) → ${product.stock ?? 0} units`,
        result: "success",
      });
    }

    sendSuccess(res, { ...product, price: parseFloat(product.price) });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const [product] = await db
      .update(productsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(productsTable.id, req.params["id"] as string), isNull(productsTable.deletedAt)))
      .returning({ id: productsTable.id });
    if (!product) {
      sendNotFound(res, "Product not found");
      return;
    }
    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── Broadcast Notification ──
 * Audience filtering uses CSV-aware role matching against `users.roles`
 * (a comma-separated list, e.g. "customer,rider,van_driver").
 * Previous LIKE '%role%' could falsely match substrings (e.g. "rider" inside
 * a future role name) and was the root cause of cross-audience leaks.
 * We now match an exact CSV element via Postgres regex with word-boundary
 * anchors and tolerate optional surrounding whitespace.
 */
const VALID_BROADCAST_ROLES = ["customer", "rider", "vendor", "admin"] as const;
type BroadcastRole = (typeof VALID_BROADCAST_ROLES)[number];

function parseTargetRoles(input: unknown): {
  roles: BroadcastRole[];
  error: string | null;
} {
  if (input === undefined || input == null || input === "all") return { roles: [], error: null };
  const list = Array.isArray(input) ? input : [input];
  const cleaned: BroadcastRole[] = [];
  for (const r of list) {
    if (typeof r !== "string") return { roles: [], error: "targetRole entries must be strings" };
    const norm = r.trim().toLowerCase();
    if (!norm) continue;
    if (!VALID_BROADCAST_ROLES.includes(norm as BroadcastRole)) {
      return {
        roles: [],
        error: `Invalid targetRole "${r}". Must be one of: ${VALID_BROADCAST_ROLES.join(", ")}`,
      };
    }
    if (!cleaned.includes(norm as BroadcastRole)) cleaned.push(norm as BroadcastRole);
  }
  return { roles: cleaned, error: null };
}

function buildRoleConditions(roles: BroadcastRole[]) {
  const conditions = [eq(usersTable.isActive, true)];
  if (roles.length > 0) {
    /* Matches an exact CSV element with optional whitespace around it.
       e.g. "rider" matches "rider", "customer,rider", "rider , vendor"
       but NOT a hypothetical "super_rider" or "ridernew". */
    const roleClauses = roles.map((r) => sql`${usersTable.roles} ~ ${`(^|,)\\s*${r}\\s*(,|$)`}`);
    conditions.push(roleClauses.length === 1 ? roleClauses[0]! : or(...roleClauses)!);
  }
  return conditions;
}

/* GET /broadcast/recipients/count?targetRole=rider
 * Also accepts repeated targetRole params or a comma list, e.g. ?targetRole=rider,vendor
 * Returns { count, targetRoles } so the admin UI can preview the audience size
 * BEFORE sending the broadcast. */
router.get("/broadcast/recipients/count", async (req, res) => {
  try {
    const raw = req.query["targetRole"];
    let parsed: unknown = raw;
    if (typeof raw === "string" && raw.includes(",")) {
      parsed = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const { roles, error } = parseTargetRoles(parsed);
    if (error) {
      sendValidationError(res, error);
      return;
    }

    const conditions = buildRoleConditions(roles);
    const [row] = await db
      .select({ c: count() })
      .from(usersTable)
      .where(and(...conditions, isNull(usersTable.deletedAt)));
    sendSuccess(res, {
      count: row?.c ?? 0,
      targetRoles: roles.length > 0 ? roles : ["all"],
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/broadcast", async (req, res) => {
  try {
    const {
      title,
      body,
      titleKey,
      bodyKey,
      type = "system",
      icon = "notifications-outline",
      targetRole,
    } = req.body;
    if (!title && !titleKey) {
      sendValidationError(res, "title or titleKey required");
      return;
    }
    if (!body && !bodyKey) {
      sendValidationError(res, "body or bodyKey required");
      return;
    }

    const { roles, error } = parseTargetRoles(targetRole);
    if (error) {
      sendValidationError(res, error);
      return;
    }

    const conditions = buildRoleConditions(roles);
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(...conditions, isNull(usersTable.deletedAt)));
    let sent = 0;
    for (const user of users) {
      let localTitle = title as string;
      let localBody = body as string;
      if (titleKey || bodyKey) {
        const lang = await getUserLanguage(user.id);
        if (titleKey) localTitle = t(titleKey as TranslationKey, lang);
        if (bodyKey) localBody = t(bodyKey as TranslationKey, lang);
      }
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: user.id,
          title: localTitle,
          body: localBody,
          type,
          icon,
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId: user.id },
            "[content] broadcast notification insert failed (non-critical)"
          );
        });
      sent++;
    }
    /* Persist broadcast in history table so the admin panel can show it */
    try {
      const broadcastId = generateId();
      const adminId = req.adminId ?? null;
      const resolvedTitle = (title as string) || (titleKey as string) || "";
      const resolvedBody = (body as string) || (bodyKey as string) || "";
      await db
        .execute(
          sql`
      INSERT INTO broadcasts (id, title, body, type, target_role, sent_count, admin_id, sent_at, created_at)
      VALUES (
        ${broadcastId}, ${resolvedTitle}, ${resolvedBody}, ${type as string},
        ${roles.length > 0 ? roles.join(",") : null},
        ${sent}, ${adminId}, NOW(), NOW()
      )
    `
        )
        .catch((err: unknown) => {
          logger.debug(
            { err: err instanceof Error ? err.message : String(err) },
            "[content] broadcast history insert failed — table may not exist yet"
          );
        });
    } catch (err) {
      logger.debug({ error: err instanceof Error ? err.message : String(err) }, `[fn] non-fatal`);
    }

    sendSuccess(res, {
      success: true,
      sent,
      targetRoles: roles.length > 0 ? roles : ["all"],
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── Wallet Transactions ── */
router.get("/categories/tree", async (req, res) => {
  try {
    const type = req.query["type"] as string;
    const conditions: SQL<unknown>[] = [];
    if (type) conditions.push(eq(categoriesTable.type, type));

    const allCats = await db
      .select()
      .from(categoriesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(categoriesTable.sortOrder));

    const topLevel = allCats.filter((c) => !c.parentId);
    const childrenMap = new Map<string, typeof allCats>();
    for (const c of allCats) {
      if (c.parentId) {
        const arr = childrenMap.get(c.parentId) || [];
        arr.push(c);
        childrenMap.set(c.parentId, arr);
      }
    }

    const tree = topLevel.map((c) => ({
      ...c,
      children: childrenMap.get(c.id) || [],
    }));

    sendSuccess(res, { categories: tree });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const type = req.query["type"] as string | undefined;
    const conditions: SQL<unknown>[] = [];
    if (type) conditions.push(eq(categoriesTable.type, type));
    const categories = await db
      .select()
      .from(categoriesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(categoriesTable.sortOrder));
    sendSuccess(res, { categories });
  } catch (_e) {
    sendError(res, "Failed to load categories", 500);
  }
});

router.post("/categories", async (req, res) => {
  try {
    const { name, icon, type, parentId, sortOrder, isActive } = req.body;
    if (!name || !type) {
      sendValidationError(res, "name and type are required");
      return;
    }

    const id = generateId();
    const [category] = await db
      .insert(categoriesTable)
      .values({
        id,
        name,
        icon: icon || "grid-outline",
        type,
        parentId: parentId || null,
        sortOrder: sortOrder ?? 0,
        isActive: isActive !== false,
      })
      .returning();

    sendCreated(res, category);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/categories/:id", async (req, res) => {
  try {
    const { name, icon, type, parentId, sortOrder, isActive } = req.body;

    const updates: Partial<typeof categoriesTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (icon !== undefined) updates.icon = icon;
    if (type !== undefined) updates.type = type;
    if (parentId !== undefined) updates.parentId = parentId || null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db
      .update(categoriesTable)
      .set(updates)
      .where(eq(categoriesTable.id, req.params["id"] as string))
      .returning();

    if (!updated) {
      sendNotFound(res, "Category not found");
      return;
    }

    sendSuccess(res, updated);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    const id = req.params["id"] as string;

    await db
      .update(categoriesTable)
      .set({ parentId: null })
      .where(eq(categoriesTable.parentId, id));

    const [deleted] = await db
      .delete(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .returning();

    if (!deleted) {
      sendNotFound(res, "Category not found");
      return;
    }

    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/categories/reorder", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      sendValidationError(res, "items array required");
      return;
    }

    for (const item of items) {
      if (item.id && typeof item.sortOrder === "number") {
        await db
          .update(categoriesTable)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(categoriesTable.id, item.id));
      }
    }

    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── Banners ── */
router.get("/banners", async (req, res) => {
  try {
    const placement = req.query["placement"] as string | undefined;
    const status = req.query["status"] as string | undefined;

    const banners = await db
      .select()
      .from(bannersTable)
      .orderBy(asc(bannersTable.sortOrder), desc(bannersTable.createdAt));
    const now = new Date();
    let mapped = banners.map((b) => ({
      ...b,
      startDate: b.startDate ? b.startDate.toISOString() : null,
      endDate: b.endDate ? b.endDate.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      status: (!b.isActive
        ? "inactive"
        : b.startDate && now < b.startDate
          ? "scheduled"
          : b.endDate && now > b.endDate
            ? "expired"
            : "active") as "active" | "scheduled" | "expired" | "inactive",
    }));
    if (placement) mapped = mapped.filter((b) => b.placement === placement);
    if (status) mapped = mapped.filter((b) => b.status === status);
    sendSuccess(res, { banners: mapped, total: mapped.length });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/banners", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.title) {
      sendValidationError(res, "title is required");
      return;
    }
    const [banner] = await db
      .insert(bannersTable)
      .values({
        id: generateId(),
        title: body.title as string,
        subtitle: (body.subtitle as string) || null,
        imageUrl: (body.imageUrl as string) || null,
        linkType: (body.linkType as string) || "none",
        linkValue: (body.linkValue as string) || null,
        targetService: (body.targetService as string) || null,
        placement: (body.placement as string) || "home",
        colorFrom: (body.colorFrom as string) || "#7C3AED",
        colorTo: (body.colorTo as string) || "#4F46E5",
        icon: (body.icon as string) || null,
        sortOrder: (body.sortOrder as number) ?? 0,
        isActive: body.isActive !== false,
        startDate: body.startDate ? new Date(body.startDate as string) : null,
        endDate: body.endDate ? new Date(body.endDate as string) : null,
      })
      .returning();
    sendCreated(res, banner);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/banners/reorder", async (req, res) => {
  try {
    const { items } = req.body as {
      items: { id: string; sortOrder: number }[];
    };
    if (!Array.isArray(items)) {
      sendValidationError(res, "items array required");
      return;
    }
    for (const item of items) {
      await db
        .update(bannersTable)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(eq(bannersTable.id, item.id));
    }
    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

const bannerUpdateHandler = async (
  req: import("express").Request,
  res: import("express").Response
) => {
  const bannerId = req.params["id"] as string;
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const fields = [
    "title",
    "subtitle",
    "imageUrl",
    "linkType",
    "linkValue",
    "targetService",
    "placement",
    "colorFrom",
    "colorTo",
    "icon",
    "sortOrder",
    "isActive",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (body.startDate !== undefined)
    updates.startDate = body.startDate ? new Date(body.startDate as string) : null;
  if (body.endDate !== undefined)
    updates.endDate = body.endDate ? new Date(body.endDate as string) : null;

  const [updated] = await db
    .update(bannersTable)
    .set(updates)
    .where(eq(bannersTable.id, bannerId))
    .returning();
  if (!updated) {
    sendNotFound(res, "Banner not found");
    return;
  }
  sendSuccess(res, updated);
};
router.patch("/banners/:id", bannerUpdateHandler);
router.put("/banners/:id", bannerUpdateHandler);

router.delete("/banners/:id", async (req, res) => {
  try {
    const bannerId = req.params["id"] as string;
    const [deleted] = await db
      .delete(bannersTable)
      .where(eq(bannersTable.id, bannerId))
      .returning();
    if (!deleted) {
      sendNotFound(res, "Banner not found");
      return;
    }
    sendSuccess(res, { success: true, id: bannerId });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── Flash Deals ── */
router.get("/flash-deals", async (_req, res) => {
  try {
    const deals = await db.select().from(flashDealsTable).orderBy(desc(flashDealsTable.createdAt));
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        image: productsTable.image,
        category: productsTable.category,
      })
      .from(productsTable);
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
    const now = new Date();
    sendSuccess(res, {
      deals: deals.map((d) => ({
        ...d,
        discountPct: d.discountPct ? parseFloat(String(d.discountPct)) : null,
        discountFlat: d.discountFlat ? parseFloat(String(d.discountFlat)) : null,
        startTime: d.startTime.toISOString(),
        endTime: d.endTime.toISOString(),
        createdAt: d.createdAt.toISOString(),
        product: productMap[d.productId] ?? null,
        status: !d.isActive
          ? "inactive"
          : now < d.startTime
            ? "scheduled"
            : now > d.endTime
              ? "expired"
              : d.dealStock != null && d.soldCount >= d.dealStock
                ? "sold_out"
                : "live",
      })),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/flash-deals", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.productId || !body.startTime || !body.endTime) {
      sendValidationError(res, "productId, startTime, endTime required");
      return;
    }
    const [deal] = await db
      .insert(flashDealsTable)
      .values({
        id: generateId(),
        productId: body.productId as string,
        title: (body.title as string) || null,
        badge: (body.badge as string) || "FLASH",
        discountPct: body.discountPct ? String(body.discountPct) : null,
        discountFlat: body.discountFlat ? String(body.discountFlat) : null,
        startTime: new Date(body.startTime as string),
        endTime: new Date(body.endTime as string),
        dealStock: body.dealStock ? Number(body.dealStock) : null,
        isActive: body.isActive !== false,
      })
      .returning();
    sendCreated(res, deal);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/flash-deals/:id", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: Partial<typeof flashDealsTable.$inferInsert> = {};
    if (body.title !== undefined) updates.title = body.title as string;
    if (body.badge !== undefined) updates.badge = body.badge as string;
    if (body.discountPct !== undefined)
      updates.discountPct = body.discountPct ? String(body.discountPct) : null;
    if (body.discountFlat !== undefined)
      updates.discountFlat = body.discountFlat ? String(body.discountFlat) : null;
    if (body.startTime !== undefined) updates.startTime = new Date(body.startTime as string);
    if (body.endTime !== undefined) updates.endTime = new Date(body.endTime as string);
    if (body.dealStock !== undefined)
      updates.dealStock = body.dealStock ? Number(body.dealStock) : null;
    if (body.isActive !== undefined) updates.isActive = body.isActive as boolean;
    const [deal] = await db
      .update(flashDealsTable)
      .set(updates)
      .where(eq(flashDealsTable.id, req.params["id"] as string))
      .returning();
    if (!deal) {
      sendNotFound(res, "Deal not found");
      return;
    }
    sendSuccess(res, deal);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/flash-deals/:id", async (req, res) => {
  try {
    await db.delete(flashDealsTable).where(eq(flashDealsTable.id, req.params["id"] as string));
    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── Promo Codes ── */
router.get("/promo-codes", async (_req, res) => {
  try {
    const codes = await db.select().from(promoCodesTable).orderBy(desc(promoCodesTable.createdAt));
    const now = new Date();
    sendSuccess(res, {
      codes: codes.map((c) => ({
        ...c,
        discountPct: c.discountPct ? parseFloat(String(c.discountPct)) : null,
        discountFlat: c.discountFlat ? parseFloat(String(c.discountFlat)) : null,
        minOrderAmount: c.minOrderAmount ? parseFloat(String(c.minOrderAmount)) : 0,
        maxDiscount: c.maxDiscount ? parseFloat(String(c.maxDiscount)) : null,
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        status: !c.isActive
          ? "inactive"
          : c.expiresAt && now > c.expiresAt
            ? "expired"
            : c.usageLimit != null && c.usedCount >= c.usageLimit
              ? "exhausted"
              : "active",
      })),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/promo-codes", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.code) {
      sendValidationError(res, "code required");
      return;
    }
    try {
      const [code] = await db
        .insert(promoCodesTable)
        .values({
          id: generateId(),
          code: String(body.code).toUpperCase().trim(),
          description: body.description ? String(body.description) : null,
          discountPct: body.discountPct ? String(body.discountPct) : null,
          discountFlat: body.discountFlat ? String(body.discountFlat) : null,
          minOrderAmount: body.minOrderAmount ? String(body.minOrderAmount) : "0",
          maxDiscount: body.maxDiscount ? String(body.maxDiscount) : null,
          usageLimit: body.usageLimit ? Number(body.usageLimit) : null,
          appliesTo: body.appliesTo ? String(body.appliesTo) : "all",
          expiresAt: body.expiresAt ? new Date(body.expiresAt as string) : null,
          isActive: body.isActive !== false,
        })
        .returning();
      sendCreated(res, code);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "23505") {
        sendError(res, "Promo code already exists", 409);
        return;
      }
      throw e;
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/promo-codes/:id", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: Partial<typeof promoCodesTable.$inferInsert> = {};
    if (body.code !== undefined) updates.code = String(body.code).toUpperCase().trim();
    if (body.description !== undefined) updates.description = body.description as string;
    if (body.discountPct !== undefined)
      updates.discountPct = body.discountPct ? String(body.discountPct) : null;
    if (body.discountFlat !== undefined)
      updates.discountFlat = body.discountFlat ? String(body.discountFlat) : null;
    if (body.minOrderAmount !== undefined) updates.minOrderAmount = String(body.minOrderAmount);
    if (body.maxDiscount !== undefined)
      updates.maxDiscount = body.maxDiscount ? String(body.maxDiscount) : null;
    if (body.usageLimit !== undefined)
      updates.usageLimit = body.usageLimit ? Number(body.usageLimit) : null;
    if (body.appliesTo !== undefined) updates.appliesTo = body.appliesTo as string;
    if (body.expiresAt !== undefined)
      updates.expiresAt = body.expiresAt ? new Date(body.expiresAt as string) : null;
    if (body.isActive !== undefined) updates.isActive = body.isActive as boolean;
    const [code] = await db
      .update(promoCodesTable)
      .set(updates)
      .where(eq(promoCodesTable.id, req.params["id"] as string))
      .returning();
    if (!code) {
      sendNotFound(res, "Promo code not found");
      return;
    }
    sendSuccess(res, code);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/promo-codes/:id", async (req, res) => {
  try {
    await db.delete(promoCodesTable).where(eq(promoCodesTable.id, req.params["id"] as string));
    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ══════════════════════════════════════
   VENDOR MANAGEMENT
══════════════════════════════════════ */

/* ── GET /stock-notifications — recent stock changes for the admin notification bell ──
   Returns last 60 entries from product_stock_history joined with product name.
   Flags low-stock rows (newStock < 5) so the client can highlight them.
───────────────────────────────────────────────────────────────────────────────────── */
router.get("/stock-notifications", adminAuth, async (req, res) => {
  try {
    const LOW_STOCK_THRESHOLD = 5;
    try {
      const rows = await db
        .select({
          id: productStockHistoryTable.id,
          productId: productStockHistoryTable.productId,
          vendorId: productStockHistoryTable.vendorId,
          previousStock: productStockHistoryTable.previousStock,
          newStock: productStockHistoryTable.newStock,
          quantityDelta: productStockHistoryTable.quantityDelta,
          reason: productStockHistoryTable.reason,
          source: productStockHistoryTable.source,
          orderId: productStockHistoryTable.orderId,
          changedAt: productStockHistoryTable.changedAt,
          productName: productsTable.name,
        })
        .from(productStockHistoryTable)
        .leftJoin(productsTable, eq(productStockHistoryTable.productId, productsTable.id))
        .orderBy(desc(productStockHistoryTable.changedAt))
        .limit(60);
      const notifications = rows.map((r) => ({
        ...r,
        isLow: r.newStock != null && r.newStock < LOW_STOCK_THRESHOLD,
        isOutOfStock: r.newStock != null && r.newStock <= 0,
      }));
      sendSuccess(res, { notifications, total: notifications.length });
    } catch (err: unknown) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[stock-notifications] fetch failed"
      );
      sendError(res, "Failed to fetch stock notifications", 500);
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── POST /uploads/admin — base64 image upload for admin panel ── */
router.post("/uploads/admin", async (req, res) => {
  try {
    const { base64, mimeType } = req.body as {
      base64?: string;
      mimeType?: string;
    };
    if (!base64 || !mimeType) {
      sendError(res, "base64 and mimeType are required", 400);
      return;
    }
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(mimeType)) {
      sendError(res, "Only JPEG, PNG, and WebP images are allowed", 400);
      return;
    }
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      sendError(res, "Image must be under 10MB", 400);
      return;
    }
    const key = `admin_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const url = await storageUpload(buffer, key, mimeType);
    sendSuccess(res, { url });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Upload failed", 500);
  }
});

/* ── POST /products/bulk-approve — approve multiple pending products ── */
router.post("/products/bulk-approve", adminAuth, async (req, res) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      sendValidationError(res, "ids must be a non-empty array");
      return;
    }
    const updated = await db
      .update(productsTable)
      .set({ approvalStatus: "approved", inStock: true, updatedAt: new Date() })
      .where(inArray(productsTable.id, ids))
      .returning({ id: productsTable.id });
    sendSuccess(res, { approved: updated.length, ids: updated.map((r) => r.id) });
  } catch (err) {
    logger.error({ err }, "[products/bulk-approve] failed");
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── DELETE /products/bulk — soft-delete multiple products ── */
router.delete("/products/bulk", adminAuth, async (req, res) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      sendValidationError(res, "ids must be a non-empty array");
      return;
    }
    const deleted = await db
      .update(productsTable)
      .set({ deletedAt: new Date() })
      .where(inArray(productsTable.id, ids))
      .returning({ id: productsTable.id });
    sendSuccess(res, { deleted: deleted.length, ids: deleted.map((r) => r.id) });
  } catch (err) {
    logger.error({ err }, "[products/bulk-delete] failed");
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
