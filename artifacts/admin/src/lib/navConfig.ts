/**
 * Single source of truth for the admin sidebar navigation.
 *
 * Extracted from `components/layout/AdminLayout.tsx` so it can be reused
 * by the command palette, breadcrumb generator, the in-sidebar search
 * filter, and any new "favorites/pinned" UI without having to import the
 * heavy layout file.
 *
 * Each `NavGroup` has:
 *   - `key`              — stable string id used for persistence (collapsed
 *                          state, pinned ordering). Independent from i18n.
 *   - `labelKey`         — TranslationKey for the group header.
 *   - `color`            — accent colour for the active-state pill +
 *                          group dot.
 *   - `items`            — array of { nameKey, href, icon, optional badges }.
 *
 * Adding a new route? Add it here and it will appear in the sidebar AND in
 * any consumer (command palette item index, breadcrumbs, favorites star
 * picker) automatically.
 */

import type { TranslationKey } from "@workspace/i18n";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BellRing,
  Bike,
  Boxes,
  Bug,
  Bus,
  Car,
  CheckCheck,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  Heart,
  HelpCircle,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link2,
  Lock,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquare,
  Package,
  PackageSearch,
  PhoneCall,
  Pill,
  QrCode,
  Radio,
  Receipt,
  Rocket,
  Settings2,
  Shield,
  ShoppingBag,
  Star,
  Store,
  Tag,
  Ticket,
  ToggleLeft,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Wallet,
  Webhook,
  Zap,
} from "lucide-react";
import type React from "react";

export type NavItem = {
  /** Translation key for the visible label. */
  nameKey: TranslationKey;
  /** Wouter route. */
  href: string;
  /** Lucide icon component. */
  icon: React.ElementType;
  /** Show pulsing red dot when active SOS alerts exist. */
  sosBadge?: boolean;
  /** Show amber dot when there are uncleared error reports. */
  errorBadge?: boolean;
  /** Show blue dot when there are pending rider approval requests. */
  pendingRidersBadge?: boolean;
  /** Show orange dot when there are pending orders awaiting processing. */
  pendingOrdersBadge?: boolean;
  /** Show green dot when there are pending withdrawal requests. */
  pendingWithdrawalsBadge?: boolean;
  /** Show teal dot when there are pending deposit/top-up requests. */
  pendingDepositsBadge?: boolean;
  /** Show purple dot when there are vendor products awaiting approval. */
  pendingProductsBadge?: boolean;
  /**
   * RBAC permission(s) gating this item; super always sees everything.
   * Layout reads this lazily — kept here so a permission audit can be
   * generated from one file.
   */
  requirePermission?: string | string[];
};

export type NavGroup = {
  /** Stable id for persistence and lookups (NOT translated). */
  key: string;
  labelKey: TranslationKey;
  /** Hex accent colour for active-state pill + group dot. */
  color: string;
  items: NavItem[];
};

