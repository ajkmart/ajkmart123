/**
 * Canonical permission catalog (RBAC).
 *
 * Single source of truth for every fine-grained capability used by the
 * backend middleware and the frontend gating hooks. Permission identifiers
 * are stable strings of the form `<domain>.<action>`. Never rename one
 * without a database migration that updates every `role_permissions` row.
 *
 * Used by:
 *   - api-server: requirePermission()/requireAnyPermission() middleware,
 *     permissions.service.ts seed, and JWT compaction.
 *   - admin/vendor/rider apps: useHasPermission()/usePermissions() hooks
 *     and Roles & Permissions admin page.
 */

export type PermissionCategory =
  | "system"
  | "users"
  | "orders"
  | "finance"
  | "vendors"
  | "content"
  | "promotions"
  | "fleet"
  | "support"
  | "vendor_staff"
  | "rider_ops";

export interface PermissionDef {
  id: string;
  label: string;
  category: PermissionCategory;
  description?: string;
  /** High-risk permissions are flagged in the UI with a red badge. */
  highRisk?: boolean;
}

export const PERMISSIONS = [
  // ── System ────────────────────────────────────────────────────────
  { id: "system.settings.view", label: "View platform settings", category: "system" },
  { id: "system.settings.edit", label: "Edit platform settings", category: "system" },
  {
    id: "system.secrets.manage",
    label: "Manage secrets / integrations",
    category: "system",
    highRisk: true,
  },
  { id: "system.roles.manage", label: "Manage roles & permissions", category: "system" },
  { id: "system.audit.view", label: "View audit log", category: "system" },
  { id: "system.maintenance", label: "Toggle maintenance mode", category: "system" },

  // ── Users ─────────────────────────────────────────────────────────
  { id: "users.view", label: "View users", category: "users" },
  { id: "users.create", label: "Create users", category: "users" },
  { id: "users.edit", label: "Edit user profiles", category: "users" },
  { id: "users.delete", label: "Delete users", category: "users", highRisk: true },
  { id: "users.ban", label: "Ban / unban users", category: "users" },
  { id: "users.impersonate", label: "Impersonate users", category: "users", highRisk: true },
  { id: "users.approve", label: "Approve / reject pending accounts", category: "users" },
  { id: "users.wallet", label: "Top-up / adjust user wallets", category: "users" },

  // ── Orders ────────────────────────────────────────────────────────
  { id: "orders.view", label: "View orders", category: "orders" },
  { id: "orders.create", label: "Create orders manually", category: "orders" },
  { id: "orders.edit", label: "Edit orders", category: "orders" },
  { id: "orders.cancel", label: "Cancel orders", category: "orders" },
  { id: "orders.refund", label: "Issue refunds", category: "orders" },
  { id: "orders.reassign", label: "Reassign orders / riders", category: "orders" },

  // ── Finance ───────────────────────────────────────────────────────
  { id: "finance.transactions.view", label: "View wallet transactions", category: "finance" },
  { id: "finance.wallet.topup", label: "Top-up user wallets", category: "finance" },
  { id: "finance.wallet.adjust", label: "Adjust wallet balances", category: "finance" },
  { id: "finance.withdrawals.view", label: "View withdrawal requests", category: "finance" },
  {
    id: "finance.withdrawals.approve",
    label: "Approve withdrawals",
    category: "finance",
    highRisk: true,
  },
  {
    id: "finance.payouts.release",
    label: "Release vendor / rider payouts",
    category: "finance",
    highRisk: true,
  },
  { id: "finance.deposits.review", label: "Review deposit requests", category: "finance" },
  { id: "finance.kyc.view", label: "View KYC submissions", category: "finance" },
  { id: "finance.kyc.approve", label: "Approve KYC submissions", category: "finance" },

  // ── Vendors ───────────────────────────────────────────────────────
  { id: "vendors.view", label: "View vendor accounts", category: "vendors" },
  { id: "vendors.edit", label: "Edit vendor accounts", category: "vendors" },
  { id: "vendors.approve", label: "Approve vendor accounts", category: "vendors" },
  { id: "vendors.suspend", label: "Suspend vendor accounts", category: "vendors" },

  // ── Content / catalog ─────────────────────────────────────────────
  { id: "content.products.view", label: "View products", category: "content" },
  { id: "content.products.edit", label: "Edit products", category: "content" },
  { id: "content.products.delete", label: "Delete products", category: "content" },
  { id: "content.categories.edit", label: "Edit categories", category: "content" },
  { id: "content.banners.edit", label: "Edit banners", category: "content" },

  // ── Promotions ────────────────────────────────────────────────────
  { id: "promotions.view", label: "View promotions", category: "promotions" },
  { id: "promotions.edit", label: "Edit promotions / promo codes", category: "promotions" },
  { id: "promotions.publish", label: "Publish promotions", category: "promotions" },
  { id: "promotions.flash.edit", label: "Manage flash deals", category: "promotions" },

  // ── Fleet / dispatch ──────────────────────────────────────────────
  { id: "fleet.rides.view", label: "View rides", category: "fleet" },
  { id: "fleet.rides.dispatch", label: "Dispatch rides / reassign drivers", category: "fleet" },
  { id: "fleet.rides.cancel", label: "Cancel rides", category: "fleet" },
  { id: "fleet.parcel.view", label: "View parcel bookings", category: "fleet" },
  { id: "fleet.parcel.dispatch", label: "Dispatch parcels", category: "fleet" },
  { id: "fleet.pharmacy.view", label: "View pharmacy orders", category: "fleet" },
  { id: "fleet.pharmacy.dispatch", label: "Dispatch pharmacy orders", category: "fleet" },

  // ── Support ───────────────────────────────────────────────────────
  { id: "support.chat.view", label: "View support chats", category: "support" },
  { id: "support.chat.respond", label: "Respond to support chats", category: "support" },
  { id: "support.chat.edit", label: "Edit support chat settings", category: "support" },
  { id: "support.broadcast.send", label: "Send broadcast notifications", category: "support" },

  // ── Vendor staff (per-vendor capabilities) ────────────────────────
  { id: "vendor_staff.prices.edit", label: "Vendor: edit prices", category: "vendor_staff" },
  { id: "vendor_staff.products.edit", label: "Vendor: edit products", category: "vendor_staff" },
  { id: "vendor_staff.orders.fulfill", label: "Vendor: fulfill orders", category: "vendor_staff" },
  { id: "vendor_staff.staff.manage", label: "Vendor: manage staff", category: "vendor_staff" },
  { id: "vendor_staff.payouts.view", label: "Vendor: view payouts", category: "vendor_staff" },

  // ── Rider operations ──────────────────────────────────────────────
  {
    id: "rider_ops.rides.dispatch",
    label: "Rider: accept dispatched rides",
    category: "rider_ops",
  },
  {
    id: "rider_ops.parcel.handle",
    label: "Rider: handle parcel deliveries",
    category: "rider_ops",
  },
] as const satisfies readonly PermissionDef[];

