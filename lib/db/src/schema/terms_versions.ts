import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * terms_versions — published versions of every legal / consent policy
 * (terms, privacy, marketing, …). The admin "Consent Log" surface POSTs
 * to this table to force a re-acceptance flow on the next mobile launch.
 * Primary key is `(policy, version)` so the POST endpoint can be made
 * idempotent — repeated submissions of the same version no-op.
 */
export const termsVersionsTable = pgTable(
  "terms_versions",
  {
    policy: text("policy").notNull(),
    version: text("version").notNull(),
    effectiveAt: timestamp("effective_at").notNull().defaultNow(),
    bodyMarkdown: text("body_markdown"),
    changelog: text("changelog"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.policy, t.version] }),
    index("terms_versions_policy_effective_idx").on(t.policy, t.effectiveAt),
  ]
);

export type TermsVersion = typeof termsVersionsTable.$inferSelect;
