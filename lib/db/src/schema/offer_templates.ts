import { boolean, decimal, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const offerTemplatesTable = pgTable("offer_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  code: text("code"),
  discountPct: decimal("discount_pct", { precision: 5, scale: 2 }),
  discountFlat: decimal("discount_flat", { precision: 10, scale: 2 }),
  minOrderAmount: decimal("min_order_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }),
  buyQty: integer("buy_qty"),
  getQty: integer("get_qty"),
  cashbackPct: decimal("cashback_pct", { precision: 5, scale: 2 }),
  cashbackMax: decimal("cashback_max", { precision: 10, scale: 2 }),
  freeDelivery: boolean("free_delivery").notNull().default(false),
  targetingRules: jsonb("targeting_rules").notNull().default({}),
  stackable: boolean("stackable").notNull().default(false),
  usageLimit: integer("usage_limit"),
  usagePerUser: integer("usage_per_user").notNull().default(1),
  appliesTo: text("applies_to").notNull().default("all"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOfferTemplateSchema = createInsertSchema(offerTemplatesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertOfferTemplate = z.infer<typeof insertOfferTemplateSchema>;
export type OfferTemplate = typeof offerTemplatesTable.$inferSelect;
