import { Router } from "express";
import {
  adminAuth,
  and,
  asc,
  broadcastRide,
  calcDistance,
  calcFare,
  cleanupNotifiedRiders,
  count,
  customerAuth,
  db,
  emitRideUpdate,
  eq,
  eventLogSchema,
  formatRide,
  generateId,
  getCachedSettings,
  getUserLanguage,
  gte,
  liveLocationsTable,
  loadRide,
  logger,
  notificationsTable,
  onRideUpdate,
  rateRideSchema,
  requireRideOwner,
  requireRideState,
  rideBidsTable,
  rideEventLogsTable,
  rideNotifiedRidersTable,
  rideRatingsTable,
  riderAuth,
  riderProfilesTable,
  ridesTable,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
  sql,
  t,
  usersTable,
  verifyOwnership,
} from "./helpers.js";

const router = Router();

/* ── SSE: max concurrent streams per ride ── */
const _sseCounts = new Map<string, number>();
const SSE_MAX_PER_RIDE = 5;
const SSE_HEARTBEAT_MS = 25_000;

async function buildRideSSEPayload(rideId: string): Promise<Record<string, unknown> | null> {
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) return null;

  let riderName = ride.riderName;
  let riderPhone = ride.riderPhone;
  if (ride.riderId && !riderName) {
    const [riderUser] = await db
      .select({ name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, ride.riderId))
      .limit(1);
    riderName = riderUser?.name || null;
    riderPhone = riderUser?.phone || null;
  }

  const bids =
    ride.status === "bargaining"
      ? await db
          .select()
          .from(rideBidsTable)
          .where(
            and(
              eq(rideBidsTable.rideId, rideId),
              eq(rideBidsTable.status, "pending"),
              gte(rideBidsTable.expiresAt, new Date())
            )
          )
          .orderBy(rideBidsTable.createdAt)
      : [];

  const formattedBids = await Promise.all(
    bids.map(async (b) => {
      const [riderProfile] = await db
        .select({
          vehiclePlate: riderProfilesTable.vehiclePlate,
          vehicleType: riderProfilesTable.vehicleType,
        })
        .from(riderProfilesTable)
        .where(eq(riderProfilesTable.userId, b.riderId))
        .limit(1);

      const ratingRows = await db
        .select({
          starsAvg: sql<string>`AVG(stars)`,
          total: sql<string>`COUNT(*)`,
        })
        .from(rideRatingsTable)
        .where(eq(rideRatingsTable.riderId, b.riderId));

      const ratingAvg = ratingRows[0]?.starsAvg
        ? Math.round(parseFloat(ratingRows[0].starsAvg) * 10) / 10
        : null;
      const totalRides = ratingRows[0]?.total ? parseInt(ratingRows[0].total, 10) : 0;

      return {
        ...b,
        fare: parseFloat(b.fare),
        vehiclePlate: riderProfile?.vehiclePlate ?? null,
        vehicleType: riderProfile?.vehicleType ?? null,
        ratingAvg,
        totalRides,
        expiresAt: b.expiresAt instanceof Date ? b.expiresAt.toISOString() : b.expiresAt,
        createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
        updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt,
      };
    })
  );

  let riderLat: number | null = null;
  let riderLng: number | null = null;
  let riderLocAge: number | null = null;
  let riderAvgRating: number | null = null;
  const ACTIVE_STATUSES = ["accepted", "arrived", "in_transit"];
  if (ride.riderId) {
    if (ACTIVE_STATUSES.includes(ride.status)) {
      const [loc] = await db
        .select()
        .from(liveLocationsTable)
        .where(eq(liveLocationsTable.userId, ride.riderId))
        .limit(1);
      if (loc) {
        riderLat = parseFloat(String(loc.latitude));
        riderLng = parseFloat(String(loc.longitude));
        riderLocAge = Math.floor((Date.now() - new Date(loc.updatedAt).getTime()) / 1000);
      }
    }
    const ratingRows = await db
      .select({ starsAvg: sql<string>`AVG(stars)` })
      .from(rideRatingsTable)
      .where(eq(rideRatingsTable.riderId, ride.riderId));
    riderAvgRating = ratingRows[0]?.starsAvg
      ? Math.round(parseFloat(ratingRows[0].starsAvg) * 10) / 10
      : null;
  }

  let fareBreakdown: { baseFare: number; gstAmount: number } | null = null;
  if (ride.distance && ride.type) {
    try {
      const computed = await calcFare(parseFloat(String(ride.distance)), ride.type);
      fareBreakdown = { baseFare: computed.baseFare, gstAmount: computed.gstAmount };
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[rides/tracking] calcFare non-fatal — fareBreakdown omitted from SSE payload"
      );
    }
  }

  return {
    ...formatRide(ride as Record<string, unknown>),
    riderName,
    riderPhone,
    bids: formattedBids,
    riderLat,
    riderLng,
    riderLocAge,
    riderAvgRating,
    fareBreakdown,
  };
}

