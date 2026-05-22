import { db } from "@workspace/db";
import {
  autoResolveLogTable,
  customerErrorReportsTable,
  errorReportsTable,
  errorResolutionBackupsTable,
  fileScanResultsTable,
  platformSettingsTable,
} from "@workspace/db/schema";
import crypto from "crypto";
import { and, count, desc, eq, gte, inArray, lt, lte, ne, sql, type SQL } from "drizzle-orm";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../lib/response.js";
import { validateBody } from "../middleware/validate.js";
import { runFileScanner, type FileScanFinding } from "../services/file-scanner.js";
import { adminAuth, type AdminRequest } from "./admin-shared.js";

const router = Router();

/* ── Public ingest abuse controls ────────────────────────────────────────────
   The public POST `/api/error-reports` endpoint accepts unauthenticated
   reports from every client app, which is also a tempting target for a
   self-amplifying log-flood DoS. We protect it with two cheap, complementary
   guards:

   1. HMAC-SHA256 signature over the raw request body, keyed by a server-side
      secret that is also injected into client builds at build time. A missing
      or wrong signature returns 401 BEFORE any DB work runs.
   2. A small in-memory token bucket per client IP (default 30 req/min). When
      the bucket is empty the request returns 429.

   In development the HMAC check is bypassed when no secret is configured so
   local work isn't blocked. In production we **fail-closed**: if
   `ERROR_REPORT_HMAC_SECRET` is missing or unsigned requests arrive, we
   reject with 401 rather than silently accepting them.
   ──────────────────────────────────────────────────────────────────────── */
const ERROR_REPORT_HMAC_HEADER = "x-report-signature";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getHmacSecret(): string | null {
  return (process.env.ERROR_REPORT_HMAC_SECRET ?? "").trim() || null;
}

/* Trust the IP that Express derived for us. `app.set('trust proxy', 1)` is
   enabled in app.ts so `req.ip` is the first hop in the X-Forwarded-For chain
   when behind the Replit proxy, and the socket address otherwise. We never
   parse the X-Forwarded-For header directly because attackers can spoof it
   to rotate identities and evade per-IP rate limits. */
function getClientIpFromReq(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/* ── In-memory token bucket per IP ──
   Map<ip, { tokens, lastRefillMs }>. Buckets are pruned lazily — entries are
   only deleted when an IP comes back; no global GC is needed because the map
   stays small as long as legitimate IPs keep refilling. */
type Bucket = { tokens: number; lastRefillMs: number };
const ipBuckets = new Map<string, Bucket>();

function getRateLimitConfig(): { capacity: number; refillPerMs: number } {
  const perMin = Math.max(1, parseInt(process.env.ERROR_REPORT_RATE_PER_MIN ?? "30", 10) || 30);
  return { capacity: perMin, refillPerMs: perMin / 60_000 };
}

function tryConsume(ip: string): boolean {
  const { capacity, refillPerMs } = getRateLimitConfig();
  const now = Date.now();
  const existing = ipBuckets.get(ip);
  if (!existing) {
    ipBuckets.set(ip, { tokens: capacity - 1, lastRefillMs: now });
    return true;
  }
  const elapsed = now - existing.lastRefillMs;
  const refilled = Math.min(capacity, existing.tokens + elapsed * refillPerMs);
  if (refilled < 1) {
    existing.tokens = refilled;
    existing.lastRefillMs = now;
    return false;
  }
  existing.tokens = refilled - 1;
  existing.lastRefillMs = now;
  return true;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return false;
  }
}

/* Middleware: HMAC verify + rate limit. Order: rate-limit FIRST so a flood of
   unsigned requests is rejected without running the (cheap) HMAC compare. */
function errorReportIngestGuard(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIpFromReq(req);
  if (!tryConsume(ip)) {
    res.status(429).set("Retry-After", "60").json({
      success: false,
      error: "Too many error reports — please slow down",
    });
    return;
  }

  const secret = getHmacSecret();
  if (!secret) {
    /* No secret configured. In production this is a misconfiguration —
       fail-closed so the endpoint is never silently unauthenticated.
       In development we accept unsigned reports so local work isn't blocked. */
    if (isProduction()) {
      res.status(401).json({ success: false, error: "Error-report ingest not configured" });
      return;
    }
    next();
    return;
  }

  const provided = (req.headers[ERROR_REPORT_HMAC_HEADER] as string | undefined)?.trim() ?? "";
  if (!provided) {
    res.status(401).json({ success: false, error: "Missing error-report signature" });
    return;
  }

  /* Use raw body bytes captured by the express.json verify hook in app.ts.
     Falling back to the parsed JSON re-stringified is intentionally NOT done:
     any whitespace/key-order differences would silently break verification. */
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || raw.length === 0) {
    res.status(401).json({ success: false, error: "Missing request body" });
    return;
  }
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (!timingSafeEqualHex(expected, provided.toLowerCase())) {
    res.status(401).json({ success: false, error: "Invalid error-report signature" });
    return;
  }
  next();
}

const VALID_SOURCE_APPS = ["customer", "rider", "vendor", "admin", "api"] as const;
const VALID_ERROR_TYPES = [
  "frontend_crash",
  "api_error",
  "db_error",
  "route_error",
  "ui_error",
  "unhandled_exception",
] as const;
const VALID_SEVERITIES = ["critical", "medium", "minor"] as const;
const VALID_STATUSES = ["new", "acknowledged", "in_progress", "resolved"] as const;

type SourceApp = (typeof VALID_SOURCE_APPS)[number];
type ErrorType = (typeof VALID_ERROR_TYPES)[number];

function classifySeverity(
  errorType: ErrorType,
  statusCode?: number,
  errorMessage?: string
): (typeof VALID_SEVERITIES)[number] {
  if (errorType === "db_error") return "critical";
  if (errorType === "unhandled_exception") return "medium";
  if (errorType === "ui_error") return "minor";
  if (errorType === "frontend_crash") return "critical";

  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("auth") || msg.includes("payment") || msg.includes("database"))
    return "critical";

  if (errorType === "api_error" || errorType === "route_error") {
    if (statusCode && statusCode >= 500) return "critical";
    if (statusCode === 422 || statusCode === 400) return "minor";
    if (statusCode && statusCode >= 400) return "medium";
  }

  return "medium";
}

function classifyImpact(errorType: ErrorType, severity: string): string {
  const impacts: Record<string, Record<string, string>> = {
    frontend_crash: {
      critical: "App crash — user cannot continue",
      medium: "Component failure — partial functionality loss",
      minor: "Minor rendering issue",
    },
    api_error: {
      critical: "Server error — feature unavailable",
      medium: "Request rejected — user action blocked",
      minor: "Non-critical API issue",
    },
    db_error: {
      critical: "Database failure — data operations blocked",
      medium: "Database query issue",
      minor: "Minor database issue",
    },
    route_error: {
      critical: "Route handler failure — endpoint down",
      medium: "Route error — degraded service",
      minor: "Minor routing issue",
    },
    ui_error: {
      critical: "UI completely broken",
      medium: "UI partially broken",
      minor: "Minor UI glitch",
    },
    unhandled_exception: {
      critical: "Unhandled crash — potential data loss",
      medium: "Unhandled error — unexpected behavior",
      minor: "Minor unhandled error",
    },
  };
  return impacts[errorType]?.[severity] || "Error detected — investigation needed";
}

function metadataDepth(value: unknown, depth = 0): number {
  if (depth > 10) return depth;
  if (value == null || typeof value !== "object" || Array.isArray(value)) return depth;
  const children = Object.values(value as Record<string, unknown>);
  if (children.length === 0) return depth;
  return Math.max(...children.map((v) => metadataDepth(v, depth + 1)));
}

const createErrorReportSchema = z.object({
  sourceApp: z.enum(VALID_SOURCE_APPS),
  errorType: z.enum(VALID_ERROR_TYPES),
  severity: z
    .enum(VALID_SEVERITIES)
    .optional()
    .transform(() => undefined),
  functionName: z.string().min(1).max(500).optional(),
  moduleName: z.string().min(1).max(500).optional(),
  componentName: z.string().min(1).max(500).optional(),
  errorMessage: z.string().min(1).max(5000),
  stackTrace: z
    .string()
    .max(50000)
    .regex(/^[\s\S]*$/)
    .optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((m) => !m || JSON.stringify(m).length <= 10 * 1024, {
      message: "metadata exceeds 10 KB limit",
    })
    .refine((m) => !m || metadataDepth(m) <= 3, { message: "metadata nesting exceeds 3 levels" }),
  statusCode: z.number().optional(),
  /** Client-computed hash for deduplication — must be exactly 8 lowercase hex chars */
  errorHash: z
    .string()
    .regex(/^[0-9a-f]{8}$/)
    .optional(),
});

