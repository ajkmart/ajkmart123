import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const faqsTable = pgTable("faqs", {
  id: text("id").primaryKey(),
  category: text("category").notNull().default("General"),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FAQ = typeof faqsTable.$inferSelect;
export type InsertFAQ = typeof faqsTable.$inferInsert;