router.get("/:id/stream", customerAuth, async (req, res, next) => {
  try {
    const callerId = req.customerId!;
    const rideId = String(req.params["id"] as string);

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) {
      sendNotFound(res, "Ride not found");
      return;
    }

    const isOwner = ride.userId === callerId;
    const isAssignedRider = ride.riderId === callerId;
    if (!isOwner && !isAssignedRider) {
      sendForbidden(res, "Access denied — not your ride");
      return;
    }

    const current = _sseCounts.get(rideId) ?? 0;
    if (current >= SSE_MAX_PER_RIDE) {
      res.status(429).json({ error: "Too many concurrent streams for this ride" });
      return;
    }
    _sseCounts.set(rideId, current + 1);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let cleaned = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let unsubscribeFn: (() => void) | null = null;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (heartbeatTimer != null) clearInterval(heartbeatTimer);
      if (unsubscribeFn != null) unsubscribeFn();
      const n = _sseCounts.get(rideId) ?? 1;
      if (n <= 1) _sseCounts.delete(rideId);
      else _sseCounts.set(rideId, n - 1);
    };

    const pushUpdate = async () => {
      try {
        const payload = await buildRideSSEPayload(rideId);
        if (!payload) return;
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        const status = payload["status"] as string | undefined;
        if (status === "completed" || status === "cancelled") {
          cleanup();
          res.end();
        }
      } catch (err) {
        logger.warn({ err, rideId }, "SSE ride: failed to push update");
      }
    };

    req.on("close", cleanup);

    await pushUpdate();
    if (cleaned) return;
    unsubscribeFn = onRideUpdate(rideId, () => {
      pushUpdate().catch((e: Error) =>
        logger.warn({ rideId, err: e.message }, "[rides/stream] pushUpdate failed")
      );
    });
    heartbeatTimer = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch (err) {
        logger.debug(
          { rideId, err: err instanceof Error ? err.message : String(err) },
          "[rides/stream] SSE heartbeat write failed — client likely disconnected"
        );
      }
    }, SSE_HEARTBEAT_MS);
  } catch (err) {
    if (res.headersSent) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[rides/stream] SSE error after headers sent"
      );
      try {
        res.end();
      } catch (err) {
        logger.warn({ err }, "[rides/stream] res.end failed");
      }
    } else {
      next(err);
    }
  }
});

