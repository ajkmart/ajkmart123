import { idempotencyKeysTable } from "@workspace/db/schema";
import { Router } from "express";
import type { TranslationKey } from "./helpers.js";
import {
  acceptBidSchema,
  and,
  asc,
  bargainLimiter,
  bookRideLimiter,
  bookRideSchema,
  broadcastRide,
  broadcastWalletUpdate,
  calcFare,
  cancelRideLimiter,
  cancelRideSchema,
  cleanupNotifiedRiders,
  count,
  customerAuth,
  customerCounterSchema,
  db,
  DEFAULT_MAX_FARE,
  emitRideDispatchUpdate,
  emitRideOtp,
  emitRideUpdate,
  ensureDefaultLocations,
  ensureDefaultRideServices,
  eq,
  estimateLimiter,
  estimateSchema,
  formatRide,
  generateId,
  generateOtp,
  getCachedSettings,
  getRoadDistanceKm,
  getUserLanguage,
  gte,
  isInServiceZone,
  logger,
  ne,
  notificationsTable,
  popularLocationsTable,
  requireRideOwner,
  requireRideState,
  RideApiError,
  rideBidsTable,
  rideServiceTypesTable,
  ridesTable,
  sendCreated,
  sendError,
  sendErrorWithData,
  sendForbidden,
  sendPushToUser,
  sendSuccess,
  sendValidationError,
  sql,
  t,
  usersTable,
  walletTransactionsTable,
} from "./helpers.js";

const router = Router();

