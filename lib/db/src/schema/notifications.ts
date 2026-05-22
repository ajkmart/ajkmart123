import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    type: text("type").notNull().default("system"),
    isRead: boolean("is_read").notNull().default(false),
    icon: text("icon").default("notifications-outline"),
    link: text("link"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    sosStatus: text("sos_status").default("pending"),
    acknowledgedAt: timestamp("acknowledged_at"),
    acknowledgedBy: text("acknowledged_by"),
    acknowledgedByName: text("acknowledged_by_name"),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by"),
    resolvedByName: text("resolved_by_name"),
    resolutionNotes: text("resolution_notes"),
  },
  (t) => [
    index("notifications_user_id_idx").on(t.userId),
    index("notifications_user_read_idx").on(t.userId, t.isRead),
    index("notifications_created_at_idx").on(t.createdAt),
    index("notifications_sos_status_idx").on(t.sosStatus),
  ]
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
