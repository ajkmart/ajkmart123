import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const languageEnum = pgEnum("language_mode", ["en", "ur", "roman"]);

export const userSettingsTable = pgTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  notifOrders: boolean("notif_orders").notNull().default(true),
  notifWallet: boolean("notif_wallet").notNull().default(true),
  notifDeals: boolean("notif_deals").notNull().default(true),
  notifRides: boolean("notif_rides").notNull().default(true),
  locationSharing: boolean("location_sharing").notNull().default(true),
  biometric: boolean("biometric").notNull().default(false),
  twoFactor: boolean("two_factor").notNull().default(false),
  darkMode: boolean("dark_mode").notNull().default(false),
  language: languageEnum("language").notNull().default("en"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettingsTable).omit({
  updatedAt: true,
});
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettingsTable.$inferSelect;
