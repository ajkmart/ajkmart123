import { db } from "@workspace/db";
import {
  notificationsTable,
  ordersTable,
  parcelBookingsTable,
  pharmacyOrdersTable,
  platformSettingsTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import {
  ORDER_VALID_STATUSES,
  PARCEL_VALID_STATUSES,
  PHARMACY_ORDER_VALID_STATUSES,
  getSocketRoom,
} from "@workspace/service-constants";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { buildCursorPage, decodeCursor } from "../../lib/pagination/cursor.js";
import {
  sendCreated,
  sendError,
  sendErrorWithData,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../lib/response.js";
import { getIO } from "../../lib/socketio.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { validateBody } from "../../middleware/validate.js";
import {
  ORDER_NOTIF_KEYS,
  PARCEL_NOTIF_KEYS,
  PHARMACY_NOTIF_KEYS,
  addAuditEntry,
  adminAuth,
  generateId,
  getCachedSettings,
  getClientIp,
  getUserLanguage,
  logger,
  sendUserNotification,
  t,
  type AdminRequest,
} from "../admin-shared.js";

const router = Router();

/* ── Auth guard: all routes in this router require a valid admin token ── */
router.use(adminAuth);

function wrapAsync(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => void fn(req, res).catch(next);
}

router.post("/orders", requirePermission("orders.create"), async (req, res) => {
  const { userId, vendorId, type, items, total, deliveryAddress, paymentMethod, status } = req.body;
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    sendValidationError(res, "userId is required");
    return;
  }
  const numTotal = Number(total);
  if (!numTotal || numTotal <= 0) {
    sendValidationError(res, "total must be a positive number");
    return;
  }
  const validTypes = ["mart", "food"];
  const orderType = validTypes.includes(type) ? type : "mart";
  const validPayments = ["cod", "wallet", "jazzcash", "easypaisa"];
  const payment = validPayments.includes(paymentMethod) ? paymentMethod : "cod";
  const validStatuses = [
    "pending",
    "confirmed",
    "preparing",
    "picked_up",
    "delivered",
    "cancelled",
  ];
  const orderStatus = validStatuses.includes(status) ? status : "pending";
  try {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId.trim()));
    if (!user) {
      sendValidationError(res, "User not found with the given userId");
      return;
    }
    const [order] = await db
      .insert(ordersTable)
      .values({
        id: generateId(),
        userId: userId.trim(),
        vendorId: (vendorId || userId).trim(),
        type: orderType,
        items: items
          ? typeof items === "string"
            ? items
            : JSON.stringify(items)
          : JSON.stringify([{ name: "Custom item", qty: 1, price: numTotal.toString() }]),
        total: numTotal.toString(),
        deliveryAddress: (deliveryAddress || "Admin-created order").trim(),
        paymentMethod: payment,
        status: orderStatus,
        paymentStatus: "pending",
        estimatedTime: "30-45 min",
      })
      .returning();
    sendSuccess(res, { order });
  } catch (e: unknown) {
    logger.error({ err: e }, "[admin/orders] create order failed");
    sendError(res, "An internal error occurred", 500);
  }
});

router.get(
  "/orders",
  requirePermission("orders.view"),
  wrapAsync(async (req, res) => {
    const { status, type } = req.query;
    const settings = await getCachedSettings();
    const isDemoMode = (settings["platform_mode"] ?? "demo") === "demo";

    if (isDemoMode) {
      const { getDemoSnapshot } = await import("../../lib/demo-snapshot.js");
      const snap = await getDemoSnapshot();
      const filtered = snap.orders
        .filter((o) => !status || o.status === status)
        .filter((o) => !type || o.type === type);
      sendSuccess(res, { orders: filtered, total: filtered.length, isDemo: true });
      return;
    }

    /* Cursor-paginated list — default 50, hard cap 200.
     ?after=<cursor>  — opaque base64url cursor from a previous response
     ?limit=<n>       — page size (1-200, default 50) */
    const rawLimit = parseInt(String(req.query["limit"] ?? "50"), 10);
    const pageLimit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 200);

    const cursorVal = decodeCursor(String(req.query["after"] ?? ""));
    let cursorDate: Date | null = null;
    if (cursorVal) {
      const ts = new Date(cursorVal);
      if (!isNaN(ts.getTime())) cursorDate = ts;
    }

    const whereClause = and(
      isNull(ordersTable.deletedAt),
      status ? sql`${ordersTable.status} = ${status}` : undefined,
      type ? sql`${ordersTable.type} = ${type}` : undefined,
      cursorDate ? sql`${ordersTable.createdAt} < ${cursorDate}` : undefined
    );

    const rows = await db
      .select()
      .from(ordersTable)
      .where(whereClause)
      .orderBy(desc(ordersTable.createdAt))
      .limit(pageLimit + 1);

    type OrderRow = (typeof rows)[number];
    const cursorPageResult = buildCursorPage<OrderRow>({
      data: rows,
      limit: pageLimit,
      getCursorValue: (o: OrderRow) =>
        (o.createdAt instanceof Date ? o.createdAt : new Date(String(o.createdAt))).toISOString(),
    });

    sendSuccess(res, {
      orders: cursorPageResult.data.map((o: OrderRow) => ({
        ...o,
        total: parseFloat(String(o.total)),
        createdAt: (o.createdAt instanceof Date
          ? o.createdAt
          : new Date(String(o.createdAt))
        ).toISOString(),
        updatedAt: (o.updatedAt instanceof Date
          ? o.updatedAt
          : new Date(String(o.updatedAt))
        ).toISOString(),
      })),
      total: cursorPageResult.data.length,
      nextCursor: cursorPageResult.nextCursor,
      hasMore: cursorPageResult.hasMore,
      isDemo: false,
    });
  })
);

