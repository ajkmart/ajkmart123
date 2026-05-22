/**
 * Dynamic SMS Gateway Service
 *
 * Reads active gateways from the sms_gateways table ordered by priority (ASC).
 * On send, tries each provider in order; if one fails it automatically falls
 * through to the next. Falls back to console logging if all fail.
 *
 * This wraps (and does NOT replace) the existing sms.ts service.  If no DB
 * gateways are active it delegates to the existing sendOtpSMS() function so
 * legacy platform_settings-based SMS config continues to work.
 */

import { db } from "@workspace/db";
import { smsGatewaysTable, whitelistUsersTable } from "@workspace/db/schema";
import type { Language } from "@workspace/i18n";
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { sendOtpSMS, type SMSResult } from "./sms.js";

/* ── Whitelist check ─────────────────────────────────────────────────────── */

/**
 * Returns the bypass code if the identifier (phone or email) is on the
 * active whitelist and not expired, otherwise returns null.
 */
export async function getWhitelistBypass(identifier: string): Promise<string | null> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(whitelistUsersTable)
      .where(
        and(
          eq(whitelistUsersTable.identifier, identifier.toLowerCase().trim()),
          eq(whitelistUsersTable.isActive, true),
          or(isNull(whitelistUsersTable.expiresAt), gt(whitelistUsersTable.expiresAt, now))
        )
      )
      .limit(1);
    return rows[0]?.bypassCode ?? null;
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return null;
  }
}

/**
 * Returns true if the given code matches the whitelist bypass code for this identifier.
 */
export async function isWhitelistCode(identifier: string, code: string): Promise<boolean> {
  const bypass = await getWhitelistBypass(identifier);
  return bypass != null && bypass === code;
}

/* ── Gateway-based OTP send ──────────────────────────────────────────────── */

async function tryTwilio(phone: string, message: string, gw: any): Promise<SMSResult> {
  const { accountSid, authToken, fromNumber } = gw;
  if (!accountSid || !authToken || !fromNumber) {
    return { sent: false, provider: "twilio", error: "Twilio credentials incomplete" };
  }
  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(accountSid, authToken);
    await client.messages.create({ body: message, from: fromNumber, to: toE164(phone) });
    return { sent: true, provider: "twilio" };
  } catch (err: any) {
    return { sent: false, provider: "twilio", error: err.message };
  }
}

async function tryMsg91(phone: string, message: string, gw: any): Promise<SMSResult> {
  const { msg91Key, senderId } = gw;
  if (!msg91Key) return { sent: false, provider: "msg91", error: "MSG91 key missing" };
  try {
    const e164 = toE164(phone).replace("+", "");
    const sid = senderId ?? "AJKMAT";
    const resp = await fetch(
      `https://api.msg91.com/api/sendhttp.php?country=92&sender=${sid}&route=4&mobiles=${e164}&authkey=${msg91Key}&sms=${encodeURIComponent(message)}`
    );
    const body = await resp.text();
    if (body.includes("success") || resp.ok) return { sent: true, provider: "msg91" };
    return { sent: false, provider: "msg91", error: body };
  } catch (err: any) {
    return { sent: false, provider: "msg91", error: err.message };
  }
}

async function tryZong(phone: string, message: string, gw: any): Promise<SMSResult> {
  const { apiKey, senderId, apiUrl } = gw;
  if (!apiKey) return { sent: false, provider: "zong", error: "API key missing" };
  try {
    const url = apiUrl ?? "https://api.cm.com/v1.0/message";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CM-PRODUCTTOKEN": apiKey },
      body: JSON.stringify({
        messages: {
          authentication: { producttoken: apiKey },
          msg: [
            {
              from: senderId ?? "AJKMart",
              to: [{ number: toE164(phone) }],
              body: { type: "AUTO", content: message },
            },
          ],
        },
      }),
    });
    return resp.ok
      ? { sent: true, provider: "zong" }
      : { sent: false, provider: "zong", error: await resp.text() };
  } catch (err: any) {
    return { sent: false, provider: "zong", error: err.message };
  }
}

function consoleResult(phone: string, message: string): SMSResult {
  logger.info(`[SMS:console] To: ${phone} | ${message}`);
  return { sent: true, provider: "console" };
}

function toE164(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("92")) return `+${d}`;
  if (d.startsWith("0")) return `+92${d.slice(1)}`;
  return `+92${d}`;
}

/**
 * Main entry point — send OTP with dynamic gateway failover.
 *
 * 1. Check whitelist — if the phone is whitelisted, skip real SMS and return success.
 * 2. Fetch active gateways from DB ordered by priority.
 * 3. Try each gateway; fall through to the next on failure.
 * 4. If no DB gateways configured / all fail, delegate to legacy sendOtpSMS().
 */
export async function sendOtpWithFailover(
  phone: string,
  otp: string,
  settings: Record<string, string>,
  lang?: Language
): Promise<SMSResult> {
  /* Whitelist bypass — no SMS sent */
  const bypass = await getWhitelistBypass(phone);
  if (bypass != null) {
    logger.info({ phone }, "[SMS:whitelist] Phone is whitelisted — skipping real SMS");
    return { sent: true, provider: "whitelist" };
  }

  /* Check if failover is enabled */
  const failoverEnabled = settings["sms_failover_enabled"] !== "off";

  if (!failoverEnabled) {
    return sendOtpSMS(phone, otp, settings, lang);
  }

  /* Fetch active gateways ordered by priority */
  let gateways: any[] = [];
  try {
    gateways = await db
      .select()
      .from(smsGatewaysTable)
      .where(eq(smsGatewaysTable.isActive, true))
      .orderBy(asc(smsGatewaysTable.priority));
  } catch (err) {
    logger.warn({ err }, "[SMS:failover] DB gateway lookup failed, using legacy sms.js");
    return sendOtpSMS(phone, otp, settings, lang);
  }

  if (gateways.length === 0) {
    return sendOtpSMS(phone, otp, settings, lang);
  }

  const message = `Your AJKMart OTP is: ${otp}. Valid for 5 minutes.`;
  const errors: string[] = [];

  for (const gw of gateways) {
    let result: SMSResult;

    switch (gw.provider) {
      case "twilio":
        result = await tryTwilio(phone, message, gw);
        break;
      case "msg91":
        result = await tryMsg91(phone, message, gw);
        break;
      case "zong":
        result = await tryZong(phone, message, gw);
        break;
      case "console":
        result = consoleResult(phone, message);
        break;
      default:
        result = { sent: false, provider: gw.provider, error: "Unknown provider" };
    }

    if (result.sent) {
      if (errors.length > 0) {
        logger.warn({ errors, provider: gw.provider }, "[SMS:failover] Fell through to provider");
      }
      return result;
    }

    errors.push(`${gw.provider}: ${result.error ?? "unknown error"}`);
    logger.warn(
      { provider: gw.provider, error: result.error },
      "[SMS:failover] Provider failed, trying next"
    );
  }

  /* All gateways failed — log and return failure */
  logger.error({ phone, errors }, "[SMS:failover] All gateways failed");
  return { sent: false, provider: "all_failed", error: errors.join(" | ") };
}