/**
 * Eleven logical groups — Dashboard, Operations, People, Catalog, Finance,
 * Marketing, Communications, Analytics, Security, Health, Configuration.
 * Order is the rendered order.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: "dashboard",
    labelKey: "navDashboard" as TranslationKey,
    color: "#6366F1",
    items: [{ nameKey: "navDashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    key: "operations",
    labelKey: "navOperations" as TranslationKey,
    color: "#F59E0B",
    items: [
      {
        nameKey: "navOrders",
        href: "/orders",
        icon: ShoppingBag,
        requirePermission: "orders.view",
        pendingOrdersBadge: true,
      },
      { nameKey: "navRides", href: "/rides", icon: Car, requirePermission: "fleet.rides.view" },
      { nameKey: "navVanService", href: "/van", icon: Bus, requirePermission: "fleet.rides.view" },
      {
        nameKey: "navPharmacy",
        href: "/pharmacy",
        icon: Pill,
        requirePermission: "fleet.pharmacy.view",
      },
      {
        nameKey: "navParcel" as TranslationKey,
        href: "/parcel",
        icon: Package,
        requirePermission: "fleet.parcel.view",
      },
      {
        nameKey: "navDeliveryAccess",
        href: "/delivery-access",
        icon: Truck,
        requirePermission: "vendors.view",
      },
    ],
  },
  {
    key: "people",
    labelKey: "navPeople" as TranslationKey,
    color: "#3B82F6",
    items: [
      {
        nameKey: "navUserPermissions",
        href: "/users",
        icon: Users,
        requirePermission: "users.view",
      },
      {
        nameKey: "navRiders" as TranslationKey,
        href: "/riders",
        icon: Bike,
        requirePermission: "fleet.rides.view",
        pendingRidersBadge: true,
      },
      { nameKey: "navVendors", href: "/vendors", icon: Store, requirePermission: "vendors.view" },
      { nameKey: "navKyc", href: "/kyc", icon: UserCheck, requirePermission: "finance.kyc.view" },
    ],
  },
  {
    key: "catalog",
    labelKey: "navCatalog" as TranslationKey,
    color: "#8B5CF6",
    items: [
      {
        nameKey: "navProducts",
        href: "/products",
        icon: PackageSearch,
        requirePermission: "content.products.view",
        pendingProductsBadge: true,
      },
      {
        nameKey: "navCategories" as TranslationKey,
        href: "/categories",
        icon: Tag,
        requirePermission: "content.products.view",
      },
      {
        nameKey: "navReviews" as TranslationKey,
        href: "/reviews",
        icon: Star,
        requirePermission: "content.products.view",
      },
      {
        nameKey: "navVendorInventorySettings" as TranslationKey,
        href: "/vendor-inventory-settings",
        icon: Boxes,
        requirePermission: "vendors.view",
      },
    ],
  },
  {
    key: "finance",
    labelKey: "navFinance" as TranslationKey,
    color: "#22C55E",
    items: [
      {
        nameKey: "navTransactions",
        href: "/transactions",
        icon: Receipt,
        requirePermission: "finance.transactions.view",
      },
      {
        nameKey: "navWithdrawals",
        href: "/withdrawals",
        icon: Wallet,
        requirePermission: "finance.withdrawals.view",
        pendingWithdrawalsBadge: true,
      },
      {
        nameKey: "navDepositRequests",
        href: "/deposit-requests",
        icon: CreditCard,
        requirePermission: "finance.deposits.review",
        pendingDepositsBadge: true,
      },
      {
        nameKey: "navWalletTransfers" as TranslationKey,
        href: "/wallet-transfers",
        icon: Wallet,
        requirePermission: "finance.transactions.view",
      },
      {
        nameKey: "navLoyaltyPoints" as TranslationKey,
        href: "/loyalty",
        icon: Star,
        requirePermission: "promotions.view",
      },
    ],
  },
  {
    key: "marketing",
    labelKey: "navMarketing",
    color: "#EC4899",
    items: [
      {
        nameKey: "navPromotionsHub",
        href: "/promotions",
        icon: Megaphone,
        requirePermission: "promotions.view",
      },
      {
        nameKey: "navOffersCoupons" as TranslationKey,
        href: "/promo-codes",
        icon: Ticket,
        requirePermission: "promotions.view",
      },
      {
        nameKey: "navFlashDeals",
        href: "/flash-deals",
        icon: Zap,
        requirePermission: "promotions.view",
      },
      {
        nameKey: "navBanners",
        href: "/banners",
        icon: Layers,
        requirePermission: "content.products.view",
      },
      {
        nameKey: "navPopups",
        href: "/popups",
        icon: Megaphone,
        requirePermission: "content.products.view",
      },
    ],
  },
  {
    key: "communications",
    labelKey: "navCommunications" as TranslationKey,
    color: "#06B6D4",
    items: [
      {
        nameKey: "navBroadcast" as TranslationKey,
        href: "/communications?tab=send",
        icon: Radio,
        requirePermission: "support.broadcast.send",
      },
      {
        nameKey: "navNotificationsLog" as TranslationKey,
        href: "/communications?tab=log",
        icon: BellRing,
        requirePermission: "support.broadcast.send",
      },
      {
        nameKey: "navSmsGateways" as TranslationKey,
        href: "/communications?tab=settings",
        icon: MessageSquare,
        requirePermission: "support.broadcast.send",
      },
      {
        nameKey: "navInboxChatModeration" as TranslationKey,
        href: "/support-chat",
        icon: MessageCircle,
        requirePermission: "support.chat.view",
      },
      {
        nameKey: "navFaqMgmt",
        href: "/faq-management",
        icon: HelpCircle,
        requirePermission: "content.products.view",
      },
    ],
  },
  {
    key: "analytics",
    labelKey: "navAnalytics" as TranslationKey,
    color: "#F472B6",
    items: [
      {
        nameKey: "navRevenueAnalytics" as TranslationKey,
        href: "/analytics",
        icon: TrendingUp,
        requirePermission: "finance.transactions.view",
      },
      {
        nameKey: "navSearchAnalytics",
        href: "/analytics?tab=search",
        icon: BarChart2,
        requirePermission: "system.settings.view",
      },
      {
        nameKey: "navWishlistInsights" as TranslationKey,
        href: "/analytics?tab=users",
        icon: Heart,
        requirePermission: "content.products.view",
      },
      {
        nameKey: "navQrCodes" as TranslationKey,
        href: "/qr-codes",
        icon: QrCode,
        requirePermission: "content.products.view",
      },
      {
        nameKey: "navExperiments" as TranslationKey,
        href: "/experiments",
        icon: FlaskConical,
        requirePermission: "system.settings.view",
      },
    ],
  },
  {
    key: "security",
    labelKey: "navSecurity" as TranslationKey,
    color: "#EF4444",
    items: [
      {
        nameKey: "navSecurity" as TranslationKey,
        href: "/security",
        icon: Shield,
        requirePermission: "system.settings.view",
      },
      {
        nameKey: "navActionLog" as TranslationKey,
        href: "/audit-logs",
        icon: ClipboardList,
        requirePermission: "system.audit.view",
      },
      {
        nameKey: "navConsentLog" as TranslationKey,
        href: "/consent-log",
        icon: FileText,
        requirePermission: "system.audit.view",
      },
      {
        nameKey: "navRolesPermissions" as TranslationKey,
        href: "/roles-permissions",
        icon: Lock,
        requirePermission: "system.roles.manage",
      },
      {
        nameKey: "navSosAlerts",
        href: "/sos-alerts",
        icon: AlertTriangle,
        sosBadge: true,
        requirePermission: "fleet.rides.view",
      },
    ],
  },
  {
    key: "health",
    labelKey: "navHealth" as TranslationKey,
    color: "#10B981",
    items: [
      {
        nameKey: "navHealthDashboard" as TranslationKey,
        href: "/health-dashboard",
        icon: Activity,
        requirePermission: "system.settings.view",
      },
      {
        nameKey: "navErrorMonitor",
        href: "/error-monitor",
        icon: Bug,
        errorBadge: true,
        requirePermission: "system.settings.view",
      },
      {
        nameKey: "navLiveRidersMap",
        href: "/live-riders-map",
        icon: MapPin,
        requirePermission: "fleet.rides.view",
      },
      {
        nameKey: "navChatMonitor" as TranslationKey,
        href: "/chat-monitor",
        icon: MessageSquare,
        requirePermission: "support.chat.view",
      },
    ],
  },
  {
    key: "configuration",
    labelKey: "navConfiguration" as TranslationKey,
    color: "#94A3B8",
    items: [
      {
        nameKey: "navSettings",
        href: "/settings",
        icon: Settings2,
        requirePermission: "system.settings.view",
      },
      {
        nameKey: "navFeatureToggles",
        href: "/app-management",
        icon: ToggleLeft,
        requirePermission: "system.settings.view",
      },
      {
        nameKey: "navAuthMethods" as TranslationKey,
        href: "/auth-methods",
        icon: KeyRound,
        requirePermission: "system.settings.edit",
      },
      {
        nameKey: "navLaunchControl" as TranslationKey,
        href: "/launch-control",
        icon: Rocket,
        requirePermission: "system.maintenance",
      },
      {
        nameKey: "navOtpControl" as TranslationKey,
        href: "/otp-control",
        icon: PhoneCall,
        requirePermission: "system.settings.edit",
      },
      {
        nameKey: "navAccountRestrictions" as TranslationKey,
        href: "/business-rules",
        icon: Shield,
        requirePermission: "system.settings.view",
      },
      {
        nameKey: "navDeepLinks" as TranslationKey,
        href: "/deep-links",
        icon: Link2,
        requirePermission: "content.products.view",
      },
      {
        nameKey: "navWebhooks" as TranslationKey,
        href: "/webhooks",
        icon: Webhook,
        requirePermission: "system.settings.view",
      },
      {
        nameKey: "navWhatsAppDeliveryLog" as TranslationKey,
        href: "/whatsapp-delivery-log",
        icon: CheckCheck,
        requirePermission: "system.settings.view",
      },
    ],
  },
];

/** Flat list of every nav item — used by command palette & breadcrumbs. */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * One-line descriptions for each nav route. Surfaced as tooltips when the
 * sidebar is collapsed to icons-only mode (desktop), and as the secondary
 * line in the in-sidebar search dropdown.
 */
