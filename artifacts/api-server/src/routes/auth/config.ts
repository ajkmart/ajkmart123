import { isAuthMethodEnabled } from "@workspace/auth-utils/server";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { canonicalizePhone } from "@workspace/phone-utils";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendSuccess } from "../../lib/response.js";
import { getCachedSettings } from "../../middleware/security.js";
import { getWhitelistBypass } from "../../services/smsGateway.js";

const router: IRouter = Router();

router.get("/config", async (_req, res) => {
  try {
    const settings = await getCachedSettings();

    /* ── Check if OTP bypass is currently active (global) ── */
    const otpGlobalDisabledUntilStr = settings["otp_global_disabled_until"];
    const now = new Date();
    let otpBypassActive = false;
    let otpBypassExpiresAt: string | null = null;

    if (otpGlobalDisabledUntilStr) {
      try {
        const disabledUntil = new Date(otpGlobalDisabledUntilStr);
        if (disabledUntil > now) {
          otpBypassActive = true;
          otpBypassExpiresAt = disabledUntil.toISOString();
        }
      } catch (e) {
        logger.error({ error: e }, "[/auth/config] Failed to parse OTP bypass timestamp");
      }
    }

    const bypassMessage = settings["otp_bypass_message"] ?? null;

    /* ── Rider-scoped auth method flags — use role-aware helper so JSON
       per-role maps like { "rider": "on" } are parsed correctly ── */
    const riderFlag = (key: string): boolean => isAuthMethodEnabled(settings, key, "rider");

    sendSuccess(res, {
      /* Legacy snake_case fields kept for backward compat */
      auth_mode: settings["auth_mode"] ?? "OTP",
      firebase_enabled: settings["firebase_enabled"] ?? "off",
      auth_otp_enabled: settings["auth_otp_enabled"] ?? "on",
      auth_email_enabled: settings["auth_email_enabled"] ?? "on",
      auth_google_enabled: settings["auth_google_enabled"] ?? "on",
      auth_facebook_enabled: settings["auth_facebook_enabled"] ?? "off",
      otpBypassActive,
      otpBypassExpiresAt,
      bypassMessage,
      /* Rider-scoped camelCase fields — consumed by AuthConfigContext */
      phoneOtp: riderFlag("auth_phone_otp_enabled"),
      emailOtp: riderFlag("auth_email_otp_enabled"),
      google: riderFlag("auth_google_enabled"),
      facebook: riderFlag("auth_facebook_enabled"),
      usernamePassword: riderFlag("auth_username_password_enabled"),
      magicLink: riderFlag("auth_magic_link_enabled"),
      totp: riderFlag("auth_totp_enabled"),
      captchaEnabled: riderFlag("auth_captcha_enabled"),
      captchaSiteKey: settings["recaptcha_site_key"] ?? null,
      googleClientId: settings["google_client_id"] ?? null,
      facebookAppId: settings["facebook_app_id"] ?? null,
      otpBypassGlobal: (settings["security_otp_bypass"] ?? "off") === "on",
      otpProvider: settings["otp_provider"] ?? null,
    });
  } catch (e) {
    logger.error({ error: e }, "[/auth/config] Failed to get config");
    sendSuccess(res, {
      auth_mode: "OTP",
      firebase_enabled: "off",
      auth_otp_enabled: "on",
      auth_email_enabled: "on",
      auth_google_enabled: "on",
      auth_facebook_enabled: "off",
      otpBypassActive: false,
      otpBypassExpiresAt: null,
      bypassMessage: null,
      phoneOtp: true,
      emailOtp: false,
      google: true,
      facebook: false,
      usernamePassword: true,
      magicLink: false,
      totp: false,
      captchaEnabled: false,
      captchaSiteKey: null,
      googleClientId: null,
      facebookAppId: null,
      otpBypassGlobal: false,
      otpProvider: null,
    });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /auth/otp-status?phone=...
   Lightweight phone-specific bypass query for frontend apps.
   Runs the same bypass checks as send-otp (global setting,
   per-user otp_bypass_until, whitelist) without generating or
   sending an OTP.
   Returns { bypassActive, bypassExpiresAt, message }
══════════════════════════════════════════════════════════════ */

router.get("/otp-status", async (req, res) => {
  try {
    const rawPhone = (req.query.phone as string | undefined) ?? "";
    if (!rawPhone || rawPhone.length < 7) {
      sendError(res, "phone query parameter is required", 400);
      return;
    }

    const phone = canonicalizePhone(rawPhone);
    const settings = await getCachedSettings();
    const now = new Date();

    let bypassActive = false;
    let bypassExpiresAt: string | null = null;
    let message: string | null = (settings["otp_bypass_message"] as string | undefined) ?? null;

    /* Priority 1: per-user bypass */
    const [userRow] = await db
      .select({ otpBypassUntil: usersTable.otpBypassUntil })
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);

    if (userRow?.otpBypassUntil && userRow.otpBypassUntil > now) {
      bypassActive = true;
      bypassExpiresAt = userRow.otpBypassUntil.toISOString();
    }

    /* Priority 2: global OTP bypass flag */
    if (!bypassActive && settings["security_otp_bypass"] === "on") {
      bypassActive = true;
      bypassExpiresAt = null;
    }

    /* Priority 3: timed global disable */
    if (!bypassActive) {
      const disabledUntilStr = settings["otp_global_disabled_until"];
      if (disabledUntilStr) {
        const disabledUntil = new Date(disabledUntilStr);
        if (disabledUntil > now) {
          bypassActive = true;
          bypassExpiresAt = disabledUntil.toISOString();
        }
      }
    }

    /* Priority 4: whitelist bypass */
    if (!bypassActive) {
      const whitelistCode = await getWhitelistBypass(phone);
      if (whitelistCode != null) {
        bypassActive = true;
        bypassExpiresAt = null;
        message = null;
      }
    }

    sendSuccess(res, { bypassActive, bypassExpiresAt, message });
  } catch (e) {
    logger.error({ error: e }, "[/auth/otp-status] Failed");
    sendSuccess(res, { bypassActive: false, bypassExpiresAt: null, message: null });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/check-identifier
   Unified Auth Gatekeeper — Account Discovery.
   Step 1 of the smart "Continue" login flow.
   Body: { identifier: string, role?: string, deviceId?: string }
   Returns what the client should do next: action + available methods.

   Rate-limited to 10 requests/min/IP to prevent phone number enumeration.
══════════════════════════════════════════════════════════════ */

export default router;
