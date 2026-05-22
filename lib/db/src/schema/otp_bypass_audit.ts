import { json, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * otp_bypass_audit — Comprehensive audit log for OTP bypass events.
 *
 * Tracks:
 * - Global OTP suspension (admin actions)
 * - Per-user bypass grants/revokes
 * - Whitelist bypass usage
 * - Login attempts with active bypasses
 */
export const otpBypassAuditTable = pgTable("otp_bypass_audit", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  // E.g., 'otp_global_disable', 'otp_global_restore', 'otp_bypass_granted',
  //       'otp_bypass_revoked', 'login_per_user_bypass', 'login_global_bypass',
  //       'login_whitelist_bypass', 'whitelist_entry_added', 'whitelist_entry_deleted'

  userId: text("user_id"), // user who benefited from bypass (or null for global events)
  adminId: text("admin_id"), // admin who performed the action
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  bypassReason: varchar("bypass_reason", { length: 100 }),
  // E.g., 'admin_action', 'admin_grant', 'admin_revoke', 'global_suspend', 'whitelist'

  expiresAt: timestamp("expires_at"), // when the bypass expires (null = never)
  ipAddress: varchar("ip_address", { length: 45 }), // IPv4 or IPv6
  userAgent: varchar("user_agent", { length: 500 }),
  metadata: json("metadata"), // Extra context JSON

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOtpBypassAuditSchema = createInsertSchema(otpBypassAuditTable).omit({
  createdAt: true,
});

export type InsertOtpBypassAudit = z.infer<typeof insertOtpBypassAuditSchema>;
export type OtpBypassAudit = typeof otpBypassAuditTable.$inferSelect;
