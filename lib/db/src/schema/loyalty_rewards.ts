import { boolean, decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const loyaltyRewardsTable = pgTable(
  "loyalty_rewards",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    pointsCost: integer("points_cost").notNull(),
    rewardType: text("reward_type").notNull().default("discount"),
    rewardValue: decimal("reward_value", { precision: 10, scale: 2 }).notNull(),
    stock: integer("stock"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("loyalty_rewards_active_idx").on(t.isActive),
    index("loyalty_rewards_type_idx").on(t.rewardType),
    index("loyalty_rewards_cost_idx").on(t.pointsCost),
  ]
);

export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewardsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;
export type LoyaltyReward = typeof loyaltyRewardsTable.$inferSelect;
