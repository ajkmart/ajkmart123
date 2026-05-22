import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const autoResolveLogTable = pgTable("auto_resolve_log", {
  id: text("id").primaryKey(),
  errorReportId: text("error_report_id").notNull(),
  reason: text("reason").notNull(),
  ruleMatched: text("rule_matched").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AutoResolveLog = typeof autoResolveLogTable.$inferSelect;
export type NewAutoResolveLog = typeof autoResolveLogTable.$inferInsert;
