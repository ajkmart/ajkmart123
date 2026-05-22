import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { useDiagnostics, useHealthDashboard, useUnlockAdminIpLockout } from "@/hooks/use-admin";
import { adminAbsoluteFetch, adminFetch } from "@/lib/adminFetcher";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Gauge,
  HardDrive,
  Info,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  LockOpen,
  Mail,
  MemoryStick,
  MessageSquare,
  Navigation,
  Package,
  Radio,
  RefreshCw,
  Repeat,
  Satellite,
  Server,
  Shield,
  ShieldCheck,
  Slack,
  Terminal,
  Timer,
  ToggleLeft,
  ToggleRight,
  UserX,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";

/* ── helpers ── */
function updatedAgo(ts: string | undefined): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  return `${m}m ago`;
}

/* ── sub-components ── */
function StatusDot({ ok, warning }: { ok: boolean; warning?: boolean }) {
  const color = ok ? "bg-emerald-500" : warning ? "bg-amber-500" : "bg-red-500";
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${color} ${ok ? "" : "animate-pulse"}`} />
  );
}

function Pill({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
      <ToggleRight size={12} /> ON
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
      <ToggleLeft size={12} /> OFF
    </span>
  );
}

function IssueRow({ level, message }: { level: "error" | "warning" | "info"; message: string }) {
  const cfg = {
    error: {
      icon: AlertTriangle,
      bg: "bg-red-500/10 border-red-500/30",
      text: "text-red-400",
      label: "Error",
    },
    warning: {
      icon: AlertTriangle,
      bg: "bg-amber-500/10 border-amber-500/30",
      text: "text-amber-400",
      label: "Warning",
    },
    info: {
      icon: Info,
      bg: "bg-blue-500/10 border-blue-500/30",
      text: "text-blue-400",
      label: "Info",
    },
  }[level];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cfg.bg}`}>
      <Icon size={16} className={`${cfg.text} mt-0.5 shrink-0`} />
      <p className="text-sm leading-snug text-slate-300">{message}</p>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-700/50 bg-slate-800/60">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Icon size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-700/40 py-2.5 last:border-0">
      <div>
        <span className="text-sm text-slate-400">{label}</span>
        {hint && <p className="mt-0.5 text-xs text-slate-600">{hint}</p>}
      </div>
      <div className="text-sm font-medium text-slate-200">{value}</div>
    </div>
  );
}

const FEATURE_META: Record<string, { label: string; defaultOn: boolean }> = {
  mart: { label: "Mart / Shopping", defaultOn: true },
  food: { label: "Food Delivery", defaultOn: true },
  rides: { label: "Ride Hailing", defaultOn: true },
  pharmacy: { label: "Pharmacy", defaultOn: true },
  parcel: { label: "Parcel Delivery", defaultOn: true },
  van: { label: "Van / Inter-city", defaultOn: true },
  wallet: { label: "Wallet", defaultOn: true },
  referral: { label: "Referral Program", defaultOn: true },
  newUsers: { label: "New Registrations", defaultOn: true },
  chat: { label: "In-app Chat", defaultOn: false },
  liveTracking: { label: "Live GPS Tracking", defaultOn: true },
  reviews: { label: "Reviews & Ratings", defaultOn: true },
  sos: { label: "SOS Alerts", defaultOn: true },
  weather: { label: "Weather Widget", defaultOn: true },
};

/* ── skeleton ── */
function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-slate-700/40 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

/* ── alert channel status badge ── */
function ChannelBadge({ configured, label }: { configured: boolean; label: string }) {
  return configured ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
      <CheckCircle2 size={11} /> {label} connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/40 bg-slate-700/60 px-2.5 py-1 text-xs font-medium text-slate-500">
      {label} not configured
    </span>
  );
}

/* ── System Check card ── */
type CheckStatus = "ok" | "warning" | "error" | "not_configured" | "loading";

