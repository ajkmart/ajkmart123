import { db } from "@workspace/db";
import {
  liveLocationsTable,
  notificationsTable,
  pharmacyOrdersTable,
  pharmacyPrescriptionRefsTable,
  productsTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { t, type TranslationKey } from "@workspace/i18n";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { calcCodFee, calcDeliveryFee, calcGst } from "../lib/fees.js";
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
import { addSecurityEvent, customerAuth, riderAuth } from "../middleware/security.js";
import { verifyOwnership } from "../middleware/verifyOwnership.js";
import { getCachedSettings } from "./admin.js";
import { prescriptionRefMap } from "./uploads.js";

const router: IRouter = Router();

/* Resolve an rx-* refId: memory map first (fast path), then DB (survives restarts).
   Returns the resolved URL or null if not found / expired. */
async function resolveRxRefId(refId: string, ownerId?: string | null): Promise<string | null> {
  const inMemory = prescriptionRefMap.get(refId);
  if (inMemory) return inMemory;

  const now = new Date();
  const baseCondition = and(
    eq(pharmacyPrescriptionRefsTable.refId, refId),
    sql`${pharmacyPrescriptionRefsTable.expiresAt} > ${now}`
  );
  const whereClause = ownerId
    ? and(baseCondition, eq(pharmacyPrescriptionRefsTable.userId, ownerId))
    : baseCondition;

  const [row] = await db
    .select({ photoUrl: pharmacyPrescriptionRefsTable.photoUrl })
    .from(pharmacyPrescriptionRefsTable)
    .where(whereClause)
    .limit(1);

  if (row) {
    prescriptionRefMap.set(refId, row.photoUrl);
    return row.photoUrl;
  }
  return null;
}

function _mapOrderSync(
  o: typeof pharmacyOrdersTable.$inferSelect,
  resolvedPhotoOverride?: string | null
) {
  let noteText = o.prescriptionNote ?? null;
  let prescriptionPhotoUrl: string | null = resolvedPhotoOverride ?? o.prescriptionPhotoUrl ?? null;
  if (!prescriptionPhotoUrl && noteText) {
    const photoMatch = noteText.match(/\[photo:\s*([^\]]+)\]/);
    if (photoMatch) {
      const raw = photoMatch[1]!.trim();
      if (!raw.startsWith("rx-")) {
        prescriptionPhotoUrl = raw;
      }
      noteText = noteText.replace(/\n?\[photo:\s*[^\]]+\]/, "").trim() || null;
    }
  }
  return {
    id: o.id,
    userId: o.userId,
    riderId: o.riderId,
    items: o.items as object[],
    prescriptionNote: noteText,
    prescriptionPhotoUrl,
    deliveryAddress: o.deliveryAddress,
    contactPhone: o.contactPhone,
    total: parseFloat(o.total),
    paymentMethod: o.paymentMethod,
    status: o.status,
    estimatedTime: o.estimatedTime,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

async function mapOrder(
  o: typeof pharmacyOrdersTable.$inferSelect,
  resolvedPhotoOverride?: string | null
) {
  let noteText = o.prescriptionNote ?? null;
  let prescriptionPhotoUrl: string | null = resolvedPhotoOverride ?? o.prescriptionPhotoUrl ?? null;
  if (!prescriptionPhotoUrl && noteText) {
    const photoMatch = noteText.match(/\[photo:\s*([^\]]+)\]/);
    if (photoMatch) {
      const raw = photoMatch[1]!.trim();
      if (raw.startsWith("rx-")) {
        prescriptionPhotoUrl = await resolveRxRefId(raw, o.userId);
      } else {
        prescriptionPhotoUrl = raw;
      }
      noteText = noteText.replace(/\n?\[photo:\s*[^\]]+\]/, "").trim() || null;
    }
  }
  return {
    id: o.id,
    userId: o.userId,
    riderId: o.riderId,
    items: o.items as object[],
    prescriptionNote: noteText,
    prescriptionPhotoUrl,
    deliveryAddress: o.deliveryAddress,
    contactPhone: o.contactPhone,
    total: parseFloat(o.total),
    paymentMethod: o.paymentMethod,
    status: o.status,
    estimatedTime: o.estimatedTime,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

router.get("/", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  const orders = await db
    .select()
    .from(pharmacyOrdersTable)
    .where(eq(pharmacyOrdersTable.userId, userId))
    .orderBy(sql`${pharmacyOrdersTable.createdAt} DESC`);
  const mapped = await Promise.all(orders.map((o) => mapOrder(o)));
  sendSuccess(res, { orders: mapped, total: orders.length });
});

