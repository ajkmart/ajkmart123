import { boolean, decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const flashDealsTable = pgTable(
  "flash_deals",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    title: text("title"),
    badge: text("badge").notNull().default("FLASH"),
    discountPct: decimal("discount_pct", { precision: 5, scale: 2 }),
    discountFlat: decimal("discount_flat", { precision: 10, scale: 2 }),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    dealStock: integer("deal_stock"),
    soldCount: integer("sold_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("flash_deals_product_id_idx").on(t.productId),
    index("flash_deals_is_active_idx").on(t.isActive),
    index("flash_deals_end_time_idx").on(t.endTime),
  ]
);

export const insertFlashDealSchema = createInsertSchema(flashDealsTable).omit({
  createdAt: true,
  soldCount: true,
});
export type InsertFlashDeal = z.infer<typeof insertFlashDealSchema>;
export type FlashDeal = typeof flashDealsTable.$inferSelect;
