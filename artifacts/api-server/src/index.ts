import { execSync } from "child_process";
import "dotenv/config";
import { unlinkSync, writeFileSync } from "fs";
import net from "net";
import { createServer, runStartupTasks } from "./app.js";
import { logger } from "./lib/logger.js";
import { waitForRedisReady } from "./lib/redis.js";
import { initSocketIO } from "./lib/socketio.js";
import { startScheduler, stopScheduler } from "./scheduler.js";

/* ── Sentry error tracking ───────────────────────────────────────────────────
   Imported directly (no dynamic import) so initialization happens synchronously
   before any routes are registered, capturing startup errors too.
   Initialization is gated on SENTRY_DSN — if unset, Sentry is a no-op.
   Set SENTRY_DSN in the Replit Secrets panel to enable. */
import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: parseFloat(
      process.env.SENTRY_SAMPLE_RATE ?? (process.env.NODE_ENV === "production" ? "0.2" : "0")
    ),
    integrations: [],
  });
  (globalThis as Record<string, unknown>)["__sentryInstance"] = Sentry;
  logger.info("[sentry] Initialized successfully");
}

process.on("unhandledRejection", (reason, promise) => {
  logger.error("[UnhandledRejection] at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("[UncaughtException] Error:", err);
});

// ─── ENV FIRST-RUN CHECK ───────────────────────────────────────────────────
const CRITICAL_VARS = ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_MASTER_KEY"] as const;
const IMPORTANT_VARS = [
  "ADMIN_ACCESS_TOKEN_SECRET",
  "ADMIN_REFRESH_TOKEN_SECRET",
  "ADMIN_CSRF_SECRET",
  "ERROR_REPORT_HMAC_SECRET",
] as const;

/** Known dev placeholder JWT secret values — must not be used in production. */
const DEV_PLACEHOLDER_SECRETS = new Set([
  "70d7bbb271fc1cf1a6397e8407153c9212f0e27c4b1b38c3f56ec08701718bc3849fe94eebaaed82f47d1cd93830ca7fe3255983484582511c8860cbec76f7cb", // audit-ok
  "0bf96d92374ef22e78a01b29ee69c0356a06e30e3e194c75fa2458704d296412833291a297210a3b6037fc99e5f1c1117b0b8b8c358ff9aa9561c8aa3029b186", // audit-ok
  "e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e6f9a2b5c8d1e4f7a0b3c6d9e2", // audit-ok
  "f9a2b5c8d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e6f9", // audit-ok
  "dev-placeholder-jwt-secret",
  "dev-placeholder-jwt-secret-000000",
]);
const JWT_SECRET_VARS = [
  "JWT_SECRET",
  "ADMIN_JWT_SECRET",
  "ADMIN_ACCESS_TOKEN_SECRET",
  "ADMIN_REFRESH_TOKEN_SECRET",
  "ADMIN_REFRESH_SECRET",
  "ADMIN_SECRET",
  "VENDOR_JWT_SECRET",
  "RIDER_JWT_SECRET",
];

const DEV_PLACEHOLDER_JWT = "dev-placeholder-jwt-secret-000000";

function checkEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? "";
  const isProduction = ["production", "staging"].includes(nodeEnv);
  const isDevMock = !process.env.VAULT_UNLOCKED && !isProduction;

  /* Validate JWT secret strength (min 32 chars, must be hex or base64-like) */
  function validateJwtSecret(secretName: string, secretValue: string): string | null {
    if (!secretValue) return `${secretName} is empty`;
    if (secretValue.length < 32)
      return `${secretName} too short (min 32 chars, got ${secretValue.length})`;
    // Check if it's hex (most common for generated secrets)
    if (!/^[a-fA-F0-9]+$/.test(secretValue) && !/^[A-Za-z0-9+/=]+$/.test(secretValue)) {
      return `${secretName} has invalid format (must be hex or base64-like)`;
    }
    return null;
  }

  /* Validate encryption key strength */
  function validateEncryptionKey(keyValue: string): string | null {
    if (!keyValue) return "ENCRYPTION_MASTER_KEY is empty";
    if (keyValue.length < 32)
      return `ENCRYPTION_MASTER_KEY too short (min 32 chars, got ${keyValue.length})`;
    return null;
  }

  /* Warn loudly (fatal in production) if dev placeholder JWT secrets are in use */
  if (isProduction) {
    const placeholderVars = JWT_SECRET_VARS.filter(
      (k) => process.env[k] && DEV_PLACEHOLDER_SECRETS.has(process.env[k]!.toLowerCase())
    );
    if (placeholderVars.length > 0) {
      logger.fatal(
        { vars: placeholderVars },
        "[env:check] FATAL — dev placeholder JWT secrets detected in production. " +
          "Generate new secrets: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\" " +
          "and update them in the Replit Secrets panel before deploying."
      );
      process.exit(1);
    }

    // In production, validate all JWT secrets meet strength requirements
    const secretErrors: string[] = [];
    for (const k of JWT_SECRET_VARS) {
      const secret = process.env[k];
      if (secret) {
        const error = validateJwtSecret(k, secret);
        if (error) secretErrors.push(error);
      }
    }

    // Block known dev placeholder for ENCRYPTION_MASTER_KEY in production
    if (process.env.ENCRYPTION_MASTER_KEY === "dev-placeholder-master-key-0000000") {
      logger.fatal(
        "[env:check] FATAL — dev placeholder ENCRYPTION_MASTER_KEY detected in production. " +
          "Generate a real key: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
          "and update it in the Replit Secrets panel before deploying."
      );
      process.exit(1);
    }

    // Validate encryption key
    const encKey = process.env.ENCRYPTION_MASTER_KEY;
    if (encKey) {
      const encError = validateEncryptionKey(encKey);
      if (encError) secretErrors.push(encError);
    }

    if (secretErrors.length > 0) {
      logger.fatal(
        { errors: secretErrors },
        "[env:check] FATAL — weak or invalid secrets detected in production. " +
          "Generate proper secrets and update them in the Replit Secrets panel."
      );
      process.exit(1);
    }

    // Block ALLOW_DEV_OTP=true in production/staging — would leak plaintext OTP codes
    if (process.env["ALLOW_DEV_OTP"] === "true") {
      logger.fatal(
        { NODE_ENV: nodeEnv, ALLOW_DEV_OTP: "true" },
        "[env:check] FATAL — ALLOW_DEV_OTP=true is set in a production/staging environment. " +
          "This would expose plaintext OTP codes in API responses. " +
          "Remove ALLOW_DEV_OTP or set it to 'false' in the Replit Secrets panel before deploying."
      );
      process.exit(1);
    }
  }

  /* ── Dev-mock mode: vault not unlocked, not production ─────────────────────
     Substitute deterministic placeholder values for missing JWT secrets so
     Express middleware can initialise without throwing. DATABASE_URL is handled
     by db.ts which falls back to SQLite. Skip the fatal exit for missing vars. */
  if (isDevMock) {
    const substituted: string[] = [];
    for (const k of JWT_SECRET_VARS) {
      if (!process.env[k]) {
        process.env[k] = DEV_PLACEHOLDER_JWT;
        substituted.push(k);
      }
    }
    if (!process.env.ENCRYPTION_MASTER_KEY) {
      process.env.ENCRYPTION_MASTER_KEY = "dev-placeholder-master-key-0000000";
      substituted.push("ENCRYPTION_MASTER_KEY");
    }

    const hr = "═".repeat(66);
    const pad = (s: string) => `║  ${s.padEnd(63)}║`;
    const lines = [
      `╔${hr}╗`,
      pad("[DEV MODE] AJKMart API — running without vault"),
      `╠${hr}╣`,
      ...(substituted.length > 0
        ? [
            pad("Vault is locked. Placeholder values substituted for:"),
            ...substituted.map((k) => pad(`  • ${k}`)),
            pad(""),
            pad("Features limited: no real DB, no SMS/email, no push notifications."),
          ]
        : [pad("All secrets present — vault not required for this session.")]),
      pad(""),
      pad("To unlock: pnpm --filter @workspace/scripts run decrypt-env"),
      pad("           (or use the Setup workflow in Replit)"),
      `╚${hr}╝`,
    ];
    const logFn = substituted.length > 0 ? logger.warn.bind(logger) : logger.info.bind(logger);
    logFn("\n" + lines.join("\n") + "\n");
    return;
  }

  const missing = CRITICAL_VARS.filter((k) => !process.env[k]);
  const empty = IMPORTANT_VARS.filter((k) => !process.env[k]);

  if (missing.length === 0 && empty.length === 0) return;

  const hr = "═".repeat(66);
  const pad = (s: string) => `║  ${s.padEnd(63)}║`;

  const lines: string[] = [
    `╔${hr}╗`,
    pad("⚠️  AJKMart API — ENVIRONMENT NOT CONFIGURED"),
    `╠${hr}╣`,
  ];

  if (missing.length > 0) {
    lines.push(pad("CRITICAL (server will not function correctly):"));
    for (const k of missing) lines.push(pad(`  ✗ ${k}`));
    lines.push(pad(""));
  }

  if (empty.length > 0) {
    lines.push(pad("MISSING (features may break or be insecure):"));
    for (const k of empty) lines.push(pad(`  ! ${k}`));
    lines.push(pad(""));
  }

  lines.push(`╠${hr}╣`);
  lines.push(pad("To fix:"));
  lines.push(pad(""));
  lines.push(pad("  On Replit:  add secrets in the Secrets panel (padlock icon)"));
  lines.push(pad("  Other envs: set values in your .env file at the project root"));
  lines.push(pad(""));
  lines.push(pad("  Then restart:   click the Run button (or restart workflow)"));
  lines.push(pad("  DATABASE_URL:   add PostgreSQL URL in Replit Secrets panel"));
  lines.push(`╚${hr}╝`);

  logger.error("\n" + lines.join("\n") + "\n");

  if (isProduction && missing.length > 0) {
    logger.error("[env:check] FATAL — critical vars missing in production. Exiting.");
    process.exit(1);
  }

  if (!isProduction && missing.length > 0) {
    logger.warn("[env:check] Development mode — continuing despite missing critical vars.");
    logger.warn("[env:check] Add missing secrets in the Replit Secrets panel, then restart.\n");
  }

  /* ── Recommended-but-optional vars ─────────────────────────────────────────
     These degrade specific features when absent but never block startup.      */
  const RECOMMENDED_VARS = ["ALLOWED_ORIGINS", "SENTRY_DSN", "REDIS_URL"] as const;
  const missingRecommended = RECOMMENDED_VARS.filter((v) => !process.env[v]);
  if (missingRecommended.length > 0) {
    logger.warn(
      { missingRecommended },
      "[env:check] Recommended env vars not set — some features may be limited (CORS auto-detect, error tracking, session caching)"
    );
  }
}