function CheckCard({
  icon: Icon,
  label,
  status,
  detail,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  status: CheckStatus;
  detail?: string;
  sub?: string;
}) {
  const cfg: Record<
    CheckStatus,
    { border: string; bg: string; dot: string; badge: string; text: string; label: string }
  > = {
    ok: {
      border: "border-emerald-500/25",
      bg: "bg-emerald-500/5",
      dot: "bg-emerald-500",
      badge: "bg-emerald-500/15 text-emerald-400",
      text: "text-emerald-400",
      label: "OK",
    },
    warning: {
      border: "border-amber-500/25",
      bg: "bg-amber-500/5",
      dot: "bg-amber-400 animate-pulse",
      badge: "bg-amber-500/15 text-amber-400",
      text: "text-amber-400",
      label: "Degraded",
    },
    error: {
      border: "border-red-500/25",
      bg: "bg-red-500/5",
      dot: "bg-red-500 animate-pulse",
      badge: "bg-red-500/15 text-red-400",
      text: "text-red-400",
      label: "Error",
    },
    not_configured: {
      border: "border-slate-700/40",
      bg: "bg-slate-800/30",
      dot: "bg-slate-600",
      badge: "bg-slate-700/60 text-slate-500",
      text: "text-slate-500",
      label: "Not set up",
    },
    loading: {
      border: "border-slate-700/40",
      bg: "bg-slate-800/30",
      dot: "bg-slate-700 animate-pulse",
      badge: "bg-slate-700/60 text-slate-500",
      text: "text-slate-500",
      label: "—",
    },
  };
  const c = cfg[status];
  return (
    <div className={`flex items-start justify-between rounded-xl border p-4 ${c.border} ${c.bg}`}>
      <div className="flex min-w-0 items-start gap-3">
        <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={13} className="shrink-0 text-slate-400" />
            <span className="text-sm font-medium text-slate-200">{label}</span>
          </div>
          {detail && <p className={`mt-0.5 font-mono text-xs ${c.text}`}>{detail}</p>}
          {sub && <p className="mt-0.5 text-xs text-slate-600">{sub}</p>}
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.badge}`}>
        {status === "loading" ? "…" : c.label}
      </span>
    </div>
  );
}

/* ── SystemChecksSection ── */
function SystemChecksSection() {
  const qc = useQueryClient();

  const { data: healthRaw, isLoading: healthLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["public-health-check"],
    queryFn: async () => {
      const t0 = Date.now();
      const d = (await adminAbsoluteFetch("/api/health")) as Record<string, unknown>;
      return { ...(d ?? {}), _apiMs: Date.now() - t0 };
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data: activeUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["stats-active-users"],
    queryFn: () => adminFetch("/stats/active-users") as Promise<{ online: number; total: number }>,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data: socketData, isLoading: socketLoading } = useQuery({
    queryKey: ["stats-socket-connections"],
    queryFn: () => adminFetch("/stats/socket-connections") as Promise<{ connected: number }>,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data: storageData, isLoading: storageLoading } = useQuery({
    queryKey: ["stats-storage"],
    queryFn: () =>
      adminFetch("/stats/storage") as Promise<{
        status: string;
        usedPct: number | null;
        freeGb: number | null;
        usedGb: number | null;
      }>,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ["stats-queue"],
    queryFn: () => adminFetch("/stats/queue") as Promise<{ pending: number; status: string }>,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const checks = (
    healthRaw as { checks?: Record<string, { status: string; latencyMs?: number }> } | undefined
  )?.checks;
  const apiMs = (healthRaw as { _apiMs?: number } | undefined)?._apiMs ?? null;

  const dbStatus: CheckStatus = healthLoading
    ? "loading"
    : checks?.database?.status === "ok"
      ? "ok"
      : checks?.database?.status
        ? "error"
        : "error";
  const apiStatus: CheckStatus = healthLoading
    ? "loading"
    : apiMs == null
      ? "error"
      : apiMs < 500
        ? "ok"
        : apiMs < 1500
          ? "warning"
          : "error";
  const smtpStatus: CheckStatus = healthLoading
    ? "loading"
    : (checks?.smtp as { status?: string } | undefined)?.status === "ok"
      ? "ok"
      : (checks?.smtp as { status?: string } | undefined)?.status === "not_configured"
        ? "not_configured"
        : "not_configured";
  const smsStatus: CheckStatus = healthLoading
    ? "loading"
    : (checks?.sms as { status?: string } | undefined)?.status === "ok"
      ? "ok"
      : "not_configured";

  const usersStatus: CheckStatus = usersLoading ? "loading" : activeUsers != null ? "ok" : "error";
  const socketStatus: CheckStatus = socketLoading ? "loading" : socketData != null ? "ok" : "error";

  const storagePct = storageData?.usedPct ?? null;
  const storageStatus: CheckStatus = storageLoading
    ? "loading"
    : storagePct == null
      ? "not_configured"
      : storagePct > 90
        ? "error"
        : storagePct > 80
          ? "warning"
          : "ok";

  const queuePending = queueData?.pending ?? null;
  const queueStatus: CheckStatus = queueLoading
    ? "loading"
    : queuePending == null
      ? "error"
      : queuePending > 500
        ? "warning"
        : "ok";

  const handleRefreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["public-health-check"] });
    void qc.invalidateQueries({ queryKey: ["stats-active-users"] });
    void qc.invalidateQueries({ queryKey: ["stats-socket-connections"] });
    void qc.invalidateQueries({ queryKey: ["stats-storage"] });
    void qc.invalidateQueries({ queryKey: ["stats-queue"] });
  };

  const allOk = [dbStatus, apiStatus, usersStatus, socketStatus, storageStatus, queueStatus].every(
    (s) => s === "ok" || s === "not_configured"
  );

  return (
    <Section title="System Checks" icon={ListChecks}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          {allOk && !healthLoading && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={11} /> All systems operational
            </span>
          )}
        </div>
        <button
          onClick={handleRefreshAll}
          className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          <RefreshCw size={11} />
          Refresh all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CheckCard
          icon={Database}
          label="Database Connection"
          status={dbStatus}
          detail={
            checks?.database?.latencyMs != null
              ? `${checks.database.latencyMs}ms latency`
              : undefined
          }
          sub="PostgreSQL primary"
        />
        <CheckCard
          icon={Gauge}
          label="API Response Time"
          status={apiStatus}
          detail={apiMs != null ? `${apiMs}ms` : undefined}
          sub="GET /api/health round-trip"
        />
        <CheckCard
          icon={Users}
          label="Active Users (Online)"
          status={usersStatus}
          detail={
            activeUsers != null
              ? `${activeUsers.online} online / ${activeUsers.total} total`
              : undefined
          }
          sub="Users with isOnline = true"
        />
        <CheckCard
          icon={Radio}
          label="Socket.IO Connections"
          status={socketStatus}
          detail={socketData != null ? `${socketData.connected} connected` : undefined}
          sub="Real-time clients"
        />
        <CheckCard
          icon={HardDrive}
          label="Storage Usage"
          status={storageStatus}
          detail={
            storageData?.usedGb != null && storageData.freeGb != null
              ? `${storageData.usedGb} GB used · ${storageData.freeGb} GB free${storagePct != null ? ` (${storagePct}%)` : ""}`
              : storagePct != null
                ? `${storagePct}% used`
                : undefined
          }
          sub="Disk filesystem"
        />
        <CheckCard
          icon={Mail}
          label="Email / SMS Gateway"
          status={
            smtpStatus === "ok" || smsStatus === "ok"
              ? "ok"
              : smtpStatus === "not_configured" && smsStatus === "not_configured"
                ? "not_configured"
                : "warning"
          }
          detail={
            [smtpStatus === "ok" ? "SMTP ✓" : null, smsStatus === "ok" ? "SMS ✓" : null]
              .filter(Boolean)
              .join(" · ") || "No gateway configured"
          }
          sub="Notification providers"
        />
        <CheckCard
          icon={Package}
          label="Pending Queue Jobs"
          status={queueStatus}
          detail={queuePending != null ? `${queuePending} pending notifications` : undefined}
          sub="Unread notification queue"
        />
      </div>
    </Section>
  );
}

/* ── SchemaDriftSection ── */
function SchemaDriftSection() {
  const { data: drift, isLoading } = useQuery({
    queryKey: ["schema-drift"],
    queryFn: () =>
      adminAbsoluteFetch("/api/health/schema-drift") as Promise<{
        ok?: boolean;
        status?: string;
        missingTables?: string[];
        extraColumns?: { table: string; columns: string[] }[];
        missingColumns?: { table: string; columns: string[] }[];
      }>,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const hasDrift =
    (drift?.missingTables?.length ?? 0) > 0 || (drift?.missingColumns?.length ?? 0) > 0;
  const isOk = drift?.ok !== false && !hasDrift;

  return (
    <Section title="Schema Drift" icon={Layers}>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <SkeletonBlock key={i} className="h-9" />
          ))}
        </div>
      ) : !drift ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-800/40 px-4 py-3">
          <Info size={14} className="text-slate-500" />
          <span className="text-sm text-slate-500">Schema drift check unavailable</span>
        </div>
      ) : isOk ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span className="text-sm text-emerald-300">
            Schema is in sync — all tables and columns match Drizzle definitions
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="text-sm text-amber-300">
              Schema drift detected — run migration to fix
            </span>
          </div>

          {(drift.missingTables?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-red-400 uppercase">
                Missing Tables
              </p>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                {drift.missingTables!.map((t) => (
                  <p key={t} className="font-mono text-xs text-red-300">
                    {t}
                  </p>
                ))}
              </div>
            </div>
          )}

          {(drift.missingColumns?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-amber-400 uppercase">
                Missing Columns
              </p>
              <div className="space-y-1">
                {drift.missingColumns!.map((entry) => (
                  <div
                    key={entry.table}
                    className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-amber-300">{entry.table}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      {entry.columns.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-700/40 pt-3">
            <p className="text-xs text-slate-600">
              Run{" "}
              <code className="rounded bg-slate-800 px-1 text-slate-400">
                pnpm -F db push-force
              </code>{" "}
              to apply schema changes, then reload this page.
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

/* ── main page ── */
export default function HealthDashboard() {
  const qc = useQueryClient();
  const { data: raw, isLoading, isFetching, dataUpdatedAt } = useHealthDashboard();

  const handleRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["admin-health-dashboard"] });
    void qc.invalidateQueries({ queryKey: ["public-health-check"] });
    void qc.invalidateQueries({ queryKey: ["stats-active-users"] });
    void qc.invalidateQueries({ queryKey: ["stats-socket-connections"] });
    void qc.invalidateQueries({ queryKey: ["stats-storage"] });
    void qc.invalidateQueries({ queryKey: ["stats-queue"] });
    void qc.invalidateQueries({ queryKey: ["schema-drift"] });
    void qc.invalidateQueries({ queryKey: ["admin-diagnostics"] });
  }, [qc]);

  /* auto-refresh every 30 seconds */
  useEffect(() => {
    const id = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["admin-health-dashboard"] });
      void qc.invalidateQueries({ queryKey: ["public-health-check"] });
      void qc.invalidateQueries({ queryKey: ["stats-active-users"] });
      void qc.invalidateQueries({ queryKey: ["stats-socket-connections"] });
      void qc.invalidateQueries({ queryKey: ["stats-storage"] });
      void qc.invalidateQueries({ queryKey: ["stats-queue"] });
    }, 30_000);
    return () => clearInterval(id);
  }, [qc]);

  interface HealthIssue {
    level: "error" | "warning" | string;
    message?: string;
    code?: string;
  }
  interface HealthData {
    issues?: HealthIssue[];
    maintenanceMode?: boolean;
    features?: Record<string, boolean>;
    server?: { db?: string; uptimeFormatted?: string; memoryMb?: number; nodeVersion?: string };
    gps?: {
      liveTrackingEnabled?: boolean;
      ridersInLiveTable?: number;
      ridersWithRecentPing?: number;
      staleRiders?: number;
      spoofDetectionEnabled?: boolean;
      maxSpeedKmh?: number;
    };
    moderation?: {
      customPatternsCount?: number;
      customPatternsValid?: boolean;
      flagKeywordsCount?: number;
      hidePhone?: boolean;
      hideEmail?: boolean;
      hideCnic?: boolean;
      hideBank?: boolean;
      hideAddress?: boolean;
    };
    alertConfig?: {
      monitorEnabled?: boolean;
      intervalMin?: number;
      snoozeMin?: number;
      emailConfigured?: boolean;
      alertEmail?: string;
      slackConfigured?: boolean;
    };
  }
  const d = raw as HealthData | undefined;
  const hasIssues = (d?.issues?.length ?? 0) > 0;
  const errorCount = (d?.issues ?? []).filter((i) => i.level === "error").length;
  const warnCount = (d?.issues ?? []).filter((i) => i.level === "warning").length;
  const alertCfg = d?.alertConfig;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Health Dashboard page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6 pb-10">
        <PageHeader
          title="Health Dashboard"
          subtitle="Real-time status of GPS tracking, content moderation rules, and service feature flags"
          icon={Activity}
          actions={
            <div className="flex items-center gap-3">
              <LastUpdated
                dataUpdatedAt={dataUpdatedAt}
                onRefresh={handleRefresh}
                isRefreshing={isFetching}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isFetching}
                className="gap-2 border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Issues banner */}
        {!isLoading && hasIssues && (
          <div className="space-y-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              <span className="text-sm font-semibold text-red-300">
                {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : ""}
                {errorCount > 0 && warnCount > 0 ? " · " : ""}
                {warnCount > 0 ? `${warnCount} warning${warnCount > 1 ? "s" : ""}` : ""} detected —
                review below
              </span>
            </div>
            {(d?.issues ?? []).map((issue: any, idx: number) => (
              <IssueRow key={idx} level={issue.level} message={issue.message} />
            ))}
          </div>
        )}

        {!isLoading && !hasIssues && d && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">
              All systems healthy — no issues detected
            </span>
          </div>
        )}

        {/* ── 7 System Check Cards ── */}
        <SystemChecksSection />

        {/* ── Schema Drift Detection ── */}
        <SchemaDriftSection />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* ── Server Health ── */}
          <Section title="Server" icon={Server}>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <SkeletonBlock key={i} className="h-9" />
                ))}
              </div>
            ) : (
              <div>
                <StatRow
                  label="Status"
                  value={
                    <span className="flex items-center gap-2">
                      <StatusDot ok={true} />
                      <span className="text-emerald-400">Running</span>
                    </span>
                  }
                />
                <StatRow
                  label="Database"
                  value={
                    <span className="flex items-center gap-2">
                      <StatusDot ok={d?.server?.db === "ok"} />
                      <span
                        className={d?.server?.db === "ok" ? "text-emerald-400" : "text-red-400"}
                      >
                        {d?.server?.db === "ok" ? "Connected" : "Error"}
                      </span>
                    </span>
                  }
                />
                <StatRow
                  label="Uptime"
                  value={
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} className="text-slate-500" />
                      {d?.server?.uptimeFormatted ?? "—"}
                    </span>
                  }
                />
                <StatRow
                  label="Memory usage"
                  value={
                    <span className="flex items-center gap-1.5">
                      <Cpu size={13} className="text-slate-500" />
                      {d?.server?.memoryMb != null ? `${d.server.memoryMb} MB` : "—"}
                    </span>
                  }
                />
                <StatRow label="Node.js" value={d?.server?.nodeVersion ?? "—"} />
              </div>
            )}
          </Section>

          {/* ── GPS Tracking ── */}
          <Section title="GPS Tracking" icon={Satellite}>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <SkeletonBlock key={i} className="h-9" />
                ))}
              </div>
            ) : (
              <div>
                <StatRow
                  label="Live tracking feature"
                  value={<Pill on={d?.gps?.liveTrackingEnabled ?? true} />}
                />
                <StatRow
                  label="Riders in live table"
                  value={
                    <span className="flex items-center gap-1.5">
                      <Navigation size={13} className="text-slate-500" />
                      {d?.gps?.ridersInLiveTable ?? 0}
                    </span>
                  }
                  hint="Riders currently marked online"
                />
                <StatRow
                  label="Active pings (last 5 min)"
                  value={
                    <span className={`flex items-center gap-2`}>
                      <StatusDot
                        ok={
                          (d?.gps?.ridersWithRecentPing ?? 0) >= (d?.gps?.ridersInLiveTable ?? 0) ||
                          d?.gps?.ridersInLiveTable === 0
                        }
                        warning={(d?.gps?.staleRiders ?? 0) > 0}
                      />
                      {d?.gps?.ridersWithRecentPing ?? 0}
                      {(d?.gps?.staleRiders ?? 0) > 0 && (
                        <span className="text-xs text-amber-400">
                          ({d?.gps?.staleRiders} stale)
                        </span>
                      )}
                    </span>
                  }
                />
                <StatRow
                  label="GPS spoof detection"
                  value={<Pill on={d?.gps?.spoofDetectionEnabled ?? true} />}
                />
                <StatRow
                  label="Max allowed speed"
                  value={`${d?.gps?.maxSpeedKmh ?? 150} km/h`}
                  hint="Pings exceeding this trigger spoof alert"
                />
              </div>
            )}
            {!isLoading && (
              <div className="mt-3 border-t border-slate-700/40 pt-3">
                <Link href="/live-riders-map">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-0 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Open live riders map →
                  </Button>
                </Link>
              </div>
            )}
          </Section>

          {/* ── Content Moderation ── */}
          <Section title="Content Moderation" icon={ShieldCheck}>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <SkeletonBlock key={i} className="h-9" />
                ))}
              </div>
            ) : (
              <div>
                <StatRow
                  label="Custom regex patterns"
                  value={
                    <span className="flex items-center gap-2">
                      {(d?.moderation?.customPatternsCount ?? 0) > 0 ||
                      d?.moderation?.customPatternsValid === false ? (
                        <StatusDot ok={d?.moderation?.customPatternsValid !== false} />
                      ) : null}
                      {d?.moderation?.customPatternsCount ?? 0} loaded
                      {d?.moderation?.customPatternsValid === false && (
                        <Badge variant="destructive" className="text-xs">
                          Malformed JSON
                        </Badge>
                      )}
                    </span>
                  }
                  hint="Admin-configured regex rules for chat/messages"
                />
                <StatRow
                  label="Flag keywords"
                  value={
                    <span className="flex items-center gap-1.5">
                      <MessageSquare size={13} className="text-slate-500" />
                      {d?.moderation?.flagKeywordsCount ?? 0} words
                    </span>
                  }
                />
                <StatRow
                  label="Mask phone numbers"
                  value={
                    <span className="flex items-center gap-1.5">
                      {d?.moderation?.hidePhone ? (
                        <Eye size={13} className="text-emerald-500" />
                      ) : (
                        <EyeOff size={13} className="text-red-500" />
                      )}
                      <Pill on={d?.moderation?.hidePhone ?? true} />
                    </span>
                  }
                />
                <StatRow
                  label="Mask email addresses"
                  value={<Pill on={d?.moderation?.hideEmail ?? true} />}
                />
                <StatRow
                  label="Mask CNIC numbers"
                  value={<Pill on={d?.moderation?.hideCnic ?? true} />}
                />
                <StatRow
                  label="Mask bank accounts"
                  value={<Pill on={d?.moderation?.hideBank ?? true} />}
                />
                <StatRow
                  label="Mask addresses"
                  value={<Pill on={d?.moderation?.hideAddress ?? false} />}
                />
              </div>
            )}
            {!isLoading && (
              <div className="mt-3 border-t border-slate-700/40 pt-3">
                <Link href="/settings/moderation">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-0 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Edit moderation settings →
                  </Button>
                </Link>
              </div>
            )}
          </Section>

          {/* ── Feature Flags ── */}
          <Section title="Service Feature Flags" icon={Zap}>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(14)].map((_, i) => (
                  <SkeletonBlock key={i} className="h-10" />
                ))}
              </div>
            ) : (
              <>
                {d?.maintenanceMode && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                    <span className="text-xs text-amber-300">
                      Maintenance mode is active — app is inaccessible to customers
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-0">
                  {Object.entries(d?.features ?? {}).map(([key, enabled]) => {
                    const meta = FEATURE_META[key] ?? { label: key, defaultOn: true };
                    const isOn = enabled as boolean;
                    const isUnexpectedlyOff = meta.defaultOn && !isOn;
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between border-b border-slate-700/30 px-0 py-2 last:border-0 ${isUnexpectedlyOff ? "opacity-80" : ""}`}
                      >
                        <span className={`text-sm ${isOn ? "text-slate-300" : "text-slate-500"}`}>
                          {meta.label}
                        </span>
                        <Pill on={isOn} />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 border-t border-slate-700/40 pt-3">
                  <Link href="/app-management">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Manage feature flags →
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </Section>
        </div>

        {/* ── Performance Metrics ── */}
        <PerformanceSection data={d} isLoading={isLoading} />

        {/* ── Service Diagnostics ── */}
        <DiagnosticsSection />

        {/* ── Alert Notifications ── */}
        <Section title="Alert Notifications" icon={Bell}>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <SkeletonBlock key={i} className="h-9" />
              ))}
            </div>
          ) : (
            <>
              {/* Monitor on/off banner */}
              {alertCfg && !alertCfg.monitorEnabled && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-slate-600/40 bg-slate-700/30 px-4 py-3">
                  <BellOff size={16} className="mt-0.5 shrink-0 text-slate-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-300">Health monitor is disabled</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Enable it in Admin Settings →{" "}
                      <code className="rounded bg-slate-700 px-1 py-0.5 text-slate-400">
                        health_monitor_enabled = on
                      </code>{" "}
                      to start receiving alerts automatically.
                    </p>
                  </div>
                </div>
              )}

              {alertCfg?.monitorEnabled && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                  <Bell size={16} className="shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-emerald-300">Health monitor is active</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Checks every {alertCfg?.intervalMin ?? 5} min · Re-alerts after{" "}
                      {alertCfg?.snoozeMin ?? 60} min snooze
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Email channel */}
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Mail size={15} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-300">Email Alerts</span>
                  </div>
                  <div className="space-y-2">
                    <ChannelBadge configured={alertCfg?.emailConfigured ?? false} label="Email" />
                    {alertCfg?.emailConfigured && alertCfg?.alertEmail && (
                      <p className="truncate text-xs text-slate-500" title={alertCfg.alertEmail}>
                        → {alertCfg.alertEmail}
                      </p>
                    )}
                    {!alertCfg?.emailConfigured && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Set{" "}
                        <code className="rounded bg-slate-700 px-1 text-slate-400">
                          integration_email=on
                        </code>{" "}
                        and{" "}
                        <code className="rounded bg-slate-700 px-1 text-slate-400">
                          smtp_admin_alert_email
                        </code>{" "}
                        in Settings to enable.
                      </p>
                    )}
                  </div>
                </div>

                {/* Slack channel */}
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Slack size={15} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-300">Slack Alerts</span>
                  </div>
                  <div className="space-y-2">
                    <ChannelBadge configured={alertCfg?.slackConfigured ?? false} label="Slack" />
                    {!alertCfg?.slackConfigured && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Set{" "}
                        <code className="rounded bg-slate-700 px-1 text-slate-400">
                          health_alert_slack_webhook
                        </code>{" "}
                        to an incoming webhook URL in Settings to enable.
                      </p>
                    )}
                    {alertCfg?.slackConfigured && (
                      <p className="mt-1 text-xs text-slate-500">Incoming webhook configured</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-slate-700/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Alerts fire for <strong className="text-slate-400">critical errors</strong> only
                  (DB down, malformed moderation config). Warnings are shown on this dashboard but
                  don't trigger notifications.
                </p>
                <Link href="/settings">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-600 bg-slate-800 text-xs whitespace-nowrap text-slate-300 hover:bg-slate-700"
                  >
                    Configure in Settings →
                  </Button>
                </Link>
              </div>
            </>
          )}
        </Section>

        {/* ── Login Security & Lockout Monitor ── */}
        <LoginSecuritySection data={d} isLoading={isLoading} />

        {/* auto-refresh notice */}
        <p className="text-center text-xs text-slate-600">
          Auto-refreshes every 10 seconds · Last updated{" "}
          {dataUpdatedAt > 0 ? updatedAgo(new Date(dataUpdatedAt).toISOString()) : "—"}
        </p>
      </div>
    </ErrorBoundary>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Performance Metrics sub-component
