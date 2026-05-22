import * as Sentry from "@sentry/react";

let _initialized = false;

export function initSentry(
  dsn: string,
  environment: string,
  sampleRate: number,
  tracesSampleRate: number
): void {
  const effectiveDsn = dsn || import.meta.env.VITE_SENTRY_DSN || "";
  if (!effectiveDsn || _initialized) return;
  _initialized = true;
  Sentry.init({
    dsn: effectiveDsn,
    environment: environment || "production",
    sampleRate: sampleRate ?? 1.0,
    tracesSampleRate: tracesSampleRate ?? 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!_initialized) return;
  Sentry.captureException(err, { extra: context });
}

export function setSentryUser(id: string | number, email?: string): void {
  if (!_initialized) return;
  Sentry.setUser({ id: String(id), email });
}

export function clearSentryUser(): void {
  if (!_initialized) return;
  Sentry.setUser(null);
}
