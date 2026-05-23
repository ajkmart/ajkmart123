import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual } from "@workspace/i18n";
import { Truck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { api } from "../lib/api";
import { CARD, DEFAULT_COMMISSION_PCT, errMsg, fc, fd, STAT_LBL, STAT_VAL } from "../lib/ui";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import type { StoreHours } from "../lib/vendor-auth";
import { useAuth } from "../lib/vendor-auth";

function typeIcon(type: string) {
  if (type === "order") return "📦";
  if (type === "wallet") return "💰";
  if (type === "promo") return "🎟️";
  if (type === "system") return "⚙️";
  if (type === "alert") return "⚠️";
  return "🔔";
}

function QuickActions() {
  return (
    <div className={`${CARD} p-4`}>
      <p className="mb-3 text-xs font-extrabold tracking-widest text-gray-400 uppercase">
        Quick Actions
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/orders"
          className="flex flex-col items-center gap-2 rounded-2xl bg-green-50 p-3 text-center transition-transform active:scale-95"
        >
          <span className="text-2xl">✅</span>
          <span className="text-xs leading-tight font-bold text-green-700">Accept Orders</span>
        </Link>
        <Link
          href="/chat"
          className="flex flex-col items-center gap-2 rounded-2xl bg-blue-50 p-3 text-center transition-transform active:scale-95"
        >
          <span className="text-2xl">💬</span>
          <span className="text-xs leading-tight font-bold text-blue-700">Open Chat</span>
        </Link>
        <Link
          href="/products"
          className="flex flex-col items-center gap-2 rounded-2xl bg-blue-50 p-3 text-center transition-transform active:scale-95"
        >
          <span className="text-2xl">🛒</span>
          <span className="text-xs leading-tight font-bold text-orange-700">Manage Products</span>
        </Link>
      </div>
    </div>
  );
}

interface DashNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead?: boolean;
  createdAt: string;
}

function NotificationsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["vendor-notifications"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const markAllMut = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-notifications"] });
      void qc.invalidateQueries({ queryKey: ["vendor-notifs-count"] });
    },
  });

  const notifs: DashNotification[] = (data?.notifications || []).slice(0, 5);
  const unread: number = data?.unread || 0;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🔔</span>
          <p className="text-sm font-bold text-gray-800">Recent Notifications</p>
          {unread > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
              {unread} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-600"
            >
              ✓ Mark all read
            </button>
          )}
          <Link
            href="/notifications"
            className="text-[11px] font-bold text-gray-400 hover:text-blue-500"
          >
            View all →
          </Link>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : notifs.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="mb-2 text-3xl">🔔</p>
          <p className="text-sm font-bold text-gray-500">All caught up!</p>
          <p className="mt-1 text-xs text-gray-400">No new notifications</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {notifs.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 ${!n.isRead ? "bg-blue-50/30" : ""}`}
            >
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-base ${!n.isRead ? "bg-blue-100" : "bg-gray-100"}`}
              >
                {typeIcon(n.type)}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-xs leading-snug font-bold ${!n.isRead ? "text-gray-900" : "text-gray-700"}`}
                >
                  {n.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-gray-500">
                  {n.body}
                </p>
                <p className="mt-1 text-[10px] text-gray-400">{fd(n.createdAt)}</p>
              </div>
              {!n.isRead && (
                <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_STORE_HOURS: StoreHours = {
  mon: { open: "08:00", close: "22:00" },
  tue: { open: "08:00", close: "22:00" },
  wed: { open: "08:00", close: "22:00" },
  thu: { open: "08:00", close: "22:00" },
  fri: { open: "08:00", close: "22:00" },
  sat: { open: "08:00", close: "22:00" },
  sun: { open: "10:00", close: "20:00" },
};

function ScheduleEditor({
  storeHours,
  onSave,
  saving,
}: {
  storeHours: StoreHours | null | undefined;
  onSave: (hours: StoreHours) => Promise<void>;
  saving: boolean;
}) {
  const initHours: StoreHours =
    storeHours && Object.keys(storeHours).length > 0 ? storeHours : DEFAULT_STORE_HOURS;
  const [hours, setHours] = useState<StoreHours>(initHours);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const update = (day: string, field: "open" | "close" | "closed", val: string | boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: val },
    }));
    setDirty(true);
  };

  if (!expanded) {
    return (
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800">Weekly Schedule</p>
            <p className="mt-0.5 text-xs text-gray-500">Set your open/close hours per day</p>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="h-9 rounded-xl bg-blue-50 px-4 text-sm font-bold text-blue-600"
          >
            Edit Schedule
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-800">Weekly Schedule</p>
        <button onClick={() => setExpanded(false)} className="text-lg leading-none text-gray-400">
          ×
        </button>
      </div>
      <div className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const day = hours[key] ?? { open: "08:00", close: "22:00" };
          const isClosed = day.closed === true;
          return (
            <div
              key={key}
              className="flex items-center gap-2 border-b border-gray-50 py-1.5 last:border-0"
            >
              <div className="w-20 flex-shrink-0">
                <p className="text-xs font-semibold text-gray-700">{label.slice(0, 3)}</p>
              </div>
              <label className="flex flex-shrink-0 cursor-pointer items-center gap-1.5">
                <div
                  onClick={() => update(key, "closed", !isClosed)}
                  className={`relative h-5 w-10 cursor-pointer rounded-full transition-colors ${isClosed ? "bg-gray-300" : "bg-green-400"}`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${isClosed ? "left-0.5" : "left-5"}`}
                  />
                </div>
                <span
                  className={`text-[10px] font-bold ${isClosed ? "text-gray-400" : "text-green-600"}`}
                >
                  {isClosed ? "Closed" : "Open"}
                </span>
              </label>
              {!isClosed && (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    type="time"
                    value={day.open || "08:00"}
                    onChange={(e) => update(key, "open", e.target.value)}
                    className="h-8 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">–</span>
                  <input
                    type="time"
                    value={day.close || "22:00"}
                    onChange={(e) => update(key, "close", e.target.value)}
                    className="h-8 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => {
            setHours(initHours);
            setDirty(false);
            setExpanded(false);
          }}
          className="h-9 flex-1 rounded-xl border border-gray-200 text-sm font-bold text-gray-600"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            await onSave(hours);
            setDirty(false);
            setExpanded(false);
          }}
          disabled={!dirty || saving}
          className="h-9 flex-1 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Schedule"}
        </button>
      </div>
    </div>
  );
}

function VendorNoticeBanner({ message }: { message: string }) {
  const key = `vendor_notice_dismissed_${message.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)}`;
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(key) === "1");
  if (dismissed) return null;
  const dismiss = () => {
    sessionStorage.setItem(key, "1");
    setDismissed(true);
  };
  return (
    <div className="mb-2 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
      <span className="mt-0.5 flex-shrink-0 text-base text-blue-500">📌</span>
      <p className="flex-1 text-sm leading-snug font-medium text-blue-700">{message}</p>
      <button
        onClick={dismiss}
        className="flex-shrink-0 text-lg leading-none text-blue-400 hover:text-blue-600"
      >
        ×
      </button>
    </div>
  );
}

