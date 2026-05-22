import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const securityEventsTable = pgTable("security_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  ip: text("ip").notNull(),
  userId: text("user_id"),
  details: text("details").notNull(),
  severity: text("severity").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SecurityEvent = typeof securityEventsTable.$inferSelect;
