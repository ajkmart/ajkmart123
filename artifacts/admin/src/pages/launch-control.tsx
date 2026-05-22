import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { adminFetch, fetchAdminAbsolute } from "@/lib/adminFetcher";
import { getAdminTiming } from "@/lib/adminTiming";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit2,
  FlaskConical,
  Globe,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Shield,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";

/* ── Types ── */
interface SettingRow {
  key: string;
  value: string;
  label: string;
  category: string;
  updatedAt: string;
}

interface DiffEntry {
  key: string;
  current: string | null;
  recommended: string;
  differsFromAI: boolean;
  category: string;
}

interface VendorPlan {
  id: string;
  name: string;
  slug: string;
  description: string;
  features: string[];
  commissionRate: number;
  monthlyFee: number;
  maxProducts: number;
  maxOrders: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface RolePreset {
  id: string;
  name: string;
  slug: string;
  description: string;
  permissions: string[];
  role: string;
  isBuiltIn: boolean;
  createdAt: string;
}

interface LaunchData {
  settings: SettingRow[];
  aiRecommended: Record<string, string>;
  aiDefaults: Record<string, string>;
  diffs: DiffEntry[];
  mode: "demo" | "live";
}

interface PlansData {
  plans: VendorPlan[];
}

interface PresetsData {
  presets: RolePreset[];
}

interface PlanForm {
  name: string;
  slug: string;
  description: string;
  features: string;
  commissionRate: string;
  monthlyFee: string;
  maxProducts: string;
  maxOrders: string;
}

interface RoleForm {
  name: string;
  slug: string;
  description: string;
  permissions: string[];
  role: string;
  fromPreset: string;
}

const PERMISSIONS_LIST = [
  "users",
  "orders",
  "rides",
  "pharmacy",
  "parcel",
  "products",
  "transactions",
  "settings",
  "broadcast",
  "flash-deals",
  "vendors",
  "riders",
  "security",
  "reports",
  "finance",
  "kyc",
  "withdrawals",
];

type LaunchTab = "plans" | "features" | "roles" | "defaults";

/* ── AI badge ── */
function AiBadge({ differs }: { differs: boolean }) {
  if (!differs) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
        <Brain size={9} /> AI Recommended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
      <AlertTriangle size={9} /> Differs from AI
    </span>
  );
}

/* ── Feature toggle rows for the Features tab ── */
const FEATURE_GROUPS: {
  label: string;
  icon: string;
  keys: Array<{ key: string; label: string; desc: string }>;
}[] = [
  {
    label: "Core Services",
    icon: "🛒",
    keys: [
      { key: "feature_mart", label: "Mart / Grocery", desc: "Online grocery orders" },
      { key: "feature_food", label: "Food Delivery", desc: "Restaurant food orders" },
      { key: "feature_rides", label: "Taxi & Rides", desc: "Bike and car ride bookings" },
      { key: "feature_pharmacy", label: "Pharmacy", desc: "Medicine order delivery" },
      { key: "feature_parcel", label: "Parcel Delivery", desc: "Parcel shipments" },
      { key: "feature_van", label: "Van Service", desc: "Shared van school/office routes" },
    ],
  },
  {
    label: "Wallet & Payments",
    icon: "💰",
    keys: [
      { key: "feature_wallet", label: "Digital Wallet", desc: "Wallet top-up, send, payments" },
      {
        key: "wallet_mpin_enabled",
        label: "MPIN Enforcement",
        desc: "Require MPIN for wallet ops",
      },
      { key: "wallet_p2p_enabled", label: "P2P Transfers", desc: "Wallet-to-wallet transfers" },
      { key: "cod_enabled", label: "Cash on Delivery", desc: "Allow COD payment method" },
    ],
  },
  {
    label: "User Features",
    icon: "👤",
    keys: [
      { key: "feature_referral", label: "Referral Program", desc: "Refer & Earn for customers" },
      { key: "feature_new_users", label: "New Registrations", desc: "Allow new sign-ups" },
      {
        key: "user_require_approval",
        label: "Account Approval",
        desc: "New accounts need manual approval",
      },
      {
        key: "customer_referral_enabled",
        label: "Referral Enabled",
        desc: "Referral bonus tracking",
      },
      { key: "customer_loyalty_enabled", label: "Loyalty Points", desc: "Points per purchase" },
    ],
  },
  {
    label: "Experience & UX",
    icon: "✨",
    keys: [
      { key: "feature_chat", label: "In-App Chat", desc: "Chat icon in customer app" },
      {
        key: "feature_live_tracking",
        label: "Live GPS Tracking",
        desc: "Real-time rider location",
      },
      { key: "feature_reviews", label: "Reviews & Ratings", desc: "Star ratings on orders" },
      { key: "feature_sos", label: "SOS Alerts", desc: "Emergency SOS button" },
      { key: "feature_weather", label: "Weather Widget", desc: "Weather info on home screen" },
    ],
  },
  {
    label: "Operations",
    icon: "⚙️",
    keys: [
      {
        key: "vendor_auto_approve",
        label: "Auto-Approve Vendors",
        desc: "Skip manual vendor review",
      },
      { key: "rider_auto_approve", label: "Auto-Approve Riders", desc: "Skip manual rider review" },
      { key: "rider_cash_allowed", label: "Cash for Riders", desc: "Riders can accept cash" },
      { key: "ride_surge_enabled", label: "Surge Pricing", desc: "Dynamic fare multiplier" },
      {
        key: "ride_bargaining_enabled",
        label: "Fare Bargaining",
        desc: "Customers can negotiate fares",
      },
      {
        key: "order_schedule_enabled",
        label: "Scheduled Orders",
        desc: "Pre-schedule future orders",
      },
      { key: "finance_gst_enabled", label: "GST Tax", desc: "Apply 17% GST on orders" },
      {
        key: "delivery_free_enabled",
        label: "Free Delivery",
        desc: "Free delivery above threshold",
      },
    ],
  },
  {
    label: "Security & Compliance",
    icon: "🔐",
    keys: [
      { key: "security_gps_tracking", label: "GPS Tracking", desc: "Rider location updates" },
      { key: "security_spoof_detection", label: "Spoof Detection", desc: "Detect fake GPS apps" },
      { key: "security_audit_log", label: "Audit Log", desc: "Log all admin actions" },
      {
        key: "security_phone_verify",
        label: "Phone Verification",
        desc: "OTP verification required",
      },
    ],
  },
];

