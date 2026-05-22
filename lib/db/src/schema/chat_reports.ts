import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { chatMessagesTable } from "./communication";
import { usersTable } from "./users";

export const chatReportsTable = pgTable(
  "chat_reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reportedUserId: text("reported_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => chatMessagesTable.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("chat_reports_reporter_idx").on(t.reporterId),
    index("chat_reports_reported_idx").on(t.reportedUserId),
    index("chat_reports_status_idx").on(t.status),
  ]
);

export type ChatReport = typeof chatReportsTable.$inferSelect;
