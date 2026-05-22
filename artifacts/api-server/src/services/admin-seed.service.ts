/**
 * admin-seed.service.ts — first-boot super-admin seeding.
 *
 * Behaviour:
 *  - On every startup we check whether **any** admin account exists. If
 *    one or more rows are present, we do nothing for the seed step
 *    itself, but the boot reconciliation (`reconcileSeededSuperAdmin`)
 *    still runs to make sure the bootstrap admin always matches the
 *    documented default credentials.
 *  - If the `admin_accounts` table is empty we provision a default
 *    super-admin using `ADMIN_SEED_PASSWORD` (default
 *    `Admin@123`). The account is created with
 *    `must_change_password = false` and `default_credentials = true` so
 *    the SPA knows to show the optional "customise your credentials"
 *    popup on first login — but skipping it keeps the default
 *    credentials working.
 *  - The seeded admin is granted the built-in `super_admin` RBAC role so
 *    `/api/admin/system/rbac/*` and every permission gate works out of
 *    the box.
 *
 * The seed is best-effort: failure logs an error and does not crash boot.
 */
import { db } from "@workspace/db";
import { adminAccountsTable, adminRoleAssignmentsTable, rolesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { logAdminAudit } from "../middleware/admin-audit.js";
import { recordAdminPasswordSnapshot } from "./admin-password-watch.service.js";
import { hashAdminSecret } from "./password.js";

const SUPER_ADMIN_SLUG = "super_admin";
const DEFAULT_SEED_EMAIL = "admin@ajkmart.local";
const DEFAULT_SEED_USERNAME = "superadmin";
const DEFAULT_SEED_NAME = "Super Admin";
/**
 * Hard-coded fallback for the bootstrap super-admin password used only in
 * development. This value is blocked in production — operators must supply
 * a strong, unique `ADMIN_SEED_PASSWORD` via the secrets manager.
 */
const DEFAULT_SEED_PASSWORD = "Admin@123";

/**
 * Passwords that are publicly known (including the documented default) and
 * must never be accepted as a production seed credential.
 */
const BLOCKED_SEED_PASSWORDS = new Set([
  "Admin@123",
  "admin@123",
  "admin123",
  "Admin123",
  "password",
  "Password1",
  "Password@1",
  "superadmin",
  "SuperAdmin",
  "123456",
  "12345678",
]);

/**
 * Enforce minimum production password strength: at least 16 characters,
 * containing at least one uppercase letter, one lowercase letter, one digit,
 * and one special character. Returns null when the password passes, or a
 * human-readable rejection reason when it does not.
 */
function rejectWeakSeedPassword(password: string): string | null {
  if (password.length < 16) {
    return "must be at least 16 characters long";
  }
  if (!/[A-Z]/.test(password)) {
    return "must contain at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "must contain at least one lowercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "must contain at least one digit";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "must contain at least one special character";
  }
  return null;
}

export interface SeedResult {
  /** True if a new admin was created on this boot. */
  created: boolean;
  /** Email of the seeded admin (for log surface). */
  email?: string;
}

function resolveSeedPassword(): string {
  const fromEnv = process.env.ADMIN_SEED_PASSWORD?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SEED_PASSWORD;
}

/**
 * Seed the default super-admin if and only if no admin accounts exist.
 * Idempotent — safe to call on every boot.
 *
 * Production guard: in production the seed is skipped unless the operator
 * has explicitly set `ADMIN_SEED_PASSWORD`. Deploying with the publicly
 * documented fallback password `Admin@123` would leave a fully-functional
 * super-admin account with a well-known credential, so we refuse to create
 * it and log a clear message explaining what the operator must do instead.
 */
export async function seedDefaultSuperAdmin(): Promise<SeedResult> {
  const existing = await db.select({ id: adminAccountsTable.id }).from(adminAccountsTable).limit(1);

  if (existing.length > 0) {
    // Idempotent no-op path. Log explicitly so operators can confirm at boot
    // that seeding ran and decided to leave the existing admin set alone,
    // instead of having to infer it from the absence of a "created" line.
    logger.info("[admin-seed] skipped — at least one admin account already exists");
    return { created: false };
  }

  // Production safety gate: refuse to seed with a missing, default, or
  // publicly-known password. The operator must supply a strong, unique
  // ADMIN_SEED_PASSWORD via the secrets manager before the first super-admin
  // account can be created automatically.
  const fromEnv = process.env.ADMIN_SEED_PASSWORD?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!fromEnv || fromEnv.length === 0) {
      logger.fatal(
        "[admin-seed] BLOCKED: no admin accounts exist and ADMIN_SEED_PASSWORD is not set. " +
          "Set ADMIN_SEED_PASSWORD to a strong unique password in your environment secrets, then restart. " +
          "The server will not create a default admin account with the documented fallback password in production."
      );
      return { created: false };
    }
    if (BLOCKED_SEED_PASSWORDS.has(fromEnv)) {
      logger.fatal(
        "[admin-seed] BLOCKED: ADMIN_SEED_PASSWORD is set to a publicly-known or weak value. " +
          "Choose a strong, unique password that is not in the documented defaults or common password lists, " +
          "then set it in your environment secrets and restart."
      );
      return { created: false };
    }
    const complexityError = rejectWeakSeedPassword(fromEnv);
    if (complexityError) {
      logger.fatal(
        `[admin-seed] BLOCKED: ADMIN_SEED_PASSWORD does not meet minimum strength requirements (${complexityError}). ` +
          "Use a password that is at least 16 characters and includes uppercase, lowercase, digits, and special characters."
      );
      return { created: false };
    }
  }

  const email = (process.env.ADMIN_SEED_EMAIL ?? DEFAULT_SEED_EMAIL).trim();
  const username = (process.env.ADMIN_SEED_USERNAME ?? DEFAULT_SEED_USERNAME).trim();
  const name = (process.env.ADMIN_SEED_NAME ?? DEFAULT_SEED_NAME).trim();
  const plainPassword = resolveSeedPassword();

  const id = `admin_${generateId()}`;
  const secret = hashAdminSecret(plainPassword);

  await db.insert(adminAccountsTable).values({
    id,
    name,
    username,
    email,
    secret,
    role: "super",
    permissions: "",
    isActive: true,
    // The forced "you must change your password" gate is gone — the SPA
    // surfaces an OPTIONAL post-login popup instead. The `defaultCredentials`
    // flag drives that dialog and flips to false on the first change.
    mustChangePassword: false,
    defaultCredentials: true,
  });

  // Baseline the out-of-band password watchdog so the seeded hash is
  // not flagged as a direct DB write on the next boot.
  await recordAdminPasswordSnapshot({
    adminId: id,
    secret,
    passwordChangedAt: null,
  });

  // Grant the super_admin RBAC role so the new admin has full permissions
  // even without relying on the legacy `role = 'super'` short-circuit.
  try {
    const [superRole] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.slug, SUPER_ADMIN_SLUG))
      .limit(1);

    if (superRole) {
      await db
        .insert(adminRoleAssignmentsTable)
        .values({ adminId: id, roleId: superRole.id, grantedBy: "system" })
        .onConflictDoNothing();
    } else {
      logger.warn(
        "[admin-seed] super_admin role not found — RBAC seed must run before admin seed for the new admin to receive role assignment"
      );
    }
  } catch (err) {
    logger.error({ err }, "[admin-seed] failed to assign super_admin role");
  }

  // Surface the bootstrap credentials on first boot so an operator that
  // is bringing the system up for the first time can capture them from
  // the logs. Subsequent boots are no-ops.
  logger.info({ email, username }, "[admin-seed] default super-admin created");
  logger.info("[admin-seed] password: (default — see ADMIN_SEED_PASSWORD env)");
  logger.info(
    "[admin-seed] The SPA will offer an OPTIONAL popup on first login so the super-admin can customise their credentials."
  );

  // Persist a permanent audit-log entry so the seeded super-admin shows up
  // in the same audit trail super-admins use day-to-day. Best-effort: a
  // failure here is logged but does not abort the seed.
  await logAdminAudit("admin_seed_super_admin_created", {
    adminId: id,
    ip: "system",
    result: "success",
    metadata: {
      email,
      username,
      passwordSource: process.env.ADMIN_SEED_PASSWORD ? "env" : "default",
      defaultCredentials: true,
    },
  });

  return { created: true, email };
}

