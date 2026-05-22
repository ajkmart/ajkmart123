import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const pharmacyPrescriptionRefsTable = pgTable(
  "pharmacy_prescription_refs",
  {
    refId: text("ref_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    photoUrl: text("photo_url").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [
    index("pharmacy_prescription_refs_user_id_idx").on(t.userId),
    index("pharmacy_prescription_refs_expires_at_idx").on(t.expiresAt),
  ]
);

export type PharmacyPrescriptionRef = typeof pharmacyPrescriptionRefsTable.$inferSelect;