/* ── Defaults category groups ── */
const DEFAULTS_GROUPS: { label: string; icon: string; keys: string[] }[] = [
  {
    label: "Services",
    icon: "🛒",
    keys: [
      "feature_mart",
      "feature_food",
      "feature_rides",
      "feature_pharmacy",
      "feature_parcel",
      "feature_wallet",
    ],
  },
  {
    label: "Finance",
    icon: "💵",
    keys: [
      "platform_commission_pct",
      "vendor_commission_pct",
      "rider_keep_pct",
      "finance_gst_pct",
      "finance_cashback_enabled",
    ],
  },
  {
    label: "Orders",
    icon: "📦",
    keys: [
      "min_order_amount",
      "delivery_fee_mart",
      "delivery_fee_food",
      "free_delivery_above",
      "cod_enabled",
    ],
  },
  {
    label: "Delivery",
    icon: "🏍️",
    keys: [
      "ride_bike_base_fare",
      "ride_bike_per_km",
      "ride_car_base_fare",
      "ride_car_per_km",
      "ride_surge_enabled",
      "ride_bargaining_enabled",
    ],
  },
  {
    label: "Security",
    icon: "🔐",
    keys: [
      "security_login_max_attempts",
      "security_lockout_minutes",
      "security_session_days",
      "security_gps_tracking",
      "security_spoof_detection",
    ],
  },
];

