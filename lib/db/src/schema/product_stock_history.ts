import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const productStockHistoryTable = pgTable(
  "product_stock_history",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    previousStock: integer("previous_stock"),
    newStock: integer("new_stock"),
    quantityDelta: integer("quantity_delta"),
    reason: text("reason").notNull().default("manual"),
    orderId: text("order_id"),
    source: text("source").notNull().default("manual"),
    changedAt: timestamp("changed_at").notNull().defaultNow(),
  },
  (t) => [
    index("product_stock_history_product_id_idx").on(t.productId),
    index("product_stock_history_vendor_id_idx").on(t.vendorId),
    index("product_stock_history_changed_at_idx").on(t.changedAt),
    index("product_stock_history_order_id_idx").on(t.orderId),
  ]
);

export type ProductStockHistory = typeof productStockHistoryTable.$inferSelect;
