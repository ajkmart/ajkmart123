import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const whatsappDeliveryLogsTable = pgTable("whatsapp_delivery_logs", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  retries: integer("retries").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