checkEnv();
// ──────────────────────────────────────────────────────────────────────────

// Configuration from environment variables
const PORT = parseInt(process.env.PORT ?? "5000", 10);
const PORT_FALLBACK_ENABLE = (process.env.PORT_FALLBACK_ENABLE ?? "true").toLowerCase() === "true";
const PORT_MAX_RETRIES = parseInt(process.env.PORT_MAX_RETRIES ?? "10", 10);

/**
 * Returns true if a TCP listener is already bound to the port.
 * @param p - Port number to check
 */
function isPortInUse(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        logger.debug(`[port:check] Port ${p} is in use (EADDRINUSE)`);
        resolve(true);
      } else {
        logger.warn(`[port:check] Unexpected error checking port ${p}:`, err.code, err.message);
        resolve(false);
      }
    });
    probe.once("listening", () => {
      probe.close(() => {
        logger.debug(`[port:check] Port ${p} is available`);
        resolve(false);
      });
    });
    probe.listen(p, "0.0.0.0");
  });
}

/**
 * Try to free the port by killing whatever process is using it.
 * @param p - Port number to free
 * @returns true if a process was killed, false otherwise
 */
function tryKillPort(p: number): boolean {
  try {
    // fuser is available via psmisc (declared in nix packages in .replit)
    execSync(`fuser -k ${p}/tcp`, { stdio: "ignore" });
    logger.info(`[port:kill] Freed port ${p} using fuser`);
    return true;
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[port:kill] fuser: no process on port ${p}`
    );
    return false;
  }
}

/**
 * Find the next available port starting from `start`.
 * @param start - Starting port number
 * @param maxAttempts - Maximum number of ports to try
 * @returns Available port number
 * @throws Error if no available port is found
 */
async function findAvailablePort(start: number, maxAttempts: number): Promise<number> {
  logger.info(
    `[port:search] Searching for available port starting from ${start} (max ${maxAttempts} attempts)`
  );
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = start + i;
    const inUse = await isPortInUse(candidate);
    if (!inUse) {
      logger.info(`[port:search] Found available port: ${candidate}`);
      return candidate;
    }
  }
  const error = `No available port found in range ${start}–${start + maxAttempts - 1}`;
  logger.error(`[port:search] ${error}`);
  throw new Error(error);
}

/**
 * Main server startup function with production-grade port handling.
 */
async function main() {
  let listenPort = PORT;

  logger.info(
    `[port:init] Primary port: ${PORT}, fallback enabled: ${PORT_FALLBACK_ENABLE}, max retries: ${PORT_MAX_RETRIES}`
  );

  // Check if primary port is available
  const occupied = await isPortInUse(PORT);
  if (occupied) {
    logger.warn(`[port:conflict] Port ${PORT} is already in use`);

    if (!PORT_FALLBACK_ENABLE) {
      logger.error(`[port:conflict] Port fallback is disabled — refusing to continue`);
      process.exit(1);
    }

    // Try to free the port
    logger.info(`[port:conflict] Attempting to free port ${PORT}…`);
    const killed = tryKillPort(PORT);
    if (killed) {
      // Give the OS a moment to release the port
      await new Promise((r) => setTimeout(r, 500));
      const stillOccupied = await isPortInUse(PORT);
      if (stillOccupied) {
        logger.warn(
          `[port:conflict] Port ${PORT} still occupied after killing process — falling back`
        );
        listenPort = await findAvailablePort(PORT + 1, PORT_MAX_RETRIES);
        logger.info(
          `[port:fallback] Using fallback port ${listenPort} instead of primary port ${PORT}`
        );
      } else {
        logger.info(`[port:conflict] Port ${PORT} successfully freed — using primary port`);
        listenPort = PORT;
      }
    } else {
      logger.info(
        `[port:conflict] Could not free port ${PORT} (no process to kill) — falling back`
      );
      listenPort = await findAvailablePort(PORT + 1, PORT_MAX_RETRIES);
      logger.info(
        `[port:fallback] Using fallback port ${listenPort} instead of primary port ${PORT}`
      );
    }
  } else {
    logger.info(`[port:check] Primary port ${PORT} is available`);
  }

  /* Redis startup connectivity check — fatal in production if unreachable */
  await waitForRedisReady();

  /* Seed runtime config from DB so a previously-rotated ADMIN_SECRET
     takes effect on restart without requiring an env-var change. */
  try {
    const { seedRuntimeConfigFromDb } = await import("./lib/runtime-config.js");
    await seedRuntimeConfigFromDb();
    logger.info("[runtime-config] Seeded from DB");
  } catch (e) {
    logger.warn({ err: e }, "[runtime-config] Seed failed — env var fallback will be used");
  }

  const server = await createServer();

  // Open the port FIRST so the platform's port detector sees a live listener
  // quickly. Migrations + RBAC seeding run immediately after; if they fail,
  // we exit non-zero so the platform restarts us.
  /* ── PID file — written so rotate-secrets can find this process ────────────
     Stored at /tmp/ajkmart-api.pid; cleaned up on any exit signal.          */
  const PID_FILE = "/tmp/ajkmart-api.pid";
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[route] intentional: non-fatal guard`
    );
  }
  process.on("exit", () => {
    try {
      unlinkSync(PID_FILE);
    } catch (err) {
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        `[route] intentional: ignore parse/parse error`
      );
    }
  });

  /* ── activeServer ref — updated once the bind succeeds so shutdown handlers
     always call close() on the real HTTP server.                              */
  let activeServer: ReturnType<typeof server.listen> | null = null;

  function bindServer(port: number, attempt = 1): void {
    const MAX_BIND_ATTEMPTS = 3;
    const BIND_RETRY_DELAY = 1000;

    const hs = server.listen(port, "0.0.0.0", () => {
      // Increase limit on the actual http.Server to accommodate
      // http-proxy-middleware close listeners (one per proxy route) plus
      // Socket.IO and shutdown handlers without triggering the default-10
      // MaxListenersExceededWarning.
      hs.setMaxListeners(50);
      activeServer = hs;
      const addr = hs.address();
      logger.info(
        `[server:listen] Server listening on port ${port} (addr=${JSON.stringify(addr)})`
      );

      /* ── Socket.IO initialisation — must run after the HTTP server is bound
         so Socket.IO can attach its engine to the live TCP socket.
         initSocketIO() is idempotent on repeat calls (returns cached instance). */
      initSocketIO(hs);
      logger.info("[socketio] Socket.IO initialised on path /api/socket.io");

      runStartupTasks()
        .then(() => {
          logger.info("[startup] migrations + RBAC ready — serving requests");
          startScheduler();
          logger.info("[startup] background scheduler started");
        })
        .catch((startErr: Error) => {
          logger.error("[startup] fatal — refusing to continue:", startErr);
          process.exit(1);
        });
    });

    hs.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attempt < MAX_BIND_ATTEMPTS) {
        logger.warn(
          `[server:error] Port ${port} in use (attempt ${attempt}/${MAX_BIND_ATTEMPTS}) — freeing and retrying in ${BIND_RETRY_DELAY}ms…`
        );
        tryKillPort(port);
        setTimeout(() => bindServer(port, attempt + 1), BIND_RETRY_DELAY);
      } else {
        logger.error(`[server:error] Failed to bind port ${port}:`, {
          code: err.code,
          message: err.message,
          errno: err.errno,
        });
        process.exit(1);
      }
    });
  }

  /* ── Startup summary — structured log of key config (no secret values) ───── */
  logger.info(
    {
      nodeEnv: process.env.NODE_ENV ?? "development",
      port: listenPort,
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
        : "(auto-detect from REPLIT_DEV_DOMAIN)",
      jwtSecret: process.env.JWT_SECRET ? "SET" : "MISSING",
      databaseUrl: process.env.DATABASE_URL ? "SET" : "MISSING",
      encryptionKey: process.env.ENCRYPTION_MASTER_KEY ? "SET" : "MISSING",
      sentryDsn: process.env.SENTRY_DSN ? "SET" : "not configured",
      redisUrl: process.env.REDIS_URL ? "SET" : "not configured",
    },
    "[startup:summary] AJKMart API server configuration"
  );

  bindServer(listenPort);

  /* ── httpServer shim — keeps shutdown handlers below working regardless of
     whether bindServer has resolved yet. If SIGTERM arrives before the bind
     completes we exit immediately (safe because the server isn't serving yet). */
  const httpServer = {
    close: (cb?: (err?: Error) => void) => {
      if (activeServer) {
        activeServer.close(cb);
      } else {
        cb?.();
      }
    },
  } as ReturnType<typeof server.listen>;

  /* ── Graceful shutdown ────────────────────────────────────────────────────
     On SIGTERM (container stop / platform restart) or SIGINT (Ctrl-C):
       1. Stop accepting new connections.
       2. Call stopScheduler() — clears all cleanup job timers and stops the
          ride dispatch engine, allowing in-flight DB queries to settle.
       3. Close existing HTTP connections, then exit cleanly.
  ───────────────────────────────────────────────────────────────────────── */
  const gracefulShutdown = (signal: string) => {
    logger.info(`[shutdown] ${signal} received — initiating graceful shutdown`);
    stopScheduler();
    httpServer.close((closeErr) => {
      if (closeErr) {
        logger.error("[shutdown] error closing HTTP server:", closeErr);
        process.exit(1);
      } else {
        logger.info("[shutdown] HTTP server closed — exiting");
        process.exit(0);
      }
    });
    /* Safety net: force-exit after 10 s if connections don't drain */
    setTimeout(() => {
      logger.error("[shutdown] graceful shutdown timed out — force exiting");
      process.exit(1);
    }, 10_000).unref();
  };

  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));

  /* ── SIGHUP — secret rotation reload ─────────────────────────────────────
     rotate-secrets sends SIGHUP after writing new secrets to .env.enc and
     .env.reload. We drain in-flight requests (30 s max) then exit cleanly.
     The workflow / PM2 auto-restarts the process; secure-start.mjs detects
     .env.reload on startup and applies the new secrets before spawning any
     service, giving zero-manual-intervention secret rotation.               */
  process.once("SIGHUP", () => {
    logger.info("[rotate] SIGHUP received — draining connections for secret rotation reload");
    stopScheduler();
    httpServer.close((closeErr) => {
      if (closeErr) {
        logger.error("[rotate] error closing HTTP server:", closeErr);
        process.exit(1);
      } else {
        logger.info("[rotate] connections drained — exiting for rotation restart");
        process.exit(0);
      }
    });
    /* Drain window: 30 s (more generous than normal shutdown's 10 s so
       long-lived WebSocket / SSE connections have time to close cleanly) */
    setTimeout(() => {
      logger.warn("[rotate] drain timeout reached — force exiting for rotation");
      process.exit(0);
    }, 30_000).unref();
  });
}

main().catch((err) => {
  logger.error("[startup] Unrecoverable error:", err);
  process.exit(1);
});
