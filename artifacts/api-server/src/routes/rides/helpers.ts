import { db } from "@workspace/db";
import {
  liveLocationsTable,
  notificationsTable,
  popularLocationsTable,
  rideBidsTable,
  rideEventLogsTable,
  rideNotifiedRidersTable,
  rideRatingsTable,
  riderProfilesTable,
  rideServiceTypesTable,
  ridesTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { t, type TranslationKey } from "@workspace/i18n";
import { randomInt } from "crypto";
import { and, asc, count, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { isInServiceZone } from "../../lib/geofence.js";
import { getUserLanguage } from "../../lib/getUserLanguage.js";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import {
  sendCreated,
  sendError,
  sendErrorWithData,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../lib/response.js";
import { emitRideUpdate, onRideUpdate } from "../../lib/rideEvents.js";
import {
  emitRideDispatchUpdate,
  emitRideOtp,
  emitRiderNewRequest,
  getIO,
} from "../../lib/socketio.js";
import { sendPushToUser, sendPushToUsers } from "../../lib/webpush.js";
import { loadRide, requireRideOwner, requireRideState } from "../../middleware/ride-guards.js";
import { customerAuth, getCachedSettings, riderAuth } from "../../middleware/security.js";
import { verifyOwnership } from "../../middleware/verifyOwnership.js";
import type {
  GoogleDirectionsResponse,
  MapboxDirectionsResponse,
} from "../../types/external-apis.js";
import {
  adminAuth,
  ensureDefaultLocations,
  ensureDefaultRideServices,
  getPlatformSettings,
} from "../admin.js";

export function broadcastWalletUpdate(userId: string, newBalance: number) {
  const io = getIO();
  if (!io) return;
  io.to(`user:${userId}`).emit("wallet:update", { balance: newBalance });
}

/* ── Rate limiters ── */
export const bargainLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async () => {
    const s = await getCachedSettings();
    const n = parseInt(s["rate_bargain_per_min"] ?? "5", 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many bargain requests. Please wait a minute before trying again." },
  validate: { xForwardedForHeader: false },
});

export const bookRideLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async () => {
    const s = await getCachedSettings();
    const n = parseInt(s["rate_booking_per_min"] ?? "5", 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
  },
  keyGenerator: (req) => req.customerId ?? "anonymous",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many booking requests. Please wait a minute before trying again." },
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const cancelRideLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async () => {
    const s = await getCachedSettings();
    const n = parseInt(s["rate_cancel_per_min"] ?? "3", 10);
    return Number.isFinite(n) && n > 0 ? n : 3;
  },
  keyGenerator: (req) => req.customerId ?? "anonymous",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many cancellation requests. Please wait a minute." },
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const estimateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: async () => {
    const s = await getCachedSettings();
    const n = parseInt(s["rate_estimate_per_min"] ?? "30", 10);
    return Number.isFinite(n) && n > 0 ? n : 30;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many fare estimate requests. Please wait a moment." },
  validate: { xForwardedForHeader: false },
});

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const coordinateSchema = z.number().min(-180).max(180);
const latitudeSchema = z.number().min(-90).max(90);

export function toNumber(v: unknown): number | undefined {
  if (v == null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export const DEFAULT_MAX_FARE = 100_000;

export const bookRideSchema = z.object({
  type: z.string().min(1),
  pickupAddress: z.string().min(1).max(300).transform(stripHtml),
  dropAddress: z.string().min(1).max(300).transform(stripHtml),
  pickupLat: z.preprocess(toNumber, latitudeSchema),
  pickupLng: z.preprocess(toNumber, coordinateSchema),
  dropLat: z.preprocess(toNumber, latitudeSchema),
  dropLng: z.preprocess(toNumber, coordinateSchema),
  paymentMethod: z.string().min(1),
  offeredFare: z.preprocess(
    (v) => (v != null && v !== "" ? Number(v) : undefined),
    z.number().positive().optional()
  ),
  bargainNote: z.string().max(500).transform(stripHtml).optional(),
  isParcel: z.boolean().optional().default(false),
  receiverName: z.string().max(200).transform(stripHtml).optional(),
  receiverPhone: z
    .string()
    .max(20)
    .regex(
      /^03\d{9}$/,
      "Receiver phone must be a valid Pakistani mobile number (11 digits, starts with 03)"
    )
    .optional(),
  packageType: z.string().max(100).transform(stripHtml).optional(),
  isScheduled: z.boolean().optional().default(false),
  scheduledAt: z.string().datetime().optional(),
  stops: z
    .array(
      z.object({
        address: z.string().max(500),
        lat: z.number(),
        lng: z.number(),
        order: z.number().int(),
      })
    )
    .max(5)
    .optional(),
  isPoolRide: z.boolean().optional().default(false),
});

export const cancelRideSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const acceptBidSchema = z.object({
  bidId: z.string().min(1),
});

export const customerCounterSchema = z.object({
  offeredFare: z.preprocess(toNumber, z.number().positive()),
  note: z.string().max(300).transform(stripHtml).optional(),
});

export const rateRideSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(1000).transform(stripHtml).optional(),
});

export const estimateSchema = z.object({
  pickupLat: z.preprocess(toNumber, latitudeSchema),
  pickupLng: z.preprocess(toNumber, coordinateSchema),
  dropLat: z.preprocess(toNumber, latitudeSchema),
  dropLng: z.preprocess(toNumber, coordinateSchema),
  type: z.string().min(1).optional(),
});

export const eventLogSchema = z.object({
  event: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().max(1000).optional(),
});

let _serviceKeysCache: Set<string> | null = null;
let _serviceKeysCacheAt = 0;
const SERVICE_KEYS_TTL_MS = 5 * 60_000;

export async function getServiceKeys(): Promise<Set<string>> {
  if (_serviceKeysCache && Date.now() - _serviceKeysCacheAt < SERVICE_KEYS_TTL_MS) {
    return _serviceKeysCache;
  }
  const rows = await db.select({ key: rideServiceTypesTable.key }).from(rideServiceTypesTable);
  _serviceKeysCache = new Set(rows.map((r) => r.key.toLowerCase()));
  _serviceKeysCacheAt = Date.now();
  return _serviceKeysCache;
}

export async function normalizeVehicleType(raw: string | null | undefined): Promise<string> {
  const serviceKeys = await getServiceKeys();
  return normalizeVehicleTypeSync(raw, serviceKeys);
}

export function normalizeVehicleTypeSync(
  raw: string | null | undefined,
  serviceKeys: Set<string>
): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "bike" || v.startsWith("bike") || v.includes("motorcycle")) return "bike";
  if (v === "car") return "car";
  if (v === "rickshaw" || v.includes("rickshaw") || v.includes("qingqi")) return "rickshaw";
  if (v === "van") return "van";
  if (v === "daba") return "daba";
  if (v === "bicycle") return "bicycle";
  if (v === "on_foot" || v === "on foot") return "on_foot";
  if (serviceKeys.has(v)) return v;
  const slug = v.replace(/[\s-]+/g, "_");
  if (serviceKeys.has(slug)) return slug;
  return v;
}

export async function broadcastRideAttempt(rideId: string) {
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride || ride.riderId) return;
  if (!["searching", "bargaining"].includes(ride.status)) return;

  const s = await getCachedSettings();
  const radiusKm = parseFloat(s["dispatch_min_radius_km"] ?? "5");
  const avgSpeed = parseFloat(s["dispatch_avg_speed_kmh"] ?? "25");

  const pickupLat = parseFloat(ride.pickupLat ?? "");
  const pickupLng = parseFloat(ride.pickupLng ?? "");
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    logger.error(
      { rideId, pickupLat: ride.pickupLat, pickupLng: ride.pickupLng },
      "[broadcast] Ride has invalid coordinates — skipping dispatch"
    );
    return;
  }

  const onlineRiders = await db
    .select({
      userId: liveLocationsTable.userId,
      latitude: liveLocationsTable.latitude,
      longitude: liveLocationsTable.longitude,
      isActive: usersTable.isActive,
      isBanned: usersTable.isBanned,
      isRestricted: usersTable.isRestricted,
      vehicleType: riderProfilesTable.vehicleType,
    })
    .from(liveLocationsTable)
    .innerJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
    .leftJoin(riderProfilesTable, eq(liveLocationsTable.userId, riderProfilesTable.userId))
    .where(
      and(
        eq(liveLocationsTable.role, "rider"),
        gte(liveLocationsTable.updatedAt, new Date(Date.now() - 5 * 60 * 1000)),
        eq(usersTable.isActive, true),
        eq(usersTable.isBanned, false),
        eq(usersTable.isRestricted, false)
      )
    );

  const [alreadyNotified, busyRiders] = await Promise.all([
    db
      .select({ riderId: rideNotifiedRidersTable.riderId })
      .from(rideNotifiedRidersTable)
      .where(eq(rideNotifiedRidersTable.rideId, rideId)),
    db
      .select({ riderId: ridesTable.riderId })
      .from(ridesTable)
      .where(
        sql`${ridesTable.riderId} IS NOT NULL AND ${ridesTable.status} IN ('accepted', 'arrived', 'in_transit')`
      ),
  ]);
  const alreadySet = new Set(alreadyNotified.map((r) => r.riderId));
  const busySet = new Set(busyRiders.map((r) => r.riderId));

  let notifiedCount = 0;
  const failedSocketRiderIds: string[] = [];
  const failedPushRiderIds: { userId: string; fareStr: string }[] = [];
  const serviceKeys = await getServiceKeys();
  const rideVt = ride.type ? normalizeVehicleTypeSync(ride.type, serviceKeys) : null;
  const rideSummary = `${ride.pickupAddress} → ${ride.dropAddress}`;

  for (const r of onlineRiders) {
    if (alreadySet.has(r.userId)) continue;
    if (busySet.has(r.userId)) continue;
    if (rideVt) {
      const riderVt = normalizeVehicleTypeSync(r.vehicleType, serviceKeys);
      if (!riderVt || riderVt !== rideVt) continue;
    }
    const rLat = parseFloat(String(r.latitude));
    const rLng = parseFloat(String(r.longitude));
    if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) continue;
    const dist = calcDistance(pickupLat, pickupLng, rLat, rLng);
    if (dist > radiusKm) continue;

    const etaMin = Math.max(1, Math.round((dist / avgSpeed) * 60));
    const fareStr = parseFloat(ride.fare ?? "0").toFixed(0);
    const riderLang = await getUserLanguage(r.userId);
    const titleKey = ride.status === "bargaining" ? "notifRideBargaining" : "notifRideRequest";
    const bodyStr = t("notifRideRequestBody", riderLang)
      .replace("{from}", ride.pickupAddress)
      .replace("{to}", ride.dropAddress)
      .replace("{fare}", fareStr)
      .replace("{dist}", dist.toFixed(1))
      .replace("{eta}", String(etaMin));

    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: r.userId,
        title: `${t(titleKey, riderLang)} 🚗`,
        body: bodyStr,
        type: "ride",
        icon: "car-outline",
        link: `/ride/${rideId}`,
      })
      .catch((e: Error) =>
        logger.warn(
          { rideId, riderId: r.userId, err: e.message },
          "[broadcast] notification insert failed"
        )
      );

    await db
      .insert(rideNotifiedRidersTable)
      .values({
        id: generateId(),
        rideId,
        riderId: r.userId,
      })
      .catch((e: Error) =>
        logger.warn(
          { rideId, riderId: r.userId, err: e.message },
          "[broadcast] rideNotifiedRiders insert failed"
        )
      );

    try {
      emitRiderNewRequest(r.userId, {
        type: "ride",
        requestId: rideId,
        summary: rideSummary,
      });
    } catch (emitErr) {
      failedSocketRiderIds.push(r.userId);
      logger.warn(
        { rideId, riderId: r.userId, err: (emitErr as Error).message },
        "[broadcast] socket emit to rider failed on first attempt"
      );
    }

    try {
      await sendPushToUser(r.userId, {
        title: "🚗 New Ride Request",
        body: `${rideSummary} · Rs. ${fareStr}`,
        tag: `ride-request-${rideId}`,
        data: { rideId },
      });
    } catch (pushErr) {
      failedPushRiderIds.push({ userId: r.userId, fareStr });
      logger.warn(
        { rideId, riderId: r.userId, err: (pushErr as Error).message },
        "[broadcast] push notification failed on first attempt"
      );
    }

    notifiedCount++;
  }

  if (failedSocketRiderIds.length > 0) {
    logger.warn(
      { rideId, notifiedCount, socketFailures: failedSocketRiderIds.length },
      "[broadcast] retrying failed socket emissions"
    );
    await new Promise((r) => setTimeout(r, 500));
    for (const riderId of failedSocketRiderIds) {
      try {
        emitRiderNewRequest(riderId, { type: "ride", requestId: rideId, summary: rideSummary });
      } catch (retryErr) {
        logger.error(
          { rideId, riderId, err: (retryErr as Error).message },
          "[broadcast] socket retry also failed — giving up for rider"
        );
      }
    }
  }

  if (failedPushRiderIds.length > 0) {
    logger.warn(
      { rideId, pushFailures: failedPushRiderIds.length },
      "[broadcast] retrying failed push notifications"
    );
    for (const { userId: rid, fareStr } of failedPushRiderIds) {
      sendPushToUser(rid, {
        title: "🚗 New Ride Request",
        body: `${rideSummary} · Rs. ${fareStr}`,
        tag: `ride-request-${rideId}`,
        data: { rideId },
      }).catch((e: Error) =>
        logger.error(
          { rideId, riderId: rid, err: e.message },
          "[broadcast] push retry also failed — giving up for rider"
        )
      );
    }
  }

  if (notifiedCount === 0 && alreadySet.size === 0) {
    logger.warn(
      { rideId, radiusKm, onlineRiderCount: onlineRiders.length },
      "[broadcast] NO_RIDERS_AVAILABLE — no eligible riders within radius"
    );
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: ride.userId,
        title: "No riders available",
        body: "No riders are currently available in your area. We'll keep searching — you'll be notified as soon as a rider accepts.",
        type: "ride",
        icon: "car-outline",
        link: `/ride/${rideId}`,
      })
      .catch((e: Error) =>
        logger.warn(
          { rideId, userId: ride.userId, err: e.message },
          "[broadcast] no-riders notification insert failed"
        )
      );
    emitRideDispatchUpdate({
      rideId,
      action: "NO_RIDERS_AVAILABLE",
      status: "searching",
    });
  }

  await db
    .update(ridesTable)
    .set({
      dispatchedAt: ride.dispatchedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(ridesTable.id, rideId), isNull(ridesTable.riderId)));
}

