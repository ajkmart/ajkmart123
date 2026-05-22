import { buildPgPoolConfig } from "@workspace/db/connection-url";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface MigrationGuardReport {
  ok: boolean;
  checkedAt: string;
  journalEntries: number;
  drizzleKitMissing: string[];
  customRunnerMissing: string[];
  orphanedInCustomRunner: string[];
}

let _lastGuardReport: MigrationGuardReport | null = null;

export function getLastMigrationGuardReport(): MigrationGuardReport | null {
  return _lastGuardReport;
}

function findDrizzleDir(): string | null {
  const candidates = [
    path.join(__dirname, "../../../../lib/db/drizzle"),
    path.join(__dirname, "../../../lib/db/drizzle"),
  ];
  return candidates.find((d) => fs.existsSync(d)) ?? null;
}

function readJournal(drizzleDir: string): JournalEntry[] {
  const journalPath = path.join(drizzleDir, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    return parsed.entries ?? [];
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return [];
  }
}

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath, "utf8");
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Checks that both migration tracking tables are in sync with the journal.
 *
 * Two trackers are compared:
 *  1. `drizzle.__drizzle_migrations` — used by `drizzle-kit migrate` (hash-based)
 *  2. `public._drizzle_migrations`   — used by the custom sqlMigrationRunner (filename-based)
 *
 * For each journal entry the guard verifies:
 *  - Its SHA-256 hash appears in `drizzle.__drizzle_migrations`
 *  - Its filename appears in `public._drizzle_migrations`
 *
 * Any gaps are logged as warnings. Files present in the custom runner table
 * but absent from the journal are flagged as orphaned (not a fatal condition,
 * but worth knowing about).
 */
export async function checkMigrationGuard(): Promise<MigrationGuardReport> {
  const checkedAt = new Date().toISOString();

  const drizzleDir = findDrizzleDir();
  if (!drizzleDir) {
    const report: MigrationGuardReport = {
      ok: true,
      checkedAt,
      journalEntries: 0,
      drizzleKitMissing: [],
      customRunnerMissing: [],
      orphanedInCustomRunner: [],
    };
    logger.warn("[migration-guard] Drizzle directory not found — skipping guard");
    _lastGuardReport = report;
    return report;
  }

  const journal = readJournal(drizzleDir);
  if (journal.length === 0) {
    const report: MigrationGuardReport = {
      ok: true,
      checkedAt,
      journalEntries: 0,
      drizzleKitMissing: [],
      customRunnerMissing: [],
      orphanedInCustomRunner: [],
    };
    logger.warn("[migration-guard] Journal is empty or unreadable — skipping guard");
    _lastGuardReport = report;
    return report;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const report: MigrationGuardReport = {
      ok: true,
      checkedAt,
      journalEntries: journal.length,
      drizzleKitMissing: [],
      customRunnerMissing: [],
      orphanedInCustomRunner: [],
    };
    _lastGuardReport = report;
    return report;
  }

  const pool = new Pool(buildPgPoolConfig(databaseUrl));
  try {
    // ── drizzle-kit tracker (hash-based) ──────────────────────────────────
    let drizzleKitHashes = new Set<string>();
    let drizzleSchemaFresh = false;
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
           id SERIAL PRIMARY KEY,
           hash TEXT NOT NULL,
           created_at BIGINT
         )`
      );
      const { rows } = await pool.query<{ hash: string }>(
        "SELECT hash FROM drizzle.__drizzle_migrations"
      );
      drizzleKitHashes = new Set(rows.map((r) => r.hash));
    } catch (err: unknown) {
      const pgErr = err as { code?: string; message?: string };
      const isSchemaNotExist =
        pgErr?.code === "3F000" ||
        (typeof pgErr?.message === "string" &&
          pgErr.message.includes('schema "drizzle" does not exist'));
      if (isSchemaNotExist) {
        drizzleSchemaFresh = true;
        logger.info(
          "[migration-guard] drizzle.__drizzle_migrations schema not found — " +
            "migrations may have been applied via the custom runner only. " +
            "Run `pnpm --filter @workspace/db run migrate` to populate drizzle-kit tracking table."
        );
      } else {
        logger.warn({ err }, "[migration-guard] Could not read drizzle.__drizzle_migrations");
      }
    }

    // ── custom runner tracker (filename-based) ────────────────────────────
    let customRunnerFiles = new Set<string>();
    let allCustomRunnerFiles: string[] = [];
    try {
      const { rows } = await pool.query<{ filename: string }>(
        "SELECT filename FROM _drizzle_migrations"
      );
      allCustomRunnerFiles = rows.map((r) => r.filename);
      customRunnerFiles = new Set(allCustomRunnerFiles);
    } catch (err) {
      // Table may not exist in early boot — not a problem
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        "[migrationGuard] _drizzle_migrations table not found — early boot, skipping"
      );
    }

    // ── Check each journal entry against both trackers ────────────────────
    const drizzleKitMissing: string[] = [];
    const customRunnerMissing: string[] = [];
    const journalFilenames = new Set<string>();

    for (const entry of journal) {
      const filename = `${entry.tag}.sql`;
      journalFilenames.add(filename);
      const filePath = path.join(drizzleDir, filename);

      if (!fs.existsSync(filePath)) continue;

      const hash = hashFile(filePath);
      if (!drizzleKitHashes.has(hash)) {
        drizzleKitMissing.push(filename);
      }
      if (!customRunnerFiles.has(filename)) {
        customRunnerMissing.push(filename);
      }
    }

    // ── Orphaned: in custom runner but not in journal ─────────────────────
    const orphanedInCustomRunner = allCustomRunnerFiles.filter((f) => !journalFilenames.has(f));

    const ok = drizzleKitMissing.length === 0 && customRunnerMissing.length === 0;

    const report: MigrationGuardReport = {
      ok,
      checkedAt,
      journalEntries: journal.length,
      drizzleKitMissing,
      customRunnerMissing,
      orphanedInCustomRunner,
    };

    if (!ok) {
      if (drizzleKitMissing.length > 0 && !drizzleSchemaFresh) {
        logger.warn(
          { missing: drizzleKitMissing },
          `[migration-guard] ${drizzleKitMissing.length} journal migration(s) missing from drizzle.__drizzle_migrations — ` +
            "run `pnpm --filter @workspace/db run migrate` to sync"
        );
      }
      if (customRunnerMissing.length > 0) {
        logger.warn(
          { missing: customRunnerMissing },
          `[migration-guard] ${customRunnerMissing.length} journal migration(s) missing from _drizzle_migrations — ` +
            "they will be applied on next startup by the custom runner"
        );
      }
    } else {
      logger.info(
        { journalEntries: journal.length, orphaned: orphanedInCustomRunner.length },
        "[migration-guard] Both migration trackers are in sync with the journal"
      );
    }

    if (orphanedInCustomRunner.length > 0) {
      logger.info(
        { orphaned: orphanedInCustomRunner },
        `[migration-guard] ${orphanedInCustomRunner.length} legacy file(s) in _drizzle_migrations predate the current journal (harmless)`
      );
    }

    _lastGuardReport = report;
    return report;
  } finally {
    await pool.end();
  }
}
