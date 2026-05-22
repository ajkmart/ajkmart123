import { db } from "@workspace/db";
import { idempotencyKeysTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export const IDEMPOTENCY_TTL_MS = 30 * 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

/**
 * Delete all idempotency_keys rows whose createdAt is older than TTL.
 * Emits a log line if any rows were removed.
 */
export async function purgeExpiredIdempotencyKeys(): Promise<void> {
  const cutoff = new Date(Date.now() - IDEMPOTENCY_TTL_MS);
  const deleted = await db
    .delete(idempotencyKeysTable)
    .where(sql`${idempotencyKeysTable.createdAt} < ${cutoff}`)
    .returning({ id: idempotencyKeysTable.id });

  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, `[idempotency] purged ${deleted.length} expired key(s)`);
  }
}

/**
 * Schedule a recurring cleanup of expired idempotency keys.
 * Call once at server startup. Returns the interval handle so tests can clear it.
 */
export function startIdempotencyKeyCleanup(): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await purgeExpiredIdempotencyKeys();
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "[idempotency] cleanup of expired keys failed");
    }
  }, CLEANUP_INTERVAL_MS);
}
