/**
 * AuditService - Admin Action Audit Trail
 *
 * Provides higher-order functions to wrap admin operations
 * with automatic audit logging.
 */

import { logger } from "../lib/logger.js";
import { addAuditEntry } from "../middleware/security.js";

export interface AuditWrapperInput {
  adminId?: string;
  adminName?: string;
  adminIp: string;
  action: string; // e.g., "user_update", "order_refund"
  resource: string; // e.g., "user_123", "order_456"
  resourceType: string; // e.g., "user", "order", "ride"
  details?: string;
  affectedUserId?: string;
  affectedUserName?: string;
  affectedUserRole?: string;
}

/** Thin pass-through parameters for inline audit logging. */
export interface AuditLogInput {
  action: string;
  ip: string;
  adminId?: string;
  adminName?: string;
  affectedUserId?: string;
  affectedUserName?: string;
  affectedUserRole?: string;
  details?: string;
  result: "success" | "fail" | "warn" | "pending";
}

export class AuditService {
  /**
   * Lightweight inline audit entry — the canonical way to log a single event
   * from any route without calling `addAuditEntry` directly.
   */
  static log(input: AuditLogInput): void {
    addAuditEntry({ ...input, details: input.details ?? "" });
  }

  /**
   * Wrap an operation with audit logging
   * Logs both success and failure
   */
  static async executeWithAudit<T>(
    input: AuditWrapperInput,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await operation();

      const duration = Date.now() - startTime;

      // Log successful operation
      addAuditEntry({
        action: input.action,
        ip: input.adminIp,
        adminId: input.adminId,
        adminName: input.adminName,
        affectedUserId: input.affectedUserId,
        affectedUserName: input.affectedUserName,
        affectedUserRole: input.affectedUserRole,
        details: [
          input.details,
          `${input.resourceType}=${input.resource}`,
          `duration=${duration}ms`,
        ]
          .filter(Boolean)
          .join(" | "),
        result: "success",
      });

      logger.info(
        {
          action: input.action,
          resourceType: input.resourceType,
          resource: input.resource,
          adminId: input.adminId,
          duration,
        },
        "[AuditService] Admin operation succeeded"
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log failed operation
      addAuditEntry({
        action: `${input.action}_failed`,
        ip: input.adminIp,
        adminId: input.adminId,
        adminName: input.adminName,
        affectedUserId: input.affectedUserId,
        affectedUserName: input.affectedUserName,
        affectedUserRole: input.affectedUserRole,
        details: [
          input.details,
          `${input.resourceType}=${input.resource}`,
          `error=${errorMessage}`,
          `duration=${duration}ms`,
        ]
          .filter(Boolean)
          .join(" | "),
        result: "fail",
      });

      logger.error(
        {
          action: input.action,
          resourceType: input.resourceType,
          resource: input.resource,
          adminId: input.adminId,
          error: errorMessage,
          duration,
        },
        "[AuditService] Admin operation failed"
      );

      throw error;
    }
  }

  /**
   * Wrap multiple related operations
   */
  static async executeBatchWithAudit<T>(
    input: Omit<AuditWrapperInput, "resource">,
    operations: Map<string, () => Promise<unknown>>
  ): Promise<T> {
    const results: Record<string, unknown> = {};
    const startTime = Date.now();
    const failedOperations: string[] = [];

    for (const [operationName, operation] of operations) {
      try {
        results[operationName] = await operation();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results[operationName] = { error: errorMessage };
        failedOperations.push(operationName);
      }
    }

    const duration = Date.now() - startTime;
    const opCount = operations.size;
    const successCount = opCount - failedOperations.length;

    if (failedOperations.length > 0) {
      addAuditEntry({
        action: `${input.action}_batch_partial_failure`,
        ip: input.adminIp,
        adminId: input.adminId,
        details: [
          input.details,
          `resourceType=${input.resourceType}`,
          `operations=${opCount}`,
          `success=${successCount}`,
          `failed=${failedOperations.join(",")}`,
          `duration=${duration}ms`,
        ]
          .filter(Boolean)
          .join(" | "),
        result: "fail",
      });

      logger.warn(
        {
          action: input.action,
          resourceType: input.resourceType,
          total: opCount,
          success: successCount,
          failed: failedOperations,
          duration,
        },
        "[AuditService] Batch operation had failures"
      );
    } else {
      addAuditEntry({
        action: input.action,
        ip: input.adminIp,
        adminId: input.adminId,
        details: [
          input.details,
          `resourceType=${input.resourceType}`,
          `operations=${opCount}`,
          `duration=${duration}ms`,
        ]
          .filter(Boolean)
          .join(" | "),
        result: "success",
      });

      logger.info(
        {
          action: input.action,
          resourceType: input.resourceType,
          operations: opCount,
          duration,
        },
        "[AuditService] Batch operation succeeded"
      );
    }

    return results as T;
  }

  /**
   * Track data change in audit log
   */
  static logDataChange(
    input: AuditWrapperInput & {
      before?: Record<string, unknown>;
      after: Record<string, unknown>;
    }
  ) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (input.before) {
      for (const [key, newValue] of Object.entries(input.after)) {
        const oldValue = input.before[key];
        if (oldValue !== newValue) {
          changes[key] = {
            from: oldValue,
            to: newValue,
          };
        }
      }
    }

    const changesStr = Object.entries(changes)
      .map(([key, { from, to }]) => `${key}:${from}→${to}`)
      .join(",");

    addAuditEntry({
      action: input.action,
      ip: input.adminIp,
      adminId: input.adminId,
      details: [input.details, `${input.resourceType}=${input.resource}`, `changed=${changesStr}`]
        .filter(Boolean)
        .join(" | "),
      result: "success",
    });

    logger.info(
      {
        action: input.action,
        resourceType: input.resourceType,
        resource: input.resource,
        changes,
      },
      "[AuditService] Data change logged"
    );
  }

  /**
   * Log a sensitive action
   */
  static logSensitiveAction(
    input: AuditWrapperInput & { severity: "low" | "medium" | "high" | "critical" }
  ) {
    const severityEmoji = {
      low: "ℹ️",
      medium: "⚠️",
      high: "⛔",
      critical: "🚨",
    }[input.severity];

    addAuditEntry({
      action: `sensitive_${input.action}`,
      ip: input.adminIp,
      adminId: input.adminId,
      details: [
        input.details,
        `${input.resourceType}=${input.resource}`,
        `severity=${input.severity}`,
      ]
        .filter(Boolean)
        .join(" | "),
      result: "success",
    });

    logger.warn(
      {
        action: input.action,
        severity: input.severity,
        resourceType: input.resourceType,
        resource: input.resource,
        adminId: input.adminId,
      },
      `${severityEmoji} [AuditService] Sensitive action: ${input.action}`
    );
  }
}
