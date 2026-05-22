import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userTotpSetupTable = pgTable(
  "user_totp_setup",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("user_totp_setup_user_id_idx").on(table.userId)]
);
