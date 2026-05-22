import { index, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { ridesTable } from "./rides";
import { usersTable } from "./users";

export const locationHistoryTable = pgTable(
  "location_history",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rideId: text("ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
    orderId: text("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
    coords: jsonb("coords").notNull().$type<{ lat: number; lng: number }>(),
    heading: numeric("heading", { precision: 6, scale: 2 }),
    speed: numeric("speed", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("location_history_user_id_idx").on(t.userId),
    index("location_history_created_at_idx").on(t.createdAt),
    index("location_history_user_created_idx").on(t.userId, t.createdAt),
  ]
);

export const insertLocationHistorySchema = createInsertSchema(locationHistoryTable).omit({
  createdAt: true,
});
export type InsertLocationHistory = z.infer<typeof insertLocationHistorySchema>;
export type LocationHistory = typeof locationHistoryTable.$inferSelect;
