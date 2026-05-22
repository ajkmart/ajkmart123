import { db } from "@workspace/db";
import { sentryKnownIssuesTable } from "@workspace/db/schema";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../lib/logger.js";
import { sendError, sendSuccess, sendValidationError } from "../lib/response.js";
import { sendAdminAlert } from "../services/email.js";
import { getCachedSettings } from "./admin-shared.js";

/* ══════════════════════════════════════════════════════════════════
   POST /api/admin/sentry-webhook
   Public endpoint — verified via HMAC using SENTRY_WEBHOOK_SECRET.
   Sentry calls this URL whenever an issue is created or triggered.
   On first-seen fingerprint: inserts to sentry_known_issues table
   and fires an internal admin alert (email + Slack).
   On already-known fingerprint: silently acknowledges.


   Setup in Sentry:
     Project Settings → Integrations → Webhooks → Add Webhook
     URL: https://<your-domain>/api/admin/sentry-webhook
     Events: Issue (created)
     Secret: value of SENTRY_WEBHOOK_SECRET env var
   ══════════════════════════════════════════════════════════════════ */

const router = Router();

router.post("/admin/sentry-webhook", async (req, res) => {
  try {
    const secret = process.env["SENTRY_WEBHOOK_SECRET"];
    if (!secret) {
      logger.warn("[sentry-webhook] SENTRY_WEBHOOK_SECRET not configured — rejecting");
      sendError(res, "Sentry webhook not configured", 503);
      return;
    }

    const signature = req.headers["sentry-hook-signature"] as string | undefined;
    if (!signature) {
      sendError(res, "Missing sentry-hook-signature header", 400);
      return;
    }

    const rawBody = req.rawBody;
    const bodyStr = rawBody ? rawBody.toString("utf8") : JSON.stringify(req.body);

    let expected: string;
    try {
      expected = crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? (err as Error).message : String(err),
          code: "HMAC_COMPUTATION_FAILED",
          timestamp: new Date().toISOString(),
        },
        "[sentry-webhook] HMAC computation failed"
      );
      sendError(res, "HMAC computation failed", 500);
      return;
    }

    let sigBuf: Buffer;
    let expBuf: Buffer;
    try {
      sigBuf = Buffer.from(signature, "hex");
      expBuf = Buffer.from(expected, "hex");
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? (err as Error).message : String(err),
          code: "INVALID_SIGNATURE_FORMAT",
          timestamp: new Date().toISOString(),
        },
        "[sentry-webhook] Invalid signature format"
      );
      sendError(res, "Invalid signature format", 400);
      return;
    }

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn("[sentry-webhook] HMAC verification failed");
      sendError(res, "Invalid signature", 401);
      return;
    }

    const payload = req.body as Record<string, any>;

    const action = payload["action"] as string | undefined;
    if (action && action !== "created") {
      sendSuccess(res, { ack: true, action });
      return;
    }

    const issue = payload["data"]?.["issue"] as Record<string, any> | undefined;
    const title = (issue?.["title"] as string | undefined) ?? payload["culprit"] ?? "Unknown error";
    const sentryId =
      (issue?.["id"] as string | undefined) ?? (payload["id"] as string | undefined) ?? null;

    const rawFingerprint = issue?.["fingerprints"] ?? issue?.["fingerprint"];
    const fingerprint = Array.isArray(rawFingerprint)
      ? (rawFingerprint as string[]).join("|")
      : typeof rawFingerprint === "string"
        ? rawFingerprint
        : (sentryId ?? crypto.createHash("sha256").update(title).digest("hex").slice(0, 32));

    if (!fingerprint) {
      sendValidationError(res, "Cannot determine issue fingerprint");
      return;
    }

    try {
      const [existing] = await db
        .select({ fingerprint: sentryKnownIssuesTable.fingerprint })
        .from(sentryKnownIssuesTable)
        .where(eq(sentryKnownIssuesTable.fingerprint, fingerprint))
        .limit(1)
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? (err as Error).message : String(err), fingerprint },
            "[sentry-webhook] known-issues lookup failed"
          );
          return [] as { fingerprint: string }[];
        });

      if (existing) {
        await db
          .update(sentryKnownIssuesTable)
          .set({ lastSeenAt: new Date() })
          .where(eq(sentryKnownIssuesTable.fingerprint, fingerprint))
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? (err as Error).message : String(err), fingerprint },
              "[sentry-webhook] lastSeenAt update (known issue) failed"
            );
          });
        sendSuccess(res, { ack: true, known: true });
        return;
      }

      // Use onConflictDoNothing to guard against rare concurrent first-seen races.
      // If another request already inserted this fingerprint, we treat it as known.
      const inserted = await db
        .insert(sentryKnownIssuesTable)
        .values({
          fingerprint,
          title: title.slice(0, 500),
          sentryId,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ fingerprint: sentryKnownIssuesTable.fingerprint });

      if (!inserted.length) {
        await db
          .update(sentryKnownIssuesTable)
          .set({ lastSeenAt: new Date() })
          .where(eq(sentryKnownIssuesTable.fingerprint, fingerprint))
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? (err as Error).message : String(err), fingerprint },
              "[sentry-webhook] lastSeenAt update (conflict race) failed"
            );
          });
        sendSuccess(res, { ack: true, known: true });
        return;
      }

      const settings = await getCachedSettings();
      const appName = settings["app_name"] ?? "AJKMart";
      const sentryLink = sentryId ? `https://sentry.io/issues/${sentryId}/` : "";

      const subject = `New Sentry Error Type — ${title.slice(0, 80)}`;
      const htmlBody = `
      <h3 style="color:#dc2626;margin:0 0 12px;">🐛 New Sentry Error Type Detected</h3>
      <p style="color:#374151;margin:0 0 16px;">
        A previously unseen error fingerprint was received by ${appName}.
        This is the first time this error type has appeared in production.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Title</td>
            <td style="padding:6px 0;font-weight:bold;">${title}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Fingerprint</td>
            <td style="padding:6px 0;font-family:monospace;font-size:12px;">${fingerprint}</td></tr>
        ${
          sentryId
            ? `<tr><td style="padding:6px 0;color:#6b7280;">Sentry ID</td>
            <td style="padding:6px 0;font-family:monospace;">${sentryId}</td></tr>`
            : ""
        }
        <tr><td style="padding:6px 0;color:#6b7280;">First seen</td>
            <td style="padding:6px 0;">${new Date().toUTCString()}</td></tr>
      </table>
      ${
        sentryLink
          ? `<p><a href="${sentryLink}" style="background:#6741d9;color:#fff;padding:10px 18px;
         border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">
        Open in Sentry →</a></p>`
          : ""
      }
    `;

      sendAdminAlert("sentry_new_issue", subject, htmlBody, settings).catch((e: Error) =>
        logger.warn({ err: e.message }, "[sentry-webhook] Alert send failed")
      );

      const slackWebhook = settings["health_alert_slack_webhook"]?.trim();
      if (slackWebhook) {
        fetch(slackWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `🐛 ${appName} — New Sentry error type: *${title}*${sentryLink ? ` <${sentryLink}|Open in Sentry>` : ""}`,
          }),
        }).catch((e: Error) => logger.warn({ err: e.message }, "[sentry-webhook] Slack failed"));
      }

      logger.info({ fingerprint, title, sentryId }, "[sentry-webhook] New issue type detected");
      sendSuccess(res, { ack: true, known: false, fingerprint });
    } catch (err: unknown) {
      logger.error({ err: (err as Error).message }, "[sentry-webhook] DB operation failed");
      sendError(res, "Internal error", 500);
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? (err as Error).message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
