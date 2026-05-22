/**
 * db-monitor.ts — Slow-query detection via Proxy wrapping.
 *
 * Usage:
 *   import { db as rawDb } from "@workspace/db";
 *   import { wrapDbWithMonitoring } from "./db-monitor.js";
 *   export const db = wrapDbWithMonitoring(rawDb);
 *
 * Every Drizzle method call is intercepted. If the resulting Promise settles
 * (fulfilled or rejected) after SLOW_QUERY_THRESHOLD_MS, a structured warning
 * is emitted to the pino logger so the slow query is visible in production logs
 * and can be picked up by log-based alerting.
 *
 * The Proxy only intercepts function properties so non-function members
 * (e.g. `db.query`, `db.$with`) are passed through as-is and retain the
 * correct `this` binding.
 */

import { logger } from "./logger.js";

/** Queries taking longer than this threshold (ms) will emit a warning. */
const SLOW_QUERY_THRESHOLD_MS = 500;

type AnyDb = Record<string | symbol, unknown>;

/**
 * Wraps a Drizzle `db` instance with slow-query monitoring.
 * The returned object is a transparent Proxy — all methods and properties
 * remain accessible unchanged; timing instrumentation is applied only to
 * methods that return a Promise.
 */
export function wrapDbWithMonitoring<T extends AnyDb>(db: T): T {
  return new Proxy(db, {
    get(target, prop) {
      const original = target[prop];

      if (typeof original !== "function") return original;

      return function (...args: unknown[]) {
        const start = Date.now();

        const result = (original as (...a: unknown[]) => unknown).apply(target, args);

        if (result instanceof Promise) {
          return result.finally(() => {
            const ms = Date.now() - start;
            if (ms > SLOW_QUERY_THRESHOLD_MS) {
              logger.warn({ ms, method: String(prop) }, "[db] Slow query detected");
            }
          });
        }

        return result;
      };
    },
  });
}
