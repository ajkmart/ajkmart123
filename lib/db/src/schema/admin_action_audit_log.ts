import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { adminAccountsTable } from "./admin_accounts";
import { usersTable } from "./users";

export const adminActionAuditLogTable = pgTable("admin_action_audit_log", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").references(() => adminAccountsTable.id, { onDelete: "set null" }),
  adminName: text("admin_name"),
  ip: text("ip").notNull().default("unknown"),
  action: text("action").notNull(),
  result: text("result").notNull().default("success"),
  details: text("details"),
  affectedUserId: text("affected_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  affectedUserName: text("affected_user_name"),
  affectedUserRole: text("affected_user_role"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminActionAuditLog = typeof adminActionAuditLogTable.$inferSelect;