export const NAV_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "/dashboard": "Overview KPIs and live activity",
  "/orders": "All marketplace orders and refunds",
  "/rides": "Ride bookings and disputes",
  "/van": "Van service requests",
  "/pharmacy": "Pharmacy orders and pre-orders",
  "/parcel": "Parcel delivery requests",
  "/delivery-access": "Pilot whitelist and access requests",
  "/live-riders-map": "Real-time rider positions",
  "/sos-alerts": "Active safety alerts",
  "/users": "Customers, admins and roles",
  "/riders": "Rider accounts and performance",
  "/vendors": "Stores, catalogues and payouts",
  "/kyc": "KYC submissions and verification",
  "/roles-permissions": "Admin RBAC matrix and role assignment",
  "/products": "Global catalogue and curation",
  "/categories": "Product category hierarchy",
  "/reviews": "Customer reviews and moderation",
  "/vendor-inventory-settings": "Vendor inventory rules and settings",
  "/transactions": "Wallet, payouts and ledger entries",
  "/withdrawals": "Vendor and rider withdrawal requests",
  "/deposit-requests": "Customer top-ups awaiting approval",
  "/wallet-transfers": "Internal wallet movements",
  "/loyalty": "Loyalty point ledger and rules",
  "/promotions": "Offers, coupons and campaigns",
  "/promo-codes": "Promo code creation and management",
  "/flash-deals": "Time-bound flash deal calendar",
  "/banners": "Home and category banner slots",
  "/popups": "In-app popup campaigns",
  "/communications": "Send broadcasts, view notification logs, SMS gateways and messaging KPIs",
  "/broadcast": "Send broadcast messages to customers, vendors and riders",
  "/notifications": "Notification delivery log",
  "/support-chat": "Inbox plus chat moderation",
  "/faq-management": "Help centre and FAQ articles",
  "/analytics": "Revenue, search and user analytics",
  "/qr-codes": "Branded QR codes and campaigns",
  "/experiments": "A/B tests and rollouts",
  "/security": "Security dashboard and admin actions audit",
  "/audit-logs": "Paginated log of all admin actions with filters",
  "/consent-log": "User consent and GDPR log",
  "/health-dashboard":
    "Live status of GPS tracking, content moderation rules, and service feature flags",
  "/error-monitor": "Client and server error stream",
  "/chat-monitor": "Real-time chat activity monitor",
  "/settings": "Single source of truth for platform settings",
  "/app-management": "Service status overview, admin accounts and release notes",
  "/auth-methods": "Per-role login methods (Phone, Email, OAuth, 2FA, Biometric)",
  "/launch-control": "Pre-launch readiness checklist",
  "/otp-control": "OTP delivery providers and policies",
  "/deep-links": "Deep link generator and analytics",
  "/webhooks": "Outgoing webhook endpoints",
  "/business-rules": "Account conditions and automation rules",
  "/whatsapp-delivery-log": "WhatsApp message delivery status (sent/delivered/read/failed)",
  "/sms-gateways": "SMS provider routing (now under Communications → SMS Gateways)",
  "/revenue-analytics": "Revenue analytics (now under Analytics)",
  "/search-analytics": "Search analytics (now under Analytics)",
  "/wishlist-insights": "Wishlist analytics (now under Analytics)",
  "/account-conditions": "Account conditions (now under Business Rules)",
  "/condition-rules": "Automation rules (now under Business Rules)",
};