export default function LaunchControl() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<LaunchTab>("plans");
  const [modeConfirm, setModeConfirm] = useState<"demo" | "live" | null>(null);
  const [modeConfirmToken, setModeConfirmToken] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [planDialog, setPlanDialog] = useState<{ open: boolean; plan?: VendorPlan }>({
    open: false,
  });
  const [planForm, setPlanForm] = useState<PlanForm>({
    name: "",
    slug: "",
    description: "",
    features: "",
    commissionRate: "15",
    monthlyFee: "0",
    maxProducts: "200",
    maxOrders: "2000",
  });
  const [roleCreateDialog, setRoleCreateDialog] = useState(false);
  const [roleForm, setRoleForm] = useState<RoleForm>({
    name: "",
    slug: "",
    description: "",
    permissions: [],
    role: "manager",
    fromPreset: "",
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["Core Services", "Wallet & Payments"])
  );
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [planDeleteId, setPlanDeleteId] = useState<string | null>(null);

  /* ── Data fetching ── */
  const {
    data: launchData,
    isLoading,
    refetch,
  } = useQuery<LaunchData>({
    queryKey: ["launch-settings"],
    queryFn: () => adminFetch("/launch/settings") as Promise<LaunchData>,
    staleTime: getAdminTiming().refetchIntervalLaunchControlMs,
  });

  const { data: plansData } = useQuery<PlansData>({
    queryKey: ["launch-vendor-plans"],
    queryFn: () => adminFetch("/launch/vendor-plans") as Promise<PlansData>,
  });

  const { data: presetsData } = useQuery<PresetsData>({
    queryKey: ["launch-role-presets"],
    queryFn: () => adminFetch("/launch/role-presets") as Promise<PresetsData>,
  });

  const settings: SettingRow[] = launchData?.settings ?? [];
  const aiRecommended: Record<string, string> = launchData?.aiRecommended ?? {};
  const aiDefaults: Record<string, string> = launchData?.aiDefaults ?? {};
  const diffs: DiffEntry[] = launchData?.diffs ?? [];
  const currentMode: "demo" | "live" = launchData?.mode ?? "demo";
  const plans: VendorPlan[] = plansData?.plans ?? [];
  const presets: RolePreset[] = presetsData?.presets ?? [];

  const getSetting = (key: string): string | null =>
    settings.find((s) => s.key === key)?.value ?? null;
  const getAI = (key: string): string | null => aiRecommended[key] ?? aiDefaults[key] ?? null;
  const differsFromAI = (key: string): boolean => {
    const curr = getSetting(key);
    const rec = getAI(key);
    return curr != null && rec != null && curr !== rec;
  };

  /* ── Helpers ── */
  async function apiCall(
    url: string,
    options: RequestInit
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    try {
      const data = await fetchAdminAbsolute(url, options);
      return { ok: true, data: (data ?? {}) as Record<string, unknown> };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      return { ok: false, data: { message } };
    }
  }

  /* ── Mutations ── */
  const switchMode = async (mode: "demo" | "live") => {
    setSaving(true);
    try {
      const { ok, data } = await apiCall("/api/admin/launch/mode", {
        method: "POST",
        body: JSON.stringify({ mode, confirmToken: modeConfirmToken }),
      });
      if (!ok) {
        const msg = typeof data["message"] === "string" ? data["message"] : "Failed to switch mode";
        toast({ title: msg, variant: "destructive" });
        return;
      }
      toast({
        title: `Switched to ${mode === "demo" ? "Demo" : "Live"} mode`,
        description:
          mode === "live"
            ? "Platform now uses real production data"
            : "Platform uses demo seed data",
      });
      void qc.invalidateQueries({ queryKey: ["launch-settings"] });
    } catch (_err) {
      toast({ title: "Network error — mode not changed", variant: "destructive" });
    } finally {
      setSaving(false);
      setModeConfirm(null);
      setModeConfirmToken("");
    }
  };

  const resetDefaults = async () => {
    setSaving(true);
    try {
      const { ok } = await apiCall("/api/admin/launch/reset-defaults", { method: "POST" });
      if (!ok) {
        toast({ title: "Reset failed", variant: "destructive" });
        return;
      }
      toast({
        title: "Reset to AI Defaults",
        description: "All settings have been reset to AI-recommended values",
      });
      void qc.invalidateQueries({ queryKey: ["launch-settings"] });
    } catch (_err) {
      toast({ title: "Network error — reset not applied", variant: "destructive" });
    } finally {
      setSaving(false);
      setResetConfirm(false);
    }
  };

  const toggleFeature = async (key: string, currentValue: string | null) => {
    const newValue = currentValue === "on" ? "off" : "on";
    setTogglingKey(key);
    try {
      const { ok, data } = await apiCall(`/api/admin/launch/feature/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ value: newValue }),
      });
      if (!ok) {
        const msg = typeof data["message"] === "string" ? data["message"] : "Toggle failed";
        toast({ title: msg, variant: "destructive" });
        return;
      }
      void qc.invalidateQueries({ queryKey: ["launch-settings"] });
      toast({
        title: `${key} set to ${newValue}`,
        description: newValue === "on" ? "Feature enabled" : "Feature disabled",
      });
    } catch (_err) {
      toast({ title: "Network error — toggle not applied", variant: "destructive" });
    } finally {
      setTogglingKey(null);
    }
  };

  const setDefaultPlan = async (id: string) => {
    try {
      const { ok } = await apiCall(`/api/admin/launch/vendor-plans/${id}/set-default`, {
        method: "POST",
      });
      if (!ok) {
        toast({ title: "Failed to set default", variant: "destructive" });
        return;
      }
      toast({ title: "Default plan updated" });
      void qc.invalidateQueries({ queryKey: ["launch-vendor-plans"] });
    } catch (_err) {
      toast({ title: "Network error", variant: "destructive" });
    }
  };

  const deletePlan = async (id: string) => {
    try {
      const { ok } = await apiCall(`/api/admin/launch/vendor-plans/${id}`, { method: "DELETE" });
      if (!ok) {
        toast({ title: "Delete failed", variant: "destructive" });
        return;
      }
      toast({ title: "Plan deleted" });
      void qc.invalidateQueries({ queryKey: ["launch-vendor-plans"] });
    } catch (_err) {
      toast({ title: "Network error", variant: "destructive" });
    }
  };

  const savePlan = async () => {
    const body = {
      name: planForm.name,
      slug: planForm.slug,
      description: planForm.description,
      features: planForm.features
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      commissionRate: Number(planForm.commissionRate),
      monthlyFee: Number(planForm.monthlyFee),
      maxProducts: Number(planForm.maxProducts),
      maxOrders: Number(planForm.maxOrders),
    };
    setSaving(true);
    try {
      const method = planDialog.plan ? "PUT" : "POST";
      const url = planDialog.plan
        ? `/api/admin/launch/vendor-plans/${planDialog.plan.id}`
        : "/api/admin/launch/vendor-plans";
      const { ok } = await apiCall(url, { method, body: JSON.stringify(body) });
      if (!ok) {
        toast({ title: "Save failed", variant: "destructive" });
        return;
      }
      toast({ title: planDialog.plan ? "Plan updated" : "Plan created" });
      void qc.invalidateQueries({ queryKey: ["launch-vendor-plans"] });
      setPlanDialog({ open: false });
    } catch (_err) {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!roleForm.name || !roleForm.slug) {
      toast({ title: "Name and slug required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { ok } = await apiCall("/api/admin/launch/role-presets", {
        method: "POST",
        body: JSON.stringify(roleForm),
      });
      if (!ok) {
        toast({ title: "Create failed", variant: "destructive" });
        return;
      }
      toast({ title: "Role preset created" });
      void qc.invalidateQueries({ queryKey: ["launch-role-presets"] });
      setRoleCreateDialog(false);
    } catch (_err) {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openNewPlan = () => {
    setPlanForm({
      name: "",
      slug: "",
      description: "",
      features: "",
      commissionRate: "15",
      monthlyFee: "999",
      maxProducts: "200",
      maxOrders: "2000",
    });
    setPlanDialog({ open: true });
  };

  const openEditPlan = (plan: VendorPlan) => {
    setPlanForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      features: (plan.features ?? []).join("\n"),
      commissionRate: String(plan.commissionRate),
      monthlyFee: String(plan.monthlyFee),
      maxProducts: String(plan.maxProducts),
      maxOrders: String(plan.maxOrders),
    });
    setPlanDialog({ open: true, plan });
  };

  const loadPresetIntoRole = (preset: RolePreset) => {
    setRoleForm({
      name: `${preset.name} (Copy)`,
      slug: `${preset.slug}-copy`,
      description: preset.description,
      permissions: [...preset.permissions],
      role: preset.role,
      fromPreset: preset.id,
    });
    setRoleCreateDialog(true);
  };

  const togglePerm = (p: string) => {
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p)
        ? f.permissions.filter((x) => x !== p)
        : [...f.permissions, p],
    }));
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const diffCount = diffs.filter((d) => d.differsFromAI).length;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Launch Control page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6 pb-10">
        <PageHeader
          icon={Rocket}
          title="Launch Control"
          subtitle="Platform configuration, plans, and deployment settings"
          iconBgClass="bg-violet-100"
          iconColorClass="text-violet-600"
          actions={
            <Button variant="outline" onClick={() => refetch()} className="h-10 gap-2 rounded-xl">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          }
        />

        {/* ── Demo / Live Mode Banner ── */}
        <div
          className={`flex flex-col justify-between gap-4 rounded-2xl border-2 p-4 sm:flex-row sm:items-center ${
            currentMode === "live" ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${currentMode === "live" ? "bg-green-100" : "bg-amber-100"}`}
            >
              {currentMode === "live" ? (
                <Globe className="h-5 w-5 text-green-600" />
              ) : (
                <FlaskConical className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p
                  className={`text-sm font-bold ${currentMode === "live" ? "text-green-800" : "text-amber-800"}`}
                >
                  Platform is in <span className="tracking-wide uppercase">{currentMode}</span> mode
                </p>
                <span
                  className={`h-2 w-2 animate-pulse rounded-full ${currentMode === "live" ? "bg-green-500" : "bg-amber-500"}`}
                />
              </div>
              <p
                className={`mt-0.5 text-xs ${currentMode === "live" ? "text-green-700" : "text-amber-700"}`}
              >
                {currentMode === "live"
                  ? "Operating on real production data — all transactions are live"
                  : "Using demo seed data — safe for testing and demonstration"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={currentMode === "demo" ? "default" : "outline"}
              onClick={() => {
                setModeConfirmToken("");
                setModeConfirm("demo");
              }}
              className={`h-9 gap-1.5 rounded-xl text-xs ${currentMode === "demo" ? "border-amber-700 bg-amber-600 hover:bg-amber-700" : ""}`}
            >
              <FlaskConical className="h-3.5 w-3.5" /> Demo Mode
            </Button>
            <Button
              size="sm"
              variant={currentMode === "live" ? "default" : "outline"}
              onClick={() => {
                setModeConfirmToken("");
                setModeConfirm("live");
              }}
              className={`h-9 gap-1.5 rounded-xl text-xs ${currentMode === "live" ? "border-green-600 bg-green-600 hover:bg-green-700" : ""}`}
            >
              <Globe className="h-3.5 w-3.5" /> Live Mode
            </Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="bg-muted flex w-max min-w-full gap-1 rounded-xl p-1">
            {[
              { id: "plans", label: "📋 Plans", desc: "Vendor subscription plans" },
              { id: "features", label: "⚡ Features", desc: "Platform feature toggles" },
              { id: "roles", label: "🛡️ Roles", desc: "Admin role templates" },
              { id: "defaults", label: "🎯 Defaults", desc: "AI-recommended settings" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as LaunchTab)}
                className={`flex-shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all ${tab === t.id ? "text-foreground bg-white shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
                {t.id === "features" && diffCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                    {diffCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════════
          PLANS TAB
      ════════════════════════════════════════════ */}
        {tab === "plans" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Define subscription tiers for vendors. Growth is AI-recommended as the default.
              </p>
              <Button size="sm" onClick={openNewPlan} className="h-9 gap-1.5 rounded-xl text-xs">
                <Plus className="h-3.5 w-3.5" /> New Plan
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all ${
                    plan.isDefault
                      ? "border-violet-400 shadow-md shadow-violet-100"
                      : "border-border hover:border-violet-200"
                  }`}
                >
                  <div
                    className={`px-5 py-4 ${plan.isDefault ? "bg-gradient-to-r from-violet-50 to-indigo-50" : "bg-muted/20"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-slate-800">{plan.name}</h3>
                          {plan.slug === "growth" && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                              <Brain size={9} /> AI Recommended
                            </span>
                          )}
                          {plan.isDefault && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                              <Star size={9} /> Default
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">{plan.description}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-baseline gap-1">
                      {plan.monthlyFee === 0 ? (
                        <span className="text-2xl font-black text-slate-800">Free</span>
                      ) : (
                        <>
                          <span className="text-muted-foreground text-xs">Rs.</span>
                          <span className="text-2xl font-black text-slate-800">
                            {plan.monthlyFee.toLocaleString()}
                          </span>
                          <span className="text-muted-foreground text-xs">/mo</span>
                        </>
                      )}
                      <span className="text-muted-foreground ml-2 text-xs">
                        • {plan.commissionRate}% commission
                      </span>
                    </div>

                    <div className="mt-1.5 text-xs text-slate-600">
                      {plan.maxProducts >= 9999
                        ? "Unlimited products"
                        : `Up to ${plan.maxProducts} products`}
                      {" · "}
                      {plan.maxOrders >= 9999
                        ? "Unlimited orders"
                        : `${plan.maxOrders.toLocaleString()} orders/mo`}
                    </div>
                  </div>

                  <div className="space-y-1.5 px-5 py-4">
                    {(plan.features ?? []).map((f: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 px-5 pb-4">
                    {!plan.isDefault && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDefaultPlan(plan.id)}
                        className="h-8 flex-1 gap-1 rounded-lg text-xs"
                      >
                        <Star className="h-3 w-3" /> Set Default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditPlan(plan)}
                      className="h-8 gap-1 rounded-lg text-xs"
                    >
                      <Edit2 className="h-3 w-3" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPlanDeleteId(plan.id)}
                      className="h-8 gap-1 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════
          FEATURES TAB — Interactive toggle master center
      ════════════════════════════════════════════ */}
        {tab === "features" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">
                  Toggle features on or off directly. Green badge = AI-recommended. Amber badge =
                  differs from AI recommendation.
                </p>
                {diffCount > 0 && (
                  <p className="mt-0.5 text-xs font-medium text-amber-700">
                    ⚠️ {diffCount} setting{diffCount !== 1 ? "s" : ""} differ from AI
                    recommendations
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setResetConfirm(true)}
                className="h-9 gap-1.5 rounded-xl text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset All to AI Defaults
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-muted h-16 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {FEATURE_GROUPS.map((group) => {
                  const isExpanded = expandedGroups.has(group.label);
                  const groupDiffs = group.keys.filter((k) => differsFromAI(k.key)).length;
                  return (
                    <div
                      key={group.label}
                      className="border-border overflow-hidden rounded-xl border"
                    >
                      <button
                        onClick={() => toggleGroup(group.label)}
                        className="bg-muted/30 hover:bg-muted/50 flex w-full items-center justify-between px-4 py-3 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{group.icon}</span>
                          <span className="text-foreground text-sm font-semibold">
                            {group.label}
                          </span>
                          {groupDiffs > 0 && (
                            <span className="rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                              {groupDiffs} differ
                            </span>
                          )}
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="text-muted-foreground h-4 w-4" />
                        ) : (
                          <ChevronDown className="text-muted-foreground h-4 w-4" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="divide-border/50 divide-y">
                          {group.keys.map(({ key, label, desc }) => {
                            const curr = getSetting(key);
                            const rec = getAI(key);
                            const differs = differsFromAI(key);
                            const isOn = curr === "on";
                            const isToggleable = rec === "on" || rec === "off";
                            const isToggling = togglingKey === key;
                            return (
                              <div
                                key={key}
                                className={`flex items-center justify-between px-4 py-3 ${differs ? "bg-amber-50/30" : ""}`}
                              >
                                <div className="mr-3 min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-foreground text-sm font-medium">
                                      {label}
                                    </span>
                                    {rec != null && <AiBadge differs={differs} />}
                                  </div>
                                  <p className="text-muted-foreground mt-0.5 text-xs">{desc}</p>
                                  <p className="text-muted-foreground/70 mt-0.5 font-mono text-[10px]">
                                    {key}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                  {isToggleable && curr != null ? (
                                    <button
                                      onClick={() => toggleFeature(key, curr)}
                                      disabled={isToggling}
                                      aria-label={`Toggle ${label} ${isOn ? "off" : "on"}`}
                                      className={`relative h-5 w-10 rounded-full transition-colors focus:ring-2 focus:ring-violet-400 focus:outline-none ${
                                        isToggling ? "cursor-wait opacity-50" : "cursor-pointer"
                                      } ${isOn ? "bg-green-500" : "bg-gray-300"}`}
                                    >
                                      <div
                                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`}
                                      />
                                    </button>
                                  ) : (
                                    <span className="text-muted-foreground text-[10px] italic">
                                      {curr == null ? "not seeded" : curr}
                                    </span>
                                  )}
                                  {rec && curr !== rec && (
                                    <span className="text-muted-foreground font-mono text-[10px]">
                                      AI: {rec}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════
          ROLES TAB
      ════════════════════════════════════════════ */}
        {tab === "roles" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Predefined admin role templates — create new roles from templates or from scratch.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setRoleForm({
                    name: "",
                    slug: "",
                    description: "",
                    permissions: [],
                    role: "manager",
                    fromPreset: "",
                  });
                  setRoleCreateDialog(true);
                }}
                className="h-9 gap-1.5 rounded-xl text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> New Role Preset
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {presets.map((preset) => {
                const roleColors: Record<string, string> = {
                  super: "bg-red-50 border-red-200",
                  manager: "bg-blue-50 border-blue-200",
                  finance: "bg-green-50 border-green-200",
                  support: "bg-amber-50 border-amber-200",
                };
                const roleTagColors: Record<string, string> = {
                  super: "bg-red-100 text-red-700",
                  manager: "bg-blue-100 text-blue-700",
                  finance: "bg-green-100 text-green-700",
                  support: "bg-amber-100 text-amber-700",
                };
                const roleEmojis: Record<string, string> = {
                  super: "👑",
                  manager: "🎯",
                  finance: "💰",
                  support: "🎧",
                };
                const color = roleColors[preset.role] ?? "bg-slate-50 border-slate-200";
                const tagColor = roleTagColors[preset.role] ?? "bg-slate-100 text-slate-700";
                const emoji = roleEmojis[preset.role] ?? "👤";
                return (
                  <div key={preset.id} className={`rounded-2xl border-2 ${color} overflow-hidden`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">{emoji}</span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-800">{preset.name}</h3>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tagColor}`}
                              >
                                {preset.role}
                              </span>
                              {preset.isBuiltIn && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                  Built-in
                                </span>
                              )}
                            </div>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {preset.description}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadPresetIntoRole(preset)}
                          className="h-7 flex-shrink-0 gap-1 rounded-lg text-xs"
                        >
                          <Copy className="h-3 w-3" /> Use Template
                        </Button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(preset.permissions ?? []).map((p: string) => (
                          <span
                            key={p}
                            className="border-border/60 rounded-full border bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {presets.length === 0 && (
              <div className="text-muted-foreground py-12 text-center">
                <Shield className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p>No role presets found. Create the first one.</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════
          DEFAULTS TAB
      ════════════════════════════════════════════ */}
        {tab === "defaults" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">
                  Compare current settings vs AI-recommended values for each category.
                </p>
                {diffCount > 0 && (
                  <p className="mt-0.5 text-xs font-medium text-amber-700">
                    ⚠️ {diffCount} settings differ from AI recommendations
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setResetConfirm(true)}
                className="h-9 gap-1.5 rounded-xl text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset to AI Defaults
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-muted h-32 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {DEFAULTS_GROUPS.map((group) => {
                  const groupDiffs = group.keys.filter((k) => differsFromAI(k)).length;
                  const total = group.keys.length;
                  return (
                    <div
                      key={group.label}
                      className={`overflow-hidden rounded-2xl border-2 ${groupDiffs > 0 ? "border-amber-200 bg-amber-50/30" : "border-green-200 bg-green-50/10"}`}
                    >
                      <div
                        className={`flex items-center justify-between px-4 py-3 ${groupDiffs > 0 ? "border-b border-amber-200 bg-amber-50" : "border-b border-green-200 bg-green-50/50"}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{group.icon}</span>
                          <span className="text-sm font-bold text-slate-800">{group.label}</span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            groupDiffs === 0
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {groupDiffs === 0 ? "✓ All aligned" : `${groupDiffs}/${total} differ`}
                        </span>
                      </div>
                      <div className="divide-border/40 divide-y">
                        {group.keys.map((key) => {
                          const curr = getSetting(key);
                          const rec = getAI(key);
                          const differs = differsFromAI(key);
                          return (
                            <div
                              key={key}
                              className={`flex items-center gap-3 px-4 py-2.5 ${differs ? "bg-amber-50/30" : ""}`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-700">
                                  {key}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-xs">
                                <div className="text-right">
                                  <p className="text-muted-foreground text-[10px]">Current</p>
                                  <p
                                    className={`font-mono font-bold ${differs ? "text-amber-700" : "text-slate-700"}`}
                                  >
                                    {curr ?? "—"}
                                  </p>
                                </div>
                                {rec && (
                                  <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                                )}
                                {rec && (
                                  <div className="text-right">
                                    <p className="text-muted-foreground text-[10px]">AI Rec.</p>
                                    <p className="font-mono font-bold text-green-700">{rec}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* AI Summary */}
            <div className="rounded-2xl border border-violet-200 bg-violet-50/30 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <p className="text-sm font-bold text-violet-800">AI Recommendations Summary</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Total tracked", value: diffs.length, color: "text-slate-700" },
                  {
                    label: "Aligned with AI",
                    value: diffs.filter((d) => !d.differsFromAI && d.current != null).length,
                    color: "text-green-700",
                  },
                  { label: "Differ from AI", value: diffCount, color: "text-amber-700" },
                  {
                    label: "Not yet set",
                    value: diffs.filter((d) => d.current == null).length,
                    color: "text-blue-700",
                  },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-muted-foreground text-xs">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════ MODE CONFIRM DIALOG ════════════ */}
        {modeConfirm && (
          <Dialog
            open={!!modeConfirm}
            onOpenChange={() => {
              setModeConfirm(null);
              setModeConfirmToken("");
            }}
          >
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {modeConfirm === "live" ? (
                    <Globe className="h-5 w-5 text-green-600" />
                  ) : (
                    <FlaskConical className="h-5 w-5 text-amber-600" />
                  )}
                  Switch to {modeConfirm === "live" ? "Live" : "Demo"} Mode?
                </DialogTitle>
              </DialogHeader>
              <div
                className={`rounded-xl p-4 ${modeConfirm === "live" ? "border border-green-200 bg-green-50" : "border border-amber-200 bg-amber-50"}`}
              >
                <p className="mb-1 text-sm font-semibold">
                  {modeConfirm === "live" ? "⚠️ Switching to LIVE mode" : "Switching to DEMO mode"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {modeConfirm === "live"
                    ? "The platform will operate on real production data. All transactions, orders, and user interactions will be real. Make sure your settings are configured correctly before going live."
                    : "The platform will use seeded demo data. Real data will not be affected. Ideal for demonstrations and testing."}
                </p>
              </div>
              <div className="mt-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Type{" "}
                  <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                    CONFIRM
                  </span>{" "}
                  to proceed
                </label>
                <Input
                  value={modeConfirmToken}
                  onChange={(e) => setModeConfirmToken(e.target.value)}
                  placeholder="CONFIRM"
                  className="h-9 rounded-lg font-mono text-sm"
                  autoFocus
                />
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setModeConfirm(null);
                    setModeConfirmToken("");
                  }}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => switchMode(modeConfirm)}
                  disabled={modeConfirmToken !== "CONFIRM" || saving}
                  className={`rounded-xl ${modeConfirm === "live" ? "bg-green-600 hover:bg-green-700" : "bg-amber-500 hover:bg-amber-600"}`}
                >
                  Confirm — Switch to {modeConfirm === "live" ? "Live" : "Demo"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ════════════ RESET CONFIRM DIALOG ════════════ */}
        {resetConfirm && (
          <Dialog open={resetConfirm} onOpenChange={() => setResetConfirm(false)}>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-violet-600" />
                  Reset All to AI Defaults?
                </DialogTitle>
              </DialogHeader>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="mb-1 text-sm font-semibold">
                  This will update{" "}
                  {Object.keys(aiRecommended).length + Object.keys(aiDefaults).length} settings
                </p>
                <p className="text-muted-foreground text-xs">
                  All feature flags, finance settings, security settings, and operational defaults
                  will be reset to the AI-recommended values. This cannot be undone automatically.
                </p>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setResetConfirm(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={resetDefaults}
                  disabled={saving}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700"
                >
                  Reset to AI Defaults
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ════════════ PLAN DIALOG ════════════ */}
        <Dialog
          open={planDialog.open}
          onOpenChange={(o) => {
            if (!o) setPlanDialog({ open: false });
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle>{planDialog.plan ? "Edit Plan" : "New Vendor Plan"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Plan Name *
                  </label>
                  <Input
                    value={planForm.name}
                    onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Growth"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Slug *</label>
                  <Input
                    value={planForm.slug}
                    onChange={(e) => setPlanForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="e.g. growth"
                    className="h-9 rounded-lg font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Description
                </label>
                <Input
                  value={planForm.description}
                  onChange={(e) => setPlanForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description"
                  className="h-9 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Commission Rate (%)
                  </label>
                  <Input
                    type="number"
                    value={planForm.commissionRate}
                    onChange={(e) => setPlanForm((f) => ({ ...f, commissionRate: e.target.value }))}
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Monthly Fee (Rs.)
                  </label>
                  <Input
                    type="number"
                    value={planForm.monthlyFee}
                    onChange={(e) => setPlanForm((f) => ({ ...f, monthlyFee: e.target.value }))}
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Max Products
                  </label>
                  <Input
                    type="number"
                    value={planForm.maxProducts}
                    onChange={(e) => setPlanForm((f) => ({ ...f, maxProducts: e.target.value }))}
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Max Orders/Month
                  </label>
                  <Input
                    type="number"
                    value={planForm.maxOrders}
                    onChange={(e) => setPlanForm((f) => ({ ...f, maxOrders: e.target.value }))}
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Features (one per line)
                </label>
                <textarea
                  value={planForm.features}
                  onChange={(e) => setPlanForm((f) => ({ ...f, features: e.target.value }))}
                  rows={5}
                  placeholder="Up to 200 products&#10;Priority support&#10;All payment methods"
                  className="border-border w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setPlanDialog({ open: false })}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={savePlan}
                  disabled={saving}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700"
                >
                  {planDialog.plan ? "Save Changes" : "Create Plan"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ════════════ ROLE PRESET DIALOG ════════════ */}
        <Dialog
          open={roleCreateDialog}
          onOpenChange={(o) => {
            if (!o) setRoleCreateDialog(false);
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle>Create Admin Role Preset</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Role Name *
                  </label>
                  <Input
                    value={roleForm.name}
                    onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Operations Lead"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Slug *</label>
                  <Input
                    value={roleForm.slug}
                    onChange={(e) => setRoleForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="e.g. ops-lead"
                    className="h-9 rounded-lg font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Description
                </label>
                <Input
                  value={roleForm.description}
                  onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of the role"
                  className="h-9 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Role Level
                </label>
                <select
                  value={roleForm.role}
                  onChange={(e) => setRoleForm((f) => ({ ...f, role: e.target.value }))}
                  className="border-border w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                >
                  <option value="super">Super Admin</option>
                  <option value="manager">Manager</option>
                  <option value="finance">Finance</option>
                  <option value="support">Support</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  Permissions
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PERMISSIONS_LIST.map((p) => (
                    <button
                      key={p}
                      onClick={() => togglePerm(p)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                        roleForm.permissions.includes(p)
                          ? "border-violet-300 bg-violet-50 text-violet-700"
                          : "border-border text-muted-foreground hover:bg-muted/30 bg-white"
                      }`}
                    >
                      <div
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${roleForm.permissions.includes(p) ? "border-violet-500 bg-violet-500" : "border-muted-foreground"}`}
                      >
                        {roleForm.permissions.includes(p) && (
                          <Check className="h-2.5 w-2.5 text-white" />
                        )}
                      </div>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setRoleCreateDialog(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={createRole}
                  disabled={saving}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700"
                >
                  Create Role Preset
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete plan confirmation ── */}
        <Dialog
          open={!!planDeleteId}
          onOpenChange={(v) => {
            if (!v) setPlanDeleteId(null);
          }}
        >
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle>Delete Plan</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground py-2 text-sm">
              Are you sure you want to delete this vendor plan? This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setPlanDeleteId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 rounded-xl"
                onClick={() => {
                  if (planDeleteId) {
                    void deletePlan(planDeleteId);
                    setPlanDeleteId(null);
                  }
                }}
              >
                Delete Plan
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}
