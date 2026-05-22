import { decimal, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const riderProfilesTable = pgTable("rider_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  vehicleType: text("vehicle_type"),
  vehiclePlate: text("vehicle_plate"),
  vehicleRegNo: text("vehicle_reg_no"),
  drivingLicense: text("driving_license"),
  vehiclePhoto: text("vehicle_photo"),
  documents: text("documents"),
  /* daily earnings goal for rider motivation (PKR) */
  dailyGoal: decimal("daily_goal", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRiderProfileSchema = createInsertSchema(riderProfilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertRiderProfile = z.infer<typeof insertRiderProfileSchema>;
export type RiderProfile = typeof riderProfilesTable.$inferSelect;
