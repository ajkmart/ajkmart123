import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const adminRolePresetsTable = pgTable("admin_role_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  permissionsJson: text("permissions_json").notNull().default("[]"),
  role: text("role").notNull().default("manager"),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminRolePreset = typeof adminRolePresetsTable.$inferSelect;
export type InsertAdminRolePreset = typeof adminRolePresetsTable.$inferInsert;
