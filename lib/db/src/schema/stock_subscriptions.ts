import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const stockSubscriptionsTable = pgTable(
  "stock_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("stock_subscriptions_user_id_idx").on(t.userId),
    index("stock_subscriptions_product_id_idx").on(t.productId),
    unique("stock_subscriptions_user_product_uniq").on(t.userId, t.productId),
  ]
);

export type StockSubscription = typeof stockSubscriptionsTable.$inferSelect;
