import { boolean, decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const promoCodesTable = pgTable(
  "promo_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    description: text("description"),
    discountPct: decimal("discount_pct", { precision: 5, scale: 2 }),
    discountFlat: decimal("discount_flat", { precision: 10, scale: 2 }),
    minOrderAmount: decimal("min_order_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    appliesTo: text("applies_to").notNull().default("all"),
    expiresAt: timestamp("expires_at"),
    vendorId: text("vendor_id").references(() => usersTable.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("promo_codes_vendor_id_idx").on(t.vendorId),
    index("promo_codes_is_active_idx").on(t.isActive),
    index("promo_codes_expires_at_idx").on(t.expiresAt),
  ]
);

export const insertPromoCodeSchema = createInsertSchema(promoCodesTable).omit({
  createdAt: true,
  usedCount: true,
});
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodesTable.$inferSelect;
