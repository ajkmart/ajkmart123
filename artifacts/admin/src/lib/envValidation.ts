/**
 * envValidation — startup audit of the `import.meta.env` values the
 * admin assumes exist. Warnings are emitted only in development mode
 * (import.meta.env.DEV) so production bundles remain silent. Called
 * once from App.tsx at module load time.
 *
 * Required keys (app relies on these; Vite always injects them):
 *   - BASE_URL  — app base path (Vite built-in, always present)
 *   - MODE      — "development" | "production" (Vite built-in)
 *
 * Optional VITE_* keys (features degrade gracefully when absent):
 *   - VITE_API_BASE_URL — absolute URL for the API; falls back to
 *                         window.location.origin/api when not set.
 *                         When present, must be a valid absolute URL.
 *
 * Any additional VITE_* keys added in future will be picked up
 * automatically by the dynamic sweep below.
 */
import { createLogger } from "@/lib/logger";
const log = createLogger("[admin envValidation]");

export interface AdminEnv {
  baseUrl: string;
  mode: string;
  apiBaseUrl: string | undefined;
  warnings: string[];
}

export function auditAdminEnv(): AdminEnv {
  const warnings: string[] = [];
  const env = import.meta.env as Record<string, unknown>;

  /* ── Built-in Vite keys ─────────────────────────────────────────── */
  const baseUrl =
    typeof env["BASE_URL"] === "string" && (env["BASE_URL"] as string).length > 0
      ? (env["BASE_URL"] as string)
      : "/";
  if (env["BASE_URL"] == null) {
    warnings.push("BASE_URL missing — defaulting to '/'");
  } else if (typeof env["BASE_URL"] !== "string") {
    warnings.push(`BASE_URL has unexpected type ${typeof env["BASE_URL"]} — defaulting to '/'`);
  }

  const mode = typeof env["MODE"] === "string" ? (env["MODE"] as string) : "production";
  if (typeof env["MODE"] !== "string") {
    warnings.push("MODE missing or non-string — defaulting to 'production'");
  }
  if (env["DEV"] !== undefined && typeof env["DEV"] !== "boolean") {
    warnings.push("DEV has unexpected type — expected boolean");
  }
  if (env["PROD"] !== undefined && typeof env["PROD"] !== "boolean") {
    warnings.push("PROD has unexpected type — expected boolean");
  }

  /* ── User-defined VITE_* keys ───────────────────────────────────── */
  // Walk every VITE_-prefixed entry and warn if any is declared in
  // `.env*` but resolved to an empty / non-string value at build time.
  // Optional keys (consumed via fallbacks) are skipped from the warning
  // sweep — only declared but malformed keys surface.
  const OPTIONAL_VITE_KEYS = new Set([
    /* `error-reporter.ts#getApiBase()` and `adminFetcher.tsx#API_BASE` fall
       back to same-origin (empty string) when this is not set — correct for
       Replit where admin and API share the same reverse-proxied domain. */
    "VITE_API_BASE_URL",
    /* Sentry DSN — when absent, Sentry is silently disabled. */
    "VITE_SENTRY_DSN",
    /* App version tag — defaults to "dev" when not injected at build time. */
    "VITE_APP_VERSION",
  ]);
  const viteKeys = Object.keys(env).filter((k) => k.startsWith("VITE_"));
  for (const key of viteKeys) {
    const v = env[key];
    if (v === undefined || v == null || v === "") {
      if (!OPTIONAL_VITE_KEYS.has(key)) {
        warnings.push(`${key} is empty — consumers may receive undefined`);
      }
    } else if (typeof v !== "string") {
      warnings.push(`${key} has unexpected type ${typeof v} — expected string`);
    }
  }

  /* ── VITE_API_BASE_URL structural check ─────────────────────────── */
  const apiBaseRaw = env["VITE_API_BASE_URL"];
  const apiBaseUrl =
    typeof apiBaseRaw === "string" && apiBaseRaw.trim() ? apiBaseRaw.trim() : undefined;

  if (apiBaseUrl) {
    try {
      new URL(apiBaseUrl);
    } catch {
      warnings.push(
        "VITE_API_BASE_URL is not a valid absolute URL — falling back to window.location.origin/api"
      );
    }
  }

  /* ── Emit warnings ──────────────────────────────────────────────── */
  if (warnings.length > 0) {
    log.warn("Environment issues detected:", warnings.join("; "));
  }

  return { baseUrl, mode, apiBaseUrl, warnings };
}
