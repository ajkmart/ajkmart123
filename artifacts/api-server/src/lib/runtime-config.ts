import { logger } from "./logger.js";
/**
 * runtime-config.ts
 *
 * Holds mutable runtime configuration values that can be changed without a
 * server restart. Values are initialised from environment variables on startup,
 * then optionally overridden from platform_settings on first use.
 *
 * Currently managed:
 *   ADMIN_SECRET — the master super-admin password. Initialised from
 *   process.env.ADMIN_SECRET, then overridden at startup by the DB value
 *   stored under the key "admin_secret_override" (written by the rotate-secret
 *   endpoint). On rotation the in-memory variable is updated immediately so
 *   subsequent logins use the new secret without a restart.
 */

let _adminSecret: string | null = process.env["ADMIN_SECRET"] ?? null;

/** Return the current ADMIN_SECRET (may have been rotated at runtime). */
export function getAdminSecretRuntime(): string | null {
  return _adminSecret;
}

/** Overwrite the in-memory ADMIN_SECRET (called by the rotate-secret endpoint). */
export function setAdminSecretRuntime(newSecret: string): void {
  _adminSecret = newSecret;
}

/**
 * Seed the runtime config from the database at startup.
 * Call this once in the app entry point after the DB connection is established.
 * It reads "admin_secret_override" from platform_settings and, if present,
 * overrides the env-var value so rotated secrets survive restarts.
 */
export async function seedRuntimeConfigFromDb(): Promise<void> {
  try {
    const { db } = await import("@workspace/db");
    const { platformSettingsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "admin_secret_override"))
      .limit(1);
    if (rows[0]?.value) {
      _adminSecret = rows[0].value;
    }
  } catch (err) {
    // Non-fatal — env var fallback is already in place
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      "[runtime-config] Admin secret DB load failed — using env var fallback"
    );
  }
}
