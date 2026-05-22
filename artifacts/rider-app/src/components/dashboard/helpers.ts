import { formatCurrency as _sharedFc } from "@workspace/api-zod";

/**
 * Precision-safe currency formatter — delegates to the shared @workspace/api-zod
 * utility so API monetary strings (fare, amount, walletBalance) are never coerced
 * through Number() / Math.round() before display.
 *
 * Accepts string (from API) or number (from local calculations like riderEarningPct).
 */
export function formatCurrency(
  value: string | number | null | undefined,
  currencySymbol = "Rs."
): string {
  return _sharedFc(value != null ? String(value) : (value as null | undefined), currencySymbol);
}

export function timeAgo(d: string | Date): string {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function buildMapsDeepLink(
  lat: number | null | undefined,
  lng: number | null | undefined,
  address?: string | null
): string {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua))
      return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
    if (/Android/i.test(ua)) return `geo:${lat},${lng}?q=${lat},${lng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
  if (address)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return "#";
}

export const SVC_NAMES: Record<string, string> = {
  bike: "Bike",
  car: "Car",
  rickshaw: "Rickshaw",
  daba: "Daba / Van",
  school_shift: "School Shift",
};

export const ACCEPT_TIMEOUT_SEC = 90;

/* ── Ride / order pricing fallbacks ──────────────────────────────────────────
   All hardcoded pricing constants live here so they can be updated in one
   place without hunting through individual card components. */
export const PRICING_DEFAULTS = {
  bikeMinFare: 50,
  carMinFare: 80,
  rickshawMinFare: 50,
  dabaMinFare: 60,
  counterMaxMultiplier: 3,
  defaultDeliveryFee: 0,
  defaultRiderEarningPct: 80,
} as const;

/* ── Haversine distance (km) — memoized ──────────────────────────────────────
   Results are cached by a rounded-coordinate key to avoid redundant trig calls
   on high-frequency GPS updates.  Rounding to 4 decimal places ≈ 11 m
   resolution, which is more than sufficient for the filtering decisions made
   in the GPS watch loop. */
const _haversineCache = new Map<string, number>();
const _MAX_CACHE_ENTRIES = 512;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const k1 = lat1.toFixed(4);
  const k2 = lon1.toFixed(4);
  const k3 = lat2.toFixed(4);
  const k4 = lon2.toFixed(4);
  const key = `${k1},${k2}|${k3},${k4}`;

  if (_haversineCache.has(key)) return _haversineCache.get(key)!;

  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const result = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (_haversineCache.size >= _MAX_CACHE_ENTRIES) {
    const firstKey = _haversineCache.keys().next().value;
    if (firstKey !== undefined) _haversineCache.delete(firstKey);
  }
  _haversineCache.set(key, result);
  return result;
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}
