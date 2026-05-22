import { integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const sourceAppEnum = pgEnum("error_source_app", [
  "customer",
  "rider",
  "vendor",
  "admin",
  "api",
]);

export const errorTypeEnum = pgEnum("error_type", [
  "frontend_crash",
  "api_error",
  "db_error",
  "route_error",
  "ui_error",
  "unhandled_exception",
]);

export const errorSeverityEnum = pgEnum("error_severity", ["critical", "medium", "minor"]);

export const errorStatusEnum = pgEnum("error_status", [
  "new",
  "acknowledged",
  "in_progress",
  "resolved",
]);

export const resolutionMethodEnum = pgEnum("resolution_method", [
  "manual",
  "auto_resolved",
  "task_created",
]);

export const errorReportsTable = pgTable("error_reports", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  sourceApp: sourceAppEnum("source_app").notNull(),
  errorType: errorTypeEnum("error_type").notNull(),
  severity: errorSeverityEnum("severity").notNull(),
  status: errorStatusEnum("status").default("new").notNull(),
  functionName: text("function_name"),
  moduleName: text("module_name"),
  componentName: text("component_name"),
  errorMessage: text("error_message").notNull(),
  shortImpact: text("short_impact"),
  stackTrace: text("stack_trace"),
  metadata: jsonb("metadata"),
  resolvedAt: timestamp("resolved_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolutionMethod: resolutionMethodEnum("resolution_method"),
  resolutionNotes: text("resolution_notes"),
  rootCause: text("root_cause"),
  updatedAt: timestamp("updated_at"),
  /** SHA-256-style content fingerprint — used to group identical errors */
  errorHash: text("error_hash"),
  /** How many times this exact error has fired (incremented on dedup) */
  occurrenceCount: integer("occurrence_count").default(1).notNull(),
});

export type ErrorReport = typeof errorReportsTable.$inferSelect;
export type NewErrorReport = typeof errorReportsTable.$inferInsert;