router.get("/:id", customerAuth, verifyOwnership("pharmacy_order"), async (req, res) => {
  const _userId = req.customerId!;
  const [order] = await db
    .select()
    .from(pharmacyOrdersTable)
    .where(eq(pharmacyOrdersTable.id, String(req.params["id"] as string)))
    .limit(1);
  if (!order) {
    sendNotFound(res, "Pharmacy order not found");
    return;
  }
  /* Ownership already enforced by verifyOwnership("pharmacy_order") middleware */

  sendSuccess(res, await mapOrder(order));
});

/* ── GET /pharmacy-orders/:id/track — Live rider location for active pharmacy orders ── */
router.get("/:id/track", customerAuth, verifyOwnership("pharmacy_order"), async (req, res) => {
  const _userId = req.customerId!;
  const [order] = await db
    .select({
      id: pharmacyOrdersTable.id,
      userId: pharmacyOrdersTable.userId,
      riderId: pharmacyOrdersTable.riderId,
      status: pharmacyOrdersTable.status,
    })
    .from(pharmacyOrdersTable)
    .where(eq(pharmacyOrdersTable.id, String(req.params["id"] as string)))
    .limit(1);

  if (!order) {
    sendNotFound(res, "Pharmacy order not found");
    return;
  }
  /* Ownership already enforced by verifyOwnership("pharmacy_order") middleware */

  const TRACKABLE = ["picked_up", "out_for_delivery", "in_transit"];
  let riderLat: number | null = null;
  let riderLng: number | null = null;
  let riderLocAge: number | null = null;
  let riderName: string | null = null;
  let riderPhone: string | null = null;

  if (order.riderId && TRACKABLE.includes(order.status)) {
    const [loc, riderUser] = await Promise.all([
      db
        .select()
        .from(liveLocationsTable)
        .where(eq(liveLocationsTable.userId, order.riderId))
        .limit(1),
      db
        .select({ name: usersTable.name, phone: usersTable.phone })
        .from(usersTable)
        .where(eq(usersTable.id, order.riderId))
        .limit(1),
    ]);
    if (loc[0]) {
      riderLat = parseFloat(String(loc[0].latitude));
      riderLng = parseFloat(String(loc[0].longitude));
      riderLocAge = Math.floor((Date.now() - new Date(loc[0].updatedAt).getTime()) / 1000);
    }
    riderName = riderUser[0]?.name ?? null;
    riderPhone = riderUser[0]?.phone ?? null;
  }

  sendSuccess(res, {
    id: order.id,
    status: order.status,
    riderId: order.riderId,
    riderName,
    riderPhone,
    riderLat,
    riderLng,
    riderLocAge,
    trackable: TRACKABLE.includes(order.status),
  });
});

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

