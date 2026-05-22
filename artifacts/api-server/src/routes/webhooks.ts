import { buildPgPoolConfig } from "@workspace/db/connection-url";
import { createHmac, timingSafeEqual } from "crypto";
import type express from "express";
import { Router } from "express";
import { Pool } from "pg";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { adminAuth } from "./admin-shared.js";
import { getCachedSettings } from "./admin.js";

const router = Router();

/* ─── WhatsApp Business API Webhook ─────────────────────────────────────────
 *
 * Two endpoints:
 *   GET  /webhooks/whatsapp  — Meta verification handshake
 *   POST /webhooks/whatsapp  — Incoming message events & delivery statuses
 *
 * Setup in Meta Developer Console:
 *   Webhook URL:   https://<your-domain>/api/webhooks/whatsapp
 *   Verify Token:  value stored in platform setting "wa_verify_token"
 *   App Secret:    set WHATSAPP_APP_SECRET env var (used for HMAC verification)
 *   Subscriptions: messages, message_deliveries, message_reads
 */

/* ── Shared DB pool for all webhook/fallback operations ─────────────────────
 * Created lazily on first use so the module loads even when DATABASE_URL
 * is absent (e.g. test environments). The pool is kept alive for the process
 * lifetime — pg pools are designed for long-lived reuse. */
let _pool: Pool | null = null;

function getPool(): Pool | null {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) return null;
  if (!_pool) {
    _pool = new Pool({ ...buildPgPoolConfig(databaseUrl), max: 5 });
    _pool.on("error", (err) => {
      logger.error("[webhooks pool] Unexpected error:", (err as Error).message);
    });
  }
  return _pool;
}

/* ─── Admin endpoint: WhatsApp delivery log ──────────────────────────────── */

