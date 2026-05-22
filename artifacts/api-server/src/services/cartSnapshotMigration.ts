import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let _migrated = false;

export async function ensureCartSnapshotTable(): Promise<void> {
  if (_migrated) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cart_snapshots (
      user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      items      JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS cart_snapshots_updated_at_idx ON cart_snapshots (updated_at)
  `);

  _migrated = true;
}
