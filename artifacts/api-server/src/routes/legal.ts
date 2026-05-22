import { db } from "@workspace/db";
import { consentLogTable, termsVersionsTable, usersTable } from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { sendCreated, sendError, sendSuccess } from "../lib/response.js";
import { validateBody } from "../middleware/validate.js";
import { AuditService } from "../services/admin-audit.service.js";
import {
  getClientIp,
  invalidatePlatformSettingsCache,
  invalidateSettingsCache,
  type AdminRequest,
} from "./admin-shared.js";

/**
 * /legal/* — admin surface for the GDPR / consent pipeline.
 *
 *   GET  /legal/terms-versions
 *   POST /legal/terms-versions   (idempotent on `(policy, version)`)
 *   GET  /legal/consent-log?policy=&version=&userId=&limit=&offset=
 *
 * Mounted under both `/api/admin/legal` (admin auth) and `/api/legal`
 * (also admin auth — the consent log is GDPR-sensitive). The admin pages
 * call the `/api/admin/legal/*` variant; external tooling that follows
 * the contract from `bugs.md` can hit `/api/legal/*` instead.
 *
 * Idempotency: re-POSTing the same `(policy, version)` returns the
 * existing row instead of erroring, so re-running publish flows is safe.
 *
 * Force-re-acceptance: bumping the version simply inserts a new row;
 * mobile clients compare the user's `users.accepted_terms_version`
 * against the latest version of the `terms` policy on next launch and
 * surface the consent gate when they differ. The existing
 * `/platform-config/accept-terms` endpoint records that acceptance into
 * `consent_log`, which then surfaces here.
 */

const router: IRouter = Router();

interface ConsentLogEntryDTO {
  id: string;
  userId: string;
  policy: string;
  version: string;
  acceptedAt: string;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
}

interface TermsVersionRowDTO {
  policy: string;
  version: string;
  effectiveAt: string;
  bodyMarkdown?: string;
  changelog?: string;
  isCurrent?: boolean;
}

/* `mobile` is the catch-all the React Native consumer app writes when
   it can't distinguish iOS from Android cheaply (the platform-config
   accept-terms route hardcodes it). Keep the more specific values too
   for clients that DO send `source` explicitly via the body. */
const VALID_SOURCES = ["web", "android", "ios", "mobile", "admin"] as const;

/* ── GET /legal/terms-versions ───────────────────────────────────── */
router.get("/terms-versions", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(termsVersionsTable)
      .orderBy(asc(termsVersionsTable.policy), desc(termsVersionsTable.effectiveAt));

    /* Mark the latest-effective row per policy as `isCurrent`. */
    const seen = new Set<string>();
    const items: TermsVersionRowDTO[] = rows.map((r) => {
      const isCurrent = !seen.has(r.policy);
      seen.add(r.policy);
      return {
        policy: r.policy,
        version: r.version,
        effectiveAt: r.effectiveAt.toISOString(),
        bodyMarkdown: r.bodyMarkdown ?? undefined,
        changelog: r.changelog ?? undefined,
        isCurrent,
      };
    });

    sendSuccess(res, { items, total: items.length });
  } catch (err) {
    sendError(res, (err as Error).message ?? "Failed to load terms versions");
  }
});

/* ── POST /legal/terms-versions ──────────────────────────────────── */
const termsVersionSchema = z.object({
  policy: z.string().min(1).max(64),
  version: z.string().min(1).max(64),
  effectiveAt: z.string().datetime().optional(),
  bodyMarkdown: z.string().max(200_000).optional(),
  changelog: z.string().max(10_000).optional(),
});

/**
 * `accepted_terms_version` is added to `users` by an out-of-band auth
 * migration that not every environment has run. We swallow the
 * "column does not exist" error specifically (Postgres SQLSTATE 42703)
 * so a missing column never breaks a publish, and re-throw everything
 * else so genuine failures surface in the response and the audit log.
 */
async function resetAcceptedTermsVersion(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  try {
    await db.execute(
      sql`UPDATE users SET accepted_terms_version = NULL WHERE accepted_terms_version IS NOT NULL`
    );
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42703") {
      /* Column not present in this environment — expected, treat as no-op. */
      return { ok: true, reason: "column_missing" };
    }
    throw err;
  }
}

async function isLatestForPolicy(policy: string, version: string): Promise<boolean> {
  const [latest] = await db
    .select({ version: termsVersionsTable.version })
    .from(termsVersionsTable)
    .where(eq(termsVersionsTable.policy, policy))
    .orderBy(desc(termsVersionsTable.effectiveAt))
    .limit(1);
  return !!latest && latest.version === version;
}

