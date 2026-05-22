/**
 * OTP Delivery Layer — unified send with automatic channel failover.
 *
 * Priority (from platform settings):  WhatsApp → SMS → Email → Console
 * Each channel is tried in order; if it fails, the next one is attempted.
 * Console is only used when NODE_ENV !== 'production' AND ALLOW_DEV_OTP=true.
 *
 * This module does NOT duplicate provider logic — it delegates to the
 * existing SMS / WhatsApp / Email services which own their own credentials
 * and template handling. This layer only adds the unified failover wrapper.
 */

import { logger } from "../../lib/logger.js";
import { getCachedSettings } from "../../middleware/security.js";
import { isSMSConsoleActive, isSMSProviderConfigured, sendOtpSMS } from "../../services/sms.js";
import { isWhatsAppProviderConfigured, sendWhatsAppOTP } from "../../services/whatsapp.js";
import { OTP_CONFIG } from "./otp.config.js";
import type { OtpChannel, OtpIdentifierType } from "./otp.types.js";
import { OtpDeliveryError } from "./otp.types.js";

export interface DeliveryResult {
  success: boolean;
  usedChannel: OtpChannel;
  provider?: string;
  messageId?: string;
}

// ─── Main Entry Point ──────────────────────────────────────────────────────────

export async function deliverOtp(options: {
  identifier: string;
  identifierType: OtpIdentifierType;
  code: string;
  preferredChannel?: OtpChannel;
  userLanguage?: string;
}): Promise<DeliveryResult> {
  const { identifier, identifierType, code, preferredChannel, userLanguage } = options;
  const settings = await getCachedSettings();

  // Build ordered channel list: preferred first, then platform priority order
  const channelOrder = buildChannelOrder(preferredChannel, identifierType, settings);

  const errors: string[] = [];

  for (const channel of channelOrder) {
    const start = Date.now();
    try {
      let result: { success: boolean; provider?: string; messageId?: string };

      if (channel === "whatsapp") {
        result = await tryWhatsApp(identifier, code, settings, userLanguage);
      } else if (channel === "sms") {
        result = await trySms(identifier, code, settings, userLanguage);
      } else if (channel === "email") {
        result = await tryEmail(identifier, code, settings, userLanguage);
      } else {
        result = tryConsole(identifier, code);
      }

      const ms = Date.now() - start;

      if (result.success) {
        logger.info(
          { channel, provider: result.provider, latencyMs: ms },
          "[otp:deliver] OTP delivered successfully"
        );
        return {
          success: true,
          usedChannel: channel,
          provider: result.provider,
          messageId: result.messageId,
        };
      }

      const reason = `${channel} failed`;
      errors.push(reason);
      logger.warn({ channel, latencyMs: ms }, `[otp:deliver] Channel failed — trying next`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${channel}: ${msg}`);
      logger.warn({ channel, error: msg }, "[otp:deliver] Channel threw — trying next");
    }
  }

  // All channels exhausted
  logger.error(
    { channelsTried: channelOrder, errors },
    "[otp:deliver] All channels failed — OTP not delivered"
  );
  throw new OtpDeliveryError(
    `OTP delivery failed on all channels: ${errors.join("; ")}`,
    channelOrder[channelOrder.length - 1] ?? "console"
  );
}

// ─── Channel Availability Check ────────────────────────────────────────────────

export function getAvailableChannels(
  identifierType: OtpIdentifierType,
  settings: Record<string, string>
): OtpChannel[] {
  const available: OtpChannel[] = [];

  if (identifierType === "phone") {
    if (isWhatsAppProviderConfigured(settings)) available.push("whatsapp");
    if (isSMSProviderConfigured(settings) || isSMSConsoleActive(settings)) available.push("sms");
  }

  if (identifierType === "email") {
    const emailConfigured = !!(
      process.env["SENDGRID_API_KEY"] ||
      process.env["SMTP_HOST"] ||
      settings["smtp_host"]?.trim()
    );
    if (emailConfigured) available.push("email");
  }

  // Console is always last-resort in non-production dev mode
  if (isConsoleAllowed()) available.push("console");

  return available;
}

// ─── Channel Order Builder ─────────────────────────────────────────────────────

function buildChannelOrder(
  preferred: OtpChannel | undefined,
  identifierType: OtpIdentifierType,
  settings: Record<string, string>
): OtpChannel[] {
  const available = getAvailableChannels(identifierType, settings);

  if (available.length === 0) {
    // Always allow console in dev so development is not blocked
    if (isConsoleAllowed()) return ["console"];
    throw new OtpDeliveryError(
      "No OTP delivery channels are configured. Enable SMS, WhatsApp, or Email in Admin → Integrations.",
      "console"
    );
  }

  if (preferred && available.includes(preferred)) {
    // Move preferred to front, keep rest in platform priority order
    return [preferred, ...available.filter((c) => c !== preferred)];
  }

  // Default platform priority from config
  const ordered = OTP_CONFIG.CHANNEL_PRIORITY.filter((c) => available.includes(c));

  // Append any available channels not in the priority list (e.g. console)
  for (const ch of available) {
    if (!ordered.includes(ch)) ordered.push(ch);
  }

  return ordered;
}

// ─── Individual Channel Senders ────────────────────────────────────────────────

async function tryWhatsApp(
  phone: string,
  code: string,
  settings: Record<string, string>,
  userLanguage?: string
): Promise<{ success: boolean; provider?: string; messageId?: string }> {
  const result = await sendWhatsAppOTP(phone, code, settings, userLanguage);
  return { success: result.sent, provider: "whatsapp", messageId: result.messageId };
}

async function trySms(
  phone: string,
  code: string,
  settings: Record<string, string>,
  userLanguage?: string
): Promise<{ success: boolean; provider?: string }> {
  const result = await sendOtpSMS(phone, code, settings, userLanguage);
  return { success: result.sent, provider: result.provider };
}

async function tryEmail(
  email: string,
  code: string,
  settings: Record<string, string>,
  userLanguage?: string
): Promise<{ success: boolean; provider?: string }> {
  // Lazy import to avoid circular dependencies
  const { sendPasswordResetEmail } = await import("../../services/email.js");
  const result = await sendPasswordResetEmail(email, code, undefined, userLanguage, settings);
  return { success: result.sent, provider: "email" };
}

function tryConsole(identifier: string, code: string): { success: boolean; provider: string } {
  if (!isConsoleAllowed()) {
    return { success: false, provider: "console" };
  }
  // Mask identifier in log for safety even in dev
  const masked =
    identifier.length > 6 ? `${identifier.slice(0, 3)}***${identifier.slice(-2)}` : "***";
  logger.info(
    { identifier: masked, code },
    "[DEV-OTP] OTP code (dev mode only — never in production)"
  );
  return { success: true, provider: "console" };
}

// ─── Guards ────────────────────────────────────────────────────────────────────

function isConsoleAllowed(): boolean {
  return process.env["NODE_ENV"] !== "production" && process.env["ALLOW_DEV_OTP"] === "true";
}
