import { decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignsTable = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    theme: text("theme").notNull().default("general"),
    colorFrom: text("color_from").notNull().default("#7C3AED"),
    colorTo: text("color_to").notNull().default("#4F46E5"),
    bannerImage: text("banner_image"),
    priority: integer("priority").notNull().default(0),
    budgetCap: decimal("budget_cap", { precision: 12, scale: 2 }),
    budgetSpent: decimal("budget_spent", { precision: 12, scale: 2 }).notNull().default("0"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by"),
    approvedBy: text("approved_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("campaigns_status_idx").on(t.status),
    index("campaigns_start_date_idx").on(t.startDate),
    index("campaigns_end_date_idx").on(t.endDate),
    index("campaigns_priority_idx").on(t.priority),
  ]
);

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  createdAt: true,
  updatedAt: true,
  budgetSpent: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
