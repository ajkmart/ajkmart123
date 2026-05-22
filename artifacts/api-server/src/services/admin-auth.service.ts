import { db } from "@workspace/db";
import {
  adminAccountsTable,
  adminSessionsTable,
  type AdminAccount,
  type AdminSession,
} from "@workspace/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { createCsrfCookie } from "../utils/admin-csrf.js";
import { hashToken, verifyTokenHash } from "../utils/admin-hash.js";
import {
  sign2faChallengeToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/admin-jwt.js";
import { verifyAdminSecret } from "./password.js";
import { resolveAdminPermissions } from "./permissions.service.js";
import { verifyTotpToken } from "./totp.js";

/**
 * Admin login service
 * Handles credential verification and session creation
 */
export async function adminLogin(
  username: string,
  password: string,
  _ip: string,
  _userAgent?: string
): Promise<{
  success: boolean;
  admin?: AdminAccount;
  requiresMfa?: boolean;
  tempToken?: string;
  error?: string;
}> {
  // Find admin by username (case-insensitive). Display name is deliberately
  // excluded — it is not a unique login handle and matching on it could
  // allow non-unique identifier collisions.
  const lowerUsername = username.toLowerCase();
  const admins = await db
    .select()
    .from(adminAccountsTable)
    .where(
      and(
        eq(adminAccountsTable.isActive, true),
        or(
          eq(adminAccountsTable.username, username),
          eq(adminAccountsTable.username, lowerUsername)
        )
      )
    );

  const admin = admins[0] ?? null;

  if (!admin) {
    return { success: false, error: "Invalid username or password" };
  }

  // Verify password — accepts bcrypt (preferred) and legacy scrypt hashes.
  const passwordValid = verifyAdminSecret(password, admin.secret);
  if (!passwordValid) {
    return { success: false, error: "Invalid username or password" };
  }

  // Check if MFA is enabled for this admin
  if (admin.totpEnabled && admin.totpSecret) {
    // Password verified — issue a temporary 2FA challenge token so the
    // client can complete the second step at /api/admin/auth/2fa.
    const tempToken = sign2faChallengeToken(admin.id);
    return {
      success: true,
      requiresMfa: true,
      tempToken,
      admin,
    };
  }

  return { success: true, admin };
}

/**
 * Verify TOTP token and issue session
 */
export async function verify2fa(
  adminId: string,
  totp: string,
  _ip: string,
  _userAgent?: string
): Promise<{
  success: boolean;
  admin?: AdminAccount;
  error?: string;
}> {
  const admin = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, adminId))
    .then((rows) => rows[0]);

  if (!admin || !admin.totpSecret) {
    return { success: false, error: "Admin not found or MFA not configured" };
  }

  const totpValid = verifyTotpToken(totp, admin.totpSecret);
  if (!totpValid) {
    return { success: false, error: "Invalid TOTP code" };
  }

  return { success: true, admin };
}

/**
 * Create a new admin session
 * Returns access token, refresh token, and CSRF token
 */
export async function createAdminSession(
  admin: AdminAccount,
  ip: string,
  userAgent?: string
): Promise<{
  displayName: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: string;
  sessionId: string;
}> {
  const sessionId = generateId();

  // Generate tokens with effective permissions baked in. The legacy
  // `mpc` (must-change-password) claim is no longer issued — the SPA now
  // handles the optional credentials popup based on
  // `admin.defaultCredentials`, and no route is gated on a forced
  // rotation.
  const perms = await resolveAdminPermissions(admin.id, admin.role);
  const accessToken = signAccessToken(admin.id, admin.role, admin.name, perms, 0, false);
  const refreshToken = signRefreshToken(admin.id, sessionId);
  const csrfToken = createCsrfCookie(sessionId);

  // Store refresh token hash in database
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(adminSessionsTable).values({
    id: sessionId,
    adminId: admin.id,
    refreshTokenHash,
    ip,
    userAgent,
    expiresAt,
    lastUsedAt: new Date(),
  });

  // Update last login
  await db
    .update(adminAccountsTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminAccountsTable.id, admin.id));

  return {
    displayName: admin.name,
    name: admin.name,
    accessToken,
    refreshToken,
    csrfToken,
    expiresAt: expiresAt.toISOString(),
    sessionId,
  };
}

/**
 * Refresh access token using refresh token
 * Implements refresh token rotation for security
 */
export async function refreshAdminSession(
  refreshToken: string,
  ip: string,
  userAgent?: string
): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  csrfToken?: string;
  admin?: AdminAccount;
  error?: string;
}> {
  try {
    const payload = verifyRefreshToken(refreshToken);

    // Find and validate session
    const session = await db
      .select()
      .from(adminSessionsTable)
      .where(
        and(
          eq(adminSessionsTable.id, payload.sessionId),
          eq(adminSessionsTable.adminId, payload.sub),
          isNull(adminSessionsTable.revokedAt) // Not revoked
        )
      )
      .then((rows) => rows[0]);

    if (!session) {
      return { success: false, error: "Session not found or revoked" };
    }

    // Verify refresh token hash matches
    try {
      verifyTokenHash(refreshToken, session.refreshTokenHash);
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      return { success: false, error: "Invalid refresh token" };
    }

    // Check session expiry
    if (session.expiresAt < new Date()) {
      return { success: false, error: "Session expired" };
    }

    // Get admin account
    const admin = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, payload.sub))
      .then((rows) => rows[0]);

    if (!admin || !admin.isActive) {
      return { success: false, error: "Admin account not found or inactive" };
    }

    // Generate new tokens with rotation; recompute permissions so role/perm
    // changes propagate within one access-token lifetime. The legacy `mpc`
    // claim is no longer issued — the optional credentials popup is now
    // SPA-driven via the `defaultCredentials` flag returned alongside the
    // refreshed token, so no route is locked behind a forced rotation.
    const perms = await resolveAdminPermissions(admin.id, admin.role);
    const newAccessToken = signAccessToken(admin.id, admin.role, admin.name, perms, 0, false);
    const newRefreshToken = signRefreshToken(admin.id, session.id);
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const newCsrfToken = createCsrfCookie(session.id);

    // Update session with new refresh token hash
    await db
      .update(adminSessionsTable)
      .set({
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: new Date(),
        ip, // Update IP (can detect suspicious activity)
        userAgent, // Update user agent
      })
      .where(eq(adminSessionsTable.id, session.id));

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      csrfToken: newCsrfToken,
      admin,
    };
  } catch (_err) {
    return { success: false, error: "Invalid refresh token" };
  }
}

/**
 * Logout admin - revoke session
 */
export async function logoutAdminSession(sessionId: string): Promise<void> {
  await db
    .update(adminSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(adminSessionsTable.id, sessionId));
}

/**
 * Revoke all sessions for an admin (security measure)
 */
export async function revokeAllAdminSessions(adminId: string): Promise<void> {
  await db
    .update(adminSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(adminSessionsTable.adminId, adminId));
}

/**
 * Get all active sessions for an admin
 */
export async function getAdminActiveSessions(adminId: string): Promise<AdminSession[]> {
  return db
    .select()
    .from(adminSessionsTable)
    .where(and(eq(adminSessionsTable.adminId, adminId), isNull(adminSessionsTable.revokedAt)));
}
