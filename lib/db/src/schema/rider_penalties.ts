import { decimal, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const riderPenaltiesTable = pgTable(
  "rider_penalties",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull().default("0"),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("rider_penalties_rider_id_idx").on(t.riderId),
    index("rider_penalties_type_idx").on(t.type),
    index("rider_penalties_created_at_idx").on(t.createdAt),
  ]
);

export const insertRiderPenaltySchema = createInsertSchema(riderPenaltiesTable).omit({
  createdAt: true,
});
export type InsertRiderPenalty = z.infer<typeof insertRiderPenaltySchema>;
export type RiderPenalty = typeof riderPenaltiesTable.$inferSelect;
