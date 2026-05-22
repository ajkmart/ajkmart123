import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminAccountsTable } from "./admin_accounts";

/**
 * Admin password hash snapshots.
 *
 * One row per admin. Stores the sha256 of the bcrypt secret that the
 * application most recently set/observed via a *known* in-app code path
 * (super-admin seed, completed reset link, authenticated change-password,
 * or first observation at startup). Used by the startup watchdog
 * (`detectAndNotifyOutOfBandPasswordResets`) to detect the case where
 * `admin_accounts.secret` has been mutated *outside* the app — typically
 * by an operator running an SQL UPDATE for account recovery, or by a
 * compromised database operator silently rewriting an admin's hash.
 *
 * On detection the affected admin is emailed and an audit-log entry is
 * recorded so the change appears alongside the existing reset events.
 *
 * Storing only the sha256 of the bcrypt hash (rather than the bcrypt
 * hash itself) keeps the secret distance one extra hop deep and makes
 * the table cheap to scan at startup.
 */
export const adminPasswordHashSnapshotsTable = pgTable("admin_password_hash_snapshots", {
  adminId: text("admin_id")
    .primaryKey()
    .references(() => adminAccountsTable.id, { onDelete: "cascade" }),
  /** sha256(admin_accounts.secret) at the time the snapshot was taken. */
  secretHash: text("secret_hash").notNull(),
  /** Mirrors `admin_accounts.password_changed_at` when the snapshot
   *  was written, so we can describe the previous state in alerts. */
  passwordChangedAt: timestamp("password_changed_at"),
  /** When the watchdog last verified this snapshot still matched. */
  lastVerifiedAt: timestamp("last_verified_at").notNull().defaultNow(),
  /** Updated on every snapshot write (insert or refresh). */
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdminPasswordHashSnapshotSchema = createInsertSchema(
  adminPasswordHashSnapshotsTable
);

export type InsertAdminPasswordHashSnapshot = z.infer<typeof insertAdminPasswordHashSnapshotSchema>;
export type AdminPasswordHashSnapshot = typeof adminPasswordHashSnapshotsTable.$inferSelect;
