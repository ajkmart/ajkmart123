import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const deepLinksTable = pgTable(
  "deep_links",
  {
    id: text("id").primaryKey(),
    shortCode: text("short_code").notNull().unique(),
    targetScreen: text("target_screen").notNull(),
    params: jsonb("params").notNull().default({}),
    label: text("label").notNull().default(""),
    clickCount: integer("click_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("deep_links_short_code_idx").on(t.shortCode),
    index("deep_links_target_idx").on(t.targetScreen),
  ]
);

export type DeepLink = typeof deepLinksTable.$inferSelect;
