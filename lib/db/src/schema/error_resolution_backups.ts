import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const errorResolutionBackupsTable = pgTable("error_resolution_backups", {
  id: text("id").primaryKey(),
  errorReportId: text("error_report_id").notNull(),
  previousStatus: text("previous_status").notNull(),
  previousData: jsonb("previous_data").notNull(),
  resolutionMethod: text("resolution_method").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type ErrorResolutionBackup = typeof errorResolutionBackupsTable.$inferSelect;
export type NewErrorResolutionBackup = typeof errorResolutionBackupsTable.$inferInsert;