export async function broadcastRide(rideId: string) {
  try {
    await broadcastRideAttempt(rideId);
  } catch (err) {
    logger.error(
      { rideId, err: (err as Error).message, stack: (err as Error).stack },
      "[broadcast] first attempt failed for ride, retrying"
    );
    try {
      await new Promise((r) => setTimeout(r, 1500));
      await broadcastRideAttempt(rideId);
    } catch (retryErr) {
      logger.error(
        { rideId, err: (retryErr as Error).message, stack: (retryErr as Error).stack },
        "[broadcast] retry also failed for ride — giving up"
      );
    }
  }
}

export async function cleanupNotifiedRiders(rideId: string) {
  try {
    await db.delete(rideNotifiedRidersTable).where(eq(rideNotifiedRidersTable.rideId, rideId));
  } catch (e: unknown) {
    logger.warn(
      { rideId, err: e instanceof Error ? e.message : String(e) },
      "[rides] cleanupNotifiedRiders failed"
    );
  }
}

export class RideApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number = 422
  ) {
    super(message);
    this.name = "RideApiError";
  }
}

export function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (!isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2)) {
    throw new RideApiError(
      "Invalid coordinates: all values must be finite numbers",
      "INVALID_COORDINATES",
      422
    );
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function generateOtp(): string {
  return String(randomInt(1000, 10000));
}

export async function getRoadDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): Promise<{
  distanceKm: number;
  durationSeconds: number;
  source: "google" | "mapbox" | "haversine";
}> {
  const haversine = calcDistance(lat1, lng1, lat2, lng2);
  const haversineFallback = {
    distanceKm: haversine,
    durationSeconds: Math.round((haversine / 45) * 3600),
    source: "haversine" as const,
  };

  try {
    const s = await getCachedSettings();
    const routingProvider = s["routing_api_provider"] ?? "google";

    if (routingProvider === "google") {
      const googleKey = s["maps_api_key"];
      if (!googleKey) return haversineFallback;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lng1}&destination=${lat2},${lng2}&mode=driving&key=${googleKey}`;
      const raw = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const data = (await raw.json()) as GoogleDirectionsResponse;
      if (data.status === "OK" && data.routes?.length) {
        const leg = data.routes[0].legs[0];
        return {
          distanceKm: Math.round(leg.distance.value / 100) / 10,
          durationSeconds: leg.duration.value,
          source: "google",
        };
      }
    }

    if (routingProvider === "mapbox") {
      const mapboxKey = s["mapbox_api_key"];
      if (!mapboxKey) return haversineFallback;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${lng1},${lat1};${lng2},${lat2}?access_token=${mapboxKey}&overview=false`;
      const raw = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const data = (await raw.json()) as MapboxDirectionsResponse;
      if (data.routes?.length) {
        return {
          distanceKm: Math.round(data.routes[0].distance / 100) / 10,
          durationSeconds: Math.round(data.routes[0].duration),
          source: "mapbox",
        };
      }
    }
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[fn] Network error — fall through to haversine`
    );
  }

  return haversineFallback;
}

export async function calcFare(
  distance: number,
  type: string
): Promise<{ baseFare: number; gstAmount: number; total: number; minFare: number }> {
  if (!isFinite(distance) || distance < 0) {
    throw new RideApiError(
      "Invalid distance: must be a non-negative number",
      "INVALID_DISTANCE",
      422
    );
  }
  if (!type || typeof type !== "string") {
    throw new RideApiError(
      "Invalid service type: must be a non-empty string",
      "INVALID_SERVICE_TYPE",
      422
    );
  }

  const s = await getCachedSettings();

  let baseRate: number, perKm: number, minFare: number;
  const psBase = s[`ride_${type}_base_fare`];
  const psKm = s[`ride_${type}_per_km`];
  const psMin = s[`ride_${type}_min_fare`];

  if (psBase !== undefined && psKm !== undefined && psMin !== undefined) {
    baseRate = parseFloat(psBase);
    perKm = parseFloat(psKm);
    minFare = parseFloat(psMin);
  } else {
    const [svc] = await db
      .select()
      .from(rideServiceTypesTable)
      .where(eq(rideServiceTypesTable.key, type))
      .limit(1);
    if (!svc) {
      throw new RideApiError(`Unknown ride service type: '${type}'`, "UNKNOWN_SERVICE_TYPE", 422);
    }
    if (svc.baseFare == null || svc.perKm == null || svc.minFare == null) {
      throw new RideApiError(
        `Ride service '${type}' is missing fare configuration (baseFare, perKm, or minFare).`,
        "SERVICE_FARE_NOT_CONFIGURED",
        500
      );
    }
    baseRate = parseFloat(svc.baseFare);
    perKm = parseFloat(svc.perKm);
    minFare = parseFloat(svc.minFare);
  }

  if (!isFinite(baseRate) || !isFinite(perKm) || !isFinite(minFare)) {
    throw new RideApiError(
      "Fare configuration is invalid for this service type",
      "INVALID_FARE_CONFIG",
      500
    );
  }

  const surgeEnabled = (s["ride_surge_enabled"] ?? "off") === "on";
  const surgeMultiplier = surgeEnabled ? parseFloat(s["ride_surge_multiplier"] ?? "1.5") : 1;
  const raw = Math.round(baseRate + distance * perKm);
  const baseFare = Math.round(Math.max(minFare, raw) * surgeMultiplier);
  const gstEnabled = (s["finance_gst_enabled"] ?? "off") === "on";
  const gstPct = parseFloat(s["finance_gst_pct"] ?? "17");
  const gstAmount = gstEnabled ? Math.round((baseFare * gstPct) / 100) : 0;
  const total = baseFare + gstAmount;
  return { baseFare, gstAmount, total, minFare };
}

const toISO = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : v) : null);
export function formatRide(r: Record<string, unknown>) {
  return {
    ...r,
    fare: parseFloat(String(r.fare ?? "0")),
    distance: parseFloat(String(r.distance ?? "0")),
    offeredFare: r.offeredFare ? parseFloat(String(r.offeredFare)) : null,
    counterFare: r.counterFare ? parseFloat(String(r.counterFare)) : null,
    bargainRounds: r.bargainRounds ?? 0,
    createdAt: toISO(r.createdAt),
    updatedAt: toISO(r.updatedAt),
    acceptedAt: toISO(r.acceptedAt),
    arrivedAt: toISO(r.arrivedAt),
    startedAt: toISO(r.startedAt),
    completedAt: toISO(r.completedAt),
    cancelledAt: toISO(r.cancelledAt),
    tripOtp: r.tripOtp ?? null,
    otpVerified: r.otpVerified ?? false,
    isParcel: r.isParcel ?? false,
    receiverName: r.receiverName ?? null,
    receiverPhone: r.receiverPhone ?? null,
    packageType: r.packageType ?? null,
    broadcastExpiresAt: toISO(r.expiresAt),
  };
}

export {
  adminAuth,
  and,
  asc,
  count,
  customerAuth,
  db,
  emitRideDispatchUpdate,
  emitRideOtp,
  emitRiderNewRequest,
  emitRideUpdate,
  ensureDefaultLocations,
  ensureDefaultRideServices,
  eq,
  generateId,
  getCachedSettings,
  getIO,
  getPlatformSettings,
  getUserLanguage,
  gte,
  isInServiceZone,
  isNull,
  liveLocationsTable,
  loadRide,
  logger,
  ne,
  notificationsTable,
  onRideUpdate,
  or,
  popularLocationsTable,
  randomInt,
  rateLimit,
  requireRideOwner,
  requireRideState,
  rideBidsTable,
  rideEventLogsTable,
  rideNotifiedRidersTable,
  rideRatingsTable,
  riderAuth,
  riderProfilesTable,
  rideServiceTypesTable,
  ridesTable,
  Router,
  sendCreated,
  sendError,
  sendErrorWithData,
  sendForbidden,
  sendNotFound,
  sendPushToUser,
  sendPushToUsers,
  sendSuccess,
  sendValidationError,
  sql,
  t,
  usersTable,
  verifyOwnership,
  walletTransactionsTable,
  z,
};
export type { IRouter, TranslationKey };
