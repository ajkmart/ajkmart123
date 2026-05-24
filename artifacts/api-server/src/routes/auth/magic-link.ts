import { isAuthMethodEnabled, isAuthMethodEnabledStrict } from "@workspace/auth-utils/server";
import { db } from "@workspace/db";
import { magicLinkTokensTable, usersTable } from "@workspace/db/schema";
import crypto, { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { logAuthEvent } from "../../lib/auth-response.js";
import { getUserLanguage } from "../../lib/getUserLanguage.js";
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
import { magicLinkLimiter } from "../../middleware/rate-limit.js";
import {
  addAuditEntry,
  addSecurityEvent,
  checkLockout,
  getCachedSettings,
  getClientIp,
  recordFailedAttempt,
  sign2faChallengeToken,
  writeAuthAuditLog,
} from "../../middleware/security.js";
import { validateBody as sharedValidateBody } from "../../middleware/validate.js";
import { sendMagicLinkEmail } from "../../services/email.js";
import { decryptTotpSecret, verifyTotpToken } from "../../services/totp.js";
import {
  isDeviceTrusted,
  issueTokensForUser,
  MagicLinkSendSchema,
  MagicLinkVerifySchema,
} from "./helpers.js";

const router: IRouter = Router();

const ML_SEND_MAX = 3;
const ML_SEND_WINDOW_MIN = 10;

router.post(
  "/magic-link/send",
  magicLinkLimiter,
  sharedValidateBody(MagicLinkSendSchema),
  async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !email.includes("@")) {
        sendError(res, "Valid email address required", 400);
        return;
      }

      const ip = getClientIp(req);
      const settings = await getCachedSettings();

      if (!isAuthMethodEnabledStrict(settings, "auth_magic_link_enabled", "auth_magic_link")) {
        sendErrorWithData(
          res,
          "Magic link login is currently disabled.",
          { code: "AUTH_METHOD_DISABLED" },
          400
        );
        return;
      }

      const normalized = email.toLowerCase().trim();

      // Redis-backed per-email rate limit (replaces in-memory map — survives restarts + scales horizontally)
      const mlSendKey = `magic_link_send:${normalized}`;
      const mlLockout = await checkLockout(mlSendKey, ML_SEND_MAX, ML_SEND_WINDOW_MIN);
      if (mlLockout.locked) {
        sendTooManyRequests(
          res,
          `Too many magic link requests. Try again in ${mlLockout.minutesLeft} minute(s).`
        );
        return;
      }

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, normalized))
        .limit(1);
      if (!user) {
        // Silent 200 — don't reveal that no account exists for this email
        await recordFailedAttempt(mlSendKey, ML_SEND_MAX, ML_SEND_WINDOW_MIN);
        sendSuccess(res, {
          message: "If an account exists with this email, a magic link has been sent.",
        });
        return;
      }

      const effectiveMagicRole =
        user.roles ??
        (req.body?.role === "rider" || req.body?.role === "vendor" ? req.body.role : "customer");
      if (
        !isAuthMethodEnabledStrict(
          settings,
          "auth_magic_link_enabled",
          "auth_magic_link",
          effectiveMagicRole
        )
      ) {
        // Normalize to silent 200 — revealing role-method-disabled leaks that email is registered with that role
        await recordFailedAttempt(mlSendKey, ML_SEND_MAX, ML_SEND_WINDOW_MIN);
        sendSuccess(res, {
          message: "If an account exists with this email, a magic link has been sent.",
        });
        return;
      }

      if (user.isBanned || (!user.isActive && user.approvalStatus !== "pending")) {
        // Silent 200 — don't confirm the account exists or its suspension state
        addSecurityEvent({
          type: "magic_link_blocked_account",
          ip,
          userId: user.id,
          details: `Magic link requested for ${user.isBanned ? "banned" : "inactive"} account: ${normalized}`,
          severity: user.isBanned ? "high" : "medium",
        });
        await recordFailedAttempt(mlSendKey, ML_SEND_MAX, ML_SEND_WINDOW_MIN);
        sendSuccess(res, {
          message: "If an account exists with this email, a magic link has been sent.",
        });
        return;
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const magicLinkTtlMin = Math.max(
        5,
        parseInt(settings["auth_magic_link_ttl_min"] ?? "30", 10)
      );
      const expiresAt = new Date(Date.now() + magicLinkTtlMin * 60 * 1000);

      await db.insert(magicLinkTokensTable).values({
        id: generateId(),
        userId: user.id,
        tokenHash,
        expiresAt,
      });
      logAuthEvent({
        eventType: "magic_link_sent",
        userId: user.id,
        ip,
        userAgent: req.headers["user-agent"] as string | undefined,
        channel: "magic_link",
        role: user.roles ?? "customer",
        success: true,
        metadata: { expiresAt: expiresAt.toISOString() },
      });

      const magicLinkLang = await getUserLanguage(user.id);
      await sendMagicLinkEmail(normalized, rawToken, settings, magicLinkLang);

      // Count successful sends against the per-email rate limit
      await recordFailedAttempt(mlSendKey, ML_SEND_MAX, ML_SEND_WINDOW_MIN);

      addAuditEntry({
        action: "magic_link_sent",
        ip,
        details: `Magic link sent to: ${normalized}`,
        result: "success",
      });
      void writeAuthAuditLog("magic_link_sent", { ip, metadata: { email: normalized } });

      const isDevTokenLog =
        process.env.NODE_ENV === "development" && process.env["LOG_OTP"] === "1";
      sendSuccess(res, {
        message: "If an account exists with this email, a magic link has been sent.",
        ...(isDevTokenLog ? { token: rawToken } : {}),
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
   POST /auth/magic-link/verify
   Validate magic link token, handle 2FA guard.
   Body: { token, totpCode?, deviceFingerprint? }
══════════════════════════════════════════════════════════════ */

router.post("/magic-link/verify", sharedValidateBody(MagicLinkVerifySchema), async (req, res) => {
  try {
    const { token, totpCode, deviceFingerprint } = req.body;
    if (!token) {
      sendError(res, "Token required", 400);
      return;
    }

    const ip = getClientIp(req);
    const settings = await getCachedSettings();

    if (!isAuthMethodEnabledStrict(settings, "auth_magic_link_enabled", "auth_magic_link")) {
      sendErrorWithData(
        res,
        "Magic link login is currently disabled.",
        { code: "AUTH_METHOD_DISABLED" },
        400
      );
      return;
    }

    // Direct O(1) hash lookup — previous full-table scan with LIMIT 50 could silently
    // fail to find legitimate tokens when >50 active tokens existed in the table.
    const incomingHash = createHash("sha256").update(token).digest("hex");
    const [matchedRow] = await db
      .select()
      .from(magicLinkTokensTable)
      .where(
        sql`${magicLinkTokensTable.tokenHash} = ${incomingHash}
          AND ${magicLinkTokensTable.usedAt} IS NULL
          AND ${magicLinkTokensTable.expiresAt} > now()`
      )
      .limit(1);

    if (!matchedRow) {
      addSecurityEvent({
        type: "magic_link_invalid",
        ip,
        details: "Invalid or expired magic link token",
        severity: "medium",
      });
      sendUnauthorized(res, "Invalid or expired magic link. Please request a new one.");
      return;
    }

    await db
      .update(magicLinkTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(magicLinkTokensTable.id, matchedRow.id));

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, matchedRow.userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }
    if (user.isBanned) {
      sendForbidden(res, "Account suspended");
      return;
    }
    if (!user.isActive && user.approvalStatus !== "pending") {
      sendForbidden(res, "Account inactive");
      return;
    }

    if (
      !isAuthMethodEnabledStrict(
        settings,
        "auth_magic_link_enabled",
        "auth_magic_link",
        user.roles ?? "customer"
      )
    ) {
      sendErrorWithData(
        res,
        "Magic link login is currently disabled for your account type.",
        { code: "AUTH_METHOD_DISABLED" },
        400
      );
      return;
    }

    if (
      user.totpEnabled &&
      isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles ?? undefined)
    ) {
      const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
      if (!isDeviceTrusted(user, deviceFingerprint ?? "", trustedDays)) {
        if (!totpCode) {
          const tempToken = sign2faChallengeToken(
            user.id,
            user.phone ?? "",
            user.roles ?? "customer",
            user.roles ?? "customer",
            "magic_link"
          );
          sendSuccess(res, { requires2FA: true, tempToken, userId: user.id });
          return;
        }
        let mlSecret: string;
        try {
          mlSecret = decryptTotpSecret(user.totpSecret!);
        } catch (decryptErr) {
          logger.error(
            {
              error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
              userId: user.id,
            },
            "[magic-link] TOTP secret decryption failed"
          );
          sendUnauthorized(
            res,
            "Two-factor authentication is not properly configured. Please contact support."
          );
          return;
        }
        if (!verifyTotpToken(totpCode, mlSecret)) {
          sendUnauthorized(res, "Invalid 2FA code");
          return;
        }
      }
    }

    await db
      .update(usersTable)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    addAuditEntry({
      action: "magic_link_login",
      ip,
      details: `Magic link login: ${user.email ?? matchedRow.userId}`,
      result: "success",
    });
    const result = await issueTokensForUser(
      user,
      ip,
      "magic_link",
      req.headers["user-agent"] as string,
      req,
      res
    );
    logAuthEvent({
      eventType: "login_success",
      userId: user.id,
      ip,
      userAgent: req.headers["user-agent"] as string | undefined,
      channel: "magic_link",
      role: user.roles ?? "customer",
      success: true,
    });
    sendSuccess(res, result);
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
   POST /auth/change-phone/request
   Send OTP to a new phone number for phone change flow.
   Body: { newPhone }
══════════════════════════════════════════════════════════════ */

export default router;
