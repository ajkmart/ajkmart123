import { logger } from "../lib/logger.js";
/**
 * WhatsApp Business API service — Meta Cloud API (Graph API v19+).
 * Uses approved message templates for OTP and order notifications.
 *
 * Prerequisites (configured in Admin › Integrations › WhatsApp):
 *   - wa_phone_number_id   : WhatsApp Phone Number ID from Meta Business Manager
 *   - wa_access_token      : Permanent System User Access Token (not temporary)
 *   - wa_otp_template      : Approved OTP template name (e.g. "otp_verification")
 *   - wa_order_template    : Approved order notification template name
 */

const GRAPH_VERSION = "v19.0";

/**
 * Maps our internal language codes to WhatsApp-supported BCP-47 codes.
 * WhatsApp templates are pre-approved per language; if the user's language
 * doesn't have an approved template variant, we fall back to "en".
 */
function toWhatsAppLangCode(lang?: string): string {
  switch (lang) {
    case "ur":
      return "ur";
    case "roman":
    case "en":
    default:
      return "en";
  }
}

function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return `92${digits}`;
}

export interface WAResult {
  sent: boolean;
  messageId?: string;
  error?: string;
  provider?: string;
}

async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: object[],
  phoneNumberId: string,
  accessToken: string
): Promise<WAResult> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: templateName, language: { code: languageCode }, components },
        }),
      }
    );

    const body = (await resp.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };

    if (!resp.ok) {
      return { sent: false, error: body?.error?.message ?? `HTTP ${resp.status}` };
    }

    return { sent: true, messageId: body?.messages?.[0]?.id };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

/**
 * Returns true only when WhatsApp integration is enabled AND both required
 * credentials (phone number ID + access token) are filled in.
 */
export function isWhatsAppProviderConfigured(settings: Record<string, string>): boolean {
  if (settings["integration_whatsapp"] !== "on") return false;
  return !!(settings["wa_phone_number_id"]?.trim() && settings["wa_access_token"]?.trim());
}

export async function sendWhatsAppOTP(
  phone: string,
  otp: string,
  settings: Record<string, string>,
  userLanguage?: string
): Promise<WAResult> {
  if (settings["integration_whatsapp"] !== "on") {
    return { sent: false, error: "WhatsApp integration not enabled" };
  }

  if ((settings["wa_send_otp"] ?? "on") !== "on") {
    return { sent: false, error: "WhatsApp OTP channel is disabled (wa_send_otp=off)" };
  }

  const phoneNumberId = settings["wa_phone_number_id"]?.trim();
  const accessToken = settings["wa_access_token"]?.trim();
  const templateName = settings["wa_otp_template"]?.trim() ?? "otp_verification";

  if (!phoneNumberId || !accessToken) {
    return {
      sent: false,
      error:
        "WhatsApp credentials not configured. Set wa_phone_number_id and wa_access_token in Integrations.",
    };
  }

  const to = toWhatsAppNumber(phone);
  const langCode = toWhatsAppLangCode(userLanguage);

  const result = await sendTemplate(
    to,
    templateName,
    langCode,
    [{ type: "body", parameters: [{ type: "text", text: otp }] }],
    phoneNumberId,
    accessToken
  );

  if (result.sent) {
    logger.info(`[WhatsApp] OTP sent to ${to}, lang: ${langCode}, messageId: ${result.messageId}`);
  } else {
    logger.error(`[WhatsApp] Failed to send OTP:`, result.error);
  }

  return result;
}

