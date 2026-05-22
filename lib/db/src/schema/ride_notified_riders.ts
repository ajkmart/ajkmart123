import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { ridesTable } from "./rides";
import { usersTable } from "./users";

export const rideNotifiedRidersTable = pgTable(
  "ride_notified_riders",
  {
    id: text("id").primaryKey(),
    rideId: text("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    riderId: text("rider_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ride_notified_riders_ride_rider_uidx").on(t.rideId, t.riderId),
    index("ride_notified_riders_ride_id_idx").on(t.rideId),
  ]
);
