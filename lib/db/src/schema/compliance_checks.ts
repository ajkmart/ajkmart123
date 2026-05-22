import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * compliance_checks — Per-user compliance screening results.
 *
 * Records the outcome of automated and manual compliance checks including
 * CNIC verification, KYC document review, PEP screening, and AML checks.
 * Each row is immutable (append-only) so the full audit history is retained.
 *
 * check_type values:  "cnic" | "kyc" | "pep_screening" | "aml"
 * result values:      "pass" | "fail" | "review"
 */
export const complianceChecksTable = pgTable("compliance_checks", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  /** Category of check performed. */
  checkType: text("check_type").notNull(),
  /** Outcome: pass | fail | review */
  result: text("result").notNull(),
  /** Optional numeric risk score (e.g. AML risk score 0–100). */
  score: integer("score"),
  /** Structured detail payload — provider response, flags, reasons, etc. */
  details: jsonb("details"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  /** "system" for automated checks, or an admin account ID for manual ones. */
  checkedBy: text("checked_by"),
});

export type ComplianceCheck = typeof complianceChecksTable.$inferSelect;
export type NewComplianceCheck = typeof complianceChecksTable.$inferInsert;
