import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminAccountsTable } from "./admin_accounts";

/**
 * Admin password reset tokens.
 *
 * One row per issued reset token. The raw token is **never** persisted;
 * we store only its sha256 hash in `tokenHash`. Tokens are single-use
 * (`usedAt` is stamped on consumption) and time-limited (`expiresAt`,
 * default 30 minutes from issuance).
 *
 * `requestedBy` distinguishes a self-service forgot-password request from
 * a super-admin "send reset link" action. `requesterAdminId` is set when
 * a super-admin issues the token on behalf of another admin (audit trail).
 */
export const adminPasswordResetTokensTable = pgTable(
  "admin_password_reset_tokens",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => adminAccountsTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    /** 'self' (forgot-password) | 'super_admin' (send-reset-link). */
    requestedBy: text("requested_by").notNull().default("self"),
    /** Super-admin who issued the link (when requestedBy = 'super_admin'). */
    requesterAdminId: text("requester_admin_id").references(() => adminAccountsTable.id, {
      onDelete: "set null",
    }),
    requesterIp: varchar("requester_ip", { length: 45 }).notNull().default("unknown"),
    requesterUserAgent: text("requester_user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    adminIdx: index("admin_password_reset_tokens_admin_idx").on(t.adminId),
    expiresIdx: index("admin_password_reset_tokens_expires_idx").on(t.expiresAt),
  })
);

export const insertAdminPasswordResetTokenSchema = createInsertSchema(
  adminPasswordResetTokensTable
).omit({ createdAt: true });

export type InsertAdminPasswordResetToken = z.infer<typeof insertAdminPasswordResetTokenSchema>;
export type AdminPasswordResetToken = typeof adminPasswordResetTokensTable.$inferSelect;