router.patch(
  "/orders/:id/status",
  requirePermission("orders.edit"),
  wrapAsync(async (req, res) => {
    const { status } = req.body;
    const orderId = req.params["id"] as string;

    if (!status || !(ORDER_VALID_STATUSES as readonly string[]).includes(status)) {
      sendValidationError(
        res,
        `Invalid order status "${status}". Valid statuses: ${ORDER_VALID_STATUSES.join(", ")}`
      );
      return;
    }

    /* For wallet-paid → cancelled: do status update + wallet refund in ONE transaction */
    const [preOrder] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.deletedAt)))
      .limit(1);
    if (!preOrder) {
      sendNotFound(res, "Order not found");
      return;
    }

    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["preparing", "cancelled"],
      preparing: ["ready", "out_for_delivery", "picked_up", "cancelled"],
      ready: ["picked_up", "out_for_delivery", "delivered", "cancelled"],
      picked_up: ["out_for_delivery", "delivered", "cancelled"],
      out_for_delivery: ["delivered", "cancelled"],
      delivered: [],
      cancelled: [],
      completed: [],
    };

    const allowed = ALLOWED_TRANSITIONS[preOrder.status] || [];
    if (!allowed.includes(status)) {
      sendValidationError(
        res,
        `Cannot transition from "${preOrder.status}" to "${status}". Allowed next statuses: ${allowed.length ? allowed.join(", ") : "none (terminal state)"}`
      );
      return;
    }

    let order = preOrder;

    if (status === "cancelled" && preOrder.paymentMethod === "wallet" && !preOrder.refundedAt) {
      const refundAmt = parseFloat(String(preOrder.total));
      const now = new Date();
      /* Atomic: status update + wallet credit + refund stamp in one transaction.
       Guard: WHERE refunded_at IS NULL prevents double-credit under concurrency.
       If the conditional update returns 0 rows, we throw to roll back the transaction. */
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
            .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.refundedAt)))
            .returning();
          if (result.length === 0) {
            /* Already refunded (concurrent request won) — throw to roll back entire tx */
            throw new Error("ALREADY_REFUNDED");
          }
          await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: now })
            .where(eq(usersTable.id, preOrder.userId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: preOrder.userId,
            type: "credit",
            amount: refundAmt.toFixed(2),
            description: `Refund — Order #${orderId.slice(-6).toUpperCase()} cancelled by admin`,
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
      order = txResult;
      /* Refund + cancellation consolidated into ONE notification after successful commit
       (avoids sending two separate push notifications for the same event) */
      await sendUserNotification(
        preOrder.userId,
        "Order Cancelled & Refunded 💰",
        `Order #${orderId.slice(-6).toUpperCase()} cancel ho gaya. Rs. ${refundAmt.toFixed(0)} aapki wallet mein wapas aa gaya.`,
        "mart",
        "wallet-outline"
      );
      /* Skip the generic "cancelled" status notification below */
      const io = getIO();
      if (io) {
        const payload = {
          id: orderId,
          status: "cancelled",
          updatedAt:
            order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
        };
        io.to(getSocketRoom(orderId, order.type ?? "mart")).emit("order:update", payload);
        io.to(`user:${preOrder.userId}`).emit("order:update", payload);
      }
      void addAuditEntry({
        action: "order_status_cancelled_refunded",
        adminId: (req as AdminRequest).adminId,
        ip: getClientIp(req),
        details: `Order #${orderId.slice(-6).toUpperCase()} cancelled + wallet refund Rs.${parseFloat(String(preOrder.total)).toFixed(0)} issued`,
        result: "success",
      });
      sendSuccess(res, order);
      return;
    } else {
      const [updated] = await db
        .update(ordersTable)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(ordersTable.id, orderId), ne(ordersTable.status, status)))
        .returning();
      if (!updated) {
        sendError(res, "Order status has already been updated", 409);
        return;
      }
      order = updated;
    }

    const notifKeys = ORDER_NOTIF_KEYS[status];
    if (notifKeys) {
      const orderUserLang = await getUserLanguage(order.userId);
      await sendUserNotification(
        order.userId,
        t(notifKeys.titleKey, orderUserLang),
        t(notifKeys.bodyKey, orderUserLang),
        "mart",
        notifKeys.icon
      );
    }

    // NOTE: Wallet is already debited when order is PLACED (orders.ts).
    // Do NOT deduct again here. Only credit the rider's share on delivery.

    if (status === "delivered") {
      const total = parseFloat(String(order.total));
      const riderKeepPct = (Number((await getCachedSettings())["rider_keep_pct"]) || 80) / 100;
      const riderEarning = parseFloat((total * riderKeepPct).toFixed(2));
      if (order.riderId) {
        await db.transaction(async (tx) => {
          await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${riderEarning}`, updatedAt: new Date() })
            .where(eq(usersTable.id, order.riderId!));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: order.riderId!,
            type: "credit",
            amount: String(riderEarning),
            description: `Delivery earnings — Order #${order.id.slice(-6).toUpperCase()} (${Math.round(riderKeepPct * 100)}%)`,
          });
        });
      }
    }

    const io = getIO();
    if (io) {
      const payload = {
        id: orderId,
        status: order.status,
        updatedAt:
          order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
      };
      io.to(getSocketRoom(orderId, order.type ?? "mart")).emit("order:update", payload);
      io.to(`user:${order.userId}`).emit("order:update", payload);
    }

    /* Audit: record terminal status transitions for compliance trail */
    if (["delivered", "cancelled"].includes(status)) {
      void addAuditEntry({
        action: `order_status_${status}`,
        adminId: (req as AdminRequest).adminId,
        ip: getClientIp(req),
        details: `Order #${orderId.slice(-6).toUpperCase()} marked ${status}`,
        result: "success",
      });
    }

    sendSuccess(res, { ...order, total: parseFloat(String(order.total)) });
  })
);

