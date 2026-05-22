import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * sms_gateways — priority-ordered list of SMS provider configurations.
 * The dynamic OTP service reads this table at send time and tries each
 * active provider in ascending priority order, falling back to the next
 * if any provider returns an error.
 *
 * provider values: "twilio" | "msg91" | "firebase" | "zong" | "console"
 */
export const smsGatewaysTable = pgTable("sms_gateways", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  priority: integer("priority").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),

  /* Twilio */
  accountSid: text("account_sid"),
  authToken: text("auth_token"),
  fromNumber: text("from_number"),

  /* MSG91 */
  msg91Key: text("msg91_key"),
  senderId: text("sender_id"),

  /* Generic API-key providers (Zong / CM.com) */
  apiKey: text("api_key"),
  apiUrl: text("api_url"),

  /* Firebase Phone Auth — no extra creds, uses firebase-admin from env */

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSmsGatewaySchema = createInsertSchema(smsGatewaysTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSmsGateway = z.infer<typeof insertSmsGatewaySchema>;
export type SmsGateway = typeof smsGatewaysTable.$inferSelect;
