import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { Router } from "express";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import {
  sendCreated,
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../lib/response.js";

const router = Router();

/* ── GET /admin/release-notes ── */
router.get("/release-notes", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, version, release_date, notes, sort_order, created_at, updated_at
      FROM release_notes
      ORDER BY sort_order ASC, created_at DESC
    `);
    sendSuccess(res, {
      releaseNotes: (rows.rows as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        version: r.version,
        releaseDate: r.release_date,
        notes: (() => {
          try {
            return JSON.parse(r.notes as string);
          } catch (err) {
            logger.warn(
              { err },
              "[fn] release note JSON parse failed — falling back to raw string"
            );
            return [r.notes];
          }
        })(),
        sortOrder: r.sort_order,
        createdAt: r.created_at,
      })),
    });
  } catch (_e) {
    sendError(res, "Failed to fetch release notes");
  }
});

/* ── POST /admin/release-notes ── */
router.post("/release-notes", async (req, res) => {
  try {
    const { version, releaseDate, notes, sortOrder } = req.body as {
      version?: string;
      releaseDate?: string;
      notes?: string | string[];
      sortOrder?: number;
    };

    if (!version || !releaseDate || !notes) {
      sendValidationError(res, "version, releaseDate, and notes are required");
      return;
    }

    const notesStr = typeof notes === "string" ? notes : JSON.stringify(notes);
    const id = generateId();
    const order = sortOrder ?? 0;

    try {
      await db.execute(sql`
      INSERT INTO release_notes (id, version, release_date, notes, sort_order, created_at, updated_at)
      VALUES (${id}, ${version}, ${releaseDate}, ${notesStr}, ${order}, NOW(), NOW())
    `);
      sendCreated(res, { id, version, releaseDate, notes, sortOrder: order });
    } catch (_e) {
      sendError(res, "Failed to create release note");
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

/* ── PATCH /admin/release-notes/:id ── */
router.patch("/release-notes/:id", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { version, releaseDate, notes, sortOrder } = req.body as {
      version?: string;
      releaseDate?: string;
      notes?: string | string[];
      sortOrder?: number;
    };

    try {
      const existing = await db.execute(sql`SELECT id FROM release_notes WHERE id = ${id}`);
      if ((existing.rows as unknown[]).length === 0) {
        sendNotFound(res, "Release note not found");
        return;
      }

      const notesStr =
        notes !== undefined
          ? typeof notes === "string"
            ? notes
            : JSON.stringify(notes)
          : undefined;

      await db.execute(sql`
      UPDATE release_notes SET
        version      = COALESCE(${version ?? null}, version),
        release_date = COALESCE(${releaseDate ?? null}, release_date),
        notes        = COALESCE(${notesStr ?? null}, notes),
        sort_order   = COALESCE(${sortOrder ?? null}, sort_order),
        updated_at   = NOW()
      WHERE id = ${id}
    `);
      sendSuccess(res, { updated: true });
    } catch (_e) {
      sendError(res, "Failed to update release note");
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

/* ── DELETE /admin/release-notes/:id ── */
router.delete("/release-notes/:id", async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    try {
      await db.execute(sql`DELETE FROM release_notes WHERE id = ${id}`);
      sendSuccess(res, { deleted: true });
    } catch (_e) {
      sendError(res, "Failed to delete release note");
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

/* ── GET /admin/consent-log ── */
router.get("/consent-log", async (req, res) => {
  try {
    const userId = (req.query["userId"] as string) || null;
    const page = Math.max(1, parseInt(String(req.query["page"] || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"), 10)));
    const offset = (page - 1) * limit;

    try {
      const countResult = userId
        ? await db.execute(
            sql`SELECT COUNT(*)::int as total FROM consent_log WHERE user_id = ${userId}`
          )
        : await db.execute(sql`SELECT COUNT(*)::int as total FROM consent_log`);
      const total = parseInt(
        String((countResult.rows[0] as Record<string, unknown>)?.total ?? "0"),
        10
      );

      const rows = userId
        ? await db.execute(sql`
          SELECT id, user_id, consent_type, consent_version, ip_address, created_at
          FROM consent_log
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `)
        : await db.execute(sql`
          SELECT id, user_id, consent_type, consent_version, ip_address, created_at
          FROM consent_log
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `);

      sendSuccess(res, {
        logs: (rows.rows as Array<Record<string, unknown>>).map((r) => ({
          id: r.id,
          userId: r.user_id,
          consentType: r.consent_type,
          consentVersion: r.consent_version,
          ipAddress: r.ip_address,
          createdAt: r.created_at,
        })),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    } catch (_e) {
      sendError(res, "Failed to fetch consent log");
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
