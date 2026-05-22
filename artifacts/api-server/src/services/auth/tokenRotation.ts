import { db } from "@workspace/db";
import { refreshTokensTable, usersTable } from "@workspace/db/schema";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { fireAndForget } from "../../lib/fireAndForget.js";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import {
  addSecurityEvent,
  generateRefreshToken,
  getAccessTokenTtlSec,
  getCachedSettings,
  getRefreshTokenTtlDays,
  signAccessToken,
  writeAuthAuditLog,
} from "../../middleware/security.js";

export interface RotationResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  newRefreshHash: string;
}

export type UserForRotation = {
  id: string;
  phone: string | null;
  roles: string | null;
  tokenVersion: number | null;
  authMethod?: string | null;
};

/**
 * Rotate a refresh token.
 * - Stamps usedAt on the old token and marks it revoked (revokedReason='ROTATED').
 * - Issues a new access token + refresh token.
 * - The new refresh token inherits the same tokenFamilyId so the family
 *   chain stays intact for reuse-detection.
 * - Returns the new tokens and the new token hash so the caller can persist
 *   the new refresh token record.
 */
export async function rotateRefreshToken(
  oldToken: typeof refreshTokensTable.$inferSelect,
  user: UserForRotation,
  ip: string
): Promise<RotationResult> {
  const now = new Date();

  await db
    .update(refreshTokensTable)
    .set({ revokedAt: now, revoked: true, revokedReason: "ROTATED" })
    .where(eq(refreshTokensTable.tokenHash, oldToken.tokenHash));

  const newAccessToken = signAccessToken(
    user.id,
    user.phone ?? "",
    user.roles ?? "customer",
    user.roles ?? "customer",
    user.tokenVersion ?? 0
  );

  const { raw: newRefreshRaw, hash: newRefreshHash } = generateRefreshToken();
  const newRefreshExpiresAt = new Date(Date.now() + getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000);

  const familyId = oldToken.tokenFamilyId ?? crypto.randomUUID();

  await db.insert(refreshTokensTable).values({
    id: generateId(),
    userId: user.id,
    tokenHash: newRefreshHash,
    authMethod: oldToken.authMethod ?? null,
    tokenFamilyId: familyId,
    revoked: false,
    expiresAt: newRefreshExpiresAt,
  });

  logger.info({ userId: user.id, ip }, "[AUDIT:AUTH] Refresh token rotated");

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshRaw,
    expiresAt: new Date(Date.now() + getAccessTokenTtlSec() * 1000).toISOString(),
    newRefreshHash,
  };
}

/**
 * Invalidate every refresh token that belongs to the same token family.
 * Called when suspicious reuse is detected (possible token theft).
 */
export async function invalidateTokenFamily(
  tokenFamilyId: string,
  userId: string,
  reason: string,
  ip: string
): Promise<void> {
  if (!tokenFamilyId) return;

  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date(), revoked: true, revokedReason: reason })
    .where(
      and(
        eq(refreshTokensTable.tokenFamilyId, tokenFamilyId),
        eq(refreshTokensTable.userId, userId)
      )
    );

  addSecurityEvent({
    type: "refresh_token_family_invalidated",
    ip,
    userId,
    details: `Token family invalidated — reason: ${reason}`,
    severity: "high",
  });

  logger.error({ userId, tokenFamilyId, reason, ip }, "[SECURITY] Token family fully invalidated");
}

export class TokenFamilyBreachError extends Error {
  constructor(
    public readonly userId: string,
    public readonly familyId: string
  ) {
    super("TOKEN_FAMILY_BREACH");
    this.name = "TokenFamilyBreachError";
  }
}

/**
 * Detects replay attacks by checking if a refresh token has already been used.
 *
 * Flow:
 *  - If `usedAt` is already set → token was replayed → mark entire family as revoked
 *    with FAMILY_BREACH_DETECTED and throw TokenFamilyBreachError.
 *  - If `usedAt` is null → first use → stamp it now to mark it as consumed.
 *
 * Returns the token record so the caller can read `tokenFamilyId` for chaining.
 */