/* ── Deterministic DJB2 fingerprint for grouping identical errors ──────── */
function computeErrorHash(errorMessage: string, errorType: string, sourceApp: string): string {
  const key = `${errorType}::${sourceApp}::${errorMessage.slice(0, 300)}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

router.post(
  "/",
  errorReportIngestGuard,
  validateBody(createErrorReportSchema),
  async (req, res) => {
    try {
      const body = req.body;
      const severity = classifySeverity(body.errorType, body.statusCode, body.errorMessage);
      const shortImpact = classifyImpact(body.errorType, severity);

      /* ── Hash-based deduplication with smart re-open ───────────────────── */
      const hash =
        body.errorHash ?? computeErrorHash(body.errorMessage, body.errorType, body.sourceApp);
      let activeExisting: typeof errorReportsTable.$inferSelect | undefined;
      let resolvedExisting: typeof errorReportsTable.$inferSelect | undefined;
      try {
        const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
        // First: look for an active (non-resolved) match within the dedup window
        const [activeRow] = await db
          .select()
          .from(errorReportsTable)
          .where(
            and(
              eq(errorReportsTable.errorHash, hash),
              ne(errorReportsTable.status, "resolved"),
              gte(errorReportsTable.timestamp, cutoff)
            )
          )
          .limit(1);
        activeExisting = activeRow;

        // Second: look for a resolved match (any time) if no active one
        if (!activeExisting) {
          const [resolvedRow] = await db
            .select()
            .from(errorReportsTable)
            .where(
              and(eq(errorReportsTable.errorHash, hash), eq(errorReportsTable.status, "resolved"))
            )
            .orderBy(desc(errorReportsTable.updatedAt))
            .limit(1);
          resolvedExisting = resolvedRow;
        }
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[fn] Columns may not exist yet on first startup — safe to skip dedup`
        );
      }

      // Case 1: active duplicate — just increment count
      if (activeExisting) {
        const newCount = (activeExisting.occurrenceCount ?? 1) + 1;
        try {
          await db
            .update(errorReportsTable)
            .set({ occurrenceCount: newCount, updatedAt: new Date() })
            .where(eq(errorReportsTable.id, activeExisting.id));
        } catch (err) {
          logger.warn({ err }, "[error-reports] dedup DB update failed — non-fatal");
        }
        return sendSuccess(
          res,
          {
            ...activeExisting,
            occurrenceCount: newCount,
            deduplicated: true,
            timestamp: activeExisting.timestamp.toISOString(),
            resolvedAt: activeExisting.resolvedAt?.toISOString() ?? null,
            acknowledgedAt: activeExisting.acknowledgedAt?.toISOString() ?? null,
            updatedAt: new Date().toISOString(),
          },
          undefined,
          200
        );
      }

      // Case 2: previously resolved — reopen it
      if (resolvedExisting) {
        const newCount = (resolvedExisting.occurrenceCount ?? 1) + 1;
        const now = new Date();
        try {
          await db
            .update(errorReportsTable)
            .set({
              status: "new",
              occurrenceCount: newCount,
              resolvedAt: null,
              resolutionMethod: null,
              resolutionNotes: null,
              updatedAt: now,
            })
            .where(eq(errorReportsTable.id, resolvedExisting.id));
        } catch (err) {
          logger.warn({ err }, "[error-reports] dedup DB update failed — non-fatal");
        }
        return sendSuccess(
          res,
          {
            ...resolvedExisting,
            status: "new",
            occurrenceCount: newCount,
            resolvedAt: null,
            resolutionMethod: null,
            resolutionNotes: null,
            reopened: true,
            timestamp: resolvedExisting.timestamp.toISOString(),
            acknowledgedAt: resolvedExisting.acknowledgedAt?.toISOString() ?? null,
            updatedAt: now.toISOString(),
          },
          undefined,
          200
        );
      }

      const id = generateId();
      const [report] = await db
        .insert(errorReportsTable)
        .values({
          id,
          sourceApp: body.sourceApp,
          errorType: body.errorType,
          severity,
          functionName: body.functionName || null,
          moduleName: body.moduleName || null,
          componentName: body.componentName || null,
          errorMessage: body.errorMessage,
          shortImpact,
          stackTrace: body.stackTrace || null,
          metadata: body.metadata || null,
          errorHash: hash,
          occurrenceCount: 1,
        })
        .returning();

      sendSuccess(res, report, undefined, 201);
    } catch (err) {
      logger.error({ err }, "Failed to store error report");
      sendError(res, "Failed to store error report", 500);
    }
  }
);

