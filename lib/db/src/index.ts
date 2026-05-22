import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

/**
 * Shared PostgreSQL connection pool.
 *
 * Tuning rationale:
 *  - max 20: safe ceiling for a single-process server; above 25 risks hitting
 *    Replit/managed-PG per-role connection limits.
 *  - min 2: keeps two warm connections alive so the first cold request after
 *    a period of inactivity never blocks on TCP + TLS + auth handshake.
 *  - idleTimeoutMillis 30 s: reclaim idle connections quickly so the DB-side
 *    max_connections headroom stays available for other processes.
 *  - connectionTimeoutMillis 5 s: fail fast rather than queue indefinitely;
 *    the caller's request can return a 503 immediately.
 *  - statement_timeout 10 s: hard server-side kill for runaway queries that
 *    would otherwise hold a connection and a transaction lock forever.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});

pool.on("error", (err) => {
  console.error("[db-pool] Unexpected client error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
