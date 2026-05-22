import pino from "pino";
import { requestContext } from "../middleware/request-context.js";

const isProduction = process.env.NODE_ENV === "production";

/** Raw pino instance — used by pino-http so it shares the same config. */
export const pinoInstance = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "req.body.phone",
    "req.body.password",
    "req.body.cnic",
    "req.body.nationalId",
    "req.body.email",
    "req.body.otp",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

export interface AppLogger {
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(...args: unknown[]): void;
  child(bindings: Record<string, unknown>): AppLogger;
}

/**
 * The base logger — use when outside a request context (startup, background
 * tasks, scheduled jobs) where no AsyncLocalStorage context exists.
 */
export const logger: AppLogger = pinoInstance as unknown as AppLogger;

/**
 * Returns a context-aware child logger enriched with the current request's
 * `requestId`, `userId`, `role`, and `ip` from AsyncLocalStorage.
 *
 * Falls back to the base logger when called outside a request context (e.g.
 * startup tasks, cron jobs) so callers don't need to guard for undefined.
 *
 * Usage in route handlers / services:
 * ```ts
 * import { getLogger } from "../lib/logger.js";
 *
 * const log = getLogger();
 * log.info("Order created");
 * // → { requestId: "abc-123", userId: "u_x", role: "customer",
 * //     ip: "1.2.3.4", msg: "Order created" }
 * ```
 */
export function getLogger(): AppLogger {
  const ctx = requestContext.getStore();
  if (!ctx) return logger;
  return logger.child({
    requestId: ctx.requestId,
    ...(ctx.userId && { userId: ctx.userId }),
    ...(ctx.role && { role: ctx.role }),
    ip: ctx.ip,
  }) as AppLogger;
}
