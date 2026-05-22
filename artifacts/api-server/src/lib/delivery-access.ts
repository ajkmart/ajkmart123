import { db } from "@workspace/db";
import { deliveryWhitelistTable, systemAuditLogTable } from "@workspace/db/schema";
import { and, eq, or } from "drizzle-orm";
import { getPlatformSettings } from "../routes/admin-shared.js";
import { generateId } from "./id.js";

export type DeliveryAccessMode = "all" | "stores" | "users" | "both";

let _modeCache: DeliveryAccessMode | null = null;
let _modeCacheAt = 0;
const MODE_CACHE_TTL = 30_000;

const _whitelistCache = new Map<string, { eligible: boolean; deliveryLabel?: string }>();
let _whitelistCacheAt = 0;
const WHITELIST_CACHE_TTL = 5 * 60_000;

export function invalidateDeliveryAccessCache() {
  _modeCache = null;
  _modeCacheAt = 0;
  _whitelistCache.clear();
  _whitelistCacheAt = 0;
}

async function getDeliveryAccessMode(): Promise<DeliveryAccessMode> {
  if (_modeCache && Date.now() - _modeCacheAt < MODE_CACHE_TTL) return _modeCache;
  const s = await getPlatformSettings();
  const mode = (s["delivery_access_mode"] ?? "all") as DeliveryAccessMode;
  _modeCache = mode;
  _modeCacheAt = Date.now();
  return mode;
}

async function isWhitelisted(
  type: "vendor" | "user",
  targetId: string,
  serviceType: string
): Promise<{ found: boolean; deliveryLabel?: string }> {
  const cacheKey = `${type}:${targetId}:${serviceType}`;
  if (Date.now() - _whitelistCacheAt < WHITELIST_CACHE_TTL) {
    const cached = _whitelistCache.get(cacheKey);
    if (cached) return { found: cached.eligible, deliveryLabel: cached.deliveryLabel };
  } else {
    _whitelistCache.clear();
    _whitelistCacheAt = Date.now();
  }

  const now = new Date();
  const rows = await db
    .select({
      id: deliveryWhitelistTable.id,
      status: deliveryWhitelistTable.status,
      validUntil: deliveryWhitelistTable.validUntil,
      deliveryLabel: deliveryWhitelistTable.deliveryLabel,
    })
    .from(deliveryWhitelistTable)
    .where(
      and(
        eq(deliveryWhitelistTable.type, type),
        eq(deliveryWhitelistTable.targetId, targetId),
        or(
          eq(deliveryWhitelistTable.serviceType, serviceType),
          eq(deliveryWhitelistTable.serviceType, "all")
        )
      )
    );

  for (const row of rows) {
    if (row.validUntil && row.validUntil < now) {
      if (row.status === "active") {
        await db
          .update(deliveryWhitelistTable)
          .set({ status: "expired", updatedAt: now })
          .where(eq(deliveryWhitelistTable.id, row.id));
      }
      continue;
    }
    if (row.status === "active") {
      const result = { found: true, deliveryLabel: row.deliveryLabel ?? undefined };
      _whitelistCache.set(cacheKey, { eligible: true, deliveryLabel: result.deliveryLabel });
      return result;
    }
  }
  _whitelistCache.set(cacheKey, { eligible: false });
  return { found: false };
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  deliveryLabel?: string;
}

export async function checkDeliveryEligibility(
  userId: string,
  vendorId: string | null | undefined,
  serviceType: string
): Promise<EligibilityResult> {
  const mode = await getDeliveryAccessMode();

  if (mode === "all") {
    return { eligible: true };
  }

  if (mode === "stores") {
    if (!vendorId) return { eligible: false, reason: "no_vendor" };
    const check = await isWhitelisted("vendor", vendorId, serviceType);
    if (!check.found) return { eligible: false, reason: "store_not_whitelisted" };
    return { eligible: true, deliveryLabel: check.deliveryLabel };
  }

  if (mode === "users") {
    const check = await isWhitelisted("user", userId, serviceType);
    if (!check.found) return { eligible: false, reason: "user_not_whitelisted" };
    return { eligible: true };
  }

  if (mode === "both") {
    if (!vendorId) return { eligible: false, reason: "no_vendor" };
    const vendorCheck = await isWhitelisted("vendor", vendorId, serviceType);
    if (!vendorCheck.found) return { eligible: false, reason: "store_not_whitelisted" };
    const userCheck = await isWhitelisted("user", userId, serviceType);
    if (!userCheck.found) return { eligible: false, reason: "user_not_whitelisted" };
    return { eligible: true, deliveryLabel: vendorCheck.deliveryLabel };
  }

  return { eligible: true };
}

export async function checkUserOnlyEligibility(
  userId: string,
  serviceType: string
): Promise<EligibilityResult> {
  const mode = await getDeliveryAccessMode();

  if (mode === "all" || mode === "stores") {
    return { eligible: true };
  }

  if (mode === "users" || mode === "both") {
    const check = await isWhitelisted("user", userId, serviceType);
    if (!check.found) return { eligible: false, reason: "user_not_whitelisted" };
    return { eligible: true };
  }

  return { eligible: true };
}

export async function addAuditLog(opts: {
  adminId?: string;
  adminName?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  oldValue?: string;
  newValue?: string;
}) {
  try {
    await db.insert(systemAuditLogTable).values({
      id: generateId(),
      ...opts,
    });
  } catch (err) {
    /* intentional: non-fatal guard */ void err;
  }
}
