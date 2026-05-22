import { isAuthMethodEnabled } from "@workspace/auth-utils/server";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { canonicalizePhone } from "@workspace/phone-utils";
import { randomInt } from "crypto";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { getPlatformDefaultLanguage } from "../../lib/getUserLanguage.js";
import { logger } from "../../lib/logger.js";
import { sendSuccess, sendTooManyRequests } from "../../lib/response.js";
import {
  addSecurityEvent,
  checkAvailableRateLimit,
  checkLockout,
  getCachedSettings,
  getClientIp,
} from "../../middleware/security.js";
import { validateBody as sharedValidateBody } from "../../middleware/validate.js";
import { CheckAvailableSchema, checkIdentifierSchema } from "./helpers.js";

const router: IRouter = Router();

const checkIdentifierLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many identifier checks. Please wait a minute before trying again." },
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => getClientIp(req),
});
router.post(
  "/check-identifier",
  checkIdentifierLimiter,
  sharedValidateBody(checkIdentifierSchema),
  async (req, res) => {
    try {
      const { identifier, role, deviceId: _deviceId } = req.body;

      const ip = getClientIp(req);
      const settings = await getCachedSettings();
      const userRole = role === "rider" || role === "vendor" ? role : "customer";
      const registrationOpen = settings["feature_new_users"] !== "off";

      /* ── Normalise identifier — detect phone vs email vs username ── */
      let user: typeof usersTable.$inferSelect | undefined;

      const looksLikePhone = (() => {
        const trimmed = identifier.trim();
        if (!/^[\d\s\-+()]{7,15}$/.test(trimmed)) return false;
        try {
          const canon = canonicalizePhone(trimmed);
          return /^3\d{9}$/.test(canon);
        } catch {
          return false;
        }
      })();
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());

      if (looksLikePhone) {
        const phone = canonicalizePhone(identifier);
        const rows = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
        user = rows[0];
      } else if (looksLikeEmail) {
        const rows = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, identifier.trim().toLowerCase()))
          .limit(1);
        user = rows[0];
      } else {
        const rows = await db
          .select()
          .from(usersTable)
          .where(sql`lower(${usersTable.username}) = ${identifier.trim().toLowerCase()}`)
          .limit(1);
        user = rows[0];
      }

      const exists = !!user;
      const _isNewUser = !exists;

      /* ── Phone / email enumeration hardening ─────────────────────────────────
     For phone/email identifiers we must return an IDENTICAL response whether
     the account exists, is banned, is locked, is Google-linked, or doesn't
     exist at all.  Any distinguishable response would let an attacker enumerate
     registered phone numbers.

     Security events are still logged server-side; actual enforcement (banned,
     locked, Google-linked) happens in /auth/verify-otp after OTP proof.

     Exception: username-based identifiers may safely reveal existence (the
     attacker must already know the username) and may show banned/locked there.

     Rule: for phone/email, always use the *request* role, never the DB user's
     role — the latter would differ between existing and non-existing records. ── */

      /* For username path only: surface banned/locked at check time (acceptable) */
      if (!looksLikePhone && !looksLikeEmail) {
        if (user?.isBanned) {
          addSecurityEvent({
            type: "banned_user_identifier_check",
            ip,
            userId: user.id,
            details: `Banned user check: ${identifier}`,
            severity: "medium",
          });
          sendSuccess(res, { isBanned: true, action: "blocked", availableMethods: [] });
          return;
        }
        const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
        const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);
        const lockoutKey = identifier.trim();
        const lockout = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
        if (lockout.locked) {
          sendSuccess(res, {
            isLocked: true,
            lockedMinutes: lockout.minutesLeft,
            action: "locked",
            availableMethods: [],
          });
          return;
        }
      } else {
        /* Phone / email: log security events silently, never gate on them */
        if (user?.isBanned) {
          addSecurityEvent({
            type: "banned_user_identifier_check",
            ip,
            userId: user.id,
            details: `Banned user phone/email check: ${identifier}`,
            severity: "medium",
          });
        }
      }

      /* ── Build available methods based on admin config + request role ──
     Use userRole (from request) for phone/email — never user?.role — so the
     response shape is identical for existing and non-existing identifiers. ── */
      const effectiveCheckRole =
        looksLikePhone || looksLikeEmail ? userRole : (user?.roles ?? userRole);
      const googleEnabled = isAuthMethodEnabled(
        settings,
        "auth_google_enabled",
        effectiveCheckRole
      );
      const facebookEnabled = isAuthMethodEnabled(
        settings,
        "auth_facebook_enabled",
        effectiveCheckRole
      );
      const phoneOtpEnabled = isAuthMethodEnabled(
        settings,
        "auth_phone_otp_enabled",
        effectiveCheckRole
      );
      const emailOtpEnabled = isAuthMethodEnabled(
        settings,
        "auth_email_otp_enabled",
        effectiveCheckRole
      );
      const passwordEnabled = isAuthMethodEnabled(
        settings,
        "auth_username_password_enabled",
        effectiveCheckRole
      );
      const magicLinkEnabled = isAuthMethodEnabled(
        settings,
        "auth_magic_link_enabled",
        effectiveCheckRole
      );

      const availableMethods: string[] = [];
      if (phoneOtpEnabled) availableMethods.push("phone_otp");
      if (emailOtpEnabled) availableMethods.push("email_otp");
      if (passwordEnabled) availableMethods.push("password");
      if (googleEnabled) availableMethods.push("google");
      if (facebookEnabled) availableMethods.push("facebook");
      if (magicLinkEnabled) availableMethods.push("magic_link");

      /* ── Phone / email enumeration hardening ─────────────────────────────────
     For phone and email identifiers we MUST NOT reveal whether an account
     exists.  Return a single generic action ("send_otp") for every phone/email,
     regardless of whether the account is new, existing, Google-linked, etc.
     Account state is only enforced inside /auth/verify-otp (after OTP proof).

     For username-based identifiers the threat model is different (the attacker
     must already know the username), so we can still route to "register" vs
     "login_password" there — but we never return social-linked flags. ── */
      let action: string;
      let noMethodReason: string | undefined;
      let responseAvailableMethods: string[] = availableMethods;

      if (looksLikePhone) {
        /* Always say "send OTP" — never distinguish new vs returning user */
        if (phoneOtpEnabled) {
          action = "send_phone_otp";
        } else {
          action = "no_method";
          noMethodReason = "phone_disabled";
        }
      } else if (looksLikeEmail) {
        if (emailOtpEnabled) action = "send_email_otp";
        else if (magicLinkEnabled) action = "send_magic_link";
        else {
          action = "no_method";
          noMethodReason = "email_disabled";
        }
      } else {
        /* Username path: determine action from existence without leaking social links */
        const usableMethods = availableMethods.filter((m) => {
          if (m === "password") return !!user?.passwordHash;
          return true;
        });
        responseAvailableMethods = exists ? usableMethods : availableMethods;

        if (!registrationOpen && !exists) {
          action = "registration_closed";
        } else if (!exists) {
          action = "register";
        } else if (passwordEnabled && user?.passwordHash) {
          action = "login_password";
        } else if (usableMethods.length > 0) {
          const first = usableMethods[0]!;
          action =
            first === "password"
              ? "login_password"
              : first === "phone_otp"
                ? "send_phone_otp"
                : first === "email_otp"
                  ? "send_email_otp"
                  : first === "magic_link"
                    ? "send_magic_link"
                    : "no_method";
          if (action === "no_method") noMethodReason = "all_disabled";
        } else {
          action = "no_method";
          noMethodReason = exists && !user?.passwordHash ? "password_disabled" : "all_disabled";
        }
      }

      const whatsappOn = settings["integration_whatsapp"] === "on";
      const smsOn = phoneOtpEnabled;
      const otpChannels: string[] = [];
      if (whatsappOn) otpChannels.push("whatsapp");
      if (smsOn) otpChannels.push("sms");

      sendSuccess(res, {
        registrationOpen,
        action,
        reason: noMethodReason,
        availableMethods: responseAvailableMethods,
        isBanned: false,
        isLocked: false,
        otpChannels,
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

/* ─────────────────────────────────────────────────────────────
   POST /auth/send-merge-otp
   Send OTP for linking a new identifier to the authenticated user.
   Stores OTP on the authenticated user's record.
   Body: { identifier }
───────────────────────────────────────────────────────────── */

router.post("/check-available", sharedValidateBody(CheckAvailableSchema), async (req, res) => {
  try {
    /* ── IP-based rate limit: max 20 checks per 10 minutes per IP ──
     Prevents scraping the entire user registry via phone/email/username probing. */
    const ip = getClientIp(req);
    const rlCheck = await checkAvailableRateLimit(ip, 20, 10);
    if (rlCheck.limited) {
      sendTooManyRequests(res, `Too many requests. Try again in ${rlCheck.minutesLeft} minute(s).`);
      return;
    }

    const { phone, email, username } = req.body;
    const result: Record<string, { available: boolean; suggestions?: string[] }> = {};

    const _lang = await getPlatformDefaultLanguage();

    if (phone) {
      const canonPhone = canonicalizePhone(phone);
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, canonPhone))
        .limit(1);
      result.phone = existing ? { available: false } : { available: true };
    }

    if (email && email.length > 3) {
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email.toLowerCase().trim()))
        .limit(1);
      result.email = existing ? { available: false } : { available: true };
    }

    if (username && username.length > 2) {
      const clean = username.toLowerCase().trim();
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(sql`lower(${usersTable.username}) = ${clean}`)
        .limit(1);
      result.username = existing
        ? {
            available: false,
            suggestions: [`${clean}1`, `${clean}_pk`, `${clean}_${randomInt(100, 999)}`],
          }
        : { available: true };
    }

    sendSuccess(res, {
      available: Object.values(result).every((entry) => entry.available),
      suggestions: result.username?.suggestions ?? [],
      ...result,
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
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/send-email-otp
   Send OTP to email address (only for existing accounts with that email)
   Body: { email }
══════════════════════════════════════════════════════════════ */

export default router;
