import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const releaseNotesTable = pgTable("release_notes", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  releaseDate: text("release_date").notNull(),
  notes: text("notes").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ReleaseNote = typeof releaseNotesTable.$inferSelect;
