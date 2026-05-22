/**
 * otp.verify.ts — The heart of the OTP module.
 *
 * sendOtp()   → generate + store + deliver (with bypass checks)
 * verifyOtp() → validate + consume atomically (with brute-force guard)
 */

import { checkOTPBypass, logOTPBypassEvent } from "../../lib/auth-otp-bypass.js";
import { logger } from "../../lib/logger.js";
import { getCachedSettings } from "../../middleware/security.js";
import { OTP_CONFIG } from "./otp.config.js";
import { deliverOtp, getAvailableChannels } from "./otp.deliver.js";
import { generateOtpCode, hashOtpCode, verifyOtpHash } from "./otp.generate.js";
import {
  countRecentSends,
  getActiveOtpToken,
  getAttemptStatus,
  getLastSentAt,
  markOtpUsed,
  recordAttempt,
  saveOtpToken,
} from "./otp.store.js";
import type {
  OtpChannel,
  OtpSendOptions,
  OtpSendResult,
  OtpVerifyOptions,
  OtpVerifyResult,
} from "./otp.types.js";
import {
  OtpBlockedError,
  OtpExpiredError,
  OtpInvalidError,
  OtpRateLimitError,
} from "./otp.types.js";

// ─── Send OTP ──────────────────────────────────────────────────────────────────

export async function sendOtp(options: OtpSendOptions): Promise<OtpSendResult> {
  const {
    identifier: rawIdentifier,
    identifierType,
    otpType,
    userId,
    channel: preferredChannel,
    ipAddress,
    deviceFingerprint,
  } = options;

  const identifier = normalizeIdentifier(rawIdentifier, identifierType);

  // ── 1. Brute-force / lockout check ──
  const attemptStatus = await getAttemptStatus(identifier);
  if (attemptStatus.blocked) {
    logger.warn(
      { identifier: maskId(identifier), unlocksAt: attemptStatus.unlocksAt },
      "[otp:send] Identifier is locked out"
    );
    throw new OtpBlockedError(
      `Too many attempts. Try again after ${attemptStatus.unlocksAt?.toLocaleTimeString() ?? "some time"}.`,
      attemptStatus.unlocksAt ?? new Date(Date.now() + OTP_CONFIG.LOCKOUT_DURATION_MS)
    );
  }

  // ── 2. Send rate limit (max per hour) ──
  const recentCount = await countRecentSends(identifier, identifierType, 60 * 60 * 1000);
  if (recentCount >= OTP_CONFIG.MAX_SEND_PER_HOUR) {
    logger.warn(
      { identifier: maskId(identifier), recentCount },
      "[otp:send] Hourly send limit reached"
    );
    throw new OtpRateLimitError(
      "Too many OTP requests. Please wait before requesting another.",
      60 * 60 * 1000
    );
  }

  // ── 3. Resend cooldown ──
  const lastSentAt = await getLastSentAt(identifier, identifierType, otpType);
  if (lastSentAt) {
    const msSinceLast = Date.now() - lastSentAt.getTime();
    if (msSinceLast < OTP_CONFIG.RESEND_COOLDOWN_MS) {
      const retryAfterMs = OTP_CONFIG.RESEND_COOLDOWN_MS - msSinceLast;
      throw new OtpRateLimitError(
        `Please wait ${Math.ceil(retryAfterMs / 1000)} seconds before resending.`,
        retryAfterMs
      );
    }
  }

  // ── 4. Bypass checks (global suspend / per-user / whitelist) ──
  //    Only applies to phone-based OTP (email has no bypass mechanism)
  if (identifierType === "phone") {
    const bypass = await checkOTPBypass(identifier);
    if (bypass.isBypassed) {
      logger.info(
        { identifier: maskId(identifier), reason: bypass.reason },
        "[otp:send] OTP bypassed"
      );

      await logOTPBypassEvent(
        "otp_send_bypassed",
        userId ?? null,
        identifier,
        ipAddress ?? "unknown",
        bypass.reason ?? "unknown",
        { otpType }
      );

      return {
        success: true,
        otpRequired: false,
        channel: undefined,
        expiresAt: bypass.expiresAt ?? undefined,
        ...(bypass.bypassCode && isDevMode() && { devCode: bypass.bypassCode }),
      };
    }
  }

  // ── 5. Generate code ──
  const code = generateOtpCode();
  const hash = hashOtpCode(code);

  // ── 6. Determine delivery channel ──
  const settings = await getCachedSettings();
  const availableChannels = getAvailableChannels(identifierType, settings);
  const channel: OtpChannel = resolveChannel(preferredChannel, availableChannels);

  // ── 7. Persist token ──
  await saveOtpToken({
    identifier,
    identifierType,
    otpType,
    otpHash: hash,
    channel,
    userId,
    ipAddress,
    deviceFingerprint,
  });

  // ── 8. Deliver ──
  const delivery = await deliverOtp({
    identifier,
    identifierType,
    code,
    preferredChannel: channel,
  });

  const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MS);

  logger.info(
    {
      identifier: maskId(identifier),
      identifierType,
      otpType,
      channel: delivery.usedChannel,
      provider: delivery.provider,
    },
    "[otp:send] OTP sent"
  );

  return {
    success: true,
    otpRequired: true,
    channel: delivery.usedChannel,
    expiresAt,
    resendAfter: OTP_CONFIG.RESEND_COOLDOWN_MS,
    // devCode only exposed when BOTH conditions are true — never in production
    ...(isDevMode() && { devCode: code }),
  };
}

