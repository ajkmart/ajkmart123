import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const authAuditLogTable = pgTable("auth_audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  event: text("event").notNull(),
  ip: text("ip").notNull().default("unknown"),
  userAgent: text("user_agent"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuthAuditLog = typeof authAuditLogTable.$inferSelect;
