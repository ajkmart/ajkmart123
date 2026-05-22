import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const weatherConfigTable = pgTable("weather_config", {
  id: text("id").primaryKey().default("default"),
  widgetEnabled: boolean("widget_enabled").notNull().default(true),
  cities: text("cities").notNull().default("Muzaffarabad,Rawalakot,Mirpur,Bagh,Kotli,Neelum"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type WeatherConfig = typeof weatherConfigTable.$inferSelect;
