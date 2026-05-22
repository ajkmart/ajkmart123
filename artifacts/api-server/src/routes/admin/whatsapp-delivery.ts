import { db } from "@workspace/db";
import { whatsappDeliveryLogsTable } from "@workspace/db/schema";
import { and, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { addAuditEntry, getClientIp, type AdminRequest } from "../admin-shared.js";

const router = Router();

router.get("/delivery-log", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "20", 10), 1), 200);
    const offset = Math.max(parseInt((req.query.offset as string) || "0", 10), 0);
    const status = (req.query.status as string | undefined)?.trim();
    const phone = (req.query.phone as string | undefined)?.trim();
    const startDate = (req.query.startDate as string | undefined)?.trim();
    const endDate = (req.query.endDate as string | undefined)?.trim();

    const conditions: SQL[] = []; // drizzle dynamic query
    if (status) conditions.push(eq(whatsappDeliveryLogsTable.status, status));
    if (phone) conditions.push(ilike(whatsappDeliveryLogsTable.phone, `%${phone}%`));
    if (startDate) {
      const parsed = new Date(startDate);
      if (Number.isNaN(parsed.getTime())) {
        sendValidationError(res, "startDate must be a valid date string");
        return;
      }
      conditions.push(gte(whatsappDeliveryLogsTable.createdAt, parsed));
    }
    if (endDate) {
      const parsed = new Date(endDate);
      if (Number.isNaN(parsed.getTime())) {
        sendValidationError(res, "endDate must be a valid date string");
        return;
      }
      conditions.push(lte(whatsappDeliveryLogsTable.createdAt, parsed));
    }

    try {
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(whatsappDeliveryLogsTable)
        .where(where)
        .limit(1);

      const logs = await db
        .select()
        .from(whatsappDeliveryLogsTable)
        .where(where)
        .orderBy(desc(whatsappDeliveryLogsTable.createdAt))
        .limit(limit)
        .offset(offset);

      sendSuccess(res, {
        logs,
        total: countRow?.total ?? 0,
        limit,
        offset,
      });
    } catch (err: unknown) {
      sendError(res, "Failed to fetch WhatsApp delivery log", 500, (err as Error | null)?.message);
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

router.post("/delivery-log/retry", async (req, res) => {
  try {
    const id = (req.body?.id as string | undefined)?.trim();
    if (!id) {
      sendValidationError(res, "Delivery log id is required");
      return;
    }

    const [existing] = await db
      .select()
      .from(whatsappDeliveryLogsTable)
      .where(eq(whatsappDeliveryLogsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Delivery log entry not found");
      return;
    }

    if (existing.status !== "failed") {
      sendValidationError(res, "Only failed delivery attempts can be retried");
      return;
    }

    await db
      .update(whatsappDeliveryLogsTable)
      .set({
        status: "pending",
        retries: sql<number>`(${whatsappDeliveryLogsTable.retries} + 1)`,
        updatedAt: new Date(),
      })
      .where(eq(whatsappDeliveryLogsTable.id, id));

    void addAuditEntry({
      action: "whatsapp_delivery_retry",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Requeued WhatsApp delivery log ${id}`,
      result: "success",
    });

    sendSuccess(res, { success: true });
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

router.get("/delivery-log/stats", async (req, res) => {
  try {
    const rows = await db
      .select({ status: whatsappDeliveryLogsTable.status, count: sql<number>`count(*)::int` })
      .from(whatsappDeliveryLogsTable)
      .groupBy(whatsappDeliveryLogsTable.status);

    const stats = rows.reduce(
      (acc, row) => {
        acc[row.status] = row.count;
        return acc;
      },
      {
        sent: 0,
        delivered: 0,
        failed: 0,
        pending: 0,
      } as Record<string, number>
    );

    sendSuccess(res, { stats });
  } catch (err: unknown) {
    sendError(res, "Failed to fetch WhatsApp delivery stats", 500, (err as Error | null)?.message);
  }
});

export default router;
