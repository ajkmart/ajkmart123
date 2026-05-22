import { boolean, decimal, index, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const locationLogsTable = pgTable(
  "location_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("rider"),
    latitude: decimal("latitude", { precision: 10, scale: 6 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 6 }).notNull(),
    accuracy: real("accuracy"),
    speed: real("speed"),
    heading: real("heading"),
    batteryLevel: real("battery_level"),
    isSpoofed: boolean("is_spoofed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("location_logs_user_ts_idx").on(t.userId, t.createdAt),
    index("location_logs_user_idx").on(t.userId),
    index("location_logs_role_idx").on(t.role),
    /* Composite index for fleet-analytics query: role + time range */
    index("location_logs_role_ts_idx").on(t.role, t.createdAt),
    /* Spatial pre-filter for proximity/heatmap queries */
    index("location_logs_lat_lng_idx").on(t.latitude, t.longitude),
  ]
);

export const insertLocationLogSchema = createInsertSchema(locationLogsTable);
export type InsertLocationLog = z.infer<typeof insertLocationLogSchema>;
export type LocationLog = typeof locationLogsTable.$inferSelect;