router.get("/", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query["page"] || "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"))));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    const sourceApp = req.query["sourceApp"] as string | undefined;
    if (sourceApp && (VALID_SOURCE_APPS as readonly string[]).includes(sourceApp)) {
      conditions.push(eq(errorReportsTable.sourceApp, sourceApp as SourceApp));
    }

    const severity = req.query["severity"] as string | undefined;
    if (severity && (VALID_SEVERITIES as readonly string[]).includes(severity)) {
      conditions.push(
        eq(errorReportsTable.severity, severity as (typeof VALID_SEVERITIES)[number])
      );
    }

    const statusParam = req.query["status"];
    const statusValues = (
      Array.isArray(statusParam) ? statusParam : statusParam ? [statusParam] : []
    ) as string[];
    const validStatusValues = statusValues.filter((s) =>
      (VALID_STATUSES as readonly string[]).includes(s)
    ) as (typeof VALID_STATUSES)[number][];
    if (validStatusValues.length === 1) {
      conditions.push(eq(errorReportsTable.status, validStatusValues[0]!));
    } else if (validStatusValues.length > 1) {
      conditions.push(inArray(errorReportsTable.status, validStatusValues));
    }

    const errorType = req.query["errorType"] as string | undefined;
    if (errorType && (VALID_ERROR_TYPES as readonly string[]).includes(errorType)) {
      conditions.push(eq(errorReportsTable.errorType, errorType as ErrorType));
    }

    const dateFrom = req.query["dateFrom"] as string;
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) conditions.push(gte(errorReportsTable.timestamp, d));
    }

    const dateTo = req.query["dateTo"] as string;
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) conditions.push(lte(errorReportsTable.timestamp, d));
    }

    const resolutionMethod = req.query["resolutionMethod"] as string | undefined;
    if (
      resolutionMethod &&
      ["manual", "auto_resolved", "task_created"].includes(resolutionMethod)
    ) {
      conditions.push(
        eq(
          errorReportsTable.resolutionMethod,
          resolutionMethod as "manual" | "auto_resolved" | "task_created"
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [reports, [totalRow]] = await Promise.all([
      db
        .select()
        .from(errorReportsTable)
        .where(where)
        .orderBy(desc(errorReportsTable.timestamp))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(errorReportsTable).where(where),
    ]);

    const total = totalRow?.count ?? 0;

    const reportIds = reports.map((r) => r.id);
    let backupSet = new Set<string>();
    if (reportIds.length > 0) {
      const backups = await db
        .select({ errorReportId: errorResolutionBackupsTable.errorReportId })
        .from(errorResolutionBackupsTable)
        .where(
          and(
            inArray(errorResolutionBackupsTable.errorReportId, reportIds),
            gte(errorResolutionBackupsTable.expiresAt, new Date())
          )
        );
      backupSet = new Set(backups.map((b) => b.errorReportId));
    }

    sendSuccess(res, {
      reports: reports.map((r) => ({
        ...r,
        timestamp: r.timestamp.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() || null,
        acknowledgedAt: r.acknowledgedAt?.toISOString() || null,
        updatedAt: r.updatedAt?.toISOString() || null,
        hasBackup: backupSet.has(r.id),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch error reports");
    sendError(res, "Failed to fetch error reports", 500);
  }
});

router.get("/new-count", adminAuth, async (_req, res) => {
  try {
    const [row] = await db
      .select({ count: count() })
      .from(errorReportsTable)
      .where(eq(errorReportsTable.status, "new"));
    sendSuccess(res, { count: row?.count ?? 0 });
  } catch (err) {
    logger.error({ err }, "Failed to fetch new error count");
    sendError(res, "Failed to fetch new error count", 500);
  }
});

router.post("/bulk-resolve", adminAuth, async (req, res) => {
  try {
    const { sourceApp, severity, errorType, statusFilter } = req.body as {
      sourceApp?: string;
      severity?: string;
      errorType?: string;
      statusFilter?: string[];
    };

    const conditions: SQL[] = [];

    if (sourceApp && (VALID_SOURCE_APPS as readonly string[]).includes(sourceApp)) {
      conditions.push(eq(errorReportsTable.sourceApp, sourceApp as SourceApp));
    }
    if (severity && (VALID_SEVERITIES as readonly string[]).includes(severity)) {
      conditions.push(
        eq(errorReportsTable.severity, severity as (typeof VALID_SEVERITIES)[number])
      );
    }
    if (errorType && (VALID_ERROR_TYPES as readonly string[]).includes(errorType)) {
      conditions.push(eq(errorReportsTable.errorType, errorType as ErrorType));
    }

    if (statusFilter && statusFilter.length > 0) {
      const validStatuses = statusFilter.filter((s) =>
        (VALID_STATUSES as readonly string[]).includes(s)
      );
      if (validStatuses.length > 0) {
        conditions.push(
          inArray(errorReportsTable.status, validStatuses as (typeof VALID_STATUSES)[number][])
        );
      }
    } else {
      conditions.push(ne(errorReportsTable.status, "resolved"));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const toResolve = await db.select().from(errorReportsTable).where(where).limit(200);

    const now = new Date();
    if (toResolve.length > 0) {
      await db.insert(errorResolutionBackupsTable).values(
        toResolve.map((report) => ({
          id: generateId(),
          errorReportId: report.id,
          previousStatus: report.status,
          previousData: {
            status: report.status,
            resolvedAt: report.resolvedAt?.toISOString() || null,
            acknowledgedAt: report.acknowledgedAt?.toISOString() || null,
            resolutionMethod: report.resolutionMethod || null,
            resolutionNotes: report.resolutionNotes || null,
            rootCause: report.rootCause || null,
          },
          resolutionMethod: "manual" as const,
          expiresAt: new Date(Date.now() + BACKUP_TTL_MS),
        }))
      );
    }

    const resolveIds = toResolve.map((r) => r.id);
    if (resolveIds.length > 0) {
      await db
        .update(errorReportsTable)
        .set({ status: "resolved", resolvedAt: now, resolutionMethod: "manual", updatedAt: now })
        .where(inArray(errorReportsTable.id, resolveIds));
    }

    sendSuccess(res, { resolvedCount: resolveIds.length });
  } catch (err) {
    logger.error({ err }, "Failed to bulk resolve error reports");
    sendError(res, "Failed to bulk resolve error reports", 500);
  }
});

router.post("/scan", adminAuth, async (req, res) => {
  try {
    const startedAt = new Date();
    const findings: Array<{ type: string; severity: string; message: string; detail: string }> = [];

    const oneHourAgo = new Date(Date.now() - 3600000);
    const oneDayAgo = new Date(Date.now() - 86400000);

    const [[dbCheck], criticalLastHour, unresolvedCritical, errorsByType, [totalUnresolved]] =
      await Promise.all([
        db
          .select({ now: sql<string>`now()` })
          .from(errorReportsTable)
          .limit(1),
        db
          .select({ count: count() })
          .from(errorReportsTable)
          .where(
            and(
              eq(errorReportsTable.severity, "critical"),
              gte(errorReportsTable.timestamp, oneHourAgo)
            )
          ),
        db
          .select({ count: count() })
          .from(errorReportsTable)
          .where(
            and(
              eq(errorReportsTable.severity, "critical"),
              ne(errorReportsTable.status, "resolved")
            )
          ),
        db
          .select({ errorType: errorReportsTable.errorType, count: count() })
          .from(errorReportsTable)
          .where(gte(errorReportsTable.timestamp, oneDayAgo))
          .groupBy(errorReportsTable.errorType)
          .orderBy(desc(count())),
        db
          .select({ count: count() })
          .from(errorReportsTable)
          .where(ne(errorReportsTable.status, "resolved")),
      ]);

    const dbOk = !!dbCheck;
    if (!dbOk) {
      findings.push({
        type: "db_health",
        severity: "critical",
        message: "Database connectivity failure",
        detail: "Unable to reach the database. All data operations are at risk.",
      });
    } else {
      findings.push({
        type: "db_health",
        severity: "ok",
        message: "Database is healthy",
        detail: "Connection confirmed and responding normally.",
      });
    }

    const criticalCount = criticalLastHour[0]?.count ?? 0;
    if (criticalCount >= 10) {
      findings.push({
        type: "critical_spike",
        severity: "critical",
        message: `Critical error spike: ${criticalCount} critical errors in the last hour`,
        detail: "High volume of critical errors detected. Immediate investigation recommended.",
      });
    } else if (criticalCount >= 3) {
      findings.push({
        type: "critical_spike",
        severity: "medium",
        message: `Elevated critical errors: ${criticalCount} in the last hour`,
        detail: "Multiple critical errors detected in a short window. Monitor closely.",
      });
    }

    const unresolvedCrit = unresolvedCritical[0]?.count ?? 0;
    if (unresolvedCrit > 0) {
      findings.push({
        type: "unresolved_critical",
        severity: "critical",
        message: `${unresolvedCrit} unresolved critical error${unresolvedCrit > 1 ? "s" : ""}`,
        detail: "Critical errors that have not been resolved. Users may currently be affected.",
      });
    }

    for (const row of errorsByType) {
      const cnt = row.count ?? 0;
      if (cnt >= 20) {
        findings.push({
          type: "error_type_spike",
          severity: "medium",
          message: `High ${row.errorType.replace(/_/g, " ")} frequency: ${cnt} in 24h`,
          detail: `This error type is occurring frequently. Consider a systemic fix.`,
        });
      }
    }

    const totalUnres = totalUnresolved?.count ?? 0;
    if (totalUnres >= 50) {
      findings.push({
        type: "backlog_alert",
        severity: "medium",
        message: `Error backlog: ${totalUnres} unresolved errors`,
        detail: "Large number of unresolved errors accumulating. Review and triage recommended.",
      });
    }

    const customerReportCount = await db
      .select({ count: count() })
      .from(customerErrorReportsTable)
      .where(eq(customerErrorReportsTable.status, "new"));

    const custCount = customerReportCount[0]?.count ?? 0;
    if (custCount > 0) {
      findings.push({
        type: "customer_reports",
        severity: custCount >= 5 ? "medium" : "minor",
        message: `${custCount} unreviewed customer report${custCount > 1 ? "s" : ""}`,
        detail: "Customers have submitted bug reports awaiting admin review.",
      });
    }

    const durationMs = Date.now() - startedAt.getTime();
    const overallSeverity = findings.some((f) => f.severity === "critical")
      ? "critical"
      : findings.some((f) => f.severity === "medium")
        ? "medium"
        : "ok";

    sendSuccess(res, {
      scannedAt: startedAt.toISOString(),
      durationMs,
      overallSeverity,
      totalUnresolved: totalUnres,
      criticalLastHour: criticalCount,
      unresolvedCritical: unresolvedCrit,
      customerReportsPending: custCount,
      findings,
    });
  } catch (err) {
    logger.error({ err }, "Scan failed");
    sendError(res, "Scan failed", 500);
  }
});

const STATUS_TRANSITIONS: Record<string, string> = {
  new: "acknowledged",
  acknowledged: "in_progress",
  in_progress: "resolved",
};

const updateStatusSchema = z.object({
  status: z.enum(VALID_STATUSES),
});

router.patch("/:id", adminAuth, validateBody(updateStatusSchema), async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { status: newStatus } = req.body;

    const [existing] = await db
      .select()
      .from(errorReportsTable)
      .where(eq(errorReportsTable.id, id!))
      .limit(1);

    if (!existing) {
      sendNotFound(res, "Error report not found");
      return;
    }

    const allowedNext = STATUS_TRANSITIONS[existing.status];
    if (newStatus !== allowedNext) {
      sendError(
        res,
        `Invalid transition: cannot move from '${existing.status}' to '${newStatus}'. Expected next step: '${allowedNext ?? "none (already resolved)"}'.`,
        400
      );
      return;
    }

    const now = new Date();
    const updates: Record<string, unknown> = { status: newStatus, updatedAt: now };
    if (newStatus === "acknowledged") {
      updates.acknowledgedAt = now;
    } else if (newStatus === "resolved") {
      updates.resolvedAt = now;
      updates.resolutionMethod = "manual";

      const backupId = generateId();
      await db.insert(errorResolutionBackupsTable).values({
        id: backupId,
        errorReportId: id!,
        previousStatus: existing.status,
        previousData: {
          status: existing.status,
          resolvedAt: existing.resolvedAt?.toISOString() || null,
          acknowledgedAt: existing.acknowledgedAt?.toISOString() || null,
          resolutionMethod: existing.resolutionMethod || null,
          resolutionNotes: existing.resolutionNotes || null,
          rootCause: existing.rootCause || null,
        },
        resolutionMethod: "manual",
        expiresAt: new Date(Date.now() + BACKUP_TTL_MS),
      });
    }

    const [updated] = await db
      .update(errorReportsTable)
      .set(updates)
      .where(eq(errorReportsTable.id, id!))
      .returning();

    if (!updated) {
      sendNotFound(res, "Error report not found");
      return;
    }

    sendSuccess(res, {
      ...updated,
      timestamp: updated.timestamp.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() || null,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
      updatedAt: updated.updatedAt?.toISOString() || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to update error report");
    sendError(res, "Failed to update error report", 500);
  }
});

const customerReportSchema = z.object({
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().max(30).optional(),
  userId: z.string().optional(),
  appVersion: z.string().max(50).optional(),
  deviceInfo: z.string().max(500).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
  screen: z.string().max(200).optional(),
  description: z.string().min(5).max(5000),
  reproSteps: z.string().max(5000).optional(),
});

router.post("/customer-report", validateBody(customerReportSchema), async (req, res) => {
  try {
    const body = req.body;
    const id = generateId();
    const [report] = await db
      .insert(customerErrorReportsTable)
      .values({
        id,
        customerName: body.customerName,
        customerEmail: body.customerEmail || null,
        customerPhone: body.customerPhone || null,
        userId: body.userId || null,
        appVersion: body.appVersion || null,
        deviceInfo: body.deviceInfo || null,
        platform: body.platform || null,
        screen: body.screen || null,
        description: body.description,
        reproSteps: body.reproSteps || null,
      })
      .returning();

    sendSuccess(res, { id: report.id, message: "Report submitted successfully" }, undefined, 201);
  } catch (err) {
    logger.error({ err }, "Failed to submit customer report");
    sendError(res, "Failed to submit customer error report", 500);
  }
});

router.get("/customer-reports", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query["page"] || "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "30"))));
    const offset = (page - 1) * limit;

    const statusParam = req.query["status"] as string | undefined;
    const conditions: SQL[] = [];
    if (statusParam && ["new", "reviewed", "closed"].includes(statusParam)) {
      conditions.push(
        eq(customerErrorReportsTable.status, statusParam as "new" | "reviewed" | "closed")
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [reports, [totalRow]] = await Promise.all([
      db
        .select()
        .from(customerErrorReportsTable)
        .where(where)
        .orderBy(desc(customerErrorReportsTable.timestamp))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(customerErrorReportsTable).where(where),
    ]);

    const total = totalRow?.count ?? 0;
    sendSuccess(res, {
      reports: reports.map((r) => ({
        ...r,
        timestamp: r.timestamp.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() || null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch customer reports");
    sendError(res, "Failed to fetch customer reports", 500);
  }
});

const updateCustomerReportSchema = z.object({
  status: z.enum(["new", "reviewed", "closed"]).optional(),
  adminNote: z.string().max(2000).optional(),
});

router.patch(
  "/customer-reports/:id",
  adminAuth,
  validateBody(updateCustomerReportSchema),
  async (req, res) => {
    try {
      const { id } = req.params as Record<string, string>;
      const body = req.body;

      const updates: Record<string, unknown> = {};
      if (body.status) {
        updates.status = body.status;
        if (body.status === "reviewed" || body.status === "closed") {
          updates.reviewedAt = new Date();
        }
      }
      if (body.adminNote !== undefined) {
        updates.adminNote = body.adminNote;
      }

      if (Object.keys(updates).length === 0) {
        sendValidationError(res, "No fields to update");
        return;
      }

      const [updated] = await db
        .update(customerErrorReportsTable)
        .set(updates)
        .where(eq(customerErrorReportsTable.id, id!))
        .returning();

      if (!updated) {
        sendNotFound(res, "Customer report not found");
        return;
      }

      sendSuccess(res, {
        ...updated,
        timestamp: updated.timestamp.toISOString(),
        reviewedAt: updated.reviewedAt?.toISOString() || null,
      });
    } catch (err) {
      logger.error({ err }, "Failed to update customer report");
      sendError(res, "Failed to update customer report", 500);
    }
  }
);

const BACKUP_TTL_MS = 72 * 60 * 60 * 1000;

let _onSettingsChanged: (() => void) | null = null;
export function setOnAutoResolveSettingsChanged(cb: () => void) {
  _onSettingsChanged = cb;
}

const resolveSchema = z.object({
  method: z.enum(["manual", "auto_resolved", "task_created"]),
  resolutionNotes: z.string().max(5000).optional(),
  rootCause: z.string().max(2000).optional(),
});

router.post("/:id/resolve", adminAuth, validateBody(resolveSchema), async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { method, resolutionNotes, rootCause } = req.body;

    const [existing] = await db
      .select()
      .from(errorReportsTable)
      .where(eq(errorReportsTable.id, id!))
      .limit(1);

    if (!existing) {
      sendNotFound(res, "Error report not found");
      return;
    }

    if (existing.status === "resolved") {
      sendError(res, "Error is already resolved", 400);
      return;
    }

    const backupId = generateId();
    await db.insert(errorResolutionBackupsTable).values({
      id: backupId,
      errorReportId: id!,
      previousStatus: existing.status,
      previousData: {
        status: existing.status,
        resolvedAt: existing.resolvedAt?.toISOString() || null,
        acknowledgedAt: existing.acknowledgedAt?.toISOString() || null,
        resolutionMethod: existing.resolutionMethod || null,
        resolutionNotes: existing.resolutionNotes || null,
        rootCause: existing.rootCause || null,
      },
      resolutionMethod: method,
      expiresAt: new Date(Date.now() + BACKUP_TTL_MS),
    });

    const now = new Date();
    const [updated] = await db
      .update(errorReportsTable)
      .set({
        status: "resolved",
        resolvedAt: now,
        resolutionMethod: method,
        resolutionNotes: resolutionNotes || null,
        rootCause: rootCause || null,
        updatedAt: now,
      })
      .where(eq(errorReportsTable.id, id!))
      .returning();

    if (!updated) {
      sendNotFound(res, "Error report not found");
      return;
    }

    sendSuccess(res, {
      ...updated,
      timestamp: updated.timestamp.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() || null,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
      updatedAt: updated.updatedAt?.toISOString() || null,
      backupId,
    });
  } catch (err) {
    logger.error({ err }, "Failed to resolve error report");
    sendError(res, "Failed to resolve error report", 500);
  }
});

router.post("/:id/undo", adminAuth, async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    const [backup] = await db
      .select()
      .from(errorResolutionBackupsTable)
      .where(
        and(
          eq(errorResolutionBackupsTable.errorReportId, id!),
          gte(errorResolutionBackupsTable.expiresAt, new Date())
        )
      )
      .orderBy(desc(errorResolutionBackupsTable.createdAt))
      .limit(1);

    if (!backup) {
      sendNotFound(res, "No backup found or backup has expired for this error report");
      return;
    }

    const prevData = backup.previousData as Record<string, unknown>;
    const now = new Date();

    const [updated] = await db
      .update(errorReportsTable)
      .set({
        status: prevData.status as string as "new" | "acknowledged" | "in_progress" | "resolved",
        resolvedAt: prevData.resolvedAt ? new Date(prevData.resolvedAt as string) : null,
        acknowledgedAt: prevData.acknowledgedAt
          ? new Date(prevData.acknowledgedAt as string)
          : null,
        resolutionMethod: prevData.resolutionMethod as string | null as
          | "manual"
          | "auto_resolved"
          | "task_created"
          | null,
        resolutionNotes: (prevData.resolutionNotes as string | null) || null,
        rootCause: (prevData.rootCause as string | null) || null,
        updatedAt: now,
      })
      .where(eq(errorReportsTable.id, id!))
      .returning();

    await db
      .delete(errorResolutionBackupsTable)
      .where(eq(errorResolutionBackupsTable.id, backup.id));

    if (!updated) {
      sendNotFound(res, "Error report not found");
      return;
    }

    sendSuccess(res, {
      ...updated,
      timestamp: updated.timestamp.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() || null,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
      updatedAt: updated.updatedAt?.toISOString() || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to undo error resolution");
    sendError(res, "Failed to undo error resolution", 500);
  }
});

router.get("/:id/backup", adminAuth, async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [backup] = await db
      .select()
      .from(errorResolutionBackupsTable)
      .where(
        and(
          eq(errorResolutionBackupsTable.errorReportId, id!),
          gte(errorResolutionBackupsTable.expiresAt, new Date())
        )
      )
      .orderBy(desc(errorResolutionBackupsTable.createdAt))
      .limit(1);

    sendSuccess(res, {
      hasBackup: !!backup,
      backup: backup
        ? {
            id: backup.id,
            previousStatus: backup.previousStatus,
            resolutionMethod: backup.resolutionMethod,
            createdAt: backup.createdAt.toISOString(),
            expiresAt: backup.expiresAt.toISOString(),
          }
        : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to check backup");
    sendError(res, "Failed to check backup", 500);
  }
});

router.delete("/backups/cleanup", adminAuth, async (_req, res) => {
  try {
    const now = new Date();
    const expired = await db
      .select({
        id: errorResolutionBackupsTable.id,
        errorReportId: errorResolutionBackupsTable.errorReportId,
      })
      .from(errorResolutionBackupsTable)
      .where(lt(errorResolutionBackupsTable.expiresAt, now));

    let deletedCount = 0;
    if (expired.length > 0) {
      const reportIds = [...new Set(expired.map((b) => b.errorReportId))];
      const resolvedReports = await db
        .select({ id: errorReportsTable.id })
        .from(errorReportsTable)
        .where(
          and(inArray(errorReportsTable.id, reportIds), eq(errorReportsTable.status, "resolved"))
        );
      const resolvedSet = new Set(resolvedReports.map((r) => r.id));
      const toDelete = expired.filter((b) => resolvedSet.has(b.errorReportId)).map((b) => b.id);
      if (toDelete.length > 0) {
        await db
          .delete(errorResolutionBackupsTable)
          .where(inArray(errorResolutionBackupsTable.id, toDelete));
        deletedCount = toDelete.length;
      }
    }

    sendSuccess(res, { deletedCount });
  } catch (err) {
    logger.error({ err }, "Failed to cleanup backups");
    sendError(res, "Failed to cleanup backups", 500);
  }
});

export async function cleanupExpiredBackups() {
  try {
    const now = new Date();
    const expired = await db
      .select({
        id: errorResolutionBackupsTable.id,
        errorReportId: errorResolutionBackupsTable.errorReportId,
      })
      .from(errorResolutionBackupsTable)
      .where(lt(errorResolutionBackupsTable.expiresAt, now));

    if (expired.length === 0) return;

    const reportIds = [...new Set(expired.map((b) => b.errorReportId))];
    const resolvedReports = await db
      .select({ id: errorReportsTable.id })
      .from(errorReportsTable)
      .where(
        and(inArray(errorReportsTable.id, reportIds), eq(errorReportsTable.status, "resolved"))
      );
    const resolvedSet = new Set(resolvedReports.map((r) => r.id));

    const toDelete = expired.filter((b) => resolvedSet.has(b.errorReportId)).map((b) => b.id);
    if (toDelete.length > 0) {
      await db
        .delete(errorResolutionBackupsTable)
        .where(inArray(errorResolutionBackupsTable.id, toDelete));
      logger.info(
        { count: toDelete.length },
        "Cleaned up expired resolution backups for resolved errors"
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to cleanup expired backups");
  }
}

const DEFAULT_AUTO_RESOLVE_SETTINGS = {
  enabled: false,
  severities: ["minor"],
  errorTypes: [] as string[],
  duplicateDetection: true,
  ageThresholdMinutes: 30,
  intervalMs: 300000,
};

export async function getAutoResolveSettings() {
  try {
    const [row] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "auto_resolve_settings"));
    if (row) {
      try {
        return { ...DEFAULT_AUTO_RESOLVE_SETTINGS, ...JSON.parse(row.value) };
      } catch (err) {
        logger.error(
          {
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          },
          "[route] unhandled error"
        );
        return { ...DEFAULT_AUTO_RESOLVE_SETTINGS };
      }
    }
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[error-reports] auto-resolve settings DB read failed — using defaults"
    );
  }
  return { ...DEFAULT_AUTO_RESOLVE_SETTINGS };
}

router.get("/auto-resolve-settings", adminAuth, async (_req, res) => {
  try {
    const settings = await getAutoResolveSettings();
    sendSuccess(res, settings);
  } catch (err) {
    logger.error({ err }, "Failed to get auto-resolve settings");
    sendError(res, "Failed to get auto-resolve settings", 500);
  }
});

const autoResolveSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  severities: z.array(z.string()).optional(),
  errorTypes: z.array(z.string()).optional(),
  duplicateDetection: z.boolean().optional(),
  ageThresholdMinutes: z.number().min(1).max(1440).optional(),
  intervalMs: z.number().min(30000).max(3600000).optional(),
});

router.put(
  "/auto-resolve-settings",
  adminAuth,
  validateBody(autoResolveSettingsSchema),
  async (req, res) => {
    try {
      const current = await getAutoResolveSettings();
      const updated = { ...current, ...req.body };

      await db
        .insert(platformSettingsTable)
        .values({
          key: "auto_resolve_settings",
          value: JSON.stringify(updated),
          label: "Auto-Resolve Engine Settings",
          category: "error_monitor",
        })
        .onConflictDoUpdate({
          target: platformSettingsTable.key,
          set: { value: JSON.stringify(updated), updatedAt: new Date() },
        });

      if (_onSettingsChanged) _onSettingsChanged();
      sendSuccess(res, updated);
    } catch (err) {
      logger.error({ err }, "Failed to update auto-resolve settings");
      sendError(res, "Failed to update auto-resolve settings", 500);
    }
  }
);

export async function runAutoResolve() {
  try {
    const settings = await getAutoResolveSettings();
    if (!settings.enabled) return { resolved: 0, logs: [] };

    const conditions: SQL[] = [ne(errorReportsTable.status, "resolved")];

    if (settings.severities.length > 0) {
      conditions.push(inArray(errorReportsTable.severity, settings.severities));
    }
    if (settings.errorTypes.length > 0) {
      conditions.push(inArray(errorReportsTable.errorType, settings.errorTypes));
    }
    if (settings.ageThresholdMinutes > 0) {
      const cutoff = new Date(Date.now() - settings.ageThresholdMinutes * 60 * 1000);
      conditions.push(lte(errorReportsTable.timestamp, cutoff));
    }

    const candidates = await db
      .select()
      .from(errorReportsTable)
      .where(and(...conditions))
      .orderBy(desc(errorReportsTable.timestamp))
      .limit(50);

    let resolvedAlready: Set<string> = new Set();
    if (settings.duplicateDetection && candidates.length > 0) {
      const candidateHashes = candidates.flatMap((c) => (c.errorHash ? [c.errorHash] : []));
      if (candidateHashes.length > 0) {
        const resolvedHashRows = await db
          .select({
            errorHash: errorReportsTable.errorHash,
          })
          .from(errorReportsTable)
          .where(
            and(
              eq(errorReportsTable.status, "resolved"),
              inArray(errorReportsTable.errorHash, candidateHashes)
            )
          );
        resolvedAlready = new Set(
          resolvedHashRows.flatMap((r) => (r.errorHash ? [r.errorHash] : []))
        );
      }
    }

    const now = new Date();
    const toResolve: Array<{
      candidate: (typeof candidates)[0];
      reason: string;
      ruleMatched: string;
    }> = [];

    for (const candidate of candidates) {
      let reason = "";
      let ruleMatched = "";

      if (
        settings.duplicateDetection &&
        candidate.errorHash &&
        resolvedAlready.has(candidate.errorHash)
      ) {
        reason = `Duplicate of previously resolved error`;
        ruleMatched = "duplicate_detection";
      } else if (settings.severities.includes(candidate.severity)) {
        reason = `Severity "${candidate.severity}" matches auto-resolve filter`;
        ruleMatched = "severity_filter";
      } else if (
        settings.errorTypes.length > 0 &&
        settings.errorTypes.includes(candidate.errorType)
      ) {
        reason = `Error type "${candidate.errorType}" matches auto-resolve filter`;
        ruleMatched = "error_type_filter";
      } else {
        continue;
      }

      toResolve.push({ candidate, reason, ruleMatched });
    }

    if (toResolve.length > 0) {
      await db.insert(errorResolutionBackupsTable).values(
        toResolve.map(({ candidate }) => ({
          id: generateId(),
          errorReportId: candidate.id,
          previousStatus: candidate.status,
          previousData: {
            status: candidate.status,
            resolvedAt: candidate.resolvedAt?.toISOString() || null,
            acknowledgedAt: candidate.acknowledgedAt?.toISOString() || null,
            resolutionMethod: candidate.resolutionMethod || null,
            resolutionNotes: candidate.resolutionNotes || null,
            rootCause: candidate.rootCause || null,
          },
          resolutionMethod: "auto_resolved" as const,
          expiresAt: new Date(Date.now() + BACKUP_TTL_MS),
        }))
      );

      await Promise.all(
        toResolve.map(({ candidate, reason }) =>
          db
            .update(errorReportsTable)
            .set({
              status: "resolved",
              resolvedAt: now,
              resolutionMethod: "auto_resolved",
              resolutionNotes: reason,
              updatedAt: now,
            })
            .where(eq(errorReportsTable.id, candidate.id))
        )
      );

      await db.insert(autoResolveLogTable).values(
        toResolve.map(({ candidate, reason, ruleMatched }) => ({
          id: generateId(),
          errorReportId: candidate.id,
          reason,
          ruleMatched,
        }))
      );
    }

    const logs = toResolve.map(({ candidate, reason, ruleMatched }) => ({
      errorReportId: candidate.id,
      reason,
      ruleMatched,
    }));

    if (logs.length > 0) {
      logger.info({ count: logs.length }, "Auto-resolve pass completed");
    }

    return { resolved: logs.length, logs };
  } catch (err) {
    logger.error({ err }, "Auto-resolve run failed");
    return { resolved: 0, logs: [], error: "Auto-resolve run failed" };
  }
}

router.post("/auto-resolve-run", adminAuth, async (_req, res) => {
  try {
    const result = await runAutoResolve();
    sendSuccess(res, result);
  } catch (err) {
    logger.error({ err }, "Failed to run auto-resolve");
    sendError(res, "Failed to run auto-resolve", 500);
  }
});

/* ── Gemini AI-powered error analysis (with rule-based fallback) ──────── */
router.post("/:id/ai-analyze", adminAuth, async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [report] = await db
      .select()
      .from(errorReportsTable)
      .where(eq(errorReportsTable.id, id!))
      .limit(1);

    if (!report) {
      sendNotFound(res, "Error report not found");
      return;
    }

    const baseUrl = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
    const apiKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];

    /* ── Gemini primary ────────────────────────────────────────────────── */
    if (baseUrl && apiKey) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } });

        const prompt = `You are a senior software engineer analyzing a production error. Return valid JSON only — NO markdown, NO code fences.

Error Details:
- Type: ${report.errorType}
- Severity: ${report.severity}
- Source App: ${report.sourceApp}
- Error Message: ${report.errorMessage}
- Module: ${report.moduleName ?? "N/A"}
- Function: ${report.functionName ?? "N/A"}
- Stack Trace: ${(report.stackTrace ?? "N/A").slice(0, 2000)}

Return this JSON structure:
{
  "rootCause": "1-3 sentence root cause analysis",
  "fixSteps": ["Step 1", "Step 2", "Step 3"],
  "impactAssessment": "Impact if left unresolved",
  "confidence": 0.0,
  "autoResolvable": false,
  "preventionTips": ["Tip 1", "Tip 2"]
}`;

        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { maxOutputTokens: 1024, responseMimeType: "application/json" },
        });

        const text = response.text ?? "{}";
        const parsed = JSON.parse(text) as {
          rootCause?: string;
          fixSteps?: string[];
          impactAssessment?: string;
          confidence?: number;
          autoResolvable?: boolean;
          preventionTips?: string[];
        };

        if (parsed.rootCause) {
          await db
            .update(errorReportsTable)
            .set({ rootCause: parsed.rootCause, updatedAt: new Date() })
            .where(eq(errorReportsTable.id, id!));
          return sendSuccess(res, { ...parsed, fallback: false, errorId: id });
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "Gemini analysis failed — switching to rule-based fallback");
      }
    }

    /* ── Rule-based fallback ───────────────────────────────────────────── */
    const rca = analyzeErrorCauseServer(report.errorType, report.errorMessage);
    return sendSuccess(res, {
      rootCause: rca.causes.join("; ") || "Root cause could not be determined automatically.",
      fixSteps: rca.fixes,
      impactAssessment:
        rca.consequences.join("; ") || report.shortImpact || "Investigate for user impact.",
      confidence: 0.4,
      autoResolvable: false,
      preventionTips: [],
      fallback: true,
      errorId: id,
    });
  } catch (err) {
    logger.error({ err }, "AI analyze failed");
    sendError(res, "AI analysis failed", 500);
  }
});

