import { db } from "@workspace/db";
import {
  liveLocationsTable,
  locationHistoryTable,
  loginHistoryTable,
  magicLinkTokensTable,
  otpAttemptsTable,
  otpTokensTable,
  refreshTokensTable,
  rideBidsTable,
  userSessionsTable,
} from "@workspace/db/schema";
import { isNotNull, lt, or, sql } from "drizzle-orm";
import { purgeExpiredIdempotencyKeys } from "./lib/cleanupIdempotencyKeys.js";
import { logger } from "./lib/logger.js";
import { redisClient } from "./lib/redis.js";
import {
  isDispatchEngineRunning,
  startDispatchEngine,
  stopDispatchEngine,
} from "./routes/rides/dispatch.js";

/* ══════════════════════════════════════════════════════════════════════════
   scheduler.ts
   Central registry for all recurring background cleanup jobs.
   Call startScheduler() once at server startup (from index.ts).
   Call stopScheduler() in SIGTERM / SIGINT handlers to cleanly drain timers.

   Jobs managed here:
     1. Idempotency key expiry      — purge rows older than TTL (every 5 min)
     2. OTP attempt cleanup         — delete expired otp_attempts rows (every 5 min)
     3. Ride bid map cleanup        — delete stale ride_bids for non-pending rides (every 30 min)
     4. Refresh token cleanup       — delete expired refresh_tokens rows (every 60 min)
     5. Magic link token cleanup    — delete expired magic_link_tokens rows (every 30 min)
     6. Pending OTP cleanup         — delete expired pending_otps rows (every 15 min)
     7. User session cleanup        — delete expired/revoked user_sessions rows (every 60 min)
     8. Stale location cleanup      — delete live_locations older than 2 hours (every 30 min)
     9. Login history archival      — delete login_history older than 90 days (every 24 hours)
    10. Location history cleanup    — delete location_history older than 30 days (every 24 hours)
══════════════════════════════════════════════════════════════════════════ */

interface RegisteredJob {
  name: string;
  intervalMs: number;
  startedAt: Date;
}

/* ── Distributed lock helper ─────────────────────────────────────────────────
   Uses Redis SET NX PX to acquire a short-lived lock keyed by job label so
   only one server instance runs each cleanup job at a time in a multi-instance
   deployment.  When Redis is unavailable (redisClient === null) the lock is
   skipped and the job runs normally — graceful single-node degradation. */
async function withDistributedLock(
  label: string,
  intervalMs: number,
  fn: () => Promise<void>
): Promise<void> {
  if (!redisClient) {
    await fn();
    return;
  }
  const lockKey = `scheduler:lock:${label}`;
  /* TTL = 80% of the interval so the lock always expires before the next tick,
     with a minimum of 30 s so fast jobs don't release the lock too early. */
  const ttlMs = Math.max(30_000, Math.floor(intervalMs * 0.8));
  let acquired = false;
  let result: string | null = null;
  try {
    result = await redisClient.set(lockKey, "1", "PX", ttlMs, "NX");
  } catch (redisErr) {
    /* Redis command failed (connection drop / timeout) — run without lock so
       the job still executes in degraded mode rather than being silently skipped. */
    logger.warn(
      { err: (redisErr as Error).message, job: label },
      "[scheduler] Redis lock acquire failed — running without lock (degraded)"
    );
    await fn();
    return;
  }
  acquired = result === "OK";
  if (!acquired) {
    logger.debug({ job: label }, "[scheduler] lock held by another instance — skipping");
    return;
  }
  try {
    await fn();
  } finally {
    redisClient.del(lockKey).catch((e: Error) =>
      logger.warn({ err: e.message, job: label }, "[scheduler] lock release failed")
    );
  }
}

const _timers: ReturnType<typeof setInterval>[] = [];
const _registeredJobs: RegisteredJob[] = [];

function register(
  label: string,
  fn: () => Promise<void>,
  intervalMs: number
): ReturnType<typeof setInterval> {
  _registeredJobs.push({ name: label, intervalMs, startedAt: new Date() });

  /* Wrap fn with the distributed lock so only one instance runs each job
     when Redis is available. Falls back to direct execution when Redis is null. */
  const lockedFn = () => withDistributedLock(label, intervalMs, fn);

  // Execute first run with retry logic
  let retries = 0;
  const maxRetries = 3;
  const retryDelay = 5000; // 5 seconds

  const executeWithRetry = async (): Promise<void> => {
    try {
      await lockedFn();
      retries = 0; // Reset on success
      logger.debug({ job: label }, "[scheduler] first-run completed successfully");
    } catch (e: unknown) {
      const err = e as Error;
      if (++retries < maxRetries) {
        logger.warn(
          { err: err.message, job: label, retries, maxRetries },
          "[scheduler] first-run failed, scheduling retry"
        );
        setTimeout(executeWithRetry, retryDelay);
      } else {
        logger.error(
          { err: err.message, job: label, retries },
          "[scheduler] first-run failed permanently after retries"
        );
      }
    }
  };

  void executeWithRetry();

  const handle = setInterval(async () => {
    try {
      await lockedFn();
    } catch (e: unknown) {
      const err = e as Error;
      logger.error(
        { err: err.message, job: label, stack: err.stack },
        "[scheduler] cleanup job failed"
      );
    }
  }, intervalMs);

  _timers.push(handle);
  return handle;
}

/* ── Job implementations ─────────────────────────────────────────────────── */

async function purgeExpiredOtpAttempts(): Promise<void> {
  const deleted = await db
    .delete(otpAttemptsTable)
    .where(sql`expires_at < now()`)
    .returning({ key: otpAttemptsTable.key });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "[scheduler] purged expired OTP attempt rows");
  } else {
    logger.debug("[scheduler] otp-attempt cleanup ran, 0 rows removed");
  }
}