export type PermissionId = (typeof PERMISSIONS)[number]["id"];

export const PERMISSION_IDS: readonly PermissionId[] = PERMISSIONS.map(
  (p) => p.id
) as readonly PermissionId[];

const _ALL: ReadonlySet<string> = new Set(PERMISSION_IDS as readonly string[]);

/** Throws if the id is not in the catalog. */
export function assertPermissionId(id: string): asserts id is PermissionId {
  if (!_ALL.has(id)) throw new Error(`Unknown permission id: ${id}`);
}

export function isPermissionId(id: string): id is PermissionId {
  return _ALL.has(id);
}

/** Group permissions by category for UI rendering. */
export function permissionsByCategory(): Record<PermissionCategory, PermissionDef[]> {
  const out = {} as Record<PermissionCategory, PermissionDef[]>;
  for (const p of PERMISSIONS) {
    (out[p.category] ||= []).push(p);
  }
  return out;
}

/** Default permission sets for the seed roles. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly PermissionId[]> = {
  super_admin: PERMISSION_IDS,

  support_admin: [
    "users.view",
    "users.create",
    "users.edit",
    "users.ban",
    "users.approve",
    "orders.view",
    "orders.cancel",
    "fleet.rides.view",
    "fleet.parcel.view",
    "fleet.pharmacy.view",
    "support.chat.view",
    "support.chat.respond",
    "support.broadcast.send",
    "system.audit.view",
  ],

  finance_admin: [
    "users.view",
    "orders.view",
    "orders.refund",
    "finance.transactions.view",
    "finance.wallet.topup",
    "finance.wallet.adjust",
    "finance.withdrawals.view",
    "finance.withdrawals.approve",
    "finance.payouts.release",
    "finance.deposits.review",
    "finance.kyc.view",
    "finance.kyc.approve",
    "system.audit.view",
  ],

  vendor_owner: [
    "vendor_staff.prices.edit",
    "vendor_staff.products.edit",
    "vendor_staff.orders.fulfill",
    "vendor_staff.staff.manage",
    "vendor_staff.payouts.view",
  ],

  vendor_staff: ["vendor_staff.orders.fulfill"],

  rider: ["rider_ops.rides.dispatch", "rider_ops.parcel.handle"],
};

/** Stable ordering used to compact a permission set into a string array
 *  for token embedding. Keeps tokens deterministic for cache keys. */
export function compactPermissions(perms: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const p of perms) if (_ALL.has(p)) seen.add(p);
  return Array.from(seen).sort();
}

/**
 * Returns true when `required` is present in the user's permission list.
 * Accepts either a raw string or a typed PermissionId — both work.
 */
export function hasPermission(userPerms: string[], required: string): boolean {
  return userPerms.includes(required);
}
