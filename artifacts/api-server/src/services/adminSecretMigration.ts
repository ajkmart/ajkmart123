import { db } from "@workspace/db";
import { adminAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { hashAdminSecret } from "./password.js";

const BCRYPT_PREFIX = "$2b$";

/**
 * One-time startup migration: bcrypt-hash every admin sub-account secret
 * that is stored as plaintext. Scrypt records cannot be reversed — a warning
 * is logged instead so the admin can reset that account's secret.
 * After migration, verifyAdminSecret's plaintext fallback will never match
 * any real record, effectively disabling plaintext login.
 */
export async function migrateAdminSecrets(): Promise<void> {
  const accounts = await db
    .select({ id: adminAccountsTable.id, secret: adminAccountsTable.secret })
    .from(adminAccountsTable);

  let migrated = 0;

  for (const acc of accounts) {
    if (acc.secret.startsWith(BCRYPT_PREFIX)) continue;

    // Scrypt records look like "32-hex-chars:128-hex-chars"
    const looksLikeScrypt = acc.secret.includes(":") && acc.secret.split(":")[0]!.length === 32;

    if (looksLikeScrypt) {
      logger.warn(
        { id: acc.id },
        "Admin sub-account has legacy scrypt secret — cannot auto-migrate; admin must reset secret"
      );
      continue;
    }

    // Plaintext — hash it in place.
    const hashed = hashAdminSecret(acc.secret);
    await db
      .update(adminAccountsTable)
      .set({ secret: hashed })
      .where(eq(adminAccountsTable.id, acc.id));
    migrated++;
  }

  if (migrated > 0) {
    logger.info({ migrated }, "Admin sub-account secrets migrated to bcrypt");
  }
}
