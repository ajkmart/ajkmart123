import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const supportMessagesTable = pgTable("support_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  message: text("message").notNull(),
  isFromSupport: boolean("is_from_support").notNull().default(false),
  isReadByAdmin: boolean("is_read_by_admin").notNull().default(false),
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
