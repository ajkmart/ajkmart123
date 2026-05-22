import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ridesTable } from "./rides";
import { usersTable } from "./users";

export const rideRatingsTable = pgTable(
  "ride_ratings",
  {
    id: text("id").primaryKey(),
    rideId: text("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    /* user_id is the canonical column name (renamed from customer_id in migration 0025) */
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    riderId: text("rider_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
    comment: text("comment"),
    hidden: boolean("hidden").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ride_ratings_ride_id_uidx").on(t.rideId),
    index("ride_ratings_rider_id_idx").on(t.riderId),
    index("ride_ratings_user_id_idx").on(t.userId),
  ]
);

export const insertRideRatingSchema = createInsertSchema(rideRatingsTable).omit({
  createdAt: true,
});
export type InsertRideRating = z.infer<typeof insertRideRatingSchema>;
export type RideRating = typeof rideRatingsTable.$inferSelect;
