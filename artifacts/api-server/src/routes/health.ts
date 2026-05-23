import { db, pool } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";
import { getDiskStats, getMemoryPct, getP95Ms } from "../lib/metrics/responseTime.js";
import { redisClient } from "../lib/redis.js";
import { getVpnCircuitBreakerStatus } from "../middleware/security.js";
import { checkSchemaDrift, getLastDriftReport } from "../services/schemaDrift.service.js";
import { adminAuth } from "./admin-shared.js";

const router = Router();

const SERVER_EPOCH = Math.round(Date.now() / 1000 - process.uptime());

/* ── Module-level cache for rarely-changing values ──────────────────────────
   appVersion comes from platform_settings — it changes only on deployments.
   Caching for 60 s eliminates one DB round-trip per health probe while still
   surfacing version changes within a minute.                                  */
const APP_VERSION_TTL_MS = 60_000;
let _cachedAppVersion = "1.0.0";
let _appVersionAt = 0;

/* ── Timeouts ────────────────────────────────────────────────────────────── */
const DB_TIMEOUT_MS = 2_000;
const REDIS_TIMEOUT_MS = 2_000;

/**
 * Core health-check logic, extracted so both GET /api/health and
 * GET /health can share the same implementation without a redirect.
 */
export async function handleHealthCheck(_req: Request, res: Response): Promise<void> {
  try {
    /* ── Prevent upstream caches / CDNs from serving stale health data ───── */
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    let dbStatus: "ok" | "error" = "ok";
    let redisStatus: "ok" | "error" | "disabled" = redisClient ? "error" : "disabled";
    let dbQueryMs: number | null = null;

    /* ── Single fused DB query replaces three sequential round-trips ─────────
       Previous code ran SELECT 1 → COUNT(*) → app_version in sequence, each
       adding ~300–500 ms. Now one query proves connectivity, measures latency,
       AND refreshes the cached version — all in a single round-trip.          */
    const dbTask = (async () => {
      const t0 = Date.now();
      const rows = await Promise.race([
        db
          .select({ value: platformSettingsTable.value })
          .from(platformSettingsTable)
          .where(eq(platformSettingsTable.key, "app_version"))
          .limit(1),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("DB timeout")), DB_TIMEOUT_MS)
        ),
      ]);
      dbQueryMs = Date.now() - t0;

      /* Refresh the cached version only when the TTL has expired */
      const now = Date.now();
      if (now - _appVersionAt > APP_VERSION_TTL_MS) {
        const row = rows[0];
        if (row?.value) _cachedAppVersion = row.value;
        _appVersionAt = now;
      }
    })();

    /* ── Redis ping runs in parallel with the DB query ───────────────────── */
    const redisTask = redisClient
      ? Promise.race([
          redisClient.ping(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Redis timeout")), REDIS_TIMEOUT_MS)
          ),
        ])
      : Promise.resolve(null);

    const [dbResult, redisResult] = await Promise.allSettled([dbTask, redisTask]);

    if (dbResult.status === "rejected") {
      dbStatus = "error";
      dbQueryMs = null;
      logger.error(
        { error: dbResult.reason instanceof Error ? dbResult.reason.message : String(dbResult.reason) },
        "[health] DB check failed"
      );
    }
    if (redisClient) {
      if (redisResult.status === "rejected") {
        redisStatus = "error";
        logger.warn(
          { error: redisResult.reason instanceof Error ? redisResult.reason.message : String(redisResult.reason) },
          "[health] Redis check failed"
        );
      } else {
        redisStatus = "ok";
      }
    }

    /* ── Overall status ──────────────────────────────────────────────────── */
    const overallStatus: "ok" | "degraded" | "down" =
      dbStatus === "error" ? "down" : redisStatus === "error" ? "degraded" : "ok";

    const httpStatus = dbStatus === "error" || redisStatus === "error" ? 503 : 200;

    /* ── Disk stats — one statfsSync call, cached 10 s ───────────────────── */
    const { pct: diskPct, freeGb: diskFreeGb } = getDiskStats();
    const memoryPct = getMemoryPct();
    const p95Ms = getP95Ms();
    const vpnDetection = getVpnCircuitBreakerStatus();

    /* ── Connection pool stats ───────────────────────────────────────────── */
    const dbPoolStats = pool
      ? {
          dbPoolSize: pool.totalCount,
          dbIdleCount: pool.idleCount,
          dbWaitingCount: pool.waitingCount,
        }
      : {};

    /* ── Sub-system checks ───────────────────────────────────────────────── */
    const hasSms = !!(
      process.env["TWILIO_ACCOUNT_SID"] ||
      process.env["SMS_API_KEY"] ||
      process.env["VONAGE_API_KEY"] ||
      process.env["AFRICAS_TALKING_API_KEY"] ||
      process.env["NETSMS_KEY"] ||
      process.env["SMS_GATEWAY_URL"]
    );

    const usedGb =
      diskFreeGb != null && diskPct != null && diskPct > 0
        ? (diskFreeGb / (1 - diskPct / 100)) * (diskPct / 100)
        : null;

    const checks = {
      database: {
        status: dbStatus === "ok" ? "ok" : "error",
        latencyMs: dbQueryMs,
      },
      redis: redisClient
        ? { status: redisStatus === "ok" ? "ok" : "error" }
        : { status: "skipped", reason: "REDIS_URL not set" },
      storage:
        diskFreeGb != null
          ? {
              status: diskPct != null && diskPct > 90 ? "warning" : "ok",
              freeGb: Math.round(diskFreeGb * 10) / 10,
              usedGb: usedGb != null ? Math.round(usedGb * 10) / 10 : null,
              usedMb: usedGb != null ? Math.round(usedGb * 1024) : null,
              totalMb:
                diskFreeGb != null && diskPct != null && diskPct > 0
                  ? Math.round((diskFreeGb / (1 - diskPct / 100)) * 1024)
                  : null,
              usedPct: diskPct,
            }
          : { status: "error", reason: "statfs unavailable" },
      smtp: process.env["SMTP_HOST"]
        ? { status: "ok", provider: process.env["SMTP_HOST"] }
        : { status: "not_configured", reason: "SMTP_HOST not set" },
      sms: hasSms
        ? { status: "ok" }
        : { status: "not_configured", reason: "No SMS provider env vars set" },
    };

    res.status(httpStatus).json({
      status: overallStatus,
      db: dbStatus,
      redis: redisStatus,
      ...dbPoolStats,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      serverEpoch: SERVER_EPOCH,
      environment: process.env["NODE_ENV"] ?? "development",
      nodeVersion: process.version,
      version: _cachedAppVersion,
      appVersion: _cachedAppVersion,
      p95Ms,
      dbQueryMs,
      memoryPct,
      diskPct,
      vpnDetection: { status: vpnDetection.status },
      checks,
    });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "[health] Unhandled error in health check"
    );
    res.status(500).json({ status: "down", error: "Internal server error" });
  }
}

/* ── GET /api/health ─────────────────────────────────────────────────────── */
router.get("/", handleHealthCheck);

/* ── GET /api/health/schema-drift (admin-only) ───────────────────────────── */
router.get("/schema-drift", adminAuth, async (_req, res) => {
  try {
    const cached = getLastDriftReport();
    const report = cached ?? (await checkSchemaDrift());
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
