import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const vendorSchedulesTable = pgTable(
  "vendor_schedules",
  {
    id: text("id").primaryKey(),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    openTime: text("open_time").notNull().default("09:00"),
    closeTime: text("close_time").notNull().default("21:00"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("vendor_schedules_vendor_day_idx").on(table.vendorId, table.dayOfWeek)]
);

export const insertVendorScheduleSchema = createInsertSchema(vendorSchedulesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertVendorSchedule = z.infer<typeof insertVendorScheduleSchema>;
export type VendorSchedule = typeof vendorSchedulesTable.$inferSelect;
