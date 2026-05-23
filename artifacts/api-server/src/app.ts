import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { existsSync, mkdirSync, readFileSync } from "fs";
import helmet from "helmet";
import { createProxyMiddleware } from "http-proxy-middleware";
import { dirname, resolve } from "path";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "url";
import { swaggerSpec } from "./docs/swagger.js";
import { logger, pinoInstance } from "./lib/logger.js";
import { recordResponseTime } from "./lib/metrics/responseTime.js";
import { globalLimiter, uploadLimiter } from "./middleware/rate-limit.js";
import { requestContext, requestContextMiddleware } from "./middleware/request-context.js";
import { sanitizeBody } from "./middleware/sanitize.js";
import { suspiciousPatternDetector } from "./middleware/suspiciousPatternDetector.js";
import { DEFAULT_PLATFORM_SETTINGS, getCachedSettings } from "./routes/admin-shared.js";
import { ensureErrorResolutionTables } from "./routes/error-reports.js";
import router from "./routes/index.js";
import { detectAndNotifyOutOfBandPasswordResets } from "./services/admin-password-watch.service.js";
import { purgeStaleAdminPasswordResetTokens } from "./services/admin-password.service.js";
import { reconcileSeededSuperAdmin, seedDefaultSuperAdmin } from "./services/admin-seed.service.js";
import { ensureCartSnapshotTable } from "./services/cartSnapshotMigration.js";
import { checkDbOnStartup, startDbMonitor } from "./services/dbConnectivityMonitor.js";
import { sendAdminAlert } from "./services/email.js";
import { startHealthMonitor } from "./services/healthAlertMonitor.js";
import { checkMigrationGuard } from "./services/migrationGuard.service.js";
import {
  backfillAdminRoleAssignments,
  seedDefaultRoles,
  seedPermissionCatalog,
} from "./services/permissions.service.js";
import { ensureReferralAndPrescriptionTables } from "./services/referralPrescriptionMigration.js";
import { checkSchemaDrift } from "./services/schemaDrift.service.js";
import { runSqlMigrations } from "./services/sqlMigrationRunner.js";
import { ensureUserTotpSetupTable } from "./services/userTotpSetupMigration.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run DB migrations + RBAC seed/backfill before the server begins
 * accepting traffic. SQL migration failure is fatal — we throw so the
 * boot script in `index.ts` exits non-zero rather than silently serving
 * authorization decisions against a half-migrated schema.
 *
 * The RBAC seed is best-effort: a transient seed failure should not
 * block the platform from coming up, but it is logged loudly.
 */
