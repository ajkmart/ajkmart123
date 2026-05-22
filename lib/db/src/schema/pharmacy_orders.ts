import { decimal, index, json, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const pharmacyOrdersTable = pgTable(
  "pharmacy_orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    riderId: text("rider_id").references(() => usersTable.id, { onDelete: "set null" }),
    items: json("items").notNull(),
    prescriptionNote: text("prescription_note"),
    /* uploaded prescription image URL (added by drizzle migration 0004) */
    prescriptionPhotoUrl: text("prescription_photo_url"),
    deliveryAddress: text("delivery_address").notNull(),
    contactPhone: text("contact_phone").notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull().default("pending"),
    estimatedTime: text("estimated_time").default("25-40 min"),
    /* Refund idempotency stamp — set atomically with wallet credit; isNull guard prevents double-refund */
    refundedAt: timestamp("refunded_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("pharmacy_orders_user_id_idx").on(t.userId),
    index("pharmacy_orders_rider_id_idx").on(t.riderId),
    index("pharmacy_orders_status_idx").on(t.status),
    index("pharmacy_orders_created_at_idx").on(t.createdAt),
  ]
);

export const insertPharmacyOrderSchema = createInsertSchema(pharmacyOrdersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPharmacyOrder = z.infer<typeof insertPharmacyOrderSchema>;
export type PharmacyOrder = typeof pharmacyOrdersTable.$inferSelect;
