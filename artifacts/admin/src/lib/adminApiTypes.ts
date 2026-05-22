/**
 * adminApiTypes — shared response interfaces for the AJKMart admin API.
 *
 * The "Loose Type Safety" entry in bugs.md called out a long list of
 * `as any` casts in `categories.tsx`, `products.tsx`, `settings-payment.tsx`,
 * `wallet-transfers.tsx`, and `webhook-manager.tsx`. Centralising the
 * response shapes here lets each page replace `as any` with a typed
 * `as ApiPaginated<Product>` (or similar) in a follow-up sweep without
 * inventing parallel interfaces per page.
 *
 * These types are intentionally permissive on optional fields — the
 * backend evolves independently and pages only consume the fields they
 * render. Add fields here as pages start consuming them rather than
 * speculatively expanding the surface area.
 */

/* ── Generic envelopes ─────────────────────────────────────────────── */

export interface ApiOk<T = unknown> {
  ok: true;
  data?: T;
  message?: string;
}

export interface ApiErr {
  ok: false;
  error: string;
  code?: string;
  details?: unknown;
}

export type ApiResult<T = unknown> = ApiOk<T> | ApiErr;

export interface ApiPaginated<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

/* ── Domain shapes (extend as pages adopt them) ────────────────────── */

export interface CategoryRow {
  id: string;
  name: string;
  slug?: string;
  parentId?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  position?: number;
  vendorId?: string | null;
  productCount?: number;
}

export interface ProductRow {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  stock?: number;
  categoryId?: string;
  vendorId?: string;
  imageUrl?: string | null;
  isActive?: boolean;
  /** Vendor inventory thresholds — see `bugs.md` → "Vendor Settings". */
  lowStockThreshold?: number | null;
  maxQuantityPerOrder?: number | null;
  backInStockNotify?: boolean;
  /* ── Admin list-view fields (legacy backend names) ───────────────── */
  /** Original (pre-discount) price for display. */
  originalPrice?: number;
  /** Human-readable category label as returned by the admin list endpoint. */
  category?: string;
  /** Product type bucket: "mart" | "food" | "pharmacy" | etc. */
  type?: string;
  /** Display unit ("1 kg", "500ml"). */
  unit?: string;
  /** Vendor display name (denormalised for the admin list). */
  vendorName?: string;
  /** Stock toggle as exposed to the admin list. */
  inStock?: boolean;
  /** Estimated delivery window string. */
  deliveryTime?: string;
  /** Image URL alias used by the admin list endpoint. */
  image?: string;
  /** Approval status: "pending" | "approved" | "rejected". */
  status?: string;
  /** Creation timestamp. */
  createdAt?: string;
}

export interface PaymentSettingRow {
  key: string;
  label?: string;
  value: string | number | boolean | null;
  isSecret?: boolean;
  group?: "card" | "wallet" | "cod" | "easypaisa" | "jazzcash" | "other";
}

export interface WalletTransferRow {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency?: string;
  status: "pending" | "approved" | "rejected" | "failed" | "completed";
  createdAt: string;
  reason?: string;
  approverId?: string;
}

export interface WebhookRow {
  id: string;
  url: string;
  event: string;
  secret?: string;
  isActive: boolean;
  lastDeliveryAt?: string | null;
  lastDeliveryStatus?: number | null;
  failureCount?: number;
}

export interface ConsentLogEntry {
  id: string;
  userId: string;
  /** Slug of the policy ("terms", "privacy", "marketing"). */
  policy: string;
  /** Version string the user accepted (e.g. "2025-09-01"). */
  version: string;
  acceptedAt: string;
  ipAddress?: string;
  userAgent?: string;
  source?: "web" | "android" | "ios" | "admin";
}

export interface TermsVersionRow {
  /** Policy slug — matches `ConsentLogEntry.policy`. */
  policy: string;
  version: string;
  effectiveAt: string;
  bodyMarkdown?: string;
  changelog?: string;
  isCurrent?: boolean;
}