router.get("/services", async (_req, res) => {
  try {
    await ensureDefaultRideServices();
    const services = await db
      .select()
      .from(rideServiceTypesTable)
      .where(eq(rideServiceTypesTable.isEnabled, true))
      .orderBy(asc(rideServiceTypesTable.sortOrder));
    sendSuccess(res, {
      services: services.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        nameUrdu: s.nameUrdu,
        icon: s.icon,
        description: s.description,
        color: s.color,
        baseFare: parseFloat(s.baseFare ?? "0"),
        perKm: parseFloat(s.perKm ?? "0"),
        minFare: parseFloat(s.minFare ?? "0"),
        maxPassengers: s.maxPassengers,
        allowBargaining: s.allowBargaining,
        sortOrder: s.sortOrder,
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

router.get("/stops", async (_req, res) => {
  try {
    await ensureDefaultLocations();
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[rides/stops] ensureDefaultLocations non-fatal — proceeding with DB data"
    );
  }
  const locs = await db
    .select()
    .from(popularLocationsTable)
    .where(eq(popularLocationsTable.isActive, true))
    .orderBy(asc(popularLocationsTable.sortOrder));
  sendSuccess(res, {
    locations: locs.map((l) => ({
      id: l.id,
      name: l.name,
      nameUrdu: l.nameUrdu,
      lat: parseFloat(String(l.lat)),
      lng: parseFloat(String(l.lng)),
      category: l.category,
      icon: l.icon,
    })),
  });
});

router.post("/estimate", estimateLimiter, async (req, res) => {
  try {
    const parsed = estimateSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      sendError(res, msg, 422);
      return;
    }
    const { pickupLat, pickupLng, dropLat, dropLng, type } = parsed.data;
    try {
      const serviceType = type || "bike";
      const { distanceKm, durationSeconds, source } = await getRoadDistanceKm(
        pickupLat,
        pickupLng,
        dropLat,
        dropLng
      );
      const { baseFare, gstAmount, total } = await calcFare(distanceKm, serviceType);
      const s = await getCachedSettings();
      const durationMin = Math.round(durationSeconds / 60);
      const duration = `${durationMin} min`;
      const bargainEnabled = (s["ride_bargaining_enabled"] ?? "on") === "on";
      const bargainMinPct = parseFloat(s["ride_bargaining_min_pct"] ?? "70");
      const minOffer = Math.ceil(total * (bargainMinPct / 100));
      sendSuccess(res, {
        distance: Math.round(distanceKm * 10) / 10,
        baseFare,
        gstAmount,
        fare: total,
        duration,
        durationSeconds,
        distanceSource: source,
        type: serviceType,
        bargainEnabled,
        minOffer,
      });
    } catch (e: unknown) {
      const status = e instanceof RideApiError ? e.httpStatus : 422;
      const code = e instanceof RideApiError ? e.code : "ESTIMATE_FAILED";
      if (!(e instanceof RideApiError)) {
        logger.error({ err: e }, "[rides/estimate] unexpected error during fare estimation");
      }
      sendErrorWithData(
        res,
        e instanceof RideApiError ? (e as Error).message : "An internal error occurred",
        { code },
        status
      );
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

router.post("/", customerAuth, bookRideLimiter, async (req, res) => {
  try {
    const parsed = bookRideSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      sendError(res, msg, 422);
      return;
    }

    const userId = req.customerId!;

    const idempotencyKey =
      typeof req.headers["x-idempotency-key"] === "string"
        ? req.headers["x-idempotency-key"].trim()
        : typeof req.body?.idempotencyKey === "string"
          ? req.body.idempotencyKey.trim()
          : null;

    let idempotencyLockHeld = false;
    let bookingSucceeded = false;
    const idempotencyScopedKey = idempotencyKey ? `ride:${idempotencyKey}` : null;

    async function releaseIdempotencyLock() {
      if (!idempotencyScopedKey) return;
      await db
        .delete(idempotencyKeysTable)
        .where(
          and(
            eq(idempotencyKeysTable.userId, userId),
            eq(idempotencyKeysTable.idempotencyKey, idempotencyScopedKey),
            sql`${idempotencyKeysTable.responseData} = '{}'`
          )
        )
        .catch((e: Error) =>
          logger.warn({ err: e.message }, "[rides/book] idempotency lock release failed")
        );
    }

    const {
      type,
      pickupAddress,
      dropAddress,
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
      paymentMethod,
      offeredFare,
      bargainNote,
      isParcel,
      receiverName,
      receiverPhone,
      packageType,
      isScheduled,
      scheduledAt,
      stops,
      isPoolRide,
    } = parsed.data;

    let scheduledAtDate: Date | undefined;
    if (isScheduled && scheduledAt) {
      scheduledAtDate = new Date(scheduledAt);
      const minAdvanceMs = 5 * 60_000;
      if (scheduledAtDate.getTime() - Date.now() < minAdvanceMs) {
        sendError(res, "Scheduled ride must be at least 5 minutes in the future.", 400);
        return;
      }
      const maxAdvanceDays = 7;
      if (scheduledAtDate.getTime() - Date.now() > maxAdvanceDays * 24 * 60 * 60 * 1000) {
        sendError(res, "Scheduled ride cannot be more than 7 days in advance.", 400);
        return;
      }
    }

    const existingActive = await db
      .select({ id: ridesTable.id, status: ridesTable.status })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.userId, userId),
          sql`status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit')`
        )
      )
      .limit(1);
    if (existingActive.length > 0) {
      sendErrorWithData(
        res,
        "Aapki ek ride pehle se active hai. Naye ride ke liye pehle wali complete ya cancel karein.",
        {
          activeRideId: existingActive[0]!.id,
          activeRideStatus: existingActive[0]!.status,
        },
        409
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

    const ridesEnabled = (s["feature_rides"] ?? "on") === "on";
    if (!ridesEnabled) {
      sendError(res, "Ride booking is currently disabled", 503);
      return;
    }

    if ((s["security_geo_fence"] ?? "off") === "on") {
      const pickupCheck = await isInServiceZone(pickupLat, pickupLng, "rides");
      if (!pickupCheck.allowed) {
        sendError(
          res,
          "Pickup location is outside our service area. We currently only operate in configured service zones.",
          422
        );
        return;
      }
      const dropCheck = await isInServiceZone(dropLat, dropLng, "rides");
      if (!dropCheck.allowed) {
        sendError(
          res,
          "Drop location is outside our service area. We currently only operate in configured service zones.",
          422
        );
        return;
      }
    }

    if (Math.abs(pickupLat - dropLat) < 0.0001 && Math.abs(pickupLng - dropLng) < 0.0001) {
      sendValidationError(res, "Pickup and drop locations cannot be the same");
      return;
    }

    let distance: number;
    let baseFare: number, gstAmount: number, platformFare: number, serviceMinFare: number;
    try {
      const routeResult = await getRoadDistanceKm(pickupLat, pickupLng, dropLat, dropLng);
      distance = routeResult.distanceKm;
      const fareResult = await calcFare(distance, type);
      baseFare = fareResult.baseFare;
      gstAmount = fareResult.gstAmount;
      platformFare = fareResult.total;
      serviceMinFare = fareResult.minFare;
    } catch (e: unknown) {
      const status = e instanceof RideApiError ? e.httpStatus : 422;
      const code = e instanceof RideApiError ? e.code : "FARE_CALCULATION_FAILED";
      if (!(e instanceof RideApiError)) {
        logger.error({ err: e }, "[rides/book] unexpected error during fare calculation");
      }
      sendErrorWithData(
        res,
        e instanceof RideApiError ? (e as Error).message : "An internal error occurred",
        { code },
        status
      );
      return;
    }

    const bargainEnabled = (s["ride_bargaining_enabled"] ?? "on") === "on";
    const bargainMinPct = parseFloat(s["ride_bargaining_min_pct"] ?? "70");

    let isBargaining = false;
    let validatedOffer = 0;

    if (offeredFare !== undefined && bargainEnabled) {
      validatedOffer = offeredFare;
      const maxFare = parseFloat(s["ride_max_fare"] ?? String(DEFAULT_MAX_FARE));
      if (validatedOffer > maxFare) {
        sendErrorWithData(
          res,
          `Offered fare cannot exceed Rs. ${maxFare}`,
          { code: "FARE_TOO_HIGH" },
          422
        );
        return;
      }
      if (serviceMinFare > 0 && validatedOffer < serviceMinFare) {
        sendErrorWithData(
          res,
          `Offered fare cannot be lower than the minimum fare of Rs. ${serviceMinFare.toFixed(0)} for this service`,
          { code: "FARE_BELOW_MIN" },
          422
        );
        return;
      }
      const minOffer = Math.ceil(platformFare * (bargainMinPct / 100));
      if (validatedOffer < minOffer) {
        sendErrorWithData(
          res,
          `Minimum offer allowed is Rs. ${minOffer} (${bargainMinPct}% of platform fare)`,
          { code: "FARE_OUT_OF_RANGE" },
          422
        );
        return;
      }
      isBargaining = validatedOffer < platformFare;
    }

    const minOnline = parseFloat(s["payment_min_online"] ?? "50");
    const maxOnline = parseFloat(s["payment_max_online"] ?? "100000");
    const effectiveFare = isBargaining ? validatedOffer : platformFare;
    if (paymentMethod === "wallet" && (effectiveFare < minOnline || effectiveFare > maxOnline)) {
      sendValidationError(
        res,
        `Wallet payment must be between Rs. ${minOnline} and Rs. ${maxOnline}`
      );
      return;
    }

    if (paymentMethod === "wallet") {
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
    }

    if (paymentMethod === "cash") {
      const riderCashAllowed = (s["rider_cash_allowed"] ?? "on") === "on";
      if (!riderCashAllowed) {
        sendValidationError(
          res,
          "Cash payment is currently not available for rides. Please use wallet."
        );
        return;
      }
    }

    const rideStatus = isBargaining ? "bargaining" : "searching";
    const fareToCharge = isBargaining ? validatedOffer : platformFare;
    const fareToStore = platformFare.toFixed(2);

    const POOL_RADIUS_DEG = 0.005;
    const MAX_POOL_SIZE = 3;
    const POOL_WINDOW_MIN = 20;

    /* ── Atomic lock acquire (after all validation passes) ──────────────────
     Acquiring here (rather than at the top) means validation failures never
     hold the lock, so early-exit paths need no cleanup.  The try/finally
     below guarantees release on any non-success exit inside booking logic.
  ─────────────────────────────────────────────────────────────────────── */
    if (idempotencyKey) {
      const [acquired] = await db
        .insert(idempotencyKeysTable)
        .values({
          id: generateId(),
          userId,
          idempotencyKey: idempotencyScopedKey!,
          responseData: "{}",
        })
        .onConflictDoNothing()
        .returning();

      if (!acquired) {
        const [existing] = await db
          .select()
          .from(idempotencyKeysTable)
          .where(
            and(
              eq(idempotencyKeysTable.userId, userId),
              eq(idempotencyKeysTable.idempotencyKey, idempotencyScopedKey!)
            )
          )
          .limit(1);
        if (existing) {
          const cached = (() => {
            try {
              return JSON.parse(existing.responseData);
            } catch (err) {
              logger.warn(
                { err },
                "[fn] idempotency key response cache parse failed — proceeding without cache"
              );
              return null;
            }
          })();
          if (cached && cached.id) {
            sendSuccess(res, cached);
            return;
          }
        }
        sendError(
          res,
          "Your previous ride request is still being processed. Please wait a moment.",
          409
        );
        return;
      }
      idempotencyLockHeld = true;
    }

    try {
      let rideRecord: typeof ridesTable.$inferSelect;

      if (paymentMethod === "wallet" && !isBargaining) {
        const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
        if (!walletEnabled) {
          sendValidationError(res, "Wallet payments are currently disabled");
          return;
        }

        rideRecord = await db.transaction(async (tx) => {
          await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .for("update")
            .limit(1);

          const [activeConflict] = await tx
            .select({ id: ridesTable.id, status: ridesTable.status })
            .from(ridesTable)
            .where(
              and(
                eq(ridesTable.userId, userId),
                sql`status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit')`
              )
            )
            .limit(1);
          if (activeConflict) {
            throw new RideApiError(
              "Aapki ek ride pehle se active hai. Naye ride ke liye pehle wali complete ya cancel karein.",
              "ACTIVE_RIDE_EXISTS",
              409
            );
          }

          const [lockedUser] = await tx
            .select({ cancellationDebt: usersTable.cancellationDebt })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1);
          const debtAmt = parseFloat(lockedUser?.cancellationDebt ?? "0");
          if (debtAmt > 0) {
            throw new RideApiError(
              `You have an outstanding cancellation fee debt of Rs. ${debtAmt.toFixed(0)}. Please clear your debt before booking a new ride.`,
              "DEBT_OUTSTANDING",
              402
            );
          }

          const [deducted] = await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance - ${fareToCharge.toFixed(2)}` })
            .where(
              and(eq(usersTable.id, userId), gte(usersTable.walletBalance, fareToCharge.toFixed(2)))
            )
            .returning({ id: usersTable.id, walletBalance: usersTable.walletBalance });
          if (!deducted)
            throw new RideApiError(
              `Insufficient wallet balance. Required: Rs. ${fareToCharge.toFixed(0)}`,
              "INSUFFICIENT_BALANCE",
              402
            );
          const rideId = generateId();
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId,
            type: "debit",
            amount: fareToCharge.toFixed(2),
            description: `${type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ")} ride payment`,
            reference: `ride:${rideId}`,
          });
          let resolvedPoolGroupId: string | undefined;
          if (isPoolRide && !isScheduled) {
            const windowStart = new Date(Date.now() - POOL_WINDOW_MIN * 60_000);
            const existingPools = await tx
              .select({ poolGroupId: ridesTable.poolGroupId, id: ridesTable.id })
              .from(ridesTable)
              .where(
                and(
                  eq(ridesTable.isPoolRide, true),
                  eq(ridesTable.type, type),
                  sql`status IN ('searching', 'bargaining')`,
                  sql`pool_group_id IS NOT NULL`,
                  sql`created_at >= ${windowStart.toISOString()}`,
                  sql`ABS(CAST(pickup_lat AS FLOAT) - ${pickupLat}) < ${POOL_RADIUS_DEG}`,
                  sql`ABS(CAST(pickup_lng AS FLOAT) - ${pickupLng}) < ${POOL_RADIUS_DEG}`,
                  sql`ABS(CAST(drop_lat AS FLOAT) - ${dropLat}) < ${POOL_RADIUS_DEG}`,
                  sql`ABS(CAST(drop_lng AS FLOAT) - ${dropLng}) < ${POOL_RADIUS_DEG}`
                )
              )
              .for("update")
              .limit(10);
            if (existingPools.length > 0) {
              const groupIds = [
                ...new Set(existingPools.map((r) => r.poolGroupId).filter(Boolean)),
              ] as string[];
              for (const gid of groupIds) {
                const [countRow] = await tx
                  .select({ c: count() })
                  .from(ridesTable)
                  .where(
                    and(eq(ridesTable.poolGroupId, gid), sql`status IN ('searching', 'bargaining')`)
                  );
                if ((countRow?.c ?? 0) < MAX_POOL_SIZE) {
                  resolvedPoolGroupId = gid;
                  break;
                }
              }
            }
            if (!resolvedPoolGroupId) resolvedPoolGroupId = generateId();
          }

          const scheduledStatus = isScheduled ? "scheduled" : rideStatus;
          const [ride] = await tx
            .insert(ridesTable)
            .values({
              id: rideId,
              userId,
              type,
              status: scheduledStatus,
              pickupAddress,
              dropAddress,
              pickupLat: String(pickupLat),
              pickupLng: String(pickupLng),
              dropLat: String(dropLat),
              dropLng: String(dropLng),
              fare: fareToStore,
              distance: (Math.round(distance * 10) / 10).toString(),
              paymentMethod,
              offeredFare: null,
              counterFare: null,
              bargainStatus: null,
              bargainRounds: 0,
              isParcel: isParcel ?? false,
              receiverName: receiverName || null,
              receiverPhone: receiverPhone || null,
              packageType: packageType || null,
              isScheduled: isScheduled ?? false,
              scheduledAt: scheduledAtDate ?? null,
              stops: stops ? stops : null,
              isPoolRide: isPoolRide ?? false,
              poolGroupId: resolvedPoolGroupId ?? null,
            })
            .returning();
          return ride!;
        });
      } else {
        rideRecord = await db.transaction(async (tx) => {
          await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .for("update")
            .limit(1);

          const [activeConflict] = await tx
            .select({ id: ridesTable.id })
            .from(ridesTable)
            .where(
              and(
                eq(ridesTable.userId, userId),
                sql`status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit')`
              )
            )
            .limit(1);
          if (activeConflict) {
            throw new RideApiError(
              "Aapki ek ride pehle se active hai. Naye ride ke liye pehle wali complete ya cancel karein.",
              "ACTIVE_RIDE_EXISTS",
              409
            );
          }

          const [lockedUser] = await tx
            .select({
              cancellationDebt: usersTable.cancellationDebt,
              walletBalance: usersTable.walletBalance,
            })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1);
          const debtAmt = parseFloat(lockedUser?.cancellationDebt ?? "0");
          if (debtAmt > 0) {
            throw new RideApiError(
              `You have an outstanding cancellation fee debt of Rs. ${debtAmt.toFixed(0)}. Please clear your debt before booking a new ride.`,
              "DEBT_OUTSTANDING",
              402
            );
          }

          const rideId = generateId();

          if (paymentMethod === "wallet" && isBargaining) {
            const balance = parseFloat(lockedUser?.walletBalance ?? "0");
            if (balance < fareToCharge) {
              throw new RideApiError(
                `Insufficient wallet balance. Required: Rs. ${fareToCharge.toFixed(0)}, Available: Rs. ${balance.toFixed(0)}`,
                "INSUFFICIENT_BALANCE",
                402
              );
            }
            const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
            if (!walletEnabled)
              throw new RideApiError(
                "Wallet payments are currently disabled",
                "WALLET_DISABLED",
                503
              );
            const [reserved] = await tx
              .update(usersTable)
              .set({ walletBalance: sql`wallet_balance - ${fareToCharge.toFixed(2)}` })
              .where(
                and(
                  eq(usersTable.id, userId),
                  gte(usersTable.walletBalance, fareToCharge.toFixed(2))
                )
              )
              .returning({ id: usersTable.id });
            if (!reserved)
              throw new RideApiError(
                `Insufficient wallet balance. Required: Rs. ${fareToCharge.toFixed(0)}`,
                "INSUFFICIENT_BALANCE",
                402
              );
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId,
              type: "debit",
              amount: fareToCharge.toFixed(2),
              description: `${type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ")} ride reservation (bargain)`,
              reference: `ride:${rideId}`,
            });
          }

          let resolvedPoolGroupId: string | undefined;
          if (isPoolRide && !isBargaining && !isScheduled) {
            const windowStart = new Date(Date.now() - POOL_WINDOW_MIN * 60_000);
            const existingPools = await tx
              .select({ poolGroupId: ridesTable.poolGroupId, id: ridesTable.id })
              .from(ridesTable)
              .where(
                and(
                  eq(ridesTable.isPoolRide, true),
                  eq(ridesTable.type, type),
                  sql`status IN ('searching', 'bargaining')`,
                  sql`pool_group_id IS NOT NULL`,
                  sql`created_at >= ${windowStart.toISOString()}`,
                  sql`ABS(CAST(pickup_lat AS FLOAT) - ${pickupLat}) < ${POOL_RADIUS_DEG}`,
                  sql`ABS(CAST(pickup_lng AS FLOAT) - ${pickupLng}) < ${POOL_RADIUS_DEG}`,
                  sql`ABS(CAST(drop_lat AS FLOAT) - ${dropLat}) < ${POOL_RADIUS_DEG}`,
                  sql`ABS(CAST(drop_lng AS FLOAT) - ${dropLng}) < ${POOL_RADIUS_DEG}`
                )
              )
              .for("update")
              .limit(10);
            if (existingPools.length > 0) {
              const groupIds = [
                ...new Set(existingPools.map((r) => r.poolGroupId).filter(Boolean)),
              ] as string[];
              for (const gid of groupIds) {
                const [countRow] = await tx
                  .select({ c: count() })
                  .from(ridesTable)
                  .where(
                    and(eq(ridesTable.poolGroupId, gid), sql`status IN ('searching', 'bargaining')`)
                  );
                if ((countRow?.c ?? 0) < MAX_POOL_SIZE) {
                  resolvedPoolGroupId = gid;
                  break;
                }
              }
            }
            if (!resolvedPoolGroupId) resolvedPoolGroupId = generateId();
          }

          const scheduledStatus2 = isScheduled ? "scheduled" : rideStatus;
          const [ride] = await tx
            .insert(ridesTable)
            .values({
              id: rideId,
              userId,
              type,
              status: scheduledStatus2,
              pickupAddress,
              dropAddress,
              pickupLat: String(pickupLat),
              pickupLng: String(pickupLng),
              dropLat: String(dropLat),
              dropLng: String(dropLng),
              fare: fareToStore,
              distance: (Math.round(distance * 10) / 10).toString(),
              paymentMethod,
              offeredFare: isBargaining ? validatedOffer.toFixed(2) : null,
              counterFare: null,
              bargainStatus: isBargaining ? "customer_offered" : null,
              bargainRounds: isBargaining ? 1 : 0,
              bargainNote: bargainNote || null,
              isParcel: isParcel ?? false,
              receiverName: receiverName || null,
              receiverPhone: receiverPhone || null,
              packageType: packageType || null,
              isScheduled: isScheduled ?? false,
              scheduledAt: scheduledAtDate ?? null,
              stops: stops ? stops : null,
              isPoolRide: isPoolRide ?? false,
              poolGroupId: resolvedPoolGroupId ?? null,
            })
            .returning();
          return ride!;
        });
      }

      const bookLang = await getUserLanguage(userId);
      const bookTitle = isBargaining
        ? t("notifRideOfferSent", bookLang) + " 💬"
        : t("notifRideBooked", bookLang);
      const bookBody = isBargaining
        ? t("notifRideOfferBody", bookLang).replace("{fare}", String(validatedOffer))
        : t("notifRideBookedBody", bookLang).replace("{fare}", fareToCharge.toFixed(0));
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId,
          title: bookTitle,
          body: bookBody,
          type: "ride",
          icon:
            (
              {
                bike: "bicycle-outline",
                car: "car-outline",
                rickshaw: "car-outline",
                daba: "bus-outline",
                school_shift: "bus-outline",
              } as Record<string, string>
            )[type] ?? "car-outline",
          link: `/ride`,
        })
        .catch((e: Error) =>
          logger.warn(
            { userId, rideId: rideRecord?.id, err: e.message },
            "[rides/book] booking notification insert failed"
          )
        );

      if (rideRecord && !isScheduled) {
        void broadcastRide(rideRecord.id);
        emitRideDispatchUpdate({ rideId: rideRecord.id, action: "new", status: rideRecord.status });
        emitRideUpdate(rideRecord.id);
      } else if (rideRecord && isScheduled) {
        emitRideDispatchUpdate({ rideId: rideRecord.id, action: "new", status: "scheduled" });
        emitRideUpdate(rideRecord.id);
      }

      const ridePayload = {
        ...formatRide(rideRecord),
        baseFare,
        gstAmount,
        platformFare,
        effectiveFare: fareToCharge,
        isBargaining,
        isScheduled: !!isScheduled,
        scheduledAt: scheduledAtDate?.toISOString() ?? null,
      };

      /* Persist idempotency record BEFORE sending response to eliminate replay race */
      if (idempotencyLockHeld && idempotencyScopedKey) {
        await db
          .update(idempotencyKeysTable)
          .set({ responseData: JSON.stringify(ridePayload) })
          .where(
            and(
              eq(idempotencyKeysTable.userId, userId),
              eq(idempotencyKeysTable.idempotencyKey, idempotencyScopedKey)
            )
          )
          .catch((e: Error) =>
            logger.warn({ err: e.message }, "[rides/book] idempotency record update failed")
          );
      }

      bookingSucceeded = true;
      sendCreated(res, ridePayload);
    } catch (e: unknown) {
      const status = e instanceof RideApiError ? e.httpStatus : 400;
      const code = e instanceof RideApiError ? e.code : "BOOKING_FAILED";
      if (!(e instanceof RideApiError)) {
        logger.error({ err: e }, "[rides/book] unexpected error during ride booking");
      }
      sendErrorWithData(
        res,
        e instanceof RideApiError ? (e as Error).message : "An internal error occurred",
        { code },
        status
      );
    } finally {
      /* Release in-flight lock on ALL non-success exits (validation failures,
       active-ride conflicts, geofence rejections, thrown errors, etc.) so the
       client can retry with the same key after fixing the request. */
      if (idempotencyLockHeld && !bookingSucceeded) {
        await releaseIdempotencyLock();
      }
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

router.patch(
  "/:id/cancel",
  customerAuth,
  cancelRideLimiter,
  requireRideState(["searching", "bargaining", "accepted", "arrived"]),
  requireRideOwner("userId"),
  async (req, res) => {
    try {
      const userId = req.customerId!;
      const ride = req.ride!;
      const cancelParsed = cancelRideSchema.safeParse(req.body ?? {});
      if (!cancelParsed.success) {
        const msg = cancelParsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        sendError(res, msg, 422);
        return;
      }
      const cancelReason = cancelParsed.data.reason ?? null;

      await cleanupNotifiedRiders(String(req.params["id"] as string));
      const s = await getCachedSettings();
      const cancelFee = parseFloat(s["ride_cancellation_fee"] ?? "30");
      const riderAssigned = ["accepted", "arrived", "in_transit"].includes(ride.status);

      let actualCancelFee = 0;
      let cancelFeeAsDebt = false;

      let walletNetDebit = 0;
      if (ride.paymentMethod === "wallet") {
        const rideRef = `ride:${ride.id}`;
        const txns = await db
          .select({ type: walletTransactionsTable.type, amount: walletTransactionsTable.amount })
          .from(walletTransactionsTable)
          .where(
            and(
              eq(walletTransactionsTable.userId, userId),
              eq(walletTransactionsTable.reference, rideRef)
            )
          );
        for (const t of txns) {
          const amt = parseFloat(t.amount);
          if (t.type === "debit") walletNetDebit += amt;
          else if (t.type === "credit") walletNetDebit -= amt;
        }
      }

      const cancelResult = await db.transaction(async (tx) => {
        const [upd] = await tx
          .update(ridesTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(
              eq(ridesTable.id, String(req.params["id"] as string)),
              eq(ridesTable.userId, userId)
            )
          )
          .returning();

        await tx
          .update(rideBidsTable)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(
            and(
              eq(rideBidsTable.rideId, String(req.params["id"] as string)),
              eq(rideBidsTable.status, "pending")
            )
          );

        if (walletNetDebit > 0) {
          await tx
            .update(usersTable)
            .set({
              walletBalance: sql`wallet_balance + ${walletNetDebit.toFixed(2)}`,
              updatedAt: new Date(),
            })
            .where(eq(usersTable.id, userId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId,
            type: "credit",
            amount: walletNetDebit.toFixed(2),
            description: `Ride refund — #${ride.id.slice(-6).toUpperCase()} cancelled`,
            reference: `ride:${ride.id}`,
          });
        }

        if (riderAssigned && cancelFee > 0) {
          const [user] = await tx
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1);
          if (user) {
            const balance = parseFloat(user.walletBalance ?? "0");
            if (balance >= cancelFee) {
              const [feeDeducted] = await tx
                .update(usersTable)
                .set({ walletBalance: sql`wallet_balance - ${cancelFee.toFixed(2)}` })
                .where(
                  and(
                    eq(usersTable.id, userId),
                    gte(usersTable.walletBalance, cancelFee.toFixed(2))
                  )
                )
                .returning({ id: usersTable.id });
              if (feeDeducted) {
                actualCancelFee = cancelFee;
                await tx.insert(walletTransactionsTable).values({
                  id: generateId(),
                  userId,
                  type: "debit",
                  amount: cancelFee.toFixed(2),
                  description: `Ride cancellation fee — #${ride.id.slice(-6).toUpperCase()}`,
                });
              } else {
                cancelFeeAsDebt = true;
              }
            } else if (balance > 0) {
              actualCancelFee = balance;
              cancelFeeAsDebt = true;
              await tx
                .update(usersTable)
                .set({ walletBalance: "0" })
                .where(eq(usersTable.id, userId));
              await tx.insert(walletTransactionsTable).values({
                id: generateId(),
                userId,
                type: "debit",
                amount: balance.toFixed(2),
                description: `Ride cancellation fee (partial, Rs.${(cancelFee - balance).toFixed(0)} as debt) — #${ride.id.slice(-6).toUpperCase()}`,
              });
            } else {
              cancelFeeAsDebt = true;
            }
          }
        }

        if (cancelFeeAsDebt) {
          const remainingDebt = cancelFee - actualCancelFee;
          await tx
            .update(usersTable)
            .set({
              cancellationDebt: sql`cancellation_debt + ${remainingDebt}`,
              updatedAt: new Date(),
            })
            .where(eq(usersTable.id, userId));
        }

        return upd;
      });

      const [postCancelUser] = await db
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (postCancelUser)
        broadcastWalletUpdate(userId, parseFloat(postCancelUser.walletBalance ?? "0"));

      const cancelLang = await getUserLanguage(userId);
      if (walletNetDebit > 0) {
        const refundAmt = walletNetDebit;
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId,
            title: t("notifWalletCredited", cancelLang) + " 💰",
            body:
              actualCancelFee > 0
                ? t("notifRideRefundWithFeeBody", cancelLang)
                    .replace("{refund}", refundAmt.toFixed(0))
                    .replace("{fee}", String(actualCancelFee))
                : t("notifRideRefundBody", cancelLang).replace("{refund}", refundAmt.toFixed(0)),
            type: "ride",
            icon: "wallet-outline",
          })
          .catch((e: Error) =>
            logger.warn(
              { userId, rideId: ride.id, err: e.message },
              "[rides/cancel] refund notification insert failed"
            )
          );
      } else if (ride.status === "bargaining" || ride.bargainStatus === "customer_offered") {
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId,
            title: t("notifRideOfferSent", cancelLang),
            body: t("notifRideCancelledBody", cancelLang),
            type: "ride",
            icon: "close-circle-outline",
          })
          .catch((e: Error) =>
            logger.warn(
              { userId, rideId: ride.id, err: e.message },
              "[rides/cancel] bargain-cancel notification insert failed"
            )
          );
      } else {
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId,
            title: t("notifRideCancelled", cancelLang),
            body:
              riderAssigned && cancelFee > 0
                ? cancelFeeAsDebt
                  ? t("notifRideCancelledFeeDebtBody" as TranslationKey, cancelLang).replace(
                      "{fee}",
                      String(cancelFee)
                    )
                  : t("notifRideCancelledFeeBody" as TranslationKey, cancelLang).replace(
                      "{fee}",
                      String(cancelFee)
                    )
                : t("notifRideCancelledBody", cancelLang),
            type: "ride",
            icon: "close-circle-outline",
          })
          .catch((e: Error) =>
            logger.warn(
              { userId, rideId: ride.id, err: e.message },
              "[rides/cancel] cancel notification insert failed"
            )
          );
      }

      if (cancelReason) {
        req.log?.info({ rideId: ride.id, cancelReason }, "Ride cancelled with reason");
      }

      emitRideDispatchUpdate({ rideId: ride.id, action: "cancel", status: "cancelled" });
      emitRideUpdate(ride.id);
      sendSuccess(res, {
        ...formatRide(cancelResult!),
        cancellationFee: actualCancelFee,
        cancelFeeAsDebt,
        cancelReason,
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
  }
);

