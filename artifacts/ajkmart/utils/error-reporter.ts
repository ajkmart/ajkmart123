/* eslint-disable no-console */
import { Platform } from "react-native";
import { API_BASE } from "./api";

const SOURCE_APP = "customer";
let _initialized = false;
let _queue: Record<string, unknown>[] = [];
let _flushing = false;

async function sendReport(report: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${API_BASE}/error-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
  // eslint-disable-next-line ajk-local/no-silent-catch -- error reporting must never throw (would cause infinite error loops)
  } catch {}
}

async function flushQueue(): Promise<void> {
  if (_flushing || _queue.length === 0) return;
  _flushing = true;
  const batch = _queue.splice(0, 10);
  for (const report of batch) {
    await sendReport(report);
  }
  _flushing = false;
  if (_queue.length > 0) setTimeout(flushQueue, 1000);
}

function enqueue(report: Record<string, unknown>): void {
  _queue.push(report);
  if (_queue.length > 50) _queue.shift();
  setTimeout(flushQueue, 100);
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
  enqueue({
    sourceApp: SOURCE_APP,
    ...opts,
    errorMessage: (opts.errorMessage || "Unknown error").slice(0, 5000),
    stackTrace: opts.stackTrace?.slice(0, 50000),
    metadata: { ...opts.metadata, platform: Platform.OS },
  });
}

export function initErrorReporter(): void {
  if (_initialized) return;
  _initialized = true;

  if (Platform.OS === "web") {
    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      const err = event.reason;
      reportError({
        errorType: "unhandled_exception",
        errorMessage: err?.message || String(err) || "Unhandled promise rejection",
        stackTrace: err?.stack,
        functionName: "unhandledrejection",
      });
    });

    window.addEventListener("error", (event: ErrorEvent) => {
      reportError({
        errorType: "frontend_crash",
        errorMessage: event.message || "Window error",
        stackTrace: event.error?.stack,
        functionName: event.filename,
        metadata: { lineno: event.lineno, colno: event.colno },
      });
    });
  }

  const origConsoleError = console.error;
  const _recentConsoleErrors = new Map<string, number>();
  console.error = (...args: unknown[]) => {
    origConsoleError.apply(console, args);
    const msg = args.map(a => {
      if (a instanceof Error) return a.message;
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(" ");

    if (msg.includes("[ErrorReporter]") || msg.includes("error-reports")) return;

    const key = msg.slice(0, 200);
    const now = Date.now();
    const lastSeen = _recentConsoleErrors.get(key);
    if (lastSeen && now - lastSeen < 30000) return;
    _recentConsoleErrors.set(key, now);
    if (_recentConsoleErrors.size > 100) {
      const oldest = _recentConsoleErrors.keys().next().value;
      if (oldest) _recentConsoleErrors.delete(oldest);
    }

    reportError({
      errorType: "ui_error",
      errorMessage: msg.slice(0, 5000),
      functionName: "console.error",
      stackTrace: args.find((a): a is Error => a instanceof Error)?.stack,
    });
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