router.get("/auto-resolve-log", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"))));
    const logs = await db
      .select()
      .from(autoResolveLogTable)
      .orderBy(desc(autoResolveLogTable.createdAt))
      .limit(limit);

    sendSuccess(
      res,
      logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "Failed to fetch auto-resolve log");
    sendError(res, "Failed to fetch auto-resolve log", 500);
  }
});

function analyzeErrorCauseServer(
  errorType: string,
  errorMessage: string
): { causes: string[]; consequences: string[]; fixes: string[] } {
  const msg = (errorMessage || "").toLowerCase();
  const causes: string[] = [];
  const consequences: string[] = [];
  const fixes: string[] = [];

  switch (errorType) {
    case "db_error":
      causes.push("Database connection pool exhausted or timed out");
      causes.push("Invalid SQL query or schema mismatch after migration");
      consequences.push("Users cannot place orders, make payments, or read data");
      consequences.push("Background jobs that write to DB will fail silently");
      fixes.push("Check database server health and connection pool settings");
      fixes.push("Review recent schema migrations for conflicts");
      break;
    case "frontend_crash":
      causes.push("Unhandled null/undefined reference inside a React component");
      causes.push("Incompatible or unexpected shape of API response data");
      consequences.push("User sees a blank white screen and cannot continue");
      consequences.push("Potential loss of unsaved user input or cart items");
      fixes.push("Wrap risky components in React Error Boundaries");
      fixes.push("Add optional chaining and null checks before rendering");
      break;
    case "api_error":
      causes.push("Third-party service or microservice is unavailable");
      causes.push("Unhandled exception in server-side route handler");
      consequences.push("Feature or page the user was using becomes unavailable");
      consequences.push("Failed API calls may leave the UI in a broken loading state");
      fixes.push("Add proper try/catch in all route handlers");
      fixes.push("Implement retry logic with exponential backoff on the client");
      break;
    case "route_error":
      causes.push("Route handler threw an unhandled exception");
      causes.push("Middleware blocking request before it reaches handler");
      consequences.push("Endpoint is completely down for all users");
      fixes.push("Check the route registration and middleware order");
      fixes.push("Add global error handler middleware");
      break;
    case "ui_error":
      causes.push("CSS/style conflict causing layout to break");
      causes.push("Component receiving wrong prop types");
      consequences.push("UI elements overlap, disappear, or display incorrectly");
      fixes.push("Inspect component props and validate at runtime");
      fixes.push("Use browser DevTools to identify style conflicts");
      break;
    case "unhandled_exception":
      causes.push("Code path missing error handling");
      causes.push("Async operation without proper catch/rejection handler");
      consequences.push("App may crash or behave unpredictably");
      fixes.push("Add global unhandled rejection and uncaught exception handlers");
      fixes.push("Review async code paths for missing try/catch blocks");
      break;
  }

  if (msg.includes("auth") || msg.includes("token") || msg.includes("session")) {
    causes.push("Authentication token expired or invalid");
    fixes.push("Check token refresh logic and session management");
  }
  if (msg.includes("payment") || msg.includes("stripe") || msg.includes("transaction")) {
    causes.push("Payment gateway connectivity or configuration issue");
    fixes.push("Verify payment gateway credentials and webhook configuration");
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    causes.push("Network timeout or slow external dependency");
    fixes.push("Increase timeout thresholds or add circuit breaker pattern");
  }

  return { causes, consequences, fixes };
}

