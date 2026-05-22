import { db } from "@workspace/db";
import {
  accountRecoveryTokensTable,
  refreshTokensTable,
  userSessionsTable,
  usersTable,
} from "@workspace/db/schema";
import { createHash } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import {
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendUnauthorized,
} from "../../lib/response.js";
import {
  getClientIp,
  revokeAllUserRefreshTokens,
  writeAuthAuditLog,
} from "../../middleware/security.js";
import { hashPassword, validatePasswordStrength } from "../../services/password.js";
import { extractAuthUser } from "./helpers.js";

const router: IRouter = Router();

router.delete("/sessions/:id", async (req, res) => {
  try {
    const auth = extractAuthUser(req);
    if (!auth) {
      sendUnauthorized(res, "Authentication required");
      return;
    }

    const { id } = req.params as Record<string, string>;
    const [session] = await db
      .select()
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.id, id!), eq(userSessionsTable.userId, auth.userId)))
      .limit(1);

    if (!session) {
      sendNotFound(res, "Session not found");
      return;
    }

    await db
      .update(userSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(userSessionsTable.id, id!));

    /* Also revoke the linked refresh token if present */
    if (session.refreshTokenId) {
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokensTable.id, session.refreshTokenId));
    }

    void writeAuthAuditLog("session_revoked", {
      userId: auth.userId,
      ip: getClientIp(req),
      metadata: { sessionId: id },
    });
    sendSuccess(res, undefined, "Session revoked");
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
 * @openapi
 * /auth/recovery/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password via admin-issued recovery link
 *     description: |
 *       Public endpoint. Accepts a one-time recovery token (from the admin-generated link)
 *       and a new password. Validates the token, updates the user's password, marks the token
 *       as used, and revokes all existing sessions so the user must log in fresh.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Recovery token from the email link
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: New password (must meet strength requirements)
 *                 example: "MyStr0ngP@ss2"
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Invalid token, expired token, or weak password
 *       404:
 *         description: Token not found or already used
 */

const RecoveryResetSchema = z
  .object({
    token: z.string().min(16),
    newPassword: z.string().min(8),
  })
  .strict();

router.post("/recovery/reset-password", async (req, res) => {
  try {
    const parse = RecoveryResetSchema.safeParse(req.body);
    if (!parse.success) {
      sendError(res, "token and newPassword are required", 400);
      return;
    }

    const { token, newPassword } = parse.data;
    const ip = getClientIp(req);

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.ok) {
      sendError(res, pwCheck.message, 400);
      return;
    }

    /* Hash the incoming token for safe lookup */
    const tokenHash = createHash("sha256").update(token).digest("hex");

    /* Atomically claim the token in a single UPDATE ... WHERE used_at IS NULL AND expires_at > NOW()
       This prevents double-use under concurrent requests without a separate SELECT. */
    const now = new Date();
    const [claimed] = await db
      .update(accountRecoveryTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(accountRecoveryTokensTable.tokenHash, tokenHash),
          isNull(accountRecoveryTokensTable.usedAt),
          sql`${accountRecoveryTokensTable.expiresAt} > now()`
        )
      )
      .returning();

    if (!claimed) {
      /* Token not found, already used, or expired — give a safe unified message */
      const [existing] = await db
        .select({
          usedAt: accountRecoveryTokensTable.usedAt,
          expiresAt: accountRecoveryTokensTable.expiresAt,
        })
        .from(accountRecoveryTokensTable)
        .where(eq(accountRecoveryTokensTable.tokenHash, tokenHash))
        .limit(1);

      if (!existing) {
        sendError(res, "Invalid recovery link", 400);
      } else if (existing.usedAt) {
        sendError(res, "This recovery link has already been used", 400);
      } else {
        sendError(res, "This recovery link has expired. Ask an admin to issue a new one.", 400);
      }
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, claimed.userId))
      .limit(1);

    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    if (user.isBanned) {
      sendForbidden(res, "Account suspended. Contact support.");
      return;
    }

    /* Update password, bump tokenVersion to invalidate outstanding JWTs */
    await db
      .update(usersTable)
      .set({
        passwordHash: hashPassword(newPassword),
        requirePasswordChange: false,
        tokenVersion: sql`token_version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, claimed.userId));

    /* Revoke all active sessions and refresh tokens */
    await db
      .update(userSessionsTable)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(userSessionsTable.userId, claimed.userId), isNull(userSessionsTable.revokedAt))
      );
    await revokeAllUserRefreshTokens(claimed.userId);

    void writeAuthAuditLog("password_reset_via_recovery", {
      userId: claimed.userId,
      ip,
      userAgent: req.headers["user-agent"] ?? undefined,
    });

    sendSuccess(
      res,
      undefined,
      "Password has been reset successfully. Please login with your new password."
    );
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

export default router;
