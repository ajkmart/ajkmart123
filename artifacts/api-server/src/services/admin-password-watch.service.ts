/**
 * admin-password-watch.service.ts — out-of-band admin password reset
 * detection.
 *
 * Background:
 *   The in-app password flows (`completeAdminPasswordReset`,
 *   `changeAdminPassword`, super-admin "send reset link", and the
 *   first-boot seed) all funnel through code that we can instrument.
 *   But an operator can also reset an admin's password by writing
 *   directly to the database (a `psql` UPDATE on `admin_accounts.secret`),
 *   which is exactly what was done for account recovery. That path
 *   produces no audit trail and the affected admin gets no notification,
 *   so a malicious operator could take over an account silently.
 *
 * Approach:
 *   * After every *known* in-app password mutation we call
 *     `recordAdminPasswordSnapshot` to upsert a row in
 *     `admin_password_hash_snapshots` storing sha256(secret).
 *   * On startup `detectAndNotifyOutOfBandPasswordResets` walks every
 *     admin account, compares the current sha256(secret) against the
 *     snapshot, and:
 *       - if the snapshot is missing → records one (first observation,
 *         no alert; we cannot prove it was tampered with vs. simply
 *         pre-existing the watchdog).
 *       - if the snapshot matches → bumps `last_verified_at`.
 *       - if the snapshot differs → fires
 *         `notifyOutOfBandAdminPasswordReset` (email + audit log) and
 *         then refreshes the snapshot so we don't double-alert on the
 *         next boot.
 *
 *   The watchdog is best-effort: any failure is logged and swallowed —
 *   it must never block API boot.
 */
import { db } from "@workspace/db";
import {
  adminAccountsTable,
  adminPasswordHashSnapshotsTable,
  type AdminAccount,
} from "@workspace/db/schema";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { logAdminAudit } from "../middleware/admin-audit.js";
import { sendAdminPasswordOutOfBandResetEmail } from "./email.js";

/** sha256 of the bcrypt secret — keeps the snapshot table cheap to scan
 *  and one extra hop away from the actual hash. */
function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Record (insert or refresh) a snapshot of the admin's current password
 * hash. Call this from every code path that legitimately changes the
 * `admin_accounts.secret` column so the watchdog does not later flag
 * those changes as out-of-band.
 *
 * Best-effort: errors are logged and swallowed. Failing to record a
 * snapshot will at worst cause one false-positive alert on the next
 * boot, which is preferable to taking down the legitimate flow.
 */
export async function recordAdminPasswordSnapshot(input: {
  adminId: string;
  secret: string;
  passwordChangedAt?: Date | null;
}): Promise<void> {
  try {
    const now = new Date();
    const secretHash = sha256(input.secret);
    await db
      .insert(adminPasswordHashSnapshotsTable)
      .values({
        adminId: input.adminId,
        secretHash,
        passwordChangedAt: input.passwordChangedAt ?? now,
        lastVerifiedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: adminPasswordHashSnapshotsTable.adminId,
        set: {
          secretHash,
          passwordChangedAt: input.passwordChangedAt ?? now,
          lastVerifiedAt: now,
          updatedAt: now,
        },
      });
  } catch (err) {
    logger.error(
      { adminId: input.adminId, err },
      "[admin-password-watch] failed to record snapshot"
    );
  }
}

export interface OutOfBandResetDetection {
  adminId: string;
  email: string | null;
  detectedAt: Date;
  previousChangedAt: Date | null;
  emailed: boolean;
  emailReason?: string;
}

/**
 * Notify the affected admin that their password was changed outside
 * the normal flow. Sends an email (best-effort) and writes an audit-log
 * entry alongside the existing reset events so the change shows up in
 * the same trail super-admins already monitor.
 */