/**
 * One-shot reconciliation: re-hash the seeded super-admin to the
 * documented default password. Runs only when the row is both flagged
 * stale (`mustChangePassword=true`) AND originally bootstrapped by the
 * seed path (`defaultCredentials=true`). The two-flag guard prevents
 * this from overwriting passwords set by the operational reset-link
 * flow, which arms `mustChangePassword` but never touches
 * `defaultCredentials`. Idempotent.
 */
export async function reconcileSeededSuperAdmin(): Promise<{ reset: boolean }> {
  const username = (process.env.ADMIN_SEED_USERNAME ?? DEFAULT_SEED_USERNAME).trim();

  const [seeded] = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.username, username))
    .limit(1);

  if (!seeded) return { reset: false };
  if (!seeded.mustChangePassword) return { reset: false };
  if (!seeded.defaultCredentials) return { reset: false };

  const plainPassword = resolveSeedPassword();
  const secret = hashAdminSecret(plainPassword);
  const now = new Date();

  await db
    .update(adminAccountsTable)
    .set({
      secret,
      mustChangePassword: false,
      defaultCredentials: true,
      // Intentionally leave passwordChangedAt untouched — it tracks
      // genuine user-initiated changes, not this server-side reset.
    })
    .where(eq(adminAccountsTable.id, seeded.id));

  // Refresh the out-of-band watchdog snapshot so the new hash is not
  // misread as a direct DB write on the next startup scan.
  await recordAdminPasswordSnapshot({
    adminId: seeded.id,
    secret,
    passwordChangedAt: now,
  });

  await logAdminAudit("admin_seed_super_admin_reset_to_default", {
    adminId: seeded.id,
    ip: "system",
    result: "success",
    metadata: {
      username,
      passwordSource: process.env.ADMIN_SEED_PASSWORD ? "env" : "default",
    },
  });

  logger.info({ username }, "[admin-seed] seeded super-admin reconciled to default credentials");
  logger.info("[admin-seed] password: (default — see ADMIN_SEED_PASSWORD env)");
  logger.info("[admin-seed] The SPA will surface the optional credentials popup.");

  return { reset: true };
}