router.post(
  "/orders/:id/refund",
  requirePermission("orders.edit"),
  wrapAsync(async (req, res) => {
    const { amount, reason } = req.body;
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, req.params["id"] as string), isNull(ordersTable.deletedAt)))
      .limit(1);
    if (!order) {
      sendNotFound(res, "Order not found");
      return;
    }

    /* Only allow refunds for terminal orders */
    if (order.status !== "delivered" && order.status !== "cancelled") {
      sendValidationError(res, "Refund only allowed for delivered or cancelled orders");
      return;
    }

    /* Only wallet-paid orders can be wallet-refunded */
    if (order.paymentMethod !== "wallet") {
      sendValidationError(res, "Refund only applies to wallet-paid orders");
      return;
    }

    /* Fast-path: pre-check before entering transaction */
    if (order.refundedAt) {
      sendErrorWithData(
        res,
        "Order has already been refunded",
        {
          refundedAt: order.refundedAt,
          refundedAmount: order.refundedAmount ? parseFloat(String(order.refundedAmount)) : null,
        },
        409
      );
      return;
    }

    /* Validate refund amount — reject invalid/negative instead of silently defaulting */
    const maxRefund = parseFloat(String(order.total));
    const parsedAmount =
      amount !== undefined && amount != null && amount !== "" ? parseFloat(String(amount)) : NaN;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      sendValidationError(res, "amount must be a positive number");
      return;
    }
    if (parsedAmount > maxRefund) {
      sendValidationError(
        res,
        `Refund amount (${parsedAmount}) cannot exceed order total (${maxRefund})`
      );
      return;
    }
    const refundAmt = parsedAmount;

    const isPartial = refundAmt < maxRefund;
    const resolvedPaymentStatus = isPartial ? "partially_refunded" : "refunded";

    const now = new Date();
    let alreadyRefunded = false;

    await db.transaction(async (tx) => {
      /* Atomic idempotency: only stamp refunded_at if it is still NULL.
       The WHERE clause with IS NULL means only one concurrent request will get rowCount > 0. */
      const updated = await tx
        .update(ordersTable)
        .set({
          refundedAt: now,
          refundedAmount: refundAmt.toFixed(2),
          paymentStatus: resolvedPaymentStatus,
          updatedAt: now,
        })
        .where(and(eq(ordersTable.id, order.id), isNull(ordersTable.refundedAt)))
        .returning({ id: ordersTable.id });

      if (updated.length === 0) {
        /* Another concurrent request beat us to the refund — abort */
        alreadyRefunded = true;
        return;
      }

      /* Credit customer wallet only if we successfully stamped the order */
      await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: now })
        .where(eq(usersTable.id, order.userId));

      await tx.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: order.userId,
        type: "credit",
        amount: refundAmt.toFixed(2),
        description: `Admin refund — Order #${order.id.slice(-6).toUpperCase()}${reason ? `. ${reason}` : ""}`,
      });
    });

    if (alreadyRefunded) {
      sendError(res, "Order has already been refunded", 409);
      return;
    }

    await sendUserNotification(
      order.userId,
      "Order Refund 💰",
      `Rs. ${refundAmt.toFixed(0)} aapki wallet mein refund ho gaya — Order #${order.id.slice(-6).toUpperCase()}`,
      "mart",
      "wallet-outline"
    );

    void addAuditEntry({
      action: "order_refunded",
      adminId: (req as AdminRequest).adminId,
      ip: getClientIp(req),
      details: `Order #${order.id.slice(-6).toUpperCase()} admin refund Rs.${refundAmt.toFixed(0)}${reason ? ` — ${reason}` : ""}`,
      result: "success",
    });

    sendSuccess(res, { success: true, refundedAmount: refundAmt, orderId: order.id });
  })
);
router.get(
  "/pharmacy-orders",
  requirePermission("orders.view"),
  wrapAsync(async (_req, res) => {
    const orders = await db
      .select()
      .from(pharmacyOrdersTable)
      .orderBy(desc(pharmacyOrdersTable.createdAt))
      .limit(200);
    sendSuccess(res, {
      orders: orders.map((o) => ({
        ...o,
        total: parseFloat(o.total),
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
      total: orders.length,
    });
  })
);

router.patch(
  "/pharmacy-orders/:id/status",
  requirePermission("orders.edit"),
  wrapAsync(async (req, res) => {
    const { status } = req.body;
    if (!status || !(PHARMACY_ORDER_VALID_STATUSES as readonly string[]).includes(status)) {
      sendValidationError(
        res,
        `Invalid pharmacy order status "${status}". Valid statuses: ${PHARMACY_ORDER_VALID_STATUSES.join(", ")}`
      );
      return;
    }

    const pharmId = req.params["id"] as string;

    /* ── Pharmacy cancel with wallet refund: fully atomic ──
     Status update + wallet credit + refundedAt stamp are committed in ONE transaction.
     isNull(refundedAt) is the idempotency guard — only the first concurrent cancel wins;
     the second returns 409. On any tx failure the entire thing rolls back (no partial cancel). */
    let order: typeof pharmacyOrdersTable.$inferSelect | undefined;

    if (status === "cancelled") {
      const [preOrder] = await db
        .select()
        .from(pharmacyOrdersTable)
        .where(eq(pharmacyOrdersTable.id, pharmId))
        .limit(1);
      if (!preOrder) {
        sendNotFound(res, "Not found");
        return;
      }

      if (preOrder.paymentMethod === "wallet") {
        const refundAmt = parseFloat(preOrder.total);
        const now = new Date();
        const result = await db.transaction(async (tx) => {
          /* Atomic: status + refundedAt stamp + wallet credit — all or nothing.
           WHERE isNull(refundedAt) prevents double-refund under concurrent requests. */
          const [updated] = await tx
            .update(pharmacyOrdersTable)
            .set({ status, refundedAt: now, updatedAt: now })
            .where(and(eq(pharmacyOrdersTable.id, pharmId), isNull(pharmacyOrdersTable.refundedAt)))
            .returning();
          if (!updated) return null;
          await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: now })
            .where(eq(usersTable.id, preOrder.userId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: preOrder.userId,
            type: "credit",
            amount: refundAmt.toFixed(2),
            description: `Refund — Pharmacy Order #${preOrder.id.slice(-6).toUpperCase()} cancelled`,
          });
          return updated;
        });
        if (!result) {
          sendError(res, "Order has already been cancelled or refunded", 409);
          return;
        }
        order = result;
        const pharmRefundLang = await getUserLanguage(preOrder.userId);
        await sendUserNotification(
          preOrder.userId,
          t("notifPharmacyRefund", pharmRefundLang),
          t("notifPharmacyRefundBody", pharmRefundLang).replace("{amount}", refundAmt.toFixed(0)),
          "pharmacy",
          "wallet-outline"
        );
      } else {
        /* Non-wallet cancellation: plain status update */
        const [updated] = await db
          .update(pharmacyOrdersTable)
          .set({ status, updatedAt: new Date() })
          .where(eq(pharmacyOrdersTable.id, pharmId))
          .returning();
        if (!updated) {
          sendNotFound(res, "Not found");
          return;
        }
        order = updated;
      }
    } else {
      /* Non-cancel status update */
      const [updated] = await db
        .update(pharmacyOrdersTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(pharmacyOrdersTable.id, pharmId))
        .returning();
      if (!updated) {
        sendNotFound(res, "Not found");
        return;
      }
      order = updated;
    }

    if (!order) {
      sendNotFound(res, "Not found");
      return;
    }

    const pharmNotifKeys = PHARMACY_NOTIF_KEYS[status];
    if (pharmNotifKeys) {
      const pharmUserLang = await getUserLanguage(order.userId);
      await sendUserNotification(
        order.userId,
        t(pharmNotifKeys.titleKey, pharmUserLang),
        t(pharmNotifKeys.bodyKey, pharmUserLang),
        "pharmacy",
        pharmNotifKeys.icon
      );
    }

    const ioPharm = getIO();
    if (ioPharm) {
      const pharmPayload = {
        id: order.id,
        status: order.status,
        updatedAt:
          order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
      };
      ioPharm.to(getSocketRoom(order.id, "pharmacy")).emit("order:update", pharmPayload);
      ioPharm.to(`user:${order.userId}`).emit("order:update", pharmPayload);
    }

    if (["delivered", "cancelled"].includes(status)) {
      void addAuditEntry({
        action: `pharmacy_order_${status}`,
        adminId: (req as AdminRequest).adminId,
        ip: getClientIp(req),
        details: `Pharmacy Order #${order.id.slice(-6).toUpperCase()} marked ${status}`,
        result: "success",
      });
    }

    sendSuccess(res, { ...order, total: parseFloat(order.total) });
  })
);

/* ── Parcel Bookings ── */
router.get(
  "/parcel-bookings",
  requirePermission("orders.view"),
  wrapAsync(async (_req, res) => {
    const bookings = await db
      .select()
      .from(parcelBookingsTable)
      .orderBy(desc(parcelBookingsTable.createdAt))
      .limit(200);
    sendSuccess(res, {
      bookings: bookings.map((b) => ({
        ...b,
        fare: parseFloat(b.fare),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      total: bookings.length,
    });
  })
);

router.patch(
  "/parcel-bookings/:id/status",
  requirePermission("orders.edit"),
  wrapAsync(async (req, res) => {
    const { status } = req.body;
    if (!status || !(PARCEL_VALID_STATUSES as readonly string[]).includes(status)) {
      sendValidationError(
        res,
        `Invalid parcel status "${status}". Valid statuses: ${PARCEL_VALID_STATUSES.join(", ")}`
      );
      return;
    }

    const parcelId = req.params["id"] as string;

    /* ── Parcel cancel with wallet refund: atomic — status update + refund in ONE tx ── */
    let booking: typeof parcelBookingsTable.$inferSelect | undefined;

    if (status === "cancelled") {
      const [preBooking] = await db
        .select()
        .from(parcelBookingsTable)
        .where(eq(parcelBookingsTable.id, parcelId))
        .limit(1);
      if (!preBooking) {
        sendNotFound(res, "Not found");
        return;
      }

      if (preBooking.paymentMethod === "wallet") {
        const refundAmt = parseFloat(preBooking.fare);
        const now = new Date();
        const result = await db.transaction(async (tx) => {
          /* Atomic: status + refundedAt stamp + wallet credit — all or nothing.
           WHERE isNull(refundedAt) prevents double-refund under concurrent requests. */
          const [updated] = await tx
            .update(parcelBookingsTable)
            .set({ status, refundedAt: now, updatedAt: now })
            .where(
              and(eq(parcelBookingsTable.id, parcelId), isNull(parcelBookingsTable.refundedAt))
            )
            .returning();
          if (!updated) return null;
          await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: now })
            .where(eq(usersTable.id, preBooking.userId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: preBooking.userId,
            type: "credit",
            amount: refundAmt.toFixed(2),
            description: `Refund — Parcel Booking #${preBooking.id.slice(-6).toUpperCase()} cancelled`,
          });
          return updated;
        });
        if (!result) {
          sendError(res, "Booking has already been cancelled or refunded", 409);
          return;
        }
        booking = result;
        const parcelRefundLang = await getUserLanguage(preBooking.userId);
        await sendUserNotification(
          preBooking.userId,
          t("notifParcelRefund", parcelRefundLang),
          t("notifParcelRefundBody", parcelRefundLang).replace("{amount}", refundAmt.toFixed(0)),
          "parcel",
          "wallet-outline"
        );
      } else {
        const [updated] = await db
          .update(parcelBookingsTable)
          .set({ status, updatedAt: new Date() })
          .where(eq(parcelBookingsTable.id, parcelId))
          .returning();
        if (!updated) {
          sendNotFound(res, "Not found");
          return;
        }
        booking = updated;
      }
    } else {
      const [updated] = await db
        .update(parcelBookingsTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(parcelBookingsTable.id, parcelId))
        .returning();
      if (!updated) {
        sendNotFound(res, "Not found");
        return;
      }
      booking = updated;
    }

    if (!booking) {
      sendNotFound(res, "Not found");
      return;
    }

    const parcelNotifKeys = PARCEL_NOTIF_KEYS[status];
    if (parcelNotifKeys) {
      const parcelUserLang = await getUserLanguage(booking.userId);
      await sendUserNotification(
        booking.userId,
        t(parcelNotifKeys.titleKey, parcelUserLang),
        t(parcelNotifKeys.bodyKey, parcelUserLang),
        "parcel",
        parcelNotifKeys.icon
      );
    }

    const ioParcel = getIO();
    if (ioParcel) {
      const parcelPayload = {
        id: booking.id,
        status: booking.status,
        updatedAt:
          booking.updatedAt instanceof Date ? booking.updatedAt.toISOString() : booking.updatedAt,
      };
      ioParcel.to(getSocketRoom(booking.id, "parcel")).emit("order:update", parcelPayload);
      ioParcel.to(`user:${booking.userId}`).emit("order:update", parcelPayload);
    }

    if (["completed", "cancelled"].includes(status)) {
      void addAuditEntry({
        action: `parcel_booking_${status}`,
        adminId: (req as AdminRequest).adminId,
        ip: getClientIp(req),
        details: `Parcel Booking #${booking.id.slice(-6).toUpperCase()} marked ${status}`,
        result: "success",
      });
    }

    sendSuccess(res, { ...booking, fare: parseFloat(booking.fare) });
  })
);
router.get(
  "/pharmacy-enriched",
  wrapAsync(async (_req, res) => {
    const orders = await db
      .select()
      .from(pharmacyOrdersTable)
      .orderBy(desc(pharmacyOrdersTable.createdAt))
      .limit(200);
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable);
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    sendSuccess(res, {
      orders: orders.map((o) => ({
        ...o,
        total: parseFloat(String(o.total)),
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        userName: userMap[o.userId]?.name || null,
        userPhone: userMap[o.userId]?.phone || null,
      })),
      total: orders.length,
    });
  })
);

/* ── Parcel Bookings Enriched ── */
router.get(
  "/parcel-enriched",
  wrapAsync(async (_req, res) => {
    const bookings = await db
      .select()
      .from(parcelBookingsTable)
      .orderBy(desc(parcelBookingsTable.createdAt))
      .limit(200);
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable);
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    sendSuccess(res, {
      bookings: bookings.map((b) => ({
        ...b,
        fare: parseFloat(b.fare),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        userName: userMap[b.userId]?.name || null,
        userPhone: userMap[b.userId]?.phone || null,
      })),
      total: bookings.length,
    });
  })
);

