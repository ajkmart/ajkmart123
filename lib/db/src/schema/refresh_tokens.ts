import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    authMethod: text("auth_method"),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    /* ── Token-family tracking (migrations 0006 + 0009) — replay-attack detection ── */
    tokenFamilyId: text("token_family_id"),
    revoked: boolean("revoked").notNull().default(false),
    revokedReason: text("revoked_reason"),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_refresh_tokens_family_id").on(t.tokenFamilyId)]
);

export type RefreshToken = typeof refreshTokensTable.$inferSelect;