async function purgeStaleRideBids(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(rideBidsTable)
    .where(lt(rideBidsTable.createdAt, cutoff))
    .returning({ id: rideBidsTable.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "[scheduler] purged stale ride bid rows");
  } else {
    logger.debug("[scheduler] ride-bid cleanup ran, 0 rows removed");
  }
}

async function purgeExpiredRefreshTokens(): Promise<void> {
  const deleted = await db
    .delete(refreshTokensTable)
    .where(sql`expires_at < now()`)
    .returning({ id: refreshTokensTable.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "[scheduler] purged expired refresh token rows");
  } else {
    logger.debug("[scheduler] refresh-token cleanup ran, 0 rows removed");
  }
}

async function purgeExpiredMagicLinkTokens(): Promise<void> {
  const deleted = await db
    .delete(magicLinkTokensTable)
    .where(sql`expires_at < now()`)
    .returning({ id: magicLinkTokensTable.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "[scheduler] purged expired magic link token rows");
  } else {
    logger.debug("[scheduler] magic-link-token cleanup ran, 0 rows removed");
  }
}

async function purgeExpiredOtpTokens(): Promise<void> {
  const deleted = await db
    .delete(otpTokensTable)
    .where(sql`expires_at < now()`)
    .returning({ id: otpTokensTable.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "[scheduler] purged expired otp_tokens rows");
  } else {
    logger.debug("[scheduler] otp-token cleanup ran, 0 rows removed");
  }
}

async function purgeExpiredUserSessions(): Promise<void> {
  const inactiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(userSessionsTable)
    .where(
      or(isNotNull(userSessionsTable.revokedAt), lt(userSessionsTable.lastActiveAt, inactiveCutoff))
    )
    .returning({ id: userSessionsTable.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "[scheduler] purged expired user session rows");
  } else {
    logger.debug("[scheduler] user-session cleanup ran, 0 rows removed");
  }
}

async function purgeStaleLocations(): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const deleted = await db
    .delete(liveLocationsTable)
    .where(sql`role = 'rider' AND updated_at < ${cutoff}`)
    .returning({ userId: liveLocationsTable.userId });
  if (deleted.length > 0) {
    logger.info(
      { count: deleted.length },
      "[scheduler] purged stale live location rows for inactive riders"
    );
  } else {
    logger.debug("[scheduler] live-location cleanup ran, 0 rows removed");
  }
}

async function purgeOldLocationHistory(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(locationHistoryTable)
    .where(lt(locationHistoryTable.createdAt, cutoff))
    .returning({ id: locationHistoryTable.id });
  if (deleted.length > 0) {
    logger.info(
      { count: deleted.length },
      "[scheduler] purged old location_history rows (>30 days)"
    );
  } else {
    logger.debug("[scheduler] location-history cleanup ran, 0 rows removed");
  }
}

async function archiveOldLoginHistory(): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(loginHistoryTable)
    .where(lt(loginHistoryTable.createdAt, cutoff))
    .returning({ id: loginHistoryTable.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "[scheduler] archived old login history rows");
  } else {
    logger.debug("[scheduler] login-history archival ran, 0 rows removed");
  }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

const ALL_JOBS = [
  "idempotency-key-expiry",
  "otp-attempt-cleanup",
  "ride-bid-map-cleanup",
  "refresh-token-cleanup",
  "magic-link-token-cleanup",
  "otp-token-cleanup",
  "user-session-cleanup",
  "live-location-cleanup",
  "login-history-archival",
  "location-history-cleanup",
];

export function startScheduler(): void {
  register("idempotency-key-expiry", purgeExpiredIdempotencyKeys, 5 * 60_000);
  register("otp-attempt-cleanup", purgeExpiredOtpAttempts, 5 * 60_000);
  register("ride-bid-map-cleanup", purgeStaleRideBids, 30 * 60_000);
  register("refresh-token-cleanup", purgeExpiredRefreshTokens, 60 * 60_000);
  register("magic-link-token-cleanup", purgeExpiredMagicLinkTokens, 30 * 60_000);
  register("otp-token-cleanup", purgeExpiredOtpTokens, 30 * 60_000);
  register("user-session-cleanup", purgeExpiredUserSessions, 60 * 60_000);
  register("live-location-cleanup", purgeStaleLocations, 30 * 60_000);
  register("login-history-archival", archiveOldLoginHistory, 24 * 60 * 60_000);
  register("location-history-cleanup", purgeOldLocationHistory, 24 * 60 * 60_000);
  startDispatchEngine();
  logger.info({ jobs: ALL_JOBS }, "[scheduler] started (dispatch engine active)");
}

export function stopScheduler(): void {
  for (const handle of _timers) {
    clearInterval(handle);
  }
  _timers.length = 0;
  _registeredJobs.length = 0;
  stopDispatchEngine();
  logger.info("[scheduler] all timers cleared");
}

export function getSchedulerStatus(): {
  running: boolean;
  activeTimers: number;
  jobs: Array<{ name: string; intervalLabel: string; startedAt: string }>;
  dispatchEngineActive: boolean;
} {
  function fmtInterval(ms: number): string {
    if (ms < 60_000) return `${ms / 1000}s`;
    if (ms < 3_600_000) return `${ms / 60_000}m`;
    return `${ms / 3_600_000}h`;
  }
  return {
    running: _timers.length > 0,
    activeTimers: _timers.length,
    jobs: _registeredJobs.map((j) => ({
      name: j.name,
      intervalLabel: fmtInterval(j.intervalMs),
      startedAt: j.startedAt.toISOString(),
    })),
    dispatchEngineActive: isDispatchEngineRunning(),
  };
}
