import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PageHeader, StatCard } from "@/components/shared";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAdminReassignRide,
  useApiHealth,
  useBroadcast,
  useLeaderboard,
  usePlatformSettings,
  useRevenueTrend,
  useRiders,
  useRides,
  useStats,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { adminFetch, adminPut } from "@/lib/adminFetcher";
import { formatCurrency, formatDate } from "@/lib/format";
import { createLogger } from "@/lib/logger";
import { useLanguage } from "@/lib/useLanguage";
import { useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  Box,
  Car,
  Database,
  DollarSign,
  Download,
  LayoutDashboard,
  Loader2,
  PackageSearch,
  Pill,
  Radio,
  Search,
  Settings,
  ShoppingBag,
  Star,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "wouter";
const log = createLogger("[dashboard]");

function exportDashboard(
  trend: { date: string; revenue: number }[],
  onError: (msg: string) => void,
  setExporting: (v: boolean) => void
) {
  setExporting(true);
  adminFetch("/fleet/dashboard-export")
    .then((data: any) => {
      const enriched = { ...data, trend: data.trend ?? trend };
      const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    })
    .catch((err: any) => onError(err?.message || "Export failed"))
    .finally(() => setExporting(false));
}

/* Shimmer skeleton block */
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gray-100 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

/* Mini sparkline component — renders null skeleton when data is not yet available */
function Sparkline({ data, color = "#6366F1" }: { data: number[] | null; color?: string }) {
  if (!data) {
    return <div className="h-10 w-20 animate-pulse rounded bg-white/10" />;
  }
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* Clickable hero card wrapper — adds hover lift + cursor */
function HeroCardLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href}>
      <div className={`cursor-pointer transition-transform hover:-translate-y-0.5 ${className}`}>
        {children}
      </div>
    </Link>
  );
}