router.patch("/:id/bids/:bidId/reject", customerAuth, async (req, res) => {
  try {
    const rideId = String(req.params["id"] as string);
    const bidId = String(req.params["bidId"] as string);
    const userId = req.customerId!;

    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.userId, userId)))
      .limit(1);

    if (!ride) {
      sendError(res, "Ride not found", 404);
      return;
    }
    if (ride.status !== "bargaining") {
      sendError(res, "Ride is not in bargaining state", 400);
      return;
    }

    const [bid] = await db
      .select()
      .from(rideBidsTable)
      .where(
        and(
          eq(rideBidsTable.id, bidId),
          eq(rideBidsTable.rideId, rideId),
          eq(rideBidsTable.status, "pending")
        )
      )
      .limit(1);

    if (!bid) {
      sendError(res, "Bid not found or already resolved", 404);
      return;
    }

    await db
      .update(rideBidsTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(rideBidsTable.id, bidId), eq(rideBidsTable.rideId, rideId)));

    emitRideUpdate(rideId);
    sendSuccess(res, { bidId, status: "rejected" });
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

router.patch("/:id/accept-bid", customerAuth, async (req, res) => {
  try {
    const parsed = acceptBidSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, "bidId required");
      return;
    }

    const userId = req.customerId!;
    const { bidId } = parsed.data;
    const rideId = String(req.params["id"] as string);

    const [debtUserBid] = await db
      .select({ cancellationDebt: usersTable.cancellationDebt })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const bidDebt = parseFloat(debtUserBid?.cancellationDebt ?? "0");
    if (bidDebt > 0) {
      sendErrorWithData(
        res,
        `You have an outstanding cancellation fee debt of Rs. ${bidDebt.toFixed(0)}. Please clear your debt before accepting a ride.`,
        { debtAmount: bidDebt },
        402
      );
      return;
    }

    let updated:
      | { rideUpdate: typeof ridesTable.$inferSelect; bid: typeof rideBidsTable.$inferSelect }
      | undefined;
    try {
      updated = await db.transaction(async (tx) => {
        const [ride] = await tx
          .select()
          .from(ridesTable)
          .where(eq(ridesTable.id, rideId))
          .for("update")
          .limit(1);

        if (!ride) throw new RideApiError("Ride not found", "RIDE_NOT_FOUND", 404);
        if (ride.userId !== userId)
          throw new RideApiError("Not your ride", "RIDE_ACCESS_DENIED", 403);
        if (ride.status !== "bargaining")
          throw new RideApiError("Ride is not in bargaining state", "RIDE_NOT_BARGAINING", 400);

        const [bid] = await tx
          .select()
          .from(rideBidsTable)
          .where(
            and(
              eq(rideBidsTable.id, bidId),
              eq(rideBidsTable.rideId, rideId),
              eq(rideBidsTable.status, "pending"),
              gte(rideBidsTable.expiresAt, new Date())
            )
          )
          .limit(1);
        if (!bid)
          throw new RideApiError(
            "Bid has expired or is no longer pending",
            "BID_EXPIRED_OR_NOT_FOUND",
            404
          );

        const agreedFare = parseFloat(bid.fare);

        if (ride.paymentMethod === "wallet") {
          const rideRef = `ride:${rideId}`;
          const [existingDebit] = await tx
            .select({ id: walletTransactionsTable.id, amount: walletTransactionsTable.amount })
            .from(walletTransactionsTable)
            .where(
              and(
                eq(walletTransactionsTable.userId, userId),
                eq(walletTransactionsTable.type, "debit"),
                eq(walletTransactionsTable.reference, rideRef)
              )
            )
            .limit(1);

          if (existingDebit) {
            const reservedAmt = parseFloat(existingDebit.amount);
            if (agreedFare > reservedAmt) {
              const diff = agreedFare - reservedAmt;
              const [topUp] = await tx
                .update(usersTable)
                .set({ walletBalance: sql`wallet_balance - ${diff.toFixed(2)}` })
                .where(
                  and(eq(usersTable.id, userId), gte(usersTable.walletBalance, diff.toFixed(2)))
                )
                .returning({ id: usersTable.id });
              if (!topUp)
                throw new RideApiError(
                  `Insufficient wallet balance. Need additional Rs. ${diff.toFixed(0)}`,
                  "INSUFFICIENT_BALANCE",
                  402
                );
              await tx.insert(walletTransactionsTable).values({
                id: generateId(),
                userId,
                type: "debit",
                amount: diff.toFixed(2),
                description: `Ride fare adjustment (bargained) — #${rideId.slice(-6).toUpperCase()}`,
                reference: rideRef,
              });
            } else if (agreedFare < reservedAmt) {
              const refund = reservedAmt - agreedFare;
              await tx
                .update(usersTable)
                .set({ walletBalance: sql`wallet_balance + ${refund.toFixed(2)}` })
                .where(eq(usersTable.id, userId));
              await tx.insert(walletTransactionsTable).values({
                id: generateId(),
                userId,
                type: "credit",
                amount: refund.toFixed(2),
                description: `Fare difference refund (bargained) — #${rideId.slice(-6).toUpperCase()}`,
                reference: rideRef,
              });
            }
          } else {
            const [deducted] = await tx
              .update(usersTable)
              .set({ walletBalance: sql`wallet_balance - ${agreedFare.toFixed(2)}` })
              .where(
                and(eq(usersTable.id, userId), gte(usersTable.walletBalance, agreedFare.toFixed(2)))
              )
              .returning({ id: usersTable.id });
            if (!deducted)
              throw new RideApiError(
                `Insufficient wallet balance. Need Rs. ${agreedFare.toFixed(0)}`,
                "INSUFFICIENT_BALANCE",
                402
              );
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId,
              type: "debit",
              amount: agreedFare.toFixed(2),
              description: `Ride payment (bargained) — #${rideId.slice(-6).toUpperCase()}`,
              reference: rideRef,
            });
          }
        }

        const [rideUpdate] = await tx
          .update(ridesTable)
          .set({
            status: "accepted",
            riderId: bid.riderId,
            riderName: bid.riderName,
            riderPhone: bid.riderPhone,
            fare: agreedFare.toFixed(2),
            counterFare: agreedFare.toFixed(2),
            bargainStatus: "agreed",
            acceptedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(ridesTable.id, rideId),
              eq(ridesTable.userId, userId),
              eq(ridesTable.status, "bargaining")
            )
          )
          .returning();

        if (!rideUpdate)
          throw new RideApiError(
            "Ride is no longer available for acceptance",
            "RIDE_UNAVAILABLE",
            409
          );

        const bidUpdateResult = await tx
          .update(rideBidsTable)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(and(eq(rideBidsTable.id, bidId), eq(rideBidsTable.status, "pending")))
          .returning();

        if (bidUpdateResult.length === 0)
          throw new RideApiError("Bid is no longer available", "BID_UNAVAILABLE", 409);

        await tx
          .update(rideBidsTable)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(
            and(
              eq(rideBidsTable.rideId, rideId),
              eq(rideBidsTable.status, "pending"),
              ne(rideBidsTable.id, bidId)
            )
          );

        return { rideUpdate, bid };
      });
    } catch (e: unknown) {
      const status = e instanceof RideApiError ? e.httpStatus : 400;
      const code = e instanceof RideApiError ? e.code : "ACCEPT_BID_FAILED";
      if (!(e instanceof RideApiError)) {
        logger.error(
          { err: e, rideId, bidId },
          "[accept-bid] unexpected error during bid acceptance transaction"
        );
      }
      sendErrorWithData(
        res,
        e instanceof RideApiError ? (e as Error).message : "An internal error occurred",
        { code },
        status
      );
      return;
    }

    const { rideUpdate, bid } = updated;
    const agreedFare = parseFloat(bid.fare);

    const otp = generateOtp();
    await db
      .update(ridesTable)
      .set({ tripOtp: otp, updatedAt: new Date() })
      .where(eq(ridesTable.id, rideUpdate!.id))
      .catch((e: Error) =>
        logger.error(
          { rideId: rideUpdate!.id, err: e.message },
          "[rides/accept-bid] tripOtp DB update failed"
        )
      );
    emitRideOtp(rideUpdate!.userId, rideUpdate!.id, otp, rideUpdate!.riderId);

    const bidLang = await getUserLanguage(bid.riderId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: bid.riderId,
        title: t("notifRideAccepted", bidLang) + " 🎉",
        body: t("notifRideAcceptedBody", bidLang).replace("{fare}", agreedFare.toFixed(0)),
        type: "ride",
        icon: "checkmark-circle-outline",
      })
      .catch((e: Error) =>
        logger.warn(
          { rideId: rideUpdate!.id, riderId: bid.riderId, err: e.message },
          "[rides/accept-bid] notification insert failed"
        )
      );
    sendPushToUser(bid.riderId, {
      title: "Offer Accepted! 🎉",
      body: `Your offer of Rs. ${agreedFare.toFixed(0)} was accepted. Head to the pickup point now.`,
      tag: `offer-accepted-${rideUpdate!.id}`,
      data: { rideId: rideUpdate!.id },
    }).catch((e: Error) =>
      logger.warn(
        { rideId: rideUpdate!.id, riderId: bid.riderId, err: e.message },
        "[rides/accept-bid] push notification failed"
      )
    );

    emitRideDispatchUpdate({ rideId: rideUpdate!.id, action: "accepted", status: "accepted" });
    emitRideUpdate(rideUpdate!.id);
    sendSuccess(res, { ...formatRide(rideUpdate!), agreedFare, tripOtp: otp });
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