/* ── Helpers ───────────────────────────────────────────────────────────── */
function extractFileReferences(stackTrace: string): Array<{ file: string; line: number }> {
  const refs: Array<{ file: string; line: number }> = [];
  if (!stackTrace) return refs;
  // Match patterns like: at fn (src/routes/foo.ts:42:10) or src/routes/foo.ts:42
  const re = /(?:at\s+\S+\s+\()?([^\s()\n]+\.(ts|tsx|js|mjs)):(\d+)/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(stackTrace)) != null) {
    const file = m[1]!;
    const line = parseInt(m[3]!, 10);
    const key = `${file}:${line}`;
    if (!seen.has(key) && refs.length < 10) {
      seen.add(key);
      refs.push({ file, line });
    }
  }
  return refs;
}

function buildSingleTaskPlan(report: typeof errorReportsTable.$inferSelect): {
  markdown: string;
  fileReferences: Array<{ file: string; line: number }>;
} {
  const severityLabel = report.severity.toUpperCase();
  const typeLabel = report.errorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const sourceLabel =
    report.sourceApp === "api"
      ? "API Server"
      : report.sourceApp.charAt(0).toUpperCase() + report.sourceApp.slice(1);
  const fileReferences = extractFileReferences(report.stackTrace ?? "");

  const lines = [
    `# Bug Fix Task: ${typeLabel}`,
    ``,
    `> **For developer or AI agent** — this plan contains all context needed to reproduce, diagnose, and fix the issue.`,
    ``,
    `## Summary`,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Error ID | \`${report.id}\` |`,
    `| Severity | **${severityLabel}** |`,
    `| Source App | ${sourceLabel} |`,
    `| Error Type | ${typeLabel} |`,
    `| Occurrences | ${report.occurrenceCount ?? 1} |`,
    `| First Seen | ${report.timestamp.toISOString()} |`,
    `| Status | ${report.status} |`,
  ];
  if (report.moduleName) lines.push(`| Module | \`${report.moduleName}\` |`);
  if (report.functionName) lines.push(`| Function | \`${report.functionName}\` |`);
  if (report.componentName) lines.push(`| Component | \`${report.componentName}\` |`);
  lines.push(``);

  lines.push(`## Error Message`);
  lines.push(`\`\`\``);
  lines.push(report.errorMessage);
  lines.push(`\`\`\``);
  lines.push(``);

  if (report.shortImpact) {
    lines.push(`## User Impact`);
    lines.push(report.shortImpact);
    lines.push(``);
  }

  if (fileReferences.length > 0) {
    lines.push(`## Files to Investigate`);
    fileReferences.forEach((ref) => lines.push(`- \`${ref.file}\` — line ${ref.line}`));
    lines.push(``);
  }

  if (report.stackTrace) {
    lines.push(`## Stack Trace`);
    lines.push(`\`\`\``);
    lines.push(report.stackTrace.slice(0, 4000));
    lines.push(`\`\`\``);
    lines.push(``);
  }

  if (report.metadata && Object.keys(report.metadata as object).length > 0) {
    lines.push(`## Metadata`);
    lines.push(`\`\`\`json`);
    lines.push(JSON.stringify(report.metadata, null, 2).slice(0, 1000));
    lines.push(`\`\`\``);
    lines.push(``);
  }

  const rca = analyzeErrorCauseServer(report.errorType, report.errorMessage);
  if (rca.causes.length > 0) {
    lines.push(`## Likely Root Causes`);
    rca.causes.forEach((c) => lines.push(`- ${c}`));
    lines.push(``);
  }
  if (rca.fixes.length > 0) {
    lines.push(`## Recommended Fix Steps`);
    rca.fixes.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
    lines.push(``);
  }
  if (rca.consequences.length > 0) {
    lines.push(`## Consequences If Unresolved`);
    rca.consequences.forEach((c) => lines.push(`- ${c}`));
    lines.push(``);
  }

  lines.push(`## Investigation Checklist`);
  lines.push(`1. Reproduce using the error message and stack trace above`);
  lines.push(`2. Open the files listed in "Files to Investigate"`);
  lines.push(`3. Identify the root cause and add appropriate error handling`);
  lines.push(`4. Write a regression test`);
  lines.push(`5. Deploy to staging and verify resolution`);
  lines.push(``);
  lines.push(`## Priority`);
  lines.push(
    report.severity === "critical"
      ? `🔴 **HIGH** — Critical error actively affecting users. Fix immediately.`
      : report.severity === "medium"
        ? `🟡 **MEDIUM** — Impacts functionality. Schedule for next sprint.`
        : `🟢 **LOW** — Minor issue. Address when convenient.`
  );

  return { markdown: lines.join("\n"), fileReferences };
}

