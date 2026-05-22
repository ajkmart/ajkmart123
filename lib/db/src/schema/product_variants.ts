import { boolean, decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const productVariantsTable = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    type: text("type").notNull().default("size"),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
    sku: text("sku"),
    stock: integer("stock"),
    inStock: boolean("in_stock").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    attributes: text("attributes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("product_variants_product_id_idx").on(t.productId),
    index("product_variants_type_idx").on(t.type),
    index("product_variants_sku_idx").on(t.sku),
  ]
);

export const insertProductVariantSchema = createInsertSchema(productVariantsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariantsTable.$inferSelect;
