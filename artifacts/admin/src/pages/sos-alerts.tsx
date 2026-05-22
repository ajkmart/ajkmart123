import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { adminFetch, getAdminAccessToken } from "@/lib/adminFetcher";
import {
  AlertTriangle,
  Car,
  CheckCheck,
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type SosStatus = "pending" | "acknowledged" | "resolved";

type SosAlert = {
  id: string;
  userId: string;
  title: string;
  body: string;
  link: string | null;
  sosStatus: SosStatus;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNotes: string | null;
  createdAt: string;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function timeSince(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function parseBody(body: string) {
  const phoneMatch = body.match(/Phone: ([^\s·]+)/);
  const rideMatch = body.match(/Ride: #([A-F0-9]+)/);
  const locMatch = body.match(/Location: ([\d.]+),([\d.]+)/);
  const msgMatch = body.match(/"(.+?)"/);
  return {
    phone: phoneMatch?.[1],
    rideId: rideMatch?.[1],
    location: locMatch ? { lat: locMatch[1], lng: locMatch[2] } : null,
    message: msgMatch?.[1],
  };
}

const STATUS_CONFIG: Record<
  SosStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  pending: { label: "Pending", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  acknowledged: {
    label: "Acknowledged",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  resolved: {
    label: "Resolved",
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
  },
};

type Tab = "active" | "acknowledged" | "resolved";

/* ── Resolve Dialog ── */
function ResolveDialog({
  alert,
  onClose,
  onResolved,
}: {
  alert: SosAlert;
  onClose: () => void;
  onResolved: (id: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    setLoading(true);
    setError(null);
    try {
      await adminFetch(`/sos/alerts/${alert.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      onResolved(alert.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve alert");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCheck className="h-5 w-5 text-green-600" />
            <h2 className="text-foreground text-lg font-bold">Resolve SOS Alert</h2>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-muted flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="truncate text-sm font-semibold text-red-800">
            {alert.title.replace("🆘 SOS Alert — ", "")}
          </p>
          <p className="mt-1 text-xs text-red-600">{formatTime(alert.createdAt)}</p>
        </div>

        <div>
          <label className="text-foreground mb-1.5 block text-sm font-semibold">
            Resolution Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe how the situation was resolved, what actions were taken..."
            rows={3}
            className="border-border w-full resize-none rounded-xl border px-3 py-2 text-sm focus:border-green-400 focus:ring-2 focus:ring-green-500/30 focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-xl"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={loading}
            className="flex-1 gap-2 rounded-xl bg-green-600 text-white hover:bg-green-700"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            {loading ? "Resolving..." : "Mark Resolved"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Alert Card ── */
function AlertCard({
  alert,
  onAcknowledge,
  onResolve,
  acknowledging,
}: {
  alert: SosAlert;
  onAcknowledge: (id: string) => void;
  onResolve: (alert: SosAlert) => void;
  acknowledging: string | null;
}) {
  const parsed = parseBody(alert.body);
  const isNew = Date.now() - new Date(alert.createdAt).getTime() < 300_000;
  const status = alert.sosStatus;

  return (
    <Card
      className={`rounded-2xl p-4 shadow-sm transition-all ${
        status === "pending"
          ? isNew
            ? "border-red-200 bg-red-50/40"
            : "border-orange-200 bg-orange-50/20"
          : status === "acknowledged"
            ? "border-amber-200 bg-amber-50/20"
            : "border-green-200 bg-green-50/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
            status === "pending"
              ? "bg-red-100"
              : status === "acknowledged"
                ? "bg-amber-100"
                : "bg-green-100"
          }`}
        >
          <AlertTriangle
            className={`h-5 w-5 ${
              status === "pending"
                ? "text-red-600"
                : status === "acknowledged"
                  ? "text-amber-600"
                  : "text-green-600"
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-foreground truncate text-sm font-semibold">
              {alert.title.replace(/^🆘 SOS Alert — /, "").replace(/^🆘 sosAlert — /, "")}
            </p>
            {status === "pending" && isNew && (
              <Badge className="animate-pulse bg-red-600 px-1.5 text-[10px] font-bold text-white">
                NEW
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`px-1.5 text-[10px] ${STATUS_CONFIG[status].color} border-current`}
            >
              {STATUS_CONFIG[status].label}
            </Badge>
            <span className="text-muted-foreground ml-auto flex flex-shrink-0 items-center gap-1 text-xs">
              <Clock className="h-3 w-3" /> {timeSince(alert.createdAt)}
            </span>
          </div>

          <div className="text-muted-foreground mb-2 flex flex-wrap gap-3 text-xs">
            {parsed.phone && (
              <a
                href={`tel:${parsed.phone}`}
                className="flex items-center gap-1 font-medium text-blue-600 hover:underline"
              >
                <Phone className="h-3 w-3" /> {parsed.phone}
              </a>
            )}
            {parsed.rideId && (
              <span className="text-foreground flex items-center gap-1 font-mono font-bold">
                <Car className="h-3 w-3" /> #{parsed.rideId}
              </span>
            )}
            {parsed.location && (
              <a
                href={`https://www.google.com/maps?q=${parsed.location.lat},${parsed.location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-medium text-emerald-600 hover:underline"
              >
                <MapPin className="h-3 w-3" /> View Location
              </a>
            )}
          </div>

          {parsed.message && (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-700">
              "{parsed.message}"
            </p>
          )}

          {status === "acknowledged" && alert.acknowledgedByName && (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
              <CheckCircle className="mr-1 inline-block h-3 w-3" />
              Acknowledged by <strong>{alert.acknowledgedByName}</strong> at{" "}
              {alert.acknowledgedAt ? formatTime(alert.acknowledgedAt) : "—"}
            </p>
          )}

          {status === "resolved" && (
            <div className="mb-2 space-y-0.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 text-[11px] text-green-700">
              <p>
                <CheckCheck className="mr-1 inline-block h-3 w-3" />
                Resolved by <strong>
                  {alert.resolvedByName || alert.resolvedBy || "Admin"}
                </strong>{" "}
                at {alert.resolvedAt ? formatTime(alert.resolvedAt) : "—"}
              </p>
              {alert.resolutionNotes && (
                <p className="text-green-600 italic">"{alert.resolutionNotes}"</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-[10px]">{formatTime(alert.createdAt)}</p>

            <div className="flex items-center gap-2">
              {status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAcknowledge(alert.id)}
                  disabled={acknowledging === alert.id}
                  className="h-7 gap-1 rounded-lg border-amber-300 text-xs text-amber-700 hover:bg-amber-50"
                >
                  {acknowledging === alert.id ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3 w-3" />
                  )}
                  Acknowledge
                </Button>
              )}
              {(status === "pending" || status === "acknowledged") && (
                <Button
                  size="sm"
                  onClick={() => onResolve(alert)}
                  className="h-7 gap-1 rounded-lg bg-green-600 text-xs text-white hover:bg-green-700"
                >
                  <CheckCheck className="h-3 w-3" />
                  Resolve
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function SosAlerts() {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(0);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("active");
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<SosAlert | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  /* ── Status filter from tab ── */
  const statusForTab = (t: Tab): string | undefined => {
    if (t === "active") return "pending";
    if (t === "acknowledged") return "acknowledged";
    if (t === "resolved") return "resolved";
    return undefined;
  };

  /* ── Load alerts ── */
  const loadAlerts = useCallback(
    async (p = 1, append = false, overrideTab?: Tab) => {
      setLoading(true);
      const currentTab = overrideTab ?? tab;
      const status = statusForTab(currentTab);
      try {
        const qs = `?page=${p}&limit=20${status ? `&status=${status}` : ""}`;
        const data = await adminFetch(`/sos/alerts${qs}`);
        const newAlerts: SosAlert[] = data.alerts || [];
        setAlerts((prev) => (append ? [...prev, ...newAlerts] : newAlerts));
        setTotal(data.total || 0);
        setHasMore(data.hasMore || false);
        setActiveCount(typeof data.activeCount === "number" ? data.activeCount : 0);
        setPage(p);
      } catch (err) {
        console.warn("[sos-alerts] Failed to load alerts:", err);
      }
      setLastUpdatedAt(Date.now());
      setLoading(false);
    },
    [tab]
  );

  /* ── Initial load + reload on tab change ── */
  useEffect(() => {
    void loadAlerts(1, false, tab);
  }, [tab, loadAlerts]);

  /* ── Socket.io real-time connection ── */
  useEffect(() => {
    const token = getAdminAccessToken() ?? "";
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      query: { rooms: "admin-fleet" },
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setWsConnected(true);
      socket.emit("join", "admin-fleet");
    });
    socket.on("disconnect", () => setWsConnected(false));
    socket.on("connect_error", () => setWsConnected(false));

    /* New SOS alert arrives — prepend to active tab; update count regardless of current tab */
    socket.on("sos:new", (payload: SosAlert) => {
      setActiveCount((c) => c + 1);
      if (tab === "active") {
        setAlerts((prev) => [
          { ...payload, sosStatus: "pending" },
          ...prev.filter((a) => a.id !== payload.id),
        ]);
        setTotal((t) => t + 1);
      }
    });

    /* Alert acknowledged — server emits full alert object */
    socket.on("sos:acknowledged", (payload: SosAlert) => {
      if (tab === "active") {
        /* Remove from active tab */
        setAlerts((prev) => prev.filter((a) => a.id !== payload.id));
        setTotal((t) => Math.max(0, t - 1));
      } else if (tab === "acknowledged") {
        /* Upsert into acknowledged tab with full data */
        setAlerts((prev) => {
          const alreadyIn = prev.some((a) => a.id === payload.id);
          const filtered = prev.filter((a) => a.id !== payload.id);
          if (!alreadyIn) setTotal((t) => t + 1);
          return [payload, ...filtered];
        });
      }
    });

    /* Alert resolved — server emits full alert object */
    socket.on("sos:resolved", (payload: SosAlert) => {
      setActiveCount((c) => Math.max(0, c - 1));

      if (tab === "active" || tab === "acknowledged") {
        /* Remove from current tab */
        setAlerts((prev) => {
          const wasPresent = prev.some((a) => a.id === payload.id);
          if (wasPresent) setTotal((t) => Math.max(0, t - 1));
          return prev.filter((a) => a.id !== payload.id);
        });
      } else if (tab === "resolved") {
        /* Upsert into resolved tab with full data */
        setAlerts((prev) => {
          const alreadyIn = prev.some((a) => a.id === payload.id);
          const filtered = prev.filter((a) => a.id !== payload.id);
          if (!alreadyIn) setTotal((t) => t + 1);
          return [payload, ...filtered];
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tab]);

  /* ── Acknowledge handler ── */
  const handleAcknowledge = async (id: string) => {
    setAcknowledging(id);
    try {
      await adminFetch(`/sos/alerts/${id}/acknowledge`, { method: "PATCH", body: "{}" });
      // eslint-disable-next-line ajk-local/no-silent-catch -- socket will update UI state regardless of HTTP call outcome
    } catch {
      /* socket will update UI anyway */
    }
    setAcknowledging(null);
  };

  /* ── Resolved callback — removes from current view; socket event is the sole source of truth for counts ── */
  const handleResolved = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "acknowledged", label: "Acknowledged" },
    { key: "resolved", label: "Resolved" },
  ];

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          SOS Alerts page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <PageHeader
          icon={AlertTriangle}
          title="SOS Alerts"
          subtitle={`${total} alert${total !== 1 ? "s" : ""} in this view · ${activeCount} unresolved`}
          iconBgClass="bg-red-100"
          iconColorClass="text-red-600"
          actions={
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${wsConnected ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-500"}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${wsConnected ? "animate-pulse bg-green-500" : "bg-gray-400"}`}
                />
                {wsConnected ? "Live" : "Connecting..."}
              </div>
              <LastUpdated
                dataUpdatedAt={lastUpdatedAt}
                onRefresh={() => loadAlerts(1)}
                isRefreshing={loading}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadAlerts(1)}
                disabled={loading}
                className="h-9 gap-1.5 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={AlertTriangle}
            label="Total in View"
            value={total}
            iconBgClass="bg-gray-100"
            iconColorClass="text-gray-600"
          />
          <StatCard
            icon={Clock}
            label="Unresolved (Active)"
            value={activeCount}
            iconBgClass="bg-red-100"
            iconColorClass="text-red-600"
            onClick={() => setTab("active")}
          />
        </div>

        {/* Tabs */}
        <div className="bg-muted/50 border-border/50 flex gap-1 rounded-xl border p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                tab === t.key
                  ? "text-foreground border-border/50 border bg-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.key === "active" && activeCount > 0 && (
                <span className="min-w-[18px] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && alerts.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {alerts.length === 0 && !loading && (
          <Card className="border-border/50 flex flex-col items-center gap-4 rounded-2xl p-10 text-center">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full border ${
                tab === "resolved" ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
              }`}
            >
              {tab === "resolved" ? (
                <CheckCheck className="h-7 w-7 text-green-500" />
              ) : (
                <AlertTriangle className="h-7 w-7 text-gray-400" />
              )}
            </div>
            <p className="text-foreground text-lg font-semibold">
              {tab === "active"
                ? "No Active SOS Alerts"
                : tab === "acknowledged"
                  ? "No Acknowledged Alerts"
                  : "No Resolved Alerts"}
            </p>
            <p className="text-muted-foreground max-w-xs text-sm">
              {tab === "active"
                ? "All clear — no pending emergency alerts."
                : tab === "acknowledged"
                  ? "No alerts are currently being handled."
                  : "No alerts have been resolved yet."}
            </p>
          </Card>
        )}

        {/* Alert cards */}
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
              onResolve={setResolveTarget}
              acknowledging={acknowledging}
            />
          ))}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => loadAlerts(page + 1, true)}
              disabled={loading}
              className="gap-2 rounded-xl"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Load More
            </Button>
          </div>
        )}

        {/* Resolve dialog */}
        {resolveTarget && (
          <ResolveDialog
            alert={resolveTarget}
            onClose={() => setResolveTarget(null)}
            onResolved={handleResolved}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
