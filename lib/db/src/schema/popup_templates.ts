import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const popupTemplatesTable = pgTable("popup_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("general"),
  popupType: text("popup_type").notNull().default("modal"),
  defaultTitle: text("default_title"),
  defaultBody: text("default_body"),
  defaultCtaText: text("default_cta_text"),
  colorFrom: text("color_from").notNull().default("#7C3AED"),
  colorTo: text("color_to").notNull().default("#4F46E5"),
  textColor: text("text_color").notNull().default("#FFFFFF"),
  animation: text("animation").default("fade"),
  stylePreset: text("style_preset").default("default"),
  previewImageUrl: text("preview_image_url"),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPopupTemplateSchema = createInsertSchema(popupTemplatesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPopupTemplate = z.infer<typeof insertPopupTemplateSchema>;
export type PopupTemplate = typeof popupTemplatesTable.$inferSelect;
