import { getAdminTiming } from "./adminTiming";

const SOURCE_APP = "admin";
let _initialized = false;
const _queue: Array<Record<string, unknown>> = [];
let _flushing = false;

/** Deduplicate window.error and unhandledrejection events (not just console.error) */
const _recentEventErrors = new Map<string, number>();

/**
 * Resolve the admin API base URL.
 *
 * Priority:
 *   1. `VITE_API_BASE_URL` env var (e.g. `https://api.example.com/api`)
 *      — set this in `.env` when the admin is deployed on a different
 *      origin than the API server.
 *   2. `${window.location.origin}/api` — default for the in-monorepo
 *      sibling-proxy setup (admin and api share an origin).
 */
function getApiBase(): string {
  const env = import.meta.env as Record<string, unknown>;
  const override = env.VITE_API_BASE_URL;
  if (typeof override === "string" && override.trim()) {
    return override.trim().replace(/\/$/, "");
  }
  return `${window.location.origin}/api`;
}

/**
 * DJB2-variant hash for deterministic error fingerprinting.
 * Used to deduplicate identical errors before sending to the server.
 */
function computeErrorHash(errorMessage: string, errorType: string): string {
  const key = `${errorType}::${SOURCE_APP}::${errorMessage.slice(0, 300)}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function isDuplicate(hash: string): boolean {
  const t = getAdminTiming();
  const now = Date.now();
  const last = _recentEventErrors.get(hash);
  if (last !== undefined && now - last < t.errorReporterDedupWindowMs) return true;
  _recentEventErrors.set(hash, now);
  if (_recentEventErrors.size > t.errorReporterMessageKeyMax) {
    const oldest = _recentEventErrors.keys().next().value;
    if (oldest) _recentEventErrors.delete(oldest);
  }
  return false;
}

async function computeHmacSignature(body: string): Promise<string | null> {
  const env = import.meta.env as Record<string, unknown>;
  const secret = env.VITE_ERROR_REPORT_HMAC_SECRET;
  if (typeof secret !== "string" || !secret.trim()) return null;
  try {
    const enc = new TextEncoder();
    const key = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(secret.trim()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await window.crypto.subtle.sign("HMAC", key, enc.encode(body));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

async function sendReport(report: Record<string, unknown>): Promise<void> {
  try {
    const body = JSON.stringify(report);
    const sig = await computeHmacSignature(body);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sig) headers["x-report-signature"] = sig;
    await fetch(`${getApiBase()}/error-reports`, {
      method: "POST",
      headers,
      body,
    });
  } catch (err) {
    console.error("[ErrorReporter] Failed to send error report:", err);
  }
}

async function flushQueue(): Promise<void> {
  if (_flushing || _queue.length === 0) return;
  _flushing = true;
  const batch = _queue.splice(0, 10);
  for (const report of batch) {
    await sendReport(report);
  }
  _flushing = false;
  if (_queue.length > 0) setTimeout(flushQueue, getAdminTiming().errorReporterFlushDelayMs);
}

function enqueue(report: Record<string, unknown>): void {
  const t = getAdminTiming();
  _queue.push(report);
  if (_queue.length > t.errorReporterQueueMax) _queue.shift();
  setTimeout(flushQueue, t.errorReporterEnqueueDelayMs);
}

export function reportError(opts: {
  errorType: "frontend_crash" | "api_error" | "ui_error" | "unhandled_exception";
  errorMessage: string;
  functionName?: string;
  moduleName?: string;
  componentName?: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
  statusCode?: number;
}): void {
  const t = getAdminTiming();
  const message = (opts.errorMessage || "Unknown error").slice(0, t.errorReporterMessageMax);
  const hash = computeErrorHash(message, opts.errorType);

  enqueue({
    sourceApp: SOURCE_APP,
    ...opts,
    errorMessage: message,
    stackTrace: opts.stackTrace?.slice(0, t.errorReporterStackMax),
    errorHash: hash,
  });
}

export function initErrorReporter(): void {
  if (_initialized) return;
  _initialized = true;

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const err = event.reason;
    const msg = err?.message || String(err) || "Unhandled promise rejection";
    const hash = computeErrorHash(msg, "unhandled_exception");
    if (isDuplicate(hash)) return;
    reportError({
      errorType: "unhandled_exception",
      errorMessage: msg,
      stackTrace: err?.stack,
      functionName: "unhandledrejection",
    });
  });

  window.addEventListener("error", (event: ErrorEvent) => {
    const msg = event.message || "Window error";
    const hash = computeErrorHash(msg, "frontend_crash");
    if (isDuplicate(hash)) return;
    reportError({
      errorType: "frontend_crash",
      errorMessage: msg,
      stackTrace: event.error?.stack,
      functionName: event.filename,
      metadata: { lineno: event.lineno, colno: event.colno },
    });
  });

  const origConsoleError = console.error;
  const _recentConsoleErrors = new Map<string, number>();
  let _intercepting = false;
  console.error = (...args: unknown[]) => {
    origConsoleError.apply(console, args);
    if (_intercepting) return;
    const msg = args
      .map((a) => {
        if (a instanceof Error) return a.message;
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");

    if (msg.includes("[ErrorReporter]") || msg.includes("error-reports")) return;

    const t = getAdminTiming();
    const key = msg.slice(0, t.errorReporterMessageKeyMax);
    const now = Date.now();
    const lastSeen = _recentConsoleErrors.get(key);
    if (lastSeen && now - lastSeen < t.errorReporterDedupWindowMs) return;
    _recentConsoleErrors.set(key, now);
    if (_recentConsoleErrors.size > t.errorReporterRecentMax) {
      const oldest = _recentConsoleErrors.keys().next().value;
      if (oldest) _recentConsoleErrors.delete(oldest);
    }

    _intercepting = true;
    try {
      reportError({
        errorType: "ui_error",
        errorMessage: msg.slice(0, t.errorReporterMessageMax),
        functionName: "console.error",
        stackTrace: args.find((a): a is Error => a instanceof Error)?.stack,
      });
    } finally {
      _intercepting = false;
    }
  };
}

export function reportApiError(path: string, status: number, message: string): void {
  reportError({
    errorType: "api_error",
    errorMessage: message,
    functionName: path,
    moduleName: "API Call",
    statusCode: status,
    metadata: { path, status },
  });
}
