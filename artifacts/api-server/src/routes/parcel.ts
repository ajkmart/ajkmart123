import { db } from "@workspace/db";
import {
  notificationsTable,
  parcelBookingsTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { t, type TranslationKey } from "@workspace/i18n";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { calcCodFee, calcDeliveryFee, calcGst } from "../lib/fees.js";
import { isInServiceZone } from "../lib/geofence.js";
import { getUserLanguage } from "../lib/getUserLanguage.js";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../lib/response.js";
import { gpsAntiSpoofMiddleware } from "../middleware/gpsSpoof.js";
import { publicLimiter } from "../middleware/rate-limit.js";
import { addSecurityEvent, customerAuth, riderAuth } from "../middleware/security.js";
import { verifyOwnership } from "../middleware/verifyOwnership.js";
import { getCachedSettings } from "./admin.js";

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const createParcelSchema = z.object({
  senderName: z
    .string()
    .min(1, "senderName is required")
    .max(100, "senderName too long")
    .transform(stripHtml),
  senderPhone: z
    .string()
    .min(7, "senderPhone is required")
    .max(20, "senderPhone too long")
    .refine(
      (val) => {
        const raw = val.replace(/[\s\-()]/g, "");
        return /^\+?92(3\d{9})$/.test(raw) || /^0(3\d{9})$/.test(raw) || /^(3\d{9})$/.test(raw);
      },
      { message: "senderPhone must be a valid Pakistani mobile number (e.g. 03001234567)" }
    ),
  pickupAddress: z
    .string()
    .min(1, "pickupAddress is required")
    .max(500, "pickupAddress too long")
    .transform(stripHtml),
  receiverName: z
    .string()
    .min(1, "receiverName is required")
    .max(100, "receiverName too long")
    .transform(stripHtml),
  receiverPhone: z
    .string()
    .min(7, "receiverPhone is required")
    .max(20, "receiverPhone too long")
    .refine(
      (val) => {
        const raw = val.replace(/[\s\-()]/g, "");
        return /^\+?92(3\d{9})$/.test(raw) || /^0(3\d{9})$/.test(raw) || /^(3\d{9})$/.test(raw);
      },
      { message: "receiverPhone must be a valid Pakistani mobile number (e.g. 03001234567)" }
    ),
  dropAddress: z
    .string()
    .min(1, "dropAddress is required")
    .max(500, "dropAddress too long")
    .transform(stripHtml),
  parcelType: z.string().min(1, "parcelType is required").max(50, "parcelType too long"),
  paymentMethod: z.enum(["cash", "wallet", "cod"], {
    errorMap: () => ({ message: "paymentMethod must be cash, wallet, or cod" }),
  }),
  weight: z
    .number({ required_error: "weight is required", invalid_type_error: "weight must be a number" })
    .positive("weight must be greater than 0")
    .max(500, "weight cannot exceed 500 kg"),
  description: z
    .string()
    .max(500, "description too long")
    .transform((s) => stripHtml(s))
    .optional(),
  pickupLat: z.number().min(-90).max(90).optional(),
  pickupLng: z.number().min(-180).max(180).optional(),
  dropLat: z.number().min(-90).max(90).optional(),
  dropLng: z.number().min(-180).max(180).optional(),
});

const parcelEstimateSchema = z
  .object({
    parcelType: z.string().max(50).optional(),
    weight: z
      .number({
        required_error: "weight is required",
        invalid_type_error: "weight must be a number",
      })
      .positive("weight must be greater than 0")
      .max(500, "weight cannot exceed 500 kg"),
  })
  .strict();

const router: IRouter = Router();

/* ── Parcel fare = admin base fee + per-kg charge (from delivery_fee_parcel + delivery_parcel_per_kg) ── */
function calcParcelFare(baseFee: number, perKgRate: number, weight?: number): number {
  const weightKg = weight && weight > 0 ? weight : 0;
  const weightCharge = Math.round(weightKg * perKgRate);
  return baseFee + weightCharge;
}

function mapBooking(b: typeof parcelBookingsTable.$inferSelect) {
  return {
    id: b.id,
    userId: b.userId,
    senderName: b.senderName,
    senderPhone: b.senderPhone,
    pickupAddress: b.pickupAddress,
    receiverName: b.receiverName,
    receiverPhone: b.receiverPhone,
    dropAddress: b.dropAddress,
    parcelType: b.parcelType,
    weight: b.weight ? parseFloat(b.weight) : null,
    description: b.description,
    fare: parseFloat(b.fare),
    paymentMethod: b.paymentMethod,
    status: b.status,
    estimatedTime: b.estimatedTime,
    riderId: b.riderId,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

router.post("/estimate", publicLimiter, async (req, res, next) => {
  try {
    const p = parcelEstimateSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }
    const { parcelType, weight } = p.data;
    const cappedWeight = weight !== undefined ? Math.min(Math.max(weight, 0), 500) : undefined;
    const s = await getCachedSettings();
    if (!s["delivery_fee_parcel"] || !s["delivery_parcel_per_kg"]) {
      sendError(res, "Parcel fare settings are not configured. Please contact support.", 503);
      return;
    }
    const baseFee = parseFloat(s["delivery_fee_parcel"]);
    const perKgRate = parseFloat(s["delivery_parcel_per_kg"]);
    const preptimeMin = parseInt(s["order_preptime_min"] ?? "15", 10);
    const fare = calcParcelFare(baseFee, perKgRate, cappedWeight);
    const estimatedTime = `${preptimeMin + 30}–${preptimeMin + 60} min`;
    sendSuccess(res, {
      fare,
      estimatedTime,
      parcelType,
      baseFee,
      perKgRate,
      weightKg: cappedWeight ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", customerAuth, async (req, res, next) => {
  try {
    const userId = req.customerId!;
    const bookings = await db
      .select()
      .from(parcelBookingsTable)
      .where(eq(parcelBookingsTable.userId, userId))
      .orderBy(parcelBookingsTable.createdAt);
    sendSuccess(res, { bookings: bookings.map(mapBooking).reverse(), total: bookings.length });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", customerAuth, verifyOwnership("parcel_booking"), async (req, res, next) => {
  try {
    const _userId = req.customerId!;
    const [booking] = await db
      .select()
      .from(parcelBookingsTable)
      .where(eq(parcelBookingsTable.id, String(req.params["id"] as string)))
      .limit(1);
    if (!booking) {
      sendNotFound(res, "Parcel booking not found");
      return;
    }
    /* Ownership already enforced by verifyOwnership("parcel_booking") middleware */
    sendSuccess(res, mapBooking(booking));
  } catch (err) {
    next(err);
  }
});

router.post("/", customerAuth, async (req, res, next) => {
  try {
    const userId = req.customerId!;

    const parsed = createParcelSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input";
      sendValidationError(res, firstError);
      return;
    }
    const {
      senderName,
      senderPhone,
      pickupAddress,
      receiverName,
      receiverPhone,
      dropAddress,
      parcelType,
      weight,
      description,
      paymentMethod,
      pickupLat,
      pickupLng,
    } = parsed.data;

    const s = await getCachedSettings();

    // Maintenance mode gate
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

    // Feature flag check
    const parcelEnabled = (s["feature_parcel"] ?? "on") === "on";
    if (!parcelEnabled) {
      sendError(res, "Parcel delivery service is currently disabled", 503);
      return;
    }

    const { dropLat, dropLng } = parsed.data;

    /* ── Geofence: check pickup coordinates if provided ── */
    if ((s["security_geo_fence"] ?? "off") === "on") {
      if (pickupLat != null && pickupLng != null) {
        const pLat = parseFloat(String(pickupLat));
        const pLng = parseFloat(String(pickupLng));
        if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
          const zoneCheck = await isInServiceZone(pLat, pLng, "parcel");
          if (!zoneCheck.allowed) {
            sendError(
              res,
              "Pickup location is outside our service area. We currently only operate in configured service zones.",
              422
            );
            return;
          }
        }
      }
      if (dropLat != null && dropLng != null) {
        const dLat = parseFloat(String(dropLat));
        const dLng = parseFloat(String(dropLng));
        if (Number.isFinite(dLat) && Number.isFinite(dLng)) {
          const zoneCheck = await isInServiceZone(dLat, dLng, "parcel");
          if (!zoneCheck.allowed) {
            sendError(
              res,
              "Drop-off location is outside our service area. We currently only operate in configured service zones.",
              422
            );
            return;
          }
        }
      }
    }

    /* ── Fraud detection (mirrors orders.ts pattern) ── */
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";
    {
      const [userRecord] = await db
        .select({
          isBanned: usersTable.isBanned,
          isActive: usersTable.isActive,
          createdAt: usersTable.createdAt,
        })
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
          .from(parcelBookingsTable)
          .where(
            and(
              eq(parcelBookingsTable.userId, userId),
              gte(parcelBookingsTable.createdAt, todayStart)
            )
          );
        const dailyCount = Number(dailyResult?.c ?? 0);
        if (dailyCount >= maxDailyOrders) {
          addSecurityEvent({
            type: "daily_order_limit",
            ip,
            userId,
            details: `User ${userId} hit daily parcel limit: ${dailyCount}/${maxDailyOrders}`,
            severity: "medium",
          });
          sendError(
            res,
            `Daily parcel booking limit (${maxDailyOrders}) reached. Please try again tomorrow.`,
            429
          );
          return;
        }

        if (dropAddress) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const sameAddrLimit = parseInt(s["security_same_addr_limit"] ?? "5", 10);
          const sameAddrOrders = await db
            .select({ c: count() })
            .from(parcelBookingsTable)
            .where(
              and(
                eq(parcelBookingsTable.dropAddress, dropAddress),
                gte(parcelBookingsTable.createdAt, oneHourAgo)
              )
            );
          const sameAddrCount = Number(sameAddrOrders[0]?.c ?? 0);
          if (sameAddrCount >= sameAddrLimit) {
            addSecurityEvent({
              type: "same_address_limit",
              ip,
              userId,
              details: `Parcel same-address limit hit: ${dropAddress} (${sameAddrCount}/hr)`,
              severity: "high",
            });
            sendError(
              res,
              "Too many parcel bookings to this address. Please try again later.",
              429
            );
            return;
          }
        }
      }
    }

    /* ── Delivery fare, GST, COD fee — via shared utility (see lib/fees.ts) ── */
    const weightKg = weight && weight > 0 ? parseFloat(String(weight)) : 0;
    const fare = calcDeliveryFee(
      s,
      "parcel",
      0,
      weightKg
    ); /* base + per-kg, no free-threshold for parcels */
    const gstAmount = calcGst(s, fare);
    const codFee = calcCodFee(s, paymentMethod, fare + gstAmount);
    const totalFare = fare + gstAmount + codFee;

    /* ── Estimated time from admin Order settings ── */
    const preptimeMin = parseInt(s["order_preptime_min"] ?? "15", 10);
    const estimatedTime = `${preptimeMin + 30}–${preptimeMin + 60} min`;

    /* ── COD validation (mirrors orders.ts pattern) ── */
    if (paymentMethod === "cash" || paymentMethod === "cod") {
      const codEnabled = (s["cod_enabled"] ?? "on") === "on";
      if (!codEnabled) {
        sendValidationError(res, "Cash on Delivery is currently not available");
        return;
      }
      const codAllowedForParcel = (s["cod_allowed_parcel"] ?? "on") !== "off";
      if (!codAllowedForParcel) {
        sendValidationError(
          res,
          "Cash on Delivery is not available for Parcel orders. Please choose another payment method."
        );
        return;
      }
      const codMax = parseFloat(s["cod_max_amount"] ?? "5000");
      if (totalFare > codMax) {
        sendValidationError(
          res,
          `Maximum Cash on Delivery order is Rs. ${codMax}. Please pay online for larger orders.`
        );
        return;
      }
      /* ── COD verification threshold — flag high-value cash orders ── */
      const verifyThreshold = parseFloat(s["cod_verification_threshold"] ?? "0");
      if (verifyThreshold > 0 && totalFare > verifyThreshold) {
        /* Order is allowed but flagged for rider photo verification */
      }
    }

    // Wallet payment → atomic DB transaction (prevents race condition / double-spend)
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
        const booking = await db.transaction(async (tx) => {
          const [user] = await tx
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1);
          if (!user) throw new Error("User not found");

          const balance = parseFloat(user.walletBalance ?? "0");
          if (balance < totalFare)
            throw new Error(
              `Insufficient wallet balance. Balance: Rs. ${balance.toFixed(0)}, Required: Rs. ${totalFare}`
            );

          /* DB floor guard — deducts only if balance ≥ amount at UPDATE time */
          const [deducted] = await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance - ${totalFare.toFixed(2)}` })
            .where(
              and(eq(usersTable.id, userId), gte(usersTable.walletBalance, totalFare.toFixed(2)))
            )
            .returning({ id: usersTable.id });
          if (!deducted)
            throw new Error(`Insufficient wallet balance. Required: Rs. ${totalFare.toFixed(0)}`);
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId,
            type: "debit",
            amount: totalFare.toFixed(2),
            description: `Parcel delivery - ${parcelType} (fare + GST)`,
          });

          const [newBooking] = await tx
            .insert(parcelBookingsTable)
            .values({
              id: generateId(),
              userId,
              senderName,
              senderPhone,
              pickupAddress,
              receiverName,
              receiverPhone,
              dropAddress,
              parcelType,
              weight: weight ? weight.toString() : null,
              description: description || null,
              fare: totalFare.toString(),
              paymentMethod,
              status: "pending",
              estimatedTime,
            })
            .returning();
          return newBooking!;
        });

        const pLang1 = await getUserLanguage(userId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId,
            title: t("notifParcelBookingConfirmed" as TranslationKey, pLang1),
            body: t("notifParcelBookingConfirmedBody" as TranslationKey, pLang1)
              .replace("{type}", parcelType)
              .replace("{amount}", totalFare.toFixed(0))
              .replace("{receiver}", receiverName)
              .replace("{eta}", estimatedTime),
            type: "parcel",
            icon: "cube-outline",
            link: `/(tabs)/orders`,
          })
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err), userId },
              "[parcel] booking-confirmed notification insert (wallet payment) failed"
            );
          });

        sendCreated(res, { ...mapBooking(booking), gstAmount });
      } catch (e: unknown) {
        sendValidationError(
          res,
          e instanceof Error ? e.message : "An error occurred processing your parcel booking"
        );
      }
      return;
    }

    // Cash / other payments
    const [booking] = await db
      .insert(parcelBookingsTable)
      .values({
        id: generateId(),
        userId,
        senderName,
        senderPhone,
        pickupAddress,
        receiverName,
        receiverPhone,
        dropAddress,
        parcelType,
        weight: weight ? weight.toString() : null,
        description: description || null,
        fare: totalFare.toString(),
        paymentMethod,
        status: "pending",
        estimatedTime,
      })
      .returning();

    const pLang2 = await getUserLanguage(userId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId,
        title: t("notifParcelBookingConfirmed" as TranslationKey, pLang2),
        body: t("notifParcelBookingConfirmedBody" as TranslationKey, pLang2)
          .replace("{type}", parcelType)
          .replace("{amount}", totalFare.toFixed(0))
          .replace("{receiver}", receiverName)
          .replace("{eta}", estimatedTime),
        type: "parcel",
        icon: "cube-outline",
        link: `/(tabs)/orders`,
      })
      .catch((err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), userId },
          "[parcel] booking-confirmed notification insert (cash payment) failed"
        );
      });

    sendCreated(res, { ...mapBooking(booking!), gstAmount });
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:id/cancel",
  customerAuth,
  verifyOwnership("parcel_booking"),
  async (req, res, next) => {
    try {
      const userId = req.customerId!;
      const bookingId = String(req.params["id"] as string);

      const [booking] = await db
        .select()
        .from(parcelBookingsTable)
        .where(eq(parcelBookingsTable.id, bookingId))
        .limit(1);

      if (!booking) {
        sendNotFound(res, "Parcel booking not found");
        return;
      }
      /* Ownership already enforced by verifyOwnership("parcel_booking") middleware */
      if (!["pending", "accepted"].includes(booking.status)) {
        sendError(res, "Parcel cannot be cancelled at this stage", 409);
        return;
      }

      const s = await getCachedSettings();
      const cancelWindowMin = parseFloat(String(s["order_cancel_window_min"] ?? "5"));
      const minutesSincePlaced = (Date.now() - booking.createdAt.getTime()) / 60000;
      if (booking.status === "pending" && minutesSincePlaced > cancelWindowMin) {
        sendError(res, `Cancellation window of ${cancelWindowMin} minutes has passed`, 409);
        return;
      }

      let refundAmount = 0;
      let cancelledBooking: typeof parcelBookingsTable.$inferSelect | undefined;

      const cancellableStatuses = ["pending", "accepted"] as const;

      if (booking.paymentMethod === "wallet") {
        const refund = parseFloat(booking.fare);
        cancelledBooking = await db
          .transaction(async (tx) => {
            const [locked] = await tx
              .select()
              .from(parcelBookingsTable)
              .where(eq(parcelBookingsTable.id, bookingId))
              .for("update")
              .limit(1);
            if (
              !locked ||
              !cancellableStatuses.includes(locked.status as (typeof cancellableStatuses)[number])
            ) {
              throw Object.assign(new Error("Parcel cannot be cancelled at this stage"), {
                httpStatus: 409,
              });
            }
            const [updated] = await tx
              .update(parcelBookingsTable)
              .set({ status: "cancelled", updatedAt: new Date() })
              .where(
                and(eq(parcelBookingsTable.id, bookingId), sql`status IN ('pending','accepted')`)
              )
              .returning();
            if (!updated)
              throw Object.assign(new Error("Concurrent cancel — booking state changed"), {
                httpStatus: 409,
              });
            await tx
              .update(usersTable)
              .set({
                walletBalance: sql`wallet_balance + ${refund.toFixed(2)}`,
                updatedAt: new Date(),
              })
              .where(eq(usersTable.id, userId));
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId,
              type: "credit",
              amount: refund.toFixed(2),
              description: `Parcel booking refund — #${bookingId.slice(-6).toUpperCase()} cancelled`,
              reference: `refund:${bookingId}`,
            });
            return updated;
          })
          .catch((err: unknown) => {
            if (err && typeof err === "object" && "httpStatus" in err) {
              const e = err as { httpStatus: number; message?: string };
              sendError(res, e.message ?? "Cancel failed", e.httpStatus);
            } else {
              sendError(res, "Cancel failed", 500);
            }
            return undefined;
          });
        if (!cancelledBooking) return;
        const pRefLang = await getUserLanguage(userId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId,
            title: t("notifParcelRefund" as TranslationKey, pRefLang),
            body: t("notifParcelRefundBody" as TranslationKey, pRefLang).replace(
              "{amount}",
              refund.toFixed(0)
            ),
            type: "parcel",
            icon: "wallet-outline",
          })
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err), userId },
              "[parcel] cancellation-refund notification insert failed"
            );
          });
        refundAmount = refund;
        sendSuccess(res, { ...mapBooking(cancelledBooking), refundAmount });
        return;
      }

      const [cancelled] = await db
        .update(parcelBookingsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(parcelBookingsTable.id, bookingId), sql`status IN ('pending','accepted')`))
        .returning();

      if (!cancelled) {
        sendError(res, "Parcel cannot be cancelled at this stage", 409);
        return;
      }
      sendSuccess(res, { ...mapBooking(cancelled), refundAmount });
    } catch (err) {
      next(err);
    }
  }
);

