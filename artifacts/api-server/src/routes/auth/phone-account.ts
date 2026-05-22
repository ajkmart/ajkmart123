import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { canonicalizePhone } from "@workspace/phone-utils";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getUserLanguage } from "../../lib/getUserLanguage.js";
import { logger } from "../../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendUnauthorized } from "../../lib/response.js";
import { getCachedSettings, getClientIp, writeAuthAuditLog } from "../../middleware/security.js";
import { validateBody as sharedValidateBody } from "../../middleware/validate.js";
import { OtpBlockedError, OtpExpiredError, OtpInvalidError } from "../../modules/otp/otp.types.js";
import { verifyOtp } from "../../modules/otp/otp.verify.js";
import { generateSecureOtp } from "../../services/password.js";
import { sendOtpSMS } from "../../services/sms.js";
import { sendWhatsAppOTP } from "../../services/whatsapp.js";
import { ChangePhoneConfirmSchema, ChangePhoneRequestSchema, extractAuthUser } from "./helpers.js";

const router: IRouter = Router();

router.post(
  "/change-phone/request",
  sharedValidateBody(ChangePhoneRequestSchema),
  async (req, res) => {
    try {
      const auth = extractAuthUser(req);
      if (!auth) {
        sendUnauthorized(res, "Authentication required");
        return;
      }

      const { newPhone } = req.body;
      if (!newPhone || typeof newPhone !== "string") {
        sendError(res, "New phone number is required", 400);
        return;
      }

      const phone = canonicalizePhone(newPhone);
      if (!/^3\d{9}$/.test(phone)) {
        sendError(res, "Invalid Pakistani phone number format", 400);
        return;
      }

      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, phone))
        .limit(1);
      if (existing) {
        sendError(res, "This phone number is already registered to another account", 409);
        return;
      }

      const ip = getClientIp(req);
      const settings = await getCachedSettings();
      const otp = generateSecureOtp();
      const _otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

      // Store merge OTP in otp_tokens (mergeOtpCode column was dropped from users table)
      const { saveOtpToken } = await import("../../modules/otp/otp.store.js");
      const { hashOtpCode } = await import("../../modules/otp/otp.generate.js");
      await saveOtpToken({
        identifier: phone,
        identifierType: "phone",
        otpType: "merge",
        otpHash: hashOtpCode(otp),
        channel: "sms",
        userId: auth.userId,
        ttlMs: 10 * 60 * 1000,
      });
      await db
        .update(usersTable)
        .set({
          pendingMergeIdentifier: phone,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, auth.userId));

      const lang = await getUserLanguage(auth.userId);
      const whatsappEnabled = settings["integration_whatsapp"] === "on";
      let sent = false;
      if (whatsappEnabled) {
        const waResult = await sendWhatsAppOTP(phone, otp, settings, lang);
        if (waResult.sent) sent = true;
      }
      if (!sent) {
        await sendOtpSMS(phone, otp, settings, lang);
      }

      void writeAuthAuditLog("phone_change_requested", {
        userId: auth.userId,
        ip,
        userAgent: req.headers["user-agent"] as string,
        metadata: { newPhone: phone },
      });

      sendSuccess(res, undefined, "OTP sent to new phone number");
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
   POST /auth/change-phone/confirm
   Verify OTP and update phone number.
   Body: { newPhone, otp }
══════════════════════════════════════════════════════════════ */

router.post(
  "/change-phone/confirm",
  sharedValidateBody(ChangePhoneConfirmSchema),
  async (req, res) => {
    try {
      const auth = extractAuthUser(req);
      if (!auth) {
        sendUnauthorized(res, "Authentication required");
        return;
      }

      const { newPhone, otp } = req.body;
      if (!newPhone || !otp) {
        sendError(res, "New phone number and OTP are required", 400);
        return;
      }

      const phone = canonicalizePhone(newPhone);
      const ip = getClientIp(req);

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, auth.userId))
        .limit(1);
      if (!user) {
        sendNotFound(res, "User not found");
        return;
      }

      if (user.pendingMergeIdentifier !== phone) {
        sendError(res, "OTP was not requested for this phone number", 400);
        return;
      }

      try {
        await verifyOtp({
          identifier: phone,
          identifierType: "phone",
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

      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, phone))
        .limit(1);
      if (existing) {
        sendError(res, "This phone number is already registered to another account", 409);
        return;
      }

      await db
        .update(usersTable)
        .set({
          phone,
          phoneVerified: true,
          pendingMergeIdentifier: null,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, auth.userId));

      void writeAuthAuditLog("phone_changed", {
        userId: auth.userId,
        ip,
        userAgent: req.headers["user-agent"] as string,
        metadata: { newPhone: phone },
      });

      sendSuccess(res, { success: true, message: "Phone number updated successfully", phone });
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
   GET /auth/login-history
   Return last 20 login attempts for authenticated user.
══════════════════════════════════════════════════════════════ */

export default router;
