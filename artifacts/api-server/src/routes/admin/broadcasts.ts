import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { addAuditEntry, generateId, getClientIp, type AdminRequest } from "../admin-shared.js";

const router = Router();

async function ensureBroadcastsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        body          TEXT NOT NULL DEFAULT '',
        type          TEXT NOT NULL DEFAULT 'system',
        target_role   TEXT,
        sent_count    INTEGER NOT NULL DEFAULT 0,
        delivered_count INTEGER NOT NULL DEFAULT 0,
        failed_count  INTEGER NOT NULL DEFAULT 0,
        admin_id      TEXT,
        sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db
      .execute(
        sql`
      ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS delivered_count INTEGER NOT NULL DEFAULT 0
    `
      )
      .catch((err: unknown) => {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          "[broadcasts] delivered_count column add skipped (may already exist)"
        );
      });
    await db
      .execute(
        sql`
      ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0
    `
      )
      .catch((err: unknown) => {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          "[broadcasts] failed_count column add skipped (may already exist)"
        );
      });
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[fn] table may already exist in another form`
    );
  }
}

ensureBroadcastsTable().catch((err: unknown) => {
  logger.warn(
    { err: err instanceof Error ? err.message : String(err) },
    "[broadcasts] ensureBroadcastsTable failed at startup"
  );
});

/* ─────────────────────────────────────────────────────────
   GET /api/admin/broadcasts
   Paginated list of sent broadcasts with delivery stats.
───────────────────────────────────────────────────────── */
router.get("/broadcasts", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "50")));
    const offset = (page - 1) * limit;

    try {
      const rows = await db.execute(sql`
      SELECT id, title, body, type, target_role,
             sent_count, delivered_count, failed_count,
             admin_id, sent_at
      FROM broadcasts
      ORDER BY sent_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

      const [{ total }] = (await db.execute(sql`SELECT COUNT(*)::int AS total FROM broadcasts`))
        .rows as Array<{ total: number }>;

      const broadcasts = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        type: r.type,
        targetRole: r.target_role,
        sentCount: r.sent_count,
        deliveredCount: r.delivered_count,
        failedCount: r.failed_count,
        adminId: r.admin_id,
        sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : r.sent_at,
      }));

      sendSuccess(res, { broadcasts, total: total ?? broadcasts.length, page, limit });
    } catch (err: unknown) {
      sendError(res, err instanceof Error ? err.message : "Failed to fetch broadcasts", 500);
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

/* ─────────────────────────────────────────────────────────
   POST /api/admin/broadcasts/record
   Internal helper — called by the broadcast handler to persist
   each sent broadcast so history is populated.
───────────────────────────────────────────────────────── */
router.post("/broadcasts/record", async (req, res) => {
  try {
    const { title, body, type, targetRole, sentCount, adminId } = req.body as {
      title: string;
      body?: string;
      type?: string;
      targetRole?: string;
      sentCount?: number;
      adminId?: string;
    };
    if (!title) {
      sendValidationError(res, "title is required");
      return;
    }

    const id = generateId();
    try {
      await db.execute(sql`
      INSERT INTO broadcasts (id, title, body, type, target_role, sent_count, admin_id, sent_at, created_at)
      VALUES (
        ${id}, ${title}, ${body ?? ""}, ${type ?? "system"},
        ${targetRole ?? null}, ${sentCount ?? 0},
        ${adminId ?? null}, NOW(), NOW()
      )
    `);
      void addAuditEntry({
        action: "broadcast_sent",
        ip: getClientIp(req),
        adminId: (req as AdminRequest).adminId,
        details: `Broadcast "${title}" sent to ${sentCount ?? 0} recipients`,
        result: "success",
      });
      sendSuccess(res, { id });
    } catch (err: unknown) {
      sendError(res, err instanceof Error ? err.message : "Failed to record broadcast", 500);
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

/* ─────────────────────────────────────────────────────────
   PATCH /api/admin/broadcasts/:id/delivery-stats
   Update delivered_count / failed_count (called by webhook or manually).
───────────────────────────────────────────────────────── */
router.patch("/broadcasts/:id/delivery-stats", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { deliveredCount, failedCount } = req.body as {
      deliveredCount?: number;
      failedCount?: number;
    };

    if (deliveredCount === undefined && failedCount === undefined) {
      sendValidationError(res, "deliveredCount or failedCount required");
      return;
    }

    try {
      const result = await db.execute(sql`
      UPDATE broadcasts
      SET delivered_count = COALESCE(${deliveredCount ?? null}, delivered_count),
          failed_count    = COALESCE(${failedCount ?? null}, failed_count)
      WHERE id = ${id}
      RETURNING *
    `);

      if (!(result.rows as unknown[]).length) {
        sendNotFound(res, "Broadcast not found");
        return;
      }

      void addAuditEntry({
        action: "broadcast_delivery_update",
        ip: getClientIp(req),
        adminId: (req as AdminRequest).adminId,
        details: `Updated delivery stats for broadcast ${id}`,
        result: "success",
      });

      sendSuccess(res, { success: true });
    } catch (err: unknown) {
      sendError(res, err instanceof Error ? err.message : "Failed to update delivery stats", 500);
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
