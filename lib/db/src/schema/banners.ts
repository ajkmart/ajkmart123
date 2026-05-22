import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bannersTable = pgTable(
  "banners",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    imageUrl: text("image_url"),
    linkType: text("link_type").notNull().default("none"),
    linkValue: text("link_value"),
    targetService: text("target_service"),
    placement: text("placement").notNull().default("home"),
    colorFrom: text("color_from").notNull().default("#7C3AED"),
    colorTo: text("color_to").notNull().default("#4F46E5"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("banners_is_active_idx").on(t.isActive),
    index("banners_placement_idx").on(t.placement),
    index("banners_sort_order_idx").on(t.sortOrder),
  ]
);

export const insertBannerSchema = createInsertSchema(bannersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBanner = z.infer<typeof insertBannerSchema>;
export type Banner = typeof bannersTable.$inferSelect;