router.post("/", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  const rawBody = req.body;
  const items = rawBody.items;
  const prescriptionNote = rawBody.prescriptionNote;
  const prescriptionPhotoUri = rawBody.prescriptionPhotoUri;
  const deliveryAddress =
    typeof rawBody.deliveryAddress === "string"
      ? stripHtml(rawBody.deliveryAddress)
      : rawBody.deliveryAddress;
  const contactPhone = rawBody.contactPhone;
  const paymentMethod = rawBody.paymentMethod;

  let resolvedPhotoUrl: string | null = null;
  if (prescriptionPhotoUri?.trim()) {
    const rawUri = prescriptionPhotoUri.trim();
    if (rawUri.startsWith("rx-")) {
      /* 1. Fast path: in-memory map (set by the upload handler). */
      let resolved = prescriptionRefMap.get(rawUri);
      if (!resolved) {
        /* 2. Retry loop: poll memory map then DB up to 3 times (500ms apart).
              This replaces the previous fixed 1500ms setTimeout and correctly
              handles both in-flight uploads and DB-persisted refs. */
        const MAX_RESOLVE_ATTEMPTS = 3;
        const RESOLVE_RETRY_MS = 500;
        for (let attempt = 1; attempt <= MAX_RESOLVE_ATTEMPTS; attempt++) {
          await new Promise((r) => setTimeout(r, RESOLVE_RETRY_MS));
          resolved = prescriptionRefMap.get(rawUri);
          if (resolved) break;
          /* 3. Durable path: query DB (survives process restarts / pod restarts).
                resolveRxRefId checks owner + expiry and returns null if not found. */
          const dbResolved = await resolveRxRefId(rawUri, userId);
          if (dbResolved) {
            resolved = dbResolved;
            break;
          }
          logger.warn(
            { refId: rawUri, attempt, userId },
            "[pharmacy] prescription ref not yet resolved — retrying"
          );
        }
      }
      if (!resolved) {
        /* 4. Ref not found in memory or DB after all retries — reject the request
              with a clear error so a raw rx-* placeholder never reaches the orders table. */
        logger.warn(
          { refId: rawUri, userId },
          "[pharmacy] prescription ref resolution exhausted — rejecting order"
        );
        sendValidationError(
          res,
          "Prescription photo reference expired or not found. Please re-upload your prescription and try again."
        );
        return;
      }
      resolvedPhotoUrl = resolved;
    } else {
      resolvedPhotoUrl = rawUri;
    }
  }

  const mergedPrescriptionNote = prescriptionNote?.trim() || null;
  if (!items || !deliveryAddress || !contactPhone || !paymentMethod) {
    sendValidationError(res, "Missing required fields");
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    sendValidationError(res, "items must be a non-empty array");
    return;
  }

  /* Validate contactPhone format — must be a valid Pakistani mobile number */
  const canonPhone = (function () {
    const raw = String(contactPhone ?? "").replace(/[\s\-()]/g, "");
    const e164 = raw.match(/^\+?92(3\d{9})$/);
    if (e164) return e164[1]!;
    const local = raw.match(/^0(3\d{9})$/);
    if (local) return local[1]!;
    const bare = raw.match(/^(3\d{9})$/);
    if (bare) return bare[1]!;
    return raw;
  })();
  if (!/^3\d{9}$/.test(canonPhone)) {
    sendValidationError(
      res,
      "Invalid contactPhone: must be a valid Pakistani mobile number (e.g. 03001234567)"
    );
    return;
  }

  const s = await getCachedSettings();

  if ((s["app_status"] ?? "active") === "maintenance") {
    const mainKey = (s["security_maintenance_key"] ?? "").trim();
    const bypass = ((req.headers["x-maintenance-key"] as string) ?? "").trim();
    if (!mainKey || bypass !== mainKey) {
      sendError(
        res,
        s["content_maintenance_msg"] ?? "We're performing scheduled maintenance. Back soon!",
        503
      );
      return;
    }
  }

  const pharmacyEnabled = (s["feature_pharmacy"] ?? "on") === "on";
  if (!pharmacyEnabled) {
    sendError(res, "Pharmacy service is currently disabled", 503);
    return;
  }

  /* ── Fraud detection (mirrors orders.ts pattern) ── */
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  {
    const [userRecord] = await db
      .select({ isBanned: usersTable.isBanned, isActive: usersTable.isActive })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (userRecord?.isBanned) {
      sendForbidden(res, "Your account has been suspended.");
      return;
    }
    if (userRecord && !userRecord.isActive) {
      sendForbidden(res, "Your account is inactive. Please contact support.");
      return;
    }

    if ((s["security_fake_order_detect"] ?? "off") === "on") {
      const maxDailyOrders = parseInt(s["security_max_daily_orders"] ?? "20", 10);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [dailyResult] = await db
        .select({ c: count() })
        .from(pharmacyOrdersTable)
        .where(
          and(
            eq(pharmacyOrdersTable.userId, userId),
            gte(pharmacyOrdersTable.createdAt, todayStart)
          )
        );
      const dailyCount = Number(dailyResult?.c ?? 0);
      if (dailyCount >= maxDailyOrders) {
        addSecurityEvent({
          type: "daily_order_limit",
          ip,
          userId,
          details: `User ${userId} hit daily pharmacy limit: ${dailyCount}/${maxDailyOrders}`,
          severity: "medium",
        });
        sendError(
          res,
          `Daily pharmacy order limit (${maxDailyOrders}) reached. Please try again tomorrow.`,
          429
        );
        return;
      }

      if (deliveryAddress) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const sameAddrLimit = parseInt(s["security_same_addr_limit"] ?? "5", 10);
        const sameAddrOrders = await db
          .select({ c: count() })
          .from(pharmacyOrdersTable)
          .where(
            and(
              eq(pharmacyOrdersTable.deliveryAddress, deliveryAddress),
              gte(pharmacyOrdersTable.createdAt, oneHourAgo)
            )
          );
        const sameAddrCount = Number(sameAddrOrders[0]?.c ?? 0);
        if (sameAddrCount >= sameAddrLimit) {
          addSecurityEvent({
            type: "same_address_limit",
            ip,
            userId,
            details: `Pharmacy same-address limit: ${deliveryAddress} (${sameAddrCount}/hr)`,
            severity: "high",
          });
          sendError(res, "Too many pharmacy orders to this address. Please try again later.", 429);
          return;
        }
      }
    }
  }

  /* Per-item validation — prevents negative-price injection */
  type PharmacyItem = Record<string, unknown>;
  const badItem = (items as PharmacyItem[]).find(
    (it) =>
      !Number.isFinite(Number(it.price)) ||
      Number(it.price) <= 0 ||
      !Number.isFinite(Number(it.quantity)) ||
      Number(it.quantity) <= 0
  );
  if (badItem) {
    sendValidationError(res, "Each item must have a valid positive price and quantity");
    return;
  }

  /* ── Prescription (Rx) enforcement ──
     Server-authoritative check: look up product IDs in the DB to determine Rx requirement.
     If a product is not found in DB, fall back to platform setting:
     - If pharmacy_always_require_rx = "on": require Rx for ALL pharmacy orders
     - Otherwise: treat unknown items as not requiring Rx (safe default for items without IDs) ── */
  const alwaysRx = (s["pharmacy_always_require_rx"] ?? "off") === "on";
  let hasRxItem = alwaysRx;

  if (!hasRxItem) {
    const itemIds = (items as PharmacyItem[])
      .map((it) => String(it.id))
      .filter(Boolean) as string[];
    if (itemIds.length > 0) {
      try {
        const dbProducts = await db
          .select({
            id: productsTable.id,
            name: productsTable.name,
            category: productsTable.category,
          })
          .from(productsTable)
          .where(inArray(productsTable.id, itemIds));
        const RX_KEYWORDS =
          /\b(antibiotic|amoxicillin|azithromycin|ciprofloxacin|metformin|insulin|steroid|cortisone|opioid|codeine|tramadol|diazepam|alprazolam|morphine|fentanyl|prescription|rx only)\b/i;
        hasRxItem = dbProducts.some(
          (p) => RX_KEYWORDS.test(p.name ?? "") || p.category === "prescription"
        );
        if (!hasRxItem) {
          const unlistedRx = (items as PharmacyItem[]).some(
            (it) => it.requires_prescription || it.requiresPrescription
          );
          hasRxItem = unlistedRx;
        }
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[route] non-fatal: fall back to client flag on DB error`
        );
      }
    }
    if (!hasRxItem) {
      hasRxItem = (items as PharmacyItem[]).some(
        (it) => it.requires_prescription || it.requiresPrescription
      );
    }
  }

  if (hasRxItem && !mergedPrescriptionNote) {
    sendErrorWithData(
      res,
      "One or more items in your order require a doctor's prescription. Please add a prescription note or upload a photo.",
      { requiresPrescription: true },
      400
    );
    return;
  }

  const itemsTotal = (items as { price: number; quantity: number }[]).reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  if (itemsTotal <= 0) {
    sendValidationError(res, "Order total must be greater than 0");
    return;
  }

  /* ── Min order check ── */
  const minOrder = parseFloat(s["min_order_amount"] ?? "100");
  if (itemsTotal < minOrder) {
    sendValidationError(res, `Minimum order amount is Rs. ${minOrder}`);
    return;
  }

  /* ── Delivery fee, GST, COD fee — via shared utility (see lib/fees.ts) ── */
  const deliveryFee = calcDeliveryFee(s, "pharmacy", itemsTotal);
  const gstAmount = calcGst(s, itemsTotal);
  const codFee = calcCodFee(s, paymentMethod, itemsTotal + deliveryFee + gstAmount);

  const total = itemsTotal + deliveryFee + gstAmount + codFee;

  /* ── Estimated time from admin Order settings ── */
  const preptimeMin = parseInt(s["order_preptime_min"] ?? "15", 10);
  const estimatedTime = `${preptimeMin}–${preptimeMin + 25} min`;

  /* ── COD validation (mirrors orders.ts pattern) ── */
  if (paymentMethod === "cash") {
    const codEnabled = (s["cod_enabled"] ?? "on") === "on";
    if (!codEnabled) {
      sendValidationError(res, "Cash on Delivery is currently not available");
      return;
    }
    const codAllowedForPharmacy = (s["cod_allowed_pharmacy"] ?? "on") !== "off";
    if (!codAllowedForPharmacy) {
      sendValidationError(
        res,
        "Cash on Delivery is not available for Pharmacy orders. Please choose another payment method."
      );
      return;
    }
    const codMax = parseFloat(s["cod_max_amount"] ?? "5000");
    if (total > codMax) {
      sendValidationError(
        res,
        `Maximum Cash on Delivery order is Rs. ${codMax}. Please pay online for larger orders.`
      );
      return;
    }
    /* ── COD verification threshold — flag high-value cash orders ── */
    const verifyThreshold = parseFloat(s["cod_verification_threshold"] ?? "0");
    if (verifyThreshold > 0 && total > verifyThreshold) {
      /* Order is allowed but flagged for rider photo verification */
    }
  }

  if (paymentMethod === "wallet") {
    const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
    if (!walletEnabled) {
      sendValidationError(res, "Wallet payments are currently disabled");
      return;
    }

    const [wUser] = await db
      .select({ blockedServices: usersTable.blockedServices })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (
      wUser &&
      (wUser.blockedServices || "")
        .split(",")
        .map((sv) => sv.trim())
        .includes("wallet")
    ) {
      sendForbidden(
        res,
        "wallet_frozen",
        "Your wallet has been temporarily frozen. Contact support."
      );
      return;
    }

    try {
      const order = await db.transaction(async (tx) => {
        const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        if (!user) throw new Error("User not found");

        const balance = parseFloat(user.walletBalance ?? "0");
        if (balance < total)
          throw new Error(
            `Insufficient wallet balance. Balance: Rs. ${balance.toFixed(0)}, Required: Rs. ${total.toFixed(0)}`
          );

        /* DB floor guard — deducts only if balance ≥ amount at UPDATE time */
        const [deducted] = await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance - ${total.toFixed(2)}` })
          .where(and(eq(usersTable.id, userId), gte(usersTable.walletBalance, total.toFixed(2))))
          .returning({ id: usersTable.id });
        if (!deducted)
          throw new Error(`Insufficient wallet balance. Required: Rs. ${total.toFixed(0)}`);
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "debit",
          amount: total.toFixed(2),
          description: "Pharmacy order payment (items + delivery + GST)",
        });

        const [newOrder] = await tx
          .insert(pharmacyOrdersTable)
          .values({
            id: generateId(),
            userId,
            items,
            prescriptionNote: mergedPrescriptionNote,
            prescriptionPhotoUrl: resolvedPhotoUrl ?? null,
            deliveryAddress,
            contactPhone,
            total: total.toFixed(2),
            paymentMethod,
            status: "pending",
            estimatedTime,
          })
          .returning();
        return newOrder!;
      });

      const phLang1 = await getUserLanguage(userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId,
          title: t("notifPharmacyOrderPlaced" as TranslationKey, phLang1),
          body: t("notifPharmacyOrderPlacedBody" as TranslationKey, phLang1)
            .replace("{amount}", `${total.toFixed(0)} (items + Rs. ${deliveryFee} delivery)`)
            .replace("{eta}", estimatedTime),
          type: "pharmacy",
          icon: "medical-outline",
          link: `/(tabs)/orders`,
        })
        .catch((e: Error) =>
          logger.warn(
            { userId, err: e.message },
            "[pharmacy/order] wallet-order notification insert failed"
          )
        );

      sendCreated(res, { ...(await mapOrder(order)), deliveryFee, gstAmount });
    } catch (e: unknown) {
      const errMsg = (e as Error).message ?? "";
      logger.error({ err: e, userId }, "[pharmacy/order] wallet payment transaction failed");
      if (errMsg.includes("Insufficient wallet balance")) {
        sendValidationError(res, errMsg);
        return;
      }
      sendError(
        res,
        "An internal error occurred while processing your order. Please try again.",
        500
      );
    }
    return;
  }

  const [order] = await db
    .insert(pharmacyOrdersTable)
    .values({
      id: generateId(),
      userId,
      items,
      prescriptionNote: mergedPrescriptionNote,
      prescriptionPhotoUrl: resolvedPhotoUrl ?? null,
      deliveryAddress,
      contactPhone,
      total: total.toFixed(2),
      paymentMethod,
      status: "pending",
      estimatedTime,
    })
    .returning();

  const phLang2 = await getUserLanguage(userId);
  await db
    .insert(notificationsTable)
    .values({
      id: generateId(),
      userId,
      title: t("notifPharmacyOrderPlaced" as TranslationKey, phLang2),
      body: t("notifPharmacyOrderPlacedBody" as TranslationKey, phLang2)
        .replace("{amount}", `${total.toFixed(0)} (items + Rs. ${deliveryFee} delivery)`)
        .replace("{eta}", estimatedTime),
      type: "pharmacy",
      icon: "medical-outline",
      link: `/(tabs)/orders`,
    })
    .catch((e: Error) =>
      logger.warn(
        { userId, err: e.message },
        "[pharmacy/order] cash-order notification insert failed"
      )
    );

  sendCreated(res, { ...(await mapOrder(order!)), deliveryFee, gstAmount });
});

