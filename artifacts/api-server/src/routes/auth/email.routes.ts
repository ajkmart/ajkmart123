/**
 * email.routes.ts — Thin controller for email OTP auth.
 *
 * Business rules (auth method enabled, user lookup, JWT) stay here.
 * OTP generation / delivery / validation is fully delegated to the OTP module.
 *
 * Routes:
 *   POST /auth/send-email-otp
 *   POST /auth/verify-email-otp
 */

import { isAuthMethodEnabled } from "@workspace/auth-utils/server";
import { db } from "@workspace/db";
import { refreshTokensTable, usersTable } from "@workspace/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { AUTH_ERROR_CODES, logAuthEvent } from "../../lib/auth-response.js";
import { fireAndForget } from "../../lib/fireAndForget.js";
import { logger } from "../../lib/logger.js";
import {
  sendErrorWithData,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendTooManyRequests,
} from "../../lib/response.js";
import { emailOtpLimiter } from "../../middleware/rate-limit.js";
import {
  addSecurityEvent,
  checkLockout,
  getAccessTokenTtlSec,
  getCachedSettings,
  getClientIp,
  recordFailedAttempt,
  resetAttempts,
  sign2faChallengeToken,
  verifyCaptcha,
  writeAuthAuditLog,
} from "../../middleware/security.js";
import { validateBody } from "../../middleware/validate.js";
import {
  sendOtp as modulesSendOtp,
  verifyOtp as modulesVerifyOtp,
  OtpBlockedError,
  OtpDeliveryError,
  OtpExpiredError,
  OtpInvalidError,
  OtpRateLimitError,
} from "../../modules/otp/index.js";
import { AuditService } from "../../services/admin-audit.service.js";
import { decryptPii, isDeviceTrusted, issueTokensForUser } from "./helpers.js";

const router: IRouter = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SendEmailOtpSchema = z.object({
  email: z.string().email(),
  captchaToken: z.string().optional(),
  role: z.string().optional(),
});

const VerifyEmailOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  captchaToken: z.string().optional(),
  deviceFingerprint: z.string().optional(),
  role: z.string().optional(),
});

// ─── POST /auth/send-email-otp ────────────────────────────────────────────────

