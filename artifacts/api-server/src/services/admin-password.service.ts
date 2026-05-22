/**
 * admin-password.service.ts — admin password lifecycle helpers.
 *
 * Owns:
 *   * Issuing and consuming single-use, time-limited password reset tokens.
 *   * Updating the admin's password hash and stamping `passwordChangedAt`.
 *   * Clearing `mustChangePassword` once a fresh password is in place.
 *   * Revoking sibling sessions on a password change so old refresh tokens
 *     cannot be used to keep the previous password's session alive.
 *
 * Tokens: the raw token is returned **once** to the caller (so it can be
 * emailed or surfaced to a super-admin). Only the sha256 hash is persisted.
 * Single-use is enforced by stamping `usedAt`. Expired/used tokens are
 * rejected with a generic error to avoid information leaks.
 */
import { db } from "@workspace/db";
import {
  adminAccountsTable,
  adminPasswordResetTokensTable,
  adminSessionsTable,
  type AdminAccount,
  type AdminPasswordResetToken,
} from "@workspace/db/schema";
import { randomBytes } from "crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { hashToken } from "../utils/admin-hash.js";
import { recordAdminPasswordSnapshot } from "./admin-password-watch.service.js";
import { hashAdminSecret, validatePasswordStrength } from "./password.js";

/** Default token lifetime (30 minutes) — overridable via env. */
function getResetTokenTtlMs(): number {
  const minutes = Number(process.env.ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN ?? "30");
  return Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) * 60 * 1000 : 30 * 60 * 1000;
}

export interface IssueResetTokenInput {
  adminId: string;
  requestedBy: "self" | "super_admin";
  requesterAdminId?: string | null;
  requesterIp?: string;
  requesterUserAgent?: string | null;
}

export interface IssuedResetToken {
  /** Raw token — return to caller exactly once; never persisted. */
  rawToken: string;
  /** Stored row id (not the token). */
  id: string;
  expiresAt: Date;
}

/**
 * Generate a fresh reset token, persist its hash, and return the raw token
 * to the caller for delivery (email or super-admin display).
 */
export async function issueAdminPasswordResetToken(
  input: IssueResetTokenInput
): Promise<IssuedResetToken> {
  // 32 random bytes → 64 hex chars; ample entropy for a 30-minute token.
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const id = `aprt_${generateId()}`;
  const expiresAt = new Date(Date.now() + getResetTokenTtlMs());

  await db.insert(adminPasswordResetTokensTable).values({
    id,
    adminId: input.adminId,
    tokenHash,
    expiresAt,
    requestedBy: input.requestedBy,
    requesterAdminId: input.requesterAdminId ?? null,
    requesterIp: input.requesterIp ?? "unknown",
    requesterUserAgent: input.requesterUserAgent ?? null,
  });

  return { rawToken, id, expiresAt };
}

export interface VerifiedResetToken {
  token: AdminPasswordResetToken;
  admin: AdminAccount;
}

/**
 * Look up a reset token by its raw value, validating that it is unused,
 * unexpired, and tied to an active admin. Returns null on any failure
 * (the caller surfaces a generic error to the user).
 */
export async function verifyAdminPasswordResetToken(
  rawToken: string
): Promise<VerifiedResetToken | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  const tokenHash = hashToken(rawToken);

  const [token] = await db
    .select()
    .from(adminPasswordResetTokensTable)
    .where(eq(adminPasswordResetTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (!token) return null;
  if (token.usedAt) return null;
  if (token.expiresAt.getTime() <= Date.now()) return null;

  const [admin] = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, token.adminId))
    .limit(1);

  if (!admin || !admin.isActive) return null;
  return { token, admin };
}

export interface CompleteResetInput {
  rawToken: string;
  newPassword: string;
}

export interface CompleteResetResult {
  ok: true;
  admin: AdminAccount;
}

/**
 * Consume a reset token and replace the admin's password.
 *  - Stamps `usedAt` so the token cannot be reused.
 *  - Hashes the new password with bcrypt (cost 12).
 *  - Clears `mustChangePassword`, sets `passwordChangedAt`.
 *  - Revokes every session for the admin so any old access/refresh tokens
 *    issued against the previous password can no longer be refreshed.
 */
