import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const popupCampaignsTable = pgTable(
  "popup_campaigns",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body"),
    mediaUrl: text("media_url"),
    ctaText: text("cta_text"),
    ctaLink: text("cta_link"),
    popupType: text("popup_type").notNull().default("modal"),
    displayFrequency: text("display_frequency").notNull().default("once"),
    maxImpressionsPerUser: integer("max_impressions_per_user").default(1),
    maxTotalImpressions: integer("max_total_impressions"),
    priority: integer("priority").notNull().default(0),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    timezone: text("timezone").default("Asia/Karachi"),
    targeting: jsonb("targeting")
      .$type<{
        roles?: string[];
        userIds?: string[];
        cities?: string[];
        newUsers?: boolean;
        minOrderCount?: number;
        maxOrderCount?: number;
        minOrderValue?: number;
        categories?: string[];
        serviceTypes?: string[];
      }>()
      .default({}),
    status: text("status").notNull().default("draft"),
    stylePreset: text("style_preset").default("default"),
    colorFrom: text("color_from").default("#7C3AED"),
    colorTo: text("color_to").default("#4F46E5"),
    textColor: text("text_color").default("#FFFFFF"),
    animation: text("animation").default("fade"),
    templateId: text("template_id"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("popup_campaigns_status_idx").on(t.status),
    index("popup_campaigns_priority_idx").on(t.priority),
    index("popup_campaigns_start_date_idx").on(t.startDate),
    index("popup_campaigns_end_date_idx").on(t.endDate),
  ]
);

export const insertPopupCampaignSchema = createInsertSchema(popupCampaignsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPopupCampaign = z.infer<typeof insertPopupCampaignSchema>;
export type PopupCampaign = typeof popupCampaignsTable.$inferSelect;
