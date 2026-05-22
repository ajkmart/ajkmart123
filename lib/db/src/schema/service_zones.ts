import {
  boolean,
  index,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceZonesTable = pgTable(
  "service_zones",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    lat: numeric("lat", { precision: 10, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 10, scale: 6 }).notNull(),
    radiusKm: numeric("radius_km", { precision: 8, scale: 2 }).notNull().default("30"),
    isActive: boolean("is_active").notNull().default(true),
    appliesToRides: boolean("applies_to_rides").notNull().default(true),
    appliesToOrders: boolean("applies_to_orders").notNull().default(true),
    appliesToParcel: boolean("applies_to_parcel").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("service_zones_name_uq").on(t.name),
    index("service_zones_is_active_idx").on(t.isActive),
    index("service_zones_city_idx").on(t.city),
  ]
);

export const insertServiceZoneSchema = createInsertSchema(serviceZonesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertServiceZone = z.infer<typeof insertServiceZoneSchema>;
export type ServiceZone = typeof serviceZonesTable.$inferSelect;
