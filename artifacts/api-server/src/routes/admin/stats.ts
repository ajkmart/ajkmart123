import { db, pool } from "@workspace/db";
import {
  liveLocationsTable,
  notificationsTable,
  ordersTable,
  otpAttemptsTable,
  ridesTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { exec } from "child_process";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { Router } from "express";
import http from "http";
import { promisify } from "util";
import {
  getDiskFreeGb,
  getDiskPct,
  getMemoryPct,
  getP50Ms,
  getP95Ms,
  getP99Ms,
} from "../../lib/metrics/responseTime.js";
import { sendSuccess } from "../../lib/response.js";
import { getIO } from "../../lib/socketio.js";
import { getSchedulerStatus } from "../../scheduler.js";
import {
  ADMIN_LOCKOUT_TIME,
  adminAuth,
  adminLoginAttempts,
  getCachedSettings,
} from "../admin-shared.js";

const router = Router();
const execAsync = promisify(exec);

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

async function pingLocalPort(
  port: number,
  path = "/api/health"
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.get({ hostname: "127.0.0.1", port, path, timeout: 2000 }, (res) => {
      res.resume();
      resolve({
        ok: res.statusCode !== undefined && res.statusCode < 500,
        latencyMs: Date.now() - t0,
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, latencyMs: Date.now() - t0, error: "timeout" });
    });
    req.on("error", (err) =>
      resolve({ ok: false, latencyMs: Date.now() - t0, error: err.message })
    );
  });
}

async function getProcessCounts(): Promise<{
  nodeTotal: number;
  tsx: number;
  vite: number;
  expo: number;
}> {
  try {
    const { stdout } = await execAsync("ps aux");
    const lines = stdout.split("\n");
    return {
      nodeTotal: lines.filter((l) => l.includes("node ") || l.includes("/node")).length,
      tsx: lines.filter((l) => l.includes("tsx ")).length,
      vite: lines.filter((l) => l.includes("vite")).length,
      expo: lines.filter((l) => l.includes("expo") || l.includes("metro")).length,
    };
  } catch (_e) {
    return { nodeTotal: 0, tsx: 0, vite: 0, expo: 0 };
  }
}

