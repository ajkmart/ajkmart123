import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const savedAddressesTable = pgTable(
  "saved_addresses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull().default("Muzaffarabad"),
    icon: text("icon").notNull().default("location-outline"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("saved_addresses_user_id_idx").on(t.userId)]
);

export const insertSavedAddressSchema = createInsertSchema(savedAddressesTable).omit({
  createdAt: true,
});
export type InsertSavedAddress = z.infer<typeof insertSavedAddressSchema>;
export type SavedAddress = typeof savedAddressesTable.$inferSelect;
