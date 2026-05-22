import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const dataExportLogsTable = pgTable("data_export_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  ip: text("ip").notNull().default("unknown"),
  userAgent: text("user_agent"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  success: boolean("success").notNull().default(false),
  maskedPhone: text("masked_phone"),
});

export type DataExportLog = typeof dataExportLogsTable.$inferSelect;
