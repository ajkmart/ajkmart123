/**
 * Sentry error monitoring — Web-only for Expo.
 * Uses @sentry/browser loaded via conditional dynamic import on web.
 * For native mobile, use @sentry/react-native with the expo plugin.
 */
import { Platform } from "react-native";
import { createLogger } from "@/utils/logger";
const log = createLogger("[Sentry]");

let _initialized = false;

type SentryBrowserModule = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown) => void;
  setUser: (user: { id?: string; email?: string } | null) => void;
};

let _sentry: SentryBrowserModule | null = null;

export async function initSentry(
  dsn: string,
  environment: string,
  sampleRate: number,
): Promise<void> {
  if (!dsn || _initialized || Platform.OS !== "web") return;
  _initialized = true;

  try {
    const Sentry = await import("@sentry/browser");
    _sentry = Sentry as unknown as SentryBrowserModule;
    _sentry.init({
      dsn,
      environment: environment || "production",
      sampleRate: sampleRate ?? 1.0,
      tracesSampleRate: 0.1,
    });
  } catch (e) {
    log.warn("Sentry init error:", e);
    _initialized = false;
    _sentry = null;
  }
}

export function captureError(err: unknown): void {
  if (!_initialized || Platform.OS !== "web" || !_sentry) return;
  _sentry.captureException(err);
}

export function setSentryUser(id: string, email?: string): void {
  if (!_initialized || Platform.OS !== "web" || !_sentry) return;
  _sentry.setUser({ id, email });
}

export function clearSentryUser(): void {
  if (!_initialized || Platform.OS !== "web" || !_sentry) return;
  _sentry.setUser(null);
}