router.post("/terms-versions", validateBody(termsVersionSchema), async (req, res) => {
  try {
    const body = req.body as z.infer<typeof termsVersionSchema>;
    const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : new Date();

    try {
      /* Race-safe idempotency: try to insert; on PK conflict (`policy`,
       `version` already exists) `onConflictDoNothing` returns no rows
       and we re-fetch the existing row. This avoids the read-then-write
       race that lets two concurrent publishes both pass the existence
       check and then fight over the unique constraint. */
      const insertedRows = await db
        .insert(termsVersionsTable)
        .values({
          policy: body.policy,
          version: body.version,
          effectiveAt,
          bodyMarkdown: body.bodyMarkdown ?? null,
          changelog: body.changelog ?? null,
        })
        .onConflictDoNothing({
          target: [termsVersionsTable.policy, termsVersionsTable.version],
        })
        .returning();

      const wasInserted = insertedRows.length > 0;
      const inserted = insertedRows[0];

      let row;
      if (wasInserted && inserted) {
        row = inserted;
      } else {
        const [existing] = await db
          .select()
          .from(termsVersionsTable)
          .where(
            and(
              eq(termsVersionsTable.policy, body.policy),
              eq(termsVersionsTable.version, body.version)
            )
          )
          .limit(1);
        if (!existing) {
          sendError(res, "Insert reported no row but existing lookup also empty");
          return;
        }
        row = existing;
      }

      /* `isCurrent` is computed against the live state of the table, so
       publishing an older `effectiveAt` returns `isCurrent: false` and
       a re-POST of an older version still reports its true status. */
      const isCurrent = await isLatestForPolicy(body.policy, body.version);

      /* Bumping the latest "terms" version forces a re-acceptance flow on
       next launch by NULLing every user's accepted_terms_version. We
       only do this on a fresh insert that is now the latest — re-POST
       of an existing row is a no-op. */
      if (wasInserted && isCurrent && body.policy === "terms") {
        const result = await resetAcceptedTermsVersion();
        if (result.ok) {
          AuditService.log({
            action: "terms_version_published",
            ip: getClientIp(req),
            adminId: (req as AdminRequest).adminId,
            details: `Published ${body.policy} v${body.version} (effectiveAt=${effectiveAt.toISOString()})${result.reason ? ` [reset_skipped:${result.reason}]` : ""}`,
            result: "success",
          });
        }
      } else if (wasInserted && isCurrent) {
        AuditService.log({
          action: "terms_version_published",
          ip: getClientIp(req),
          adminId: (req as AdminRequest).adminId,
          details: `Published ${body.policy} v${body.version} (effectiveAt=${effectiveAt.toISOString()})`,
          result: "success",
        });
      }

      invalidateSettingsCache();
      invalidatePlatformSettingsCache();

      const payload = {
        policy: row.policy,
        version: row.version,
        effectiveAt: row.effectiveAt.toISOString(),
        bodyMarkdown: row.bodyMarkdown ?? undefined,
        changelog: row.changelog ?? undefined,
        isCurrent,
        ...(wasInserted ? {} : { idempotent: true }),
      };

      if (wasInserted) {
        sendCreated(res, payload);
      } else {
        sendSuccess(res, payload);
      }
    } catch (err) {
      sendError(res, (err as Error).message ?? "Failed to create terms version");
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

/* ── GET /legal/consent-log ──────────────────────────────────────── */
const consentQuerySchema = z.object({
  policy: z.string().min(1).max(64).optional(),
  version: z.string().min(1).max(64).optional(),
  userId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/consent-log", async (req, res) => {
  try {
    const parsed = consentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(
        res,
        parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
        400
      );
      return;
    }
    const { policy, version, userId, limit, offset } = parsed.data;

    /* Backwards-compatible policy aliases: pre-existing rows written by
     /platform-config/accept-terms before this task used
     consent_type='terms_acceptance'. New rows use the canonical 'terms'
     slug. We map ?policy=terms (or terms_acceptance) to match BOTH
     values so the admin Consent Log filter shows the full history. Add
     more aliases here as legacy slugs surface. */
    const POLICY_ALIASES: Record<string, string[]> = {
      terms: ["terms", "terms_acceptance"],
      terms_acceptance: ["terms", "terms_acceptance"],
    };

    const filters: SQL[] = []; // drizzle dynamic query
    if (policy) {
      const aliases = POLICY_ALIASES[policy] ?? [policy];
      filters.push(
        aliases.length === 1
          ? eq(consentLogTable.consentType, aliases[0]!)
          : inArray(consentLogTable.consentType, aliases)
      );
    }
    if (version) filters.push(eq(consentLogTable.consentVersion, version));
    if (userId) filters.push(eq(consentLogTable.userId, userId));
    const where =
      filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined;

    try {
      const totalRows = where
        ? await db
            .select({ c: sql<number>`count(*)::int` })
            .from(consentLogTable)
            .where(where)
        : await db.select({ c: sql<number>`count(*)::int` }).from(consentLogTable);
      const total = Number(totalRows[0]?.c ?? 0);

      const baseQuery = db
        .select()
        .from(consentLogTable)
        .orderBy(desc(consentLogTable.createdAt))
        .limit(limit)
        .offset(offset);

      const rows = where ? await baseQuery.where(where) : await baseQuery;

      const items: ConsentLogEntryDTO[] = rows.map((r) => {
        const src =
          r.source && (VALID_SOURCES as readonly string[]).includes(r.source)
            ? r.source
            : undefined;
        return {
          id: r.id,
          userId: r.userId,
          policy: r.consentType,
          version: r.consentVersion,
          acceptedAt: r.createdAt.toISOString(),
          ipAddress: r.ipAddress ?? undefined,
          userAgent: r.userAgent ?? undefined,
          source: src,
        };
      });

      sendSuccess(res, { items, total, limit, offset });
    } catch (err) {
      sendError(res, (err as Error).message ?? "Failed to load consent log");
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

/* Silence unused-import warning — `usersTable` is referenced indirectly
   via the raw SQL update above and we want the import for clarity. */
void usersTable;

export default router;
