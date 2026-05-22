import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const otpAttemptsTable = pgTable("otp_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  firstAt: timestamp("first_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type OtpAttempt = typeof otpAttemptsTable.$inferSelect;