router.patch(
  "/:id/customer-counter",
  bargainLimiter,
  customerAuth,
  requireRideState(["bargaining"]),
  requireRideOwner("userId"),
  async (req, res) => {
    try {
      const parsed = customerCounterSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        sendError(res, msg, 422);
        return;
      }

      const ride = req.ride!;
      const rideId = ride.id;
      const userId = req.customerId!;
      const { offeredFare: newOffer, note } = parsed.data;

      const s = await getCachedSettings();
      const bargainMinPct = parseFloat(s["ride_bargaining_min_pct"] ?? "70");
      const platformFare = parseFloat(ride.fare);

      const maxFare = parseFloat(s["ride_max_fare"] ?? "100000");
      if (newOffer > maxFare) {
        sendErrorWithData(
          res,
          `Offered fare cannot exceed Rs. ${maxFare.toFixed(0)}`,
          { code: "FARE_ABOVE_MAX" },
          422
        );
        return;
      }
      const maxMultiplier = parseFloat(s["ride_counter_offer_max_multiplier"] ?? "3");
      if (platformFare > 0 && newOffer > platformFare * maxMultiplier) {
        sendErrorWithData(
          res,
          `Offered fare cannot exceed ${maxMultiplier}× the platform fare (Rs. ${(platformFare * maxMultiplier).toFixed(0)})`,
          { code: "FARE_ABOVE_MAX" },
          422
        );
        return;
      }

      const psMin = s[`ride_${ride.type}_min_fare`];
      let serviceMinFare = psMin ? parseFloat(psMin) : 0;
      if (!serviceMinFare || !isFinite(serviceMinFare)) {
        const [svc] = await db
          .select({ minFare: rideServiceTypesTable.minFare })
          .from(rideServiceTypesTable)
          .where(eq(rideServiceTypesTable.key, ride.type))
          .limit(1);
        serviceMinFare = svc ? parseFloat(svc.minFare ?? "0") : 0;
      }
      if (serviceMinFare > 0 && newOffer < serviceMinFare) {
        sendErrorWithData(
          res,
          `Offered fare cannot be lower than the minimum fare of Rs. ${serviceMinFare.toFixed(0)} for this service`,
          { code: "FARE_BELOW_MIN" },
          422
        );
        return;
      }

      const minOffer = Math.ceil(platformFare * (bargainMinPct / 100));
      if (newOffer < minOffer) {
        sendErrorWithData(
          res,
          `Minimum offer is Rs. ${minOffer} (${bargainMinPct}% of platform fare)`,
          { code: "FARE_OUT_OF_RANGE" },
          422
        );
        return;
      }

      await db
        .update(rideBidsTable)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(and(eq(rideBidsTable.rideId, rideId), eq(rideBidsTable.status, "pending")));

      const currentRounds = ride.bargainRounds ?? 0;
      const [updated] = await db
        .update(ridesTable)
        .set({
          offeredFare: newOffer.toFixed(2),
          counterFare: null,
          bargainStatus: "customer_offered",
          bargainRounds: currentRounds + 1,
          bargainNote: note || ride.bargainNote,
          status: "bargaining",
          riderId: null,
          riderName: null,
          riderPhone: null,
          updatedAt: new Date(),
        })
        .where(and(eq(ridesTable.id, rideId), eq(ridesTable.userId, userId)))
        .returning();

      emitRideUpdate(rideId);
      sendSuccess(res, formatRide(updated!));
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
  }
);

