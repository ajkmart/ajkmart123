import { boolean, decimal, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const vendorProfilesTable = pgTable("vendor_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  storeName: text("store_name"),
  storeCategory: text("store_category"),
  storeBanner: text("store_banner"),
  storeDescription: text("store_description"),
  storeHours: text("store_hours"),
  storeAnnouncement: text("store_announcement"),
  storeMinOrder: decimal("store_min_order", { precision: 10, scale: 2 }).default("0"),
  storeDeliveryTime: text("store_delivery_time"),
  storeIsOpen: boolean("store_is_open").notNull().default(true),
  storeAddress: text("store_address"),
  /* geo-coordinates for the store front */
  storeLat: decimal("store_lat", { precision: 10, scale: 7 }),
  storeLng: decimal("store_lng", { precision: 10, scale: 7 }),
  businessType: text("business_type"),
  businessName: text("business_name"),
  ntn: text("ntn"),
  /* document photo URLs (added by migration 0039) */
  cnicFrontUrl: text("cnic_front_url"),
  cnicBackUrl: text("cnic_back_url"),
  businessDocUrl: text("business_doc_url"),
  /* quick reply templates (added by drizzle migration 0003) */
  quickReplies: text("quick_replies"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVendorProfileSchema = createInsertSchema(vendorProfilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type VendorProfile = typeof vendorProfilesTable.$inferSelect;
