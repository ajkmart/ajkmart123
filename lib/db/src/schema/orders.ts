import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  decimal,
  doublePrecision,
  index,
  json,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ordersTable = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    items: json("items").notNull(),
    status: text("status").notNull().default("pending"),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),
    deliveryAddress: text("delivery_address"),
    paymentMethod: text("payment_method").notNull(),
    riderId: text("rider_id").references(() => usersTable.id, { onDelete: "set null" }),
    riderName: text("rider_name"),
    riderPhone: text("rider_phone"),
    vendorId: text("vendor_id").references(() => usersTable.id, { onDelete: "set null" }),
    estimatedTime: text("estimated_time"),
    proofPhotoUrl: text("proof_photo_url"),
    txnRef: text("txn_ref"),
    paymentStatus: text("payment_status").default("pending"),
    refundedAt: timestamp("refunded_at"),
    refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 }),
    assignedRiderId: text("assigned_rider_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at"),
    /* ── Rider acceptance timestamp ── */
    acceptedAt: timestamp("accepted_at"),
    /* ── GPS fraud-stamp columns (added by migration 0022) ── */
    customerLat: decimal("customer_lat", { precision: 10, scale: 7 }),
    customerLng: decimal("customer_lng", { precision: 10, scale: 7 }),
    gpsAccuracy: doublePrecision("gps_accuracy"),
    gpsMismatch: boolean("gps_mismatch").default(false),
    deliveryLat: decimal("delivery_lat", { precision: 10, scale: 7 }),
    deliveryLng: decimal("delivery_lng", { precision: 10, scale: 7 }),
    /* ── Soft delete ── */
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_id_idx").on(t.userId),
    index("orders_rider_id_idx").on(t.riderId),
    index("orders_vendor_id_idx").on(t.vendorId),
    index("orders_status_idx").on(t.status),
    index("orders_created_at_idx").on(t.createdAt),
    check("orders_total_non_negative", sql`${t.total} >= 0`),
  ]
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
