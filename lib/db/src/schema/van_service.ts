import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/* ══════════════════════════════════════════════════════════
   Commercial Van / Commuter Service
   Seat-based advance booking system for fixed-route vans
══════════════════════════════════════════════════════════ */

export const vanRoutesTable = pgTable(
  "van_routes",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameUrdu: text("name_urdu"),
    fromAddress: text("from_address").notNull(),
    fromAddressUrdu: text("from_address_urdu"),
    fromLat: decimal("from_lat", { precision: 10, scale: 7 }),
    fromLng: decimal("from_lng", { precision: 10, scale: 7 }),
    toAddress: text("to_address").notNull(),
    toAddressUrdu: text("to_address_urdu"),
    toLat: decimal("to_lat", { precision: 10, scale: 7 }),
    toLng: decimal("to_lng", { precision: 10, scale: 7 }),
    distanceKm: decimal("distance_km", { precision: 6, scale: 2 }),
    durationMin: integer("duration_min"),
    farePerSeat: decimal("fare_per_seat", { precision: 10, scale: 2 }).notNull(),
    fareWindow: decimal("fare_window", { precision: 10, scale: 2 }),
    fareAisle: decimal("fare_aisle", { precision: 10, scale: 2 }),
    fareEconomy: decimal("fare_economy", { precision: 10, scale: 2 }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("van_routes_is_active_idx").on(t.isActive)]
);

export const vanVehiclesTable = pgTable(
  "van_vehicles",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id").references(() => usersTable.id, { onDelete: "set null" }),
    plateNumber: text("plate_number").notNull(),
    model: text("model").notNull().default("Suzuki Carry"),
    totalSeats: integer("total_seats").notNull().default(12),
    seatLayout: jsonb("seat_layout").default(null),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("van_vehicles_driver_id_idx").on(t.driverId)]
);

export const vanDriversTable = pgTable(
  "van_drivers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    vanCode: text("van_code").notNull().unique(),
    approvalStatus: text("approval_status").notNull().default("pending"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("van_drivers_user_id_idx").on(t.userId),
    index("van_drivers_van_code_idx").on(t.vanCode),
  ]
);

export const vanSchedulesTable = pgTable(
  "van_schedules",
  {
    id: text("id").primaryKey(),
    routeId: text("route_id")
      .notNull()
      .references(() => vanRoutesTable.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id").references(() => vanVehiclesTable.id, { onDelete: "set null" }),
    driverId: text("driver_id").references(() => usersTable.id, { onDelete: "set null" }),
    vanDriverId: text("van_driver_id"),
    departureTime: text("departure_time").notNull(),
    returnTime: text("return_time"),
    daysOfWeek: jsonb("days_of_week").notNull().default([1, 2, 3, 4, 5, 6]),
    tripStatus: text("trip_status").notNull().default("idle"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("van_schedules_route_id_idx").on(t.routeId),
    index("van_schedules_vehicle_id_idx").on(t.vehicleId),
    index("van_schedules_driver_id_idx").on(t.driverId),
  ]
);

export const vanBookingsTable = pgTable(
  "van_bookings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => vanSchedulesTable.id, { onDelete: "cascade" }),
    routeId: text("route_id")
      .notNull()
      .references(() => vanRoutesTable.id, { onDelete: "cascade" }),
    seatNumbers: jsonb("seat_numbers").notNull().default([]),
    seatTiers: jsonb("seat_tiers").default(null),
    tierLabel: text("tier_label"),
    pricePaid: decimal("price_paid", { precision: 10, scale: 2 }),
    travelDate: text("travel_date").notNull(),
    status: text("status").notNull().default("confirmed"),
    fare: decimal("fare", { precision: 10, scale: 2 }).notNull(),
    tierBreakdown: jsonb("tier_breakdown").default(null),
    paymentMethod: text("payment_method").notNull().default("cash"),
    passengerName: text("passenger_name"),
    passengerPhone: text("passenger_phone"),
    boardedAt: timestamp("boarded_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("van_bookings_user_id_idx").on(t.userId),
    index("van_bookings_schedule_id_idx").on(t.scheduleId),
    index("van_bookings_travel_date_idx").on(t.travelDate),
    index("van_bookings_status_idx").on(t.status),
  ]
);

export type VanRoute = typeof vanRoutesTable.$inferSelect;
export type VanVehicle = typeof vanVehiclesTable.$inferSelect;
export type VanDriver = typeof vanDriversTable.$inferSelect;
export type VanSchedule = typeof vanSchedulesTable.$inferSelect;
export type VanBooking = typeof vanBookingsTable.$inferSelect;
