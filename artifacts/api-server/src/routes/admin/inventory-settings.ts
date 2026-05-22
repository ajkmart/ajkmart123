import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { sendError, sendSuccess } from "../../lib/response.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { validateBody } from "../../middleware/validate.js";
import {
  addAuditEntry,
  getClientIp,
  invalidatePlatformSettingsCache,
  invalidateSettingsCache,
  type AdminRequest,
} from "../admin-shared.js";

/**
 * /api/admin/inventory-settings
 *
 * Backs the "Vendor Inventory Settings" admin page. Each field is stored
 * as a row in `platform_settings` under the `inventory_*` namespace so the
 * existing settings backup / restore tooling picks them up automatically.
 *
 * The five settings:
 *   inventory_low_stock_threshold              integer ≥ 0   (default 5)
 *   inventory_max_quantity_per_order           integer ≥ 1   (default 50)
 *   inventory_auto_disable_on_zero_stock       "on"|"off"    (default "on")
 *   inventory_back_in_stock_notify_enabled     "on"|"off"    (default "on")
 *   inventory_back_in_stock_notify_channels    comma-list of email|sms|push
 *
 * Per-product overrides live on the `products` table
 * (`low_stock_threshold`, `max_quantity_per_order`, `back_in_stock_notify`)
 * and surface to the admin via `ProductRow` in `adminApiTypes.ts`.
 */

const router = Router();

const KEY_LOW_STOCK = "inventory_low_stock_threshold";
const KEY_MAX_QTY_PER_ORDER = "inventory_max_quantity_per_order";
const KEY_AUTO_DISABLE = "inventory_auto_disable_on_zero_stock";
const KEY_BIS_ENABLED = "inventory_back_in_stock_notify_enabled";
const KEY_BIS_CHANNELS = "inventory_back_in_stock_notify_channels";

const ALL_KEYS = [
  KEY_LOW_STOCK,
  KEY_MAX_QTY_PER_ORDER,
  KEY_AUTO_DISABLE,
  KEY_BIS_ENABLED,
  KEY_BIS_CHANNELS,
] as const;

const VALID_CHANNELS = ["email", "sms", "push"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

const DEFAULTS = {
  globalLowStockThreshold: 5,
  globalMaxQuantityPerOrder: 50,
  autoDisableOnZeroStock: true,
  backInStockNotifyEnabled: true,
  backInStockNotifyChannels: ["email", "push"] as Channel[],
};

interface InventorySettings {
  globalLowStockThreshold: number;
  globalMaxQuantityPerOrder: number;
  autoDisableOnZeroStock: boolean;
  backInStockNotifyEnabled: boolean;
  backInStockNotifyChannels: Channel[];
}

function parseIntOrDefault(raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw == null || raw === "") return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

function parseBoolOrDefault(raw: string | undefined, fallback: boolean): boolean {
  if (raw === "on" || raw === "true") return true;
  if (raw === "off" || raw === "false") return false;
  return fallback;
}

function parseChannelsOrDefault(raw: string | undefined, fallback: Channel[]): Channel[] {
  if (!raw) return fallback;
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid = parts.filter((p): p is Channel =>
    (VALID_CHANNELS as readonly string[]).includes(p)
  );
  /* Dedupe while preserving order */
  return Array.from(new Set(valid));
}

function rowsToSettings(rows: { key: string; value: string }[]): InventorySettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    globalLowStockThreshold: parseIntOrDefault(
      map.get(KEY_LOW_STOCK),
      DEFAULTS.globalLowStockThreshold,
      0
    ),
    globalMaxQuantityPerOrder: parseIntOrDefault(
      map.get(KEY_MAX_QTY_PER_ORDER),
      DEFAULTS.globalMaxQuantityPerOrder,
      1
    ),
    autoDisableOnZeroStock: parseBoolOrDefault(
      map.get(KEY_AUTO_DISABLE),
      DEFAULTS.autoDisableOnZeroStock
    ),
    backInStockNotifyEnabled: parseBoolOrDefault(
      map.get(KEY_BIS_ENABLED),
      DEFAULTS.backInStockNotifyEnabled
    ),
    backInStockNotifyChannels: parseChannelsOrDefault(
      map.get(KEY_BIS_CHANNELS),
      DEFAULTS.backInStockNotifyChannels
    ),
  };
}

router.get("/inventory-settings", requirePermission("vendors.view"), async (_req, res) => {
  try {
    const rows = await db
      .select({ key: platformSettingsTable.key, value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(inArray(platformSettingsTable.key, ALL_KEYS as unknown as string[]));
    sendSuccess(res, rowsToSettings(rows));
  } catch (err) {
    sendError(res, (err as Error).message ?? "Failed to load inventory settings");
  }
});

const channelSchema = z.enum(VALID_CHANNELS);

const inventorySettingsSchema = z.object({
  globalLowStockThreshold: z.number().int().min(0).max(1_000_000),
  globalMaxQuantityPerOrder: z.number().int().min(1).max(1_000_000),
  autoDisableOnZeroStock: z.boolean(),
  backInStockNotifyEnabled: z.boolean(),
  backInStockNotifyChannels: z.array(channelSchema).max(3),
});

router.put(
  "/inventory-settings",
  requirePermission("vendors.edit"),
  validateBody(inventorySettingsSchema),
  async (req, res) => {
    try {
      const body = req.body as z.infer<typeof inventorySettingsSchema>;
      /* Dedupe channels server-side so we never persist "email,email,push". */
      const channels = Array.from(new Set(body.backInStockNotifyChannels));

      const writes: Array<{ key: string; value: string; label: string }> = [
        {
          key: KEY_LOW_STOCK,
          value: String(body.globalLowStockThreshold),
          label: "Inventory: low-stock threshold (units)",
        },
        {
          key: KEY_MAX_QTY_PER_ORDER,
          value: String(body.globalMaxQuantityPerOrder),
          label: "Inventory: max quantity per order",
        },
        {
          key: KEY_AUTO_DISABLE,
          value: body.autoDisableOnZeroStock ? "on" : "off",
          label: "Inventory: auto-disable products at zero stock",
        },
        {
          key: KEY_BIS_ENABLED,
          value: body.backInStockNotifyEnabled ? "on" : "off",
          label: "Inventory: back-in-stock notifications enabled",
        },
        {
          key: KEY_BIS_CHANNELS,
          value: channels.join(","),
          label: "Inventory: back-in-stock notification channels",
        },
      ];

      try {
        for (const w of writes) {
          await db
            .insert(platformSettingsTable)
            .values({
              key: w.key,
              value: w.value,
              label: w.label,
              category: "inventory",
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: platformSettingsTable.key,
              set: { value: w.value, updatedAt: new Date() },
            });
        }

        invalidateSettingsCache();
        invalidatePlatformSettingsCache();

        void addAuditEntry({
          action: "inventory_settings_update",
          ip: getClientIp(req),
          adminId: (req as AdminRequest).adminId,
          details: `Updated ${writes.length} inventory settings (channels=${channels.join("|") || "none"})`,
          result: "success",
        });

        /* Round-trip through the same parser so the response matches GET. */
        const rows = writes.map((w) => ({ key: w.key, value: w.value }));
        sendSuccess(res, rowsToSettings(rows));
      } catch (err) {
        sendError(res, (err as Error).message ?? "Failed to save inventory settings");
      }
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
