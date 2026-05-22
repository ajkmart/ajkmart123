import { sql } from "drizzle-orm";
import { decimal, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ridesTable } from "./rides";
import { usersTable } from "./users";

export const rideBidsTable = pgTable(
  "ride_bids",
  {
    id: text("id").primaryKey(),
    rideId: text("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    riderId: text("rider_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    riderName: text("rider_name").notNull(),
    riderPhone: text("rider_phone"),
    fare: decimal("fare", { precision: 10, scale: 2 }).notNull(),
    note: text("note"),
    status: text("status").notNull().default("pending"),
    /* expires_at added by migration 0021 */
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ride_bids_ride_rider_uidx")
      .on(t.rideId, t.riderId)
      .where(sql`status = 'pending'`),
    index("ride_bids_ride_id_idx").on(t.rideId),
    index("ride_bids_rider_id_idx").on(t.riderId),
    index("ride_bids_status_idx").on(t.status),
  ]
);

export const insertRideBidSchema = createInsertSchema(rideBidsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertRideBid = z.infer<typeof insertRideBidSchema>;
export type RideBid = typeof rideBidsTable.$inferSelect;
