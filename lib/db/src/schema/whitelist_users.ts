import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * whitelist_users — OTP bypass whitelist for testers and App Store reviewers.
 * When a phone or email appears here, the auth system accepts OTP "000000"
 * (or the configured bypass code) without sending a real SMS/email.
 *
 * This is separate from the global OTP suspension (platform_settings key
 * "security_otp_disabled") — it allows per-identity bypass while the
 * rest of the world still receives real OTPs.
 */
export const whitelistUsersTable = pgTable("whitelist_users", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique() /* phone or email */,
  label: text("label") /* human-readable note e.g. "App Store reviewer" */,
  bypassCode: text("bypass_code").notNull().default("000000"),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at") /* null = never expires */,
  createdBy: text("created_by") /* admin id who added this */,
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWhitelistUserSchema = createInsertSchema(whitelistUsersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertWhitelistUser = z.infer<typeof insertWhitelistUserSchema>;
export type WhitelistUser = typeof whitelistUsersTable.$inferSelect;
