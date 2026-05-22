import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const consentLogTable = pgTable("consent_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  consentType: text("consent_type").notNull(),
  consentVersion: text("consent_version").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ConsentLog = typeof consentLogTable.$inferSelect;