/* ── Admin dashboard stats ─────────────────────────────────────────── */

export interface AdminStats {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  activeRiders: number;
  activeVendors: number;
  pendingOrders?: number;
  pendingKyc?: number;
  pendingWithdrawals?: number;
  todayOrders?: number;
  todayRevenue?: number;
}

/* ── Orders ─────────────────────────────────────────────────────────── */

export interface AdminOrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
  imageUrl?: string | null;
}

export interface AdminOrder {
  id: string;
  userId: string;
  vendorId?: string | null;
  status: string;
  total: number;
  subtotal?: number;
  deliveryFee?: number;
  discount?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  address?: string | null;
  notes?: string | null;
  items?: AdminOrderItem[];
  createdAt: string;
  updatedAt?: string;
  customerName?: string;
  customerPhone?: string;
  vendorName?: string;
  riderId?: string | null;
  riderName?: string;
}

/* ── Riders ─────────────────────────────────────────────────────────── */

export interface AdminRider {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  isOnline?: boolean;
  isActive?: boolean;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  vehicleRegNo?: string | null;
  kycStatus?: "pending" | "approved" | "rejected" | "not_submitted";
  walletBalance?: number;
  totalEarnings?: number;
  totalRides?: number;
  rating?: number | null;
  createdAt?: string;
  lastActive?: string | null;
}

/* ── Vendors ─────────────────────────────────────────────────────────── */

export interface AdminVendor {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  storeName?: string | null;
  storeCategory?: string | null;
  storeIsOpen?: boolean;
  isActive?: boolean;
  isApproved?: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  walletBalance?: number;
  totalOrders?: number;
  rating?: number | null;
  kycStatus?: "pending" | "approved" | "rejected" | "not_submitted";
  createdAt?: string;
  storeAddress?: string | null;
  businessType?: string | null;
  ntn?: string | null;
}

/* ── Wallet / Finance ────────────────────────────────────────────────── */

export interface AdminTransaction {
  id: string;
  userId: string;
  type: "deposit" | "withdrawal" | "transfer" | "refund" | "commission" | "bonus" | "payout";
  amount: number;
  currency?: string;
  status: "pending" | "completed" | "failed" | "reversed";
  description?: string | null;
  referenceId?: string | null;
  createdAt: string;
  userName?: string;
  userPhone?: string;
}

export interface AdminWithdrawal {
  id: string;
  userId: string;
  amount: number;
  status: "pending" | "approved" | "rejected" | "completed";
  accountNumber?: string | null;
  bankName?: string | null;
  iban?: string | null;
  notes?: string | null;
  approverId?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  userName?: string;
  userPhone?: string;
  userRole?: string;
}

export interface AdminDepositRequest {
  id: string;
  userId: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  paymentMethod?: string | null;
  transactionId?: string | null;
  screenshotUrl?: string | null;
  notes?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  userName?: string;
  userPhone?: string;
}

/* ── KYC ─────────────────────────────────────────────────────────────── */

export interface AdminKycRecord {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  fullName?: string | null;
  cnic?: string | null;
  frontIdPhotoUrl?: string | null;
  backIdPhotoUrl?: string | null;
  selfiePhotoUrl?: string | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  userName?: string;
  userPhone?: string;
  userRole?: string;
}

/* ── Type guards ───────────────────────────────────────────────────── */

export function isApiOk<T>(v: unknown): v is ApiOk<T> {
  return typeof v === "object" && v != null && (v as { ok?: unknown }).ok === true;
}

export function isApiErr(v: unknown): v is ApiErr {
  return (
    typeof v === "object" &&
    v != null &&
    (v as { ok?: unknown }).ok === false &&
    typeof (v as { error?: unknown }).error === "string"
  );
}

export function isApiPaginated<T>(v: unknown): v is ApiPaginated<T> {
  return (
    typeof v === "object" &&
    v != null &&
    Array.isArray((v as { items?: unknown }).items) &&
    typeof (v as { total?: unknown }).total === "number"
  );
}