export async function completeAdminPasswordReset(
  input: CompleteResetInput
): Promise<{ ok: true; admin: AdminAccount } | { ok: false; error: string }> {
  const strength = validatePasswordStrength(input.newPassword);
  if (!strength.ok) return { ok: false, error: strength.message };

  const verified = await verifyAdminPasswordResetToken(input.rawToken);
  if (!verified) return { ok: false, error: "Invalid or expired reset link" };

  const newHash = hashAdminSecret(input.newPassword);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Mark this token used.
    await tx
      .update(adminPasswordResetTokensTable)
      .set({ usedAt: now })
      .where(eq(adminPasswordResetTokensTable.id, verified.token.id));

    // Invalidate every other outstanding token for this admin so
    // a previously-issued link cannot also be used.
    await tx
      .update(adminPasswordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(adminPasswordResetTokensTable.adminId, verified.admin.id),
          isNull(adminPasswordResetTokensTable.usedAt)
        )
      );

    // Update password and clear the must-change flag. Also flip the
    // `defaultCredentials` flag so the optional first-login popup never
    // reopens once a real password has been set.
    await tx
      .update(adminAccountsTable)
      .set({
        secret: newHash,
        mustChangePassword: false,
        passwordChangedAt: now,
        defaultCredentials: false,
      })
      .where(eq(adminAccountsTable.id, verified.admin.id));

    // Revoke every session — force re-login with the new password.
    await tx
      .update(adminSessionsTable)
      .set({ revokedAt: now })
      .where(
        and(eq(adminSessionsTable.adminId, verified.admin.id), isNull(adminSessionsTable.revokedAt))
      );
  });

  const [updated] = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, verified.admin.id))
    .limit(1);

  // Record the new hash so the out-of-band watchdog does not later flag
  // this legitimate reset as a direct DB write.
  await recordAdminPasswordSnapshot({
    adminId: verified.admin.id,
    secret: newHash,
    passwordChangedAt: now,
  });

  return { ok: true, admin: updated! };
}

/**
 * Authenticated password change for the must-change-password flow (and for
 * voluntary self-service rotations). Verifies the current password, hashes
 * the new one, clears `mustChangePassword`, stamps `passwordChangedAt`,
 * and revokes sibling sessions (keeping the current session alive so the
 * caller does not get bounced mid-request — the new access token is reissued
 * by the route handler).
 */
export async function changeAdminPassword(input: {
  adminId: string;
  currentPassword: string;
  newPassword: string;
  keepSessionId?: string;
}): Promise<{ ok: true; admin: AdminAccount } | { ok: false; error: string }> {
  const { verifyAdminSecret } = await import("./password.js");

  const [admin] = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, input.adminId))
    .limit(1);

  if (!admin) return { ok: false, error: "Admin not found" };
  if (!admin.isActive) return { ok: false, error: "Admin account is inactive" };

  if (!verifyAdminSecret(input.currentPassword, admin.secret)) {
    return { ok: false, error: "Current password is incorrect" };
  }

  if (input.currentPassword === input.newPassword) {
    return { ok: false, error: "New password must differ from current password" };
  }

  const strength = validatePasswordStrength(input.newPassword);
  if (!strength.ok) return { ok: false, error: strength.message };

  const newHash = hashAdminSecret(input.newPassword);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(adminAccountsTable)
      .set({
        secret: newHash,
        mustChangePassword: false,
        passwordChangedAt: now,
        // Clear the bootstrap-default marker so the optional popup never
        // reopens after the admin has rotated their password.
        defaultCredentials: false,
      })
      .where(eq(adminAccountsTable.id, admin.id));

    // Invalidate any pending reset tokens for this admin.
    await tx
      .update(adminPasswordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(adminPasswordResetTokensTable.adminId, admin.id),
          isNull(adminPasswordResetTokensTable.usedAt)
        )
      );

    // Revoke every other session for this admin (keep the caller's session
    // so they do not lose their current login during the change).
    if (input.keepSessionId) {
      const sessions = await tx
        .select()
        .from(adminSessionsTable)
        .where(and(eq(adminSessionsTable.adminId, admin.id), isNull(adminSessionsTable.revokedAt)));
      for (const s of sessions) {
        if (s.id === input.keepSessionId) continue;
        await tx
          .update(adminSessionsTable)
          .set({ revokedAt: now })
          .where(eq(adminSessionsTable.id, s.id));
      }
    } else {
      await tx
        .update(adminSessionsTable)
        .set({ revokedAt: now })
        .where(and(eq(adminSessionsTable.adminId, admin.id), isNull(adminSessionsTable.revokedAt)));
    }
  });

  const [updated] = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, admin.id))
    .limit(1);

  // Mirror the new hash into the watchdog snapshot so an in-app change
  // is not misclassified as a direct DB write on the next startup scan.
  await recordAdminPasswordSnapshot({
    adminId: admin.id,
    secret: newHash,
    passwordChangedAt: now,
  });

  return { ok: true, admin: updated! };
}

/**
 * Best-effort cleanup of expired or used reset tokens. Safe to call from a
 * cron / startup task; no-op if the table is empty.
 */
export async function purgeStaleAdminPasswordResetTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h grace window
  const deleted = await db
    .delete(adminPasswordResetTokensTable)
    .where(lt(adminPasswordResetTokensTable.expiresAt, cutoff))
    .returning({ id: adminPasswordResetTokensTable.id });
  return deleted.length;
}