router.get("/:id", customerAuth, verifyOwnership("ride"), async (req, res, next) => {
  try {
    const callerId = req.customerId!;

    const rideId = String(req.params["id"] as string);
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) {
      sendNotFound(res, "Ride not found");
      return;
    }

    const isCustomer = ride.userId === callerId;
    const isRider = ride.riderId === callerId;
    if (!isCustomer && !isRider) {
      sendForbidden(res, "Access denied — not your ride");
      return;
    }

    let riderName = ride.riderName;
    let riderPhone = ride.riderPhone;
    if (ride.riderId && !riderName) {
      const [riderUser] = await db
        .select({ name: usersTable.name, phone: usersTable.phone })
        .from(usersTable)
        .where(eq(usersTable.id, ride.riderId))
        .limit(1);
      riderName = riderUser?.name || null;
      riderPhone = riderUser?.phone || null;
    }

    const bids =
      ride.status === "bargaining"
        ? await db
            .select()
            .from(rideBidsTable)
            .where(
              and(
                eq(rideBidsTable.rideId, rideId),
                eq(rideBidsTable.status, "pending"),
                gte(rideBidsTable.expiresAt, new Date())
              )
            )
            .orderBy(rideBidsTable.createdAt)
        : [];

    const formattedBids = await Promise.all(
      bids.map(async (b) => {
        const [riderProfile] = await db
          .select({
            vehiclePlate: riderProfilesTable.vehiclePlate,
            vehicleType: riderProfilesTable.vehicleType,
          })
          .from(riderProfilesTable)
          .where(eq(riderProfilesTable.userId, b.riderId))
          .limit(1);

        const ratingRows = await db
          .select({
            starsAvg: sql<string>`AVG(stars)`,
            total: sql<string>`COUNT(*)`,
          })
          .from(rideRatingsTable)
          .where(eq(rideRatingsTable.riderId, b.riderId));

        const ratingAvg = ratingRows[0]?.starsAvg
          ? Math.round(parseFloat(ratingRows[0].starsAvg) * 10) / 10
          : null;
        const totalRides = ratingRows[0]?.total ? parseInt(ratingRows[0].total, 10) : 0;

        return {
          ...b,
          fare: parseFloat(b.fare),
          vehiclePlate: riderProfile?.vehiclePlate ?? null,
          vehicleType: riderProfile?.vehicleType ?? null,
          ratingAvg,
          totalRides,
          expiresAt: b.expiresAt instanceof Date ? b.expiresAt.toISOString() : b.expiresAt,
          createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
          updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt,
        };
      })
    );

    let riderLat: number | null = null;
    let riderLng: number | null = null;
    let riderLocAge: number | null = null;
    let riderAvgRating: number | null = null;
    const ACTIVE_STATUSES = ["accepted", "arrived", "in_transit"];
    if (ride.riderId) {
      if (ACTIVE_STATUSES.includes(ride.status)) {
        const [loc] = await db
          .select()
          .from(liveLocationsTable)
          .where(eq(liveLocationsTable.userId, ride.riderId))
          .limit(1);
        if (loc) {
          riderLat = parseFloat(String(loc.latitude));
          riderLng = parseFloat(String(loc.longitude));
          riderLocAge = Math.floor((Date.now() - new Date(loc.updatedAt).getTime()) / 1000);
        }
      }
      const ratingRows = await db
        .select({
          starsAvg: sql<string>`AVG(stars)`,
        })
        .from(rideRatingsTable)
        .where(eq(rideRatingsTable.riderId, ride.riderId));
      riderAvgRating = ratingRows[0]?.starsAvg
        ? Math.round(parseFloat(ratingRows[0].starsAvg) * 10) / 10
        : null;
    }

    let fareBreakdown: { baseFare: number; gstAmount: number } | null = null;
    if (ride.distance && ride.type) {
      try {
        const computed = await calcFare(parseFloat(String(ride.distance)), ride.type);
        fareBreakdown = { baseFare: computed.baseFare, gstAmount: computed.gstAmount };
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[rides/tracking] calcFare non-fatal — fareBreakdown omitted from ride response"
        );
      }
    }

    sendSuccess(res, {
      ...formatRide(ride),
      riderName,
      riderPhone,
      bids: formattedBids,
      riderLat,
      riderLng,
      riderLocAge,
      riderAvgRating,
      fareBreakdown,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/track", customerAuth, async (req, res, next) => {
  try {
    const callerId = req.customerId!;

    const rideId = String(req.params["id"] as string);
    const [ride] = await db
      .select({
        id: ridesTable.id,
        status: ridesTable.status,
        riderId: ridesTable.riderId,
        userId: ridesTable.userId,
        pickupLat: ridesTable.pickupLat,
        pickupLng: ridesTable.pickupLng,
        dropLat: ridesTable.dropLat,
        dropLng: ridesTable.dropLng,
        pickupAddress: ridesTable.pickupAddress,
        dropAddress: ridesTable.dropAddress,
      })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .limit(1);

    if (!ride) {
      sendNotFound(res, "Ride not found");
      return;
    }
    if (ride.userId !== callerId && ride.riderId !== callerId) {
      sendForbidden(res, "Access denied — not your ride");
      return;
    }

    let riderLat: number | null = null;
    let riderLng: number | null = null;
    let riderLocAge: number | null = null;
    let etaMinutes: number | null = null;

    const TRACKABLE = ["accepted", "arrived", "in_transit"];
    if (ride.riderId && TRACKABLE.includes(ride.status)) {
      const [loc] = await db
        .select()
        .from(liveLocationsTable)
        .where(eq(liveLocationsTable.userId, ride.riderId))
        .limit(1);
      if (loc) {
        riderLat = parseFloat(String(loc.latitude));
        riderLng = parseFloat(String(loc.longitude));
        riderLocAge = Math.floor((Date.now() - new Date(loc.updatedAt).getTime()) / 1000);

        const s = await getCachedSettings();
        const avgSpeedKmh = parseFloat(s["dispatch_avg_speed_kmh"] ?? "25");
        const destinationLat =
          ride.status === "in_transit"
            ? ride.dropLat
              ? parseFloat(ride.dropLat)
              : null
            : ride.pickupLat
              ? parseFloat(ride.pickupLat)
              : null;
        const destinationLng =
          ride.status === "in_transit"
            ? ride.dropLng
              ? parseFloat(ride.dropLng)
              : null
            : ride.pickupLng
              ? parseFloat(ride.pickupLng)
              : null;

        if (destinationLat != null && destinationLng != null && avgSpeedKmh > 0) {
          try {
            const distKm = calcDistance(riderLat, riderLng, destinationLat, destinationLng);
            etaMinutes = Math.max(1, Math.round((distKm / avgSpeedKmh) * 60));
          } catch (err) {
            logger.error(
              {
                error: err instanceof Error ? err.message : String(err),
                timestamp: new Date().toISOString(),
              },
              "[route] unhandled error"
            );
            etaMinutes = null;
          }
        }
      }
    }

    const dropLat = ride.dropLat ? parseFloat(ride.dropLat) : null;
    const dropLng = ride.dropLng ? parseFloat(ride.dropLng) : null;
    const pickLat = ride.pickupLat ? parseFloat(ride.pickupLat) : null;
    const pickLng = ride.pickupLng ? parseFloat(ride.pickupLng) : null;

    sendSuccess(res, {
      id: ride.id,
      status: ride.status,
      riderId: ride.riderId,
      pickupLat: pickLat,
      pickupLng: pickLng,
      dropLat: dropLat,
      dropLng: dropLng,
      pickupAddress: ride.pickupAddress,
      dropAddress: ride.dropAddress,
      riderLat,
      riderLng,
      riderLocAge,
      etaMinutes,
      trackable: TRACKABLE.includes(ride.status),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:id/event-log",
  riderAuth,
  loadRide(),
  requireRideOwner("riderId"),
  async (req, res, next) => {
    try {
      const parsed = eventLogSchema.safeParse(req.body);
      if (!parsed.success) {
        sendValidationError(res, parsed.error.issues[0]?.message || "event is required");
        return;
      }

      const ride = req.ride!;
      const rideId = ride.id;
      const riderId = req.riderId!;
      const { event, lat, lng, notes } = parsed.data;

      const id = generateId();
      await db.insert(rideEventLogsTable).values({
        id,
        rideId,
        riderId,
        event,
        lat: lat != null ? String(lat) : null,
        lng: lng != null ? String(lng) : null,
        notes: notes ?? null,
        createdAt: new Date(),
      });

      sendSuccess(res, { id });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/:id/event-logs", adminAuth, async (req, res, next) => {
  try {
    const logs = await db
      .select()
      .from(rideEventLogsTable)
      .where(eq(rideEventLogsTable.rideId, String(req.params["id"] as string)))
      .orderBy(asc(rideEventLogsTable.createdAt));

    const formatted = logs.map((l) => ({
      id: l.id,
      rideId: l.rideId,
      riderId: l.riderId,
      event: l.event,
      lat: l.lat != null ? parseFloat(String(l.lat)) : null,
      lng: l.lng != null ? parseFloat(String(l.lng)) : null,
      notes: l.notes,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    }));

    sendSuccess(res, { logs: formatted, total: formatted.length });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:id/rate",
  customerAuth,
  requireRideState(["completed"]),
  requireRideOwner("userId"),
  async (req, res, next) => {
    try {
      const parsed = rateRideSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, parsed.error.issues[0]?.message || "stars must be between 1 and 5", 422);
        return;
      }

      const ride = req.ride!;
      const userId = req.customerId!;
      const rideId = ride.id;
      const { stars, comment } = parsed.data;

      if (!ride.riderId) {
        sendValidationError(res, "No rider assigned");
        return;
      }

      if (ride.riderId === userId) {
        sendForbidden(res, "You cannot rate yourself.");
        return;
      }

      const existing = await db
        .select({ id: rideRatingsTable.id })
        .from(rideRatingsTable)
        .where(eq(rideRatingsTable.rideId, rideId))
        .limit(1);
      if (existing.length > 0) {
        sendError(res, "Already rated", 409);
        return;
      }

      const [rating] = await db
        .insert(rideRatingsTable)
        .values({
          id: generateId(),
          rideId,
          userId,
          riderId: ride.riderId,
          stars,
          comment: comment || null,
        })
        .returning();

      const ratingLang = await getUserLanguage(ride.riderId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: ride.riderId,
          title: `${stars} ${t("rating", ratingLang)} ⭐`,
          body: comment
            ? `${stars} ${t("rating", ratingLang)}: "${comment}"`
            : `${t("rateRider", ratingLang)}: ${stars} ⭐`,
          type: "ride",
          icon: "star-outline",
        })
        .catch((e: Error) =>
          logger.warn(
            { rideId: ride.id, riderId: ride.riderId, err: e.message },
            "[rides/rate] rating notification insert failed"
          )
        );

      sendSuccess(res, { rating });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:id/status",
  customerAuth,
  loadRide(),
  requireRideOwner("userId"),
  async (req, res, next) => {
    try {
      const ride = req.ride!;
      const rideId = ride.id;

      const attempts = (ride.dispatchAttempts as string[] | null) || [];
      const hasRating = await db
        .select({ id: rideRatingsTable.id })
        .from(rideRatingsTable)
        .where(eq(rideRatingsTable.rideId, rideId))
        .limit(1);

      sendSuccess(res, {
        id: ride.id,
        status: ride.status,
        riderId: ride.riderId,
        riderName: ride.riderName,
        riderPhone: ride.riderPhone,
        dispatchedRiderId: ride.dispatchedRiderId,
        dispatchLoopCount: ride.dispatchLoopCount ?? 0,
        dispatchAttempts: attempts.length,
        expiresAt: ride.expiresAt
          ? ride.expiresAt instanceof Date
            ? ride.expiresAt.toISOString()
            : ride.expiresAt
          : null,
        fare: parseFloat(ride.fare),
        distance: parseFloat(ride.distance),
        hasRating: hasRating.length > 0,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:id/dispatch-status",
  customerAuth,
  loadRide(),
  requireRideOwner("userId"),
  async (req, res, next) => {
    try {
      const ride = req.ride!;
      const rideId = ride.id;

      const s = await getCachedSettings();
      const totalTimeoutSec = parseInt(s["dispatch_broadcast_timeout_sec"] ?? "90", 10);

      const [notifiedRow] = await db
        .select({ c: count() })
        .from(rideNotifiedRidersTable)
        .where(eq(rideNotifiedRidersTable.rideId, rideId));
      const notifiedCount = notifiedRow?.c ?? 0;

      const createdMs = new Date(ride.createdAt!).getTime();
      const elapsedSec = Math.round((Date.now() - createdMs) / 1000);
      const remainingSec = Math.max(0, totalTimeoutSec - elapsedSec);

      const maxLoops = parseInt(s["dispatch_max_loops"] ?? "3", 10);

      sendSuccess(res, {
        status: ride.status,
        notifiedRiders: notifiedCount,
        elapsedSec,
        remainingSec,
        totalTimeoutSec,
        attemptCount: notifiedCount,
        dispatchLoopCount: ride.dispatchLoopCount ?? 0,
        maxLoops,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/retry",
  customerAuth,
  requireRideState(["no_riders", "no_riders_found", "expired", "bargaining", "searching"]),
  requireRideOwner("userId"),
  async (req, res, next) => {
    try {
      const ride = req.ride!;
      const rideId = ride.id;

      await cleanupNotifiedRiders(rideId);

      await db
        .update(ridesTable)
        .set({
          status: "searching",
          dispatchedRiderId: null,
          dispatchAttempts: [],
          dispatchLoopCount: 0,
          dispatchedAt: null,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ridesTable.id, rideId));

      void broadcastRide(rideId);
      emitRideUpdate(rideId);

      sendSuccess(res, undefined, "Dispatch restarted");
    } catch (err) {
      next(err);
    }
  }
);

export default router;