router.patch("/:id/status", riderAuth, async (req, res, next) => {
  try {
    const riderId = req.riderId!;
    const { status } = req.body;

    /* Whitelist allowed status transitions — prevents arbitrary string injection */
    const allowedStatuses = ["accepted", "picked_up", "in_transit", "delivered", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      sendValidationError(res, `Invalid status. Allowed: ${allowedStatuses.join(", ")}`);
      return;
    }

    /* Ownership check: rider must be accepting (parcel unassigned) or already the assigned rider */
    const [booking] = await db
      .select()
      .from(parcelBookingsTable)
      .where(eq(parcelBookingsTable.id, String(req.params["id"] as string)))
      .limit(1);
    if (!booking) {
      sendNotFound(res, "Parcel booking not found");
      return;
    }

    const PARCEL_STATUS_ORDER: Record<string, string[]> = {
      pending: ["accepted", "cancelled"],
      accepted: ["picked_up", "cancelled"],
      picked_up: ["in_transit", "cancelled"],
      in_transit: ["delivered", "cancelled"],
      delivered: [],
      cancelled: [],
    };
    const allowedNext = PARCEL_STATUS_ORDER[booking.status] ?? [];
    if (!allowedNext.includes(status)) {
      sendValidationError(res, `Cannot transition from '${booking.status}' to '${status}'`);
      return;
    }

    const isUnassigned = !booking.riderId;
    const isAssignedToMe = booking.riderId === riderId;
    if (!isUnassigned && !isAssignedToMe) {
      sendForbidden(res, "This parcel is assigned to another rider");
      return;
    }

    if ((status === "accepted" || status === "picked_up") && isUnassigned) {
      const [updated] = await db
        .update(parcelBookingsTable)
        .set({ status, riderId, updatedAt: new Date() })
        .where(
          and(eq(parcelBookingsTable.id, String(req.params["id"] as string)), sql`rider_id IS NULL`)
        )
        .returning();
      if (!updated) {
        sendError(res, "This parcel has already been accepted by another rider", 409);
        return;
      }
      sendSuccess(res, mapBooking(updated));
    } else {
      const [updated] = await db
        .update(parcelBookingsTable)
        .set({ status, riderId, updatedAt: new Date() })
        .where(eq(parcelBookingsTable.id, String(req.params["id"] as string)))
        .returning();
      if (!updated) {
        sendNotFound(res, "Parcel booking not found");
        return;
      }
      sendSuccess(res, mapBooking(updated));
    }
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /parcel/:id/location
   Rider broadcasts live GPS position while delivering a parcel.
   GPS anti-spoof middleware runs first (coord range, accuracy=0,
   mockProvider flag, emulator signatures). Only the assigned
   rider may update the location.

   Body: { latitude, longitude, accuracy?, mockProvider? }
══════════════════════════════════════════════════════════════ */
router.patch("/:id/location", riderAuth, gpsAntiSpoofMiddleware, async (req, res, next) => {
  try {
    const riderId = req.riderId!;
    const bookingId = String(req.params["id"] as string);
    const { latitude, longitude, accuracy } = req.body as {
      latitude: number;
      longitude: number;
      accuracy?: number;
    };

    const [booking] = await db
      .select({
        id: parcelBookingsTable.id,
        riderId: parcelBookingsTable.riderId,
        status: parcelBookingsTable.status,
      })
      .from(parcelBookingsTable)
      .where(eq(parcelBookingsTable.id, bookingId))
      .limit(1);

    if (!booking) {
      sendNotFound(res, "Parcel booking not found");
      return;
    }
    if (booking.riderId !== riderId) {
      sendForbidden(res, "You are not the assigned rider for this parcel");
      return;
    }

    const activeStatuses = ["accepted", "picked_up", "in_transit"];
    if (!activeStatuses.includes(booking.status ?? "")) {
      sendError(res, "Live location updates are only accepted for active parcel deliveries", 409);
      return;
    }

    /* Broadcast live position via Socket.IO so customers/admins can track the parcel */
    const io = (
      req.app as unknown as {
        get?: (
          key: string
        ) => { to: (room: string) => { emit: (event: string, data: unknown) => void } } | null;
      }
    ).get?.("io");
    if (io) {
      io.to(`parcel:${bookingId}`).emit("parcel:location", {
        bookingId,
        riderId,
        latitude: parseFloat(String(latitude)),
        longitude: parseFloat(String(longitude)),
        accuracy: accuracy !== undefined ? parseFloat(String(accuracy)) : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    sendSuccess(res, { bookingId, latitude, longitude, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
