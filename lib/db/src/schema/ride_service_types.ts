import { boolean, decimal, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rideServiceTypesTable = pgTable("ride_service_types", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  nameUrdu: text("name_urdu"),
  icon: text("icon").notNull().default("🚗"),
  description: text("description"),
  color: text("color").notNull().default("#059669"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isCustom: boolean("is_custom").notNull().default(false),
  baseFare: decimal("base_fare", { precision: 10, scale: 2 }).notNull().default("15"),
  perKm: decimal("per_km", { precision: 10, scale: 2 }).notNull().default("8"),
  minFare: decimal("min_fare", { precision: 10, scale: 2 }).notNull().default("50"),
  maxPassengers: integer("max_passengers").notNull().default(1),
  allowBargaining: boolean("allow_bargaining").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRideServiceTypeSchema = createInsertSchema(rideServiceTypesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertRideServiceType = z.infer<typeof insertRideServiceTypeSchema>;
export type RideServiceType = typeof rideServiceTypesTable.$inferSelect;