export async function sendWhatsAppRideNotification(
  phone: string,
  rideId: string,
  status: string,
  settings: Record<string, string>,
  recipientType: "customer" | "rider" = "customer",
  userLanguage?: string
): Promise<WAResult> {
  if (settings["integration_whatsapp"] !== "on") {
    return { sent: false, error: "WhatsApp integration not enabled" };
  }

  const toggleKey = recipientType === "rider" ? "wa_send_rider_notif" : "wa_send_ride_update";
  if ((settings[toggleKey] ?? "on") !== "on") {
    return {
      sent: false,
      error: `WhatsApp ${recipientType} ride channel is disabled (${toggleKey}=off)`,
    };
  }

  const phoneNumberId = settings["wa_phone_number_id"]?.trim();
  const accessToken = settings["wa_access_token"]?.trim();
  const templateName = settings["wa_order_template"]?.trim() ?? "order_notification";

  if (!phoneNumberId || !accessToken) {
    return { sent: false, error: "WhatsApp credentials not configured" };
  }

  const to = toWhatsAppNumber(phone);
  const langCode = toWhatsAppLangCode(userLanguage);

  return sendTemplate(
    to,
    templateName,
    langCode,
    [
      {
        type: "body",
        parameters: [
          { type: "text", text: rideId },
          { type: "text", text: status },
        ],
      },
    ],
    phoneNumberId,
    accessToken
  );
}

export async function sendWhatsAppVendorNotification(
  phone: string,
  orderId: string,
  customerName: string,
  settings: Record<string, string>,
  userLanguage?: string
): Promise<WAResult> {
  if (settings["integration_whatsapp"] !== "on") {
    return { sent: false, error: "WhatsApp integration not enabled" };
  }

  if ((settings["wa_send_vendor_notif"] ?? "on") !== "on") {
    return {
      sent: false,
      error: "WhatsApp vendor notification channel is disabled (wa_send_vendor_notif=off)",
    };
  }

  const phoneNumberId = settings["wa_phone_number_id"]?.trim();
  const accessToken = settings["wa_access_token"]?.trim();
  const templateName = settings["wa_order_template"]?.trim() ?? "order_notification";

  if (!phoneNumberId || !accessToken) {
    return { sent: false, error: "WhatsApp credentials not configured" };
  }

  const to = toWhatsAppNumber(phone);
  const langCode = toWhatsAppLangCode(userLanguage);

  return sendTemplate(
    to,
    templateName,
    langCode,
    [
      {
        type: "body",
        parameters: [
          { type: "text", text: orderId },
          { type: "text", text: customerName },
        ],
      },
    ],
    phoneNumberId,
    accessToken
  );
}

export async function sendWhatsAppOrderNotification(
  phone: string,
  orderId: string,
  status: string,
  settings: Record<string, string>,
  userLanguage?: string
): Promise<WAResult> {
  if (settings["integration_whatsapp"] !== "on") {
    return { sent: false, error: "WhatsApp integration not enabled" };
  }

  if ((settings["wa_send_order_update"] ?? "on") !== "on") {
    return {
      sent: false,
      error: "WhatsApp order update channel is disabled (wa_send_order_update=off)",
    };
  }

  const phoneNumberId = settings["wa_phone_number_id"]?.trim();
  const accessToken = settings["wa_access_token"]?.trim();
  const templateName = settings["wa_order_template"]?.trim() ?? "order_notification";

  if (!phoneNumberId || !accessToken) {
    return { sent: false, error: "WhatsApp credentials not configured" };
  }

  const to = toWhatsAppNumber(phone);
  const langCode = toWhatsAppLangCode(userLanguage);

  return sendTemplate(
    to,
    templateName,
    langCode,
    [
      {
        type: "body",
        parameters: [
          { type: "text", text: orderId },
          { type: "text", text: status },
        ],
      },
    ],
    phoneNumberId,
    accessToken
  );
}

/* ── Generic dispatch wrapper for NotificationService ── */
export async function sendWhatsappMessage(input: {
  to: string;
  message: string;
  templateId?: string;
}): Promise<{ messageId?: string } & WAResult> {
  logger.info(`[WhatsApp:generic] To: ${input.to} | ${input.message}`);
  return { sent: true, provider: "console", messageId: input.templateId };
}