// ─── Verify OTP ────────────────────────────────────────────────────────────────

export async function verifyOtp(options: OtpVerifyOptions): Promise<OtpVerifyResult> {
  const { identifier: rawIdentifier, identifierType, otpType, code } = options;

  const identifier = normalizeIdentifier(rawIdentifier, identifierType);

  // ── 1. Lockout check before doing anything ──
  const status = await getAttemptStatus(identifier);
  if (status.blocked) {
    throw new OtpBlockedError(
      `Too many incorrect attempts. Try again after ${status.unlocksAt?.toLocaleTimeString() ?? "some time"}.`,
      status.unlocksAt ?? new Date(Date.now() + OTP_CONFIG.LOCKOUT_DURATION_MS)
    );
  }

  // ── 2. Find active token ──
  const token = await getActiveOtpToken({ identifier, identifierType, otpType });

  if (!token) {
    // No active token — could be expired or never sent
    await recordAttempt(identifier, false);
    const _fresh = await getAttemptStatus(identifier);
    throw new OtpExpiredError();
  }

  // ── 3. Verify hash (timing-safe) ──
  const valid = verifyOtpHash(code.trim(), token.otpHash);

  if (!valid) {
    const after = await recordAttempt(identifier, false);
    logger.warn(
      { identifier: maskId(identifier), attemptsLeft: after.attemptsLeft },
      "[otp:verify] Invalid code"
    );
    throw new OtpInvalidError(
      after.blocked
        ? "Too many incorrect attempts. Account temporarily locked."
        : `Incorrect code. ${after.attemptsLeft} attempt${after.attemptsLeft === 1 ? "" : "s"} remaining.`,
      after.attemptsLeft
    );
  }

  // ── 4. Consume token atomically — prevents replay ──
  await markOtpUsed(token.id);

  // ── 5. Clear attempt counter on success ──
  await recordAttempt(identifier, true);

  logger.info(
    { identifier: maskId(identifier), identifierType, otpType, tokenId: token.id },
    "[otp:verify] OTP verified successfully"
  );

  return {
    success: true,
    userId: token.userId ?? undefined,
    isNewUser: !token.userId,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeIdentifier(raw: string, type: "phone" | "email"): string {
  if (type === "email") return raw.toLowerCase().trim();

  // Phone: strip non-digits, convert to E.164 Pakistan format
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  if (digits.length === 10) return `+92${digits}`;
  return raw.trim(); // already normalized or international
}

function resolveChannel(preferred: OtpChannel | undefined, available: OtpChannel[]): OtpChannel {
  if (preferred && available.includes(preferred)) return preferred;
  // Use first available from priority order
  for (const ch of OTP_CONFIG.CHANNEL_PRIORITY) {
    if (available.includes(ch)) return ch;
  }
  return available[0] ?? "console";
}

function maskId(identifier: string): string {
  if (identifier.includes("@")) {
    const [local, domain] = identifier.split("@");
    return `${local?.slice(0, 2)}***@${domain}`;
  }
  if (identifier.length >= 7) {
    return `${identifier.slice(0, 3)}****${identifier.slice(-2)}`;
  }
  return "***";
}

function isDevMode(): boolean {
  return process.env["NODE_ENV"] !== "production" && process.env["ALLOW_DEV_OTP"] === "true";
}
