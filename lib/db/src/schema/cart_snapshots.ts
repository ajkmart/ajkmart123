import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const cartSnapshotsTable = pgTable(
  "cart_snapshots",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    items: jsonb("items").notNull().default([]),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("cart_snapshots_updated_at_idx").on(t.updatedAt)]
);

export type CartSnapshot = typeof cartSnapshotsTable.$inferSelect;
