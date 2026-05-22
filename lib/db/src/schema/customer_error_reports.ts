import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const customerReportStatusEnum = pgEnum("customer_report_status", [
  "new",
  "reviewed",
  "closed",
]);

export const customerErrorReportsTable = pgTable("customer_error_reports", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  userId: text("user_id"),
  appVersion: text("app_version"),
  deviceInfo: text("device_info"),
  platform: text("platform"),
  screen: text("screen"),
  description: text("description").notNull(),
  reproSteps: text("repro_steps"),
  status: customerReportStatusEnum("status").default("new").notNull(),
  adminNote: text("admin_note"),
  reviewedAt: timestamp("reviewed_at"),
});

export type CustomerErrorReport = typeof customerErrorReportsTable.$inferSelect;
export type NewCustomerErrorReport = typeof customerErrorReportsTable.$inferInsert;
