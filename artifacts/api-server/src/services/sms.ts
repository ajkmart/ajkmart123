import { logger } from "../lib/logger.js";
/**
 * SMS Service — supports Twilio, MSG91, and console (dev) modes.
 * Provider is selected via the `sms_provider` platform setting.
 *
 * Phone numbers are assumed to be Pakistani (03xxxxxxxxx format).
 * They are converted to E.164 (+92xxxxxxxxx) before sending.
 */

import type { Language } from "@workspace/i18n";
import { t } from "@workspace/i18n";

function toE164Pakistan(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  return `+92${digits}`;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function resolveLanguage(language?: string): Language {
  const valid: Language[] = ["en", "ur", "roman"];
  if (language && valid.includes(language as Language)) return language as Language;
  return "en";
}

export interface SMSResult {
  sent: boolean;
  provider: string;
  error?: string;
}

async function dispatchSMS(
  phone: string,
  message: string,
  settings: Record<string, string>
): Promise<SMSResult> {
  const integrationOn = settings["integration_sms"] === "on";
  const provider = settings["sms_provider"] ?? "console";

  if (!integrationOn || provider === "console") {
    logger.info(`[SMS:console] To: ${phone} | ${message}`);
    return { sent: true, provider: "console" };
  }

  const e164 = toE164Pakistan(phone);

  /* ── Twilio ── */
  if (provider === "twilio") {
    const accountSid = settings["sms_account_sid"]?.trim();
    const authToken = settings["sms_api_key"]?.trim();
    const from = settings["sms_sender_id"]?.trim();

    if (!accountSid || !authToken || !from) {
      logger.info(`[SMS:twilio] Credentials not configured — logging: ${message}`);
      return {
        sent: false,
        provider: "twilio",
        error:
          "Twilio credentials not configured. Set sms_account_sid, sms_api_key, sms_sender_id in Integrations.",
      };
    }

    try {
      const { default: twilio } = await import("twilio");
      const client = twilio(accountSid, authToken);
      await client.messages.create({ body: message, from, to: e164 });
      logger.info(`[SMS:twilio] Sent to ${e164}`);
      return { sent: true, provider: "twilio" };
    } catch (err: any) {
      logger.error(`[SMS:twilio] Error:`, err.message);
      return { sent: false, provider: "twilio", error: err.message };
    }
  }

  /* ── MSG91 ── */
  if (provider === "msg91") {
    const authKey = settings["sms_msg91_key"]?.trim();
    const senderId = (settings["sms_sender_id"] ?? "AJKMAT").trim();

    if (!authKey) {
      logger.info(`[SMS:msg91] Auth key not configured — logging: ${message}`);
      return {
        sent: false,
        provider: "msg91",
        error: "MSG91 auth key not configured. Set sms_msg91_key in Integrations.",
      };
    }

    try {
      const resp = await fetch(
        `https://api.msg91.com/api/sendhttp.php?country=92&sender=${senderId}&route=4&mobiles=${e164.replace("+", "")}&authkey=${authKey}&sms=${encodeURIComponent(message)}`
      );
      const body = await resp.text();
      if (body.includes("success") || resp.ok) {
        return { sent: true, provider: "msg91" };
      }
      return { sent: false, provider: "msg91", error: body };
    } catch (err: any) {
      logger.error(`[SMS:msg91] Error:`, err.message);
      return { sent: false, provider: "msg91", error: err.message };
    }
  }

  /* ── Zong / CM.com Pakistan ── */
  if (provider === "zong") {
    const apiKey = settings["sms_api_key"]?.trim();
    const senderId = (settings["sms_sender_id"] ?? "AJKMart").trim();

    if (!apiKey) {
      logger.info(`[SMS:zong] API key not configured — logging: ${message}`);
      return {
        sent: false,
        provider: "zong",
        error: "Zong API key not configured. Set sms_api_key in Integrations.",
      };
    }

    try {
      const resp = await fetch("https://api.cm.com/v1.0/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CM-PRODUCTTOKEN": apiKey,
        },
        body: JSON.stringify({
          messages: {
            authentication: { producttoken: apiKey },
            msg: [
              {
                from: senderId,
                to: [{ number: e164 }],
                body: { type: "AUTO", content: message },
              },
            ],
          },
        }),
      });

      if (resp.ok || resp.status === 202) {
        logger.info(`[SMS:zong] Sent to ${e164}`);
        return { sent: true, provider: "zong" };
      }
      const errText = await resp.text().catch((textErr: unknown) => {
        logger.warn(
          {
            error: textErr instanceof Error ? textErr.message : String(textErr),
            code: "SMS_BODY_PARSE_FAILED",
            timestamp: new Date().toISOString(),
            provider: "zong",
            status: resp.status,
          },
          "[SMS:zong] failed to read error response body"
        );
        return `HTTP ${resp.status}`;
      });
      return { sent: false, provider: "zong", error: errText };
    } catch (err: any) {
      logger.error(`[SMS:zong] Error:`, err.message);
      return { sent: false, provider: "zong", error: err.message };
    }
  }

  logger.info(`[SMS:unknown] Unknown provider "${provider}" — logging: ${message}`);
  return { sent: false, provider, error: `Unknown provider: ${provider}` };
}

