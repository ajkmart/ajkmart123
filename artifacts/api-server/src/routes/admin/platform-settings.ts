import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { Router, type IRouter } from "express";
import { logger } from "../../lib/logger.js";
import { sendError } from "../../lib/response.js";
import { invalidateSettingsCache } from "../../middleware/security.js";
import { DEFAULT_PLATFORM_SETTINGS } from "../admin-shared.js";

const router: IRouter = Router();

/* ─── helpers ─────────────────────────────────────────────────────────────── */

/** Seed default settings into the DB if the table is empty. */
async function ensureSettingsSeeded(): Promise<void> {
  const rows = await db.select({ key: platformSettingsTable.key }).from(platformSettingsTable);
  if (rows.length > 0) return;

  logger.info("[platform-settings] seeding defaults (%d keys)", DEFAULT_PLATFORM_SETTINGS.length);
  for (const s of DEFAULT_PLATFORM_SETTINGS) {
    await db
      .insert(platformSettingsTable)
      .values({ key: s.key, value: s.value, label: s.label, category: s.category })
      .onConflictDoNothing();
  }
  invalidateSettingsCache();
}

/** Upsert an array of { key, value } pairs into platform_settings. */
async function upsertSettings(
  entries: Array<{ key: string; value: string }>,
  currentRows: Array<{ key: string; label: string; category: string }>
): Promise<{ saved: number; errors: string[] }> {
  const defaultMap = new Map(DEFAULT_PLATFORM_SETTINGS.map((s) => [s.key, s]));
  const currentMap = new Map(currentRows.map((r) => [r.key, r]));

  let saved = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const existing = currentMap.get(entry.key);
    const def = defaultMap.get(entry.key);
    const label = existing?.label ?? def?.label ?? entry.key;
    const category = existing?.category ?? def?.category ?? "general";

    try {
      await db
        .insert(platformSettingsTable)
        .values({ key: entry.key, value: entry.value, label, category })
        .onConflictDoUpdate({
          target: platformSettingsTable.key,
          set: { value: entry.value, updatedAt: new Date() },
        });
      saved++;
    } catch (e: unknown) {
      errors.push(`${entry.key}: ${(e as Error).message}`);
    }
  }

  invalidateSettingsCache();
  return { saved, errors };
}

/* ─── GET /platform-settings ─────────────────────────────────────────────── */

router.get("/platform-settings", async (_req, res, next) => {
  try {
    await ensureSettingsSeeded();
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .orderBy(platformSettingsTable.category, platformSettingsTable.key);
    res.json({ settings: rows });
  } catch (e: unknown) {
    next(e);
  }
});

/* ─── PUT /platform-settings ─────────────────────────────────────────────── */

router.put("/platform-settings", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const incoming = body?.settings;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return sendError(res, "settings array is required", 400);
    }

    const entries = (incoming as unknown[]).map((s) => {
      const e = s as Record<string, unknown>;
      return { key: String(e.key ?? ""), value: String(e.value ?? "") };
    });

    const badKeys = entries.filter((e) => !e.key);
    if (badKeys.length > 0) {
      return sendError(res, "All settings entries must have a non-empty key", 400);
    }

    /* B-019: Reject unsafe regex patterns for regional_phone_format at write time */
    const phoneFormatEntry = entries.find((e) => e.key === "regional_phone_format");
    if (phoneFormatEntry) {
      const { default: safeRegex } = await import("safe-regex2");
      if (!safeRegex(phoneFormatEntry.value)) {
        return sendError(res, "regional_phone_format contains an unsafe regex pattern that could hang the server (ReDoS). Provide a safe pattern.", 400);
      }
    }

    const allCurrentRows = await db
      .select({
        key: platformSettingsTable.key,
        label: platformSettingsTable.label,
        category: platformSettingsTable.category,
      })
      .from(platformSettingsTable);

    const { saved, errors } = await upsertSettings(entries, allCurrentRows);

    if (errors.length > 0) {
      logger.warn({ errors }, "[platform-settings] some upserts failed");
    }

    res.json({
      success: true,
      saved,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: unknown) {
    next(e);
  }
});

/* ─── GET /platform-settings/backup ──────────────────────────────────────── */

router.get("/platform-settings/backup", async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .orderBy(platformSettingsTable.category, platformSettingsTable.key);

    res.json({
      settings: rows,
      count: rows.length,
      exported_at: new Date().toISOString(),
      version: "1",
    });
  } catch (e: unknown) {
    next(e);
  }
});

/* ─── POST /platform-settings/restore ────────────────────────────────────── */

router.post("/platform-settings/restore", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const incoming = body?.settings;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return sendError(res, "settings array is required", 400);
    }

    const entries = (incoming as unknown[])
      .map((s) => {
        const e = s as Record<string, unknown>;
        return { key: String(e.key ?? ""), value: String(e.value ?? "") };
      })
      .filter((e) => !!e.key);

    const allCurrentRows = await db
      .select({
        key: platformSettingsTable.key,
        label: platformSettingsTable.label,
        category: platformSettingsTable.category,
      })
      .from(platformSettingsTable);

    const { saved, errors } = await upsertSettings(entries, allCurrentRows);

    logger.info({ saved, errors: errors.length }, "[platform-settings] restore complete");

    res.json({
      success: true,
      restored: saved,
      skipped: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: unknown) {
    next(e);
  }
});

export default router;
