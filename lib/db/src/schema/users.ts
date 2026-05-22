import { sql } from "drizzle-orm";
import { boolean, check, decimal, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    phone: text("phone").unique(),
    name: text("name"),
    email: text("email").unique(),
    /* roles is the canonical field (role was dropped in migration 0025) */
    roles: text("roles").notNull().default("customer"),
    avatar: text("avatar"),
    walletBalance: decimal("wallet_balance", { precision: 10, scale: 2 }).notNull().default("0"),
    /* ── Username + password login ── */
    username: text("username").unique(),
    passwordHash: text("password_hash"),
    requirePasswordChange: boolean("require_password_change").notNull().default(false),
    /* ── Verification status ── */
    phoneVerified: boolean("phone_verified").notNull().default(false),
    emailVerified: boolean("email_verified").notNull().default(false),
    /* ── Admin approval ── */
    approvalStatus: text("approval_status").notNull().default("approved"),
    approvalNote: text("approval_note"),
    /* ── Account status ── */
    isActive: boolean("is_active").notNull().default(true),
    isBanned: boolean("is_banned").notNull().default(false),
    banReason: text("ban_reason"),
    blockedServices: text("blocked_services").notNull().default(""),
    securityNote: text("security_note"),
    isOnline: boolean("is_online").notNull().default(false),
    /* ── Extended profile fields ── */
    cnic: text("cnic"),
    address: text("address"),
    city: text("city"),
    area: text("area"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    kycStatus: text("kyc_status").notNull().default("none"),
    accountLevel: text("account_level").notNull().default("bronze"),
    emergencyContact: text("emergency_contact"),
    bankName: text("bank_name"),
    bankAccount: text("bank_account"),
    bankAccountTitle: text("bank_account_title"),
    nationalId: text("national_id"),
    /* ── Wallet PIN / MPIN ── */
    walletPinHash: text("wallet_pin_hash"),
    walletPinAttempts: integer("wallet_pin_attempts").notNull().default(0),
    walletPinLockedUntil: timestamp("wallet_pin_locked_until"),
    walletHidden: boolean("wallet_hidden").notNull().default(false),
    mpinResetPendingAt: timestamp("mpin_reset_pending_at"),
    mpinResetNewHashPending: text("mpin_reset_new_hash_pending"),
    /* ── 2FA / TOTP fields ── */
    biometricEnabled: boolean("biometric_enabled").notNull().default(false),
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    backupCodes: text("backup_codes"),
    trustedDevices: text("trusted_devices"),
    /* ── Social / federated login ── */
    firebaseUid: text("firebase_uid").unique(),
    googleId: text("google_id").unique(),
    facebookId: text("facebook_id").unique(),
    /* ── Dispatch tracking ── */
    cancelCount: integer("cancel_count").notNull().default(0),
    ignoreCount: integer("ignore_count").notNull().default(0),
    isRestricted: boolean("is_restricted").notNull().default(false),
    cancellationDebt: decimal("cancellation_debt", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    /* ── OTP bypass (admin-controlled per-user) ── */
    otpBypassUntil: timestamp("otp_bypass_until"),
    /* ── Behavioural / metrics columns (for admin condition engine) ── */
    cancellationRate: decimal("cancellation_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    fraudIncidents: integer("fraud_incidents").notNull().default(0),
    abuseReports: integer("abuse_reports").notNull().default(0),
    missIgnoreRate: decimal("miss_ignore_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    orderCompletionRate: decimal("order_completion_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("100"),
    avgRating: decimal("avg_rating", { precision: 3, scale: 2 }),
    /* ── Commission override (set per-vendor by admin) ── */
    commissionOverride: text("commission_override"),
    /* ── AJK platform identifiers & communication flags ── */
    ajkId: text("ajk_id").unique(),
    chatMuted: boolean("chat_muted").notNull().default(false),
    commBlocked: boolean("comm_blocked").notNull().default(false),
    /* ── Pending merge identifier ── */
    pendingMergeIdentifier: text("pending_merge_identifier"),
    /* ── Device fingerprinting ── */
    deviceId: text("device_id"),
    /* ── Token version — incremented on logout/ban/role change ── */
    tokenVersion: integer("token_version").notNull().default(0),
    /* ── Dev OTP mode ── */
    devOtpEnabled: boolean("dev_otp_enabled").notNull().default(false),
    /* ── Auto-suspension tracking ── */
    autoSuspendedAt: timestamp("auto_suspended_at"),
    autoSuspendReason: text("auto_suspend_reason"),
    adminOverrideSuspension: boolean("admin_override_suspension").notNull().default(false),
    /* ── Activity tracking ── */
    lastLoginAt: timestamp("last_login_at"),
    lastActive: timestamp("last_active"),
    acceptedTermsVersion: text("accepted_terms_version"),
    /* ── Soft delete ── */
    deletedAt: timestamp("deleted_at"),
    /* ── PII encryption (dual-write pattern) ── */
    encryptedPhone: text("encrypted_phone"),
    encryptedEmail: text("encrypted_email"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [check("users_wallet_non_negative", sql`${t.walletBalance} >= 0`)]
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
