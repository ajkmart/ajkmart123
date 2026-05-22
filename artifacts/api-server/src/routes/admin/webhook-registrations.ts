import { db } from "@workspace/db";
import { webhookLogsTable, webhookRegistrationsTable } from "@workspace/db/schema";
import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import type { NextFunction } from "express";
import { Router } from "express";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { isValidWebhookUrl } from "../../lib/webhook-url-validator.js";
import {
  addAuditEntry,
  generateId,
  getClientIp,
  logger,
  type AdminRequest,
} from "../admin-shared.js";

const SUPPORTED_EVENTS = [
  "order_placed",
  "order_delivered",
  "ride_completed",
  "user_registered",
  "payment_received",
];

const router = Router();

router.get("/webhooks", async (_req, res, next: NextFunction) => {
  try {
    const webhooks = await db
      .select()
      .from(webhookRegistrationsTable)
      .orderBy(desc(webhookRegistrationsTable.createdAt));
    const sanitized = webhooks.map(({ secret, ...rest }) => rest);
    sendSuccess(res, { webhooks: sanitized });
  } catch (err) {
    next(err);
  }
});

router.post("/webhooks", async (req, res, next: NextFunction) => {
  try {
    const { url, events, description } = req.body;
    if (!url) {
      sendValidationError(res, "URL is required");
      return;
    }
    if (!(await isValidWebhookUrl(url))) {
      sendValidationError(res, "URL must be HTTPS and must not point to private/internal networks");
      return;
    }
    if (!events || !Array.isArray(events) || events.length === 0) {
      sendValidationError(res, "At least one event is required");
      return;
    }

    const invalidEvents = events.filter((e: string) => !SUPPORTED_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      sendValidationError(
        res,
        `Invalid events: ${invalidEvents.join(", ")}. Supported: ${SUPPORTED_EVENTS.join(", ")}`
      );
      return;
    }

    const id = generateId();
    const secret = crypto.randomBytes(32).toString("hex");

    const [created] = await db
      .insert(webhookRegistrationsTable)
      .values({
        id,
        url,
        events,
        secret,
        description: description || "",
        isActive: true,
      })
      .returning();

    void addAuditEntry({
      action: "webhook_create",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Created webhook: ${url}`,
      result: "success",
    });
    sendSuccess(res, { webhook: created });
  } catch (err) {
    next(err);
  }
});

router.patch("/webhooks/:id/toggle", async (req, res, next: NextFunction) => {
  try {
    const id = req.params["id"] as string;
    const [existing] = await db
      .select()
      .from(webhookRegistrationsTable)
      .where(eq(webhookRegistrationsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Webhook not found");
      return;
    }

    const newState = !existing.isActive;
    await db
      .update(webhookRegistrationsTable)
      .set({ isActive: newState, updatedAt: new Date() })
      .where(eq(webhookRegistrationsTable.id, id));
    void addAuditEntry({
      action: "webhook_toggle",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `${newState ? "Enabled" : "Disabled"} webhook: ${existing.url}`,
      result: "success",
    });
    sendSuccess(res, { success: true, isActive: newState });
  } catch (err) {
    next(err);
  }
});

router.post("/webhooks/:id/test", async (req, res, next) => {
  let webhook: typeof webhookRegistrationsTable.$inferSelect | undefined;
  try {
    const id = req.params["id"] as string;
    const [found] = await db
      .select()
      .from(webhookRegistrationsTable)
      .where(eq(webhookRegistrationsTable.id, id))
      .limit(1);
    webhook = found;
  } catch (err) {
    next(err);
    return;
  }
  if (!webhook) {
    sendNotFound(res, "Webhook not found");
    return;
  }
  const id = webhook.id;

  // Re-validate the stored URL at send time to prevent DNS rebinding attacks
  // and to block any URLs that were registered before stricter validation was in place.
  if (!(await isValidWebhookUrl(webhook.url))) {
    logger.warn(
      { webhookId: id, url: webhook.url },
      "[webhook-registrations] test-ping blocked — stored URL failed send-time SSRF validation"
    );
    sendValidationError(
      res,
      "Webhook URL no longer passes destination validation and cannot be used"
    );
    return;
  }

  const testPayload = {
    event: "test_ping",
    timestamp: new Date().toISOString(),
    data: { message: "This is a test ping from AJKMart" },
  };

  const logId = generateId();
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": webhook.secret || "",
        "X-Webhook-Event": "test_ping",
      },
      body: JSON.stringify(testPayload),
      signal: controller.signal,
      redirect: "manual",
    });
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      clearTimeout(timeout);
      logger.warn(
        { webhookId: id, url: webhook.url, status: response.status },
        "[webhook-registrations] test-ping blocked — webhook URL returned a redirect (SSRF guard)"
      );
      await db.insert(webhookLogsTable).values({
        id: logId,
        webhookId: id,
        event: "test_ping",
        url: webhook.url,
        status: 0,
        requestBody: testPayload,
        success: false,
        error: "Redirects are not permitted for webhook destinations",
        durationMs: Date.now() - startTime,
      });
      sendSuccess(res, {
        success: false,
        error: "Redirects are not permitted for webhook destinations",
        durationMs: Date.now() - startTime,
      });
      return;
    }
    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;
    const responseText = await response.text().catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), webhookId: id },
        "[webhook-registrations] test-ping response.text() read failed — using empty body"
      );
      return "";
    });

    await db.insert(webhookLogsTable).values({
      id: logId,
      webhookId: id,
      event: "test_ping",
      url: webhook.url,
      status: response.status,
      requestBody: testPayload,
      responseBody: responseText.slice(0, 2000),
      success: response.ok,
      durationMs,
    });

    sendSuccess(res, { success: response.ok, status: response.status, durationMs });
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    await db.insert(webhookLogsTable).values({
      id: logId,
      webhookId: id,
      event: "test_ping",
      url: webhook.url,
      status: 0,
      requestBody: testPayload,
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs,
    });
    sendSuccess(res, {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs,
    });
  }
});

router.delete("/webhooks/:id", async (req, res, next: NextFunction) => {
  try {
    const id = req.params["id"] as string;
    const [existing] = await db
      .select()
      .from(webhookRegistrationsTable)
      .where(eq(webhookRegistrationsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Webhook not found");
      return;
    }

    await db.delete(webhookLogsTable).where(eq(webhookLogsTable.webhookId, id));
    await db.delete(webhookRegistrationsTable).where(eq(webhookRegistrationsTable.id, id));
    void addAuditEntry({
      action: "webhook_delete",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Deleted webhook: ${existing.url}`,
      result: "success",
    });
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/webhooks/:id/logs", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const logs = await db
      .select()
      .from(webhookLogsTable)
      .where(eq(webhookLogsTable.webhookId, id))
      .orderBy(desc(webhookLogsTable.createdAt))
      .limit(50);
    sendSuccess(res, { logs });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Failed to load webhook logs", 500);
  }
});

export default router;
