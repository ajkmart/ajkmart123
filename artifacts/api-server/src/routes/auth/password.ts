import { isAuthMethodEnabled } from "@workspace/auth-utils/server";
import { db } from "@workspace/db";
import { rateLimitsTable, usersTable } from "@workspace/db/schema";
import { t } from "@workspace/i18n";
import { canonicalizePhone } from "@workspace/phone-utils";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { logAuthEvent } from "../../lib/auth-response.js";
import { fireAndForget } from "../../lib/fireAndForget.js";
import { getPlatformDefaultLanguage, getUserLanguage } from "../../lib/getUserLanguage.js";
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
import { loginLimiter, otpLimiter, passwordResetLimiter } from "../../middleware/rate-limit.js";
import {
  checkLockout,
  getCachedSettings,
  getClientIp,
  recordFailedAttempt,
  resetAttempts,
  revokeAllUserRefreshTokens,
  verifyCaptcha,
  verifyUserJwt,
  writeAuthAuditLog,
} from "../../middleware/security.js";
import { validateBody as sharedValidateBody } from "../../middleware/validate.js";
import { hashOtpCode, verifyOtpHash } from "../../modules/otp/otp.generate.js";
import { getActiveOtpToken, saveOtpToken } from "../../modules/otp/otp.store.js";
import { AuditService } from "../../services/admin-audit.service.js";
import { sendPasswordResetEmail } from "../../services/email.js";
import {
  generateSecureOtp,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "../../services/password.js";
import { sendOtpSMS } from "../../services/sms.js";
import { decryptTotpSecret } from "../../services/totp.js";
import { sendWhatsAppOTP } from "../../services/whatsapp.js";
import { handleUnifiedLogin } from "./auth-common.js";
import {
  AUTH_OTP_TTL_MS,
  findUserByIdentifier,
  forgotPasswordSchema,
  ResetPasswordSchema,
  SetPasswordSchema,
  UserLoginSchema,
  VerifyResetOtpSchema,
} from "./helpers.js";

const router: IRouter = Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with phone/email and password
 *     description: Authenticate with username/email/phone and password. Returns JWT access token and refresh token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Phone number, email, or username
 *                 example: "03001234567"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "MyStr0ngP@ss"
 *               captchaToken:
 *                 type: string
 *                 description: reCAPTCHA v3 token (required when captcha is enabled)
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     token: { type: string, description: "JWT access token" }
 *                     refreshToken: { type: string }
 *                     user: { type: object }
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429:
 *         description: Too many login attempts
 */
router.post(
  "/login/username",
  loginLimiter,
  verifyCaptcha,
  sharedValidateBody(UserLoginSchema),
  handleUnifiedLogin
);

router.post(
  "/login",
  loginLimiter,
  verifyCaptcha,
  sharedValidateBody(UserLoginSchema),
  handleUnifiedLogin
);

/* ══════════════════════════════════════════════════════════════
   POST /auth/login/verify-otp
   Verify the OTP sent after email/password login.
   Body: { tempToken: string, otp: string }
   Returns JWT token on success.
══════════════════════════════════════════════════════════════ */

router.post(
  "/set-password",
  loginLimiter,
  sharedValidateBody(SetPasswordSchema),
  async (req, res) => {
    try {
      /* Accept token ONLY from Authorization: Bearer header — body token is rejected
     to prevent token leakage via request logging, proxies, or CSRF-style attacks. */
      const authHeader = req.headers["authorization"] as string | undefined;
      const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const { password, currentPassword } = req.body;
      if (!rawToken || !password) {
        sendError(res, "Token and password required", 400);
        return;
      }

      const payload = verifyUserJwt(rawToken);
      if (!payload) {
        sendUnauthorized(res, "Invalid or expired token. Please log in again.");
        return;
      }
      const userId = payload.userId;

      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        sendNotFound(res, "User not found");
        return;
      }
      if (user.isBanned) {
        sendForbidden(res, "Account suspended. Contact support.");
        return;
      }
      /* Inactive users are blocked from setting a password — UNLESS they have a
     pending approval status (vendor/rider onboarding). Pending accounts are
     inactive by design (isActive = false) until approved, but they still need
     to set a password during onboarding. */
      if (!user.isActive && user.approvalStatus !== "pending") {
        sendForbidden(res, "Account inactive. Contact support.");
        return;
      }

      const setPassSettings = await getCachedSettings();
      const spMaxAttempts = parseInt(setPassSettings["security_login_max_attempts"] ?? "5", 10);
      const spLockoutMinutes = parseInt(setPassSettings["security_lockout_minutes"] ?? "30", 10);
      const spLockoutKey = `set_password:${userId}`;

      const spLockout = await checkLockout(spLockoutKey, spMaxAttempts, spLockoutMinutes);
      if (spLockout.locked) {
        sendTooManyRequests(
          res,
          `Too many failed attempts. Try again in ${spLockout.minutesLeft} minute(s).`
        );
        return;
      }

      /* If user has a non-temporary password, ALWAYS require the current password — no bypass.
     If requirePasswordChange is true (admin set a temp password), skip current-password
     check to allow the user to change it on first login without knowing the old hash. */
      const isTempPasswordChange = user.requirePasswordChange === true;
      if (user.passwordHash && !isTempPasswordChange) {
        if (!currentPassword) {
          sendError(res, "Current password required to change password", 400);
          return;
        }
        if (!verifyPassword(currentPassword, user.passwordHash)) {
          await recordFailedAttempt(spLockoutKey, spMaxAttempts, spLockoutMinutes);
          AuditService.log({
            action: "set_password_wrong_current",
            userId,
            ip: getClientIp(req),
            details: "Wrong current password supplied during set-password",
            result: "fail",
          });
          const lang = await getPlatformDefaultLanguage();
          sendUnauthorized(res, t("currentPasswordIncorrect", lang));
          return;
        }
      }

      const check = validatePasswordStrength(password);
      if (!check.ok) {
        sendError(res, check.message, 400);
        return;
      }

      /* Bump tokenVersion to invalidate all outstanding JWTs on password change;
     also clear requirePasswordChange now that the user has set their own password. */
      await db
        .update(usersTable)
        .set({
          passwordHash: hashPassword(password),
          requirePasswordChange: false,
          tokenVersion: sql`token_version + 1`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));
      /* Revoke all active refresh tokens BEFORE responding so stolen tokens cannot
     survive a password change. Awaited intentionally — same rationale as in
     complete-profile: issuing a success response before revocation completes
     creates a session-integrity window. */
      await revokeAllUserRefreshTokens(userId, "PASSWORD_CHANGED").catch((err: unknown) => {
        logger.warn({ userId, err }, "[auth] revokeAllUserRefreshTokens after set-password failed");
      });

      // Clear failed-attempt counter on successful password change
      await resetAttempts(spLockoutKey);

      void writeAuthAuditLog("password_changed", {
        userId,
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      sendSuccess(res, {
        success: true,
        message: t("passwordUpdated", await getPlatformDefaultLanguage()),
        requirePasswordChange: false,
      });
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
  }
);

function issueResetToken(userId: string): string {
  const jti = generateId();
  const payload = {
    userId,
    purpose: "password_reset",
    jti,
  };
  return jwt.sign(payload, process.env["JWT_SECRET"]!, { expiresIn: "10m" });
}

/* isAuthMethodEnabled is now exported from @workspace/auth-utils/server
   so the same logic is shared with any future server-side helpers. */

/* ══════════════════════════════════════════════════════════════════════
   OTP Rate Limiter — per account (phone/email) + per IP address
   Uses rateLimitsTable with sliding window (resets after window expires).
   Keys: otp_acct:<identifier>  and  otp_ip:<ip>
══════════════════════════════════════════════════════════════════════ */

router.post(
  "/forgot-password",
  passwordResetLimiter,
  verifyCaptcha,
  sharedValidateBody(forgotPasswordSchema),
  async (req, res) => {
    try {
      let { phone, email } = req.body as { phone?: string; email?: string };
      const { identifier } = req.body as { identifier?: string };
      const ip = getClientIp(req);
      const settings = await getCachedSettings();

      if (identifier && !phone && !email) {
        const resolved = await findUserByIdentifier(identifier);
        if (resolved.user) {
          if (resolved.idType === "phone") {
            phone = resolved.user.phone ?? undefined;
          } else if (resolved.idType === "email") {
            email = resolved.user.email ?? undefined;
          } else if (resolved.idType === "username") {
            if (resolved.user.email) {
              email = resolved.user.email ?? undefined;
            } else if (resolved.user.phone) {
              phone = resolved.user.phone ?? undefined;
            }
          }
        }
      }

      if (!phone && !email) {
        sendError(res, "Phone, email, or username is required", 400);
        return;
      }

      if (phone && !isAuthMethodEnabled(settings, "auth_phone_otp_enabled")) {
        sendForbidden(res, "Phone-based password reset is currently disabled");
        return;
      }
      if (email && !phone && !isAuthMethodEnabled(settings, "auth_email_otp_enabled")) {
        sendForbidden(res, "Email-based password reset is currently disabled");
        return;
      }

      let user;
      if (phone) {
        const canonPhone = canonicalizePhone(phone);
        const [found] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.phone, canonPhone))
          .limit(1);
        user = found;
      } else {
        const normalized = email!.toLowerCase().trim();
        const [found] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, normalized))
          .limit(1);
        user = found;
      }

      if (!user) {
        sendSuccess(res, { message: "If an account exists, a reset code has been sent." });
        return;
      }

      const forgotRole = user.roles ?? "customer";
      if (phone && !isAuthMethodEnabled(settings, "auth_phone_otp_enabled", forgotRole)) {
        // Fix 1: return same silent 200 instead of 403 — prevents user enumeration via status code
        sendSuccess(res, { message: "If an account exists, a reset code has been sent." });
        return;
      }
      if (email && !phone && !isAuthMethodEnabled(settings, "auth_email_otp_enabled", forgotRole)) {
        // Fix 1: same — don't leak that account exists via 403
        sendSuccess(res, { message: "If an account exists, a reset code has been sent." });
        return;
      }

      if (user.isBanned || (!user.isActive && user.approvalStatus !== "pending")) {
        // Fix 1: banned/inactive used to return 403, revealing account existence
        // Now returns silent 200 — attacker cannot distinguish "no account" from "banned"
        sendSuccess(res, { message: "If an account exists, a reset code has been sent." });
        return;
      }

      const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
      const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);

      // Fix 2: per-identifier send rate limit — prevents multi-IP OTP flooding of a known phone/email
      const normalizedIdentifier = phone ? canonicalizePhone(phone) : email!.toLowerCase().trim();
      const sendLockoutKey = `reset_send:${normalizedIdentifier}`;
      const OTP_SEND_MAX = 3;
      const OTP_SEND_WINDOW_MIN = 30;
      const sendLockout = await checkLockout(sendLockoutKey, OTP_SEND_MAX, OTP_SEND_WINDOW_MIN);
      if (sendLockout.locked) {
        sendTooManyRequests(
          res,
          `Too many reset requests. Try again in ${sendLockout.minutesLeft} minute(s).`
        );
        return;
      }

      const lockoutKey = `reset:${user.id}`;
      const lockout = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
      if (lockout.locked) {
        sendTooManyRequests(
          res,
          `Too many attempts. Try again in ${lockout.minutesLeft} minute(s).`
        );
        return;
      }

      const otp = generateSecureOtp();
      const otpExpiry = new Date(Date.now() + AUTH_OTP_TTL_MS);

      const forgotLang = await getUserLanguage(user.id);

      if (phone) {
        const targetPhone = canonicalizePhone(phone);
        await saveOtpToken({
          identifier: targetPhone,
          identifierType: "phone",
          otpType: "reset",
          otpHash: hashOtpCode(otp),
          channel: "sms",
          userId: user.id,
          ttlMs: AUTH_OTP_TTL_MS,
        });
        await sendOtpSMS(targetPhone, otp, settings, forgotLang);
        if (settings["integration_whatsapp"] === "on") {
          fireAndForget(
            sendWhatsAppOTP(targetPhone, otp, settings, forgotLang),
            "auth:whatsapp-otp:forgot-password",
            logger,
            { code: "AUTH_WHATSAPP_OTP_FAILED" }
          );
        }
      } else {
        const targetEmail = email!.toLowerCase().trim();
        await saveOtpToken({
          identifier: targetEmail,
          identifierType: "email",
          otpType: "reset",
          otpHash: hashOtpCode(otp),
          channel: "email",
          userId: user.id,
          ttlMs: AUTH_OTP_TTL_MS,
        });

        await sendPasswordResetEmail(email!, otp, user.name ?? undefined, forgotLang);
      }

      // Fix 2: record this send against the per-identifier counter
      await recordFailedAttempt(sendLockoutKey, OTP_SEND_MAX, OTP_SEND_WINDOW_MIN);

      void writeAuthAuditLog("forgot_password", {
        userId: user.id,
        ip,
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      logAuthEvent({
        eventType: "password_reset_requested",
        userId: user.id,
        ip,
        userAgent: req.headers["user-agent"] as string | undefined,
        channel: phone ? "sms" : "email",
        role: user.roles ?? "customer",
        success: true,
        metadata: {
          identifier: phone ? canonicalizePhone(phone) : email!.toLowerCase().trim(),
          expiresAt: otpExpiry.toISOString(),
        },
      });

      sendSuccess(res, {
        message: "If an account exists, a reset code has been sent.",
      });
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
  }
);

/* ══════════════════════════════════════════════════════════════
   POST /auth/verify-reset-otp
   Pre-verify the OTP before allowing the user to set a new password.
   Body: { phone?, email?, otp }
   Returns: { valid: true } or 400/422 with error
══════════════════════════════════════════════════════════════ */

router.post(
  "/verify-reset-otp",
  otpLimiter,
  verifyCaptcha,
  sharedValidateBody(VerifyResetOtpSchema),
  async (req, res) => {
    try {
      const { phone, email, otp } = req.body;
      const ip = getClientIp(req);

      if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
        sendError(res, "OTP must be exactly 6 digits", 400);
        return;
      }
      if (!phone && !email) {
        sendError(res, "Phone or email is required", 400);
        return;
      }

      const settings = await getCachedSettings();
      const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
      const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);

      // Fix B: IP-based lockout checked before DB lookup — prevents enumeration brute-force
      const ipLockoutKey = `reset_ip:${ip}`;
      const ipLockout = await checkLockout(ipLockoutKey, maxAttempts, lockoutMinutes);
      if (ipLockout.locked) {
        sendTooManyRequests(
          res,
          `Too many attempts. Try again in ${ipLockout.minutesLeft} minute(s).`
        );
        return;
      }

      let user: typeof usersTable.$inferSelect | undefined;
      if (phone) {
        const canonPhone = canonicalizePhone(phone);
        const [found] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.phone, canonPhone))
          .limit(1);
        user = found;
      } else {
        const normalized = (email as string).toLowerCase().trim();
        const [found] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, normalized))
          .limit(1);
        user = found;
      }

      if (!user) {
        // Fix B: record IP attempt when identifier does not exist — prevents enumeration
        await recordFailedAttempt(ipLockoutKey, maxAttempts, lockoutMinutes);
        sendError(res, "Invalid or expired code", 422);
        return;
      }

      // Per-user lockout key checked after user is confirmed to exist
      const lockoutKey = `reset:${user.id}`;
      const lockout = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
      if (lockout.locked) {
        sendTooManyRequests(
          res,
          `Too many attempts. Try again in ${lockout.minutesLeft} minute(s).`
        );
        return;
      }

      const identifier = phone ? canonicalizePhone(phone) : (email as string).toLowerCase().trim();
      const identifierType = phone ? "phone" : "email";
      const activeToken = await getActiveOtpToken({ identifier, identifierType, otpType: "reset" });
      if (!activeToken || !verifyOtpHash(otp, activeToken.otpHash)) {
        // Fix A (part 1): record failed attempt on wrong OTP
        await recordFailedAttempt(lockoutKey, maxAttempts, lockoutMinutes);
        AuditService.log({
          action: "verify_reset_otp_failed",
          userId: user.id,
          ip,
          details: "Invalid or expired OTP supplied during password reset",
          result: "fail",
        });
        sendError(res, "Invalid or expired verification code", 422);
        return;
      }

      const resetToken = issueResetToken(user.id);
      await db
        .insert(rateLimitsTable)
        .values({
          key: `reset_token:${user.id}:${resetToken.slice(0, 16)}`,
          attempts: 1,
          windowStart: new Date(),
          updatedAt: new Date(),
        })
        .catch(() => undefined);

      // Fix A (part 2): clear per-user and per-IP failed-attempt counters on success
      await resetAttempts(lockoutKey);
      await resetAttempts(ipLockoutKey);

      void writeAuthAuditLog("verify_reset_otp", {
        userId: user.id,
        ip,
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      sendSuccess(res, {
        resetToken,
        requires2FA: !!(
          user.totpEnabled &&
          isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles ?? undefined)
        ),
      });
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
  }
);

