import { db, pool } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { count, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../lib/logger.js";
import { getDiskFreeGb, getDiskPct, getMemoryPct, getP95Ms } from "../lib/metrics/responseTime.js";
import { redisClient } from "../lib/redis.js";
import { getVpnCircuitBreakerStatus } from "../middleware/security.js";
import { checkSchemaDrift, getLastDriftReport } from "../services/schemaDrift.service.js";
import { adminAuth } from "./admin-shared.js";

const router = Router();

const SERVER_EPOCH = Math.round(Date.now() / 1000 - process.uptime());

router.get("/", async (_req, res) => {
  try {
    let dbStatus: "ok" | "error" = "ok";
    let redisStatus: "ok" | "error" | "disabled" = "disabled";

    const DB_TIMEOUT_MS = 2000;
    const REDIS_TIMEOUT_MS = 2000;

    await Promise.allSettled([
      (async () => {
        try {
          await Promise.race([
            db.execute(sql`SELECT 1`),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("DB timeout")), DB_TIMEOUT_MS)
            ),
          ]);
          dbStatus = "ok";
        } catch (err) {
          logger.error(
            {
              error: err instanceof Error ? err.message : String(err),
              timestamp: new Date().toISOString(),
            },
            "[route] unhandled error"
          );
          dbStatus = "error";
        }
      })(),
      (async () => {
        if (!redisClient) {
          redisStatus = "disabled";
          return;
        }
        try {
          await Promise.race([
            redisClient.ping(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Redis timeout")), REDIS_TIMEOUT_MS)
            ),
          ]);
          redisStatus = "ok";
        } catch (err) {
          logger.error(
            {
              error: err instanceof Error ? err.message : String(err),
              timestamp: new Date().toISOString(),
            },
            "[route] unhandled error"
          );
          redisStatus = "error";
        }
      })(),
    ]);

    const db2 = dbStatus as "ok" | "error";
    const redis2 = redisStatus as "ok" | "error" | "disabled";
    const overallStatus: "ok" | "degraded" | "down" =
      db2 === "error" ? "down" : redis2 === "error" ? "degraded" : "ok";

    const httpStatus = db2 === "error" || redis2 === "error" ? 503 : 200;

    /* ── Performance metrics ── */
    let dbQueryMs: number | null = null;
    if (db2 === "ok") {
      try {
        const t0 = Date.now();
        await db.select({ c: count() }).from(platformSettingsTable);
        dbQueryMs = Date.now() - t0;
      } catch (err) {
        logger.error(
          {
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          },
          "[route] unhandled error"
        );
        dbQueryMs = null;
      }
    }
    const p95Ms = getP95Ms();
    const memoryPct = getMemoryPct();
    const diskPct = getDiskPct();

    /* Read the app version from platform settings — never fatal if unavailable */
    let appVersion = "1.0.0";
    if (db2 === "ok") {
      try {
        const [row] = await db
          .select({ value: platformSettingsTable.value })
          .from(platformSettingsTable)
          .where(eq(platformSettingsTable.key, "app_version"))
          .limit(1);
        if (row?.value) appVersion = row.value;
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[route] ignore — appVersion defaults to 1.0.0`
        );
      }
    }

    const vpnDetection = getVpnCircuitBreakerStatus();
    const diskFreeGb = getDiskFreeGb();

    const dbPoolStats = pool
      ? {
          dbPoolSize: pool.totalCount,
          dbIdleCount: pool.idleCount,
          dbWaitingCount: pool.waitingCount,
        }
      : {};

    /* ── Detailed sub-system checks ── */
    const hasSms = !!(
      process.env["TWILIO_ACCOUNT_SID"] ||
      process.env["SMS_API_KEY"] ||
      process.env["VONAGE_API_KEY"] ||
      process.env["AFRICAS_TALKING_API_KEY"] ||
      process.env["NETSMS_KEY"] ||
      process.env["SMS_GATEWAY_URL"]
    );

    const diskPct2 = diskPct ?? null;
    const usedGb =
      diskFreeGb != null && diskPct2 != null && diskPct2 > 0
        ? (diskFreeGb / (1 - diskPct2 / 100)) * (diskPct2 / 100)
        : null;

    const checks = {
      database: {
        status: db2 === "ok" ? "ok" : "error",
        latencyMs: dbQueryMs,
      },
      redis: redisClient
        ? { status: redis2 === "ok" ? "ok" : "error" }
        : { status: "skipped", reason: "REDIS_URL not set" },
      storage:
        diskFreeGb != null
          ? {
              status: diskPct2 != null && diskPct2 > 90 ? "warning" : "ok",
              freeGb: Math.round(diskFreeGb * 10) / 10,
              usedGb: usedGb != null ? Math.round(usedGb * 10) / 10 : null,
              usedMb: usedGb != null ? Math.round(usedGb * 1024) : null,
              totalMb:
                diskFreeGb != null && diskPct2 != null && diskPct2 > 0
                  ? Math.round((diskFreeGb / (1 - diskPct2 / 100)) * 1024)
                  : null,
              usedPct: diskPct2,
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
      db: db2,
      redis: redis2,
      ...dbPoolStats,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      serverEpoch: SERVER_EPOCH,
      environment: process.env["NODE_ENV"] ?? "development",
      nodeVersion: process.version,
      version: appVersion,
      appVersion,
      p95Ms,
      dbQueryMs,
      memoryPct,
      diskPct,
      vpnDetection: { status: vpnDetection.status },
      checks,
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

/**
 * GET /api/health/schema-drift
 * Admin-only endpoint that compares the Drizzle schema definition against the
 * live PostgreSQL database and reports any tables or columns that are defined
 * in code but missing from the database (crash risk), as well as extra tables
 * and columns that exist only in the database (informational).
 *
 * Returns HTTP 200 with { ok: true } when the DB fully matches the schema.
 * Returns HTTP 200 with { ok: false, ... } when drift is detected so callers
 * can distinguish "endpoint reachable" from "schema is clean" without relying
 * on HTTP status codes for alerting.
 */
router.get("/schema-drift", adminAuth, async (_req, res) => {
  try {
    // Return the startup-cached result so the dashboard doesn't re-run a
    // full DB introspection on every page load. If the cache is empty (server
    // restarted and startup task is still in progress), fall back to a live
    // check so callers always get a meaningful response.
    const cached = getLastDriftReport();
    const report = cached ?? (await checkSchemaDrift());
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
