import {
  BarChart3,
  Bell,
  Bike,
  Bus,
  Car,
  Clock,
  CreditCard,
  Database,
  FileText,
  Gauge,
  Globe,
  ImageUp,
  KeyRound,
  Languages,
  List,
  MapPin,
  MessageSquare,
  Palette,
  Puzzle,
  Server,
  Shield,
  ShieldAlert,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Store,
  Truck,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import type { ElementType } from "react";
import type { CatKey } from "./settings-render";

/** The ten top-level settings groups shown in the sidebar. */
export type Top10Key =
  | "general"
  | "pricing"
  | "orders"
  | "payments"
  | "notifications"
  | "security"
  | "integrations"
  | "compliance"
  | "branding"
  | "monitoring";

export const TOP10_ORDER: readonly Top10Key[] = [
  "general",
  "pricing",
  "orders",
  "payments",
  "notifications",
  "security",
  "integrations",
  "compliance",
  "branding",
  "monitoring",
];

/** Map every legacy DB category → its Top-10 parent. */
export const LEGACY_TO_TOP10: Record<string, Top10Key> = {
  // 1. General Settings
  general: "general",
  regional: "general",
  localization: "general",
  features: "general",
  // 2. Pricing & Commissions
  finance: "pricing",
  customer: "pricing",
  rider: "pricing",
  vendor: "pricing",
  commission: "pricing",
  pricing: "pricing",
  refunds: "pricing",
  // 3. Order Rules
  orders: "orders",
  delivery: "orders",
  dispatch: "orders",
  rides: "orders",
  van: "orders",
  onboarding: "orders",
  // 4. Payment Methods
  payment: "payments",
  // 5. Notifications
  notifications: "notifications",
  content: "notifications",
  sms: "notifications",
  email: "notifications",
  // 6. Security
  security: "security",
  jwt: "security",
  moderation: "security",
  ratelimit: "security",
  // 7. Integrations
  integrations: "integrations",
  // 8. Compliance
  gdpr: "compliance",
  terms: "compliance",
  compliance: "compliance",
  // 9. Branding
  branding: "branding",
  colors: "branding",
  app_store: "branding",
  // 10. Monitoring
  monitoring: "monitoring",
  uptime: "monitoring",
  system: "monitoring",
  system_limits: "monitoring",
  cache: "monitoring",
  network: "monitoring",
  geo: "monitoring",
  uploads: "monitoring",
  pagination: "monitoring",
  weather: "monitoring",
};

/** Top-10 group metadata (sidebar entries + section header). */
export const TOP10_CONFIG: Record<
  Top10Key,
  {
    label: string;
    emoji: string;
    icon: ElementType;
    color: string;
    bg: string;
    description: string;
    children: CatKey[];
  }
> = {
  general: {
    label: "General Settings",
    emoji: "🏢",
    icon: Globe,
    color: "text-gray-700",
    bg: "bg-gray-50",
    description: "App identity, feature toggles, regional formats and locale",
    children: ["general", "regional", "localization", "features"],
  },
  pricing: {
    label: "Pricing & Commissions",
    emoji: "💰",
    icon: BarChart3,
    color: "text-purple-600",
    bg: "bg-purple-50",
    description: "Finance, tax, commissions, wallet limits and per-role rates",
    children: ["finance", "customer", "rider", "vendor"],
  },
  orders: {
    label: "Order Rules",
    emoji: "📦",
    icon: ShoppingCart,
    color: "text-amber-600",
    bg: "bg-amber-50",
    description: "Order rules, delivery, dispatch, rides, van and onboarding flows",
    children: ["orders", "delivery", "dispatch", "rides", "van", "onboarding"],
  },
  payments: {
    label: "Payment Methods",
    emoji: "💳",
    icon: CreditCard,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    description: "JazzCash, EasyPaisa, Bank Transfer, COD and AJK Wallet settings",
    children: ["payment"],
  },
  notifications: {
    label: "Notifications",
    emoji: "🔔",
    icon: Bell,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    description: "Email templates, push notification text, banners and announcements",
    children: ["notifications", "content"],
  },
  security: {
    label: "Security",
    emoji: "🔒",
    icon: Shield,
    color: "text-red-600",
    bg: "bg-red-50",
    description: "Auth, OTP, sessions, JWT, content moderation and rate limits",
    children: ["security", "jwt", "moderation", "ratelimit"],
  },
  integrations: {
    label: "Integrations",
    emoji: "🔌",
    icon: Puzzle,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    description: "Maps, push, SMS, email, WhatsApp, analytics and monitoring",
    children: ["integrations"],
  },
  compliance: {
    label: "Compliance",
    emoji: "📜",
    icon: FileText,
    color: "text-slate-600",
    bg: "bg-slate-50",
    description: "GDPR, terms of service, privacy policy and legal compliance",
    children: ["compliance"],
  },
  branding: {
    label: "Branding",
    emoji: "🎨",
    icon: Palette,
    color: "text-fuchsia-600",
    bg: "bg-fuchsia-50",
    description: "Service colors, map center coordinates and app branding",
    children: ["branding"],
  },
  monitoring: {
    label: "Monitoring",
    emoji: "🔧",
    icon: Server,
    color: "text-slate-700",
    bg: "bg-slate-100",
    description: "Database, cache, network, geo, uploads, weather and system limits",
    children: [
      "system",
      "system_limits",
      "cache",
      "network",
      "geo",
      "uploads",
      "pagination",
      "weather",
    ],
  },
};

/** Sub-section labels (one per legacy category) — used as headings inside a top-10 group. */
export const CATEGORY_CONFIG: Record<
  CatKey,
  {
    label: string;
    icon: ElementType;
    color: string;
    bg: string;
    activeBg: string;
    description: string;
  }
> = {
  general: {
    label: "General",
    icon: Globe,
    color: "text-gray-600",
    bg: "bg-gray-50",
    activeBg: "bg-gray-700",
    description: "App name, support contact, version and maintenance mode",
  },
  features: {
    label: "Feature Toggles",
    icon: Zap,
    color: "text-violet-600",
    bg: "bg-violet-50",
    activeBg: "bg-violet-600",
    description: "Enable or disable each service across the entire platform instantly",
  },
  rides: {
    label: "Ride Pricing & Rules",
    icon: Car,
    color: "text-teal-600",
    bg: "bg-teal-50",
    activeBg: "bg-teal-600",
    description: "Bike & car pricing, surge, Mol-Tol bargaining and cancellation rules",
  },
  orders: {
    label: "Order Rules",
    icon: ShoppingCart,
    color: "text-amber-600",
    bg: "bg-amber-50",
    activeBg: "bg-amber-600",
    description: "Min/max cart amounts, scheduling, timing and auto-cancel rules",
  },
  delivery: {
    label: "Delivery Charges",
    icon: Truck,
    color: "text-sky-600",
    bg: "bg-sky-50",
    activeBg: "bg-sky-600",
    description: "Delivery charges per service and free delivery thresholds",
  },
  customer: {
    label: "Customer App",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
    activeBg: "bg-blue-600",
    description: "Wallet limits, loyalty points, referral bonuses and order caps for customers",
  },
  rider: {
    label: "Rider App",
    icon: Bike,
    color: "text-green-600",
    bg: "bg-green-50",
    activeBg: "bg-green-600",
    description: "Earnings %, acceptance radius, payout limits and withdrawal rules for riders",
  },
  vendor: {
    label: "Vendor Portal",
    icon: Store,
    color: "text-orange-600",
    bg: "bg-orange-50",
    activeBg: "bg-orange-600",
    description: "Commission rate, menu limits, settlement cycle and approval rules",
  },
  finance: {
    label: "Finance & Tax",
    icon: BarChart3,
    color: "text-purple-600",
    bg: "bg-purple-50",
    activeBg: "bg-purple-600",
    description: "GST/tax, cashback, platform commissions, invoicing and payouts",
  },
  payment: {
    label: "Payment Methods",
    icon: CreditCard,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    activeBg: "bg-emerald-600",
    description: "JazzCash, EasyPaisa, Bank Transfer, COD and AJK Wallet settings",
  },
  content: {
    label: "Content & Banners",
    icon: MessageSquare,
    color: "text-pink-600",
    bg: "bg-pink-50",
    activeBg: "bg-pink-600",
    description: "Banners, announcements, notices for riders & vendors, policy links",
  },
  integrations: {
    label: "Integrations",
    icon: Puzzle,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    activeBg: "bg-indigo-600",
    description: "Push notifications, SMS, WhatsApp, analytics, maps and monitoring",
  },
  security: {
    label: "Security",
    icon: Shield,
    color: "text-red-600",
    bg: "bg-red-50",
    activeBg: "bg-red-600",
    description: "OTP modes, GPS tracking, rate limits, sessions and API credentials",
  },
  system: {
    label: "System & Data",
    icon: Database,
    color: "text-rose-600",
    bg: "bg-rose-50",
    activeBg: "bg-rose-600",
    description: "Database stats, backup, restore and data management tools",
  },
  dispatch: {
    label: "Dispatch & Operations",
    icon: Gauge,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    activeBg: "bg-cyan-600",
    description: "Dispatch timeout, broadcast radius, max fare and counter-offer rules",
  },
  branding: {
    label: "Branding & UI",
    icon: Palette,
    color: "text-fuchsia-600",
    bg: "bg-fuchsia-50",
    activeBg: "bg-fuchsia-600",
    description: "Service colors, map center coordinates and label",
  },
  system_limits: {
    label: "System Limits",
    icon: Server,
    color: "text-slate-600",
    bg: "bg-slate-50",
    activeBg: "bg-slate-600",
    description: "Log retention, cache TTL, body limit and upload size",
  },
  regional: {
    label: "Regional & Validation",
    icon: Languages,
    color: "text-lime-600",
    bg: "bg-lime-50",
    activeBg: "bg-lime-600",
    description: "Phone format, timezone, currency symbol and country code",
  },
  weather: {
    label: "Weather Widget",
    icon: Globe,
    color: "text-sky-600",
    bg: "bg-sky-50",
    activeBg: "bg-sky-600",
    description: "Toggle weather widget and manage displayed cities",
  },
  notifications: {
    label: "Notifications",
    icon: Bell,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    activeBg: "bg-yellow-600",
    description: "Email templates, push notification text, fraud alert thresholds",
  },
  uploads: {
    label: "Upload Limits",
    icon: ImageUp,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    activeBg: "bg-cyan-600",
    description: "Image/video file size limits and allowed formats",
  },
  pagination: {
    label: "Pagination",
    icon: List,
    color: "text-lime-600",
    bg: "bg-lime-50",
    activeBg: "bg-lime-600",
    description: "Products per page, trending searches limit, flash deals display",
  },
  van: {
    label: "Van / Transport",
    icon: Bus,
    color: "text-stone-600",
    bg: "bg-stone-50",
    activeBg: "bg-stone-600",
    description: "Intercity van booking rules, driver limits, pricing surcharges",
  },
  onboarding: {
    label: "Onboarding & UX",
    icon: Sparkles,
    color: "text-fuchsia-600",
    bg: "bg-fuchsia-50",
    activeBg: "bg-fuchsia-600",
    description: "Vendor auto-schedule, onboarding slides, app experience",
  },
  moderation: {
    label: "Content Moderation",
    icon: ShieldAlert,
    color: "text-rose-600",
    bg: "bg-rose-50",
    activeBg: "bg-rose-600",
    description: "Auto-masking rules, custom regex patterns, flagged content",
  },
  cache: {
    label: "Cache TTLs",
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
    activeBg: "bg-amber-600",
    description: "Platform settings, VPN detection, TOR node and zone cache lifetimes",
  },
  jwt: {
    label: "JWT & Sessions",
    icon: KeyRound,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    activeBg: "bg-indigo-600",
    description: "Access token, refresh token and 2FA challenge timeouts",
  },
  ratelimit: {
    label: "Endpoint Rate Limits",
    icon: SlidersHorizontal,
    color: "text-rose-600",
    bg: "bg-rose-50",
    activeBg: "bg-rose-600",
    description: "Per-endpoint rate limits for bargaining, booking, cancellation and estimates",
  },
  geo: {
    label: "Geo & Zones",
    icon: MapPin,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    activeBg: "bg-emerald-600",
    description: "Default zone radius and open-world fallback behavior",
  },
  localization: {
    label: "Localization",
    icon: Languages,
    color: "text-lime-600",
    bg: "bg-lime-50",
    activeBg: "bg-lime-600",
    description: "Currency code and symbol used across the platform",
  },
  network: {
    label: "Network & Retry",
    icon: Wifi,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    activeBg: "bg-cyan-600",
    description:
      "API timeout, retry attempts, backoff delay, GPS queue size and dismissed-request TTL",
  },
  compliance: {
    label: "Compliance",
    icon: FileText,
    color: "text-slate-600",
    bg: "bg-slate-50",
    activeBg: "bg-slate-600",
    description: "GDPR, terms of service, privacy policy and legal compliance links",
  },
};

/** Categories that always render even when the DB returns no rows for them. */
export const ALWAYS_VISIBLE = new Set<CatKey>([
  "payment",
  "integrations",
  "security",
  "system",
  "weather",
  "compliance",
  "branding",
]);

/** Resolve a deep-link param (?tab= / ?cat= / route :section / route :subsection)
 *  — accepts both top-10 keys and legacy category names. */
export function resolveTop10(raw: string | null | undefined): Top10Key | null {
  if (!raw) return null;
  if ((TOP10_ORDER as readonly string[]).includes(raw)) return raw as Top10Key;
  if (LEGACY_TO_TOP10[raw]) return LEGACY_TO_TOP10[raw];
  return null;
}

/** Parse the wouter-relative path (already base-stripped) for
 *  `/settings/:section/:subsection?`. Centralised here so that both
 *  settings.tsx and any deep-link resolver share identical parsing logic. */
export function parseSettingsPath(routerLocation: string): {
  section: string | null;
  subsection: string | null;
} {
  const path = routerLocation.replace(/\/+$/, "");
  const m = path.match(/^\/settings(?:\/([^/]+))?(?:\/([^/]+))?$/);
  return {
    section: m?.[1] ? decodeURIComponent(m[1]) : null,
    subsection: m?.[2] ? decodeURIComponent(m[2]) : null,
  };
}
