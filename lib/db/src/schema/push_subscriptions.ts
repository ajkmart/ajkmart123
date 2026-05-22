import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("customer"),
    /* token_type distinguishes VAPID (web push) from FCM (Firebase Cloud Messaging) */
    tokenType: text("token_type").notNull().default("vapid"),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh"),
    authKey: text("auth_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("push_sub_user_idx").on(t.userId),
    index("push_sub_role_idx").on(t.role),
    index("push_sub_type_idx").on(t.tokenType),
  ]
);

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
