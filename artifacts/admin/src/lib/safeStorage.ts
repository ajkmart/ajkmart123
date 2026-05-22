/**
 * safeStorage — graceful wrappers around localStorage and document.cookie.
 *
 * Browsers may throw when storage is disabled (private mode, restricted
 * cookies, quota exceeded, etc.). These wrappers log the failure with a
 * consistent prefix and return a typed result so callers can show a user
 * facing message when persistence is critical.
 */
import { createLogger } from "@/lib/logger";
const log = createLogger("[safeStorage]");

export interface SafeStorageResult {
  ok: boolean;
  error?: unknown;
}

export function safeLocalGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch (err) {
    log.error(`localStorage.getItem("${key}") failed:`, err);
    return null;
  }
}

export function safeLocalSet(key: string, value: string): SafeStorageResult {
  try {
    if (typeof localStorage === "undefined") {
      return { ok: false, error: new Error("localStorage unavailable") };
    }
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    log.error(`localStorage.setItem("${key}") failed:`, err);
    return { ok: false, error: err };
  }
}

export function safeLocalRemove(key: string): SafeStorageResult {
  try {
    if (typeof localStorage === "undefined") {
      return { ok: false, error: new Error("localStorage unavailable") };
    }
    localStorage.removeItem(key);
    return { ok: true };
  } catch (err) {
    log.error(`localStorage.removeItem("${key}") failed:`, err);
    return { ok: false, error: err };
  }
}

export function safeSessionGet(key: string): string | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null;
  } catch (err) {
    log.error(`sessionStorage.getItem("${key}") failed:`, err);
    return null;
  }
}

export function safeSessionSet(key: string, value: string): SafeStorageResult {
  try {
    if (typeof sessionStorage === "undefined") {
      return { ok: false, error: new Error("sessionStorage unavailable") };
    }
    sessionStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    log.error(`sessionStorage.setItem("${key}") failed:`, err);
    return { ok: false, error: err };
  }
}

export function safeSessionRemove(key: string): SafeStorageResult {
  try {
    if (typeof sessionStorage === "undefined") {
      return { ok: false, error: new Error("sessionStorage unavailable") };
    }
    sessionStorage.removeItem(key);
    return { ok: true };
  } catch (err) {
    log.error(`sessionStorage.removeItem("${key}") failed:`, err);
    return { ok: false, error: err };
  }
}

export interface CookieOptions {
  path?: string;
  maxAge?: number;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
}

export function safeCookieSet(
  name: string,
  value: string,
  opts: CookieOptions = {}
): SafeStorageResult {
  try {
    if (typeof document === "undefined") {
      return { ok: false, error: new Error("document unavailable") };
    }
    const parts = [`${name}=${value}`];
    if (opts.path) parts.push(`path=${opts.path}`);
    if (typeof opts.maxAge === "number") parts.push(`max-age=${opts.maxAge}`);
    if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
    if (opts.secure) parts.push("Secure");
    document.cookie = parts.join("; ");
    return { ok: true };
  } catch (err) {
    log.error(`cookie set "${name}" failed:`, err);
    return { ok: false, error: err };
  }
}