router.post(
  "/send-email-otp",
  emailOtpLimiter,
  verifyCaptcha,
  validateBody(SendEmailOtpSchema),
  async (req, res) => {
    try {
      const normalized = (req.body.email as string).toLowerCase().trim();
      const ip = getClientIp(req);
      const settings = await getCachedSettings();

      if (!isAuthMethodEnabled(settings, "auth_email_otp_enabled")) {
        sendErrorWithData(
          res,
          "Email OTP login is currently disabled.",
          { code: "AUTH_METHOD_DISABLED" },
          400
        );
        return;
      }

      // Look up user — email OTP only works for existing accounts
      const [user] = await db
        .select({
          id: usersTable.id,
          roles: usersTable.roles,
          isBanned: usersTable.isBanned,
          isActive: usersTable.isActive,
          approvalStatus: usersTable.approvalStatus,
        })
        .from(usersTable)
        .where(eq(usersTable.email, normalized))
        .limit(1);

      // Non-enumeration: if no user, return generic success — don't reveal whether the email is registered
      if (!user) {
        sendSuccess(res, {
          message: "If an account exists with this email, an OTP has been sent.",
          channel: "email",
        });
        return;
      }

      if (!isAuthMethodEnabled(settings, "auth_email_otp_enabled", user.roles ?? "customer")) {
        // Silent 200 — don't reveal that account exists but method is disabled for this role
        sendSuccess(res, {
          message: "If an account exists with this email, an OTP has been sent.",
          channel: "email",
        });
        return;
      }

      const isPending = user.approvalStatus === "pending";
      if (user.isBanned || (!user.isActive && !isPending)) {
        // Normalize to silent 200 — prevents user enumeration via 403 status code
        sendSuccess(res, {
          message: "If an account exists with this email, an OTP has been sent.",
          channel: "email",
        });
        return;
      }

      // Per-identifier send rate limit — prevents multi-IP OTP flooding
      const emailSendKey = `email_otp_send:${normalized}`;
      const EMAIL_SEND_MAX = 3;
      const EMAIL_SEND_WINDOW_MIN = 30;
      const emailSendLockout = await checkLockout(emailSendKey, EMAIL_SEND_MAX, EMAIL_SEND_WINDOW_MIN);
      if (emailSendLockout.locked) {
        sendTooManyRequests(
          res,
          `Too many requests. Try again in ${emailSendLockout.minutesLeft} minute(s).`
        );
        return;
      }

      // ── Delegate to OTP module ──
      const result = await modulesSendOtp({
        identifier: normalized,
        identifierType: "email",
        otpType: "login",
        userId: user.id,
        ipAddress: ip,
      });

      // Record send against per-identifier counter
      await recordFailedAttempt(emailSendKey, EMAIL_SEND_MAX, EMAIL_SEND_WINDOW_MIN);

      AuditService.log({
        action: "email_otp_sent",
        ip,
        details: `Email OTP for: ${normalized} (channel: ${result.channel ?? "email"})`,
        result: "success",
      });

      sendSuccess(res, {
        message: "OTP aapki email par bhej diya gaya hai",
        channel: result.channel ?? "email",
        expiresIn: result.otpRequired ? 300 : undefined,
        resendAfter: result.resendAfter ? Math.ceil(result.resendAfter / 1000) : undefined,
        ...(result.devCode ? { devCode: result.devCode } : {}),
      });
    } catch (err) {
      if (err instanceof OtpBlockedError) {
        sendTooManyRequests(res, err.message);
        return;
      }
      if (err instanceof OtpRateLimitError) {
        sendErrorWithData(
          res,
          err.message,
          { retryAfterSeconds: Math.ceil(err.retryAfterMs / 1000) },
          429
        );
        return;
      }
      if (err instanceof OtpDeliveryError) {
        logger.error(
          { error: err.message, channel: err.channel },
          "[email.routes] OTP delivery failed"
        );
        sendErrorWithData(
          res,
          "Unable to send OTP email. Please try again later.",
          { code: "DELIVERY_FAILED", channel: err.channel },
          503
        );
        return;
      }
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "[email.routes] send-email-otp error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── POST /auth/verify-email-otp ──────────────────────────────────────────────

router.post(
  "/verify-email-otp",
  emailOtpLimiter,
  verifyCaptcha,
  validateBody(VerifyEmailOtpSchema),
  async (req, res) => {
    try {
      const normalized = (req.body.email as string).toLowerCase().trim();
      const { otp, deviceFingerprint } = req.body;
      const ip = getClientIp(req);
      const settings = await getCachedSettings();

      if (!isAuthMethodEnabled(settings, "auth_email_otp_enabled")) {
        sendErrorWithData(
          res,
          "Email OTP login is currently disabled.",
          { code: "AUTH_METHOD_DISABLED" },
          400
        );
        return;
      }

      // ── Delegate OTP validation to module ──
      let verified: Awaited<ReturnType<typeof modulesVerifyOtp>>;
      try {
        verified = await modulesVerifyOtp({
          identifier: normalized,
          identifierType: "email",
          otpType: "login",
          code: otp,
          ipAddress: ip,
          deviceFingerprint,
        });
      } catch (err) {
        if (err instanceof OtpBlockedError) {
          sendTooManyRequests(res, err.message);
          return;
        }
        if (err instanceof OtpInvalidError) {
          AuditService.log({
            action: "email_otp_failed",
            ip,
            details: `Wrong email OTP for: ${normalized}`,
            result: "fail",
          });
          logAuthEvent({
            eventType: "otp_failed",
            ip,
            userAgent: req.headers["user-agent"] as string | undefined,
            channel: "email_otp",
            success: false,
            failureReason: AUTH_ERROR_CODES.INVALID_OTP,
            metadata: { attemptsLeft: err.attemptsLeft },
          });
          sendErrorWithData(res, err.message, { attemptsRemaining: err.attemptsLeft }, 401);
          return;
        }
        if (err instanceof OtpExpiredError) {
          logAuthEvent({
            eventType: "otp_failed",
            ip,
            channel: "email_otp",
            success: false,
            failureReason: AUTH_ERROR_CODES.OTP_EXPIRED,
          });
          sendErrorWithData(res, "OTP expired. Please request a new one.", {}, 401);
          return;
        }
        throw err;
      }

      // ── Fetch full user record ──
      const userId = verified.userId;
      if (!userId) {
        sendNotFound(res, "No account found with this email address.");
        return;
      }

      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        sendNotFound(res, "No account found with this email address.");
        return;
      }

      if (!isAuthMethodEnabled(settings, "auth_email_otp_enabled", user.roles ?? "customer")) {
        sendErrorWithData(
          res,
          "Email OTP login is currently disabled for your account type.",
          { code: "AUTH_METHOD_DISABLED" },
          400
        );
        return;
      }

      // Cross-role guard
      const requestedRole = typeof req.body?.role === "string" ? req.body.role : undefined;
      const appIdHeader = req.headers["x-app-id"] as string | undefined;
      const appIdQuery = req.query.appId as string | undefined;
      const isCustomerAppCtx =
        requestedRole === "customer" || appIdHeader === "customer" || appIdQuery === "customer";
      if (requestedRole && !isCustomerAppCtx) {
        const userRoles = (user.roles || "customer").split(",").map((r: string) => r.trim());
        if (!userRoles.includes(requestedRole)) {
          addSecurityEvent({
            type: "cross_role_login_attempt",
            ip,
            userId: user.id,
            details: `User [${user.roles}] tried email OTP login as ${requestedRole}`,
            severity: "high",
          });
          sendErrorWithData(
            res,
            `This account is not registered as a ${requestedRole}. Please use the correct app.`,
            { wrongApp: true },
            403
          );
          return;
        }
      }

      if (user.isBanned) {
        sendForbidden(res, "Account suspended. Contact support.");
        return;
      }
      const isPending = user.approvalStatus === "pending";
      if (!user.isActive && !isPending) {
        sendForbidden(res, "Account inactive. Contact support.");
        return;
      }
      if (user.approvalStatus === "rejected") {
        sendErrorWithData(
          res,
          "Account rejected. Contact admin.",
          {
            code: "APPROVAL_REJECTED",
            approvalStatus: "rejected",
            rejectionReason: user.approvalNote ?? null,
          },
          403
        );
        return;
      }

      // Mark email verified
      await db
        .update(usersTable)
        .set({ emailVerified: true, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));

      // Cleanup expired refresh tokens (fire & forget)
      fireAndForget(
        db
          .delete(refreshTokensTable)
          .where(
            and(
              eq(refreshTokensTable.userId, user.id),
              lt(refreshTokensTable.expiresAt, new Date())
            )
          ),
        "auth:expired-token-cleanup:email_otp",
        logger,
        { userId: user.id, code: "DB_CLEANUP" }
      );

      // 2FA challenge
      if (
        user.totpEnabled &&
        isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles ?? undefined)
      ) {
        const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
        if (!isDeviceTrusted(user, deviceFingerprint ?? "", trustedDays)) {
          const tempToken = sign2faChallengeToken(
            user.id,
            user.phone ?? "",
            user.roles ?? "customer",
            user.roles ?? "customer",
            "email_otp"
          );
          logAuthEvent({
            eventType: "login_2fa_challenge",
            userId: user.id,
            ip,
            userAgent: req.headers["user-agent"] as string | undefined,
            channel: "email_otp",
            role: user.roles ?? "customer",
            success: true,
          });
          sendSuccess(res, {
            requires2FA: true,
            twoFactorRequired: true,
            tempToken,
            userId: user.id,
          });
          return;
        }
      }

      if (isPending) {
        AuditService.log({
          action: "email_login",
          ip,
          details: `Email OTP login (pending): ${normalized}`,
          result: "success",
        });
        // Issue access-only token for pending accounts
        const { signAccessToken, getAccessTokenTtlSec: _ttl } =
          await import("../../middleware/security.js");
        const accessToken = signAccessToken(
          user.id,
          user.phone ?? "",
          user.roles ?? "customer",
          user.roles ?? "customer",
          user.tokenVersion ?? 0
        );
        sendSuccess(res, {
          token: accessToken,
          expiresAt: new Date(Date.now() + getAccessTokenTtlSec() * 1000).toISOString(),
          pendingApproval: true,
          message: "Aapka account admin approval ke liye bheja gaya hai.",
          user: {
            id: user.id,
            phone: decryptPii(user.encryptedPhone, user.phone),
            name: user.name,
            role: user.roles,
            roles: user.roles,
            approvalStatus: "pending",
          },
        });
        return;
      }

      AuditService.log({
        action: "email_login",
        ip,
        details: `Email OTP login: ${normalized}`,
        result: "success",
      });
      void writeAuthAuditLog("login_success", {
        userId: user.id,
        ip,
        userAgent: req.headers["user-agent"] ?? undefined,
        metadata: { method: "email_otp" },
      });

      // Clear per-identifier send counter on successful login
      await resetAttempts(`email_otp_send:${normalized}`).catch(() => undefined);

      // Post-OTP cross-app check
      const userRoles = (user.roles || "customer").split(",").map((r: string) => r.trim());
      const isCrossApp = isCustomerAppCtx && !userRoles.includes("customer");
      if (isCrossApp) {
        addSecurityEvent({
          type: "cross_role_login_attempt",
          ip,
          userId: user.id,
          details: `User [${user.roles}] email-logged in to customer app — offering add-role`,
          severity: "low",
        });
        logAuthEvent({
          eventType: "cross_app_attempt",
          userId: user.id,
          ip,
          channel: "email_otp",
          role: user.roles ?? "customer",
          success: false,
          failureReason: AUTH_ERROR_CODES.WRONG_APP,
        });
      }

      const tokens = await issueTokensForUser(
        user,
        ip,
        "email_otp",
        req.headers["user-agent"] as string | undefined,
        req,
        res
      );
      sendSuccess(res, {
        ...tokens,
        ...(isCrossApp
          ? { canAddCustomerRole: true, code: "cross_app_account", wrongApp: true }
          : {}),
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "[email.routes] verify-email-otp error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
