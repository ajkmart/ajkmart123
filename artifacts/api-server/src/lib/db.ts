import { buildPgPoolConfig } from "@workspace/db/connection-url";
import * as schema from "@workspace/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { logger } from "./logger.js";

const _require = createRequire(import.meta.url);

const databaseUrl = process.env.DATABASE_URL;
const isProduction = ["production", "staging"].includes(process.env.NODE_ENV ?? "");
const isDevMock = !process.env.VAULT_UNLOCKED && !isProduction && !databaseUrl;

let db: NodePgDatabase<typeof schema>;
let pool: Pool | undefined;

if (isDevMock) {
  logger.warn(
    "\x1b[33m[DEV MODE]\x1b[0m Running without vault — using local SQLite mock database.\n" +
      "          Run `pnpm --filter @workspace/scripts run decrypt-env` to unlock the full vault.\n" +
      "          Limited features available without a real PostgreSQL database.\n"
  );

  let sqliteDb: NodePgDatabase<typeof schema>;
  try {
    const BetterSqlite = _require("better-sqlite3");
    const { drizzle: drizzleSqlite } = _require("drizzle-orm/better-sqlite3");
    const sqlite = new BetterSqlite("./dev.db");
    sqliteDb = drizzleSqlite(sqlite, { schema }) as unknown as NodePgDatabase<typeof schema>;
    logger.info("[DEV MODE] SQLite mock database initialised at ./dev.db");
  } catch (e) {
    logger.fatal(
      { err: e },
      "[DEV MODE] better-sqlite3 failed to load. " +
        "Run `pnpm approve-builds` to allow native build scripts, then `pnpm install`. " +
        "Or unlock the vault with `pnpm --filter @workspace/scripts run decrypt-env` and set DATABASE_URL."
    );
    process.exit(1);
  }
  db = sqliteDb!;
} else {
  if (!databaseUrl) {
    logger.fatal("❌ DATABASE_URL not set");
    process.exit(1);
  }
  logger.info({ urlLength: databaseUrl.length }, "✅ DB URL loaded");

  pool = new Pool({
    ...buildPgPoolConfig(databaseUrl),
    max: parseInt(process.env.DB_POOL_MAX ?? "25"),
    min: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 30000,
    query_timeout: 60000,
  });
  db = drizzle(pool, { schema });

  const telemetryInterval = setInterval(
    () => {
      if (pool) {
        logger.info(
          {
            totalConnections: pool.totalCount,
            idleConnections: pool.idleCount,
            waitingRequests: pool.waitingCount,
            timestamp: new Date().toISOString(),
          },
          "[db:pool] pool metrics"
        );
      }
    },
    5 * 60 * 1000
  );
  telemetryInterval.unref();

  let shutdownPromise: Promise<void> | null = null;
  const shutdownPool = (signal: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      if (!pool) return;
      logger.info(`[db:pool] ${signal} received — draining pool connections`);
      try {
        await pool.end();
        logger.info("[db:pool] Pool connections drained successfully");
      } catch (err) {
        logger.error({ err }, "[db:pool] Error draining pool connections");
      }
    })();
    return shutdownPromise;
  };

  process.on("SIGTERM", () => {
    void shutdownPool("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdownPool("SIGINT");
  });
}

export { db, pool };