router.get("/whatsapp/delivery-log", adminAuth, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      sendError(res, "Database not configured", 503);
      return;
    }

    try {
      const limit = Math.min(parseInt((req.query["limit"] as string) || "100", 10), 500);
      const offset = parseInt((req.query["offset"] as string) || "0", 10);
      const status = req.query["status"] as string | undefined;
      const phone = req.query["phone"] as string | undefined;

      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      if (phone) {
        params.push(`%${phone}%`);
        conditions.push(`phone ILIKE $${params.length}`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      params.push(limit);
      params.push(offset);
      const { rows } = await pool.query(
        `SELECT
         id,
         phone          AS recipient_phone,
         message,
         status,
         provider_message_id AS wa_message_id,
         error_message,
         NULL::text     AS error_code,
         NULL::boolean  AS fallback_sent,
         NULL::text     AS fallback_channel,
         NULL::text     AS context_type,
         NULL::text     AS context_id,
         created_at     AS sent_at,
         updated_at
       FROM whatsapp_delivery_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const countParams = params.slice(0, params.length - 2);
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) FROM whatsapp_delivery_logs ${where}`,
        countParams
      );

      sendSuccess(res, { logs: rows, total: parseInt(countRows[0]!.count, 10), limit, offset });
    } catch (err: unknown) {
      logger.error("[WhatsApp delivery log] Query error:", (err as Error).message);
      sendError(res, "Failed to fetch delivery log", 500);
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

/* ─── GET: Meta verification handshake ──────────────────────────────────── */

router.get("/whatsapp", async (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode !== "subscribe") {
      sendError(res, "Invalid hub.mode", 403);
      return;
    }

    const settings = await getCachedSettings();
    const verifyToken = settings["wa_verify_token"]?.trim();

    if (!verifyToken) {
      logger.warn("[WhatsApp webhook] wa_verify_token not set in platform settings");
      sendError(
        res,
        "Webhook verify token not configured. Set wa_verify_token in Integrations → WhatsApp.",
        403
      );
      return;
    }

    if (token !== verifyToken) {
      sendError(res, "Token mismatch", 403);
      return;
    }

    res.status(200).send(challenge);
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

/* ─── POST: Delivery status & inbound message events ────────────────────── */

router.post("/whatsapp", async (req, res) => {
  try {
    /* ── HMAC-SHA256 Signature Verification ──────────────────────────────────
     * Meta signs every POST with X-Hub-Signature-256: sha256=<hex>
     * computed over the raw request bytes using the app secret.
     * We reject any request whose signature is absent or invalid so that
     * arbitrary actors cannot inject fake events. */
    const appSecret = process.env["WHATSAPP_APP_SECRET"]?.trim();

    if (!appSecret) {
      logger.error(
        "[WhatsApp webhook] WHATSAPP_APP_SECRET not set — rejecting all unsigned requests"
      );
      res
        .status(401)
        .json({ success: false, error: "Webhook signature verification not configured" });
      return;
    }

    const sigHeader = (req.headers["x-hub-signature-256"] as string | undefined) ?? "";
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;

    if (!sigHeader || !rawBody) {
      logger.warn("[WhatsApp webhook] Missing signature or raw body — rejecting");
      res.status(401).json({ success: false, error: "Missing webhook signature" });
      return;
    }

    const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

    let valid = false;
    try {
      const a = Buffer.from(sigHeader);
      const b = Buffer.from(expected);
      valid = a.length === b.length && timingSafeEqual(a, b);
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      valid = false;
    }

    if (!valid) {
      logger.warn("[WhatsApp webhook] Signature mismatch — rejecting request");
      res.status(401).json({ success: false, error: "Invalid webhook signature" });
      return;
    }

    interface WhatsAppWebhookBody {
      object?: string;
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{ from?: string; type?: string }>;
            statuses?: Array<Record<string, unknown>>;
          };
        }>;
      }>;
    }
    const body = req.body as WhatsAppWebhookBody;

    if (body?.object !== "whatsapp_business_account") {
      res.status(400).send("Not a WhatsApp event");
      return;
    }

    /* Respond to Meta immediately (they expect <20s) then process async. */
    res.status(200).json({ success: true });

    const entries = body?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;

        const messages: unknown[] =
          ((value as Record<string, unknown>)?.messages as unknown[]) ?? [];
        const statuses: unknown[] =
          ((value as Record<string, unknown>)?.statuses as unknown[]) ?? [];

        for (const msg of messages) {
          const msgR = msg as Record<string, unknown>;
          const from = msgR?.from;
          const type = msgR?.type;
          logger.info(`[WhatsApp webhook] Incoming message from ${from} — type: ${type}`);
        }

        for (const status of statuses) {
          await processDeliveryStatus(status as Record<string, unknown>, value).catch(
            (err: unknown) =>
              logger.error(
                "[WhatsApp webhook] Status processing error:",
                (err as Error | null)?.message
              )
          );
        }
      }
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

/* ─── Delivery status processor ─────────────────────────────────────────── */

async function processDeliveryStatus(
  status: Record<string, unknown>,
  value: Record<string, unknown>
): Promise<void> {
  const waMessageId = status?.id as string | undefined;
  const statusVal = (status?.status as string | undefined) ?? "unknown";
  const recipient = (status?.recipient_id as string | undefined) ?? "";
  const errorObj = status?.errors?.[0];
  const errorCode = errorObj?.code ? String(errorObj.code) : null;
  const errorMsg = (errorObj?.message as string | null) ?? null;

  logger.info(`[WhatsApp webhook] Message ${waMessageId} to ${recipient} — status: ${statusVal}`);

  const pool = getPool();
  if (!pool || !waMessageId) return;

  /* Upsert the log row — create if first event, update on subsequent. */
  const rowId = `wml_${generateId()}`;
  await pool.query(
    `INSERT INTO whatsapp_delivery_logs
       (id, provider_message_id, phone, status, error_code, error_message, message, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (provider_message_id) DO UPDATE SET
       status        = EXCLUDED.status,
       error_code    = COALESCE(EXCLUDED.error_code, whatsapp_delivery_logs.error_code),
       error_message = COALESCE(EXCLUDED.error_message, whatsapp_delivery_logs.error_message),
       message       = EXCLUDED.message,
       updated_at    = NOW()`,
    [
      rowId,
      waMessageId,
      recipient,
      statusVal,
      errorCode,
      errorMsg,
      JSON.stringify({ status, value }),
    ]
  );

  /* For failed deliveries, trigger fallback if configured. */
  if (statusVal === "failed") {
    await triggerFallback(recipient, waMessageId, pool);
  }
}

/* ─── Fallback dispatcher for failed WhatsApp messages ──────────────────── */

async function triggerFallback(phone: string, waMessageId: string, pool: Pool): Promise<void> {
  /* Check if a fallback has already been attempted for this message. */
  const { rows } = await pool.query(
    `SELECT fallback_sent FROM whatsapp_delivery_logs WHERE provider_message_id = $1`,
    [waMessageId]
  );
  const row = rows[0];
  if (!row || row.fallback_sent) return;

  /* Load platform settings to determine which fallback channel is active. */
  let settings: Record<string, string>;
  try {
    settings = await getCachedSettings();
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "[WhatsApp fallback] Could not load platform settings"
    );
    return;
  }

  const smsFallback = (settings["wa_fallback_sms"] ?? "off") === "on";
  const pushFallback = (settings["wa_fallback_push"] ?? "off") === "on";

  if (!smsFallback && !pushFallback) {
    logger.info(`[WhatsApp fallback] No fallback configured for failed message ${waMessageId}`);
    return;
  }

  let channel: string | null = null;

  /* ── SMS fallback ── */
  if (smsFallback && (settings["integration_sms"] ?? "off") === "on") {
    try {
      const { dispatchFallbackSms } = await import("../services/sms.js");
      const result = await dispatchFallbackSms(phone, settings);
      if (result.sent) {
        channel = "sms";
        logger.info(`[WhatsApp fallback] SMS dispatched to ${phone} for message ${waMessageId}`);
      } else {
        logger.warn(`[WhatsApp fallback] SMS dispatch failed: ${result.error ?? "unknown"}`);
      }
    } catch (err: unknown) {
      logger.error(`[WhatsApp fallback] SMS dispatch threw:`, (err as Error | null)?.message);
    }
  }

  /* ── Push fallback (VAPID / FCM) — look up user by phone ── */
  if (!channel && pushFallback) {
    try {
      const { sendPushToUser } = await import("../lib/webpush.js");
      const appName = settings["app_name"]?.trim() || "AJKMart";

      /* Try both E.164 (92…) and local (0…) phone formats. */
      const phoneVariants = [phone, phone.replace(/^92/, "0")];
      let userId: string | null = null;
      for (const variant of phoneVariants) {
        const { rows: userRows } = await pool.query(
          `SELECT id FROM users WHERE phone = $1 LIMIT 1`,
          [variant]
        );
        if (userRows[0]) {
          userId = userRows[0].id;
          break;
        }
      }

      if (userId) {
        await sendPushToUser(userId, {
          title: `${appName} — Message not delivered`,
          body: "We couldn't reach you on WhatsApp. Please open the app for your latest update.",
          icon: "/icons/icon-192x192.png",
          tag: `wa-fallback-${waMessageId}`,
          data: { waMessageId },
        });
        channel = "push";
        logger.info(
          `[WhatsApp fallback] Push dispatched to user ${userId} (${phone}) for message ${waMessageId}`
        );
      } else {
        logger.warn(`[WhatsApp fallback] No user found for phone ${phone} — push skipped`);
      }
    } catch (err: unknown) {
      logger.error(`[WhatsApp fallback] Push dispatch threw:`, (err as Error | null)?.message);
    }
  }

  /* Only persist fallback_sent=true when a channel actually dispatched. */
  if (channel) {
    await pool.query(
      `UPDATE whatsapp_delivery_logs
       SET fallback_sent = TRUE, fallback_channel = $1, updated_at = NOW()
       WHERE provider_message_id = $2`,
      [channel, waMessageId]
    );
  }
}

export default router;
