import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { canonicalizePhone } from "@workspace/phone-utils";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getUserLanguage } from "../../lib/getUserLanguage.js";
import { logger } from "../../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendUnauthorized } from "../../lib/response.js";
import { otpLimiter } from "../../middleware/rate-limit.js";
import { getCachedSettings, getClientIp, writeAuthAuditLog } from "../../middleware/security.js";
import { validateBody as sharedValidateBody } from "../../middleware/validate.js";
import { hashOtpCode } from "../../modules/otp/otp.generate.js";
import { saveOtpToken } from "../../modules/otp/otp.store.js";
import { OtpBlockedError, OtpExpiredError, OtpInvalidError } from "../../modules/otp/otp.types.js";
import { verifyOtp } from "../../modules/otp/otp.verify.js";
import { sendPasswordResetEmail } from "../../services/email.js";
import { generateSecureOtp } from "../../services/password.js";
import { sendOtpSMS } from "../../services/sms.js";
import { sendWhatsAppOTP } from "../../services/whatsapp.js";
import { extractAuthUser, MergeAccountSchema, SendMergeOtpSchema, tryEncrypt } from "./helpers.js";

const router: IRouter = Router();

router.post(
  "/send-merge-otp",
  otpLimiter,
  sharedValidateBody(SendMergeOtpSchema),
  async (req, res) => {
    try {
      const auth = extractAuthUser(req);
      if (!auth) {
        sendUnauthorized(res, "Authentication required");
        return;
      }

      const { identifier } = req.body;
      if (!identifier) {
        sendError(res, "Identifier is required", 400);
        return;
      }

      const ip = getClientIp(req);
      const settings = await getCachedSettings();

      const looksLikePhone = /^[\d\s\-+()]{7,15}$/.test(identifier.trim());
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());

      if (!looksLikePhone && !looksLikeEmail) {
        sendError(res, "Identifier must be a phone number or email address", 400);
        return;
      }

      if (looksLikePhone) {
        const phone = canonicalizePhone(identifier);
        const [existing] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.phone, phone))
          .limit(1);
        if (existing) {
          sendError(res, "This phone number is already linked to another account", 409);
          return;
        }
      } else {
        const email = identifier.trim().toLowerCase();
        const [existing] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(1);
        if (existing) {
          sendError(res, "This email is already linked to another account", 409);
          return;
        }
      }

      const otp = generateSecureOtp();
      const normalizedIdentifier = looksLikePhone
        ? canonicalizePhone(identifier)
        : identifier.trim().toLowerCase();
      await saveOtpToken({
        identifier: normalizedIdentifier,
        identifierType: looksLikePhone ? "phone" : "email",
        otpType: "merge",
        otpHash: hashOtpCode(otp),
        channel: looksLikePhone ? "sms" : "email",
        userId: auth.userId,
        ttlMs: 10 * 60 * 1000,
      });
      await db
        .update(usersTable)
        .set({ pendingMergeIdentifier: normalizedIdentifier, updatedAt: new Date() })
        .where(eq(usersTable.id, auth.userId));

      if (looksLikePhone) {
        const phone = canonicalizePhone(identifier);
        const lang = await getUserLanguage(auth.userId);
        const whatsappEnabled = settings["integration_whatsapp"] === "on";
        let sent = false;
        if (whatsappEnabled) {
          const waResult = await sendWhatsAppOTP(phone, otp, settings, lang);
          if (waResult.sent) sent = true;
        }
        if (!sent) {
          const smsResult = await sendOtpSMS(phone, otp, settings, lang);
          sent = smsResult.sent;
        }
        const _isDev = process.env.NODE_ENV !== "production";
        sendSuccess(res, undefined, "OTP sent to phone");
      } else {
        const email = identifier.trim().toLowerCase();
        const lang = await getUserLanguage(auth.userId);
        const [user] = await db
          .select({ name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, auth.userId))
          .limit(1);
        await sendPasswordResetEmail(email, otp, user?.name ?? undefined, lang);
        sendSuccess(res, undefined, "OTP sent to email");
      }

      void writeAuthAuditLog("merge_otp_sent", {
        ip,
        userId: auth.userId,
        userAgent: req.headers["user-agent"] ?? undefined,
        metadata: { identifier },
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
   POST /auth/merge-account
   Link a new identifier (phone/email) to an authenticated user.
   Requires: valid JWT + OTP verification for the new identifier.
   Body: { identifier, otp }
───────────────────────────────────────────────────────────── */

router.post("/merge-account", otpLimiter, sharedValidateBody(MergeAccountSchema), async (req, res) => {
  try {
    const auth = extractAuthUser(req);
    if (!auth) {
      sendUnauthorized(res, "Authentication required");
      return;
    }

    const { identifier, otp } = req.body;
    if (!identifier || !otp) {
      sendError(res, "Identifier and OTP are required", 400);
      return;
    }

    const ip = getClientIp(req);
    const _settings = await getCachedSettings();

    const looksLikePhone = /^[\d\s\-+()]{7,15}$/.test(identifier.trim());
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());

    if (!looksLikePhone && !looksLikeEmail) {
      sendError(res, "Identifier must be a phone number or email address", 400);
      return;
    }

    const [currentUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId))
      .limit(1);
    if (!currentUser) {
      sendNotFound(res, "User not found");
      return;
    }

    const normalizedIdentifier = looksLikePhone
      ? canonicalizePhone(identifier)
      : identifier.trim().toLowerCase();

    if (currentUser.pendingMergeIdentifier !== normalizedIdentifier) {
      sendError(res, "OTP was not issued for this identifier", 400);
      return;
    }

    try {
      await verifyOtp({
        identifier: normalizedIdentifier,
        identifierType: looksLikePhone ? "phone" : "email",
        otpType: "merge",
        code: String(otp),
      });
    } catch (otpErr) {
      if (
        otpErr instanceof OtpBlockedError ||
        otpErr instanceof OtpInvalidError ||
        otpErr instanceof OtpExpiredError
      ) {
        sendError(res, otpErr.message || "Invalid or expired OTP", 400);
        return;
      }
      throw otpErr;
    }

    if (looksLikePhone) {
      const phone = normalizedIdentifier;
      if (currentUser.phone === phone) {
        sendError(res, "This phone is already linked to your account", 400);
        return;
      }

      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, phone))
        .limit(1);
      if (existing) {
        sendError(res, "This phone number is already linked to another account", 409);
        return;
      }

      await db
        .update(usersTable)
        .set({
          phone,
          encryptedPhone: tryEncrypt(phone),
          phoneVerified: true,
          pendingMergeIdentifier: null,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, auth.userId));

      void writeAuthAuditLog("account_merge_phone", {
        ip,
        userId: auth.userId,
        userAgent: req.headers["user-agent"] ?? undefined,
        metadata: { phone },
      });
      sendSuccess(res, {
        success: true,
        message: "Phone number linked successfully",
        linked: "phone",
      });
    } else {
      const email = normalizedIdentifier;
      if (currentUser.email === email) {
        sendError(res, "This email is already linked to your account", 400);
        return;
      }

      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      if (existing) {
        sendError(res, "This email is already linked to another account", 409);
        return;
      }

      await db
        .update(usersTable)
        .set({
          email,
          encryptedEmail: tryEncrypt(email),
          emailVerified: true,
          pendingMergeIdentifier: null,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, auth.userId));

      void writeAuthAuditLog("account_merge_email", {
        ip,
        userId: auth.userId,
        userAgent: req.headers["user-agent"] ?? undefined,
        metadata: { email },
      });
      sendSuccess(res, { success: true, message: "Email linked successfully", linked: "email" });
    }
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

/* ─────────────────────────────────────────────────────────────
   POST /auth/send-otp
   Atomically upsert user by phone — one account per number.
───────────────────────────────────────────────────────────── */

export default router;