/* ─── GET /system/health-dashboard ─────────────────────────────────────────
   Main aggregate endpoint consumed by the admin health dashboard page.
─────────────────────────────────────────────────────────────────────────── */
router.get("/system/health-dashboard", adminAuth, async (_req, res, next) => {
  try {
    const settings = await getCachedSettings();
    const issues: Array<{ level: "error" | "warning" | "info"; message: string; code?: string }> =
      [];

    /* ── DB check ── */
    let dbStatus: "ok" | "error" = "ok";
    let dbQueryMs: number | null = null;
    try {
      const t0 = Date.now();
      await db.execute(sql`SELECT 1`);
      const t1 = Date.now();
      dbQueryMs = t1 - t0;
    } catch (_e) {
      dbStatus = "error";
      issues.push({ level: "error", message: "Database connection failed", code: "DB_DOWN" });
    }

    /* ── Memory ── */
    const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const memoryPct = getMemoryPct();
    if (memoryPct > 85)
      issues.push({
        level: "warning",
        message: `High memory usage: ${memoryPct}%`,
        code: "HIGH_MEMORY",
      });

    /* ── Disk ── */
    const diskPct = getDiskPct() ?? 0;
    const diskFreeGb = getDiskFreeGb();
    if (diskPct > 90)
      issues.push({
        level: "error",
        message: `Critical disk usage: ${diskPct}%`,
        code: "DISK_CRITICAL",
      });
    else if (diskPct > 80)
      issues.push({ level: "warning", message: `High disk usage: ${diskPct}%`, code: "DISK_HIGH" });

    /* ── GPS / live riders ── */
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [ridersInLiveTable, ridersWithRecentPing] = await Promise.all([
      dbStatus === "ok"
        ? db
            .select({ c: count() })
            .from(liveLocationsTable)
            .then(([r]) => Number(r?.c ?? 0))
        : Promise.resolve(0),
      dbStatus === "ok"
        ? db
            .select({ c: count() })
            .from(liveLocationsTable)
            .where(gte(liveLocationsTable.updatedAt, fiveMinsAgo))
            .then(([r]) => Number(r?.c ?? 0))
        : Promise.resolve(0),
    ]);
    const staleRiders = Math.max(0, ridersInLiveTable - ridersWithRecentPing);

    /* ── Feature flags ── */
    const featureKeys = [
      "mart",
      "food",
      "rides",
      "pharmacy",
      "parcel",
      "van",
      "wallet",
      "referral",
      "newUsers",
      "chat",
      "liveTracking",
      "reviews",
      "sos",
      "weather",
    ];
    const features: Record<string, boolean> = {};
    for (const key of featureKeys) {
      features[key] =
        settings[`feature_${key}`] !== "off" && settings[`feature_${key}_enabled`] !== "false";
    }

    /* ── Maintenance mode ── */
    const maintenanceMode =
      settings["maintenance_mode"] === "on" || settings["maintenance_mode"] === "true";
    if (maintenanceMode)
      issues.push({
        level: "warning",
        message: "Maintenance mode is active — app is inaccessible to customers",
        code: "MAINTENANCE",
      });

    /* ── Moderation settings ── */
    let customPatternsCount = 0;
    let customPatternsValid = true;
    const rawPatterns = settings["moderation_custom_patterns"] ?? "";
    if (rawPatterns) {
      try {
        const parsed = JSON.parse(rawPatterns) as unknown[];
        customPatternsCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch (_e) {
        customPatternsValid = false;
        issues.push({
          level: "warning",
          message: "Custom moderation patterns contain invalid JSON",
          code: "MODERATION_INVALID",
        });
      }
    }
    const flagKeywordsRaw = settings["moderation_flag_keywords"] ?? "";
    const flagKeywordsCount = flagKeywordsRaw
      ? flagKeywordsRaw.split(",").filter(Boolean).length
      : 0;

    /* ── Alert config ── */
    const alertConfig = {
      monitorEnabled:
        settings["health_monitor_enabled"] === "on" ||
        settings["health_monitor_enabled"] === "true",
      intervalMin: parseInt(settings["health_monitor_interval_min"] ?? "5", 10),
      snoozeMin: parseInt(settings["health_monitor_snooze_min"] ?? "60", 10),
      emailConfigured: !!(settings["alert_email"] ?? process.env["SMTP_HOST"]),
      alertEmail: settings["alert_email"] ?? "",
      slackConfigured: !!(settings["slack_webhook_url"] ?? process.env["SLACK_WEBHOOK_URL"]),
    };

    /* ── Performance ── */
    const p95Alert = parseInt(settings["perf_alert_p95_ms"] ?? "500", 10);
    const dbMsAlert = parseInt(settings["perf_alert_db_ms"] ?? "1000", 10);
    const memAlert = parseInt(settings["perf_alert_memory_pct"] ?? "80", 10);
    const diskAlert = parseInt(settings["perf_alert_disk_pct"] ?? "80", 10);

    /* ── Auth lockouts ── */
    const LOCKOUT_WINDOW_MS = ADMIN_LOCKOUT_TIME * 60 * 1000;
    const now = Date.now();
    const adminIpLockouts: Array<{
      key: string;
      attempts: number;
      lockedSince: string;
      minutesLeft: number;
    }> = [];
    const adminIpAttemptsInProgress: Array<{ key: string; attempts: number; lastAttempt: string }> =
      [];

    for (const [key, val] of adminLoginAttempts.entries()) {
      const elapsed = now - val.lastAttempt;
      if (elapsed > LOCKOUT_WINDOW_MS) continue;
      const minutesLeft = Math.max(0, Math.ceil((LOCKOUT_WINDOW_MS - elapsed) / 60000));
      if (val.count >= 5) {
        adminIpLockouts.push({
          key,
          attempts: val.count,
          lockedSince: new Date(val.lastAttempt).toISOString(),
          minutesLeft,
        });
      } else if (val.count > 0) {
        adminIpAttemptsInProgress.push({
          key,
          attempts: val.count,
          lastAttempt: new Date(val.lastAttempt).toISOString(),
        });
      }
    }

    /* ── Account (phone/email) lockouts from DB ── */
    const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
    const lockoutMin = parseInt(settings["security_lockout_minutes"] ?? "15", 10);
    const lockoutSince = new Date(Date.now() - lockoutMin * 60 * 1000);
    let accountLockouts: Array<{ phone: string; attempts: number; minutesLeft: number }> = [];
    if (dbStatus === "ok") {
      try {
        const rows = await db
          .select({
            key: otpAttemptsTable.key,
            count: otpAttemptsTable.count,
            firstAt: otpAttemptsTable.firstAt,
          })
          .from(otpAttemptsTable)
          .where(
            and(
              gte(otpAttemptsTable.count, maxAttempts),
              gte(otpAttemptsTable.firstAt, lockoutSince)
            )
          )
          .limit(50);
        accountLockouts = rows.map((r) => ({
          phone: r.key,
          attempts: r.count,
          minutesLeft: Math.max(
            0,
            Math.ceil((lockoutMin * 60 * 1000 - (now - (r.firstAt?.getTime() ?? now))) / 60000)
          ),
        }));
      } catch (_e) {
        /* non-fatal */
      }
    }

    sendSuccess(res, {
      issues,
      maintenanceMode,
      features,
      server: {
        db: dbStatus,
        uptimeFormatted: formatUptime(process.uptime()),
        memoryMb: memMb,
        nodeVersion: process.version,
      },
      gps: {
        liveTrackingEnabled: features["liveTracking"] !== false,
        ridersInLiveTable,
        ridersWithRecentPing,
        staleRiders,
        spoofDetectionEnabled: settings["gps_spoof_detection_enabled"] !== "off",
        maxSpeedKmh: parseInt(settings["gps_max_speed_kmh"] ?? "150", 10),
      },
      moderation: {
        customPatternsCount,
        customPatternsValid,
        flagKeywordsCount,
        hidePhone: settings["moderation_hide_phone"] !== "off",
        hideEmail: settings["moderation_hide_email"] !== "off",
        hideCnic: settings["moderation_hide_cnic"] !== "off",
        hideBank: settings["moderation_hide_bank"] !== "off",
        hideAddress: settings["moderation_hide_address"] === "on",
      },
      alertConfig,
      performance: {
        p50Ms: getP50Ms(),
        p95Ms: getP95Ms(),
        p99Ms: getP99Ms(),
        dbLatencyMs: dbQueryMs,
        dbQueryMs,
        redisCacheHitRate: null,
        queueDepth: getIO()?.engine.clientsCount ?? 0,
        memoryPct,
        diskPct: diskPct || null,
        diskFreeGb,
        thresholds: { p95Ms: p95Alert, dbMs: dbMsAlert, memoryPct: memAlert, diskPct: diskAlert },
      },
      authLockouts: {
        adminIpLockouts,
        adminIpAttemptsInProgress,
        accountLockouts,
        config: { maxAttempts, lockoutMinutes: lockoutMin },
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /system/diagnostics ──────────────────────────────────────────────
   Service health cards, process counts, scheduler status.
─────────────────────────────────────────────────────────────────────────── */
router.get("/system/diagnostics", adminAuth, async (_req, res, next) => {
  try {
    const serviceDefs = [
      { key: "api", name: "API Server", port: 5000, path: "/api/health" },
      { key: "admin", name: "Admin Panel", port: 3000, path: "/" },
      { key: "vendor", name: "Vendor App", port: 3001, path: "/" },
      { key: "rider", name: "Rider App", port: 5173, path: "/" },
      { key: "mobile", name: "Expo / Mobile", port: 8081, path: "/" },
    ];

    const pingResults = await Promise.allSettled(
      serviceDefs.map((s) => pingLocalPort(s.port, s.path))
    );

    const services = serviceDefs.map((svc, i) => {
      const result = pingResults[i];
      if (result?.status === "fulfilled") {
        const { ok, latencyMs, error } = result.value;
        return {
          key: svc.key,
          name: svc.name,
          port: svc.port,
          status: ok ? "up" : "down",
          latencyMs: ok ? latencyMs : null,
          error: error ?? null,
        };
      }
      return {
        key: svc.key,
        name: svc.name,
        port: svc.port,
        status: "down",
        latencyMs: null,
        error: "ping failed",
      };
    });

    const servicesUp = services.filter((s) => s.status === "up").length;
    const processCounts = await getProcessCounts();
    const scheduler = getSchedulerStatus();

    sendSuccess(res, {
      services,
      servicesUp,
      servicesTotal: serviceDefs.length,
      processCounts,
      scheduler,
    });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /stats/active-users ───────────────────────────────────────────── */
router.get("/stats/active-users", adminAuth, async (_req, res, next) => {
  try {
    const [onlineRow] = await db
      .select({ c: count() })
      .from(usersTable)
      .where(eq(usersTable.isOnline, true));
    const [totalRow] = await db.select({ c: count() }).from(usersTable);

    sendSuccess(res, {
      online: Number(onlineRow?.c ?? 0),
      total: Number(totalRow?.c ?? 0),
    });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /stats/socket-connections ────────────────────────────────────── */
router.get("/stats/socket-connections", adminAuth, (_req, res, next) => {
  try {
    const io = getIO();
    const connected = io?.engine?.clientsCount ?? 0;
    sendSuccess(res, { connected });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /stats/storage ────────────────────────────────────────────────── */
router.get("/stats/storage", adminAuth, (_req, res, next) => {
  try {
    const freeGb = getDiskFreeGb();
    const pct = getDiskPct();
    const totalGb = freeGb != null && pct != null && pct > 0 ? freeGb / (1 - pct / 100) : null;
    const usedGb = totalGb != null && freeGb != null ? totalGb - freeGb : null;
    const status = pct == null ? "unknown" : pct > 90 ? "critical" : pct > 80 ? "warning" : "ok";

    sendSuccess(res, {
      status,
      usedGb: usedGb != null ? Math.round(usedGb * 10) / 10 : null,
      freeGb: freeGb != null ? Math.round(freeGb * 10) / 10 : null,
      totalGb: totalGb != null ? Math.round(totalGb * 10) / 10 : null,
      usedMb: usedGb != null ? Math.round(usedGb * 1024) : null,
      totalMb: totalGb != null ? Math.round(totalGb * 1024) : null,
      usedPct: pct,
    });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /stats/queue ──────────────────────────────────────────────────── */
router.get("/stats/queue", adminAuth, async (_req, res, next) => {
  try {
    const [pendingRow] = await db
      .select({ c: count() })
      .from(notificationsTable)
      .where(eq(notificationsTable.isRead, false));

    sendSuccess(res, {
      pending: Number(pendingRow?.c ?? 0),
      status: "ok",
    });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /stats/performance ────────────────────────────────────────────── */
router.get("/stats/performance", adminAuth, async (_req, res, next) => {
  try {
    let dbQueryMs: number | null = null;
    try {
      const t0 = Date.now();
      await db.execute(sql`SELECT 1`);
      dbQueryMs = Date.now() - t0;
    } catch (_e) {
      dbQueryMs = null;
    }

    const settings = await getCachedSettings();
    const p95Alert = parseInt(settings["perf_alert_p95_ms"] ?? "500", 10);
    const dbMsAlert = parseInt(settings["perf_alert_db_ms"] ?? "1000", 10);
    const memAlert = parseInt(settings["perf_alert_memory_pct"] ?? "80", 10);
    const diskAlert = parseInt(settings["perf_alert_disk_pct"] ?? "80", 10);

    const dbPool = pool ?? null;
    const dbPoolStats = dbPool
      ? {
          totalConnections: dbPool.totalCount,
          idleConnections: dbPool.idleCount,
          waitingClients: dbPool.waitingCount,
        }
      : null;

    sendSuccess(res, {
      p50Ms: getP50Ms(),
      p95Ms: getP95Ms(),
      p99Ms: getP99Ms(),
      dbQueryMs,
      memoryPct: getMemoryPct(),
      diskPct: getDiskPct(),
      diskFreeGb: getDiskFreeGb(),
      socketConnections: getIO()?.engine.clientsCount ?? 0,
      dbPool: dbPoolStats,
      thresholds: { p95Ms: p95Alert, dbMs: dbMsAlert, memoryPct: memAlert, diskPct: diskAlert },
    });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /stats — platform overview (used by admin dashboard) ──────────── */
router.get("/stats", adminAuth, async (_req, res, next) => {
  try {
    const [pendingOrdersRow] = await db
      .select({ c: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.status, "pending")));

    const [activeRidesRow] = await db
      .select({ c: count() })
      .from(ridesTable)
      .where(
        sql`${ridesTable.status} IN ('accepted','arrived','in_transit','searching','requested')`
      );

    const [totalRidersRow] = await db
      .select({ c: count() })
      .from(usersTable)
      .where(and(sql`${usersTable.roles} ILIKE '%rider%'`, sql`${usersTable.deletedAt} IS NULL`));

    const [totalVendorsRow] = await db
      .select({ c: count() })
      .from(usersTable)
      .where(and(sql`${usersTable.roles} ILIKE '%vendor%'`, sql`${usersTable.deletedAt} IS NULL`));

    const [revenueRow] = await db
      .select({
        total: sql<string>`COALESCE(sum(${walletTransactionsTable.amount}), 0)`,
      })
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.type, "credit"),
          sql`${walletTransactionsTable.reference} LIKE 'order_%'`
        )
      );

    sendSuccess(res, {
      pendingOrders: Number(pendingOrdersRow?.c ?? 0),
      activeRides: Number(activeRidesRow?.c ?? 0),
      totalRiders: Number(totalRidersRow?.c ?? 0),
      totalVendors: Number(totalVendorsRow?.c ?? 0),
      activeSos: 0,
      failedPayments: 0,
      revenue: {
        total: parseFloat(revenueRow?.total ?? "0"),
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router };
