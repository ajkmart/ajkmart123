import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export async function isDemoMode(): Promise<boolean> {
  try {
    const setting = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "demo_mode_enabled"))
      .limit(1);
    return setting.length > 0 ? setting[0].value === "true" : false;
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return false;
  }
}

export interface DemoOrder {
  id: string;
  status: string;
  total: number;
  type?: string;
}
export interface DemoSnapshot {
  vendors: Array<Record<string, unknown>>;
  orders: DemoOrder[];
  riders: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  source?: string;
}

export async function getDemoSnapshot(): Promise<DemoSnapshot> {
  return { vendors: [], orders: [], riders: [], products: [] };
}

export async function setDemoMode(enabled: boolean) {
  try {
    const existing = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "demo_mode_enabled"))
      .limit(1);

    if (existing.length) {
      await db
        .update(platformSettingsTable)
        .set({ value: enabled ? "true" : "false", updatedAt: new Date() })
        .where(eq(platformSettingsTable.key, "demo_mode_enabled"));
    } else {
      await db.insert(platformSettingsTable).values({
        key: "demo_mode_enabled",
        value: enabled ? "true" : "false",
        label: "Demo Mode Enabled",
        updatedAt: new Date(),
      });
    }
    return { success: true };
  } catch (err) {
    logger.error({ err }, "[demo-snapshot] setDemoMode error");
    return { success: false, error: String(err) };
  }
}
export function invalidateDemoSnapshotCache() {}