export async function detectAndInvalidateFamily(
  tokenHash: string
): Promise<typeof refreshTokensTable.$inferSelect> {
  const [rt] = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (!rt) {
    throw new Error("Refresh token record not found");
  }

  if (rt.usedAt != null) {
    const familyId = rt.tokenFamilyId;

    logger.error(
      { userId: rt.userId, familyId, tokenHash: tokenHash.slice(0, 16) },
      "[SECURITY:BREACH] Token replay detected! Revoking entire token family."
    );

    if (familyId) {
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date(), revoked: true, revokedReason: "FAMILY_BREACH_DETECTED" })
        .where(eq(refreshTokensTable.tokenFamilyId, familyId));
    } else {
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date(), revoked: true, revokedReason: "FAMILY_BREACH_DETECTED" })
        .where(
          and(eq(refreshTokensTable.userId, rt.userId), eq(refreshTokensTable.tokenHash, tokenHash))
        );
    }

    addSecurityEvent({
      type: "token_family_breach",
      ip: "server",
      userId: rt.userId,
      details: `Token replay detected. Family ${familyId ?? "unknown"} fully revoked. Token hash prefix: ${tokenHash.slice(0, 16)}`,
      severity: "critical",
    });

    await writeAuthAuditLog("token_family_breach", {
      userId: rt.userId,
      metadata: { familyId, hashPrefix: tokenHash.slice(0, 16) },
    });

    fireAndForget(
      sendBreachNotification(rt.userId, familyId ?? "unknown"),
      "tokenRotation:breach-notification",
      logger,
      { userId: rt.userId, code: "TOKEN_BREACH_NOTIF_FAILED" }
    );

    throw new TokenFamilyBreachError(rt.userId, familyId ?? "unknown");
  }

  await db
    .update(refreshTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(refreshTokensTable.tokenHash, tokenHash));

  return rt;
}

/**
 * Builds the HTML email body for a token-family breach notification.
 * Extracted from sendBreachNotification so it can be tested and reused independently.
 */
export function buildBreachNotificationEmail(opts: {
  userName: string | null | undefined;
  appName: string;
  detectedAt: string;
  familyId: string;
}): string {
  const { userName, appName, detectedAt, familyId } = opts;
  const greeting = userName ? ` ${userName}` : "";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626;">Security Alert</h2>
      <p>Hello${greeting},</p>
      <p>We detected that your ${appName} session token was used more than once, which may indicate that your account credentials were stolen.</p>
      <p><strong>All active sessions have been immediately revoked</strong> to protect your account.</p>
      <p>If you did not attempt to log in, please change your password immediately and contact support.</p>
      <p style="color: #6b7280; font-size: 13px;">
        Detected at: ${detectedAt}<br/>
        Family ID: ${familyId}
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px;">— ${appName} Security Team</p>
    </div>
  `;
}

/**
 * Sends an email (and SMS where available) to the account owner alerting them
 * that a stolen/replayed refresh token was detected and all sessions were revoked.
 */
export async function sendBreachNotification(userId: string, familyId: string): Promise<void> {
  try {
    const [user] = await db
      .select({ email: usersTable.email, phone: usersTable.phone, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) return;

    const settings = await getCachedSettings();
    const appName = settings["app_name"] ?? "AJKMart";
    const detectedAt = new Date().toISOString();

    if (user.email) {
      try {
        const { sendEmail } = await import("../email.js");
        await sendEmail({
          to: user.email,
          subject: `[${appName}] Security Alert: Unauthorized access detected`,
          html: buildBreachNotificationEmail({
            userName: user.name,
            appName,
            detectedAt,
            familyId,
          }),
        });
      } catch (err) {
        logger.warn({ err, userId }, "[tokenRotation] Email breach notification failed");
      }
    }

    if (user.phone) {
      try {
        const { sendSms } = await import("../sms.js");
        await sendSms({
          to: user.phone,
          message: `[${appName}] SECURITY ALERT: Unauthorized session replay detected. All your sessions have been revoked. If this wasn't you, change your password immediately.`,
        });
      } catch (err) {
        logger.warn({ err, userId }, "[tokenRotation] SMS breach notification failed");
      }
    }
  } catch (err) {
    logger.error({ err, userId }, "[tokenRotation] sendBreachNotification failed");
  }
}
