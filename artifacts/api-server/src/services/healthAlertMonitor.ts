import { db } from "@workspace/db";
import { liveLocationsTable, platformSettingsTable } from "@workspace/db/schema";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getDiskStats, getMemoryPct, getP95Ms } from "../lib/metrics/responseTime.js";
import { getCachedSettings } from "../routes/admin-shared.js";
import { sendAdminAlert } from "./email.js";

/* ══════════════════════════════════════════════════════════════════════════
   healthAlertMonitor.ts
   Background health-check service that runs on a configurable interval and
   sends email + Slack alerts when critical issues are detected.

   Enabled/disabled via platform setting  health_monitor_enabled = "on"/"off".
   Safe default is "off" (opt-in). Enable in Admin → Settings → health_monitor.

   Deduplication: tracks per-issue "last alerted" timestamps so the same
   issue doesn't flood the channel. Re-alerts only after the snooze period
   (health_monitor_snooze_min, default 60 min).

   Graceful shutdown: registers SIGTERM / SIGINT handlers that clear the
   interval timer before the process exits, allowing any in-flight DB queries
   to settle naturally.
══════════════════════════════════════════════════════════════════════════ */

interface HealthIssue {
  key: string;
  level: "error" | "warning";
  message: string;
}

const lastAlertMs = new Map<string, number>();
let monitorTimer: ReturnType<typeof setInterval> | null = null;

async function runHealthChecks(): Promise<HealthIssue[]> {
  const s = await getCachedSettings();
  const now = new Date();
  const issues: HealthIssue[] = [];

  /* ── Database connectivity ── */
  let dbOk = true;
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    dbOk = false;
  }
  if (!dbOk) {
    issues.push({
      key: "db_down",
      level: "error",
      message: "Database connection failed — the server cannot reach PostgreSQL",
    });
  }

  /* ── Content moderation config ── */
  const rawPatterns = s["moderation_custom_patterns"] ?? "";
  if (rawPatterns) {
    let valid = true;
    try {
      const parsed = JSON.parse(rawPatterns);
      if (!Array.isArray(parsed)) valid = false;
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      valid = false;
    }
    if (!valid) {
      issues.push({
        key: "malformed_patterns",
        level: "error",
        message:
          "Content moderation: custom patterns JSON is malformed — all custom rules are inactive",
      });
    }
  }

  /* ── GPS tracking ── */
  if ((s["feature_live_tracking"] ?? "on") === "off") {
    issues.push({
      key: "live_tracking_off",
      level: "warning",
      message: "Live GPS tracking is disabled — rider positions will not update",
    });
  } else {
    /* Check for stale GPS pings — more than half of live riders haven't pinged */
    try {
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const [[liveRow], [recentRow]] = await Promise.all([
        db
          .select({ c: count() })
          .from(liveLocationsTable)
          .where(eq(liveLocationsTable.role, "rider")),
        db
          .select({ c: count() })
          .from(liveLocationsTable)
          .where(
            and(eq(liveLocationsTable.role, "rider"), gte(liveLocationsTable.updatedAt, fiveMinAgo))
          ),
      ]);
      const liveTotal = Number(liveRow?.c ?? 0);
      const recentTotal = Number(recentRow?.c ?? 0);
      const stale = liveTotal - recentTotal;
      if (liveTotal >= 5 && stale > liveTotal / 2) {
        issues.push({
          key: "gps_stale_majority",
          level: "warning",
          message: `GPS degraded: ${stale} of ${liveTotal} live riders have not pinged in the last 5 minutes`,
        });
      }
    } catch (err) {
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        `[fn] Non-fatal — GPS table query failure shouldn't stop other checks`
      );
    }
  }

  /* ── Maintenance mode ── */
  if ((s["app_status"] ?? "active") === "maintenance") {
    issues.push({
      key: "maintenance_mode",
      level: "warning",
      message: "App is in maintenance mode — customers cannot access the platform",
    });
  }

  /* ── SOS feature disabled ── */
  if ((s["feature_sos"] ?? "on") === "off") {
    issues.push({
      key: "sos_disabled",
      level: "warning",
      message: "SOS alerts feature is disabled — riders/customers cannot send emergency alerts",
    });
  }

  return issues;
}

