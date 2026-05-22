import {
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const referralCodesTable = pgTable(
  "referral_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rewardAmount: decimal("reward_amount", { precision: 10, scale: 2 }).notNull().default("50"),
    usedCount: integer("used_count").notNull().default(0),
    maxUses: integer("max_uses"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("referral_codes_code_uidx").on(t.code),
    index("referral_codes_owner_user_id_idx").on(t.ownerUserId),
  ]
);

export const referralUsagesTable = pgTable(
  "referral_usages",
  {
    id: text("id").primaryKey(),
    codeId: text("code_id")
      .notNull()
      .references(() => referralCodesTable.id, { onDelete: "cascade" }),
    refereeUserId: text("referee_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rewardAmount: decimal("reward_amount", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("referral_usages_referee_uidx").on(t.refereeUserId),
    index("referral_usages_code_id_idx").on(t.codeId),
    index("referral_usages_referrer_idx").on(t.referrerUserId),
  ]
);

export type ReferralCode = typeof referralCodesTable.$inferSelect;
export type ReferralUsage = typeof referralUsagesTable.$inferSelect;
