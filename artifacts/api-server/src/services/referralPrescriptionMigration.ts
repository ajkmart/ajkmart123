import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let _migrated = false;

export async function ensureReferralAndPrescriptionTables(): Promise<void> {
  if (_migrated) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id             TEXT PRIMARY KEY,
      code           TEXT NOT NULL,
      owner_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_amount  NUMERIC(10,2) NOT NULL DEFAULT 50,
      used_count     INTEGER NOT NULL DEFAULT 0,
      max_uses       INTEGER,
      is_active      INTEGER NOT NULL DEFAULT 1,
      created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_uidx ON referral_codes (code)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS referral_codes_owner_user_id_idx ON referral_codes (owner_user_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS referral_usages (
      id               TEXT PRIMARY KEY,
      code_id          TEXT NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
      referee_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_amount    NUMERIC(10,2) NOT NULL,
      created_at       TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS referral_usages_referee_uidx ON referral_usages (referee_user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS referral_usages_code_id_idx ON referral_usages (code_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS referral_usages_referrer_idx ON referral_usages (referrer_user_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pharmacy_prescription_refs (
      ref_id     TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_url  TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS pharmacy_prescription_refs_user_id_idx ON pharmacy_prescription_refs (user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS pharmacy_prescription_refs_expires_at_idx ON pharmacy_prescription_refs (expires_at)
  `);

  await db.execute(sql`
    ALTER TABLE pharmacy_orders
    ADD COLUMN IF NOT EXISTS prescription_photo_url TEXT
  `);

  _migrated = true;
}
