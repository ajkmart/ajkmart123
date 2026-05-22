import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const schoolRoutesTable = pgTable("school_routes", {
  id: text("id").primaryKey(),
  routeName: text("route_name").notNull() /* e.g. "City Route A" */,
  schoolName: text("school_name").notNull(),
  schoolNameUrdu: text("school_name_urdu"),
  fromArea: text("from_area").notNull() /* e.g. "Muzaffarabad Chowk" */,
  fromAreaUrdu: text("from_area_urdu"),
  toAddress: text("to_address").notNull() /* school full address */,
  fromLat: decimal("from_lat", { precision: 10, scale: 6 }),
  fromLng: decimal("from_lng", { precision: 10, scale: 6 }),
  toLat: decimal("to_lat", { precision: 10, scale: 6 }),
  toLng: decimal("to_lng", { precision: 10, scale: 6 }),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(),
  morningTime: text("morning_time").default("7:30 AM"),
  afternoonTime: text("afternoon_time") /* null = no afternoon pickup */,
  capacity: integer("capacity").notNull().default(30),
  enrolledCount: integer("enrolled_count").notNull().default(0),
  vehicleType: text("vehicle_type").notNull().default("school_shift") /* school_shift | daba */,
  notes: text("notes") /* any admin notes/stops list */,
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const schoolSubscriptionsTable = pgTable(
  "school_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    routeId: text("route_id")
      .notNull()
      .references(() => schoolRoutesTable.id, { onDelete: "cascade" }),
    studentName: text("student_name").notNull(),
    studentClass: text("student_class").notNull(),
    monthlyAmount: decimal("monthly_amount", { precision: 10, scale: 2 }).notNull(),
    status: text("status").notNull().default("active") /* active | paused | cancelled */,
    paymentMethod: text("payment_method").notNull().default("cash"),
    startDate: timestamp("start_date").notNull().defaultNow(),
    nextBillingDate: timestamp("next_billing_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    /* Partial unique: one active/paused subscription per user per route.
     Cancelled subscriptions are excluded so the user can re-subscribe later. */
    uniqueIndex("school_subs_user_route_uidx")
      .on(t.userId, t.routeId)
      .where(sql`status != 'cancelled'`),
    index("school_subs_user_id_idx").on(t.userId),
    index("school_subs_route_id_idx").on(t.routeId),
    index("school_subs_status_idx").on(t.status),
  ]
);

export type SchoolRoute = typeof schoolRoutesTable.$inferSelect;
export type NewSchoolRoute = typeof schoolRoutesTable.$inferInsert;
export type SchoolSubscription = typeof schoolSubscriptionsTable.$inferSelect;
export type NewSchoolSubscription = typeof schoolSubscriptionsTable.$inferInsert;