───────────────────────────────────────────────────────────────────────────── */
function PerfMetricBar({
  value,
  threshold,
  label,
  unit = "%",
}: {
  value: number | null;
  threshold: number;
  label: string;
  unit?: string;
}) {
  if (value == null) {
    return (
      <div className="flex items-center justify-between border-b border-slate-700/40 py-2.5 last:border-0">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="text-xs text-slate-600 italic">No data yet</span>
      </div>
    );
  }

  const pct = unit === "%" ? value : Math.min(100, (value / threshold) * 100);
  const color =
    value >= threshold
      ? "bg-red-500"
      : value >= threshold * 0.8
        ? "bg-amber-500"
        : "bg-emerald-500";
  const textColor =
    value >= threshold
      ? "text-red-400"
      : value >= threshold * 0.8
        ? "text-amber-400"
        : "text-emerald-400";
  const statusIcon = value >= threshold ? "🔴" : value >= threshold * 0.8 ? "🟡" : "🟢";

  return (
    <div className="border-b border-slate-700/40 py-2.5 last:border-0">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <span className={`text-sm font-medium ${textColor} flex items-center gap-1.5`}>
          <span className="text-xs">{statusIcon}</span>
          {value}
          {unit}
          <span className="text-xs font-normal text-slate-600">
            / {threshold}
            {unit} limit
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/60">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function PerformanceSection({ data: d, isLoading }: { data: any; isLoading: boolean }) {
  const perf = d?.performance;

  const p50Ms = perf?.p50Ms ?? null;
  const p95Ms = perf?.p95Ms ?? null;
  const p99Ms = perf?.p99Ms ?? null;
  const dbLatencyMs = perf?.dbLatencyMs ?? null;
  const dbQueryMs = perf?.dbQueryMs ?? null;
  const redisCacheHitRate = perf?.redisCacheHitRate ?? null;
  const queueDepth = perf?.queueDepth ?? 0;
  const memoryPct = perf?.memoryPct ?? null;
  const diskPct = perf?.diskPct ?? null;
  const diskFreeGb = perf?.diskFreeGb ?? null;

  const thresholds = perf?.thresholds ?? { p95Ms: 500, dbMs: 1000, memoryPct: 80, diskPct: 80 };

  const alertCount = [
    p95Ms != null && p95Ms >= thresholds.p95Ms,
    dbQueryMs != null && dbQueryMs >= thresholds.dbMs,
    memoryPct != null && memoryPct >= thresholds.memoryPct,
    diskPct != null && diskPct >= thresholds.diskPct,
  ].filter(Boolean).length;

  return (
    <Section title="Performance" icon={Gauge}>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonBlock key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <div>
          {alertCount > 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertTriangle size={13} className="shrink-0 text-red-400" />
              <span className="text-xs text-red-300">
                {alertCount} metric{alertCount > 1 ? "s" : ""} exceeding alert threshold
                {alertCount > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* ── API Percentiles ── */}
          <div className="mb-5">
            <div className="mb-3 flex items-center gap-2">
              <Gauge size={13} className="text-slate-500" />
              <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                API Response Percentiles
              </span>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-2">
              {[
                { label: "p50 (median)", value: p50Ms },
                { label: "p95", value: p95Ms, threshold: thresholds.p95Ms },
                { label: "p99 (tail)", value: p99Ms },
              ].map(({ label, value, threshold }) => {
                const isAlert = threshold != null && value != null && value >= threshold;
                const isWarning =
                  threshold != null &&
                  value != null &&
                  value >= threshold * 0.8 &&
                  value < threshold;
                const color = isAlert
                  ? "text-red-400"
                  : isWarning
                    ? "text-amber-400"
                    : "text-emerald-400";
                return (
                  <div
                    key={label}
                    className={`rounded-lg border p-2 text-center ${isAlert ? "border-red-500/30 bg-red-500/5" : isWarning ? "border-amber-500/30 bg-amber-500/5" : "border-slate-700/50 bg-slate-800/40"}`}
                  >
                    <p
                      className={`font-mono text-base font-bold ${value == null ? "text-slate-600" : color}`}
                    >
                      {value != null ? `${value}ms` : "—"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{label}</p>
                    {threshold != null && value != null && (
                      <p className="text-[9px] text-slate-700">limit {threshold}ms</p>
                    )}
                  </div>
                );
              })}
            </div>
            {p95Ms == null && (
              <p className="text-xs text-slate-600">
                Collecting samples — requires at least 10 API requests
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* DB ping latency */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Database size={13} className="text-slate-500" />
                <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  DB Latency (SELECT 1)
                </span>
              </div>
              <PerfMetricBar value={dbLatencyMs} threshold={50} label="Ping latency" unit="ms" />
            </div>

            {/* DB query latency */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Database size={13} className="text-slate-500" />
                <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  DB Query Latency
                </span>
              </div>
              <PerfMetricBar
                value={dbQueryMs}
                threshold={thresholds.dbMs}
                label="Full query latency"
                unit="ms"
              />
            </div>

            {/* Redis cache hit rate */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Zap size={13} className="text-slate-500" />
                <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Redis Cache Hit Rate
                </span>
              </div>
              {redisCacheHitRate == null ? (
                <div className="flex items-center justify-between border-b border-slate-700/40 py-2.5">
                  <span className="text-sm text-slate-400">Hit rate</span>
                  <span className="text-xs text-slate-600 italic">Redis not connected</span>
                </div>
              ) : (
                <PerfMetricBar
                  value={100 - redisCacheHitRate}
                  threshold={30}
                  label={`${redisCacheHitRate}% cache hit rate`}
                  unit="%"
                />
              )}
            </div>

            {/* Queue depth */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Activity size={13} className="text-slate-500" />
                <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Active Connections
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-700/40 py-2.5">
                <span className="text-sm text-slate-400">Socket.IO clients</span>
                <span
                  className={`font-mono text-sm font-medium ${queueDepth > 500 ? "text-amber-400" : "text-slate-200"}`}
                >
                  {queueDepth}
                </span>
              </div>
            </div>

            {/* Memory usage */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <MemoryStick size={13} className="text-slate-500" />
                <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Heap Memory
                </span>
              </div>
              <PerfMetricBar
                value={memoryPct}
                threshold={thresholds.memoryPct}
                label="Heap used"
                unit="%"
              />
            </div>

            {/* Disk usage */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <HardDrive size={13} className="text-slate-500" />
                <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Disk Usage
                </span>
              </div>
              <PerfMetricBar
                value={diskPct}
                threshold={thresholds.diskPct}
                label="Disk used"
                unit="%"
              />
              {diskFreeGb != null && (
                <p className="mt-1 text-xs text-slate-600">{diskFreeGb} GB free</p>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-700/40 pt-4">
            <p className="text-xs text-slate-600">
              Thresholds: p95 &lt; {thresholds.p95Ms}ms · DB &lt; {thresholds.dbMs}ms · Memory &lt;{" "}
              {thresholds.memoryPct}% · Disk &lt; {thresholds.diskPct}%{" · "}
              <span className="text-slate-700">
                Configure via Admin Settings →{" "}
                <code className="rounded bg-slate-800 px-1">perf_alert_*</code> keys
              </span>
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Service Diagnostics sub-component
   Fetches its own data via useDiagnostics (separate query, 15s refresh).
───────────────────────────────────────────────────────────────────────────── */
function ServiceStatusCard({ svc }: { svc: any }) {
  const isUp = svc.status === "up";
  const isDegraded = svc.status === "degraded";

  const border = isUp
    ? "border-emerald-500/25 bg-emerald-500/5"
    : isDegraded
      ? "border-amber-500/25 bg-amber-500/5"
      : "border-red-500/25 bg-red-500/5";
  const dotColor = isUp ? "bg-emerald-500" : isDegraded ? "bg-amber-500" : "bg-red-500";
  const latColor = isUp ? "text-emerald-400" : isDegraded ? "text-amber-400" : "text-slate-600";

  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 ${border}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor} ${!isUp ? "animate-pulse" : ""}`}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-200">{svc.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">:{svc.port}</p>
          {!isUp && svc.error && <p className="mt-1 truncate text-xs text-red-400">{svc.error}</p>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {isUp ? (
          <CheckCircle2 size={15} className="mb-1 ml-auto text-emerald-500" />
        ) : isDegraded ? (
          <AlertTriangle size={15} className="mb-1 ml-auto text-amber-500" />
        ) : (
          <XCircle size={15} className="mb-1 ml-auto text-red-500" />
        )}
        <p className={`font-mono text-xs ${latColor}`}>
          {isUp || isDegraded ? `${svc.latencyMs}ms` : "—"}
        </p>
      </div>
    </div>
  );
}

function DiagnosticsSection() {
  const { data: raw, isLoading, isFetching, dataUpdatedAt } = useDiagnostics();
  const qc = useQueryClient();
  const d = raw as any;

  const services: any[] = d?.services ?? [];
  const counts = d?.processCounts ?? {};
  const scheduler = d?.scheduler ?? {};
  const jobs: any[] = scheduler.jobs ?? [];
  const servicesUp: number = d?.servicesUp ?? 0;
  const allUp = servicesUp === (d?.servicesTotal ?? 5);

  return (
    <Section title="Service Diagnostics" icon={Layers}>
      {/* header strip */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isLoading && allUp && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={11} /> {servicesUp}/{d?.servicesTotal ?? 5} up
            </span>
          )}
          {!isLoading && !allUp && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
              <XCircle size={11} /> {servicesUp}/{d?.servicesTotal ?? 5} up
            </span>
          )}
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-diagnostics"] })}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} />
          {dataUpdatedAt > 0 ? updatedAgo(new Date(dataUpdatedAt).toISOString()) : ""}
        </button>
      </div>

      {/* service cards grid */}
      {isLoading ? (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(5)].map((_, i) => (
            <SkeletonBlock key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc: any) => (
            <ServiceStatusCard key={svc.key} svc={svc} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* ── Process counts ── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Terminal size={13} className="text-slate-400" />
            <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              OS Processes
            </span>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <SkeletonBlock key={i} className="h-7" />
              ))}
            </div>
          ) : (
            <div>
              {[
                { label: "Node.js (total)", value: counts.nodeTotal ?? 0 },
                { label: "tsx (API dev)", value: counts.tsx ?? 0 },
                { label: "Vite frontends", value: counts.vite ?? 0 },
                { label: "Expo / Metro", value: counts.expo ?? 0 },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-slate-700/30 py-2 last:border-0"
                >
                  <span className="text-sm text-slate-400">{label}</span>
                  <span className="font-mono text-sm font-medium text-slate-200">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Scheduler jobs ── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Repeat size={13} className="text-slate-400" />
              <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Background Jobs
              </span>
            </div>
            {!isLoading && (
              <div className="flex items-center gap-2">
                {scheduler.running ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                    {scheduler.activeTimers} active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                    stopped
                  </span>
                )}
                {scheduler.dispatchEngineActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                    dispatch on
                  </span>
                )}
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-1.5">
              {[...Array(5)].map((_, i) => (
                <SkeletonBlock key={i} className="h-6" />
              ))}
            </div>
          ) : (
            <div className="max-h-48 space-y-0 overflow-y-auto pr-0.5">
              {jobs.map((job: any) => (
                <div
                  key={job.name}
                  className="flex items-center justify-between border-b border-slate-700/20 py-1.5 last:border-0"
                >
                  <span className="mr-2 truncate text-xs text-slate-400">{job.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-600">
                    every {job.intervalLabel}
                  </span>
                </div>
              ))}
              {jobs.length === 0 && (
                <p className="text-xs text-slate-600 italic">Scheduler not running</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Login Security sub-component (extracted to keep the main component readable)
───────────────────────────────────────────────────────────────────────────── */
function LoginSecuritySection({ data: d, isLoading }: { data: any; isLoading: boolean }) {
  const unlock = useUnlockAdminIpLockout();
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const lockouts: any[] = d?.authLockouts?.adminIpLockouts ?? [];
  const attempts: any[] = d?.authLockouts?.adminIpAttemptsInProgress ?? [];
  const accountLockouts: any[] = d?.authLockouts?.accountLockouts ?? [];
  const cfg = d?.authLockouts?.config ?? { maxAttempts: 5, lockoutMinutes: 15 };

  const totalThreats = lockouts.length + accountLockouts.length;
  const hasWarning = lockouts.length > 0 || accountLockouts.length > 5;

  async function handleUnlock(key: string) {
    setUnlocking(key);
    try {
      await unlock.mutateAsync(key);
    } finally {
      setUnlocking(null);
    }
  }

  return (
    <Section title="Login Security" icon={Shield}>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <SkeletonBlock key={i} className="h-9" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Summary row ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              icon={Lock}
              label="Locked IPs"
              value={lockouts.length}
              alert={lockouts.length > 0}
            />
            <SummaryTile
              icon={Timer}
              label="IPs with failures"
              value={attempts.length}
              alert={attempts.length > 0}
              warning
            />
            <SummaryTile
              icon={UserX}
              label="Account lockouts"
              value={accountLockouts.length}
              alert={accountLockouts.length > 5}
              warning={accountLockouts.length > 0 && accountLockouts.length <= 5}
            />
            <SummaryTile
              icon={ShieldCheck}
              label="Max attempts"
              value={`${cfg.maxAttempts} / ${cfg.lockoutMinutes}m`}
              alert={false}
            />
          </div>

          {/* ── All-clear state ── */}
          {!hasWarning && lockouts.length === 0 && accountLockouts.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <LockOpen size={14} className="shrink-0 text-emerald-400" />
              <span className="text-sm text-emerald-300">
                No active lockouts — login attempts look normal
              </span>
            </div>
          )}

          {/* ── Admin IP lockouts ── */}
          {lockouts.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Lock size={13} className="text-red-400" />
                <span className="text-xs font-semibold tracking-wide text-red-400 uppercase">
                  Locked Admin IPs ({lockouts.length})
                </span>
              </div>
              <div className="divide-y divide-red-500/10 overflow-hidden rounded-xl border border-red-500/20 bg-red-500/5">
                {lockouts.map((item: any) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-slate-200">{item.key}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.attempts} failed attempt{item.attempts !== 1 ? "s" : ""}
                        {" · "}locked since {new Date(item.lockedSince).toLocaleTimeString()}
                        {" · "}
                        <span className="font-medium text-red-400">
                          {item.minutesLeft}m remaining
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={unlocking === item.key}
                      onClick={() => handleUnlock(item.key)}
                      className="shrink-0 gap-1.5 border-red-500/40 bg-red-500/10 text-xs text-red-300 hover:bg-red-500/20 hover:text-red-200"
                    >
                      {unlocking === item.key ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <LockOpen size={12} />
                      )}
                      Unlock
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── IPs with ongoing failures (not yet locked) ── */}
          {attempts.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Timer size={13} className="text-amber-400" />
                <span className="text-xs font-semibold tracking-wide text-amber-400 uppercase">
                  IPs with Recent Failures ({attempts.length})
                </span>
              </div>
              <div className="divide-y divide-amber-500/10 overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5">
                {attempts.map((item: any) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-slate-200">{item.key}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.attempts}/{cfg.maxAttempts} failed attempt
                        {item.attempts !== 1 ? "s" : ""}
                        {" · "}last at {new Date(item.lastAttempt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {[...Array(cfg.maxAttempts)].map((_: any, i: number) => (
                        <span
                          key={i}
                          className={`h-2 w-2 rounded-full ${i < item.attempts ? "bg-amber-400" : "bg-slate-700"}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Account (phone) lockouts ── */}
          {accountLockouts.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <UserX size={13} className="text-orange-400" />
                <span className="text-xs font-semibold tracking-wide text-orange-400 uppercase">
                  Locked User Accounts ({accountLockouts.length})
                </span>
              </div>
              <div className="max-h-48 divide-y divide-orange-500/10 overflow-hidden overflow-y-auto rounded-xl border border-orange-500/20 bg-orange-500/5">
                {accountLockouts.slice(0, 20).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <p className="truncate font-mono text-sm text-slate-300">{item.phone}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-slate-500">{item.attempts} attempts</span>
                      {item.minutesLeft > 0 && (
                        <Badge
                          variant="outline"
                          className="border-orange-500/40 bg-orange-500/10 text-xs text-orange-300"
                        >
                          {item.minutesLeft}m left
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {accountLockouts.length > 20 && (
                  <div className="px-4 py-2 text-center text-xs text-slate-500">
                    +{accountLockouts.length - 20} more — view all in Security Dashboard
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Footer links ── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-700/40 pt-2">
            <Link href="/security">
              <Button
                variant="ghost"
                size="sm"
                className="px-0 text-xs text-slate-400 hover:text-slate-200"
              >
                Open Security Dashboard →
              </Button>
            </Link>
            {totalThreats > 0 && (
              <span className="text-xs text-slate-600">
                Lockout window: {cfg.lockoutMinutes} min · Threshold: {cfg.maxAttempts} attempts
              </span>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  alert,
  warning,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  alert: boolean;
  warning?: boolean;
}) {
  const color = alert
    ? "text-red-400 bg-red-500/10 border-red-500/20"
    : warning
      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
      : "text-slate-400 bg-slate-800/40 border-slate-700/40";
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon size={13} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p
        className={`text-lg font-semibold ${alert ? "text-red-300" : warning ? "text-amber-300" : "text-slate-200"}`}
      >
        {value}
      </p>
    </div>
  );
}