router.post(
  "/reset-password",
  loginLimiter,
  verifyCaptcha,
  sharedValidateBody(ResetPasswordSchema),
  async (req, res) => {
    try {
      const { resetToken, newPassword, totpCode } = req.body as {
        resetToken: string;
        newPassword: string;
        totpCode?: string;
      };
      const ip = getClientIp(req);
      const settings = await getCachedSettings();

      /* Verify and extract userId from reset token */
      let payload: { userId: string; purpose: string; jti: string };
      try {
        payload = jwt.verify(resetToken, process.env["JWT_SECRET"]!) as {
          userId: string;
          purpose: string;
          jti: string;
        };
      } catch (err) {
        AuditService.log({
          action: "reset_password_invalid_token",
          ip,
          details: `Invalid or expired reset token: ${err instanceof Error ? err.message : String(err)}`,
          result: "fail",
        });
        sendUnauthorized(res, "Invalid or expired reset token");
        return;
      }

      if (payload.purpose !== "password_reset") {
        sendUnauthorized(res, "Invalid or expired reset token");
        return;
      }

      /* Prevent JTI replay — token cannot be used twice */
      const jtiKey = `reset_jti:${payload.jti}`;
      const [usedJti] = await db
        .select({ key: rateLimitsTable.key })
        .from(rateLimitsTable)
        .where(eq(rateLimitsTable.key, jtiKey))
        .limit(1);
      if (usedJti) {
        AuditService.log({
          action: "reset_password_token_reuse_attempt",
          ip,
          details: `Attempted to reuse reset token: ${payload.userId}`,
          result: "fail",
        });
        sendUnauthorized(res, "Invalid or expired reset token");
        return;
      }

      /* Fetch user by ID from token */
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1);

      if (!user) {
        sendNotFound(res, "Account not found");
        return;
      }

      if (user.isBanned) {
        sendForbidden(res, "Account suspended.");
        return;
      }

      /* Validate new password strength */
      const pwCheck = validatePasswordStrength(newPassword);
      if (!pwCheck.ok) {
        sendError(res, pwCheck.message, 400);
        return;
      }

      const userRole = user.roles ?? "customer";
      const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
      const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);
      const lockoutKey = `reset:${user.id}`;
      const lockout = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
      if (lockout.locked) {
        sendTooManyRequests(
          res,
          `Too many attempts. Try again in ${lockout.minutesLeft} minute(s).`
        );
        return;
      }
      /* TOTP 2FA verification — if enabled for account */
      if (user.totpEnabled && isAuthMethodEnabled(settings, "auth_2fa_enabled", userRole)) {
        if (!totpCode) {
          sendErrorWithData(
            res,
            "Two-factor authentication code required",
            { requires2FA: true },
            400
          );
          return;
        }
        if (!/^\d{6}$/.test(totpCode)) {
          sendError(res, "TOTP code must be 6 digits", 400);
          return;
        }
        if (!user.totpSecret) {
          sendError(
            res,
            "2FA is not properly configured for this account. Please contact support.",
            400
          );
          return;
        }
        const { verifyTotpCode } = await import("../../services/password.js");
        let decryptedSecret: string;
        try {
          decryptedSecret = decryptTotpSecret(user.totpSecret);
        } catch (decryptErr) {
          logger.error(
            {
              error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
              userId: user.id,
            },
            "[reset-password] TOTP secret decryption failed"
          );
          sendUnauthorized(
            res,
            "Two-factor authentication is not properly configured. Please contact support."
          );
          return;
        }
        if (!verifyTotpCode(decryptedSecret, totpCode)) {
          await recordFailedAttempt(lockoutKey, maxAttempts, lockoutMinutes);
          AuditService.log({
            action: "reset_password_2fa_failed",
            ip,
            details: `Invalid TOTP for password reset: ${user.id}`,
            result: "fail",
          });
          sendUnauthorized(res, "Invalid two-factor authentication code");
          return;
        }
      }

      /* Mark JTI as used after all validations pass */
      await db
        .insert(rateLimitsTable)
        .values({
          key: jtiKey,
          attempts: 1,
          windowStart: new Date(),
          updatedAt: new Date(),
        })
        .catch((err: unknown) => {
          logger.warn({ err }, "[auth] reset token JTI persist failed");
        });

      /* Update password and increment token version (invalidates old tokens) */
      await db
        .update(usersTable)
        .set({
          passwordHash: hashPassword(newPassword),
          requirePasswordChange: false,
          tokenVersion: sql`token_version + 1`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, user.id));

      /* Revoke all active refresh tokens so stolen tokens cannot be used */
      await revokeAllUserRefreshTokens(user.id, "PASSWORD_CHANGED").catch((err: unknown) => {
        logger.warn(
          { userId: user.id, err },
          "[auth] revokeAllUserRefreshTokens after reset-password failed"
        );
      });

      await resetAttempts(lockoutKey);

      // Clear per-identifier OTP send counter so user can request resets again immediately
      const userIdentifier = user.phone ?? user.email;
      if (userIdentifier) {
        const sendKey = user.phone
          ? `reset_send:${canonicalizePhone(user.phone)}`
          : `reset_send:${user.email!.toLowerCase().trim()}`;
        await resetAttempts(sendKey).catch(() => undefined);
      }

      void writeAuthAuditLog("password_reset", {
        userId: user.id,
        ip,
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      logAuthEvent({
        eventType: "password_reset_completed",
        userId: user.id,
        ip,
        userAgent: req.headers["user-agent"] as string | undefined,
        channel: "password_reset",
        role: user.roles ?? "customer",
        success: true,
      });
      sendSuccess(res, undefined, "Password updated. Please login again.");
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
  }
);

export default router;
