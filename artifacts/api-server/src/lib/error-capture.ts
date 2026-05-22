import { db } from "@workspace/db";
import { errorReportsTable } from "@workspace/db/schema";
import { generateId } from "./id.js";
import { logger } from "./logger.js";

type ErrorType =
  | "frontend_crash"
  | "api_error"
  | "db_error"
  | "route_error"
  | "ui_error"
  | "unhandled_exception";

interface CaptureOpts {
  errorType: ErrorType;
  errorMessage: string;
  statusCode?: number;
  functionName?: string;
  moduleName?: string;
  componentName?: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
}

function classifySeverity(
  errorType: ErrorType,
  statusCode?: number,
  msg?: string
): "critical" | "medium" | "minor" {
  if (errorType === "db_error") return "critical";
  if (errorType === "frontend_crash") return "critical";
  if (errorType === "ui_error") return "minor";
  if (errorType === "unhandled_exception") return "medium";

  const lower = (msg || "").toLowerCase();
  if (lower.includes("auth") || lower.includes("payment") || lower.includes("database"))
    return "critical";

  if (statusCode && statusCode >= 500) return "critical";
  if (statusCode === 422 || statusCode === 400) return "minor";
  if (statusCode && statusCode >= 400) return "medium";

  return "medium";
}

const DB_ERROR_PATTERNS = [
  /relation .* does not exist/i,
  /column .* does not exist/i,
  /connection refused/i,
  /connection terminated/i,
  /deadlock detected/i,
  /duplicate key/i,
  /violates.*constraint/i,
  /ECONNREFUSED/i,
  /database/i,
  /drizzle/i,
  /pg_/i,
];

export function detectErrorType(error: unknown, fallbackType: ErrorType): ErrorType {
  const msg = error instanceof Error ? error.message : String(error);
  if (DB_ERROR_PATTERNS.some((p) => p.test(msg))) return "db_error";
  return fallbackType;
}

function classifyImpact(errorType: ErrorType, severity: string): string {
  const map: Record<string, Record<string, string>> = {
    db_error: {
      critical: "Database failure — data operations blocked",
      medium: "Database query issue",
      minor: "Minor database issue",
    },
    route_error: {
      critical: "Route handler failure — endpoint down",
      medium: "Route error — degraded service",
      minor: "Minor routing issue",
    },
    api_error: {
      critical: "Server error — feature unavailable",
      medium: "Request rejected — user action blocked",
      minor: "Non-critical API issue",
    },
    unhandled_exception: {
      critical: "Unhandled crash — potential data loss",
      medium: "Unhandled error — unexpected behavior",
      minor: "Minor unhandled error",
    },
    frontend_crash: {
      critical: "App crash — user cannot continue",
      medium: "Component failure",
      minor: "Minor rendering issue",
    },
    ui_error: {
      critical: "UI completely broken",
      medium: "UI partially broken",
      minor: "Minor UI glitch",
    },
  };
  return map[errorType]?.[severity] || "Error detected — investigation needed";
}

let _recentErrors = 0;
let _resetTimer: ReturnType<typeof setTimeout> | null = null;

export function captureBackendError(opts: CaptureOpts): void {
  _recentErrors++;
  if (_recentErrors > 100) return;
  if (!_resetTimer) {
    _resetTimer = setTimeout(() => {
      _recentErrors = 0;
      _resetTimer = null;
    }, 60000);
  }

  const severity = classifySeverity(opts.errorType, opts.statusCode, opts.errorMessage);
  const shortImpact = classifyImpact(opts.errorType, severity);

  db.insert(errorReportsTable)
    .values({
      id: generateId(),
      sourceApp: "api",
      errorType: opts.errorType,
      severity,
      errorMessage: opts.errorMessage.slice(0, 5000),
      shortImpact,
      functionName: opts.functionName?.slice(0, 500) || null,
      moduleName: opts.moduleName?.slice(0, 500) || null,
      componentName: opts.componentName?.slice(0, 500) || null,
      stackTrace: opts.stackTrace?.slice(0, 50000) || null,
      metadata: opts.metadata || null,
    })
    .catch((err: unknown) => {
      logger.warn({ err }, "Failed to capture error report to DB");
    });
}