router.patch("/:id/cancel", customerAuth, verifyOwnership("pharmacy_order"), async (req, res) => {
  const userId = req.customerId!;
  const orderId = String(req.params["id"] as string);

  const [order] = await db
    .select()
    .from(pharmacyOrdersTable)
    .where(eq(pharmacyOrdersTable.id, orderId))
    .limit(1);

  if (!order) {
    sendNotFound(res, "Pharmacy order not found");
    return;
  }
  /* Ownership already enforced by verifyOwnership("pharmacy_order") middleware */
  if (order.status !== "pending") {
    sendError(res, "Only pending pharmacy orders can be cancelled", 409);
    return;
  }

  const s = await getCachedSettings();
  const cancelWindowMin = parseFloat(String(s["order_cancel_window_min"] ?? "5"));
  const minutesSincePlaced = (Date.now() - order.createdAt.getTime()) / 60000;
  if (minutesSincePlaced > cancelWindowMin) {
    sendError(res, `Cancellation window of ${cancelWindowMin} minutes has passed`, 409);
    return;
  }

  let refundAmount = 0;
  let cancelledOrder: typeof pharmacyOrdersTable.$inferSelect | undefined;

  if (order.paymentMethod === "wallet") {
    const refund = parseFloat(order.total);
    cancelledOrder = await db
      .transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(pharmacyOrdersTable)
          .where(eq(pharmacyOrdersTable.id, orderId))
          .for("update")
          .limit(1);
        if (!locked || locked.status !== "pending") {
          throw Object.assign(new Error("Order already processed or cancelled"), {
            httpStatus: 409,
          });
        }
        const [updated] = await tx
          .update(pharmacyOrdersTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(eq(pharmacyOrdersTable.id, orderId), eq(pharmacyOrdersTable.status, "pending"))
          )
          .returning();
        if (!updated)
          throw Object.assign(new Error("Concurrent cancel — order state changed"), {
            httpStatus: 409,
          });
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${refund.toFixed(2)}`, updatedAt: new Date() })
          .where(eq(usersTable.id, userId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "credit",
          amount: refund.toFixed(2),
          description: `Pharmacy order refund — #${orderId.slice(-6).toUpperCase()} cancelled`,
          reference: `refund:${orderId}`,
        });
        return updated;
      })
      .catch((err: unknown) => {
        const httpStatus = (err as { httpStatus?: number })?.httpStatus;
        logger.error({ err }, "[pharmacy/cancel] error during cancellation transaction");
        if (httpStatus) {
          sendError(res, "Order cannot be cancelled at this time", httpStatus);
        } else {
          sendError(res, "An internal error occurred", 500);
        }
        return undefined;
      });
    if (!cancelledOrder) return;
    const phRefLang = await getUserLanguage(userId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId,
        title: t("notifPharmacyRefund" as TranslationKey, phRefLang),
        body: t("notifPharmacyRefundBody" as TranslationKey, phRefLang).replace(
          "{amount}",
          refund.toFixed(0)
        ),
        type: "pharmacy",
        icon: "wallet-outline",
      })
      .catch((e: Error) =>
        logger.warn(
          { userId, orderId, err: e.message },
          "[pharmacy/cancel] refund notification insert failed"
        )
      );
    refundAmount = refund;
    sendSuccess(res, { ...(await mapOrder(cancelledOrder)), refundAmount });
    return;
  }

  const [cancelled] = await db
    .update(pharmacyOrdersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(pharmacyOrdersTable.id, orderId), eq(pharmacyOrdersTable.status, "pending")))
    .returning();

  if (!cancelled) {
    sendError(res, "Order already processed or cancelled", 409);
    return;
  }
  sendSuccess(res, { ...(await mapOrder(cancelled)), refundAmount });
});

