import { db } from "@workspace/db";
import { adminAuditLogTable, type InsertAdminAuditLog } from "@workspace/db/schema";
import { NextFunction, Request, Response } from "express";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";

/**
 * Extract client IP from request, considering proxy headers
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"] as string;
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

/**
 * Log an admin authentication/security event to the audit log
 */
export async function logAdminAudit(
  event: string,
  data: {
    adminId?: string;
    ip?: string;
    userAgent?: string;
    result: "success" | "failure";
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.insert(adminAuditLogTable).values({
      id: generateId(),
      adminId: data.adminId,
      event,
      ip: data.ip || "unknown",
      userAgent: data.userAgent,
      result: data.result,
      reason: data.reason,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
    } as InsertAdminAuditLog);
  } catch (err) {
    logger.error({ err }, "Failed to log admin audit event");
  }
}

/**
 * Audit logging middleware
 * Logs all admin API requests (optional, can be used selectively)
 */
export function auditLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send;
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"];
  const adminId = req.admin?.sub;

  res.send = function (data: unknown) {
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    if (isError && adminId) {
      logAdminAudit(`admin_api_error_${req.method}_${req.path}`, {
        adminId,
        ip,
        userAgent,
        result: "failure",
        reason: `HTTP ${statusCode}`,
        metadata: { method: req.method, path: req.path },
      }).catch((err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), adminId, path: req.path },
          "[admin-audit] logAdminAudit failed — audit event lost"
        );
      });
    }

    return originalSend.call(this, data);
  };

  next();
}
