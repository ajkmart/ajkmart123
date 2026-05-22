import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformSettingsTable = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull().default("general"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlatformSettingSchema = createInsertSchema(platformSettingsTable).omit({
  updatedAt: true,
});
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type PlatformSetting = typeof platformSettingsTable.$inferSelect;
