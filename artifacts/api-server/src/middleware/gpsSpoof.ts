/**
 * gpsSpoof.ts — Shared GPS anti-spoof middleware.
 *
 * This middleware performs fast, stateless GPS sanity checks that require
 * NO database access and NO platform settings lookup:
 *
 *   1. Coordinate range validation (lat ∈ [-90, 90], lon ∈ [-180, 180])
 *   2. Emulator-signature detection (known fake GPS default coordinates)
 *   3. Mock-provider flag check (client-reported mockProvider === true)
 *
 * Speed-based spoof detection (which requires the previous location from
 * the DB) is intentionally NOT performed here — it stays in the route
 * handlers that already have the DB context.
 *
 * Usage:
 *   router.post("/update", gpsAntiSpoofMiddleware, handler)
 *
 * The middleware reads lat/lon from req.body.latitude / req.body.longitude.
 * It sets req.gpsAntiSpoofPassed = true when all checks pass.
 */

import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { addSecurityEvent, getClientIp } from "./security.js";

declare global {
  namespace Express {
    interface Request {
      gpsAntiSpoofPassed?: boolean;
    }
  }
}

/** Known emulator/simulator default coordinate signatures */
const EMULATOR_COORDS: Array<{ lat: number; lon: number; label: string }> = [
  { lat: 37.4219983, lon: -122.084, label: "Android emulator (Googleplex)" },
  { lat: 48.8534, lon: 2.3488, label: "Genymotion (Paris)" },
  { lat: 37.3861, lon: -122.0839, label: "BlueStacks (San Francisco)" },
];

const EMULATOR_COORD_TOLERANCE = 0.0001; /* ~11 metres */

function isEmulatorCoordinate(
  lat: number,
  lon: number,
  accuracy?: number
): { flagged: boolean; label: string } {
  /* Exact origin (0, 0) — equator/prime meridian, impossible for a real moving device */
  if (lat === 0 && lon === 0) {
    return { flagged: true, label: "Exact origin (0,0)" };
  }

  /* Round integer coordinates with zero accuracy — simulator signature */
  if (accuracy === 0 && Number.isInteger(lat) && Number.isInteger(lon)) {
    return { flagged: true, label: "Integer coords + accuracy=0" };
  }

  for (const ec of EMULATOR_COORDS) {
    if (
      Math.abs(lat - ec.lat) < EMULATOR_COORD_TOLERANCE &&
      Math.abs(lon - ec.lon) < EMULATOR_COORD_TOLERANCE
    ) {
      return { flagged: true, label: ec.label };
    }
  }

  return { flagged: false, label: "" };
}

export function gpsAntiSpoofMiddleware(req: Request, res: Response, next: NextFunction): void {
  const { latitude, longitude, accuracy, mockProvider } = req.body as {
    latitude?: unknown;
    longitude?: unknown;
    accuracy?: unknown;
    mockProvider?: unknown;
  };

  const lat = parseFloat(String(latitude));
  const lon = parseFloat(String(longitude));

  /* 1. Coordinate range validation */
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: "Invalid latitude or longitude values" });
    return;
  }

  const ip = getClientIp(req);
  const userId = req.riderId ?? req.userId ?? req.customerId ?? "unknown";

  const acc = accuracy !== undefined ? parseFloat(String(accuracy)) : undefined;

  /* 2. accuracy === 0 — physically impossible from real GPS hardware (minimum ~1 m).
     This is a reliable emulator/mock-provider hardware signature and is checked
     before the platform-settings-based accuracy threshold so it is always enforced. */
  if (acc !== undefined && acc === 0) {
    logger.warn(
      { ip, userId },
      "[gps-spoof] GPS accuracy === 0 — mock provider hardware signature"
    );
    addSecurityEvent({
      type: "gps_spoof_detected",
      ip,
      userId: userId !== "unknown" ? userId : undefined,
      details: "GPS accuracy === 0 — physically impossible from real hardware",
      severity: "medium",
    });
    res.status(422).json({
      error: "GPS location rejected: mock GPS provider detected. Please disable fake GPS apps.",
      code: "GPS_SPOOF_DETECTED",
    });
    return;
  }

  /* 3. Mock-provider flag (client-reported) */
  const mockFlagged = mockProvider === true || mockProvider === "true";
  if (mockFlagged) {
    logger.warn({ ip, userId }, "[gps-spoof] Mock GPS provider flag set");
    addSecurityEvent({
      type: "gps_spoof_detected",
      ip,
      userId: userId !== "unknown" ? userId : undefined,
      details: "Mock GPS provider flag set by client",
      severity: "medium",
    });
    res.status(422).json({
      error: "GPS location rejected: mock GPS provider detected. Please disable fake GPS apps.",
      code: "GPS_SPOOF_DETECTED",
    });
    return;
  }

  /* 4. Emulator-signature detection */
  const emulator = isEmulatorCoordinate(lat, lon, acc);
  if (emulator.flagged) {
    logger.warn({ ip, userId, label: emulator.label }, "[gps-spoof] Emulator signature detected");
    addSecurityEvent({
      type: "gps_spoof_detected",
      ip,
      userId: userId !== "unknown" ? userId : undefined,
      details: `Emulator signature: ${emulator.label}`,
      severity: "high",
    });
    res.status(422).json({
      error: "GPS location rejected: emulator or fake GPS coordinates detected.",
      code: "GPS_SPOOF_DETECTED",
    });
    return;
  }

  req.gpsAntiSpoofPassed = true;
  next();
}