/* ── GET /admin/orders-enriched — paginated, filtered, user-enriched order list ── */
router.get(
  "/orders-enriched",
  wrapAsync(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(q["page"] ?? "1", 10) || 1);
    const pageLimit = Math.min(2000, Math.max(1, parseInt(q["limit"] ?? "2000", 10) || 2000));
    const sortBy = q["sortBy"] ?? "date";
    const sortDir = (q["sortDir"] ?? "desc") === "asc" ? "asc" : "desc";
    const search = q["search"]?.trim().toLowerCase() ?? "";

    const filterConds = buildOrderFilters(q);
    const whereCond = filterConds
      ? and(isNull(ordersTable.deletedAt), filterConds)
      : isNull(ordersTable.deletedAt);

    const orderCol =
      sortBy === "total"
        ? ordersTable.total
        : sortBy === "status"
          ? ordersTable.status
          : ordersTable.createdAt;
    const orderExpr = sortDir === "asc" ? asc(orderCol) : desc(orderCol);

    const rows = await db
      .select()
      .from(ordersTable)
      .where(whereCond)
      .orderBy(orderExpr)
      .limit(2000);

    const uniqueUserIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const users = uniqueUserIds.length
      ? await db
          .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
          .from(usersTable)
          .where(inArray(usersTable.id, uniqueUserIds))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const enriched = rows.map((o) => ({
      ...o,
      total: parseFloat(String(o.total)),
      createdAt: (o.createdAt instanceof Date
        ? o.createdAt
        : new Date(String(o.createdAt))
      ).toISOString(),
      updatedAt: (o.updatedAt instanceof Date
        ? o.updatedAt
        : new Date(String(o.updatedAt))
      ).toISOString(),
      userName: userMap[o.userId]?.name ?? null,
      userPhone: userMap[o.userId]?.phone ?? null,
    }));

    const filtered = search
      ? enriched.filter(
          (o) =>
            o.id.toLowerCase().includes(search) ||
            (o.userName ?? "").toLowerCase().includes(search) ||
            (o.userPhone ?? "").includes(search) ||
            (o.riderName ?? "").toLowerCase().includes(search)
        )
      : enriched;

    const total = filtered.length;
    const offset = (page - 1) * pageLimit;
    const pageData = filtered.slice(offset, offset + pageLimit);

    sendSuccess(res, {
      orders: pageData,
      total,
      page,
      totalPages: Math.ceil(total / pageLimit) || 1,
      hasMore: page * pageLimit < total,
    });
  })
);