router.post("/:id/generate-task", adminAuth, async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [report] = await db
      .select()
      .from(errorReportsTable)
      .where(eq(errorReportsTable.id, id!))
      .limit(1);

    if (!report) {
      sendNotFound(res, "Error report not found");
      return;
    }

    const { markdown, fileReferences } = buildSingleTaskPlan(report);

    await db
      .update(errorReportsTable)
      .set({ resolutionMethod: "task_created", updatedAt: new Date() })
      .where(eq(errorReportsTable.id, id!));

    sendSuccess(res, { taskPlan: markdown, errorId: id, fileReferences });
  } catch (err) {
    logger.error({ err }, "Failed to generate task plan");
    sendError(res, "Failed to generate task plan", 500);
  }
});

const bulkGenerateTaskSchema = z.object({
  ids: z.array(z.string()).min(1).max(20),
});

router.post(
  "/bulk-generate-task",
  adminAuth,
  validateBody(bulkGenerateTaskSchema),
  async (req, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      const reports = await db
        .select()
        .from(errorReportsTable)
        .where(inArray(errorReportsTable.id, ids));

      if (reports.length === 0) {
        sendNotFound(res, "No matching error reports found");
        return;
      }

      const severityOrder = { critical: 0, medium: 1, minor: 2 };
      const sorted = [...reports].sort(
        (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
      );

      const criticalCount = sorted.filter((r) => r.severity === "critical").length;
      const mediumCount = sorted.filter((r) => r.severity === "medium").length;
      const minorCount = sorted.filter((r) => r.severity === "minor").length;
      const overallSeverity = criticalCount > 0 ? "CRITICAL" : mediumCount > 0 ? "MEDIUM" : "LOW";

      const lines: string[] = [
        `# Bulk Bug Fix Task Plan — ${reports.length} Error${reports.length > 1 ? "s" : ""}`,
        ``,
        `> **For developer or AI agent** — this plan covers ${reports.length} selected errors. Fix in priority order.`,
        ``,
        `## Overview`,
        `| Severity | Count |`,
        `|----------|-------|`,
        `| 🔴 Critical | ${criticalCount} |`,
        `| 🟡 Medium | ${mediumCount} |`,
        `| 🟢 Minor | ${minorCount} |`,
        `| **Overall Priority** | **${overallSeverity}** |`,
        ``,
      ];

      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i]!;
        const typeLabel = r.errorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const sourceLabel =
          r.sourceApp === "api"
            ? "API Server"
            : r.sourceApp.charAt(0).toUpperCase() + r.sourceApp.slice(1);
        const sevIcon = r.severity === "critical" ? "🔴" : r.severity === "medium" ? "🟡" : "🟢";
        const rca = analyzeErrorCauseServer(r.errorType, r.errorMessage);
        const fileRefs = extractFileReferences(r.stackTrace ?? "");

        lines.push(`---`);
        lines.push(``);
        lines.push(`## Error ${i + 1} of ${sorted.length}: ${sevIcon} ${typeLabel}`);
        lines.push(``);
        lines.push(`| Field | Value |`);
        lines.push(`|-------|-------|`);
        lines.push(`| Error ID | \`${r.id}\` |`);
        lines.push(`| Severity | ${sevIcon} ${r.severity.toUpperCase()} |`);
        lines.push(`| Source | ${sourceLabel} |`);
        lines.push(`| Type | ${typeLabel} |`);
        lines.push(`| Occurrences | ${r.occurrenceCount ?? 1} |`);
        lines.push(`| Status | ${r.status} |`);
        if (r.moduleName) lines.push(`| Module | \`${r.moduleName}\` |`);
        if (r.functionName) lines.push(`| Function | \`${r.functionName}\` |`);
        if (r.componentName) lines.push(`| Component | \`${r.componentName}\` |`);
        lines.push(``);

        lines.push(`**Error Message:**`);
        lines.push(`\`\`\``);
        lines.push(r.errorMessage);
        lines.push(`\`\`\``);
        lines.push(``);

        if (fileRefs.length > 0) {
          lines.push(`**Files to Investigate:**`);
          fileRefs.forEach((ref) => lines.push(`- \`${ref.file}\` line ${ref.line}`));
          lines.push(``);
        }

        if (r.stackTrace) {
          lines.push(`**Stack Trace (excerpt):**`);
          lines.push(`\`\`\``);
          lines.push(r.stackTrace.slice(0, 1500));
          lines.push(`\`\`\``);
          lines.push(``);
        }

        if (rca.causes.length > 0) {
          lines.push(`**Likely Root Causes:**`);
          rca.causes.forEach((c) => lines.push(`- ${c}`));
          lines.push(``);
        }

        if (rca.fixes.length > 0) {
          lines.push(`**Fix Steps:**`);
          rca.fixes.forEach((f, fi) => lines.push(`${fi + 1}. ${f}`));
          lines.push(``);
        }
      }

      lines.push(`---`);
      lines.push(``);
      lines.push(`## Prioritized Fix Order`);
      sorted.forEach((r, i) => {
        const sevIcon = r.severity === "critical" ? "🔴" : r.severity === "medium" ? "🟡" : "🟢";
        const typeLabel = r.errorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        lines.push(`${i + 1}. ${sevIcon} \`${r.id}\` — ${typeLabel} (${r.sourceApp})`);
      });

      const markdown = lines.join("\n");
      sendSuccess(res, { taskPlan: markdown, count: reports.length });
    } catch (err) {
      logger.error({ err }, "Failed to generate bulk task plan");
      sendError(res, "Failed to generate bulk task plan", 500);
    }
  }
);

