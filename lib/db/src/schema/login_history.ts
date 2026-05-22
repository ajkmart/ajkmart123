import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loginHistoryTable = pgTable(
  "login_history",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ip: text("ip"),
    deviceName: text("device_name"),
    browser: text("browser"),
    os: text("os"),
    location: text("location"),
    success: boolean("success").notNull().default(true),
    method: text("method"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("login_history_user_id_idx").on(t.userId)]
);

export type LoginHistory = typeof loginHistoryTable.$inferSelect;
