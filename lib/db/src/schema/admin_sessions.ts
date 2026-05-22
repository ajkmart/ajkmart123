import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminAccountsTable } from "./admin_accounts";

/**
 * Admin sessions table
 * Stores active admin sessions with refresh token hashes for rotation and revocation
 */
export const adminSessionsTable = pgTable("admin_sessions", {
  id: text("id").primaryKey(), // Session ID (UUID)
  adminId: text("admin_id")
    .notNull()
    .references(() => adminAccountsTable.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull(), // Hash of refresh token (never store raw token)
  ip: varchar("ip", { length: 45 }).notNull(), // IPv4 or IPv6
  userAgent: text("user_agent"),
  csrfTokenHash: text("csrf_token_hash"), // Hash of CSRF token for validation
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // When the refresh token expires
  lastUsedAt: timestamp("last_used_at").defaultNow(), // Track session activity
  revokedAt: timestamp("revoked_at"), // When revoked (null = active)
});

export const insertAdminSessionSchema = createInsertSchema(adminSessionsTable).omit({
  createdAt: true,
});

export type InsertAdminSession = z.infer<typeof insertAdminSessionSchema>;
export type AdminSession = typeof adminSessionsTable.$inferSelect;

/**
 * Admin audit log table
 * Tracks all admin authentication events for security and compliance
 */
export const adminAuditLogTable = pgTable("admin_audit_log", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").references(() => adminAccountsTable.id, {
    onDelete: "set null",
  }),
  event: text("event").notNull(), // 'login', 'logout', 'login_failed', 'mfa_enabled', etc
  ip: varchar("ip", { length: 45 }).notNull(),
  userAgent: text("user_agent"),
  result: varchar("result", { length: 20 }).notNull(), // 'success' | 'failure'
  reason: text("reason"), // Optional failure reason
  metadata: text("metadata"), // JSON stringified additional data
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogTable).omit({
  createdAt: true,
});

export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLogTable.$inferSelect;