/* "Updated X min ago" helper */
function updatedAgo(ts: number): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── DB Health Badge ── */
function DbHealthBadge() {
  const { data, isLoading, isError } = useApiHealth();

  if (isLoading) {
    return <div className="h-8 w-28 animate-pulse rounded-xl bg-gray-100" />;
  }

  const dbOk = !isError && data?.db === "ok";
  const latMs = data?.dbQueryMs ?? null;

  const dot = dbOk ? "bg-emerald-500" : "bg-red-500 animate-pulse";
  const label = dbOk ? "DB · Connected" : "DB · Down";
  const badge = dbOk
    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
    : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100";

  return (
    <Link href="/health-dashboard">
      <button
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${badge}`}
        title={`Neon DB status · latency: ${latMs != null ? `${latMs}ms` : "—"}`}
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <Database className="h-3.5 w-3.5" />
        {label}
        {dbOk && latMs != null && <span className="font-mono opacity-60">{latMs}ms</span>}
      </button>
    </Link>
  );
}

/* ── Live Metrics Strip ── */
const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  "order:new": { label: "New Order", color: "bg-green-100 text-green-700 border-green-200" },
  "order:update": { label: "Order Update", color: "bg-blue-100 text-blue-700 border-blue-200" },
  "rider:sos": { label: "Rider SOS", color: "bg-red-100 text-red-700 border-red-200" },
  "ride:dispatch_update": {
    label: "Ride Update",
    color: "bg-violet-100 text-violet-700 border-violet-200",
  },
  "rider:status": {
    label: "Rider Status",
    color: "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
  "rider:offline": {
    label: "Rider Offline",
    color: "bg-slate-100 text-slate-600 border-slate-200",
  },
  "rider:spoof-alert": {
    label: "GPS Spoof",
    color: "bg-orange-100 text-orange-700 border-orange-200",
  },
  "wallet:admin-topup": {
    label: "Wallet Top-up",
    color: "bg-teal-100 text-teal-700 border-teal-200",
  },
  "wallet:deposit-approved": {
    label: "Deposit OK",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
};

function LiveMetricsStrip() {
  const { toast } = useToast();
  const { events, connected, clear } = useActivityFeed();
  const { data: settingsData, refetch: refetchSettings } = usePlatformSettings();
  const settings = (settingsData?.settings ?? []) as Array<{ key: string; value: string }>;
  const getSetting = (key: string) => settings.find((s) => s.key === key)?.value ?? "";

  const sosThreshold = parseInt(getSetting("dashboard_sos_threshold") || "3", 10);
  const pendThreshold = parseInt(getSetting("dashboard_pending_threshold") || "30", 10);

  // Use real DB-backed live stats for threshold comparison (not activity-feed event counts)
  interface AdminStats {
    pendingOrders?: number;
    activeSos?: number;
    failedPayments?: number;
    [key: string]: unknown;
  }
  const { data: liveStats } = useStats();
  const stats = liveStats as AdminStats | undefined;
  const pendingOrders = stats?.pendingOrders ?? 0;
  const activeSos = stats?.activeSos ?? 0;
  const failedPayments = stats?.failedPayments ?? 0;

  const failThreshold = parseInt(getSetting("dashboard_failed_payments_threshold") || "5", 10);

  const sosCnt = activeSos;
  const newOrd = pendingOrders;

  const sosBreached = sosCnt >= sosThreshold;
  const ordBreached = newOrd >= pendThreshold;
  const failBreached = failedPayments >= failThreshold;

  const [editingThresholds, setEditingThresholds] = useState(false);
  const [draftSos, setDraftSos] = useState(String(sosThreshold));
  const [draftOrd, setDraftOrd] = useState(String(pendThreshold));
  const [savingTh, setSavingTh] = useState(false);

  useEffect(() => {
    if (!editingThresholds) {
      setDraftSos(String(sosThreshold));
      setDraftOrd(String(pendThreshold));
    }
  }, [sosThreshold, pendThreshold, editingThresholds]);

  const saveThresholds = async () => {
    setSavingTh(true);
    try {
      await adminPut("/platform-settings", {
        settings: [
          { key: "dashboard_sos_threshold", value: draftSos || "3" },
          { key: "dashboard_pending_threshold", value: draftOrd || "30" },
        ],
      });
      toast({ title: "Thresholds saved", description: "Alert thresholds updated." });
      setEditingThresholds(false);
      void refetchSettings();
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSavingTh(false);
  };

  const last = events.slice(0, 6);

  return (
    <div className="space-y-3">
      {/* Warning banners when thresholds are breached */}
      {sosBreached && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm">
          <Bell className="h-4 w-4 shrink-0 animate-pulse text-red-600" />
          <span className="font-medium text-red-800">
            SOS alert: <strong>{sosCnt}</strong> active unresolved SOS — threshold of {sosThreshold}{" "}
            exceeded. Immediate rider check required.
          </span>
        </div>
      )}
      {ordBreached && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
          <Bell className="h-4 w-4 shrink-0 animate-pulse text-amber-600" />
          <span className="font-medium text-amber-800">
            Order surge: <strong>{newOrd}</strong> pending orders — threshold of {pendThreshold}{" "}
            exceeded. Consider increasing rider capacity.
          </span>
        </div>
      )}
      {failBreached && (
        <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse text-red-600" />
          <span className="font-medium text-red-800">
            Payment failures: <strong>{failedPayments}</strong> orders with failed payment —
            threshold of {failThreshold} exceeded. Review payment gateway.
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[480px] grid-cols-1 gap-4 xl:grid-cols-[1fr_auto]">
          {/* Live events ticker */}
          <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
            <div className="border-border/30 flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-green-500" : "bg-slate-300"}`}
                />
                <span className="text-sm font-bold">Live Events</span>
                {!connected && <span className="text-muted-foreground text-xs">(connecting…)</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {events.length} event{events.length !== 1 ? "s" : ""}
                </span>
                {events.length > 0 && (
                  <button
                    onClick={clear}
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
            </div>
            <div className="flex min-h-[46px] flex-wrap items-center gap-2 px-3 py-2">
              {last.length === 0 ? (
                <span className="text-muted-foreground text-xs">Waiting for events…</span>
              ) : (
                last.map((ev: any, i: number) => {
                  const meta = EVENT_LABELS[ev.type] ?? {
                    label: String(ev.type ?? ev.title ?? "event"),
                    color: "bg-slate-100 text-slate-600 border-slate-200",
                  };
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.color}`}
                    >
                      <Radio className="h-2.5 w-2.5" />
                      {meta.label}
                      {ev.subtitle ? (
                        <span className="font-mono text-[10px] opacity-60">{ev.subtitle}</span>
                      ) : null}
                    </span>
                  );
                })
              )}
            </div>
          </Card>

          {/* Alert threshold indicators + config */}
          <Card className="border-border/50 min-w-[220px] overflow-hidden rounded-2xl shadow-sm">
            <div className="border-border/30 flex items-center justify-between gap-2 border-b px-4 py-3">
              <span className="text-sm font-bold">Alert Thresholds</span>
              <button
                onClick={() => setEditingThresholds((e) => !e)}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
              >
                {editingThresholds ? "Cancel" : "Edit"}
              </button>
            </div>
            <div className="space-y-3 px-4 py-3">
              {/* SOS row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  {sosBreached ? (
                    <Bell className="h-3.5 w-3.5 animate-pulse text-red-500" />
                  ) : (
                    <BellOff className="text-muted-foreground h-3.5 w-3.5" />
                  )}
                  <span className="text-muted-foreground">SOS Events</span>
                </div>
                {editingThresholds ? (
                  <input
                    type="number"
                    min="1"
                    value={draftSos}
                    onChange={(e) => setDraftSos(e.target.value)}
                    className="border-border bg-background focus:ring-ring h-7 w-16 rounded-lg border px-2 text-center text-xs focus:ring-1 focus:outline-none"
                  />
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${sosBreached ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {sosCnt} / {sosThreshold}
                  </span>
                )}
              </div>
              {/* Orders row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  {ordBreached ? (
                    <Bell className="h-3.5 w-3.5 animate-pulse text-amber-500" />
                  ) : (
                    <BellOff className="text-muted-foreground h-3.5 w-3.5" />
                  )}
                  <span className="text-muted-foreground">New Orders</span>
                </div>
                {editingThresholds ? (
                  <input
                    type="number"
                    min="1"
                    value={draftOrd}
                    onChange={(e) => setDraftOrd(e.target.value)}
                    className="border-border bg-background focus:ring-ring h-7 w-16 rounded-lg border px-2 text-center text-xs focus:ring-1 focus:outline-none"
                  />
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${ordBreached ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {newOrd} / {pendThreshold}
                  </span>
                )}
              </div>
              {editingThresholds && (
                <button
                  onClick={() => void saveThresholds()}
                  disabled={savingTh}
                  className="h-7 w-full rounded-lg bg-indigo-600 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                >
                  {savingTh ? "Saving…" : "Save Thresholds"}
                </button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
const SERVICE_SERIES = [
  { key: "mart", label: "Mart", color: "#f97316" },
  { key: "rides", label: "Rides", color: "#6366f1" },
  { key: "pharmacy", label: "Pharmacy", color: "#22c55e" },
  { key: "parcel", label: "Parcel", color: "#a855f7" },
  { key: "van", label: "Van", color: "#14b8a6" },
] as const;

type ServiceKey = (typeof SERVICE_SERIES)[number]["key"];

export default function Dashboard() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const qc = useQueryClient();
  const gradId = useId().replace(/:/g, "rev");
  const [isExporting, setIsExporting] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [assignRiderOpen, setAssignRiderOpen] = useState(false);
  const [assignRideId, setAssignRideId] = useState<string | null>(null);
  const [riderSearch, setRiderSearch] = useState("");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcTarget, setBcTarget] = useState("all");
  const broadcastMut = useBroadcast();

  const [pendingProductsCount, setPendingProductsCount] = useState<number | null>(null);
  useEffect(() => {
    adminFetch("/pending-counts")
      .then((d: { pendingProducts?: number }) => {
        if (typeof d.pendingProducts === "number") setPendingProductsCount(d.pendingProducts);
      })
      .catch((err) => {
        log.warn("[dashboard] Failed to load pending products count:", err);
      });
  }, []);

  const { data: ridesData } = useRides();
  const { data: ridersData } = useRiders();
  const reassignMut = useAdminReassignRide();

  const unassignedRides: any[] = (ridesData?.rides || []).filter(
    (r: any) => !r.riderId && ["searching", "requested", "pending"].includes(r.status)
  );

  const handleAssignRider = useCallback(
    (rider: any) => {
      if (!assignRideId) return;
      reassignMut.mutate(
        {
          id: assignRideId,
          riderId: rider.id,
          riderName: rider.name || rider.phone,
          riderPhone: rider.phone,
        },
        {
          onSuccess: () => {
            setAssignRideId(null);
            setRiderSearch("");
            setAssignRiderOpen(false);
          },
        }
      );
    },
    [assignRideId, reassignMut]
  );

  useEffect(() => {
    const handler = () => {
      setAssignRideId(null);
      setRiderSearch("");
      setAssignRiderOpen(true);
    };
    window.addEventListener("admin:open-assign-rider", handler);
    return () => window.removeEventListener("admin:open-assign-rider", handler);
  }, []);
  const [visibleSeries, setVisibleSeries] = useState<Record<ServiceKey, boolean>>({
    mart: true,
    rides: true,
    pharmacy: true,
    parcel: true,
    van: true,
  });

  const toggleSeries = (key: ServiceKey) =>
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  const { data, isLoading, isFetching, isError: statsError, dataUpdatedAt } = useStats();
  const { data: trendData, isError: trendError } = useRevenueTrend();
  const { data: lbData, isError: lbError } = useLeaderboard();

  const hasError = (statsError || trendError || lbError) && !errorDismissed;

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-stats"] }),
      qc.invalidateQueries({ queryKey: ["admin-revenue-trend"] }),
      qc.invalidateQueries({ queryKey: ["admin-leaderboard"] }),
    ]);
  }, [qc]);

  type TrendDay = {
    date: string;
    revenue: number;
    orderCount?: number;
    rideCount?: number;
    sosCount?: number;
    mart?: number;
    rides?: number;
    pharmacy?: number;
    parcel?: number;
    van?: number;
  };

  const rawTrend: TrendDay[] = Array.isArray(trendData?.trend) ? trendData.trend : [];

  const trend = [...rawTrend].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const revenueSparkData = trendData ? trend.slice(-7).map((t) => t.revenue || 0) : null;
  const ridesSparkData = trendData ? trend.slice(-7).map((t) => t.rideCount ?? 0) : null;
  const ordersSparkData = trendData ? trend.slice(-7).map((t) => t.orderCount ?? 0) : null;
  const sosSparkData = trendData ? trend.slice(-7).map((t) => t.sosCount ?? 0) : null;

  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <SkeletonBlock className="h-8 w-48" />
            <SkeletonBlock className="h-4 w-32" />
          </div>
          <SkeletonBlock className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <SkeletonBlock key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-24" />
          ))}
        </div>
        <SkeletonBlock className="h-56" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="border-border/50 overflow-hidden rounded-2xl border bg-white shadow-sm"
            >
              <div className="border-border/30 border-b px-6 py-4">
                <SkeletonBlock className="h-5 w-36" />
              </div>
              <div className="space-y-3 p-4">
                {[1, 2, 3, 4].map((j) => (
                  <SkeletonBlock key={j} className="h-10" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const vendors = lbData?.vendors || [];
  const riders = lbData?.riders || [];

  const statsData = data as Record<string, unknown> | undefined;
  const activeSosCount = typeof statsData?.activeSos === "number" ? statsData.activeSos : 0;
  const pendingOrders = typeof statsData?.pendingOrders === "number" ? statsData.pendingOrders : 0;
  const activeRides = typeof statsData?.activeRides === "number" ? statsData.activeRides : 0;
  const totalRiders = typeof statsData?.totalRiders === "number" ? statsData.totalRiders : 0;
  const totalVendors = typeof statsData?.totalVendors === "number" ? statsData.totalVendors : 0;

  const lastUpdated = dataUpdatedAt ? updatedAgo(dataUpdatedAt) : "";

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Dashboard page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh onRefresh={handleRefresh} className="space-y-6 sm:space-y-8">
        {hasError && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Some data may be unavailable — one or more requests failed. Try refreshing.
            </span>
            <button onClick={() => setErrorDismissed(true)} className="shrink-0 hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <PageHeader
          icon={LayoutDashboard}
          title={T("overview")}
          subtitle={`${T("welcomeBack")}${lastUpdated ? ` · Updated ${lastUpdated}` : ""}`}
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-600"
          actions={
            <div className="flex items-center gap-2">
              {isFetching && !isLoading && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />
              )}
              <DbHealthBadge />
              <Button
                variant="outline"
                size="sm"
                disabled={isExporting}
                onClick={() =>
                  exportDashboard(
                    trend,
                    (msg) =>
                      toast({ title: "Export failed", description: msg, variant: "destructive" }),
                    setIsExporting
                  )
                }
                className="h-9 shrink-0 gap-2 rounded-xl"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}{" "}
                {T("export")}
              </Button>
            </div>
          }
        />

        {/* ── Live Metrics Strip ── */}
        <LiveMetricsStrip />
        {/* 4 Hero Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Revenue → /transactions */}
          <HeroCardLink href="/transactions">
            <Card className="relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-md">
              <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
              <CardContent className="relative p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                  <Sparkline data={revenueSparkData} color="rgba(255,255,255,0.8)" />
                </div>
                <p className="mb-1 text-xs font-medium text-white/70">Total Revenue</p>
                <h3 className="text-xl font-bold">{formatCurrency(data?.revenue?.total || 0)}</h3>
              </CardContent>
            </Card>
          </HeroCardLink>

          {/* Active Rides → /rides */}
          <HeroCardLink href="/rides">
            <Card className="relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md">
              <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
              <CardContent className="relative p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <Car className="h-5 w-5 text-white" />
                  </div>
                  <Sparkline data={ridesSparkData} color="rgba(255,255,255,0.8)" />
                </div>
                <p className="mb-1 text-xs font-medium text-white/70">Active Rides</p>
                <h3 className="text-xl font-bold">{activeRides.toLocaleString()}</h3>
              </CardContent>
            </Card>
          </HeroCardLink>

          {/* Pending Orders → /orders */}
          <HeroCardLink href="/orders">
            <Card className="relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
              <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
              <CardContent className="relative p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <ShoppingBag className="h-5 w-5 text-white" />
                  </div>
                  <Sparkline data={ordersSparkData} color="rgba(255,255,255,0.8)" />
                </div>
                <p className="mb-1 text-xs font-medium text-white/70">Pending Orders</p>
                <h3 className="text-xl font-bold">{pendingOrders.toLocaleString()}</h3>
              </CardContent>
            </Card>
          </HeroCardLink>

          {/* Active SOS → /sos-alerts */}
          <Link href="/sos-alerts">
            <Card
              className={`relative cursor-pointer overflow-hidden rounded-2xl border-0 shadow-md transition-transform hover:-translate-y-0.5 ${activeSosCount > 0 ? "bg-gradient-to-br from-red-600 to-red-800" : "bg-gradient-to-br from-slate-500 to-slate-700"} text-white`}
            >
              <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
              <CardContent className="relative p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ${activeSosCount > 0 ? "animate-pulse" : ""}`}
                  >
                    <AlertTriangle className="h-5 w-5 text-white" />
                  </div>
                  <Sparkline data={sosSparkData} color="rgba(255,255,255,0.8)" />
                </div>
                <p className="mb-1 text-xs font-medium text-white/70">Active SOS</p>
                <h3 className="text-xl font-bold">{activeSosCount.toLocaleString()}</h3>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Total Riders & Total Vendors */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HeroCardLink href="/riders">
            <Card className="relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-md">
              <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
              <CardContent className="relative p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="mb-1 text-xs font-medium text-white/70">Total Riders</p>
                <h3 className="text-xl font-bold">{totalRiders.toLocaleString()}</h3>
              </CardContent>
            </Card>
          </HeroCardLink>

          <HeroCardLink href="/vendors">
            <Card className="relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-md">
              <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
              <CardContent className="relative p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <ShoppingBag className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="mb-1 text-xs font-medium text-white/70">Total Vendors</p>
                <h3 className="text-xl font-bold">{totalVendors.toLocaleString()}</h3>
              </CardContent>
            </Card>
          </HeroCardLink>
        </div>

        {/* Quick Actions */}
        <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
          <div className="border-border/30 bg-card border-b px-4 py-4 sm:px-6">
            <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
              <Zap className="h-4 w-4 text-amber-500" /> Quick Actions
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">Jump directly to common tasks</p>
          </div>
          <div className="divide-border/30 grid grid-cols-2 gap-0 divide-x divide-y sm:grid-cols-4 lg:grid-cols-4">
            {/* Assign Rider — dispatches a custom event so any part of the app can trigger this */}
            <button
              type="button"
              className="text-left"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("admin:open-assign-rider"));
              }}
            >
              <div className="group flex min-h-[72px] cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-indigo-50">
                <div className="border-border/50 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white shadow-sm transition-shadow group-hover:shadow">
                  <Car className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm leading-tight font-semibold">
                    Assign Rider
                  </p>
                  <p className="text-muted-foreground truncate text-xs">Unassigned rides</p>
                </div>
              </div>
            </button>

            {/* Send Broadcast — opens inline composer */}
            <button
              type="button"
              className="text-left"
              onClick={() => {
                setBcTitle("");
                setBcBody("");
                setBcTarget("all");
                setBroadcastOpen(true);
              }}
            >
              <div className="group flex min-h-[72px] cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-orange-50">
                <div className="border-border/50 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white shadow-sm transition-shadow group-hover:shadow">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm leading-tight font-semibold">
                    Send Broadcast
                  </p>
                  <p className="text-muted-foreground truncate text-xs">Push / SMS / email</p>
                </div>
              </div>
            </button>

            {/* Product Approvals — highlighted when there are pending submissions */}
            <Link href="/products?approvalStatus=pending">
              <div
                className={`group relative flex min-h-[72px] cursor-pointer items-center gap-3 p-4 transition-colors ${pendingProductsCount && pendingProductsCount > 0 ? "bg-violet-50/50 hover:bg-violet-50" : "hover:bg-violet-50"}`}
              >
                {pendingProductsCount != null && pendingProductsCount > 0 && (
                  <span className="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] leading-none font-black text-white">
                    {pendingProductsCount > 99 ? "99+" : pendingProductsCount}
                  </span>
                )}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm transition-shadow group-hover:shadow ${pendingProductsCount && pendingProductsCount > 0 ? "border border-violet-200 bg-violet-100" : "border-border/50 border bg-white"}`}
                >
                  <PackageSearch
                    className={`h-4 w-4 ${pendingProductsCount && pendingProductsCount > 0 ? "text-violet-600" : "text-violet-500"}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm leading-tight font-semibold">
                    Product Approvals
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {pendingProductsCount == null
                      ? "Loading…"
                      : pendingProductsCount === 0
                        ? "All reviewed"
                        : `${pendingProductsCount} awaiting review`}
                  </p>
                </div>
              </div>
            </Link>

            {[
              {
                label: "Approve Deposit",
                sub: "Pending approvals",
                href: "/deposit-requests?status=pending",
                icon: Wallet,
                color: "text-green-600",
                bg: "hover:bg-green-50",
              },
              {
                label: "Review KYC",
                sub: "Awaiting verification",
                href: "/kyc?status=pending",
                icon: Trophy,
                color: "text-teal-600",
                bg: "hover:bg-teal-50",
              },
              {
                label: "Process Withdrawal",
                sub: "Pending payouts",
                href: "/withdrawals?status=pending",
                icon: ArrowRight,
                color: "text-purple-600",
                bg: "hover:bg-purple-50",
              },
              {
                label: "View Live Map",
                sub: "Real-time riders",
                href: "/live-riders-map",
                icon: TrendingUp,
                color: "text-pink-600",
                bg: "hover:bg-pink-50",
              },
            ].map((action) => (
              <Link key={action.href} href={action.href}>
                <div
                  className={`flex cursor-pointer items-center gap-3 p-4 transition-colors ${action.bg} group min-h-[72px]`}
                >
                  <div className="border-border/50 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white shadow-sm transition-shadow group-hover:shadow">
                    <action.icon className={`h-4 w-4 ${action.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm leading-tight font-semibold">
                      {action.label}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{action.sub}</p>
                  </div>
                </div>
              </Link>
            ))}

            {/* Assign Rider — inline panel */}
            {assignRiderOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                onClick={() => {
                  setAssignRiderOpen(false);
                  setAssignRideId(null);
                }}
              >
                <div
                  className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="border-border/40 flex shrink-0 items-center justify-between border-b p-5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
                        <Car className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div>
                        <h2 className="text-foreground text-base leading-tight font-bold">
                          {assignRideId ? "Choose a Rider" : "Assign Rider"}
                        </h2>
                        <p className="text-muted-foreground text-xs">
                          {assignRideId
                            ? "Select a rider to assign to this ride"
                            : `${unassignedRides.length} unassigned ride${unassignedRides.length !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (assignRideId) {
                          setAssignRideId(null);
                          setRiderSearch("");
                        } else {
                          setAssignRiderOpen(false);
                        }
                      }}
                      className="hover:bg-muted flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                    >
                      {assignRideId ? (
                        <ArrowRight className="text-muted-foreground h-4 w-4 rotate-180" />
                      ) : (
                        <X className="text-muted-foreground h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto p-4">
                    {/* Step 1: pick a ride */}
                    {!assignRideId &&
                      (unassignedRides.length === 0 ? (
                        <div className="py-10 text-center">
                          <UserCheck className="text-muted-foreground/30 mx-auto mb-2 h-10 w-10" />
                          <p className="text-muted-foreground text-sm font-medium">
                            No unassigned rides
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            All current rides have riders assigned.
                          </p>
                        </div>
                      ) : (
                        unassignedRides.map((ride: any) => (
                          <button
                            key={ride.id}
                            onClick={() => {
                              setAssignRideId(ride.id);
                              setRiderSearch("");
                            }}
                            className="border-border/50 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                              <Car className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-foreground truncate text-sm font-semibold">
                                {ride.pickupAddress || ride.pickup || "Unknown pickup"}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                → {ride.dropoffAddress || ride.dropoff || "Unknown dropoff"}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-indigo-600">
                              Assign →
                            </span>
                          </button>
                        ))
                      ))}

                    {/* Step 2: pick a rider */}
                    {assignRideId && (
                      <>
                        <div className="relative">
                          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search riders..."
                            value={riderSearch}
                            onChange={(e) => setRiderSearch(e.target.value)}
                            className="border-border/50 bg-muted/30 h-9 w-full rounded-lg border pr-3 pl-9 text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                          />
                        </div>
                        {(ridersData?.users || ridersData?.riders || [])
                          .filter((r: any) => r.isActive && !r.isBanned)
                          .filter((r: any) =>
                            riderSearch
                              ? (r.name || r.phone || "")
                                  .toLowerCase()
                                  .includes(riderSearch.toLowerCase())
                              : true
                          )
                          .slice(0, 10)
                          .map((rider: any) => (
                            <button
                              key={rider.id}
                              onClick={() => handleAssignRider(rider)}
                              disabled={reassignMut.isPending}
                              className="border-border/50 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-green-200 hover:bg-green-50 disabled:opacity-60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
                                {(rider.name || rider.phone || "R")[0].toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-foreground text-sm font-semibold">
                                  {rider.name || rider.phone}
                                </p>
                                {rider.vehiclePlate && (
                                  <p className="text-muted-foreground font-mono text-xs">
                                    {rider.vehiclePlate}
                                  </p>
                                )}
                              </div>
                              {reassignMut.isPending ? (
                                <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
                              ) : (
                                <UserCheck className="h-4 w-4 shrink-0 text-green-600" />
                              )}
                            </button>
                          ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Broadcast Composer — inline modal */}
            {broadcastOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                onClick={() => setBroadcastOpen(false)}
              >
                <div
                  className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="border-border/40 flex shrink-0 items-center justify-between border-b p-5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                      </div>
                      <div>
                        <h2 className="text-foreground text-base leading-tight font-bold">
                          Send Broadcast
                        </h2>
                        <p className="text-muted-foreground text-xs">
                          Push / SMS / email notification
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setBroadcastOpen(false)}
                      className="hover:bg-muted flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                    >
                      <X className="text-muted-foreground h-4 w-4" />
                    </button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!bcTitle.trim() || !bcBody.trim()) return;
                      broadcastMut.mutate(
                        {
                          title: bcTitle.trim(),
                          body: bcBody.trim(),
                          targetRole: bcTarget === "all" ? undefined : bcTarget,
                        },
                        {
                          onSuccess: () => {
                            toast({
                              title: "Broadcast sent",
                              description: `Message sent to ${bcTarget === "all" ? "all users" : bcTarget}`,
                            });
                            setBroadcastOpen(false);
                          },
                          onError: (err: Error) =>
                            toast({
                              title: "Failed to send",
                              description: err.message,
                              variant: "destructive",
                            }),
                        }
                      );
                    }}
                    className="space-y-3 p-5"
                  >
                    <div>
                      <label className="text-muted-foreground mb-1 block text-xs font-semibold">
                        Audience
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {(["all", "customer", "rider", "vendor"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setBcTarget(t)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${bcTarget === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                          >
                            {t === "all"
                              ? "All Users"
                              : t.charAt(0).toUpperCase() + t.slice(1) + "s"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-muted-foreground mb-1 block text-xs font-semibold">
                        Title
                      </label>
                      <input
                        type="text"
                        placeholder="Notification title"
                        value={bcTitle}
                        onChange={(e) => setBcTitle(e.target.value)}
                        required
                        className="border-border/50 bg-muted/30 h-9 w-full rounded-lg border px-3 text-sm focus:ring-2 focus:ring-orange-200 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground mb-1 block text-xs font-semibold">
                        Message
                      </label>
                      <textarea
                        placeholder="Write your message..."
                        value={bcBody}
                        onChange={(e) => setBcBody(e.target.value)}
                        required
                        rows={3}
                        className="border-border/50 bg-muted/30 w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-orange-200 focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 flex-1 rounded-xl"
                        onClick={() => setBroadcastOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="h-9 flex-1 rounded-xl bg-orange-600 hover:bg-orange-700"
                        disabled={broadcastMut.isPending || !bcTitle.trim() || !bcBody.trim()}
                      >
                        {broadcastMut.isPending ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : null}
                        {broadcastMut.isPending ? "Sending…" : "Send"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Revenue Breakdown */}
        <div>
          <h2 className="font-display text-foreground mb-3 text-lg font-bold sm:mb-4 sm:text-xl">
            {T("revenueBreakdown")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            <Card className="from-primary shadow-primary/20 col-span-2 rounded-2xl border-none bg-gradient-to-br to-blue-700 text-white shadow-lg sm:col-span-3 lg:col-span-1">
              <CardContent className="p-4 sm:p-6">
                <p className="mb-1 flex items-center gap-2 text-xs font-medium text-white/80 sm:mb-2 sm:text-sm">
                  <TrendingUp className="h-4 w-4" /> {T("revenueBreakdown")}
                </p>
                <p className="text-xs text-white/70">across all services</p>
              </CardContent>
            </Card>
            <StatCard
              icon={ShoppingBag}
              label="Mart & Food"
              value={formatCurrency(data?.revenue?.orders || 0)}
              iconBgClass="bg-orange-100"
              iconColorClass="text-orange-600"
            />
            <StatCard
              icon={Car}
              label={T("ride")}
              value={formatCurrency(data?.revenue?.rides || 0)}
              iconBgClass="bg-blue-100"
              iconColorClass="text-blue-600"
            />
            <StatCard
              icon={Pill}
              label={T("pharmacy")}
              value={formatCurrency(data?.revenue?.pharmacy || 0)}
              iconBgClass="bg-green-100"
              iconColorClass="text-green-600"
            />
            <StatCard
              icon={Box}
              label={T("parcel")}
              value={formatCurrency(data?.revenue?.parcel || 0)}
              iconBgClass="bg-purple-100"
              iconColorClass="text-purple-600"
            />
            <StatCard
              icon={Car}
              label="Van"
              value={formatCurrency(data?.revenue?.van || 0)}
              iconBgClass="bg-teal-100"
              iconColorClass="text-teal-600"
            />
          </div>
        </div>

        {/* 7-Day Revenue Trend chart */}
        <Card className="border-border/50 rounded-2xl p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
              <TrendingUp className="h-4 w-4 text-indigo-500" /> 7-Day Revenue Trend
            </h2>
            {/* Series toggle legend */}
            {trend.length > 0 &&
              trend.some((d) =>
                SERVICE_SERIES.some((s) => s.key in d && typeof d[s.key] === "number")
              ) && (
                <div className="flex flex-wrap gap-2">
                  {SERVICE_SERIES.map((s) => (
                    <button
                      key={s.key}
                      role="checkbox"
                      aria-checked={visibleSeries[s.key]}
                      aria-label={`Toggle ${s.label} series`}
                      onClick={() => toggleSeries(s.key)}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                        visibleSeries[s.key]
                          ? "border-transparent text-white"
                          : "border-border text-muted-foreground bg-transparent"
                      }`}
                      style={visibleSeries[s.key] ? { backgroundColor: s.color } : {}}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: visibleSeries[s.key] ? "rgba(255,255,255,0.8)" : s.color,
                        }}
                      />
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
          </div>
          {trend.length === 0 ? (
            <div className="text-muted-foreground flex h-52 items-center justify-center text-sm">
              No trend data available
            </div>
          ) : trend.some((d) =>
              SERVICE_SERIES.some((s) => s.key in d && typeof d[s.key] === "number")
            ) ? (
            /* Multi-series chart when per-service data is present */
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    {SERVICE_SERIES.map((s) => (
                      <linearGradient
                        key={s.key}
                        id={`${gradId}-${s.key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(d) => {
                      const dt = new Date(d);
                      return dt.toString() === "Invalid Date"
                        ? ""
                        : dt.toLocaleDateString("en-US", { weekday: "short" });
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      fontSize: "12px",
                      border: "1px solid hsl(var(--border))",
                    }}
                    formatter={(v: number, name: string) => [
                      `Rs. ${Math.round(v).toLocaleString()}`,
                      name.charAt(0).toUpperCase() + name.slice(1),
                    ]}
                    labelFormatter={(l) => {
                      const dt = new Date(l);
                      return dt.toString() === "Invalid Date"
                        ? ""
                        : dt.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          });
                    }}
                  />
                  {SERVICE_SERIES.map((s) =>
                    visibleSeries[s.key] ? (
                      <Area
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={2}
                        fill={`url(#${gradId}-${s.key})`}
                        dot={false}
                        activeDot={{ r: 4, fill: s.color }}
                      />
                    ) : null
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            /* Fallback: single total line when per-service data is absent */
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(d) => {
                      const dt = new Date(d);
                      return dt.toString() === "Invalid Date"
                        ? ""
                        : dt.toLocaleDateString("en-US", { weekday: "short" });
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      fontSize: "12px",
                      border: "1px solid hsl(var(--border))",
                    }}
                    formatter={(v: number) => [
                      `Rs. ${Math.round(v).toLocaleString()}`,
                      T("revenue"),
                    ]}
                    labelFormatter={(l) => {
                      const dt = new Date(l);
                      return dt.toString() === "Invalid Date"
                        ? ""
                        : dt.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          });
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6366F1"
                    strokeWidth={2}
                    fill={`url(#${gradId})`}
                    dot={{ fill: "#6366F1", r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Leaderboards */}
        <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2">
          {/* Top Vendors */}
          <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
            <div className="border-border/30 bg-card flex items-center justify-between border-b px-4 py-4 sm:px-6">
              <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
                <Trophy className="h-4 w-4 text-amber-500" /> {T("topVendors")}
              </h2>
              <Link
                href="/vendors"
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline sm:text-sm"
              >
                {T("viewAll")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div>
              {!vendors.length ? (
                <div className="text-muted-foreground p-8 text-center text-sm">
                  {T("noVendorData")}
                </div>
              ) : (
                vendors.slice(0, 5).map((v: any, idx: number) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-indigo-50/50 sm:px-6 sm:py-4"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {v.name || v.phone || "Unknown Vendor"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {v.totalOrders ?? 0} {T("myOrders").toLowerCase()}
                      </p>
                    </div>
                    <p className="text-foreground shrink-0 text-sm font-bold">
                      {formatCurrency(v.totalRevenue)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Top Riders */}
          <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
            <div className="border-border/30 bg-card flex items-center justify-between border-b px-4 py-4 sm:px-6">
              <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
                <Star className="h-4 w-4 text-emerald-600" /> {T("topRiders")}
              </h2>
              <Link
                href="/riders"
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline sm:text-sm"
              >
                {T("viewAll")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div>
              {!riders.length ? (
                <div className="text-muted-foreground p-8 text-center text-sm">
                  {T("noRiderData")}
                </div>
              ) : (
                riders.slice(0, 5).map((r: any, idx: number) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-indigo-50/50 sm:px-6 sm:py-4"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {r.name || r.phone || "Unknown Rider"}
                      </p>
                      <p className="text-muted-foreground text-xs">{r.completedTrips ?? 0} trips</p>
                    </div>
                    <p className="text-foreground shrink-0 text-sm font-bold">
                      {formatCurrency(r.totalEarned)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Live Activity Feed */}
        <ActivityFeed maxVisible={12} />

        {/* Recent Activity */}
        <div className="grid grid-cols-1 gap-5 sm:gap-8 lg:grid-cols-2">
          {/* Recent Orders */}
          <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
            <div className="border-border/30 bg-card flex items-center justify-between border-b px-4 py-4 sm:px-6">
              <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
                <ShoppingBag className="h-4 w-4 text-indigo-600" /> {T("recentOrders")}
              </h2>
              <Link
                href="/orders"
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline sm:text-sm"
              >
                {T("viewAll")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div>
              {!data?.recentOrders?.length ? (
                <div className="text-muted-foreground p-8 text-center text-sm">
                  {T("noRecentOrders")}
                </div>
              ) : (
                data.recentOrders.slice(0, 5).map((order: any) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-indigo-50/40 sm:px-6 sm:py-4"
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          #{String(order.id).slice(-6).toUpperCase()}
                        </span>
                        <span className="text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize">
                          {order.type}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="mb-1 text-sm font-bold">{formatCurrency(order.total)}</p>
                      <StatusPill status={order.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Recent Rides */}
          <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
            <div className="border-border/30 bg-card flex items-center justify-between border-b px-4 py-4 sm:px-6">
              <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
                <Car className="h-4 w-4 text-emerald-600" /> {T("recentRides")}
              </h2>
              <Link
                href="/rides"
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline sm:text-sm"
              >
                {T("viewAll")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div>
              {!data?.recentRides?.length ? (
                <div className="text-muted-foreground p-8 text-center text-sm">
                  {T("noRecentRides")}
                </div>
              ) : (
                data.recentRides.slice(0, 5).map((ride: any) => (
                  <div
                    key={ride.id}
                    className="flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-indigo-50/40 sm:px-6 sm:py-4"
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          #{String(ride.id).slice(-6).toUpperCase()}
                        </span>
                        <span className="text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize">
                          {ride.type}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {formatDate(ride.createdAt)}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="mb-1 text-sm font-bold">{formatCurrency(ride.fare)}</p>
                      <StatusPill status={ride.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Quick Links on Mobile */}
        <div className="lg:hidden">
          <h2 className="mb-3 text-base font-bold">{T("quickAccess")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: T("pharmacy"),
                href: "/pharmacy",
                icon: Pill,
                color: "text-pink-600",
                bg: "bg-pink-50 border-pink-200",
              },
              {
                label: T("parcel"),
                href: "/parcel",
                icon: Box,
                color: "text-orange-600",
                bg: "bg-orange-50 border-orange-200",
              },
              {
                label: T("transactions"),
                href: "/transactions",
                icon: Wallet,
                color: "text-sky-600",
                bg: "bg-sky-50 border-sky-200",
              },
              {
                label: T("settings"),
                href: "/settings",
                icon: Settings,
                color: "text-gray-600",
                bg: "bg-gray-50 border-gray-200",
              },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-transform active:scale-95 ${item.bg}`}
                >
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                  <span className={`text-sm font-semibold ${item.color}`}>{item.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </PullToRefresh>
    </ErrorBoundary>
  );
}

/* Rounded pill status badge */
function StatusPill({ status }: { status: string }) {
  const s = status?.toLowerCase() || "";
  let cls = "bg-gray-100 text-gray-600";
  if (s === "completed" || s === "delivered") cls = "bg-emerald-100 text-emerald-700";
  else if (s === "cancelled" || s === "rejected") cls = "bg-red-100 text-red-600";
  else if (s === "pending") cls = "bg-amber-100 text-amber-700";
  else if (s === "in_transit" || s === "accepted" || s === "active")
    cls = "bg-indigo-100 text-indigo-700";
  else if (s === "searching" || s === "bargaining") cls = "bg-blue-100 text-blue-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}
    >
      {(status ?? "").replace(/_/g, " ")}
    </span>
  );
}
