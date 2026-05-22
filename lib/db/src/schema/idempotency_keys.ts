import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const idempotencyKeysTable = pgTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    responseData: text("response_data").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("idempotency_keys_user_key_uniq").on(t.userId, t.idempotencyKey)]
);