/* ── Performance metrics check ────────────────────────────────────────────── */
async function checkPerformanceMetrics(s: Record<string, string>): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];

  const thresholdP95Ms = Math.max(1, parseInt(s["perf_alert_p95_ms"] ?? "500", 10));
  /* Use the same key as the dashboard (perf_alert_db_ms) so admin-set thresholds are respected */
  const thresholdDbMs = Math.max(1, parseInt(s["perf_alert_db_ms"] ?? "1000", 10));
  const thresholdMemPct = Math.max(1, parseInt(s["perf_alert_memory_pct"] ?? "80", 10));
  const thresholdDiskPct = Math.max(1, parseInt(s["perf_alert_disk_pct"] ?? "80", 10));

  /* ── p95 response time ── */
  const p95 = getP95Ms();
  if (p95 != null && p95 > thresholdP95Ms) {
    issues.push({
      key: "perf_p95_high",
      level: "error",
      message: `API p95 response time is ${p95}ms — exceeds threshold of ${thresholdP95Ms}ms`,
    });
  }

  /* ── DB query latency probe ── */
  try {
    const t0 = Date.now();
    await db.select({ c: count() }).from(platformSettingsTable);
    const dbMs = Date.now() - t0;
    if (dbMs > thresholdDbMs) {
      issues.push({
        key: "perf_db_slow",
        level: "error",
        message: `DB query latency is ${dbMs}ms — exceeds threshold of ${thresholdDbMs}ms`,
      });
    }
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[fn] DB connectivity failures are already caught in the main health check`
    );
  }

  /* ── Memory usage ── */
  const memPct = getMemoryPct();
  if (memPct > thresholdMemPct) {
    issues.push({
      key: "perf_memory_high",
      level: "error",
      message: `Heap memory usage is ${memPct}% — exceeds threshold of ${thresholdMemPct}%`,
    });
  }

  /* ── Disk usage — use cached getDiskStats to avoid a redundant statfsSync call ── */
  const diskPct = getDiskStats().pct;
  if (diskPct != null && diskPct > thresholdDiskPct) {
    issues.push({
      key: "perf_disk_high",
      level: "error",
      message: `Disk usage is ${diskPct}% — exceeds threshold of ${thresholdDiskPct}%`,
    });
  }

  return issues;
}

async function sendSlackAlert(
  webhookUrl: string,
  issues: HealthIssue[],
  appName: string
): Promise<void> {
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const parts = [
    errors.length > 0 ? `${errors.length} error${errors.length > 1 ? "s" : ""}` : "",
    warnings.length > 0 ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  const summary = parts.join(", ");

  const bulletList = issues
    .map((i) => `${i.level === "error" ? "🔴" : "🟡"} ${i.message}`)
    .join("\n");

  const payload = {
    text: `⚠️ ${appName} Health Alert — ${summary} detected`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `⚠️ ${appName} Health Alert`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${summary} detected* at ${new Date().toUTCString()}\n\n${bulletList}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Sent by the AJKMart health monitor. Log in to the admin panel to investigate.",
          },
        ],
      },
    ],
  };

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "[health-monitor] Slack webhook returned non-OK status");
    } else {
      logger.info({ issueCount: issues.length }, "[health-monitor] Slack alert sent");
    }
  } catch (err: unknown) {
    logger.warn({ err: (err as Error).message }, "[health-monitor] Slack webhook fetch failed");
  }
}

async function runMonitorCycle(): Promise<void> {
  try {
    const s = await getCachedSettings();
    const snoozeMin = Math.max(1, parseInt(s["health_monitor_snooze_min"] ?? "60", 10));
    const snoozeMs = snoozeMin * 60 * 1000;
    const appName = s["app_name"] ?? "AJKMart";
    const slackWebhook = s["health_alert_slack_webhook"]?.trim() ?? "";

    const [baseIssues, perfIssues] = await Promise.all([
      runHealthChecks(),
      checkPerformanceMetrics(s),
    ]);
    const allIssues = [...baseIssues, ...perfIssues];

    /* Only send alerts for error-level issues (warnings shown on dashboard only) */
    const alertableIssues = allIssues.filter((i) => i.level === "error");

    /* Clear resolved issues from snooze tracking */
    const activeKeys = new Set(alertableIssues.map((i) => i.key));
    for (const key of lastAlertMs.keys()) {
      if (!activeKeys.has(key)) lastAlertMs.delete(key);
    }

    /* Determine which issues need alerting now (new or past snooze) */
    const now = Date.now();
    const toAlert: HealthIssue[] = [];
    for (const issue of alertableIssues) {
      const lastSent = lastAlertMs.get(issue.key) ?? 0;
      if (now - lastSent >= snoozeMs) {
        toAlert.push(issue);
        lastAlertMs.set(issue.key, now);
      }
    }

    if (toAlert.length === 0) return;

    const issueWord = toAlert.length > 1 ? "issues" : "issue";
    const subject = `Health Alert: ${toAlert.length} critical ${issueWord} detected`;

    const adminUrl =
      s["admin_base_url"]?.replace(/\/$/, "") || s["app_base_url"]?.replace(/\/$/, "") || "";
    const dashboardLink = `${adminUrl}/admin/health-dashboard`;

    const htmlBody = `
      <h3 style="color:#dc2626;margin:0 0 12px;">⚠️ Critical System Issue${toAlert.length > 1 ? "s" : ""} Detected</h3>
      <p style="color:#374151;margin:0 0 16px;">
        The <strong>${appName}</strong> health monitor detected the following critical
        ${issueWord} at <strong>${new Date().toUTCString()}</strong>:
      </p>
      <ul style="padding-left:20px;margin:0 0 20px;">
        ${toAlert.map((i) => `<li style="margin:8px 0;color:#111827;">${i.message}</li>`).join("")}
      </ul>
      ${
        dashboardLink
          ? `<p style="margin:0 0 16px;">
              <a href="${dashboardLink}"
                 style="background:#1e40af;color:#fff;padding:10px 18px;border-radius:6px;
                        text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">
                View Health Dashboard →
              </a>
            </p>`
          : ""
      }
      <p style="color:#6b7280;font-size:12px;margin:0;">
        This alert will not repeat for ${snoozeMin} minute${snoozeMin === 1 ? "" : "s"} unless the issue persists.
      </p>
    `;

    /* Email */
    const emailResult = await sendAdminAlert("health_critical", subject, htmlBody, {
      ...s,
      email_alert_health_critical: s["email_alert_health_critical"] ?? "on",
    });
    if (emailResult.sent) {
      logger.info({ subject }, "[health-monitor] email alert sent");
    } else if (emailResult.reason && !emailResult.reason.includes("disabled")) {
      logger.warn({ reason: emailResult.reason }, "[health-monitor] email alert skipped");
    }

    /* Slack */
    if (slackWebhook) {
      await sendSlackAlert(slackWebhook, toAlert, appName);
    }
  } catch (err: unknown) {
    logger.warn({ err: (err as Error).message }, "[health-monitor] monitor cycle error");
  }
}

/** Stop the health monitor and clear the interval timer. */
export function stopHealthMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    logger.info("[health-monitor] stopped via stopHealthMonitor()");
  }
}

export function startHealthMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }

  /* Defer first check by 30 s to let the server warm up after startup */
  const initialDelay = 30_000;

  const scheduleLoop = async () => {
    try {
      const s = await getCachedSettings();

      if ((s["health_monitor_enabled"] ?? "off") !== "on") {
        logger.info(
          "[health-monitor] disabled (health_monitor_enabled=off). " +
            "Enable in Admin → Settings → health_monitor to receive alerts."
        );
        return;
      }

      const intervalMin = Math.max(1, parseInt(s["health_monitor_interval_min"] ?? "5", 10));
      const intervalMs = intervalMin * 60 * 1000;
      logger.info({ intervalMin }, "[health-monitor] started");

      await runMonitorCycle();

      monitorTimer = setInterval(async () => {
        try {
          const cs = await getCachedSettings();
          if ((cs["health_monitor_enabled"] ?? "off") !== "on") {
            if (monitorTimer) {
              clearInterval(monitorTimer);
              monitorTimer = null;
            }
            logger.info("[health-monitor] disabled mid-run — interval stopped");
            return;
          }
          await runMonitorCycle();
        } catch (e: unknown) {
          logger.warn({ err: (e as Error).message }, "[health-monitor] interval error");
        }
      }, intervalMs);
    } catch (err: unknown) {
      logger.warn({ err: (err as Error).message }, "[health-monitor] startup failed");
    }
  };

  setTimeout(scheduleLoop, initialDelay);

  /* Graceful shutdown: clear the interval before the process exits so any
     in-flight DB queries can settle within the OS's signal-handling window. */
  const shutdown = () => {
    stopHealthMonitor();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
