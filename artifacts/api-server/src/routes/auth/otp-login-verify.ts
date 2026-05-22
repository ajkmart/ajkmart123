/**
 * POST /auth/login/verify-otp
 * Second-step OTP verification for the password-then-OTP login flow.
 * Uses the centralised OTP module (otp_tokens table) — no longer reads
 * otp_code / otp_used columns from the users table.
 */
import { isAuthMethodEnabled } from "@workspace/auth-utils/server";
import { db } from "@workspace/db";
import { refreshTokensTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { AUTH_ERROR_CODES, logAuthEvent } from "../../lib/auth-response.js";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import {
  sendError,
  sendErrorWithData,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendTooManyRequests,
  sendUnauthorized,
} from "../../lib/response.js";
import {
  checkLockout,
  generateRefreshToken,
  getAccessTokenTtlSec,
  getCachedSettings,
  getClientIp,
  getRefreshTokenTtlDays,
  recordFailedAttempt,
  resetAttempts,
  sign2faChallengeToken,
  signAccessToken,
  verify2faChallengeToken,
  writeAuthAuditLog,
} from "../../middleware/security.js";
import { OtpBlockedError, OtpExpiredError, OtpInvalidError } from "../../modules/otp/otp.types.js";
import { verifyOtp } from "../../modules/otp/otp.verify.js";
import {
  decryptPii,
  isDeviceTrusted,
  setRiderRefreshCookie,
  setVendorRefreshCookie,
} from "./helpers.js";

export async function handleLoginVerifyOtp(req: Request, res: Response): Promise<void> {
  try {
    const { tempToken, otp } = req.body ?? {};
    if (!tempToken || !otp) {
      sendError(res, "tempToken and otp are required", 400);
      return;
    }

    const payload = verify2faChallengeToken(tempToken);
    if (!payload || payload.authMethod !== "password_otp") {
      sendUnauthorized(res, "Invalid or expired OTP challenge token. Please log in again.");
      return;
    }

    const ip = getClientIp(req);
    const settings = await getCachedSettings();

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }
    if (user.isBanned) {
      sendForbidden(res, "Account suspended. Contact support.");
      return;
    }
    if (!user.isActive && user.approvalStatus !== "pending") {
      sendForbidden(res, "Account inactive. Contact support.");
      return;
    }

    const lockoutEnabled = (settings["security_lockout_enabled"] ?? "on") === "on";
    const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
    const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);
    const lockoutKey = `uid:${user.id}`;
    if (lockoutEnabled) {
      const lockout = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
      if (lockout.locked) {
        sendTooManyRequests(res, `Account locked. Try again in ${lockout.minutesLeft} minute(s).`);
        return;
      }
    }

    // ── Verify via new OTP module (otp_tokens table) ──
    // OTP was sent to the user's phone (or email) during the password login step.
    // The identifier is the normalised phone (primary) or email fallback.
    const identifier = user.phone ?? user.email ?? "";
    const identifierType = user.phone ? "phone" : "email";

    try {
      await verifyOtp({ identifier, identifierType, otpType: "login", code: String(otp) });
    } catch (otpErr) {
      if (otpErr instanceof OtpBlockedError) {
        sendTooManyRequests(res, otpErr.message);
        return;
      }
      if (otpErr instanceof OtpInvalidError || otpErr instanceof OtpExpiredError) {
        if (lockoutEnabled) {
          const updated = await recordFailedAttempt(lockoutKey, maxAttempts, lockoutMinutes);
          void writeAuthAuditLog("otp_failed", {
            userId: user.id,
            ip,
            userAgent: req.headers["user-agent"] ?? undefined,
            metadata: { method: "password_login_otp" },
          });
          logAuthEvent({
            eventType: "otp_failed",
            userId: user.id,
            ip,
            userAgent: req.headers["user-agent"] as string | undefined,
            channel: "password_otp",
            role: user.roles ?? "customer",
            success: false,
            failureReason:
              otpErr instanceof OtpExpiredError
                ? AUTH_ERROR_CODES.OTP_EXPIRED
                : AUTH_ERROR_CODES.INVALID_OTP,
          });
          if (updated.locked) {
            logAuthEvent({
              eventType: "account_locked",
              userId: user.id,
              ip,
              channel: "password_otp",
              role: user.roles ?? "customer",
              success: false,
              failureReason: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            });
            sendTooManyRequests(
              res,
              `Too many failed attempts. Account locked for ${lockoutMinutes} minutes.`
            );
            return;
          }
          const remaining = Math.max(0, maxAttempts - updated.attempts);
          sendErrorWithData(
            res,
            `${otpErr.message} ${remaining} attempt(s) remaining.`,
            { attemptsRemaining: remaining },
            401
          );
        } else {
          void writeAuthAuditLog("otp_failed", {
            userId: user.id,
            ip,
            userAgent: req.headers["user-agent"] ?? undefined,
            metadata: { method: "password_login_otp" },
          });
          logAuthEvent({
            eventType: "otp_failed",
            userId: user.id,
            ip,
            userAgent: req.headers["user-agent"] as string | undefined,
            channel: "password_otp",
            role: user.roles ?? "customer",
            success: false,
            failureReason: AUTH_ERROR_CODES.INVALID_OTP,
          });
          sendUnauthorized(res, otpErr.message);
        }
        return;
      }
      throw otpErr;
    }

    // ── OTP verified — update lastLoginAt ──
    const now = new Date();
    await db
      .update(usersTable)
      .set({ lastLoginAt: now, updatedAt: now })
      .where(eq(usersTable.id, user.id));

    await resetAttempts(lockoutKey);
    void writeAuthAuditLog("otp_verified", {
      userId: user.id,
      ip,
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: { method: "password_login_otp" },
    });

    if (
      user.totpEnabled &&
      isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles ?? undefined)
    ) {
      const deviceFingerprint = req.body.deviceFingerprint ?? "";
      const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
      if (!isDeviceTrusted(user, deviceFingerprint, trustedDays)) {
        const totpToken = sign2faChallengeToken(
          user.id,
          user.phone ?? "",
          user.roles ?? "customer",
          user.roles ?? "customer",
          "password"
        );
        logAuthEvent({
          eventType: "login_2fa_challenge",
          userId: user.id,
          ip,
          userAgent: req.headers["user-agent"] as string | undefined,
          channel: "password_otp",
          role: user.roles ?? "customer",
          success: true,
        });
        sendSuccess(res, {
          requires2FA: true,
          twoFactorRequired: true,
          tempToken: totpToken,
          userId: user.id,
        });
        return;
      }
    }

    const accessToken = signAccessToken(
      user.id,
      user.phone ?? "",
      user.roles ?? "customer",
      user.roles ?? "customer",
      user.tokenVersion ?? 0
    );
    const expiresInSec = getAccessTokenTtlSec();
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
    const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
    await db.insert(refreshTokensTable).values({
      id: generateId(),
      userId: user.id,
      tokenHash: refreshHash,
      authMethod: "password_otp",
      expiresAt: new Date(Date.now() + getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000),
    });

    setRiderRefreshCookie(req, res, refreshRaw, user);
    setVendorRefreshCookie(req, res, refreshRaw, user);

    void writeAuthAuditLog("login_success", {
      userId: user.id,
      ip,
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: { method: "password_otp_verified" },
    });
    logAuthEvent({
      eventType: "login_success",
      userId: user.id,
      ip,
      userAgent: req.headers["user-agent"] as string | undefined,
      channel: "password_otp",
      role: user.roles ?? "customer",
      success: true,
    });

    sendSuccess(res, {
      token: accessToken,
      accessToken,
      refreshToken: refreshRaw,
      expiresIn: expiresInSec,
      expiresAt,
      sessionDays: getRefreshTokenTtlDays(),
      user: {
        id: user.id,
        phone: decryptPii(user.encryptedPhone, user.phone),
        name: user.name,
        email: decryptPii(user.encryptedEmail, user.email),
        username: user.username,
        role: user.roles,
        roles: user.roles,
        walletBalance: parseFloat(user.walletBalance ?? "0"),
      },
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] login-verify-otp unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
