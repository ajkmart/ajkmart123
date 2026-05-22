import { buildPgPoolConfig } from "@workspace/db/connection-url";
import { Router } from "express";
import { Pool } from "pg";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { sendError, sendSuccess, sendValidationError } from "../lib/response.js";

const deliveryLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  status: z.enum(["pending", "sent", "failed", "delivered"]).optional(),
  phone: z.string().max(30).optional(),
});

const retryBodySchema = z.object({
  messageId: z.string().min(1, "messageId is required"),
});

const router = Router();

let _pool: Pool | null = null;

function getPool(): Pool | null {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) return null;
  if (!_pool) {
    _pool = new Pool({ ...buildPgPoolConfig(databaseUrl), max: 3 });
    _pool.on("error", (err) => {
      logger.error("[whatsapp-delivery pool] Unexpected error:", err.message);
    });
  }
  return _pool;
}

router.get("/status", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      sendError(res, "Database not configured", 503);
      return;
    }

    try {
      const result = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM whatsapp_delivery_logs
      GROUP BY status
      ORDER BY count DESC
    `);
      sendSuccess(res, { stats: result.rows });
    } catch (err) {
      logger.error({ err }, "[whatsapp-delivery] stats error");
      sendSuccess(res, { stats: [] });
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

router.get("/messages", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      sendError(res, "Database not configured", 503);
      return;
    }

    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(100, parseInt(String(req.query["limit"] ?? "50")));
    const offset = (page - 1) * limit;

    try {
      const result = await pool.query(
        `SELECT * FROM whatsapp_delivery_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM whatsapp_delivery_logs`);
      sendSuccess(res, {
        messages: result.rows,
        total: parseInt(String(countResult.rows[0]?.count ?? "0")),
        page,
        limit,
      });
    } catch (err) {
      logger.error({ err }, "[whatsapp-delivery] messages error");
      sendSuccess(res, { messages: [], total: 0, page, limit });
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

router.get("/health", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      sendSuccess(res, { healthy: false, reason: "no_database" });
      return;
    }

    try {
      await pool.query("SELECT 1");
      sendSuccess(res, { healthy: true });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      sendSuccess(res, { healthy: false, reason: "db_error" });
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

router.get("/delivery-log", async (req, res) => {
  try {
    const q = deliveryLogQuerySchema.safeParse(req.query);
    if (!q.success) {
      sendValidationError(res, q.error.errors.map((e) => e.message).join("; "));
      return;
    }

    const pool = getPool();
    if (!pool) {
      sendError(res, "Database not configured", 503);
      return;
    }

    const { page, limit, status, phone } = q.data;
    const offset = (page - 1) * limit;

    try {
      const filterValues: unknown[] = [];
      const conditions: string[] = [];
      let idx = 1;

      if (status) {
        conditions.push(`status = $${idx++}`);
        filterValues.push(status);
      }
      if (phone) {
        conditions.push(`phone ILIKE $${idx++}`);
        filterValues.push(`%${phone}%`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM whatsapp_delivery_logs ${where}`,
        filterValues
      );

      const selectValues: unknown[] = [...filterValues, limit, offset];
      const limitPlaceholder = `$${idx}`;
      const offsetPlaceholder = `$${idx + 1}`;

      const result = await pool.query(
        `SELECT * FROM whatsapp_delivery_logs ${where} ORDER BY created_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        selectValues
      );

      sendSuccess(res, {
        messages: result.rows,
        total: parseInt(String(countResult.rows[0]?.count ?? "0")),
        page,
        limit,
      });
    } catch (err) {
      logger.error({ err }, "[whatsapp-delivery] delivery-log error");
      sendSuccess(res, { messages: [], total: 0, page, limit });
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

router.get("/delivery-log/stats", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      sendError(res, "Database not configured", 503);
      return;
    }

    try {
      const result = await pool.query(`
      SELECT
        status,
        COUNT(*)::int                                        AS count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int  AS last7d
      FROM whatsapp_delivery_logs
      GROUP BY status
      ORDER BY count DESC
    `);

      const total = result.rows.reduce((s: number, r: { count: number }) => s + r.count, 0);
      sendSuccess(res, { stats: result.rows, total });
    } catch (err) {
      logger.error({ err }, "[whatsapp-delivery] delivery-log stats error");
      sendSuccess(res, { stats: [], total: 0 });
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

router.post("/delivery-log/retry", async (req, res) => {
  try {
    const b = retryBodySchema.safeParse(req.body ?? {});
    if (!b.success) {
      sendValidationError(res, b.error.errors.map((e) => e.message).join("; "));
      return;
    }

    const pool = getPool();
    if (!pool) {
      sendError(res, "Database not configured", 503);
      return;
    }

    const { messageId } = b.data;

    try {
      const existing = await pool.query(
        `SELECT * FROM whatsapp_delivery_logs WHERE id = $1 LIMIT 1`,
        [messageId]
      );

      if (existing.rows.length === 0) {
        sendError(res, "Message not found", 404);
        return;
      }

      const msg = existing.rows[0];
      if (msg.status !== "failed") {
        sendError(
          res,
          `Cannot retry message with status '${msg.status}'. Only failed messages can be retried.`,
          400
        );
        return;
      }

      await pool.query(
        `UPDATE whatsapp_delivery_logs SET status = 'pending', retries = COALESCE(retries, 0) + 1, updated_at = NOW() WHERE id = $1`,
        [messageId]
      );

      sendSuccess(res, { success: true, messageId, status: "pending" });
    } catch (err) {
      logger.error({ err }, "[whatsapp-delivery] retry error");
      sendError(res, "Failed to retry message", 500);
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

export default router;
