import { db } from "@workspace/db";
import {
  adminRolePresetsTable,
  demoBackupsTable,
  ordersTable,
  platformSettingsTable,
  productsTable,
  vendorPlansTable,
  vendorProfilesTable,
} from "@workspace/db/schema";
import { asc, count, desc, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import {
  addAuditEntry,
  DEFAULT_PLATFORM_SETTINGS,
  generateId,
  getClientIp,
  invalidatePlatformSettingsCache,
  invalidateSettingsCache,
  type AdminRequest,
} from "../admin-shared.js";

const router = Router();

/* ── AI-Recommended defaults for all platform feature flags ── */
const AI_RECOMMENDED: Record<string, string> = {
  feature_mart: "on",
  feature_food: "on",
  feature_rides: "on",
  feature_pharmacy: "on",
  feature_parcel: "on",
  feature_van: "on",
  feature_wallet: "on",
  feature_referral: "on",
  feature_new_users: "on",
  feature_chat: "off",
  feature_live_tracking: "on",
  feature_reviews: "on",
  feature_sos: "on",
  feature_weather: "on",
  user_require_approval: "off",
  wallet_mpin_enabled: "on",
  ride_surge_enabled: "off",
  ride_bargaining_enabled: "on",
  order_schedule_enabled: "off",
  finance_gst_enabled: "on",
  finance_cashback_enabled: "off",
  finance_invoice_enabled: "off",
  delivery_free_enabled: "on",
  vendor_auto_approve: "off",
  vendor_promo_enabled: "on",
  rider_auto_approve: "off",
  rider_cash_allowed: "on",
  rider_withdrawal_enabled: "on",
  rider_deposit_enabled: "on",
  security_gps_tracking: "on",
  security_spoof_detection: "on",
  security_geo_fence: "off",
  security_mfa_required: "off",
  security_otp_bypass: "off",
  security_block_tor: "off",
  security_block_vpn: "off",
  security_audit_log: "on",
  integration_push_notif: "off",
  integration_sms: "off",
  integration_analytics: "off",
  integration_email: "off",
  integration_sentry: "off",
  integration_whatsapp: "off",
  integration_maps: "off",
  cod_enabled: "on",
  jazzcash_enabled: "off",
  easypaisa_enabled: "off",
  bank_enabled: "off",
  wallet_p2p_enabled: "on",
  wallet_kyc_required: "off",
  customer_referral_enabled: "on",
  customer_loyalty_enabled: "on",
  notif_new_order: "on",
  notif_order_ready: "on",
  notif_ride_request: "on",
  notif_promo: "off",
  security_phone_verify: "on",
  security_pwd_strong: "on",
  van_auto_notify_cancel: "on",
  van_require_start_trip: "off",
  security_fake_order_detect: "on",
  security_auto_block_ip: "off",
};

const AI_RECOMMENDED_DEFAULTS: Record<string, string> = {
  platform_commission_pct: "10",
  vendor_commission_pct: "15",
  rider_keep_pct: "80",
  delivery_fee_mart: "80",
  delivery_fee_food: "60",
  delivery_fee_pharmacy: "50",
  delivery_fee_parcel: "100",
  free_delivery_above: "1000",
  min_order_amount: "100",
  ride_bike_base_fare: "15",
  ride_bike_per_km: "8",
  ride_car_base_fare: "25",
  ride_car_per_km: "12",
  finance_gst_pct: "17",
  security_login_max_attempts: "5",
  security_lockout_minutes: "30",
  security_session_days: "30",
  wallet_max_balance: "50000",
  customer_signup_bonus: "0",
  customer_referral_bonus: "100",
  vendor_settlement_days: "7",
  rider_min_payout: "500",
  vendor_min_payout: "500",
};

type SettingRow = {
  key: string;
  value: string;
  label?: string | null;
  category: string;
  updatedAt: Date;
};

type DiffEntry = {
  key: string;
  current: string | null;
  recommended: string;
  differsFromAI: boolean;
  category: string;
};

type VendorPlanBody = {
  name?: string;
  slug?: string;
  description?: string;
  features?: string[];
  commissionRate?: number | string;
  monthlyFee?: number | string;
  maxProducts?: number | string;
  maxOrders?: number | string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number | string;
};

type RolePresetBody = {
  name?: string;
  slug?: string;
  description?: string;
  permissions?: string[];
  role?: string;
};

/* ─────────────────────────────────────────────────────────────
   GET /api/admin/launch/settings
   Returns all platform settings + AI recommendations + diff
───────────────────────────────────────────────────────────── */
router.get("/settings", async (_req, res) => {
  const rows: SettingRow[] = await db.select().from(platformSettingsTable);
  const current: Record<string, string> = {};
  for (const row of rows) current[row.key] = row.value;

  const aiOverrides: Record<string, string> = { ...AI_RECOMMENDED_DEFAULTS, ...AI_RECOMMENDED };
  const allKeys = new Set(DEFAULT_PLATFORM_SETTINGS.map((d) => d.key));
  for (const k of Object.keys(aiOverrides)) allKeys.add(k);

  const diffs: DiffEntry[] = [];
  for (const key of allKeys) {
    const platformDefault = DEFAULT_PLATFORM_SETTINGS.find((d) => d.key === key)?.value ?? "";
    const recommended = aiOverrides[key] ?? platformDefault;
    const curr = current[key] ?? null;
    const differsFromAI = curr != null && curr !== recommended;
    const row = rows.find((r) => r.key === key);
    diffs.push({
      key,
      current: curr,
      recommended,
      differsFromAI,
      category:
        row?.category ??
        DEFAULT_PLATFORM_SETTINGS.find((d) => d.key === key)?.category ??
        "general",
    });
  }

  const mode = current["platform_mode"] ?? "demo";
  sendSuccess(res, {
    settings: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
    aiRecommended: AI_RECOMMENDED,
    aiDefaults: AI_RECOMMENDED_DEFAULTS,
    diffs,
    mode,
  });
});

/* ─────────────────────────────────────────────────────────────
   GET /api/admin/launch/demo-snapshots
   List stored demo snapshots (from demo_backups table).
───────────────────────────────────────────────────────────── */
router.get("/demo-snapshots", async (_req, res) => {
  const snapshots = await db
    .select({
      id: demoBackupsTable.id,
      label: demoBackupsTable.label,
      rowsTotal: demoBackupsTable.rowsTotal,
      sizeKb: demoBackupsTable.sizeKb,
      createdAt: demoBackupsTable.createdAt,
    })
    .from(demoBackupsTable)
    .orderBy(desc(demoBackupsTable.createdAt))
    .limit(20);
  sendSuccess(res, {
    snapshots: snapshots.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
  });
});

/* ─────────────────────────────────────────────────────────────
   POST /api/admin/launch/reset-defaults
   Reset all platform settings to AI-recommended values
───────────────────────────────────────────────────────────── */
router.post("/reset-defaults", async (req, res) => {
  const aiOverrides: Record<string, string> = { ...AI_RECOMMENDED_DEFAULTS, ...AI_RECOMMENDED };
  const resetMap: Record<string, { value: string; label: string; category: string }> = {};
  for (const d of DEFAULT_PLATFORM_SETTINGS) {
    resetMap[d.key] = { value: aiOverrides[d.key] ?? d.value, label: d.key, category: d.category };
  }
  for (const [key, value] of Object.entries(aiOverrides)) {
    if (!resetMap[key]) resetMap[key] = { value, label: key, category: "general" };
  }
  let updated = 0;
  for (const [key, { value, label, category }] of Object.entries(resetMap)) {
    const result = await db
      .update(platformSettingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(platformSettingsTable.key, key))
      .returning({ key: platformSettingsTable.key });
    if (result.length > 0) updated++;
    else {
      await db
        .insert(platformSettingsTable)
        .values({ key, value, label, category, updatedAt: new Date() })
        .onConflictDoNothing();
      updated++;
    }
  }
  invalidateSettingsCache();
  invalidatePlatformSettingsCache();
  void addAuditEntry({
    action: "launch_reset_defaults",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Reset ${updated} settings to AI defaults`,
    result: "success",
  });
  sendSuccess(res, { reset: updated, message: "All settings reset to AI-recommended defaults" });
});

/* ─────────────────────────────────────────────────────────────
   PATCH /api/admin/launch/feature/:key
   Toggle a single feature flag on/off
───────────────────────────────────────────────────────────── */
router.patch("/feature/:key", async (req, res) => {
  const key = req.params["key"] as string;
  const { value } = req.body as { value?: string };
  if (!value || (value !== "on" && value !== "off")) {
    sendValidationError(res, 'value must be "on" or "off"');
    return;
  }
  if (!(key in AI_RECOMMENDED)) {
    sendValidationError(res, "Unknown feature key");
    return;
  }
  const [row] = await db
    .update(platformSettingsTable)
    .set({ value, updatedAt: new Date() })
    .where(eq(platformSettingsTable.key, key))
    .returning();
  if (!row) {
    sendNotFound(res, "Setting not found — ensure it is seeded before toggling");
    return;
  }
  invalidateSettingsCache();
  invalidatePlatformSettingsCache();
  void addAuditEntry({
    action: "launch_feature_toggle",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Feature "${key}" set to "${value}"`,
    result: "success",
  });
  sendSuccess(res, { key, value });
});

/* ─────────────────────────────────────────────────────────────
   GET /api/admin/launch/vendor-plans
───────────────────────────────────────────────────────────── */
router.get("/vendor-plans", async (_req, res) => {
  const plans = await db.select().from(vendorPlansTable).orderBy(asc(vendorPlansTable.sortOrder));
  sendSuccess(res, {
    plans: plans.map((p) => ({
      ...p,
      features: (() => {
        try {
          return JSON.parse(p.featuresJson) as string[];
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[fn] error with fallback"
          );
          return [] as string[];
        }
      })(),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
});

/* ─────────────────────────────────────────────────────────────
   POST /api/admin/launch/vendor-plans
───────────────────────────────────────────────────────────── */
router.post("/vendor-plans", async (req, res) => {
  const body = req.body as VendorPlanBody;
  const {
    name,
    slug,
    description,
    features,
    commissionRate,
    monthlyFee,
    maxProducts,
    maxOrders,
    isDefault,
    sortOrder,
  } = body;
  if (!name || !slug) {
    sendValidationError(res, "name and slug are required");
    return;
  }
  const id = `plan_${Date.now()}`;
  const willBeDefault = Boolean(isDefault);
  if (willBeDefault) {
    await db.update(vendorPlansTable).set({ isDefault: false, updatedAt: new Date() });
  }
  const [plan] = await db
    .insert(vendorPlansTable)
    .values({
      id,
      name,
      slug,
      description: description ?? "",
      featuresJson: JSON.stringify(features ?? []),
      commissionRate: Number(commissionRate) || 15,
      monthlyFee: Number(monthlyFee) || 0,
      maxProducts: Number(maxProducts) || 50,
      maxOrders: Number(maxOrders) || 500,
      isDefault: willBeDefault,
      isActive: true,
      sortOrder: Number(sortOrder) || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  void addAuditEntry({
    action: "vendor_plan_create",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Created plan ${name}`,
    result: "success",
  });
  sendSuccess(res, { plan });
});

/* ─────────────────────────────────────────────────────────────
   PUT /api/admin/launch/vendor-plans/:id
───────────────────────────────────────────────────────────── */
router.put("/vendor-plans/:id", async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const body = req.body as VendorPlanBody;
  const {
    name,
    slug,
    description,
    features,
    commissionRate,
    monthlyFee,
    maxProducts,
    maxOrders,
    isDefault,
    isActive,
    sortOrder,
  } = body;
  if (isDefault === true) {
    await db.update(vendorPlansTable).set({ isDefault: false, updatedAt: new Date() });
  }
  const [plan] = await db
    .update(vendorPlansTable)
    .set({
      ...(name !== undefined && { name }),
      ...(slug !== undefined && { slug }),
      ...(description !== undefined && { description }),
      ...(features !== undefined && { featuresJson: JSON.stringify(features) }),
      ...(commissionRate !== undefined && { commissionRate: Number(commissionRate) }),
      ...(monthlyFee !== undefined && { monthlyFee: Number(monthlyFee) }),
      ...(maxProducts !== undefined && { maxProducts: Number(maxProducts) }),
      ...(maxOrders !== undefined && { maxOrders: Number(maxOrders) }),
      ...(isDefault !== undefined && { isDefault: Boolean(isDefault) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      updatedAt: new Date(),
    })
    .where(eq(vendorPlansTable.id, id!))
    .returning();
  if (!plan) {
    sendNotFound(res, "Plan not found");
    return;
  }
  void addAuditEntry({
    action: "vendor_plan_update",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Updated plan ${id}`,
    result: "success",
  });
  sendSuccess(res, { plan });
});

/* ─────────────────────────────────────────────────────────────
   POST /api/admin/launch/vendor-plans/:id/set-default
───────────────────────────────────────────────────────────── */
router.post("/vendor-plans/:id/set-default", async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const [exists] = await db
    .select({ id: vendorPlansTable.id })
    .from(vendorPlansTable)
    .where(eq(vendorPlansTable.id, id!))
    .limit(1);
  if (!exists) {
    sendNotFound(res, "Plan not found");
    return;
  }
  await db.update(vendorPlansTable).set({ isDefault: false, updatedAt: new Date() });
  const [plan] = await db
    .update(vendorPlansTable)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(vendorPlansTable.id, id!))
    .returning();
  if (!plan) {
    sendNotFound(res, "Plan not found");
    return;
  }
  void addAuditEntry({
    action: "vendor_plan_set_default",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Set plan ${id} as default`,
    result: "success",
  });
  sendSuccess(res, { plan });
});

/* ─────────────────────────────────────────────────────────────
   DELETE /api/admin/launch/vendor-plans/:id
───────────────────────────────────────────────────────────── */
router.delete("/vendor-plans/:id", async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const [deleted] = await db
    .delete(vendorPlansTable)
    .where(eq(vendorPlansTable.id, id!))
    .returning();
  if (!deleted) {
    sendNotFound(res, "Plan not found");
    return;
  }
  void addAuditEntry({
    action: "vendor_plan_delete",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Deleted plan ${id}`,
    result: "success",
  });
  sendSuccess(res, { deleted: true });
});

/* ─────────────────────────────────────────────────────────────
   GET /api/admin/launch/role-presets
   Returns all admin role presets
───────────────────────────────────────────────────────────── */
router.get("/role-presets", async (_req, res) => {
  try {
    const presets = await db
      .select()
      .from(adminRolePresetsTable)
      .orderBy(asc(adminRolePresetsTable.name));
    sendSuccess(res, {
      presets: presets.map((p) => ({
        ...p,
        permissions: JSON.parse(p.permissionsJson || "[]"),
      })),
    });
  } catch (_e) {
    sendError(res, "Failed to load role presets", 500);
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /api/admin/launch/role-presets
   Create a new role preset
───────────────────────────────────────────────────────────── */
router.post("/role-presets", async (req, res) => {
  try {
    const body = req.body as RolePresetBody;
    if (!body.name || !body.slug) {
      sendValidationError(res, "name and slug are required");
      return;
    }
    const id = generateId();
    const [preset] = await db
      .insert(adminRolePresetsTable)
      .values({
        id,
        name: body.name,
        slug: body.slug,
        description: body.description ?? "",
        permissionsJson: JSON.stringify(body.permissions ?? []),
        role: body.role ?? "manager",
        isBuiltIn: false,
      })
      .returning();
    void addAuditEntry({
      action: "role_preset_create",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Created role preset ${body.name}`,
      result: "success",
    });
    sendSuccess(res, { ...preset, permissions: body.permissions ?? [] }, undefined, 201);
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "23505") {
      sendError(res, "A preset with that slug already exists", 409);
      return;
    }
    sendError(res, "Failed to create role preset", 500);
  }
});

/* ─────────────────────────────────────────────────────────────
   PUT /api/admin/launch/role-presets/:id
   Update a role preset
───────────────────────────────────────────────────────────── */
router.put("/role-presets/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const body = req.body as RolePresetBody;
    const [existing] = await db
      .select()
      .from(adminRolePresetsTable)
      .where(eq(adminRolePresetsTable.id, id!))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Role preset not found");
      return;
    }
    if (existing.isBuiltIn) {
      sendError(res, "Built-in presets cannot be modified", 403);
      return;
    }
    const updates: Partial<typeof adminRolePresetsTable.$inferInsert> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.description !== undefined) updates.description = body.description;
    if (body.permissions !== undefined) updates.permissionsJson = JSON.stringify(body.permissions);
    if (body.role !== undefined) updates.role = body.role;
    const [updated] = await db
      .update(adminRolePresetsTable)
      .set(updates)
      .where(eq(adminRolePresetsTable.id, id!))
      .returning();
    void addAuditEntry({
      action: "role_preset_update",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Updated role preset ${id}`,
      result: "success",
    });
    sendSuccess(res, { ...updated, permissions: JSON.parse(updated.permissionsJson || "[]") });
  } catch (_e) {
    sendError(res, "Failed to update role preset", 500);
  }
});

/* ─────────────────────────────────────────────────────────────
   DELETE /api/admin/launch/role-presets/:id
   Delete a role preset
───────────────────────────────────────────────────────────── */
router.delete("/role-presets/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(adminRolePresetsTable)
      .where(eq(adminRolePresetsTable.id, id!))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Role preset not found");
      return;
    }
    if (existing.isBuiltIn) {
      sendError(res, "Built-in presets cannot be deleted", 403);
      return;
    }
    await db.delete(adminRolePresetsTable).where(eq(adminRolePresetsTable.id, id!));
    void addAuditEntry({
      action: "role_preset_delete",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Deleted role preset ${id}`,
      result: "success",
    });
    sendSuccess(res, { deleted: true });
  } catch (_e) {
    sendError(res, "Failed to delete role preset", 500);
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /api/admin/launch/mode
   Switch between demo and live mode.
   Switching to live:  snapshots current platform_settings into demo_backups.
   Switching to demo:  restores the most-recent demo backup if present.
   Requires confirmToken = "CONFIRM" to prevent accidents.
───────────────────────────────────────────────────────────── */
router.post("/mode", async (req, res) => {
  const body = req.body as { mode?: string; confirmToken?: string };
  const { mode, confirmToken } = body;
  if (mode !== "demo" && mode !== "live") {
    sendValidationError(res, 'mode must be "demo" or "live"');
    return;
  }
  if (confirmToken !== "CONFIRM") {
    sendError(res, 'confirmToken must equal "CONFIRM" to prevent accidental mode switches', 422);
    return;
  }

  /* Idempotency: if already in requested mode, return no-op success */
  const [currentModeRow] = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "platform_mode"))
    .limit(1);
  const currentMode = currentModeRow?.value ?? "demo";
  if (currentMode === mode) {
    sendSuccess(res, { mode, noOp: true, message: `Platform is already in ${mode} mode` });
    return;
  }

  let restoredFromBackup = false;

  if (mode === "live") {
    /* Snapshot demo state into demo_backups before going live.
       Captures: platform_settings (full) + seeded demo entity arrays.
       The seeded demo payloads (DEMO_VENDORS, DEMO_ORDERS, etc.) are stored
       idempotently so switching back to demo can restore them from the backup. */
    const allSettings = await db.select().from(platformSettingsTable);
    const [vendorCount] = await db.select({ c: count() }).from(vendorProfilesTable);
    const [orderCount] = await db
      .select({ c: count() })
      .from(ordersTable)
      .where(isNull(ordersTable.deletedAt));
    const [productCount] = await db.select({ c: count() }).from(productsTable);
    const { getDemoSnapshot } = await import("../../lib/demo-snapshot.js");
    const demoSnap = await getDemoSnapshot();
    const tablesJson = JSON.stringify({
      platform_settings: allSettings,
      demo_vendors: demoSnap.vendors,
      demo_orders: demoSnap.orders,
      demo_riders: demoSnap.riders,
      demo_products: demoSnap.products,
      entity_counts: {
        vendors: vendorCount?.c ?? 0,
        orders: orderCount?.c ?? 0,
        products: productCount?.c ?? 0,
      },
      snapshot_time: new Date().toISOString(),
    });
    const backupId = `demo_snap_${Date.now()}`;
    await db
      .insert(demoBackupsTable)
      .values({
        id: backupId,
        label: `Demo snapshot before going live (${new Date().toISOString()})`,
        tablesJson,
        rowsTotal:
          allSettings.length +
          demoSnap.vendors.length +
          demoSnap.orders.length +
          demoSnap.riders.length +
          demoSnap.products.length,
        sizeKb: Math.ceil(Buffer.byteLength(tablesJson, "utf8") / 1024),
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  } else {
    /* Switching to demo — restore latest snapshot if one exists */
    const [latest] = await db
      .select()
      .from(demoBackupsTable)
      .orderBy(desc(demoBackupsTable.createdAt))
      .limit(1);

    if (latest) {
      try {
        const snapshotData = JSON.parse(latest.tablesJson) as {
          platform_settings?: Array<{
            key: string;
            value: string;
            label: string;
            category: string;
          }>;
          demo_vendors?: unknown[];
          demo_orders?: unknown[];
          demo_riders?: unknown[];
          demo_products?: unknown[];
        };
        /* Restore platform_settings idempotently (skipping platform_mode itself) */
        const settingRows = snapshotData.platform_settings ?? [];
        for (const row of settingRows) {
          if (row.key === "platform_mode") continue;
          await db
            .insert(platformSettingsTable)
            .values({
              key: row.key,
              value: row.value,
              label: row.label,
              category: row.category,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: platformSettingsTable.key,
              set: { value: row.value, updatedAt: new Date() },
            });
        }
        /* Demo entity arrays (vendors/orders/riders/products) are embedded in the backup
           and surfaced via GET /api/admin/launch/demo-data — no DB write needed for them
           since they are static seeded payloads served from memory. */
        restoredFromBackup = true;
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[fn] malformed backup — proceed without restore`
        );
      }
    }
  }

  await db
    .insert(platformSettingsTable)
    .values({
      key: "platform_mode",
      value: mode,
      label: "Platform Mode",
      category: "system",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value: mode, updatedAt: new Date() },
    });

  invalidateSettingsCache();
  invalidatePlatformSettingsCache();
  const { invalidateDemoSnapshotCache } = await import("../../lib/demo-snapshot.js");
  invalidateDemoSnapshotCache();
  void addAuditEntry({
    action: "launch_mode_switch",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Switched platform mode to ${mode}${restoredFromBackup ? " (restored from demo backup)" : ""}`,
    result: "success",
  });
  sendSuccess(res, {
    mode,
    restoredFromBackup,
    message:
      mode === "live"
        ? "Platform is now in Live mode — current settings backed up as demo snapshot"
        : restoredFromBackup
          ? "Platform is now in Demo mode — settings restored from demo snapshot"
          : "Platform is now in Demo mode",
  });
});

router.get("/demo-data", async (_req, res) => {
  const rows = await db
    .select({ key: platformSettingsTable.key, value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "platform_mode"));
  const mode = rows[0]?.value === "live" ? "live" : "demo";
  const { getDemoSnapshot } = await import("../../lib/demo-snapshot.js");
  const snap = await getDemoSnapshot();
  sendSuccess(res, {
    mode,
    counts: {
      vendors: snap.vendors.length,
      orders: snap.orders.length,
      products: snap.products.length,
      riders: snap.riders.length,
    },
    sampleVendors: snap.vendors.slice(0, 5),
    sampleOrders: snap.orders.slice(0, 5),
  });
});

export async function ensureLaunchData(): Promise<void> {}

export default router;