/* ── GET /admin/orders-export — full filtered list for CSV download ── */
router.get(
  "/orders-export",
  wrapAsync(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filterConds = buildOrderFilters(q);
    const whereCond = filterConds
      ? and(isNull(ordersTable.deletedAt), filterConds)
      : isNull(ordersTable.deletedAt);

    const rows = await db
      .select()
      .from(ordersTable)
      .where(whereCond)
      .orderBy(desc(ordersTable.createdAt))
      .limit(5000);

    const uniqueUserIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const users = uniqueUserIds.length
      ? await db
          .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
          .from(usersTable)
          .where(inArray(usersTable.id, uniqueUserIds))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const orders = rows.map((o) => ({
      ...o,
      total: parseFloat(String(o.total)),
      createdAt: (o.createdAt instanceof Date
        ? o.createdAt
        : new Date(String(o.createdAt))
      ).toISOString(),
      updatedAt: (o.updatedAt instanceof Date
        ? o.updatedAt
        : new Date(String(o.updatedAt))
      ).toISOString(),
      userName: userMap[o.userId]?.name ?? null,
      userPhone: userMap[o.userId]?.phone ?? null,
    }));

    sendSuccess(res, { orders, total: orders.length });
  })
);

/* ── Delete User ── */
const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "picked_up",
  "out_for_delivery",
];

