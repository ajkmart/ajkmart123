import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const productsTable = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
    category: text("category").notNull(),
    type: text("type").notNull().default("mart"),
    image: text("image"),
    images: text("images").array(),
    /* ── Video showcase (added by migration 0027) ── */
    videoUrl: text("video_url"),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    vendorName: text("vendor_name"),
    rating: decimal("rating", { precision: 3, scale: 1 }).default("4.0"),
    reviewCount: integer("review_count").default(0),
    inStock: boolean("in_stock").notNull().default(true),
    stock: integer("stock"),
    /* ── Stock management ── */
    lowStockThreshold: integer("low_stock_threshold"),
    maxQuantityPerOrder: integer("max_quantity_per_order"),
    backInStockNotify: boolean("back_in_stock_notify"),
    unit: text("unit"),
    deliveryTime: text("delivery_time"),
    dealExpiresAt: timestamp("deal_expires_at"),
    approvalStatus: text("approval_status").notNull().default("approved"),
    /* ── Soft delete ── */
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("products_vendor_id_idx").on(t.vendorId),
    index("products_category_idx").on(t.category),
    index("products_in_stock_idx").on(t.inStock),
    index("products_type_idx").on(t.type),
    check("products_price_positive", sql`${t.price} > 0`),
  ]
);

export const insertProductSchema = createInsertSchema(productsTable).omit({ createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