export async function runStartupTasks(): Promise<void> {
  /* ── HMAC secret presence check ───────────────────────────────────────────
     ERROR_REPORT_HMAC_SECRET must be set so the server can verify HMAC-signed
     error reports sent by rider/vendor/customer apps. A missing secret means
     all incoming reports will be rejected (or pass unsigned). In production
     this is a hard requirement; in development it is a loud warning only. */
  if (!process.env.ERROR_REPORT_HMAC_SECRET) {
    if (process.env.NODE_ENV === "production") {
      logger.fatal(
        "[startup] FATAL CONFIG ERROR: ERROR_REPORT_HMAC_SECRET is not set. " +
          "Error reports from rider/vendor/customer apps cannot be verified. " +
          "Set this secret in your environment before deploying."
      );
      throw new Error("ERROR_REPORT_HMAC_SECRET must be set in production");
    } else {
      logger.warn(
        "[startup] WARNING: ERROR_REPORT_HMAC_SECRET is not set. " +
          "Error report HMAC verification will be skipped. " +
          "Set this secret before deploying to production."
      );
    }
  } else {
    logger.info("[startup] ERROR_REPORT_HMAC_SECRET is configured.");
  }

  /* ── OTP cryptographic secrets presence check ────────────────────────────
     Three independent cryptographic operations (HMAC OTP, TOTP encryption, OTP HMAC)
     must each use their own dedicated secret to prevent key reuse attacks:
     - HMAC_OTP_SECRET: used to HMAC-hash OTP codes for storage
     - TOTP_ENCRYPTION_KEY: used to encrypt TOTP secrets (AES-256-GCM)
     - OTP_HMAC_SECRET: used to hash OTP codes for verification
     A single key compromise must not defeat all three security layers.
     In production, fallback to JWT_SECRET is forbidden — each must be explicitly set. */
  const otpSecrets = [
    { name: "HMAC_OTP_SECRET", description: "HMAC-hash OTP codes for storage" },
    { name: "TOTP_ENCRYPTION_KEY", description: "encrypt TOTP secrets (AES-256-GCM)" },
    { name: "OTP_HMAC_SECRET", description: "hash OTP codes for verification" },
  ];

  for (const secret of otpSecrets) {
    if (!process.env[secret.name]) {
      if (process.env.NODE_ENV === "production") {
        logger.fatal(
          `[startup] FATAL CONFIG ERROR: ${secret.name} is not set. ` +
            `This secret is used to ${secret.description} and must not fall back to JWT_SECRET. ` +
            "Set this secret in your environment before deploying. " +
            "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
        throw new Error(`${secret.name} must be set in production`);
      } else {
        logger.warn(
          `[startup] WARNING: ${secret.name} is not set. ` +
            `This secret will fall back to JWT_SECRET, which is NOT safe for production. ` +
            `Set a dedicated ${secret.name} before deploying to production. ` +
            "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
      }
    } else {
      logger.info(`[startup] ${secret.name} is configured.`);
    }
  }

  await runSqlMigrations();
  try {
    await checkMigrationGuard();
  } catch (err) {
    logger.error({ err }, "[startup] migration guard check failed (continuing)");
  }
  try {
    await seedPermissionCatalog();
    await seedDefaultRoles();
    await backfillAdminRoleAssignments();
    logger.info("[startup] RBAC seed + backfill complete");
  } catch (err) {
    logger.error({ err }, "[startup] RBAC seed/backfill failed (continuing)");
  }
  try {
    await seedDefaultSuperAdmin();
  } catch (err) {
    logger.error({ err }, "[startup] admin seed failed (continuing)");
  }
  try {
    await reconcileSeededSuperAdmin();
  } catch (err) {
    logger.error({ err }, "[startup] admin seed reconciliation failed (continuing)");
  }
  try {
    const purged = await purgeStaleAdminPasswordResetTokens();
    if (purged > 0) {
      logger.info({ purged }, "[startup] purged expired admin password reset token(s)");
    }
  } catch (err) {
    logger.error({ err }, "[startup] reset-token purge failed (continuing)");
  }
  try {
    await detectAndNotifyOutOfBandPasswordResets();
  } catch (err) {
    logger.error({ err }, "[startup] admin password watchdog failed (continuing)");
  }
  try {
    await ensureErrorResolutionTables();
    logger.info("[startup] error-monitor supplementary tables ready");
  } catch (err) {
    logger.error({ err }, "[startup] error-monitor table migration failed (continuing)");
  }
  try {
    await ensureCartSnapshotTable();
    logger.info("[startup] cart_snapshots table ready");
  } catch (err) {
    logger.error({ err }, "[startup] cart_snapshots table migration failed (continuing)");
  }
  try {
    await ensureReferralAndPrescriptionTables();
    logger.info(
      "[startup] referral_codes, referral_usages, pharmacy_prescription_refs tables ready"
    );
  } catch (err) {
    logger.error({ err }, "[startup] referral/prescription table migration failed (continuing)");
  }
  try {
    await ensureUserTotpSetupTable();
    logger.info("[startup] user_totp_setup table ready");
  } catch (err) {
    logger.error({ err }, "[startup] user_totp_setup table migration failed (continuing)");
  }
  try {
    if (DEFAULT_PLATFORM_SETTINGS.length > 0) {
      await db
        .insert(platformSettingsTable)
        .values(DEFAULT_PLATFORM_SETTINGS)
        .onConflictDoNothing();
      logger.info(
        { count: DEFAULT_PLATFORM_SETTINGS.length },
        "[startup] platform settings defaults ensured"
      );
    }
  } catch (err) {
    logger.error({ err }, "[startup] platform settings seed failed (continuing)");
  }
  try {
    startHealthMonitor();
  } catch (err) {
    logger.error({ err }, "[startup] health monitor failed to start (continuing)");
  }
  try {
    await checkDbOnStartup();
    startDbMonitor();
  } catch (err) {
    logger.error({ err }, "[startup] DB connectivity monitor failed to start (continuing)");
  }
  // Run schema drift check once at startup. Logs a warning when drift is found.
  // The result is cached in schemaDrift.service.ts for the health-dashboard endpoint.
  try {
    const driftReport = await checkSchemaDrift();
    if (!driftReport.ok) {
      logger.warn(driftReport, "[startup] schema drift detected");

      // Build a clear email body with actionable ALTER TABLE commands.
      const hostname = process.env["HOST"] ?? process.env["HOSTNAME"] ?? "unknown-host";
      const timestamp = new Date().toISOString();
      const columnGaps = driftReport.columnDrift.filter((d) => d.missingInDb.length > 0);

      const missingTableLines =
        driftReport.missingTables.length > 0
          ? driftReport.missingTables.map((t) => `  • ${t}`).join("\n")
          : "  (none)";

      const columnGapLines =
        columnGaps.length > 0
          ? columnGaps
              .map(
                (d) =>
                  `  Table: ${d.table}\n` +
                  d.missingInDb
                    .map((col) => `    ALTER TABLE "${d.table}" ADD COLUMN "${col}" TEXT;`)
                    .join("\n")
              )
              .join("\n\n")
          : "  (none)";

      const htmlBody = `
        <h2>Schema Drift Detected on Startup</h2>
        <p><strong>Server:</strong> ${hostname}<br/>
        <strong>Detected at:</strong> ${timestamp}</p>

        <h3>Missing Tables (${driftReport.missingTables.length})</h3>
        <pre>${missingTableLines}</pre>

        <h3>Missing Columns (${columnGaps.length} table(s) affected)</h3>
        <pre>${columnGapLines}</pre>

        <p>Run <code>pnpm drizzle-kit push</code> to apply pending migrations.</p>
      `.trim();

      getCachedSettings()
        .then((settings) =>
          sendAdminAlert(
            "schema_drift",
            `[AJKMart] Schema drift detected — ${driftReport.missingTables.length} missing table(s), ${columnGaps.length} column gap(s)`,
            htmlBody,
            settings
          )
        )
        .then((result) => {
          if (result.sent) {
            logger.info("[startup] schema drift alert sent");
          }
        })
        .catch((err) => {
          logger.error({ err }, "[startup] schema drift alert email failed (non-fatal)");
        });
    } else {
      logger.info({ tables: driftReport.totalSchemaTables }, "[startup] schema drift check passed");
    }
  } catch (err) {
    logger.error({ err }, "[startup] schema drift check failed (continuing)");
  }
}

/**
 * Validate and return the CORS allowed-origins whitelist.
 *
 * Production: fatal exit if no origins are configured — a misconfigured
 *   production server must never silently allow all origins.
 * Development: warns and falls back to a safe localhost-only list so
 *   developers can work without setting every env var upfront.
 */
function validateCORS(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Always include the Replit dev domain if running on Replit.
  // Also add port variants for each Vite dev server / Expo web server that
  // Replit proxies on an external port (e.g. admin on :3000, vendor on :3002,
  // rider on :3003, customer on :5000, expo on :5173/:19006).
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  const replitOrigins = replitDomain
    ? (() => {
        // Derive the .expo. subdomain variant (e.g. "abc-00-xyz.pike.replit.dev"
        // → "abc-00-xyz.expo.pike.replit.dev") used by the Expo dev client.
        const dotIdx = replitDomain.indexOf(".");
        const expoOrigin =
          dotIdx !== -1
            ? `https://${replitDomain.slice(0, dotIdx)}.expo${replitDomain.slice(dotIdx)}`
            : null;
        return [
          `https://${replitDomain}`,
          // API server + external port variants mapped in .replit [[ports]] blocks
          ...[3000, 3001, 3002, 5000, 8000, 8080].map((p) => `https://${replitDomain}:${p}`),
          // Expo web dev server ports
          ...[19006, 8081].map((p) => `https://${replitDomain}:${p}`),
          // Expo .expo. subdomain variant used by Expo Go / dev client
          ...(expoOrigin ? [expoOrigin] : []),
        ];
      })()
    : [];

  if (fromEnv.length > 0) {
    const merged = [...new Set([...fromEnv, ...replitOrigins])];
    return merged;
  }

  // No ALLOWED_ORIGINS set — build a safe fallback from Replit-derived origins
  // and localhost variants. In production this logs a warning (not a fatal exit)
  // so the server can still start; operators should set ALLOWED_ORIGINS for
  // tighter control.
  const replitPortVariants = replitDomain
    ? [3000, 3001, 3002, 5000, 8000, 8080].map((p) => `https://${replitDomain}:${p}`)
    : [];
  const fallback = [
    "http://localhost:5000",
    "http://localhost:5173",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://127.0.0.1:5000",
    ...replitOrigins,
    ...replitPortVariants,
  ];

  if (process.env.NODE_ENV === "production") {
    logger.warn(
      { allowedOrigins: fallback },
      "[SECURITY:CORS] ALLOWED_ORIGINS is not set in production — falling back to Replit-derived origins. " +
        "Set ALLOWED_ORIGINS to a comma-separated list of your production URLs for tighter CORS control."
    );
  } else {
    logger.info(
      { allowedOrigins: fallback },
      "[SECURITY:CORS] ALLOWED_ORIGINS not set — using localhost-only whitelist for development. Set ALLOWED_ORIGINS before deploying to production."
    );
  }
  return fallback;
}

export async function createServer() {
  const app = express();

  // Trust proxy (for proper IP detection behind reverse proxy/load balancer)
  app.set("trust proxy", 1);

  /* ── Request/response timing logger (pino-http) — MUST be first middleware ──
     Emits one structured JSON log line per request/response with:
       requestId, method, url, statusCode, responseTime (ms)
     The requestId is also propagated as x-request-id response header and
     attached to req so Sentry / audit / downstream middleware can reference it.
     Position: first, so every request including 404s and proxy responses is
     captured and the requestId is available to all later middleware. */
  app.use(
    pinoHttp({
      logger: pinoInstance,
      genReqId: (req, res) => {
        const existing = req.headers["x-request-id"] as string | undefined;
        const id = existing || crypto.randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          userAgent: (req.raw as { headers?: Record<string, string> })?.headers?.["user-agent"],
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      customSuccessMessage: (req, res) => {
        const ctx = requestContext.getStore();
        const ms = ctx ? Date.now() - ctx.startMs : 0;
        return `${req.method} ${(req as { url?: string }).url ?? ""} → ${res.statusCode} (${ms}ms)`;
      },
      customErrorMessage: (_req, _res, err) => `ERROR: ${(err as Error).message ?? String(err)}`,
    })
  );

  /* ── Per-request AsyncLocalStorage context ──────────────────────────────
     Mount AFTER pinoHttp (so genReqId has fired and req.id is set) and
     BEFORE all other middleware so every downstream call can read the
     context via requestContext.getStore(). */
  app.use(requestContextMiddleware);

  /* ── First-run setup gate ────────────────────────────────────────────────
     When DATABASE_URL (or JWT_SECRET) is missing, every HTTP request gets
     a friendly HTML setup page instead of cryptic errors. This helps new
     contributors find the Secrets panel quickly without hunting through logs.
     The gate is skipped once the required vars are present.                */
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    const missing: string[] = [];
    if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
    if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");

    const missingRows = missing
      .map(
        (k) =>
          `<tr><td class="var">${k}</td><td class="desc">${
            k === "DATABASE_URL"
              ? "PostgreSQL connection string — create a free Replit PostgreSQL database or paste your own URL"
              : "JWT signing secret — generate with: <code>node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"</code>"
          }</td></tr>`
      )
      .join("\n");

    const setupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>AJKMart — Setup Required</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1f2e;border:1px solid #2d3748;border-radius:16px;max-width:680px;width:100%;padding:40px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
    .badge{display:inline-flex;align-items:center;gap:8px;background:#7c3aed22;border:1px solid #7c3aed55;color:#a78bfa;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;margin-bottom:24px}
    h1{font-size:26px;font-weight:700;margin-bottom:8px;color:#f1f5f9}
    .sub{color:#94a3b8;font-size:15px;margin-bottom:32px;line-height:1.6}
    h2{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;margin-bottom:32px;font-size:14px}
    td{padding:12px 14px;border-bottom:1px solid #2d3748;vertical-align:top;line-height:1.6}
    td.var{font-family:monospace;font-size:13px;color:#f472b6;white-space:nowrap;width:200px;background:#1e2535;border-radius:4px 0 0 4px}
    td.desc{color:#cbd5e1}
    code{background:#0f1117;padding:2px 6px;border-radius:4px;font-size:12px;color:#86efac}
    .steps{counter-reset:step;list-style:none;display:flex;flex-direction:column;gap:14px;margin-bottom:32px}
    .steps li{display:flex;gap:14px;align-items:flex-start;font-size:14px;color:#cbd5e1;line-height:1.6}
    .steps li::before{counter-increment:step;content:counter(step);background:#7c3aed;color:#fff;border-radius:50%;min-width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px}
    .steps li strong{color:#e2e8f0}
    .tip{background:#0f2e1a;border:1px solid #166534;border-radius:10px;padding:16px 20px;font-size:13px;color:#86efac;line-height:1.6}
    .tip strong{display:block;margin-bottom:4px;font-size:14px}
    a{color:#818cf8;text-decoration:none}
    a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">⚙️ Setup Required</div>
    <h1>AJKMart needs a few secrets</h1>
    <p class="sub">The following required environment variables are missing. Add them in the <strong>Replit Secrets panel</strong> (🔒 padlock icon in the left sidebar), then restart the workflow.</p>

    <h2>Missing Variables</h2>
    <table>${missingRows}</table>

    <h2>How to fix it</h2>
    <ol class="steps">
      <li><span>Click the <strong>🔒 padlock icon</strong> in the Replit left sidebar to open the Secrets panel.</span></li>
      <li><span>Click <strong>"New secret"</strong> and add each missing variable above with its value.</span></li>
      <li><span>For <code>DATABASE_URL</code>: click <strong>"Add PostgreSQL database"</strong> in the Secrets panel — Replit creates it automatically and fills the secret for you.</span></li>
      <li><span>Once all secrets are saved, click the <strong>▶ Run / Restart</strong> button (or restart the <em>API Server</em> workflow) to reload the server.</span></li>
    </ol>

    <div class="tip">
      <strong>💡 Generate JWT_SECRET</strong>
      Run this in the Replit Shell to get a secure random value:<br/>
      <code>node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"</code>
    </div>
  </div>
</body>
</html>`;

    app.use((_req: express.Request, res: express.Response) => {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).send(setupHtml);
    });

    logger.warn(
      { missing },
      "[setup-gate] Serving setup page — add missing secrets in Replit Secrets panel, then restart."
    );
    return app;
  }

  /* ── Response-time collection for p95 metrics ───────────────────────────
     Hooks into the response `finish` event (after headers are flushed) to
     record each request's duration into the rolling window used by the
     health monitor and /api/health endpoint. Skips health/proxy endpoints
     so they don't skew the application p95. */
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const url = req.originalUrl ?? req.url ?? "";
      if (
        url.startsWith("/api/health") ||
        url === "/" ||
        url.startsWith("/admin") ||
        url.startsWith("/vendor") ||
        url.startsWith("/rider")
      )
        return;
      recordResponseTime(Date.now() - start);
    });
    next();
  });

  /* ── Sentry request handler (official pattern) ─────────────────────────────
     When @sentry/node is installed and initialised (see index.ts IIFE),
     mount Sentry.Handlers.requestHandler() BEFORE all routes so Sentry can
     attach request context (url, method, headers, user) to every captured
     event. Falls back silently if Sentry is not installed. */
  {
    const sentryMod = (globalThis as Record<string, unknown>)["__sentryInstance"] as
      | Record<string, unknown>
      | undefined;
    if (sentryMod && typeof sentryMod["Handlers"] === "object" && sentryMod["Handlers"]) {
      const handlers = sentryMod["Handlers"] as Record<string, unknown>;
      if (typeof handlers["requestHandler"] === "function") {
        app.use((handlers["requestHandler"] as () => express.RequestHandler)());
      }
    }
  }

  /* ── Production: serve built static assets for all sub-apps ─────────────
        When NODE_ENV=production the dev proxies are not registered, so this
        block serves the Vite-built outputs from their dist/public dirs and
        the Expo static-build for the customer app.
        Falls back gracefully (503) when a dist dir is absent (not yet built).
   ──────────────────────────────────────────────────────────────────────── */
  if (process.env.NODE_ENV === "production") {
    const staticApps: Array<{ prefix: string; dir: string; spa?: boolean }> = [
      { prefix: "/admin", dir: resolve(__dirname, "../../admin/dist/public"), spa: true },
      { prefix: "/vendor", dir: resolve(__dirname, "../../vendor-app/dist/public"), spa: true },
      { prefix: "/rider", dir: resolve(__dirname, "../../rider-app/dist/public"), spa: true },
      {
        prefix: "/customer",
        dir: resolve(__dirname, "../../../artifacts/ajkmart/static-build/web"),
        spa: true,
      },
    ];

    for (const { prefix, dir, spa } of staticApps) {
      if (!existsSync(dir)) {
        logger.warn(
          `[prod:static] ${prefix} dist not found at ${dir} — returning 503 for these routes. Run the build for this app.`
        );
        app.use(prefix, (_req: express.Request, res: express.Response) => {
          res.status(503).send(`${prefix} app not built. Run pnpm build in the workspace.`);
        });
        continue;
      }
      app.use(prefix, express.static(dir, { maxAge: "1y", immutable: true }));
      if (spa) {
        const indexPath = resolve(dir, "index.html");
        app.use(prefix, (_req: express.Request, res: express.Response) => {
          if (existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            res.status(404).send("index.html not found");
          }
        });
      }
    }
    logger.info(
      "[prod:static] Sub-app static serving configured for /admin /vendor /rider /customer"
    );
  }

  /* ── Dev-only: serve sw.js files directly with Clear-Site-Data so the
        browser clears its SW cache on every update check. SW script fetches
        bypass the SW's own fetch handler (per spec), so this header is
        ALWAYS received by the browser regardless of any cached SW. ──────── */
  if (process.env.NODE_ENV !== "production") {
    const swFiles: Record<string, string> = {
      "/admin/sw.js": resolve(__dirname, "../../admin/public/sw.js"),
      "/vendor/sw.js": resolve(__dirname, "../../vendor-app/public/sw.js"),
      "/rider/sw.js": resolve(__dirname, "../../rider-app/public/sw.js"),
    };
    for (const [urlPath, filePath] of Object.entries(swFiles)) {
      app.get(urlPath, (_req, res) => {
        try {
          const content = readFileSync(filePath, "utf-8");
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Clear-Site-Data", '"cache", "storage"');
          res.send(content);
        } catch (err) {
          logger.error(
            {
              error: err instanceof Error ? err.message : String(err),
              timestamp: new Date().toISOString(),
            },
            "[route] unhandled error"
          );
          res.status(404).send("/* sw.js not found */");
        }
      });
    }
  }

  /* ── Static /uploads route (dev + production fallback) ──────────────────
        storage.ts saveFallback() writes files to public/uploads/ whenever
        S3 credentials are absent and returns an absolute APP_BASE_URL/uploads/<key>
        URL. Registering /uploads as a static route ensures those URLs are
        actually reachable regardless of NODE_ENV.
        In production with S3 configured, this directory is always empty and
        the route is effectively inert. maxAge:0 prevents stale caches on
        files that may be overwritten in a no-S3 fallback scenario. ────────── */
  const publicUploadsDir = resolve(process.cwd(), "public", "uploads");
  try {
    mkdirSync(publicUploadsDir, { recursive: true });
  } catch (err) {
    logger.warn({ err }, "[uploads] Could not create public/uploads dir — may already exist");
  }
  app.use("/uploads", express.static(publicUploadsDir, { maxAge: "0", etag: false }));

  /* ── Dev-only: proxy sibling apps so the api-server preview can render
        admin / vendor / rider / customer (Expo) at their respective paths.
        Registered BEFORE helmet so the proxied responses carry the
        upstream Vite headers untouched. ─────────────────────────────────── */
  if (process.env.NODE_ENV !== "production") {
    const adminTarget = `http://127.0.0.1:${process.env.ADMIN_DEV_PORT ?? "3000"}`;
    // Vite injects absolute paths like /@vite/client and /@replit/... into the page.
    // When these are fetched from the root origin (port 5000) they miss the sub-path
    // proxy rules. Forward all /@... paths to the admin Vite server so the browser
    // receives JavaScript with the correct MIME type instead of a 404/text-plain.
    const vitePrefixes = ["/@replit", "/@vite", "/@fs", "/__vite_ping", "/node_modules/.vite"];
    for (const vp of vitePrefixes) {
      app.use(
        createProxyMiddleware({
          target: adminTarget,
          changeOrigin: true,
          logger: undefined,
          pathFilter: (pathname) =>
            pathname === vp || pathname.startsWith(vp + "/") || pathname.startsWith(vp + "?"),
          on: {
            error: (_err, _req, _res) => {
              /* silently ignore – dev banner is cosmetic */
            },
          },
        }) as unknown as express.RequestHandler
      );
    }

    const devProxies: Array<{
      prefix: string;
      target: string;
      ws?: boolean;
      rewriteToRoot?: boolean;
    }> = [
      { prefix: "/admin", target: adminTarget, ws: true },
      {
        prefix: "/vendor",
        target: `http://127.0.0.1:${process.env.VENDOR_DEV_PORT ?? "3001"}`,
        ws: true,
      },
      {
        prefix: "/rider",
        target: `http://127.0.0.1:${process.env.RIDER_DEV_PORT ?? "3002"}`,
        ws: true,
      },
      {
        prefix: "/__mockup",
        target: `http://127.0.0.1:${process.env.MOCKUP_DEV_PORT ?? "8081"}`,
        ws: true,
      },
      // Expo customer app serves at "/", so /customer/* → strip prefix.
      // Absolute asset URLs Expo embeds (e.g. /_expo/static/...) are caught
      // by the Expo fallback proxy registered at the bottom of this file.
      {
        prefix: "/customer",
        target: `http://localhost:${process.env.EXPO_DEV_PORT ?? "20716"}`,
        ws: true,
        rewriteToRoot: true,
      },
    ];
    for (const p of devProxies) {
      // Mount at root with a path filter so the original `/admin/...` URL is
      // forwarded as-is (Express's app.use(prefix) strips the prefix from
      // req.url, which then collides with Vite's `base` and causes a redirect
      // loop). Filter ensures we only intercept the prefix paths.
      app.use(
        createProxyMiddleware({
          target: p.target,
          changeOrigin: true,
          ws: p.ws,
          xfwd: p.prefix !== "/customer",
          logger: undefined,
          pathFilter: (pathname) =>
            pathname === p.prefix ||
            pathname.startsWith(p.prefix + "/") ||
            pathname.startsWith(p.prefix + "?"),
          ...(p.rewriteToRoot
            ? {
                pathRewrite: (path: string) => {
                  const stripped = path.slice(p.prefix.length);
                  return stripped === "" ? "/" : stripped;
                },
              }
            : {}),
          on: {
            error: (err, _req, res) => {
              if (
                res &&
                "writeHead" in res &&
                !(res as unknown as { headersSent?: boolean }).headersSent
              ) {
                (
                  res as unknown as {
                    writeHead: (code: number, headers: Record<string, string>) => void;
                  }
                ).writeHead(502, { "Content-Type": "text/plain" });
                (res as unknown as { end: (body: string) => void }).end(
                  `Dev proxy error for ${p.prefix} → ${p.target}\n${(err as Error).message}\n` +
                    `Make sure the corresponding workflow is running.`
                );
              }
            },
          },
        }) as unknown as express.RequestHandler
      );
    }
    logger.info("[dev] Sibling app proxies enabled at /admin /vendor /rider /customer /__mockup");
  }

  // Security headers via helmet
  // Notes on directives:
  //  - scriptSrc: 'self' + gstatic (Firebase/Google SDKs). 'unsafe-inline' removed;
  //    Swagger UI is served behind adminAuth so a nonce is not worth the complexity.
  //  - connectSrc: wss: allows Socket.IO over WSS; https: allows API calls from SPA.
  //  - frameSrc/objectSrc: "'none'" — no framing or plugins of any kind.
  //  - upgradeInsecureRequests: [] — browsers auto-upgrade http:// subresources.
  //  - crossOriginEmbedderPolicy: false — Socket.IO requires this to be off.
  //  - hidePoweredBy: true — suppress X-Powered-By: Express fingerprinting.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://www.gstatic.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "wss:", "https:"],
          workerSrc: ["'self'", "blob:"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      frameguard: { action: "deny" },
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
    })
  );

  // Explicit Permissions-Policy listing only modern, well-supported features.
  // Omitting deprecated/unrecognised directives (e.g. interest-cohort,
  // sync-xhr) prevents the browser from emitting "Unrecognized feature" warnings.
  app.use((_req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(self)"
    );
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    next();
  });

  // CORS with strict origin whitelist.
  // validateCORS() enforces production-fatal / dev-fallback logic and returns
  // the final allowed-origins list. The callback never falls through to allow-all.
  const allowedOrigins = validateCORS();
  logger.info({ allowedOrigins }, "[SECURITY:CORS] Active allowed origins");

  // RegExp patterns for dynamic Replit preview subdomains that cannot be
  // enumerated as exact strings at startup time.
  // Match any *.replit.dev origin, with or without a port number appended.
  const ORIGIN_PATTERNS: RegExp[] = [/\.replit\.dev(:\d+)?$/];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        // Exact string match from env-derived whitelist
        if (allowedOrigins.includes(origin)) return callback(null, true);
        // Pattern match for dynamic Replit subdomains
        if (ORIGIN_PATTERNS.some((re) => re.test(origin))) return callback(null, true);
        logger.warn(
          { blockedOrigin: origin },
          "[SECURITY:CORS] Request blocked — origin not in whitelist"
        );
        // Return callback(null, false) — lets cors emit the correct 403 itself
        // without leaking an error stack into the response body.
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-CSRF-Token",
        "X-Report-Signature",
        "X-Request-ID",
      ],
      exposedHeaders: ["X-Request-ID", "X-RateLimit-Remaining"],
      maxAge: 86_400,
    })
  );

  app.use(cookieParser());

  /* ── HTTP response compression (gzip/brotli) ──────────────────────────────
     Applied after cookieParser and before the API router.
     - level 6: balanced speed/ratio (zlib default is 6)
     - threshold 1024: skip compression for responses < 1 KB (health, tiny 204s)
     - x-no-compression: opt-out header for internal/proxy calls that handle
       their own compression or need raw bytes (e.g. binary stream proxies)
     - Proxy paths skipped: already served by upstream Vite dev servers. */
  app.use(
    compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        const url = req.originalUrl ?? req.url ?? "";
        if (
          url === "/health" ||
          url.startsWith("/admin") ||
          url.startsWith("/vendor") ||
          url.startsWith("/rider") ||
          url.startsWith("/customer") ||
          url.startsWith("/__mockup")
        ) {
          return false;
        }
        return compression.filter(req, res);
      },
    }) as unknown as express.RequestHandler
  );

  /* Capture raw body bytes on every JSON request so endpoints that rely on
     request signing (e.g. /api/error-reports HMAC-SHA256 verification) can
     hash the exact bytes the client signed, regardless of JSON formatting
     differences.
     Limit: 10 KB for the API generally (oversized payloads → 413).
     Error-report ingest paths get 256 KB — registered FIRST so body-parser's
     req._body flag is set before the global 10 KB parser runs, causing the
     smaller parser to skip these already-parsed requests. */
  const rawBodyCapture = (req: express.Request, _res: express.Response, buf: Buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
  };
  app.use(
    ["/api/error-reports", "/api/admin/error-reports"],
    express.json({ limit: "256kb", verify: rawBodyCapture })
  );
  app.use(express.json({ limit: "10kb", verify: rawBodyCapture }));
  app.use(express.urlencoded({ extended: true, limit: "10kb" }));

  /* ── XSS input sanitisation ──────────────────────────────────────────────
     Strips all HTML tags and attributes from every string value in req.body
     so downstream handlers never see <script>, event handlers, or any markup.
     Runs after body parsers (needs a parsed object) and before all routes. */
  app.use(sanitizeBody);

  /* ── Root /health — rich DB+Redis check (same as /api/health) ───────────
     Uptime monitors and load balancers often probe the root /health path.
     We proxy to the full /api/health logic so both endpoints are meaningful. */
  app.get("/health", (_req, res) => {
    res.redirect(307, "/api/health");
  });

  /* ── Dev-only: hub landing page at exact "/" with one-click cards for
        every sibling app. Registered AFTER the prefix proxies so links to
        /admin/, /vendor/, /rider/, /customer/ still hit the right targets. */
  if (process.env.NODE_ENV !== "production") {
    app.get("/", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderHubPage());
    });
  }

  /* ── Request timeout guard ───────────────────────────────────────────────
     Requests that hang longer than REQUEST_TIMEOUT_MS (default 30 s) receive
     a 503 response and the socket is terminated. SSE streams and WebSocket
     upgrade requests are excluded so long-lived connections work normally. */
  const REQUEST_TIMEOUT_MS = parseInt(process.env["REQUEST_TIMEOUT_MS"] ?? "30000", 10);
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const isSSE = req.headers["accept"] === "text/event-stream";
    const isWsUpgrade = req.headers["upgrade"]?.toLowerCase() === "websocket";
    if (isSSE || isWsUpgrade) {
      next();
      return;
    }

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(
          { method: req.method, url: req.originalUrl, timeoutMs: REQUEST_TIMEOUT_MS },
          "[timeout] Request timed out — returning 503"
        );
        res.status(503).json({ success: false, error: "Request timeout. Please try again." });
      }
    }, REQUEST_TIMEOUT_MS);
    timer.unref();

    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    next();
  });

  /* ── Public Swagger UI at /api-docs (read-only, tryItOut disabled) ─────
     Mounted at the root level so the URL is /api-docs, NOT /api/api-docs.
     The admin-gated /api/docs (docs.ts YAML route) is left untouched. */
  app.use(
    "/api-docs",
    // @ts-ignore -- swagger-ui-express serve array doesn't satisfy Express 5 overloads; runtime behavior is correct
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: "AJKMart API Docs",
      customCss: `
        .swagger-ui .topbar { background: #1e293b; border-bottom: 1px solid #334155; }
        .swagger-ui .topbar-wrapper img { display: none; }
        .swagger-ui .topbar-wrapper::before {
          content: "AJKMart API Docs";
          color: #a5b4fc;
          font-weight: 700;
          font-size: 1.1rem;
          font-family: system-ui, sans-serif;
          margin-left: 4px;
        }
        .swagger-ui { font-family: system-ui, sans-serif; }
        body { background: #0f172a; }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: false,
        deepLinking: true,
      },
    })
  );

  /* ── Cache-Control headers for public / private API routes ───────────────
     Set before the router so headers are present on all matching responses.
     - Public static data (categories, banners, platform-config): 5 min CDN cache
       with stale-while-revalidate so clients never wait on a slow origin fetch.
     - Auth endpoints: no-store to prevent credential/token caching anywhere.
     - Wallet/orders: private, no-store — financial data must never be shared. */
  app.use((req, res, next) => {
    if (
      req.path.startsWith("/api/categories") ||
      req.path.startsWith("/api/banners") ||
      req.path.startsWith("/api/platform-config")
    ) {
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    } else if (req.path.startsWith("/api/auth")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    } else if (req.path.startsWith("/api/wallet") || req.path.startsWith("/api/orders")) {
      res.setHeader("Cache-Control", "private, no-store");
    }
    next();
  });

  app.use("/api", (req, res, next) => {
    if (req.path === "/health" || req.path.startsWith("/health/")) return next();
    return globalLimiter(req, res, next);
  });
  app.use("/api/uploads", uploadLimiter);
  app.use("/api", suspiciousPatternDetector);
  app.use("/api", router);

  /* ── JSON 404 for unmatched /api/* routes ─────────────────────────────── */
  app.use("/api/*path", (req: express.Request, res: express.Response) => {
    res.status(404).json({
      success: false,
      error: `API route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  /* ── Sentry error handler (must be mounted BEFORE the generic error handler) */
  {
    const sentryMod = (globalThis as Record<string, unknown>)["__sentryInstance"] as
      | Record<string, unknown>
      | undefined;
    if (sentryMod && typeof sentryMod["Handlers"] === "object" && sentryMod["Handlers"]) {
      const handlers = sentryMod["Handlers"] as Record<string, unknown>;
      if (typeof handlers["errorHandler"] === "function") {
        app.use((handlers["errorHandler"] as () => express.ErrorRequestHandler)());
      }
    }
  }

  /* ── Global Express error handler ──────────────────────────────────────
     Catches any error passed to next(err) from route handlers or middleware.
     Never leaks stack traces or internal messages to the client in production. */
  app.use(
    (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error(
        { err, method: req.method, url: req.originalUrl },
        "[error] Unhandled route error"
      );
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Internal server error" });
      }
    }
  );

  /* ── Favicon: return 204 so browsers stop logging 502 errors ─────────── */
  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  /* ── Dev-only fallback: proxy any remaining non-/api request to the
        Expo (customer / ajkmart) dev server, which serves the customer app
        at the root path. Only kicks in in development, AFTER the
        /admin /vendor /rider /__mockup proxies and the /api router. ─────── */
  if (process.env.NODE_ENV !== "production") {
    const expoTarget = `http://localhost:${process.env.EXPO_DEV_PORT ?? "20716"}`;
    const expoProxy = createProxyMiddleware({
      target: expoTarget,
      changeOrigin: true,
      ws: true,
      xfwd: false,
      logger: undefined,
      pathFilter: (pathname) =>
        pathname !== "/" &&
        pathname !== "/health" &&
        !pathname.startsWith("/api") &&
        !pathname.startsWith("/admin") &&
        !pathname.startsWith("/vendor") &&
        !pathname.startsWith("/rider") &&
        !pathname.startsWith("/customer") &&
        !pathname.startsWith("/__mockup"),
      on: {
        error: (err, _req, res) => {
          if (
            res &&
            "writeHead" in res &&
            !(res as unknown as { headersSent?: boolean }).headersSent
          ) {
            (
              res as unknown as {
                writeHead: (code: number, headers: Record<string, string>) => void;
              }
            ).writeHead(502, { "Content-Type": "text/plain" });
            (res as unknown as { end: (body: string) => void }).end(
              `Dev proxy error for EXPO → ${expoTarget}\n${(err as Error).message}\n` +
                `Make sure the ajkmart (expo) workflow is running.`
            );
          }
        },
      },
    });
    app.use(expoProxy as unknown as express.RequestHandler);
  }

  return app;
}

