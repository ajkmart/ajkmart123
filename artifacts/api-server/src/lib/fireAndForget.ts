import type { AppLogger } from "./logger.js";

/**
 * Executes an async operation in the background without blocking the caller.
 * Errors are caught and logged — the calling request continues regardless.
 *
 * The promise is NOT awaited. Errors are emitted at `warn` level with the
 * full structured schema `{ message, error, code, correlationId, timestamp }`.
 * This keeps the response fast while ensuring failures are visible in logs.
 *
 * @example
 * fireAndForget(emitWebhookEvent("order_delivered", payload), "webhook:order_delivered", logger);
 * fireAndForget(db.delete(...), "otp-cleanup", logger, { userId, correlationId });
 *
 * @param promise - The async operation to execute
 * @param label   - Identifier used in error logs (e.g. "auth:webhook:registered")
 * @param log     - Pino logger instance
 * @param meta    - Optional metadata added to error log (userId, code, etc.)
 */
export function fireAndForget(
  promise: Promise<unknown>,
  label: string,
  log: AppLogger,
  meta?: Record<string, unknown>
): void {
  promise.catch((err: unknown) => {
    const message = `[fireAndForget] ${label} failed`;
    log.warn(
      {
        label,
        message,
        error: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string }).code ?? "FIRE_AND_FORGET_ERROR",
        correlationId: meta?.["correlationId"] ?? null,
        timestamp: new Date().toISOString(),
        ...meta,
      },
      message
    );
  });
}