/* ── File Scanner routes ────────────────────────────────────────────────── */

router.post("/file-scan/run", adminAuth, async (req: AdminRequest, res) => {
  try {
    const triggeredBy = (req.adminName ?? req.adminId ?? "admin") as string;
    const report = await runFileScanner();
    const id = generateId();
    await db.insert(fileScanResultsTable).values({
      id,
      scannedAt: new Date(report.timestamp),
      durationMs: report.durationMs,
      totalFindings: report.totalFindings,
      findings: report.findings as unknown as Record<string, unknown>[],
      triggeredBy,
    });
    sendSuccess(res, { ...report, id });
  } catch (err) {
    logger.error({ err }, "File scan failed");
    sendError(res, "File scan failed", 500);
  }
});

router.get("/file-scan/history", adminAuth, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: fileScanResultsTable.id,
        scannedAt: fileScanResultsTable.scannedAt,
        durationMs: fileScanResultsTable.durationMs,
        totalFindings: fileScanResultsTable.totalFindings,
        triggeredBy: fileScanResultsTable.triggeredBy,
      })
      .from(fileScanResultsTable)
      .orderBy(desc(fileScanResultsTable.scannedAt))
      .limit(7);
    sendSuccess(
      res,
      rows.map((r) => ({ ...r, scannedAt: r.scannedAt.toISOString() }))
    );
  } catch (err) {
    logger.error({ err }, "Failed to fetch file scan history");
    sendError(res, "Failed to fetch file scan history", 500);
  }
});

