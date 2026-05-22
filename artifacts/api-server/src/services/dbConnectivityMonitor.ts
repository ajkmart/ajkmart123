import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

/* ══════════════════════════════════════════════════════════════════════════
   dbConnectivityMonitor.ts
   Always-on, lightweight Neon DB connectivity monitor.

   Unlike healthAlertMonitor (which is opt-in via platform settings), this
   service starts automatically on every server boot. It:

   1. Runs an immediate connectivity check at startup and logs a clear
      banner showing Neon DB status + round-trip latency.

   2. Polls every DB_PING_INTERVAL_MS in the background. If the connection
      drops, it logs a loud ERROR on every failed attempt. When connectivity
      is restored, it logs an INFO recovery message with the outage duration.

   Signals: Listens for SIGTERM / SIGINT to stop the interval cleanly so
   in-flight queries can settle before the process exits.
══════════════════════════════════════════════════════════════════════════ */

const DB_PING_INTERVAL_MS = 60_000;
const DB_TIMEOUT_MS = 3_000;

let pingTimer: ReturnType<typeof setInterval> | null = null;
let dbWasDown = false;
let downSinceMs = 0;

function dbHost(): string {
  try {
    const url = process.env.DATABASE_URL ?? "";
    const host = new URL(url).hostname;
    return host || "unknown-host";
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return "unknown-host";
  }
}

async function pingDb(): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB ping timeout")), DB_TIMEOUT_MS)
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return { ok: false, latencyMs: Date.now() - t0 };
  }
}

async function runPeriodicPing(): Promise<void> {
  const { ok, latencyMs } = await pingDb();

  if (!ok) {
    if (!dbWasDown) {
      dbWasDown = true;
      downSinceMs = Date.now();
    }
    const outageSec = Math.round((Date.now() - downSinceMs) / 1000);
    logger.error(
      `[db:monitor] Connection lost — Neon DB unreachable (outage: ${outageSec}s). ` +
        `Check DATABASE_URL or Neon dashboard.`
    );
  } else if (dbWasDown) {
    const outageSec = Math.round((Date.now() - downSinceMs) / 1000);
    dbWasDown = false;
    logger.info(
      `[db:monitor] Connection restored — Neon DB back online after ${outageSec}s outage. ` +
        `Latency: ${latencyMs}ms`
    );
  }
}

/**
 * Runs an immediate connectivity check at startup and logs a clear banner.
 * Call this once inside runStartupTasks() after migrations complete.
 */
export async function checkDbOnStartup(): Promise<void> {
  const host = dbHost();
  const { ok, latencyMs } = await pingDb();

  if (ok) {
    logger.info(
      `[db:connect] Neon PostgreSQL connected — host: ${host}, round-trip: ${latencyMs}ms`
    );
  } else {
    logger.error(
      `[db:connect] FAILED to reach Neon PostgreSQL — host: ${host}. ` +
        `Server will continue but DB operations will fail. ` +
        `Verify DATABASE_URL in the Replit Secrets panel.`
    );
  }
}

/**
 * Starts the background periodic DB ping.
 * Safe to call multiple times — only one timer runs at a time.
 */
export function startDbMonitor(): void {
  if (pingTimer) return;

  pingTimer = setInterval(runPeriodicPing, DB_PING_INTERVAL_MS);

  const cleanup = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };
  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);

  logger.info(
    `[db:monitor] Started — pinging Neon every ${DB_PING_INTERVAL_MS / 1000}s. ` +
      `Alerts on connection drop / recovery.`
  );
}