async function notifyOutOfBandAdminPasswordReset(
  admin: AdminAccount,
  previousChangedAt: Date | null,
  detectedAt: Date
): Promise<OutOfBandResetDetection> {
  const result: OutOfBandResetDetection = {
    adminId: admin.id,
    email: admin.email,
    detectedAt,
    previousChangedAt,
    emailed: false,
  };

  if (admin.email) {
    try {
      const sendResult = await sendAdminPasswordOutOfBandResetEmail(admin.email, {
        recipientName: admin.name,
        detectedAt,
        previousChangedAt,
      });
      result.emailed = sendResult.sent;
      if (!sendResult.sent) result.emailReason = sendResult.reason;
    } catch (err) {
      logger.error({ adminId: admin.id, err }, "[admin-password-watch] email throw");
      result.emailReason = (err as Error).message;
    }
  } else {
    result.emailReason = "Admin has no email address on file";
    logger.warn(
      { adminId: admin.id },
      "[admin-password-watch] cannot notify admin — no email address"
    );
  }

  await logAdminAudit("admin_password_out_of_band_reset_detected", {
    adminId: admin.id,
    ip: "system",
    result: result.emailed ? "success" : "failure",
    reason: result.emailed ? undefined : (result.emailReason ?? "Notification email not delivered"),
    metadata: {
      source: "direct_database_write",
      detectedAt: detectedAt.toISOString(),
      previousChangedAt: previousChangedAt ? previousChangedAt.toISOString() : null,
      currentChangedAt: admin.passwordChangedAt ? admin.passwordChangedAt.toISOString() : null,
      notificationEmail: admin.email ?? null,
      emailDelivered: result.emailed,
    },
  });

  return result;
}

export interface WatchdogRunSummary {
  scanned: number;
  newSnapshots: number;
  verified: number;
  outOfBand: OutOfBandResetDetection[];
}

/**
 * Walk every admin row, compare current secret hash vs the snapshot,
 * and emit a one-shot notification per detected out-of-band reset.
 *
 * Returns a summary for log surface; never throws. Safe to invoke from
 * `runStartupTasks` or a future scheduled job.
 */
export async function detectAndNotifyOutOfBandPasswordResets(): Promise<WatchdogRunSummary> {
  const summary: WatchdogRunSummary = {
    scanned: 0,
    newSnapshots: 0,
    verified: 0,
    outOfBand: [],
  };

  let admins: AdminAccount[] = [];
  try {
    admins = await db.select().from(adminAccountsTable);
  } catch (err) {
    logger.error({ err }, "[admin-password-watch] failed to load admin_accounts — skipping run");
    return summary;
  }

  for (const admin of admins) {
    summary.scanned += 1;
    try {
      const now = new Date();
      const currentHash = sha256(admin.secret);

      const [snapshot] = await db
        .select()
        .from(adminPasswordHashSnapshotsTable)
        .where(eq(adminPasswordHashSnapshotsTable.adminId, admin.id))
        .limit(1);

      if (!snapshot) {
        // First observation — record without alerting. We cannot tell a
        // legitimate pre-existing admin apart from a tampered one with no
        // prior baseline, so we choose to never raise on this branch.
        await db.insert(adminPasswordHashSnapshotsTable).values({
          adminId: admin.id,
          secretHash: currentHash,
          passwordChangedAt: admin.passwordChangedAt ?? null,
          lastVerifiedAt: now,
          updatedAt: now,
        });
        summary.newSnapshots += 1;
        continue;
      }

      if (snapshot.secretHash === currentHash) {
        // Bump last_verified_at as a heartbeat — handy for operator
        // visibility ("when did the watchdog last confirm this admin?").
        await db
          .update(adminPasswordHashSnapshotsTable)
          .set({ lastVerifiedAt: now })
          .where(eq(adminPasswordHashSnapshotsTable.adminId, admin.id));
        summary.verified += 1;
        continue;
      }

      // Hash differs and we have a baseline — this is the out-of-band path.
      const detection = await notifyOutOfBandAdminPasswordReset(
        admin,
        snapshot.passwordChangedAt ?? null,
        now
      );
      summary.outOfBand.push(detection);

      // Refresh the snapshot so we do not re-alert on every boot.
      await db
        .update(adminPasswordHashSnapshotsTable)
        .set({
          secretHash: currentHash,
          passwordChangedAt: admin.passwordChangedAt ?? null,
          lastVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(adminPasswordHashSnapshotsTable.adminId, admin.id));
    } catch (err) {
      logger.error({ adminId: admin.id, err }, "[admin-password-watch] check failed for admin");
    }
  }

  if (summary.outOfBand.length > 0) {
    logger.warn(
      { count: summary.outOfBand.length },
      "[admin-password-watch] detected out-of-band password reset(s) — affected admins notified"
    );
  } else {
    logger.info(
      { scanned: summary.scanned, verified: summary.verified, newSnapshots: summary.newSnapshots },
      "[admin-password-watch] watchdog run complete"
    );
  }

  return summary;
}