router.get("/file-scan/latest", adminAuth, async (_req, res) => {
  try {
    const [row] = await db
      .select()
      .from(fileScanResultsTable)
      .orderBy(desc(fileScanResultsTable.scannedAt))
      .limit(1);
    if (!row) {
      sendSuccess(res, null);
      return;
    }
    sendSuccess(res, { ...row, scannedAt: row.scannedAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "Failed to fetch latest file scan");
    sendError(res, "Failed to fetch latest file scan", 500);
  }
});

const fileScanTaskSchema = z.object({
  finding: z.object({
    filePath: z.string(),
    lineNumber: z.number(),
    ruleName: z.string(),
    severity: z.enum(["critical", "medium", "minor"]),
    message: z.string(),
    snippet: z.string(),
  }),
});

router.post(
  "/file-scan/generate-task",
  adminAuth,
  validateBody(fileScanTaskSchema),
  async (req, res) => {
    try {
      const { finding } = req.body as { finding: FileScanFinding };
      const sevIcon =
        finding.severity === "critical" ? "🔴" : finding.severity === "medium" ? "🟡" : "🟢";
      const ruleLabel = finding.ruleName
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const lines = [
        `# Code Quality Fix Task: ${ruleLabel}`,
        ``,
        `> **For developer or AI agent** — static analysis identified a code quality issue that needs fixing.`,
        ``,
        `## Issue Summary`,
        `| Field | Value |`,
        `|-------|-------|`,
        `| Rule | \`${finding.ruleName}\` |`,
        `| Severity | ${sevIcon} ${finding.severity.toUpperCase()} |`,
        `| File | \`${finding.filePath}\` |`,
        `| Line | ${finding.lineNumber} |`,
        ``,
        `## Problem Description`,
        finding.message,
        ``,
        `## Code Snippet (line ${finding.lineNumber})`,
        `\`\`\`typescript`,
        finding.snippet,
        `\`\`\``,
        ``,
        `## Why This Is Risky`,
      ];

      const whyRisky: Record<string, string> = {
        "empty-catch":
          "Silent error swallowing hides bugs in production. Errors are thrown but never logged or handled, making debugging nearly impossible.",
        "console-log":
          "console.log calls in production code leak implementation details, may expose sensitive data, and bypass structured logging that supports filtering, alerting, and aggregation.",
        "todo-fixme-hack":
          "TODO/FIXME/HACK comments mark unfinished or temporary code. If left indefinitely, they accumulate as technical debt and may indicate incomplete features or known bugs.",
        "async-no-trycatch":
          "Async functions without try/catch will result in unhandled promise rejections which crash Node.js workers or leave React components in a broken state.",
        "route-no-trycatch":
          "Express route handlers without try/catch cause unhandled exceptions that crash the entire server process or return 500 with no user-friendly message.",
        "missing-null-check":
          "Accessing properties on potentially null/undefined values causes TypeError crashes that are hard to debug in production.",
        "unhandled-promise":
          "Promise-returning calls without await or .catch() leave errors completely unhandled — the operation may silently fail.",
        "silent-catch-continue":
          "A catch block that only has comments effectively swallows the error, making it invisible in logs and impossible to diagnose.",
      };

      lines.push(
        whyRisky[finding.ruleName] ??
          "This pattern is considered unsafe and should be addressed to improve code reliability."
      );
      lines.push(``);

      lines.push(`## How to Fix`);
      const howToFix: Record<string, string[]> = {
        "empty-catch": [
          "1. Open `" + finding.filePath + "` at line " + finding.lineNumber,
          "2. Add error logging: `logger.error({ err }, 'Description of what failed')`",
          "3. Either re-throw the error or handle it gracefully",
          "4. Never leave a catch block completely empty",
        ],
        "console-log": [
          "1. Import the structured logger: `import { logger } from '../lib/logger.js'`",
          "2. Replace `console.log(...)` with `logger.info(...)` or appropriate log level",
          "3. Use structured fields: `logger.info({ userId, action }, 'User performed action')`",
        ],
        "todo-fixme-hack": [
          "1. Create a proper task/ticket for the noted work",
          "2. Either complete the work now or remove the comment and track it in your backlog",
          "3. Never leave TODO/FIXME comments in production code without a tracking ticket",
        ],
        "async-no-trycatch": [
          "1. Wrap the function body in a try/catch block",
          "2. Log the error with context in the catch: `logger.error({ err }, 'What failed')`",
          "3. Return a meaningful error response or re-throw as appropriate",
        ],
        "route-no-trycatch": [
          "1. Wrap the entire route handler body in `try { ... } catch (err) { ... }`",
          "2. In the catch block: `logger.error({ err }, 'Route failed'); sendError(res, 'message', 500)`",
          "3. Never let route handlers throw uncaught exceptions",
        ],
        "missing-null-check": [
          "1. Use optional chaining: `req.body?.field?.subField`",
          "2. Add runtime validation with Zod before accessing nested properties",
          "3. Provide default values: `const value = req.body?.field ?? defaultValue`",
        ],
      };

      const fixes = howToFix[finding.ruleName] ?? [
        `1. Open \`${finding.filePath}\` at line ${finding.lineNumber}`,
        `2. Review the flagged code and apply the appropriate fix`,
        `3. Add a test to cover the fixed code path`,
      ];
      fixes.forEach((f) => lines.push(f));
      lines.push(``);

      lines.push(`## Surrounding Context`);
      lines.push(
        `Open \`${finding.filePath}\` and navigate to line ${finding.lineNumber}. Review the surrounding ~20 lines for full context before making changes.`
      );
      lines.push(``);
      lines.push(`## Priority`);
      lines.push(
        finding.severity === "critical"
          ? `🔴 **HIGH** — This issue can cause crashes or data loss. Fix immediately.`
          : finding.severity === "medium"
            ? `🟡 **MEDIUM** — This issue reduces reliability. Fix in the current sprint.`
            : `🟢 **LOW** — Code quality improvement. Fix when convenient.`
      );

      sendSuccess(res, { taskPlan: lines.join("\n"), finding });
    } catch (err) {
      logger.error({ err }, "Failed to generate file scan task plan");
      sendError(res, "Failed to generate file scan task plan", 500);
    }
  }
);

/* ── Daily file scanner scheduler ─────────────────────────────────────── */
let _dailyScanTimeout: ReturnType<typeof setTimeout> | null = null;

export function scheduleDailyFileScan(timeHHMM: string = "02:00"): void {
  if (_dailyScanTimeout) {
    clearTimeout(_dailyScanTimeout);
    _dailyScanTimeout = null;
  }
  const [hStr, mStr] = timeHHMM.split(":");
  const h = parseInt(hStr ?? "2", 10);
  const m = parseInt(mStr ?? "0", 10);

  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next.getTime() - now.getTime();
  _dailyScanTimeout = setTimeout(async () => {
    try {
      const report = await runFileScanner();
      const id = generateId();
      await db.insert(fileScanResultsTable).values({
        id,
        scannedAt: new Date(report.timestamp),
        durationMs: report.durationMs,
        totalFindings: report.totalFindings,
        findings: report.findings as unknown as Record<string, unknown>[],
        triggeredBy: "scheduler",
      });
      logger.info({ totalFindings: report.totalFindings }, "[file-scanner] Daily scan completed");
    } catch (err) {
      logger.error({ err }, "[file-scanner] Daily scan failed");
    }
    scheduleDailyFileScan(timeHHMM);
  }, delay);
}

let _resolutionMigrated = false;
export async function ensureErrorResolutionTables() {
  if (_resolutionMigrated) return;
  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE resolution_method AS ENUM ('manual', 'auto_resolved', 'task_created');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[error-reports] CREATE TYPE resolution_method migration failed — may already exist"
    );
  }
  try {
    await db.execute(
      sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS resolution_method resolution_method`
    );
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS resolution_notes TEXT`);
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS root_cause TEXT`);
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS error_hash TEXT`);
    await db.execute(
      sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_error_reports_hash ON error_reports (error_hash, status, timestamp)`
    );
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[error-reports] ALTER TABLE error_reports migration failed — columns may already exist"
    );
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS error_resolution_backups (
        id TEXT PRIMARY KEY,
        error_report_id TEXT NOT NULL,
        previous_status TEXT NOT NULL,
        previous_data JSONB NOT NULL,
        resolution_method TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        expires_at TIMESTAMP NOT NULL
      )
    `);
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[error-reports] CREATE TABLE error_resolution_backups migration failed — may already exist"
    );
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auto_resolve_log (
        id TEXT PRIMARY KEY,
        error_report_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        rule_matched TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[error-reports] CREATE TABLE auto_resolve_log migration failed — may already exist"
    );
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS file_scan_results (
        id TEXT PRIMARY KEY,
        scanned_at TIMESTAMP DEFAULT NOW() NOT NULL,
        duration_ms INTEGER NOT NULL,
        total_findings INTEGER NOT NULL,
        findings JSONB NOT NULL,
        triggered_by TEXT NOT NULL DEFAULT 'manual'
      )
    `);
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[error-reports] CREATE TABLE file_scan_results migration failed — may already exist"
    );
  }
  _resolutionMigrated = true;
}

export default router;

export { classifyImpact, classifySeverity, VALID_ERROR_TYPES, VALID_SOURCE_APPS };
