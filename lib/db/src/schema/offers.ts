import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const offersTable = pgTable(
  "offers",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull(),
    code: text("code").unique(),
    discountPct: decimal("discount_pct", { precision: 5, scale: 2 }),
    discountFlat: decimal("discount_flat", { precision: 10, scale: 2 }),
    minOrderAmount: decimal("min_order_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }),
    buyQty: integer("buy_qty"),
    getQty: integer("get_qty"),
    cashbackPct: decimal("cashback_pct", { precision: 5, scale: 2 }),
    cashbackMax: decimal("cashback_max", { precision: 10, scale: 2 }),
    freeDelivery: boolean("free_delivery").notNull().default(false),
    targetingRules: jsonb("targeting_rules").notNull().default({}),
    stackable: boolean("stackable").notNull().default(false),
    usageLimit: integer("usage_limit"),
    usagePerUser: integer("usage_per_user").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    appliesTo: text("applies_to").notNull().default("all"),
    vendorId: text("vendor_id"),
    status: text("status").notNull().default("draft"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    createdBy: text("created_by"),
    approvedBy: text("approved_by"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("offers_campaign_id_idx").on(t.campaignId),
    index("offers_status_idx").on(t.status),
    index("offers_type_idx").on(t.type),
    index("offers_code_idx").on(t.code),
    index("offers_start_date_idx").on(t.startDate),
    index("offers_end_date_idx").on(t.endDate),
    index("offers_applies_to_idx").on(t.appliesTo),
    index("offers_vendor_id_idx").on(t.vendorId),
  ]
);

export const offerRedemptionsTable = pgTable(
  "offer_redemptions",
  {
    id: text("id").primaryKey(),
    offerId: text("offer_id")
      .notNull()
      .references(() => offersTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    orderId: text("order_id"),
    discount: decimal("discount", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("offer_redemptions_offer_id_idx").on(t.offerId),
    index("offer_redemptions_user_id_idx").on(t.userId),
    index("offer_redemptions_order_id_idx").on(t.orderId),
    index("offer_redemptions_created_at_idx").on(t.createdAt),
  ]
);

export const campaignParticipationsTable = pgTable(
  "campaign_participations",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id").notNull(),
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("campaign_participations_campaign_id_idx").on(t.campaignId),
    index("campaign_participations_vendor_id_idx").on(t.vendorId),
  ]
);

export const insertOfferSchema = createInsertSchema(offersTable).omit({
  createdAt: true,
  updatedAt: true,
  usedCount: true,
});
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;
export type OfferRedemption = typeof offerRedemptionsTable.$inferSelect;
export type CampaignParticipation = typeof campaignParticipationsTable.$inferSelect;
