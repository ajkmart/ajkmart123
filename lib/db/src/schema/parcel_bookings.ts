import { decimal, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const parcelBookingsTable = pgTable(
  "parcel_bookings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    senderName: text("sender_name").notNull(),
    senderPhone: text("sender_phone").notNull(),
    pickupAddress: text("pickup_address").notNull(),
    receiverName: text("receiver_name").notNull(),
    receiverPhone: text("receiver_phone").notNull(),
    dropAddress: text("drop_address").notNull(),
    parcelType: text("parcel_type").notNull(),
    weight: decimal("weight", { precision: 6, scale: 2 }),
    description: text("description"),
    fare: decimal("fare", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull().default("pending"),
    estimatedTime: text("estimated_time").default("45-60 min"),
    riderId: text("rider_id").references(() => usersTable.id, { onDelete: "set null" }),
    /* Refund idempotency stamp — set atomically with wallet credit; isNull guard prevents double-refund */
    refundedAt: timestamp("refunded_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("parcel_bookings_user_id_idx").on(t.userId),
    index("parcel_bookings_rider_id_idx").on(t.riderId),
    index("parcel_bookings_status_idx").on(t.status),
    index("parcel_bookings_created_at_idx").on(t.createdAt),
  ]
);

export const insertParcelBookingSchema = createInsertSchema(parcelBookingsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertParcelBooking = z.infer<typeof insertParcelBookingSchema>;
export type ParcelBooking = typeof parcelBookingsTable.$inferSelect;