router.get("/", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const statusFilter = req.query["status"] as string | undefined;

    const baseQuery = db.select().from(ridesTable);
    const rides = await (statusFilter === "active"
      ? baseQuery.where(
          and(
            eq(ridesTable.userId, userId),
            sql`status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit')`
          )
        )
      : baseQuery.where(eq(ridesTable.userId, userId)).orderBy(ridesTable.createdAt));

    const formatted = await Promise.all(
      rides.map(async (r) => {
        const base = formatRide(r);
        let fareBreakdown: { baseFare: number; gstAmount: number } | null = null;
        if (
          r.distance &&
          r.type &&
          ["completed", "dropped_off"].includes(r.status) &&
          statusFilter !== "active"
        ) {
          try {
            const computed = await calcFare(parseFloat(String(r.distance)), r.type);
            fareBreakdown = { baseFare: computed.baseFare, gstAmount: computed.gstAmount };
          } catch (err) {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "[rides/booking] calcFare non-fatal — fareBreakdown omitted from history entry"
            );
          }
        }
        return { ...base, fareBreakdown };
      })
    );

    const result = statusFilter === "active" ? formatted : formatted.reverse();
    sendSuccess(res, {
      rides: result,
      total: result.length,
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

router.get("/payment-methods", async (_req, res) => {
  try {
    const s = await getCachedSettings();
    const rideAllowed = (newKey: string, legacyKey: string, legacyDefault: string): boolean => {
      if (s[newKey] !== undefined) return s[newKey] === "on";
      return (s[legacyKey] ?? legacyDefault) === "on";
    };
    const methods: { key: string; label: string; enabled: boolean }[] = [
      {
        key: "cash",
        label: "Cash",
        enabled:
          rideAllowed("cod_allowed_rides", "ride_payment_cash", "on") &&
          (s["cod_enabled"] ?? "on") === "on" &&
          (s["rider_cash_allowed"] ?? "on") === "on",
      },
      {
        key: "wallet",
        label: "Wallet",
        enabled:
          rideAllowed("wallet_allowed_rides", "ride_payment_wallet", "on") &&
          (s["feature_wallet"] ?? "on") === "on",
      },
      {
        key: "jazzcash",
        label: "JazzCash",
        enabled:
          rideAllowed("jazzcash_allowed_rides", "ride_payment_jazzcash", "off") &&
          (s["jazzcash_enabled"] ?? "off") === "on",
      },
      {
        key: "easypaisa",
        label: "EasyPaisa",
        enabled:
          rideAllowed("easypaisa_allowed_rides", "ride_payment_easypaisa", "off") &&
          (s["easypaisa_enabled"] ?? "off") === "on",
      },
    ];
    sendSuccess(res, { methods: methods.filter((m) => m.enabled) });
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

router.get("/pool/:groupId", customerAuth, async (req, res) => {
  try {
    const groupId = String(req.params["groupId"] as string);
    const callerId = req.customerId!;

    const membership = await db
      .select({ id: ridesTable.id })
      .from(ridesTable)
      .where(and(eq(ridesTable.poolGroupId, groupId), eq(ridesTable.userId, callerId)))
      .limit(1);
    if (membership.length === 0) {
      return sendForbidden(res, "Access denied");
    }

    const rides = await db
      .select({
        id: ridesTable.id,
        userId: ridesTable.userId,
        pickupAddress: ridesTable.pickupAddress,
        dropAddress: ridesTable.dropAddress,
        status: ridesTable.status,
        fare: ridesTable.fare,
        paymentMethod: ridesTable.paymentMethod,
        stops: ridesTable.stops,
        createdAt: ridesTable.createdAt,
      })
      .from(ridesTable)
      .where(eq(ridesTable.poolGroupId, groupId))
      .orderBy(ridesTable.createdAt);

    const sanitizedRides = rides.map((ride) => {
      if (ride.userId === callerId) return ride;
      const {
        userId: _u,
        pickupAddress: _p,
        dropAddress: _d,
        stops: _s,
        paymentMethod: _pm,
        ...safeFields
      } = ride;
      return safeFields;
    });

    sendSuccess(res, { groupId, rides: sanitizedRides, passengerCount: rides.length });
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

export default router;
