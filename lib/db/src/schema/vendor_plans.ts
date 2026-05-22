import { boolean, integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

export const vendorPlansTable = pgTable("vendor_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  featuresJson: text("features_json").notNull().default("[]"),
  commissionRate: real("commission_rate").notNull().default(15),
  monthlyFee: real("monthly_fee").notNull().default(0),
  maxProducts: integer("max_products").notNull().default(50),
  maxOrders: integer("max_orders").notNull().default(500),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type VendorPlan = typeof vendorPlansTable.$inferSelect;
export type InsertVendorPlan = typeof vendorPlansTable.$inferInsert;
