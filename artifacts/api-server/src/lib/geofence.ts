import { db } from "@workspace/db";
import { serviceZonesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getCachedSettings } from "../middleware/security.js";
import { logger } from "./logger.js";

/* ── Haversine distance in km ── */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── In-process zone cache — refreshed every 2 minutes ── */
type ZoneRow = {
  id: number;
  name: string;
  city: string;
  lat: string;
  lng: string;
  radiusKm: string;
  appliesToRides: boolean;
  appliesToOrders: boolean;
  appliesToParcel: boolean;
};
let _zoneCache: ZoneRow[] = [];
let _zoneCacheAt = 0;
let ZONE_CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Tracks whether the most recent zone refresh failed while the cache was empty.
 * When true and the cache is empty, delivery eligibility checks fail closed
 * (return not allowed) instead of silently passing all locations.
 */
let _zoneLoadFailed = false;

async function getActiveZones(): Promise<ZoneRow[]> {
  const s = await getCachedSettings();
  const zoneTtlMin = parseInt(s["cache_zone_ttl_min"] ?? "2", 10);
  ZONE_CACHE_TTL_MS = Math.max(10_000, (Number.isFinite(zoneTtlMin) ? zoneTtlMin : 2) * 60 * 1000);
  if (Date.now() - _zoneCacheAt < ZONE_CACHE_TTL_MS) return _zoneCache;
  try {
    _zoneCache = await db
      .select({
        id: serviceZonesTable.id,
        name: serviceZonesTable.name,
        city: serviceZonesTable.city,
        lat: serviceZonesTable.lat,
        lng: serviceZonesTable.lng,
        radiusKm: serviceZonesTable.radiusKm,
        appliesToRides: serviceZonesTable.appliesToRides,
        appliesToOrders: serviceZonesTable.appliesToOrders,
        appliesToParcel: serviceZonesTable.appliesToParcel,
      })
      .from(serviceZonesTable)
      .where(eq(serviceZonesTable.isActive, true));
    _zoneCacheAt = Date.now();
    _zoneLoadFailed = false;
  } catch (err: unknown) {
    if (_zoneCache.length === 0) {
      _zoneLoadFailed = true;
      logger.warn(
        { err: (err as Error).message },
        "[geofence] DB error during zone refresh and cache is empty — new orders will be blocked (fail-closed)"
      );
    } else {
      logger.warn(
        { err: (err as Error).message, cachedZones: _zoneCache.length },
        "[geofence] DB error during zone refresh — serving stale cache"
      );
    }
  }
  return _zoneCache;
}

/** Invalidate the zone cache immediately (call after any admin CRUD on service_zones). */
export function invalidateZoneCache() {
  _zoneCacheAt = 0;
}

export type ServiceType = "rides" | "orders" | "parcel";

/**
 * Returns true when (lat, lng) falls inside at least one active service zone
 * that applies to the requested service type.
 *
 * If a DB error occurred during zone refresh and the cache is empty, the
 * function returns false (fail-closed) to prevent orders in unknown zones.
 *
 * If no active zones exist for the given service type the function returns
 * true (open-world: coverage is assumed when no zones are configured),
 * unless geo_open_world_fallback is explicitly disabled.
 */
export async function isInServiceZone(
  lat: number,
  lng: number,
  serviceType: ServiceType
): Promise<{ allowed: boolean; zoneName?: string }> {
  const zones = await getActiveZones();

  /* Fail-closed: zone cache is empty due to a DB error — deny new requests */
  if (_zoneLoadFailed && zones.length === 0) {
    logger.warn(
      { lat, lng, serviceType },
      "[geofence] zone cache empty after DB error — denying request (fail-closed)"
    );
    return { allowed: false };
  }

  const relevant = zones.filter((z) => {
    if (serviceType === "rides") return z.appliesToRides;
    if (serviceType === "orders") return z.appliesToOrders;
    if (serviceType === "parcel") return z.appliesToParcel;
    return true;
  });

  const s = await getCachedSettings();
  const openWorldFallback = (s["geo_open_world_fallback"] ?? "off") === "on";
  if (relevant.length === 0) return { allowed: openWorldFallback };

  for (const z of relevant) {
    const distKm = haversineKm(lat, lng, parseFloat(z.lat), parseFloat(z.lng));
    if (distKm <= parseFloat(z.radiusKm)) {
      return { allowed: true, zoneName: z.name };
    }
  }

  return { allowed: openWorldFallback };
}