router.patch("/:id/status", riderAuth, async (req, res) => {
  const { status } = req.body;

  /* Whitelist: prevent arbitrary string injection into the status column */
  const ALLOWED_STATUSES = [
    "accepted",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ] as const;
  if (!ALLOWED_STATUSES.includes(status)) {
    sendValidationError(res, `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}`);
    return;
  }

  const [existing] = await db
    .select()
    .from(pharmacyOrdersTable)
    .where(eq(pharmacyOrdersTable.id, String(req.params["id"] as string)))
    .limit(1);
  if (!existing) {
    sendNotFound(res, "Pharmacy order not found");
    return;
  }

  const PHARMACY_STATUS_ORDER: Record<string, string[]> = {
    pending: ["accepted", "cancelled"],
    accepted: ["picked_up", "cancelled"],
    picked_up: ["in_transit", "out_for_delivery", "cancelled"],
    in_transit: ["out_for_delivery", "delivered", "cancelled"],
    out_for_delivery: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  };
  const allowedNext = PHARMACY_STATUS_ORDER[existing.status] ?? [];
  if (!allowedNext.includes(status)) {
    sendValidationError(res, `Cannot transition from '${existing.status}' to '${status}'`);
    return;
  }
  if (existing.riderId && existing.riderId !== req.riderId) {
    sendForbidden(res, "This order is assigned to another rider");
    return;
  }

  const riderId = req.riderId!;
  const isUnassigned = !existing.riderId;

  if (isUnassigned) {
    const [order] = await db
      .update(pharmacyOrdersTable)
      .set({ status, riderId, updatedAt: new Date() })
      .where(
        and(eq(pharmacyOrdersTable.id, String(req.params["id"] as string)), sql`rider_id IS NULL`)
      )
      .returning();
    if (!order) {
      sendError(res, "This order has already been accepted by another rider", 409);
      return;
    }
    sendSuccess(res, await mapOrder(order));
    return;
  }

  const [order] = await db
    .update(pharmacyOrdersTable)
    .set({ status, riderId, updatedAt: new Date() })
    .where(eq(pharmacyOrdersTable.id, String(req.params["id"] as string)))
    .returning();
  if (!order) {
    sendNotFound(res, "Pharmacy order not found");
    return;
  }
  sendSuccess(res, await mapOrder(order));
});

export default router;
