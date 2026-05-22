import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriesTable = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("grid-outline"),
    type: text("type").notNull().default("mart"),
    parentId: text("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("categories_type_idx").on(t.type),
    index("categories_parent_id_idx").on(t.parentId),
    index("categories_sort_order_idx").on(t.sortOrder),
    index("categories_is_active_idx").on(t.isActive),
  ]
);

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