/**
 * Returns true when SMS integration is ON and a real provider
 * (Twilio / MSG91 / Zong) has all required credentials filled in.
 */
export function isSMSProviderConfigured(settings: Record<string, string>): boolean {
  if (settings["integration_sms"] !== "on") return false;
  const provider = settings["sms_provider"] ?? "console";
  if (provider === "console") return false;
  if (provider === "twilio") {
    return !!(
      settings["sms_account_sid"]?.trim() &&
      settings["sms_api_key"]?.trim() &&
      settings["sms_sender_id"]?.trim()
    );
  }
  if (provider === "msg91") return !!settings["sms_msg91_key"]?.trim();
  if (provider === "zong") return !!settings["sms_api_key"]?.trim();
  return false;
}

/**
 * Returns true when SMS integration is ON and the provider is "console".
 * Console mode logs OTP to the server terminal — OTP is still required from
 * the user (dev/staging scenario), so this counts as an "active" channel.
 */
export function isSMSConsoleActive(settings: Record<string, string>): boolean {
  return (
    settings["integration_sms"] === "on" && (settings["sms_provider"] ?? "console") === "console"
  );
}

export async function sendOtpSMS(
  phone: string,
  otp: string,
  settings: Record<string, string>,
  userLanguage?: string
): Promise<SMSResult> {
  const lang = resolveLanguage(userLanguage);
  const i18nDefault = t("smsOtpText", lang).replace("{otp}", otp);
  const adminTemplate = settings["sms_template_otp"] ?? i18nDefault;
  const message = applyTemplate(adminTemplate, { otp });
  return dispatchSMS(phone, message, settings);
}

export async function sendOrderSMS(
  phone: string,
  orderId: string,
  status: string,
  settings: Record<string, string>,
  userLanguage?: string
): Promise<SMSResult> {
  const lang = resolveLanguage(userLanguage);
  const i18nDefault = t("smsOrderText", lang).replace("{id}", orderId).replace("{status}", status);
  const adminTemplate = settings["sms_template_order"] ?? i18nDefault;
  const message = applyTemplate(adminTemplate, { id: orderId, status });
  return dispatchSMS(phone, message, settings);
}

/* ── Registration approval / rejection SMS ── */

export async function sendApprovalSMS(
  phone: string,
  name: string | null | undefined,
  role: string,
  settings: Record<string, string>
): Promise<SMSResult> {
  const appName = settings["app_name"]?.trim() || "AJKMart";
  const roleName = role === "rider" ? "Rider" : role === "vendor" ? "Vendor" : "Account";
  const greeting = name ? `Hi ${name}` : "Hello";
  const message = `[${appName}] ${greeting}, your ${roleName} registration has been APPROVED! You can now log in to the app and get started.`;
  return dispatchSMS(phone, message, settings);
}

export async function sendRejectionSMS(
  phone: string,
  name: string | null | undefined,
  role: string,
  reason: string,
  settings: Record<string, string>
): Promise<SMSResult> {
  const appName = settings["app_name"]?.trim() || "AJKMart";
  const roleName = role === "rider" ? "Rider" : role === "vendor" ? "Vendor" : "Account";
  const greeting = name ? `Hi ${name}` : "Hello";
  const reasonPart = reason ? ` Reason: ${reason}.` : "";
  const message = `[${appName}] ${greeting}, your ${roleName} registration could not be approved at this time.${reasonPart} Contact support for help.`;
  return dispatchSMS(phone, message, settings);
}

/* ── Generic dispatch wrapper for NotificationService ── */
export async function sendSms(input: {
  to: string;
  message: string;
  templateId?: string;
}): Promise<{ messageId?: string } & SMSResult> {
  const { getCachedSettings } = await import("../middleware/security.js");
  const settings = await getCachedSettings();
  const result = await dispatchSMS(input.to, input.message, settings);
  return { ...result, messageId: input.templateId };
}

/**
 * WhatsApp fallback: send a short SMS to the recipient when a WhatsApp
 * message delivery has failed. Uses the platform's active SMS provider.
 * The message is intentionally generic — we do not re-send the original
 * WhatsApp payload since it may contain OTPs or deep links.
 */
export async function dispatchFallbackSms(
  phone: string,
  settings: Record<string, string>
): Promise<SMSResult> {
  const appName = settings["app_name"]?.trim() || "AJKMart";
  const message = `[${appName}] We tried to reach you on WhatsApp but delivery failed. Please check the app for your latest update.`;
  return dispatchSMS(phone, message, settings);
}
