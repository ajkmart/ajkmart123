export interface GpsPing {
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  isMockProvider?: boolean;
}

export interface GpsValidationResult {
  valid: boolean;
  reason: string;
  suspicious: boolean;
  suspicionReason?: string;
}

interface AuditEntry {
  timestamp: number;
  reason: string;
  lat: number;
  lng: number;
}

let _maxSpeedKmh = 200;
const MIN_ACCURACY_M = 2;
/* L-07: Allow 1 single-outlier GPS jump (e.g. multipath in cities) before
   hard-rejecting. Consecutive violations still trigger the impossible-speed
   gate. Counter resets on any valid-speed ping. */
let _consecutiveSpeedViolations = 0;
const SPEED_VIOLATION_GRACE = 1;
const MAX_FUTURE_SECONDS = 5;
const MAX_AUDIT_ENTRIES = 100;

/**
 * Override the GPS impossible-speed threshold from platform config.
 * Falls back to 200 km/h when platform config has not yet loaded.
 */
export function setMaxSpeedKmh(value: number): void {
  if (Number.isFinite(value) && value > 0) _maxSpeedKmh = value;
}

const _auditLog: AuditEntry[] = [];

export function getGpsAuditLog(): readonly AuditEntry[] {
  return _auditLog;
}

function recordRejection(reason: string, lat: number, lng: number, suspicious = false): void {
  if (_auditLog.length >= MAX_AUDIT_ENTRIES) _auditLog.shift();
  _auditLog.push({
    timestamp: Date.now(),
    reason: suspicious ? `[suspicious] ${reason}` : reason,
    lat,
    lng,
  });
}

function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let _geofencePolygon: Array<[number, number]> | null = null;

export function setGeofencePolygon(polygon: Array<[number, number]> | null): void {
  _geofencePolygon = polygon;
}

function isInsidePolygon(lat: number, lng: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![0],
      yi = polygon[i]![1];
    const xj = polygon[j]![0],
      yj = polygon[j]![1];
    const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const STALE_PING_THRESHOLD_MS = 30_000;

export function validateGpsPing(prev: GpsPing | null, next: GpsPing): GpsValidationResult {
  const nextTime = new Date(next.timestamp).getTime();
  if (isNaN(nextTime)) {
    const reason = "invalid timestamp";
    recordRejection(reason, next.latitude, next.longitude);
    return { valid: false, reason, suspicious: false };
  }

  if (nextTime > Date.now() + MAX_FUTURE_SECONDS * 1_000) {
    const reason = `future timestamp (${Math.round((nextTime - Date.now()) / 1_000)}s ahead)`;
    recordRejection(reason, next.latitude, next.longitude);
    return { valid: false, reason, suspicious: false };
  }

  if (typeof next.accuracy === "number" && next.accuracy < MIN_ACCURACY_M) {
    const reason = `accuracy too high (${next.accuracy}m — possible spoof)`;
    recordRejection(reason, next.latitude, next.longitude);
    return { valid: false, reason, suspicious: false };
  }

  if (prev) {
    const prevTime = new Date(prev.timestamp).getTime();
    const deltaMs = nextTime - prevTime;
    if (deltaMs > 0) {
      const distM = haversineDistanceM(
        prev.latitude,
        prev.longitude,
        next.latitude,
        next.longitude
      );
      const speedKmh = (distM / deltaMs) * 3_600;
      if (speedKmh > _maxSpeedKmh) {
        _consecutiveSpeedViolations += 1;
        if (_consecutiveSpeedViolations <= SPEED_VIOLATION_GRACE) {
          /* L-07: First outlier grace pass — city multipath, tunnel exit, or
             momentary sensor glitch. Accept the point as suspicious rather than
             hard-rejecting; consecutive violations still trigger the gate. */
          const suspicionReason = `possible GPS jump (${Math.round(speedKmh)} km/h, outlier #${_consecutiveSpeedViolations})`;
          recordRejection(suspicionReason, next.latitude, next.longitude, true);
          return { valid: true, reason: "ok", suspicious: true, suspicionReason };
        }
        const reason = `impossible speed (${Math.round(speedKmh)} km/h — ${_consecutiveSpeedViolations} consecutive violations)`;
        recordRejection(reason, next.latitude, next.longitude);
        return { valid: false, reason, suspicious: false };
      }
      _consecutiveSpeedViolations = 0; // reset on any valid-speed ping
    }
  }

  if (_geofencePolygon && _geofencePolygon.length >= 3) {
    if (!isInsidePolygon(next.latitude, next.longitude, _geofencePolygon)) {
      const reason = "outside configured geofence";
      recordRejection(reason, next.latitude, next.longitude);
      return { valid: false, reason, suspicious: false };
    }
  }

  /* ── Suspicious checks (valid but flagged) ── */

  const ageMs = Date.now() - nextTime;
  if (ageMs > STALE_PING_THRESHOLD_MS) {
    const suspicionReason = `stale ping (${Math.round(ageMs / 1_000)}s old)`;
    recordRejection(suspicionReason, next.latitude, next.longitude, true);
    return { valid: true, reason: "ok", suspicious: true, suspicionReason };
  }

  if (next.isMockProvider === true) {
    const suspicionReason = "mock location provider detected";
    recordRejection(suspicionReason, next.latitude, next.longitude, true);
    return { valid: true, reason: "ok", suspicious: true, suspicionReason };
  }

  return { valid: true, reason: "ok", suspicious: false };
}
