import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const otpTokensTable = pgTable(
  "otp_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    identifier: text("identifier").notNull(),
    identifierType: text("identifier_type").notNull(),
    otpType: text("otp_type").notNull(),

    otpHash: text("otp_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),

    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),

    channel: text("channel").notNull(),
    ipAddress: text("ip_address"),
    deviceFingerprint: text("device_fingerprint"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_otp_tokens_identifier").on(table.identifier, table.identifierType),
    index("idx_otp_tokens_expires").on(table.expiresAt),
    index("idx_otp_tokens_user_id").on(table.userId),
    index("idx_otp_tokens_lookup").on(
      table.identifier,
      table.identifierType,
      table.otpType,
      table.usedAt,
      table.expiresAt
    ),
  ]
);

export type OtpToken = typeof otpTokensTable.$inferSelect;
export type NewOtpToken = typeof otpTokensTable.$inferInsert;

export type OtpChannel = "sms" | "whatsapp" | "email" | "console";
export type OtpType = "login" | "register" | "reset" | "merge" | "trip";
export type OtpIdentifierType = "phone" | "email";
