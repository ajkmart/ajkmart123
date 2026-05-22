import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const qrCodesTable = pgTable(
  "qr_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    type: text("type").notNull().default("payment"),
    label: text("label").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("qr_codes_type_idx").on(t.type),
    index("qr_codes_is_active_idx").on(t.isActive),
    index("qr_codes_code_idx").on(t.code),
  ]
);

export type QrCode = typeof qrCodesTable.$inferSelect;