function renderHubPage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AJKMart — Project Hub</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#0f172a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;font-family:system-ui,sans-serif}
        .max-w{max-width:56rem;width:100%}
        header{text-align:center;margin-bottom:3rem}
        h1{font-size:2.25rem;font-weight:800;letter-spacing:-.025em;margin-bottom:.5rem}
        .sub{color:#94a3b8;font-size:1.125rem}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1.5rem}
        a.card{display:block;padding:1.5rem;background:#1e293b;border-radius:1rem;border:1px solid #334155;text-decoration:none;transition:border-color .2s}
        a.card:hover{border-color:#6366f1}
        a.card.green:hover{border-color:#10b981}
        a.card.amber:hover{border-color:#f59e0b}
        a.card.rose:hover{border-color:#f43f5e}
        a.card.sky:hover{border-color:#0ea5e9}
        h3{font-size:1.125rem;font-weight:700;margin-bottom:.5rem;color:#e2e8f0}
        p.desc{color:#94a3b8;font-size:.875rem}
        footer{text-align:center;color:#475569;font-size:.875rem;margin-top:3rem}
      </style>
    </head>
    <body>
      <div class="max-w">
        <header>
          <h1>AJKMart</h1>
          <p class="sub">Pakistan's Premium Multi-Service Platform</p>
        </header>
        <div class="grid">
          <a href="/admin/" class="card"><h3>Admin Panel</h3><p class="desc">Fleet management, financial reconciliation, and platform settings.</p></a>
          <a href="/vendor/" class="card green"><h3>Vendor App</h3><p class="desc">Store management, order fulfillment, and inventory tracking.</p></a>
          <a href="/rider/" class="card amber"><h3>Rider App</h3><p class="desc">Real-time ride dispatch, GPS tracking, and delivery logistics.</p></a>
          <a href="/customer/" class="card rose"><h3>Customer App</h3><p class="desc">Marketplace, ride booking, and digital wallet (Expo/Web).</p></a>
          <a href="/api/docs" class="card sky"><h3>API Documentation</h3><p class="desc">Interactive Swagger UI for the backend REST endpoints.</p></a>
          <a href="/__mockup/" class="card"><h3>Component Preview</h3><p class="desc">Sandbox for UI components and design system verification.</p></a>
        </div>
        <footer>AJKMart Dev Hub &bull; ${new Date().getFullYear()}</footer>
      </div>
    </body>
    </html>
  `;
}