function buildOrderFilters(query: Record<string, string | undefined>) {
  const { status, type, search: _search, dateFrom, dateTo } = query;
  const conditions: SQL<unknown>[] = [];

  if (status && status !== "all") {
    if (status === "active") {
      conditions.push(or(...ACTIVE_STATUSES.map((s) => eq(ordersTable.status, s))) as SQL<unknown>);
    } else {
      conditions.push(eq(ordersTable.status, status));
    }
  }

  if (type && type !== "all") {
    conditions.push(eq(ordersTable.type, type));
  }

  if (dateFrom) {
    conditions.push(gte(ordersTable.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    const dateToEnd = new Date(dateTo);
    dateToEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(ordersTable.createdAt, dateToEnd));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/* ── User Security Management ── */
router.patch(
  "/orders/:id/assign-rider",
  wrapAsync(async (req, res) => {
    const { riderId } = req.body as { riderId?: string };
    let riderName: string | null = null;
    let riderPhone: string | null = null;
    if (riderId) {
      const [rider] = await db
        .select({
          name: usersTable.name,
          phone: usersTable.phone,
          roles: usersTable.roles,
          isActive: usersTable.isActive,
        })
        .from(usersTable)
        .where(eq(usersTable.id, riderId));
      if (!rider) {
        sendValidationError(res, "Rider not found with the given riderId");
        return;
      }
      const dbRoles = (rider.roles || "").split(",").map((r: string) => r.trim());
      if (!dbRoles.includes("rider")) {
        sendValidationError(
          res,
          "The specified user does not have the rider role and cannot be assigned to deliveries"
        );
        return;
      }
      if (rider.isActive === false) {
        sendValidationError(
          res,
          "The specified rider account is inactive and cannot accept assignments"
        );
        return;
      }
      riderName = rider.name ?? null;
      riderPhone = rider.phone ?? null;
    }
    const [preOrder] = await db
      .select({ riderId: ordersTable.riderId })
      .from(ordersTable)
      .where(and(eq(ordersTable.id, req.params["id"] as string), isNull(ordersTable.deletedAt)))
      .limit(1);
    const [order] = await db
      .update(ordersTable)
      .set({ riderId: riderId || null, riderName, riderPhone, updatedAt: new Date() })
      .where(and(eq(ordersTable.id, req.params["id"] as string), isNull(ordersTable.deletedAt)))
      .returning();
    if (!order) {
      sendNotFound(res, "Order not found");
      return;
    }
    void addAuditEntry({
      action: "order_rider_assigned",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Rider changed from ${preOrder?.riderId ?? "unassigned"} → ${riderName ?? riderId ?? "unassigned"} on order ${req.params["id"] as string}`,
      result: "success",
    });
    sendSuccess(res, {
      success: true,
      order: { ...order, total: parseFloat(String(order.total)), riderName, riderPhone },
    });
  })
);

/* ── Helpers: DB-backed return/dispute storage via platform_settings key-value ── */
type ReturnRecord = {
  id: string;
  reason: string;
  amount: number;
  status: string;
  createdAt: string;
};
type DisputeRecord = { id: string; type: string; note: string; status: string; createdAt: string };

async function loadJson<T>(key: string): Promise<T[]> {
  const row = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, key))
    .limit(1)
    .then((r) => r[0]);
  if (!row) return [];
  try {
    return JSON.parse(row.value) as T[];
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      "[fn] error with fallback return"
    );
    return [];
  }
}

async function saveJson<T>(key: string, data: T[]): Promise<void> {
  const value = JSON.stringify(data);
  await db
    .insert(platformSettingsTable)
    .values({ key, value, label: key, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

/* ── Return requests (DB-backed via platform_settings) ── */
router.get(
  "/orders/:id/returns",
  wrapAsync(async (req, res) => {
    const orderId = req.params["id"] as string;
    sendSuccess(res, await loadJson<ReturnRecord>(`return_log_${orderId}`));
  })
);

router.post(
  "/orders/:id/return",
  wrapAsync(async (req, res) => {
    const orderId = req.params["id"] as string;
    const { reason, amount } = req.body;
    if (!reason) {
      sendValidationError(res, "reason is required");
      return;
    }
    const entry: ReturnRecord = {
      id: generateId(),
      reason: String(reason),
      amount: parseFloat(String(amount)) || 0,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const existing = await loadJson<ReturnRecord>(`return_log_${orderId}`);
    await saveJson(`return_log_${orderId}`, [...existing, entry]);
    void addAuditEntry({
      action: "order_return_logged",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Return logged for order ${orderId}: ${entry.reason}`,
      result: "success",
    });
    sendCreated(res, entry, "Return logged successfully");
  })
);

router.patch(
  "/orders/:id/returns/:returnId",
  wrapAsync(async (req, res) => {
    const { id: orderId, returnId } = req.params as { id: string; returnId: string };
    const { status } = req.body;
    const existing = await loadJson<ReturnRecord>(`return_log_${orderId}`);
    const idx = existing.findIndex((r) => r.id === returnId);
    if (idx === -1) {
      sendNotFound(res, "Return request not found");
      return;
    }
    existing[idx] = { ...existing[idx]!, status: String(status ?? "pending") };
    await saveJson(`return_log_${orderId}`, existing);
    sendSuccess(res, existing[idx]);
  })
);

/* ── Dispute requests (DB-backed via platform_settings) ── */
router.get(
  "/orders/:id/disputes",
  wrapAsync(async (req, res) => {
    const orderId = req.params["id"] as string;
    sendSuccess(res, await loadJson<DisputeRecord>(`dispute_log_${orderId}`));
  })
);

router.post(
  "/orders/:id/dispute",
  wrapAsync(async (req, res) => {
    const orderId = req.params["id"] as string;
    const { type, note } = req.body;
    if (!note) {
      sendValidationError(res, "note is required");
      return;
    }
    const entry: DisputeRecord = {
      id: generateId(),
      type: String(type ?? "other"),
      note: String(note),
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const existing = await loadJson<DisputeRecord>(`dispute_log_${orderId}`);
    await saveJson(`dispute_log_${orderId}`, [...existing, entry]);
    void addAuditEntry({
      action: "order_dispute_logged",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Dispute logged for order ${orderId}: ${entry.note}`,
      result: "success",
    });
    sendCreated(res, entry, "Dispute logged successfully");
  })
);

router.patch(
  "/orders/:id/disputes/:disputeId",
  wrapAsync(async (req, res) => {
    const { id: orderId, disputeId } = req.params as { id: string; disputeId: string };
    const { status } = req.body;
    const existing = await loadJson<DisputeRecord>(`dispute_log_${orderId}`);
    const idx = existing.findIndex((d) => d.id === disputeId);
    if (idx === -1) {
      sendNotFound(res, "Dispute not found");
      return;
    }
    existing[idx] = { ...existing[idx]!, status: String(status ?? "open") };
    await saveJson(`dispute_log_${orderId}`, existing);
    sendSuccess(res, existing[idx]);
  })
);

/* ── GET /admin/orders-stats — summary stats for orders dashboard ── */
router.get("/orders-stats", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'refunded'))                                             AS total,
        COUNT(*) FILTER (WHERE status = 'pending')                                                                  AS pending,
        COUNT(*) FILTER (WHERE status IN ('confirmed', 'preparing', 'out_for_delivery'))                            AS active,
        COUNT(*) FILTER (WHERE status = 'delivered')                                                                AS delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled')                                                                AS cancelled,
        COUNT(*) FILTER (WHERE status = 'refunded')                                                                 AS refunded,
        COALESCE(SUM(CAST(total AS NUMERIC)) FILTER (WHERE status = 'delivered'), 0)                               AS revenue
      FROM orders
      WHERE deleted_at IS NULL
    `);
    const stats = (result.rows?.[0] ?? {}) as Record<string, unknown>;
    sendSuccess(res, {
      total: Number(stats["total"] ?? 0),
      pending: Number(stats["pending"] ?? 0),
      active: Number(stats["active"] ?? 0),
      delivered: Number(stats["delivered"] ?? 0),
      cancelled: Number(stats["cancelled"] ?? 0),
      refunded: Number(stats["refunded"] ?? 0),
      revenue: parseFloat(String(stats["revenue"] ?? "0")),
    });
  } catch (_e) {
    sendError(res, "Failed to load order stats", 500);
  }
});

const vendorInviteSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).max(20).optional(),
    name: z.string().max(200).optional(),
  })
  .refine((d) => d.email || d.phone, { message: "email or phone is required" });

const vendorTierSchema = z.object({
  tier: z.enum(["bronze", "silver", "gold"]),
});

/* ── POST /admin/vendors/invite — invite a vendor by email/phone ── */
router.post(
  "/vendors/invite",
  requirePermission("vendors.edit"),
  validateBody(vendorInviteSchema),
  async (req, res) => {
    try {
      const { email, phone, name } = req.body as z.infer<typeof vendorInviteSchema>;

      const adminReq = req as AdminRequest;
      let channel: "push" | "email" | "audit_log" | "no_channel" = "no_channel";

      const [existingUser] = await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(phone ? eq(usersTable.phone, phone) : eq(usersTable.email, email!))
        .limit(1);

      if (existingUser) {
        await sendUserNotification(
          existingUser.id,
          "You've been invited to become a vendor!",
          `An admin has invited ${name ? `"${name}"` : "you"} to register as a vendor on AJKMart. Open the app to complete your vendor registration.`,
          "system",
          "storefront-outline"
        ).catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId: existingUser.id },
            "[orders] vendor invitation push notification failed"
          );
        });
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: existingUser.id,
            title: "Vendor Invitation",
            body: `You have been invited to become a vendor${name ? ` (${name})` : ""} on AJKMart.`,
            type: "system",
            icon: "storefront-outline",
          })
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err), userId: existingUser.id },
              "[orders] vendor invitation notification insert failed"
            );
          });
        channel = "push";
      } else if (email) {
        const { sendEmail } = await import("../../services/email.js");
        const storeLine = name ? `<p><strong>Store:</strong> ${name}</p>` : "";
        const result = await sendEmail({
          to: email,
          subject: "You've been invited to sell on AJKMart",
          html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
          <h2>Vendor Invitation</h2>
          ${storeLine}
          <p>An admin has invited you to register as a vendor on AJKMart. Download the app or visit our website to complete your registration.</p>
        </div>`,
          text: `Vendor Invitation\n\n${name ? `Store: ${name}\n\n` : ""}An admin has invited you to register as a vendor on AJKMart. Download the app or visit our website to complete your registration.`,
        });
        channel = result.sent ? "email" : "audit_log";
      } else {
        channel = "no_channel";
      }

      void addAuditEntry({
        action: "vendor_invite_sent",
        ip: getClientIp(req),
        adminId: adminReq.adminId,
        details: `Vendor invite sent to ${email || phone} (${name ?? "unknown"}) via channel=${channel}`,
        result: "success",
      });
      sendSuccess(res, { invited: true, email, phone, name, channel });
    } catch (_e) {
      sendError(res, "Failed to send vendor invite", 500);
    }
  }
);

/* ── PATCH /admin/vendors/:id/tier — update vendor account tier ── */
router.patch(
  "/vendors/:id/tier",
  requirePermission("vendors.edit"),
  validateBody(vendorTierSchema),
  wrapAsync(async (req, res) => {
    const { tier } = req.body as z.infer<typeof vendorTierSchema>;
    const vendorId = req.params["id"] as string;
    const [user] = await db
      .update(usersTable)
      .set({ accountLevel: String(tier), updatedAt: new Date() })
      .where(eq(usersTable.id, vendorId))
      .returning({ id: usersTable.id, accountLevel: usersTable.accountLevel });
    if (!user) {
      sendNotFound(res, "Vendor not found");
      return;
    }
    void addAuditEntry({
      action: "vendor_tier_update",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Vendor ${vendorId} tier set to ${tier}`,
      result: "success",
    });
    sendSuccess(res, user);
  })
);

/* ── PATCH /orders/bulk-status — update status on multiple orders at once ── */
const bulkOrderStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.string().min(1),
});
router.patch(
  "/orders/bulk-status",
  requirePermission("orders.edit"),
  validateBody(bulkOrderStatusSchema),
  async (req, res) => {
    try {
      const { ids, status } = req.body as z.infer<typeof bulkOrderStatusSchema>;
      const updated = await db
        .update(ordersTable)
        .set({ status, updatedAt: new Date() })
        .where(inArray(ordersTable.id, ids))
        .returning({ id: ordersTable.id });
      void addAuditEntry({
        action: "orders_bulk_status",
        ip: getClientIp(req),
        adminId: (req as AdminRequest).adminId,
        details: `Bulk status → ${status} for ${updated.length} orders`,
        result: "success",
      });
      sendSuccess(res, { updated: updated.length, ids: updated.map((r) => r.id) });
    } catch (err) {
      logger.error({ err }, "[orders/bulk-status] failed");
      sendError(res, "Internal server error", 500);
    }
  }
);

export default router;
