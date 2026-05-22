import { decimal, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { ridesTable } from "./rides";
import { usersTable } from "./users";

export const rideEventLogsTable = pgTable(
  "ride_event_logs",
  {
    id: text("id").primaryKey(),
    rideId: text("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    /* rider_id made nullable in migration 0024 to support admin-generated events */
    riderId: text("rider_id").references(() => usersTable.id, { onDelete: "cascade" }),
    /* admin_id added by migration 0024 for admin-support events */
    adminId: text("admin_id"),
    event: text("event").notNull(),
    lat: decimal("lat", { precision: 10, scale: 6 }),
    lng: decimal("lng", { precision: 10, scale: 6 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ride_event_logs_ride_id_idx").on(t.rideId),
    index("ride_event_logs_rider_id_idx").on(t.riderId),
  ]
);

export type RideEventLog = typeof rideEventLogsTable.$inferSelect;