/**
 * Bottom-nav (mobile) — fixed 4 items + a "More" trigger that opens the
 * sidebar drawer. Kept stable for muscle memory.
 *
 * The "More" entry uses `href: "__more__"` as a sentinel — the layout
 * detects this and opens the mobile drawer instead of routing.
 */
export const BOTTOM_NAV: readonly {
  nameKey: TranslationKey;
  href: string;
  icon: React.ElementType;
  isSos?: boolean;
}[] = [
  { nameKey: "navDashboard", href: "/dashboard", icon: LayoutDashboard },
  { nameKey: "navOrders", href: "/orders", icon: ShoppingBag },
  { nameKey: "navRides", href: "/rides", icon: Car },
  { nameKey: "navSosAlerts", href: "/sos-alerts", icon: AlertTriangle, isSos: true },
  { nameKey: "navMore", href: "__more__", icon: Menu },
];

/** Wouter active-route helper — matches /dashboard for both `/` and `/dashboard`. */
export function isActivePath(location: string, href: string): boolean {
  if (href === "/dashboard") return location === "/dashboard" || location === "/";
  // Strip query params from the configured href before comparing — `/analytics?tab=search`
  // should still consider `/analytics` the active root.
  const root = href.split("?")[0]!;
  return location.startsWith(root);
}

/**
 * Pinned-favorites: persisted as a comma-separated list of hrefs in
 * localStorage. Order is preserved as the user drags / re-pins.
 */
export const FAVORITES_STORAGE_KEY = "ajkmart_sidebar_favorites";

export function readFavorites(safeLocalGet: (k: string) => string | null): string[] {
  const raw = safeLocalGet(FAVORITES_STORAGE_KEY);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function writeFavorites(
  safeLocalSet: (k: string, v: string) => unknown,
  favorites: string[]
): void {
  safeLocalSet(FAVORITES_STORAGE_KEY, favorites.join(","));
}