function LiveTrackingNotice({
  liveTracking,
  T,
}: {
  liveTracking: boolean;
  T: (k: Parameters<typeof tDual>[0]) => string;
}) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("live_tracking_notice_dismissed") === "1"
  );
  if (liveTracking || dismissed) return null;
  return (
    <div className="fixed right-4 bottom-24 left-4 z-40 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg md:right-6 md:left-auto md:max-w-sm">
      <span className="text-lg">📍</span>
      <div className="flex-1">
        <p className="text-xs font-bold text-amber-800">{T("liveTrackingDisabled")}</p>
        <p className="text-xs text-amber-600">{T("liveTrackingUnavailable")}</p>
      </div>
      <button
        onClick={() => {
          sessionStorage.setItem("live_tracking_notice_dismissed", "1");
          setDismissed(true);
        }}
        className="flex-shrink-0 text-lg leading-none text-amber-500 hover:text-amber-700"
      >
        ×
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);
  const qc = useQueryClient();
  const { isOnline, pendingProductCount } = useOfflineQueue();
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (m: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  };
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(new Set());
  const [cancelDialog, setCancelDialog] = useState<{ orderId: string } | null>(null);
  const [acceptDialog, setAcceptDialog] = useState<{ orderId: string; total: number } | null>(null);
  const cancelReasonRef = useRef("");

  const {
    data: stats,
    isLoading,
    isError: statsError,
    refetch: refetchStats,
    dataUpdatedAt: statsUpdatedAt,
    isFetching: statsFetching,
  } = useQuery({
    queryKey: ["vendor-stats"],
    queryFn: () => api.getStats(),
    refetchInterval: 30000,
  });
  const { data: ordersData } = useQuery({
    queryKey: ["vendor-orders", "all"],
    queryFn: () => api.getOrders(),
    refetchInterval: 20000,
  });
  const { data: daStatus } = useQuery({
    queryKey: ["vendor-delivery-access"],
    queryFn: () => api.getDeliveryAccessStatus(),
    refetchInterval: 60000,
  });
  const requestDeliveryMut = useMutation({
    mutationFn: (data: { serviceType?: string; reason?: string }) =>
      api.requestDeliveryAccess(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-delivery-access"] });
      showToast("✅ Delivery access request submitted");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (isOpen: boolean) => api.updateStore({ storeIsOpen: isOpen }),
    onSuccess: () => {
      void refreshUser();
      void qc.invalidateQueries({ queryKey: ["vendor-stats"] });
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const [schedSaving, setSchedSaving] = useState(false);
  const saveSchedule = async (hours: StoreHours) => {
    setSchedSaving(true);
    try {
      await api.updateStore({ storeHours: hours });
      await refreshUser();
      showToast("✅ Schedule saved");
    } catch (e: unknown) {
      showToast("❌ " + errMsg(e));
    } finally {
      setSchedSaving(false);
    }
  };

  const orderActionMut = useMutation({
    mutationFn: ({
      orderId,
      status,
      reason,
    }: {
      orderId: string;
      status: string;
      reason?: string;
    }) => {
      setPendingOrderIds((s) => new Set(s).add(orderId));
      return api.updateOrder(orderId, status, reason);
    },
    onSuccess: (_, { orderId, status }) => {
      setPendingOrderIds((s) => {
        const n = new Set(s);
        n.delete(orderId);
        return n;
      });
      void qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      void qc.invalidateQueries({ queryKey: ["vendor-stats"] });
      showToast(
        status === "confirmed" ? `✅ ${T("orderAcceptedMsg")}` : `❌ ${T("orderCancelledMsg")}`
      );
    },
    onError: (e: Error, { orderId }) => {
      setPendingOrderIds((s) => {
        const n = new Set(s);
        n.delete(orderId);
        return n;
      });
      showToast("❌ " + errMsg(e));
    },
  });

  const allOrders = ordersData?.orders || [];
  const pendingOrders = allOrders.filter((o: any) => o.status === "pending");
  const activeOrders = allOrders.filter((o: any) =>
    ["confirmed", "preparing", "ready"].includes(o.status)
  );

  const statItems = [
    {
      label: T("todaysOrders"),
      value: isLoading ? "—" : statsError ? "⚠" : String(stats?.today?.orders ?? 0),
      color: statsError ? "text-red-400" : "text-blue-500",
      bg: statsError ? "bg-red-50" : "bg-blue-50",
      icon: "📦",
    },
    {
      label: T("todaysRevenue"),
      value: isLoading ? "—" : statsError ? "⚠" : fc(stats?.today?.revenue ?? 0),
      color: statsError ? "text-red-400" : "text-amber-600",
      bg: statsError ? "bg-red-50" : "bg-amber-50",
      icon: "💰",
    },
    {
      label: T("weeklyRevenue"),
      value: isLoading ? "—" : statsError ? "⚠" : fc(stats?.week?.revenue ?? 0),
      color: statsError ? "text-red-400" : "text-blue-600",
      bg: statsError ? "bg-red-50" : "bg-blue-50",
      icon: "📅",
    },
    {
      label: T("monthlyRevenue"),
      value: isLoading ? "—" : statsError ? "⚠" : fc(stats?.month?.revenue ?? 0),
      color: statsError ? "text-red-400" : "text-purple-600",
      bg: statsError ? "bg-red-50" : "bg-purple-50",
      icon: "📈",
    },
  ];

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["vendor-stats"] }),
      qc.invalidateQueries({ queryKey: ["vendor-orders"] }),
    ]);
  }, [qc]);

  return (
    <PullToRefresh
      onRefresh={handleRefresh}
      className="min-h-screen bg-[#0A0F1A] md:bg-transparent"
    >
      {/* ── Offline Banner ── */}
      {!isOnline && (
        <div className="bg-red-500 px-4 py-2 text-center text-xs font-bold text-white">
          📴 You're offline — data may be out of date
        </div>
      )}
      {/* ── Header ── */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span>{user?.storeName || "Dashboard"}</span>
            {user?.isVerified && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700 md:bg-white/20 md:text-white">
                ✓ Verified
              </span>
            )}
          </span>
        }
        subtitle={
          <span className="flex items-center gap-2">
            <span>
              {user?.storeCategory
                ? `${user.storeCategory} · ${config.platform.appName} Partner`
                : `${config.platform.appName} Vendor Portal`}
            </span>
            {statsUpdatedAt > 0 && (
              <span className={`text-[10px] font-semibold ${statsFetching ? "text-blue-400" : "text-gray-400"}`}>
                {statsFetching
                  ? "Syncing…"
                  : (() => {
                      const diffMs = Date.now() - statsUpdatedAt;
                      const diffMin = Math.floor(diffMs / 60000);
                      if (diffMin < 1) return "Updated just now";
                      if (diffMin === 1) return "Updated 1 min ago";
                      return `Updated ${diffMin} min ago`;
                    })()}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-medium text-gray-500 md:block">{T("store")}:</span>
            <button
              onClick={() => toggleMut.mutate(!user?.storeIsOpen)}
              disabled={toggleMut.isPending}
              className={`relative h-8 w-14 flex-shrink-0 rounded-full transition-all duration-300 focus:outline-none ${user?.storeIsOpen ? "bg-green-400" : "bg-gray-300"}`}
            >
              <div
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-300 ${user?.storeIsOpen ? "left-7" : "left-1"}`}
              />
            </button>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${user?.storeIsOpen ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
            >
              {user?.storeIsOpen ? T("openLabel") : T("closedLabel")}
            </span>
          </div>
        }
        mobileContent={
          <div className="flex items-center justify-between rounded-2xl bg-white/20 px-4 py-2.5">
            <div>
              <p className="text-xs font-medium text-orange-100">{T("walletBalance")}</p>
              <p className="text-2xl font-extrabold text-white">{fc(user?.walletBalance ?? "0")}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-orange-100">{T("storeStatus")}</p>
              <button
                onClick={() => toggleMut.mutate(!user?.storeIsOpen)}
                disabled={toggleMut.isPending}
                className={`relative mt-1 block h-7 w-14 rounded-full transition-all duration-300 ${user?.storeIsOpen ? "bg-green-400" : "bg-white/30"}`}
              >
                <div
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${user?.storeIsOpen ? "left-8" : "left-1"}`}
                />
              </button>
            </div>
          </div>
        }
      />

      <div className="space-y-4 px-4 py-4 md:space-y-0 md:px-0 md:py-0">
        {/* Active Tracker Banner — top position */}
        {config.content.trackerBannerEnabled &&
          config.content.trackerBannerPosition === "top" &&
          activeOrders.length > 0 && (
            <Link
              href="/orders"
              className="mb-2 block rounded-2xl bg-gradient-to-r from-orange-500 to-blue-600 px-4 py-3.5 shadow-lg shadow-orange-200 transition-transform active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold tracking-tight text-white">
                    {activeOrders.length} Active Order{activeOrders.length > 1 ? "s" : ""}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-white/70">
                    {activeOrders.map((o: any) => `#${o.id?.slice(-6).toUpperCase()}`).join(" · ")}
                  </p>
                </div>
                <div className="flex-shrink-0 rounded-xl bg-white/20 px-3 py-2 text-xs font-extrabold text-white backdrop-blur-sm">
                  Track →
                </div>
              </div>
            </Link>
          )}

        {/* Vendor Notice Banner */}
        {config.content.vendorNotice && (
          <VendorNoticeBanner message={config.content.vendorNotice} />
        )}
        {/* Desktop wallet bar */}
        <div className="mb-6 hidden items-center gap-4 rounded-2xl bg-gradient-to-r from-orange-500 to-blue-600 px-6 py-4 text-white shadow-sm md:flex">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-orange-100">{T("walletBalance")}</p>
              {user?.isVerified && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
                  ✓ Verified
                </span>
              )}
            </div>
            <p className="text-3xl font-extrabold">{fc(user?.walletBalance ?? "0")}</p>
          </div>
          <div className="border-l border-white/20 pl-4 text-center">
            <p className="text-xs font-medium text-orange-100">{T("commission")}</p>
            <p className="text-3xl font-extrabold">
              {Math.round(100 - (config.platform.vendorCommissionPct ?? DEFAULT_COMMISSION_PCT))}%
            </p>
          </div>
          <div className="border-l border-white/20 pl-4 text-right">
            <p className="text-xs font-medium text-orange-100">{T("allTimeEarned")}</p>
            <p className="text-xl font-extrabold">{fc(user?.stats?.totalRevenue || 0)}</p>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-3 md:mb-6 md:grid-cols-4">
          {statItems.map((s) => (
            <div key={s.label} className={`${CARD} p-4 md:p-5`}>
              <div
                className={`h-10 w-10 ${s.bg} mb-3 flex items-center justify-center rounded-xl text-xl`}
              >
                {s.icon}
              </div>
              <p className={`${STAT_VAL} ${s.color} text-xl md:text-2xl`}>{s.value}</p>
              <p className={`${STAT_LBL}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Stats Error ── */}
        {statsError && (
          <div className="mb-4">
            <ErrorState
              title={T("somethingWentWrong")}
              subtitle={T("checkInternetRetry")}
              onRetry={() => refetchStats()}
              retryLabel={T("retry")}
              className="py-8"
            />
          </div>
        )}

        {/* Low Stock Alert */}
        {(stats?.lowStock ?? 0) > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 md:mb-6">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-700">
                {stats.lowStock} Products Low on Stock
              </p>
              <p className="mt-0.5 text-xs text-red-500">Go to Products → update stock</p>
            </div>
          </div>
        )}

        {/* Pending Product Sync Badge */}
        {pendingProductCount > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:mb-6">
            <span className="text-2xl">⏳</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">
                {pendingProductCount} product change{pendingProductCount > 1 ? "s" : ""} pending
                sync
              </p>
              <p className="mt-0.5 text-xs text-amber-600">
                Go online to sync your product updates
              </p>
            </div>
            <span className="flex-shrink-0 rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-800">
              {pendingProductCount}
            </span>
          </div>
        )}

        {/* Delivery Access Status */}
        {(() => {
          const da = daStatus?.data ?? daStatus;
          if (!da || da.mode === "all") return null;
          const statuses: Record<string, { active: boolean; deliveryLabel?: string }> =
            da.statuses || {};
          const pendingReqs: any[] = da.pendingRequests || [];
          const pendingServiceTypes = new Set(pendingReqs.map((r: any) => r.serviceType || "all"));
          const anyActive = Object.values(statuses).some((s) => s.active);
          const allPending =
            Object.keys(statuses).length > 0 &&
            !anyActive &&
            Object.keys(statuses).every(
              (svc) => pendingServiceTypes.has(svc) || pendingServiceTypes.has("all")
            );

          if (allPending) {
            return (
              <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 md:mb-6">
                <Truck className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                <div>
                  <p className="text-sm font-bold text-blue-800">
                    Your delivery access request is under review
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-blue-600">
                    Admin is reviewing your request. You'll be notified once approved — no action
                    needed right now.
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              className={`overflow-hidden rounded-2xl md:mb-6 ${
                anyActive ? "border border-blue-200" : "border border-amber-200"
              }`}
            >
              <div
                className={`flex items-center gap-3 px-4 py-3 ${
                  anyActive ? "bg-blue-50" : "bg-amber-50"
                }`}
              >
                <Truck className={`h-5 w-5 ${anyActive ? "text-blue-600" : "text-amber-600"}`} />
                <p
                  className={`flex-1 text-sm font-bold ${anyActive ? "text-blue-700" : "text-amber-700"}`}
                >
                  Delivery Access
                </p>
              </div>
              <div className="divide-y divide-gray-100 bg-white">
                {Object.entries(statuses).map(([svc, info]) => {
                  const hasPendingForService =
                    pendingServiceTypes.has(svc) || pendingServiceTypes.has("all");
                  return (
                    <div key={svc} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex-1 text-sm font-medium text-gray-700 capitalize">
                        {svc}
                      </span>
                      {info.active ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-bold text-green-700">
                          Active{info.deliveryLabel ? ` · ${info.deliveryLabel}` : ""}
                        </span>
                      ) : hasPendingForService ? (
                        <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-[10px] font-bold text-yellow-700">
                          ⏳ Pending review
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            requestDeliveryMut.mutate({
                              serviceType: svc,
                              reason: `Requesting ${svc} delivery access`,
                            })
                          }
                          disabled={requestDeliveryMut.isPending}
                          className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-200 disabled:opacity-60"
                        >
                          Request
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Quick Actions */}
        <QuickActions />

        {/* Weekly Store Schedule Editor */}
        <ScheduleEditor storeHours={user?.storeHours} onSave={saveSchedule} saving={schedSaving} />

        {/* ── Desktop: 2-column layout for orders ── */}
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
          {/* Pending Orders */}
          <div>
            {pendingOrders.length > 0 ? (
              <div className={CARD}>
                <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-3.5">
                  <span className="text-lg">🔔</span>
                  <div>
                    <p className="text-sm font-bold text-orange-800">
                      {pendingOrders.length} {T("newOrders")}!
                    </p>
                    <p className="text-xs text-blue-500">{T("acceptWithinTime")}</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {pendingOrders.map((o: any) => {
                    const isOrderPending = pendingOrderIds.has(o.id);
                    return (
                      <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl">
                          {o.type === "food" ? "🍔" : "🛒"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 capitalize">{o.type}</p>
                          <p className="font-mono text-xs text-gray-400">
                            #{o.id.slice(-6).toUpperCase()} · {fc(o.total)}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 gap-2">
                          <button
                            onClick={() => setAcceptDialog({ orderId: o.id, total: o.total })}
                            disabled={isOrderPending}
                            className="android-press h-9 min-h-0 rounded-xl bg-green-500 px-4 text-xs font-bold text-white disabled:opacity-60"
                          >
                            ✓ Accept
                          </button>
                          <button
                            onClick={() => {
                              cancelReasonRef.current = "";
                              setCancelDialog({ orderId: o.id });
                            }}
                            disabled={isOrderPending}
                            className="android-press h-9 min-h-0 rounded-xl bg-red-50 px-3 text-xs font-bold text-red-600 disabled:opacity-60"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={`${CARD} px-4 py-10 text-center`}>
                <p className="mb-2 text-4xl">📋</p>
                <p className="text-sm font-bold text-gray-500">{T("noNewOrders")}</p>
                <p className="mt-1 text-xs text-gray-400">{T("newOrdersAppearHere")}</p>
              </div>
            )}
          </div>

          {/* Active Orders */}
          <div>
            {activeOrders.length > 0 ? (
              <div className={CARD}>
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                  <p className="text-sm font-bold text-gray-800">
                    {activeOrders.length} {T("activeOrders")}
                  </p>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                    {T("inProgress")}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {activeOrders.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 capitalize">{o.type}</p>
                        <p className="font-mono text-xs text-gray-400">
                          #{o.id.slice(-6).toUpperCase()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-800">{fc(o.total)}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            o.status === "preparing"
                              ? "bg-purple-100 text-purple-700"
                              : o.status === "ready"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {o.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`${CARD} px-4 py-10 text-center`}>
                <p className="mb-2 text-4xl">🍳</p>
                <p className="text-sm font-bold text-gray-500">{T("noActiveOrdersLabel")}</p>
                <p className="mt-1 text-xs text-gray-400">{T("activeOrdersShowHere")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Commission Banner — mobile only (desktop shows in header) */}
        <div className="rounded-2xl bg-gradient-to-r from-orange-500 to-blue-600 p-4 text-white shadow-sm md:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-100">{T("yourCommission")}</p>
              <p className="text-4xl font-extrabold">
                {Math.round(100 - (config.platform.vendorCommissionPct ?? DEFAULT_COMMISSION_PCT))}%
              </p>
              <p className="mt-0.5 text-xs text-orange-100">{T("ofEveryOrder")}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-orange-100">{T("allTimeEarned")}</p>
              <p className="text-2xl font-extrabold">{fc(user?.stats?.totalRevenue || 0)}</p>
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <NotificationsSection />

        {/* Active Tracker Banner — bottom position */}
        {config.content.trackerBannerEnabled &&
          config.content.trackerBannerPosition === "bottom" &&
          activeOrders.length > 0 && (
            <Link
              href="/orders"
              className="mt-4 block rounded-2xl bg-gradient-to-r from-orange-500 to-blue-600 px-4 py-3.5 shadow-lg shadow-orange-200 transition-transform active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold tracking-tight text-white">
                    {activeOrders.length} Active Order{activeOrders.length > 1 ? "s" : ""}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-white/70">
                    {activeOrders.map((o: any) => `#${o.id?.slice(-6).toUpperCase()}`).join(" · ")}
                  </p>
                </div>
                <div className="flex-shrink-0 rounded-xl bg-white/20 px-3 py-2 text-xs font-extrabold text-white backdrop-blur-sm">
                  Track →
                </div>
              </div>
            </Link>
          )}
      </div>

      {/* Live Tracking disabled notice — dismissable once per session */}
      <LiveTrackingNotice liveTracking={config.features.liveTracking} T={T} />

      {/* Accept order confirmation dialog */}
      {acceptDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
          onClick={() => setAcceptDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-lg font-extrabold text-gray-800">{T("acceptOrder")}?</h3>
            <p className="mb-4 text-sm text-gray-500">
              {T("reviewConfirm")} ({fc(acceptDialog.total)})
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setAcceptDialog(null)}
                className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600"
              >
                ← {T("back")}
              </button>
              <button
                onClick={() => {
                  orderActionMut.mutate({ orderId: acceptDialog.orderId, status: "confirmed" });
                  setAcceptDialog(null);
                }}
                className="h-11 flex-1 rounded-xl bg-green-500 text-sm font-bold text-white"
              >
                ✓ {T("confirmLabel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel order dialog with reason */}
      {cancelDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
          onClick={() => setCancelDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-lg font-extrabold text-gray-800">{T("cancelOrder")}</h3>
            <p className="mb-4 text-sm text-gray-500">{T("cancelConfirmMsg")}</p>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-400 uppercase">
              {T("reason")} ({T("noteOptional")})
            </label>
            <textarea
              rows={3}
              defaultValue={cancelReasonRef.current}
              onChange={(e) => {
                cancelReasonRef.current = e.target.value;
              }}
              placeholder="e.g. Item not available, store closing..."
              className="mb-4 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCancelDialog(null)}
                className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600"
              >
                ← {T("back")}
              </button>
              <button
                onClick={() => {
                  orderActionMut.mutate({
                    orderId: cancelDialog.orderId,
                    status: "cancelled",
                    reason: cancelReasonRef.current || undefined,
                  });
                  setCancelDialog(null);
                }}
                className="h-11 flex-1 rounded-xl bg-red-500 text-sm font-bold text-white"
              >
                ✕ {T("cancelConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Support FAB (only when feature_chat is on) */}
      {config.features.chat && (
        <a
          href={`https://wa.me/${config.platform.supportPhone.replace(/^0/, "92")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed right-4 bottom-24 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-2xl text-white shadow-2xl transition-all hover:bg-green-600 active:scale-95 md:bottom-6"
          title={config.content.supportMsg || "Live Support"}
        >
          💬
        </a>
      )}

      {toast && (
        <div
          className="toast-in fixed top-0 right-0 left-0 z-50 flex justify-center"
          style={{
            paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)",
            paddingLeft: "16px",
            paddingRight: "16px",
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-2xl">
            {toast}
          </div>
        </div>
      )}
    </PullToRefresh>
  );
}
