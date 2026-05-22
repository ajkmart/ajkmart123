import { decimal, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const loyaltyCampaignsTable = pgTable(
  "loyalty_campaigns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("bonus_multiplier"),
    bonusMultiplier: decimal("bonus_multiplier", { precision: 5, scale: 2 }).default("1.00"),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("loyalty_campaigns_status_idx").on(t.status),
    index("loyalty_campaigns_start_idx").on(t.startDate),
    index("loyalty_campaigns_end_idx").on(t.endDate),
  ]
);

export const insertLoyaltyCampaignSchema = createInsertSchema(loyaltyCampaignsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertLoyaltyCampaign = z.infer<typeof insertLoyaltyCampaignSchema>;
export type LoyaltyCampaign = typeof loyaltyCampaignsTable.$inferSelect;
