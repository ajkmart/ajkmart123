import { db } from "@workspace/db";
import { otpAttemptsTable, otpTokensTable } from "@workspace/db/schema";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { OTP_CONFIG } from "./otp.config.js";
import type { OtpAttemptStatus, OtpChannel, OtpIdentifierType, OtpType } from "./otp.types.js";

// ─── Save Token ────────────────────────────────────────────────────────────────

export async function saveOtpToken(options: {
  identifier: string;
  identifierType: OtpIdentifierType;
  otpType: OtpType;
  otpHash: string;
  channel: OtpChannel;
  userId?: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  ttlMs?: number;
}): Promise<string> {
  const {
    identifier,
    identifierType,
    otpType,
    otpHash,
    channel,
    userId,
    ipAddress,
    deviceFingerprint,
    ttlMs = OTP_CONFIG.TTL_MS,
  } = options;

  const expiresAt = new Date(Date.now() + ttlMs);
  const id = crypto.randomUUID();

  // Invalidate any previous unused tokens for same identifier + type
  await db
    .update(otpTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(otpTokensTable.identifier, identifier),
        eq(otpTokensTable.identifierType, identifierType),
        eq(otpTokensTable.otpType, otpType),
        isNull(otpTokensTable.usedAt)
      )
    );

  await db.insert(otpTokensTable).values({
    id,
    identifier,
    identifierType,
    otpType,
    otpHash,
    expiresAt,
    channel,
    userId: userId ?? null,
    ipAddress: ipAddress ?? null,
    deviceFingerprint: deviceFingerprint ?? null,
  });

  logger.info(
    { identifier: maskIdentifier(identifier), identifierType, otpType, channel },
    "[otp:store] Token saved"
  );

  return id;
}

// ─── Get Active Token ──────────────────────────────────────────────────────────

export async function getActiveOtpToken(options: {
  identifier: string;
  identifierType: OtpIdentifierType;
  otpType: OtpType;
}) {
  const { identifier, identifierType, otpType } = options;
  const now = new Date();

  const rows = await db
    .select()
    .from(otpTokensTable)
    .where(
      and(
        eq(otpTokensTable.identifier, identifier),
        eq(otpTokensTable.identifierType, identifierType),
        eq(otpTokensTable.otpType, otpType),
        isNull(otpTokensTable.usedAt),
        gt(otpTokensTable.expiresAt, now)
      )
    )
    .orderBy(sql`${otpTokensTable.createdAt} DESC`)
    .limit(1);

  return rows[0] ?? null;
}

// ─── Mark Token Used ───────────────────────────────────────────────────────────

export async function markOtpUsed(tokenId: string): Promise<void> {
  await db
    .update(otpTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(otpTokensTable.id, tokenId), isNull(otpTokensTable.usedAt)));
}

// ─── Rate Limit: Count Recent Sends ───────────────────────────────────────────

export async function countRecentSends(
  identifier: string,
  identifierType: OtpIdentifierType,
  windowMs: number
): Promise<number> {
  const since = new Date(Date.now() - windowMs);

  const result = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(otpTokensTable)
    .where(
      and(
        eq(otpTokensTable.identifier, identifier),
        eq(otpTokensTable.identifierType, identifierType),
        gt(otpTokensTable.createdAt, since)
      )
    );

  return result[0]?.count ?? 0;
}

// ─── Resend Cooldown Check ─────────────────────────────────────────────────────

export async function getLastSentAt(
  identifier: string,
  identifierType: OtpIdentifierType,
  otpType: OtpType
): Promise<Date | null> {
  const rows = await db
    .select({ createdAt: otpTokensTable.createdAt })
    .from(otpTokensTable)
    .where(
      and(
        eq(otpTokensTable.identifier, identifier),
        eq(otpTokensTable.identifierType, identifierType),
        eq(otpTokensTable.otpType, otpType)
      )
    )
    .orderBy(sql`${otpTokensTable.createdAt} DESC`)
    .limit(1);

  return rows[0]?.createdAt ?? null;
}

// ─── Attempt Tracking ──────────────────────────────────────────────────────────

export async function getAttemptStatus(identifier: string): Promise<OtpAttemptStatus> {
  const now = new Date();

  const rows = await db
    .select()
    .from(otpAttemptsTable)
    .where(and(eq(otpAttemptsTable.key, identifier), gt(otpAttemptsTable.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return { blocked: false, attemptsLeft: OTP_CONFIG.MAX_ATTEMPTS };

  const isBlocked = row.count >= OTP_CONFIG.MAX_ATTEMPTS;
  return {
    blocked: isBlocked,
    attemptsLeft: Math.max(0, OTP_CONFIG.MAX_ATTEMPTS - row.count),
    unlocksAt: isBlocked ? row.expiresAt : undefined,
  };
}

export async function recordAttempt(
  identifier: string,
  success: boolean
): Promise<OtpAttemptStatus> {
  if (success) {
    await db.delete(otpAttemptsTable).where(eq(otpAttemptsTable.key, identifier));
    return { blocked: false, attemptsLeft: OTP_CONFIG.MAX_ATTEMPTS };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_CONFIG.LOCKOUT_DURATION_MS);

  // Upsert: increment count or insert fresh row
  await db
    .insert(otpAttemptsTable)
    .values({ key: identifier, count: 1, firstAt: now, expiresAt })
    .onConflictDoUpdate({
      target: otpAttemptsTable.key,
      set: {
        count: sql`${otpAttemptsTable.count} + 1`,
        expiresAt,
      },
    });

  const updated = await db
    .select()
    .from(otpAttemptsTable)
    .where(eq(otpAttemptsTable.key, identifier))
    .limit(1);

  const row = updated[0];
  if (!row) return { blocked: false, attemptsLeft: OTP_CONFIG.MAX_ATTEMPTS - 1 };

  const isBlocked = row.count >= OTP_CONFIG.MAX_ATTEMPTS;
  return {
    blocked: isBlocked,
    attemptsLeft: Math.max(0, OTP_CONFIG.MAX_ATTEMPTS - row.count),
    unlocksAt: isBlocked ? row.expiresAt : undefined,
  };
}

// ─── Cleanup (called by scheduler) ────────────────────────────────────────────

export async function cleanupExpiredTokens(): Promise<number> {
  const now = new Date();
  const usedCutoff = new Date(now.getTime() - OTP_CONFIG.CLEANUP_USED_AFTER_MS);

  const result = await db.delete(otpTokensTable).where(
    sql`(${otpTokensTable.usedAt} IS NULL AND ${otpTokensTable.expiresAt} < ${now})
       OR (${otpTokensTable.usedAt} IS NOT NULL AND ${otpTokensTable.usedAt} < ${usedCutoff})`
  );

  const deleted = (result as unknown as { rowCount?: number }).rowCount ?? 0;

  if (deleted > 0) {
    logger.info({ deleted }, "[otp:cleanup] Expired/used tokens removed");
  }

  // Also clean up expired attempt records
  await db.delete(otpAttemptsTable).where(lt(otpAttemptsTable.expiresAt, now));

  return deleted;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function maskIdentifier(identifier: string): string {
  if (identifier.includes("@")) {
    const [local, domain] = identifier.split("@");
    return `${local?.slice(0, 2)}***@${domain}`;
  }
  if (identifier.length >= 7) {
    return `${identifier.slice(0, 3)}****${identifier.slice(-2)}`;
  }
  return "***";
}
