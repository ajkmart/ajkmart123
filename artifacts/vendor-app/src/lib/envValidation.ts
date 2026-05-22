/**
 * envValidation — startup audit of VITE_* environment variables for the
 * vendor app. Warnings are emitted only in development mode (import.meta.env.DEV)
 * so production bundles remain silent. Called once from main.tsx at boot.
 *
 * Required keys (app will degrade if missing):
 *   - VITE_API_BASE_URL      — absolute base URL for the API (required when
 *                              VITE_CAPACITOR=true; optional in web-proxy mode)
 *   - VITE_API_PROXY_TARGET  — dev proxy target (optional; dev warning only)
 *
 * Optional keys (features degrade gracefully when absent):
 *   - VITE_CAPACITOR              — "true" when running as a Capacitor native app
 *   - VITE_FIREBASE_API_KEY       — enables FCM push notifications
 *   - VITE_FIREBASE_AUTH_DOMAIN
 *   - VITE_FIREBASE_PROJECT_ID
 *   - VITE_FIREBASE_STORAGE_BUCKET
 *   - VITE_FIREBASE_MESSAGING_SENDER_ID
 *   - VITE_FIREBASE_APP_ID
 */
import { createLogger } from "@/lib/logger";
const _envLog = createLogger("[vendor envValidation]");

export interface VendorEnv {
  apiBaseUrl: string | undefined;
  apiProxyTarget: string | undefined;
  isCapacitor: boolean;
  firebase: {
    apiKey: string | undefined;
    authDomain: string | undefined;
    projectId: string | undefined;
    storageBucket: string | undefined;
    messagingSenderId: string | undefined;
    appId: string | undefined;
    enabled: boolean;
  };
  baseUrl: string;
  mode: string;
  warnings: string[];
}

function _buildVendorEnv(): VendorEnv {
  const warnings: string[] = [];
  const env = import.meta.env as Record<string, unknown>;

  const isCapacitor = env["VITE_CAPACITOR"] === "true";

  const apiBaseUrl =
    typeof env["VITE_API_BASE_URL"] === "string" && (env["VITE_API_BASE_URL"] as string).trim()
      ? (env["VITE_API_BASE_URL"] as string).trim()
      : undefined;

  if (isCapacitor && !apiBaseUrl) {
    warnings.push("VITE_API_BASE_URL is required when VITE_CAPACITOR=true — API calls will fail");
  } else if (apiBaseUrl) {
    try {
      new URL(apiBaseUrl);
    } catch {
      warnings.push("VITE_API_BASE_URL is not a valid absolute URL — API calls may fail");
    }
  }

  const apiProxyTarget =
    typeof env["VITE_API_PROXY_TARGET"] === "string" &&
    (env["VITE_API_PROXY_TARGET"] as string).trim()
      ? (env["VITE_API_PROXY_TARGET"] as string).trim()
      : undefined;

  if (!apiProxyTarget && !apiBaseUrl) {
    warnings.push(
      "Neither VITE_API_PROXY_TARGET nor VITE_API_BASE_URL is set — API proxy may point to wrong host"
    );
  }

  const firebaseApiKey =
    typeof env["VITE_FIREBASE_API_KEY"] === "string" &&
    (env["VITE_FIREBASE_API_KEY"] as string).trim()
      ? (env["VITE_FIREBASE_API_KEY"] as string).trim()
      : undefined;

  const getOptionalStr = (key: string): string | undefined => {
    const v = env[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const firebase = {
    apiKey: firebaseApiKey,
    authDomain: getOptionalStr("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: getOptionalStr("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: getOptionalStr("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getOptionalStr("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getOptionalStr("VITE_FIREBASE_APP_ID"),
    enabled: !!firebaseApiKey,
  };

  const baseUrl =
    typeof env["BASE_URL"] === "string" && (env["BASE_URL"] as string).length > 0
      ? (env["BASE_URL"] as string)
      : "/";

  const mode = typeof env["MODE"] === "string" ? (env["MODE"] as string) : "production";

  if (warnings.length > 0) {
    _envLog.warn("Environment issues detected:", warnings.join("; "));
  }

  return { apiBaseUrl, apiProxyTarget, isCapacitor, firebase, baseUrl, mode, warnings };
}

/** Singleton — computed once at module load, reused by all importers. */
export const vendorEnv: VendorEnv = _buildVendorEnv();

/**
 * True in Vite dev-server builds; false in production bundles.
 * Exported so callers don't read import.meta.env.DEV directly.
 */
export const vendorIsDev: boolean = import.meta.env.DEV;

/** Convenience alias used in main.tsx for the startup audit side-effect. */
export function auditVendorEnv(): VendorEnv {
  return vendorEnv;
}

/**
 * Returns the computed API base string consumed by api.ts.
 * Capacitor native builds use the absolute VITE_API_BASE_URL; web-proxy
 * mode uses the relative path through the Vite dev proxy / express.
 */
export function getVendorApiBase(): string {
  return vendorEnv.isCapacitor && vendorEnv.apiBaseUrl
    ? `${vendorEnv.apiBaseUrl.replace(/\/+$/, "")}/api`
    : `/api`;
}
