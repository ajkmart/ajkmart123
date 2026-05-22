/**
 * phone.routes.ts — Thin controller for phone OTP auth.
 *
 * Business rules (auth method enabled, user creation, JWT) stay here.
 * OTP generation / delivery / validation is fully delegated to the OTP module.
 *
 * Routes:
 *   POST /auth/send-otp
 *   POST /auth/verify-otp
 */

import { isAuthMethodEnabled } from "@workspace/auth-utils/server";
import { db } from "@workspace/db";
import { refreshTokensTable, usersTable, walletTransactionsTable } from "@workspace/db/schema";
import { canonicalizePhone } from "@workspace/phone-utils";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { AUTH_ERROR_CODES, logAuthEvent } from "../../lib/auth-response.js";
import { fireAndForget } from "../../lib/fireAndForget.js";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import {
  sendErrorWithData,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendTooManyRequests,
} from "../../lib/response.js";
import { emitWebhookEvent } from "../../lib/webhook-emitter.js";
import { otpLimiter } from "../../middleware/rate-limit.js";
import {
  addSecurityEvent,
  generateRefreshToken,
  getAccessTokenTtlSec,
  getCachedSettings,
  getClientIp,
  getRefreshTokenTtlDays,
  sign2faChallengeToken,
  signAccessToken,
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
import {
  decryptPii,
  isDeviceTrusted,
  issueTokensForUser,
  isValidCanonicalPhone,
  setRiderRefreshCookie,
  tryEncrypt,
} from "./helpers.js";

const router: IRouter = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SendOtpSchema = z.object({
  phone: z.string().min(1),
  preferredChannel: z.enum(["sms", "whatsapp", "email"]).optional(),
  captchaToken: z.string().optional(),
  deviceId: z.string().optional(),
  role: z.string().optional(),
});

const VerifyOtpSchema = z.object({
  phone: z.string().min(1),
  otp: z.string().length(6),
  captchaToken: z.string().optional(),
  deviceId: z.string().optional(),
  deviceFingerprint: z.string().optional(),
  role: z.string().optional(),
});

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────

router.post(
  "/send-otp",
  otpLimiter,
  verifyCaptcha,
  validateBody(SendOtpSchema),
  async (req, res) => {
    try {
      const phone = canonicalizePhone(req.body.phone);
      const ip = getClientIp(req);
      const settings = await getCachedSettings();

      if (!(await isValidCanonicalPhone(phone))) {
        sendErrorWithData(
          res,
          "Invalid phone number. Please enter a valid Pakistani mobile number (e.g. 03001234567).",
          { field: "phone" },
          400
        );
        return;
      }

      // ── Auth method check ──
      if (!isAuthMethodEnabled(settings, "auth_phone_otp_enabled")) {
        sendErrorWithData(
          res,
          "Phone OTP is currently disabled. Please use another login method.",
          { code: "AUTH_METHOD_DISABLED" },
          400
        );
        return;
      }

      // ── Look up existing user (server-side only — never exposed in response) ──
      const [existingUser] = await db
        .select({
          id: usersTable.id,
          roles: usersTable.roles,
          isBanned: usersTable.isBanned,
          googleId: usersTable.googleId,
        })
        .from(usersTable)
        .where(eq(usersTable.phone, phone))
        .limit(1);

      const effectiveRole =
        existingUser?.roles ??
        (req.body.role === "rider" || req.body.role === "vendor" ? req.body.role : "customer");

      if (!isAuthMethodEnabled(settings, "auth_phone_otp_enabled", effectiveRole)) {
        sendErrorWithData(
          res,
          "Phone OTP is currently disabled for your account type.",
          { code: "AUTH_METHOD_DISABLED" },
          400
        );
        return;
      }

      // ── Silent security logging (does not block OTP flow — avoids phone enumeration) ──
      if (existingUser?.isBanned) {
        addSecurityEvent({
          type: "banned_user_otp_request",
          ip,
          details: `Banned user attempted OTP: ${phone}`,
          severity: "high",
        });
      }
      if (
        existingUser?.googleId &&
        isAuthMethodEnabled(settings, "auth_google_enabled", effectiveRole)
      ) {
        addSecurityEvent({
          type: "otp_blocked_google_account",
          ip,
          details: `OTP attempt on Google-linked account: ${phone}`,
          severity: "low",
        });
      }

      // ── Delegate entirely to OTP module ──
      const result = await modulesSendOtp({
        identifier: phone,
        identifierType: "phone",
        otpType: "login",
        userId: existingUser?.id,
        channel: req.body.preferredChannel,
        ipAddress: ip,
      });

      void writeAuthAuditLog("otp_sent", {
        userId: existingUser?.id,
        ip,
        userAgent: req.headers["user-agent"] ?? undefined,
        metadata: { phone, channel: result.channel ?? "unknown" },
      });

      sendSuccess(res, {
        otpRequired: result.otpRequired,
        channel: result.channel ?? "sms",
        expiresIn: result.otpRequired ? 300 : undefined,
        resendAfter: result.resendAfter ? Math.ceil(result.resendAfter / 1000) : undefined,
        ...(result.expiresAt ? { expiresAt: result.expiresAt.toISOString() } : {}),
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
          "[phone.routes] OTP delivery failed"
        );
        sendErrorWithData(
          res,
          "Unable to send OTP. Please try a different delivery method or try again later.",
          { code: "DELIVERY_FAILED", channel: err.channel },
          503
        );
        return;
      }
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "[phone.routes] send-otp error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────

router.post(
  "/verify-otp",
  otpLimiter,
  verifyCaptcha,
  validateBody(VerifyOtpSchema),
  async (req, res) => {
    try {
      const phone = canonicalizePhone(req.body.phone);
      const { otp, deviceId, deviceFingerprint } = req.body;
      const ip = getClientIp(req);
      const settings = await getCachedSettings();

      if (!(await isValidCanonicalPhone(phone))) {
        sendErrorWithData(res, "Invalid phone number format.", { field: "phone" }, 400);
        return;
      }

      if (!isAuthMethodEnabled(settings, "auth_phone_otp_enabled")) {
        sendErrorWithData(
          res,
          "Phone OTP login is currently disabled.",
          { code: "AUTH_METHOD_DISABLED" },
          400
        );
        return;
      }

      // ── Delegate OTP validation to module ──
      let verified: Awaited<ReturnType<typeof modulesVerifyOtp>>;
      try {
        verified = await modulesVerifyOtp({
          identifier: phone,
          identifierType: "phone",
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
          sendErrorWithData(res, err.message, { attemptsRemaining: err.attemptsLeft }, 401);
          return;
        }
        if (err instanceof OtpExpiredError) {
          sendErrorWithData(res, "OTP expired or not found. Please request a new one.", {}, 401);
          return;
        }
        throw err;
      }

      // ── NEW USER: create user record + issue JWT ──────────────────────────────
      if (verified.isNewUser) {
        const requestedRoleForNew: string | undefined =
          typeof req.body?.role === "string" ? req.body.role : undefined;
        if (requestedRoleForNew && requestedRoleForNew !== "customer") {
          sendErrorWithData(
            res,
            `No ${requestedRoleForNew} account found for this phone number.`,
            {
              wrongApp: true,
              redirectTo: requestedRoleForNew === "rider" ? "/rider" : "/vendor",
              code: AUTH_ERROR_CODES.WRONG_APP,
            },
            403
          );
          return;
        }

        const requireApproval = (settings["user_require_approval"] ?? "off") === "on";
        const newUserId = generateId();

        try {
          await db.transaction(async (tx) => {
            await tx.insert(usersTable).values({
              id: newUserId,
              phone,
              encryptedPhone: tryEncrypt(phone),
              roles: "customer",
              walletBalance: "0",
              phoneVerified: true,
              isActive: !requireApproval,
              approvalStatus: requireApproval ? "pending" : "approved",
              ...(deviceId ? { deviceId } : {}),
            });
          });
        } catch (txErr: unknown) {
          const msg = txErr instanceof Error ? txErr.message : String(txErr);
          if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
            sendErrorWithData(
              res,
              "OTP already used. Please request a new one.",
              { code: "OTP_ALREADY_USED" },
              409
            );
            return;
          }
          throw txErr;
        }

        void writeAuthAuditLog("otp_verified_new_user", {
          userId: newUserId,
          ip,
          userAgent: req.headers["user-agent"] ?? undefined,
          metadata: { phone },
        });

        // Signup bonus
        const signupBonus = parseFloat(settings["customer_signup_bonus"] ?? "0");
        if (signupBonus > 0) {
          await db
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${signupBonus}` })
            .where(eq(usersTable.id, newUserId));
          await db.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: newUserId,
            type: "bonus",
            amount: signupBonus.toFixed(2),
            description: "Welcome bonus — Thanks for joining!",
          });
        }

        const accessToken = signAccessToken(newUserId, phone, "customer", "customer", 0);
        const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
        await db.insert(refreshTokensTable).values({
          id: generateId(),
          userId: newUserId,
          tokenHash: refreshHash,
          authMethod: "phone_otp",
          expiresAt: new Date(Date.now() + getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000),
        });

        fireAndForget(
          emitWebhookEvent("user_registered", {
            userId: newUserId,
            phone,
            role: "customer",
            method: "phone_otp",
          }),
          "auth:webhook:user_registered:phone_otp",
          logger,
          { userId: newUserId, code: "WEBHOOK_EMIT" }
        );

        logAuthEvent({
          eventType: "register",
          userId: newUserId,
          ip,
          userAgent: req.headers["user-agent"] as string | undefined,
          channel: "phone_otp",
          role: "customer",
          success: true,
          metadata: { phone, requireApproval },
        });

        setRiderRefreshCookie(req, res, refreshRaw, { roles: "customer" });

        sendSuccess(res, {
          isNewUser: true,
          expiresIn: getAccessTokenTtlSec(),
          accessToken,
          refreshToken: refreshRaw,
          expiresAt: new Date(Date.now() + getAccessTokenTtlSec() * 1000).toISOString(),
          user: {
            id: newUserId,
            phone,
            name: null,
            email: null,
            username: null,
            roles: "customer",
            walletBalance: signupBonus,
            isActive: !requireApproval,
            totpEnabled: false,
          },
          ...(requireApproval ? { pendingApproval: true } : {}),
        });
        return;
      }

      // ── EXISTING USER: fetch + security gates + JWT ───────────────────────────
      const userId = verified.userId!;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        sendNotFound(res, "User not found.");
        return;
      }

      if (!isAuthMethodEnabled(settings, "auth_phone_otp_enabled", user.roles ?? undefined)) {
        sendErrorWithData(
          res,
          "Phone OTP login is currently disabled for your account type.",
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
            details: `User [${user.roles}] tried to log in as ${requestedRole}`,
            severity: "high",
          });
          sendErrorWithData(
            res,
            `This account is not registered as a ${requestedRole}. Please use the correct app.`,
            {
              wrongApp: true,
              redirectTo:
                requestedRole === "rider"
                  ? "/rider"
                  : requestedRole === "vendor"
                    ? "/vendor"
                    : "/customer",
              code: AUTH_ERROR_CODES.WRONG_APP,
            },
            403
          );
          return;
        }
      }

      if (user.isBanned) {
        addSecurityEvent({
          type: "banned_login_attempt",
          ip,
          userId: user.id,
          details: `Banned user verified OTP: ${phone}`,
          severity: "high",
        });
        sendForbidden(res, "Your account has been suspended. Please contact support.");
        return;
      }

      if (
        user.googleId &&
        isAuthMethodEnabled(settings, "auth_google_enabled", user.roles ?? undefined)
      ) {
        addSecurityEvent({
          type: "otp_hijack_google_account",
          ip,
          userId: user.id,
          details: `OTP verify on Google-linked account: ${phone}`,
          severity: "medium",
        });
        sendErrorWithData(
          res,
          "This account is linked to Google. Please sign in with Google.",
          { useGoogle: true },
          403
        );
        return;
      }

      const isPendingApproval = user.approvalStatus === "pending";
      if (!user.isActive && !isPendingApproval) {
        sendForbidden(res, "Your account is currently inactive. Please contact support.");
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
            "phone_otp"
          );
          sendSuccess(res, { twoFactorRequired: true, tempToken, userId: user.id });
          return;
        }
      }

      if (isPendingApproval) {
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

      // Post-OTP cross-app check for customer context
      const userRoles = (user.roles || "customer").split(",").map((r: string) => r.trim());
      if (isCustomerAppCtx && !userRoles.includes("customer")) {
        addSecurityEvent({
          type: "cross_role_login_attempt",
          ip,
          userId: user.id,
          details: `User [${user.roles}] phone-logged in to customer app — offering add-role`,
          severity: "low",
        });
      }

      // Issue full session
      const tokens = await issueTokensForUser(
        user,
        ip,
        "phone_otp",
        req.headers["user-agent"] as string | undefined,
        req,
        res
      );
      sendSuccess(res, {
        ...tokens,
        isNewUser: false,
        ...(isCustomerAppCtx && !userRoles.includes("customer")
          ? { canAddCustomerRole: true, code: "cross_app_account", wrongApp: true }
          : {}),
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "[phone.routes] verify-otp error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
