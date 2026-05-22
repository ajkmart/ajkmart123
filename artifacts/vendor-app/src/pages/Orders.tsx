import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { api } from "../lib/api";
import {
  markOrderSeen,
  playOrderSound,
  unlockAudio,
  wasOrderSeenRecently,
} from "../lib/notificationSound";
import { CARD, DEFAULT_COMMISSION_PCT, errMsg, fc, fd } from "../lib/ui";
import { useCurrency, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { useAuth } from "../lib/vendor-auth";

function useNow(intervalMs = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const TAB_KEYS: { key: string; labelKey: TranslationKey; icon: string }[] = [
  { key: "new", labelKey: "newLabel", icon: "🔔" },
  { key: "active", labelKey: "active", icon: "🍳" },
  { key: "delivered", labelKey: "done", icon: "✅" },
  { key: "cancelled", labelKey: "cancelled", icon: "❌" },
  { key: "all", labelKey: "all", icon: "📋" },
];

const NEXT_KEYS: Record<string, { next: string; labelKey: TranslationKey; bg: string }> = {
  pending: { next: "confirmed", labelKey: "acceptOrder", bg: "bg-green-500 text-white" },
  confirmed: { next: "preparing", labelKey: "startPreparing", bg: "bg-blue-500 text-white" },
  preparing: { next: "ready", labelKey: "markReady", bg: "bg-purple-500 text-white" },
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-purple-100 text-purple-700",
  ready: "bg-indigo-100 text-indigo-700",
  picked_up: "bg-cyan-100 text-cyan-700",
  out_for_delivery: "bg-teal-100 text-teal-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const ORDER_ICON: Record<string, string> = { food: "🍔", mart: "🛒", pharmacy: "💊", parcel: "📦" };

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Orders({ targetOrderId }: { targetOrderId?: string } = {}) {
  const qc = useQueryClient();
  const { config } = usePlatformConfig();
  const { symbol: currencySymbol } = useCurrency();
  const { language } = useLanguage();
  const { user } = useAuth();
  const T = (key: TranslationKey) => tDual(key, language);
  const orderRules = config.orderRules;
  const vendorKeep = 1 - (config.platform.vendorCommissionPct ?? DEFAULT_COMMISSION_PCT) / 100;
  const dlvFeeMap: Record<string, number> = {
    mart: config.deliveryFee.mart,
    food: config.deliveryFee.food,
    pharmacy: config.deliveryFee.pharmacy,
    parcel: config.deliveryFee.parcel,
  };
  const now = useNow(10000);

  const { isOnline, syncToast, enqueueStatusUpdate } = useOfflineQueue();

  const [tab, setTab] = useState("new");
  const [expanded, setExpanded] = useState<string | null>(targetOrderId ?? null);

  /* When arriving via a notification tap, use the prefetched per-order cache
     as an immediate seed while the list query loads in the background. */
  const { data: prefetchedOrder } = useQuery({
    queryKey: ["vendor-order", targetOrderId],
    queryFn: () => api.getVendorOrder(targetOrderId!),
    enabled: !!targetOrderId,
    staleTime: 30_000,
  });
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
  const [acceptDialog, setAcceptDialog] = useState<{ id: string; total: number } | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ id: string } | null>(null);
  const [assignModal, setAssignModal] = useState<{ orderId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "highest">("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<"accept" | "reject" | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socketConnected, setSocketConnected] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const [riderPositions, setRiderPositions] = useState<
    Record<string, { lat: number; lng: number; updatedAt: string }>
  >({});

  /* Vendor's own lat/lng — prefer backend-persisted location, fall back to browser */
  const [vendorLat, setVendorLat] = useState<number | null>(null);
  const [vendorLng, setVendorLng] = useState<number | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "granted" | "prompt" | "denied" | "unknown"
  >("unknown");

  /* Detect geolocation permission state and listen for changes */
  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        setLocationPermission(status.state as "granted" | "prompt" | "denied");
        status.onchange = () =>
          setLocationPermission(status.state as "granted" | "prompt" | "denied");
      })
      .catch(() => setLocationPermission("unknown"));
  }, []);

  /* Re-request location (used by "Try Again" button) */
  const retryLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setVendorLat(latitude);
        setVendorLng(longitude);
        void saveVendorLocationToBackend(latitude, longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocationPermission("denied");
      }
    );
  };

  const { data: availableRidersData, isLoading: ridersLoading } = useQuery({
    queryKey: ["vendor-order-riders", assignModal?.orderId],
    queryFn: async () => {
      if (!assignModal?.orderId) return { riders: [] };
      try {
        return (await api.getOrderAvailableRiders(assignModal.orderId)) as {
          riders: {
            id: string;
            name: string;
            phone: string;
            distanceKm: number | null;
            walletBalance: string;
          }[];
        };
      } catch {
        return { riders: [] };
      }
    },
    enabled: !!assignModal,
    staleTime: 30_000,
  });

  const assignRiderMut = useMutation({
    mutationFn: ({ orderId, riderId }: { orderId: string; riderId: string }) =>
      api.assignRider(orderId, riderId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      setAssignModal(null);
      showToast("✅ Rider assigned successfully!");
    },
    onError: (e: Error) => showToast("❌ " + e.message),
  });

  const autoAssignMut = useMutation({
    mutationFn: (orderId: string) => api.autoAssignRider(orderId),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      setAssignModal(null);
      showToast(`✅ Auto-assigned to ${d.riderName || "nearest rider"}!`);
    },
    onError: (e: Error) => {
      showToast("❌ " + e.message);
    },
  });
  /* Fetch vendor's persisted location from the backend live_locations store */
  const { data: vendorLocData } = useQuery({
    queryKey: ["vendor-live-location", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      try {
        return (await api.getLocation(user.id)) as { latitude: number; longitude: number } | null;
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  /* Last coordinates successfully sent to the backend — used to skip redundant calls */
  const lastSavedLocRef = useRef<{ lat: number; lng: number } | null>(null);

  /* Save vendor location to backend (used for rider dispatch radius checks).
     Skips the API call when the position hasn't moved more than ~10 metres
     (~0.0001 degrees) to avoid hammering the server with redundant updates. */
  const saveVendorLocationToBackend = async (lat: number, lng: number) => {
    const EPSILON = 0.0001;
    const last = lastSavedLocRef.current;
    if (last && Math.abs(lat - last.lat) < EPSILON && Math.abs(lng - last.lng) < EPSILON) {
      return;
    }
    try {
      await api.updateLocation({ latitude: lat, longitude: lng, role: "vendor" });
      lastSavedLocRef.current = { lat, lng };
    } catch {
      showToast("⚠️ " + T("locationSaveFailed"));
    }
  };

  useEffect(() => {
    if (vendorLocData?.latitude != null && vendorLocData?.longitude != null) {
      setVendorLat(vendorLocData.latitude);
      setVendorLng(vendorLocData.longitude);
    } else if (navigator.geolocation) {
      /* Fallback: use browser geolocation when no backend location found,
         and save the result to the backend so dispatch radius checks work */
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setVendorLat(latitude);
          setVendorLng(longitude);
          void saveVendorLocationToBackend(latitude, longitude);
        },
        () => {}
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorLocData]);

  /* Periodic refresh: re-save vendor location every 5 minutes and on window focus */
  useEffect(() => {
    if (!user?.id) return;

    const refreshLocation = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setVendorLat(latitude);
          setVendorLng(longitude);
          void saveVendorLocationToBackend(latitude, longitude);
        },
        () => {}
      );
    };

    const intervalId = setInterval(refreshLocation, 5 * 60 * 1000);
    window.addEventListener("focus", refreshLocation);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", refreshLocation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* Harden audio unlock — resume AudioContext on click, pointerdown, and
     visibilitychange (when vendor switches back to the tab) so the context is
     unlocked as early as possible without requiring a specific button press. */
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("pointerdown", unlock, { once: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") unlockAudio();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* Update browser tab title with unread order badge */
  useEffect(() => {
    const base = "Vendor Orders";
    document.title = unreadCount > 0 ? `(${unreadCount}) New Order! — ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [unreadCount]);

  /* Clear unread badge when window is focused */
  useEffect(() => {
    const handler = () => setUnreadCount(0);
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, []);

  /* Socket.io: subscribe to vendor:{userId} room for real-time order events.
   *
   * Room re-join on reconnect: `vendor:join` is emitted on every `connect`
   * event (not just the first one) so reconnections after a network drop
   * automatically restore the real-time channel without vendor action.
   * Socket.IO re-fires `connect` after each successful reconnection, making
   * this the single reliable hook for both initial join and post-disconnect
   * re-join. The `reconnect` event fires at the same time and is added as an
   * explicit belt-and-suspenders guard. */
  useEffect(() => {
    if (!user?.id) return;
    const token = api.getToken();
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      query: { rooms: `vendor:${user.id}` },
      auth: { token },
      extraHeaders: { Authorization: `Bearer ${token}` },
      transports: ["polling", "websocket"],
      /* Reconnection settings — aggressive retries so a brief network drop
         does not permanently lose the real-time channel. */
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    /* joinVendorRoom: called on initial connect AND every reconnect. */
    const joinVendorRoom = () => {
      socket.emit("join", `vendor:${user.id}`);
    };

    let isFirstConnect = true;
    socket.on("connect", () => {
      joinVendorRoom();
      setSocketConnected(true);
      if (!isFirstConnect) {
        /* Catch-up: fetch any orders that arrived while disconnected. */
        void qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      }
      isFirstConnect = false;
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    /* Belt-and-suspenders: socket.io-client `reconnect` fires after the
       transport is fully re-established. Re-emit the join in case the
       `connect` event was missed for any reason. */
    socket.io.on("reconnect", () => {
      joinVendorRoom();
      setSocketConnected(true);
    });
    socket.on(
      "rider:location",
      (payload: { userId: string; latitude: number; longitude: number; updatedAt: string }) => {
        setRiderPositions((prev) => ({
          ...prev,
          [payload.userId]: {
            lat: payload.latitude,
            lng: payload.longitude,
            updatedAt: payload.updatedAt,
          },
        }));
      }
    );
    socket.on("order:new", (payload?: { _isTest?: boolean; id?: string }) => {
      /* Deduplicate: if the FCM foreground handler already alerted for this
         order within the last 5 seconds, skip the sound/badge to avoid a
         double-alert. Cache invalidation is always safe to run. */
      const orderId = payload?.id;
      const alreadySeen = orderId ? wasOrderSeenRecently(orderId) : false;
      if (orderId && !alreadySeen) markOrderSeen(orderId);
      void qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      if (!payload?._isTest && !alreadySeen) {
        playOrderSound();
        setUnreadCount((c) => c + 1);
      }
    });
    socket.on("order:update", () => {
      void qc.invalidateQueries({ queryKey: ["vendor-orders"] });
    });
    return () => {
      socket.io.off("reconnect");
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const apiStatus = tab === "new" ? "pending" : tab;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vendor-orders", tab],
    queryFn: () => api.getOrders(apiStatus),
    refetchInterval: 15000,
    retry: 2,
  });
  const rawOrders = data?.orders || [];

  /* Merge the prefetched single-order into the list so it's visible
     immediately from cache while the full list query is still loading. */
  const mergedOrders: any[] = (() => {
    const seed = prefetchedOrder?.order;
    if (!seed || rawOrders.some((o: any) => o.id === seed.id)) return rawOrders;
    return [seed, ...rawOrders];
  })();

  const orders = mergedOrders
    .filter((o: any) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const idMatch = (o.id || "").toLowerCase().includes(q);
      const nameMatch = (o.customerName || o.userName || "").toLowerCase().includes(q);
      return idMatch || nameMatch;
    })
    .sort((a: any, b: any) => {
      if (sortOrder === "oldest")
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortOrder === "highest") return Number(b.total) - Number(a.total);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const countQ = useQuery({
    queryKey: ["vendor-orders-count"],
    queryFn: () => api.getOrders("pending"),
    refetchInterval: 15000,
    enabled: tab !== "new",
  });
  const newCount = tab === "new" ? rawOrders.length : countQ.data?.orders?.length || 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkActionMut = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      for (const id of ids) {
        await api.updateOrder(id, status);
      }
    },
    onSuccess: (_, { status }) => {
      setSelectedIds(new Set());
      setBulkConfirm(null);
      void qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      void qc.invalidateQueries({ queryKey: ["vendor-stats"] });
      showToast(status === "confirmed" ? "✅ Orders accepted!" : "❌ Orders rejected!");
    },
    onError: (e: Error) => {
      setBulkConfirm(null);
      showToast("❌ " + errMsg(e));
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      /* If offline, enqueue and show feedback without hitting network */
      if (enqueueStatusUpdate(id, status)) {
        return Promise.resolve(null);
      }
      setPendingOrderIds((s) => new Set(s).add(id));
      return api.updateOrder(id, status);
    },
    onSuccess: (result, { id, status }) => {
      if (result == null) {
        /* Queued offline — clear pending state and notify user */
        showToast(`📴 Saved offline — will sync when reconnected`);
        return;
      }
      setPendingOrderIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      void qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      void qc.invalidateQueries({ queryKey: ["vendor-stats"] });
      void qc.invalidateQueries({ queryKey: ["vendor-orders-count"] });
      void qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
      const msg: Record<string, string> = {
        confirmed: "✅ " + T("orderAccepted"),
        preparing: "🍳 " + T("preparingStarted"),
        ready: "📦 " + T("markedReady"),
        cancelled: "❌ " + T("orderCancelled"),
      };
      showToast(msg[status] || "✅ " + T("done"));
    },
    onError: (e: Error, { id }) => {
      setPendingOrderIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      showToast("❌ " + errMsg(e));
    },
  });

  const RefreshBtn = (
    <button
      onClick={() => refetch()}
      className="android-press flex h-10 min-h-0 w-10 items-center justify-center rounded-xl bg-white/20 text-lg text-white md:bg-gray-100 md:text-gray-600"
    >
      ↻
    </button>
  );

  const subtitleTab = tab === "all" ? "total" : tab;

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["vendor-orders"] });
  }, [qc]);

  return (
    <ErrorBoundary
      fallback={(reset) => (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
          <div className="mb-4 text-5xl">⚠️</div>
          <h2 className="mb-2 text-lg font-bold text-gray-900">Orders section failed to load</h2>
          <p className="mb-5 text-sm text-gray-500">
            An unexpected error occurred. Tap retry to reload this section.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Retry
          </button>
        </div>
      )}
    >
      <PullToRefresh
        onRefresh={handlePullRefresh}
        className="min-h-screen bg-[#0A0F1A] md:bg-transparent"
      >
        {/* ── Offline Banner ── */}
        {!isOnline && (
          <div className="bg-red-500 px-4 py-2 text-center text-xs font-bold text-white">
            📴 You're offline — order updates will be queued and sent when reconnected
          </div>
        )}
        {/* ── Socket.IO reconnect indicator — shown only when real-time link drops ── */}
        {isOnline && !socketConnected && (
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-bold text-white">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/70" />
            Real-time updates disconnected — reconnecting…
          </div>
        )}
        {syncToast && (
          <div className="fixed top-4 right-4 left-4 z-[9999] rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl">
            {syncToast}
          </div>
        )}
        <PageHeader
          title={T("orders")}
          subtitle={`${orders.length} ${subtitleTab} order${orders.length !== 1 ? "s" : ""}`}
          actions={RefreshBtn}
        />

        {/* ── Search + Sort ── */}
        <div className="flex gap-2 border-b border-gray-100 bg-white px-4 pt-3 pb-2 md:px-0">
          <input
            type="search"
            placeholder="Search by order ID or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest" | "highest")}
            className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest value</option>
          </select>
        </div>

        {/* ── Bulk Action Bar ── */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2 md:px-0">
            <span className="flex-1 text-xs font-bold text-orange-700">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => setBulkConfirm("accept")}
              disabled={bulkActionMut.isPending}
              className="flex h-8 items-center gap-1.5 rounded-xl bg-green-500 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkActionMut.isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />{" "}
                  Processing…
                </>
              ) : (
                "✓ Accept All"
              )}
            </button>
            <button
              onClick={() => setBulkConfirm("reject")}
              disabled={bulkActionMut.isPending}
              className="flex h-8 items-center gap-1.5 rounded-xl bg-red-100 px-4 text-xs font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkActionMut.isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />{" "}
                  Processing…
                </>
              ) : (
                "✕ Reject All"
              )}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="h-8 rounded-xl bg-gray-200 px-3 text-xs font-bold text-gray-600"
            >
              Clear
            </button>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="sticky top-0 z-10 flex border-b border-gray-200 bg-white md:mx-0">
          {TAB_KEYS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`android-press relative flex min-h-0 flex-1 flex-col items-center border-b-2 py-3 text-[11px] font-bold transition-colors ${tab === tb.key ? "border-blue-500 text-blue-600" : "border-transparent text-gray-400"}`}
            >
              <span className="mb-0.5 text-lg">{tb.icon}</span>
              {T(tb.labelKey)}
              {tb.key === "new" && newCount > 0 && (
                <span className="absolute top-1 right-1/4 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {newCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Order List ── */}
        <div className="space-y-3 px-4 py-4 md:px-0 md:py-4">
          {isError && (
            <div className={CARD}>
              <ErrorState
                title={T("somethingWentWrong")}
                subtitle={T("checkInternetRetry")}
                onRetry={() => refetch()}
                retryLabel={T("retry")}
              />
            </div>
          )}
          {!isError && isLoading ? (
            [1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)
          ) : !isError && orders.length === 0 ? (
            <div className={`${CARD} px-4 py-16 text-center`}>
              <p className="mb-3 text-5xl">{TAB_KEYS.find((tb) => tb.key === tab)?.icon}</p>
              <p className="text-base font-bold text-gray-700">
                {T(
                  tab === "cancelled"
                    ? "noCancelledOrders"
                    : tab === "active"
                      ? "noActiveOrders"
                      : tab === "delivered"
                        ? "noDeliveredOrders"
                        : tab === "all"
                          ? "noOrdersYet"
                          : "noNewOrders"
                )}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {T(
                  tab === "cancelled"
                    ? "cancelledOrdersAppear"
                    : tab === "active"
                      ? "activeOrdersAppearHere"
                      : tab === "delivered"
                        ? "deliveredOrdersAppear"
                        : tab === "all"
                          ? "ordersAppearHere"
                          : "theyAppearAutomatically"
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
              {orders.map((o: any) => {
                const next = o.status ? NEXT_KEYS[o.status] : undefined;
                const items = Array.isArray(o.items) ? o.items : [];
                const isExp = expanded === o.id;

                // Auto-cancel countdown
                const msSincePlaced = o.createdAt ? now - new Date(o.createdAt).getTime() : 0;
                const autoCancelMs = (orderRules.autoCancelMin ?? 15) * 60 * 1000;
                const msLeft = Math.max(0, autoCancelMs - msSincePlaced);
                const minsLeft = Math.floor(msLeft / 60000);
                const secsLeft = Math.floor((msLeft % 60000) / 1000);
                const isPendingTimer = o.status === "pending" && msLeft > 0;
                const pct = (msLeft / autoCancelMs) * 100;
                const timerRed = minsLeft <= 2 && isPendingTimer;
                const isOrderPending = pendingOrderIds.has(o.id);
                const orderDeliveryFee =
                  o.deliveryFee != null ? o.deliveryFee : (dlvFeeMap[o.type] ?? dlvFeeMap.mart);
                /* Cancel window: vendor can only cancel within 5 minutes */
                const msSincePlacedForCancel = o.createdAt
                  ? Date.now() - new Date(o.createdAt).getTime()
                  : 0;
                const cancelWindowExpired = msSincePlacedForCancel > 5 * 60 * 1000;

                return (
                  <div
                    key={o.id}
                    className={`${CARD}${o.status === "pending" ? "border-l-4 border-blue-400" : ""}${selectedIds.has(o.id) ? "ring-2 ring-orange-400" : ""}`}
                  >
                    {/* Auto-cancel countdown bar */}
                    {isPendingTimer && (
                      <div className="px-4 pt-3 pb-1">
                        <div className="mb-1 flex items-center justify-between">
                          <span
                            className={`text-[10px] font-bold tracking-wide ${timerRed ? "text-red-600" : "text-blue-500"}`}
                          >
                            {timerRed ? "⚠️ AUTO-CANCEL IN" : "⏱ AUTO-CANCEL IN"}
                          </span>
                          <span
                            className={`text-[11px] font-extrabold tabular-nums ${timerRed ? "text-red-600" : "text-blue-600"}`}
                          >
                            {minsLeft}:{String(secsLeft).padStart(2, "0")}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${timerRed ? "bg-red-500" : "bg-orange-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Order Row */}
                    <button
                      className="android-press flex min-h-0 w-full items-center gap-3 px-4 py-3.5 text-left"
                      onClick={() => setExpanded(isExp ? null : o.id)}
                    >
                      <div
                        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl ${o.type === "food" ? "bg-red-50" : "bg-blue-50"}`}
                      >
                        {ORDER_ICON[o.type] || "📦"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${(o.status && STATUS_BADGE[o.status]) || "bg-gray-100 text-gray-600"}`}
                          >
                            {o.status ? o.status.replace(/_/g, " ").toUpperCase() : "UNKNOWN"}
                          </span>
                          <span className="font-mono text-xs text-gray-400">
                            #{(o.id || "").slice(-6).toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {fd(o.createdAt)} · {items.length} items
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-base font-extrabold text-gray-800">{fc(o.total)}</p>
                        <p className="text-xs font-semibold text-green-600">
                          +{fc(Number(o.total) * vendorKeep)}
                        </p>
                        <span className="text-xs text-gray-300">{isExp ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {/* Quick Accept + Checkbox for bulk */}
                    {!isExp && o.status === "pending" && (
                      <div className="flex items-center gap-2 px-4 pb-3">
                        <label
                          className="flex flex-shrink-0 cursor-pointer items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(o.id)}
                            onChange={() => toggleSelect(o.id)}
                            className="h-4 w-4 rounded accent-orange-500"
                          />
                        </label>
                        <button
                          onClick={() => setAcceptDialog({ id: o.id, total: o.total })}
                          disabled={isOrderPending}
                          className="android-press h-10 flex-1 rounded-xl bg-green-500 text-sm font-bold text-white disabled:opacity-60"
                        >
                          ✓ Accept
                        </button>
                        <button
                          onClick={() => setRejectDialog({ id: o.id })}
                          disabled={isOrderPending}
                          className="android-press h-10 rounded-xl bg-red-50 px-4 text-sm font-bold text-red-600 disabled:opacity-60"
                        >
                          ✕ Reject
                        </button>
                      </div>
                    )}

                    {/* Expanded Detail */}
                    {isExp && (
                      <div className="slide-up border-t border-gray-50">
                        {items.length > 0 && (
                          <div className="space-y-2 bg-gray-50 px-4 py-3">
                            <p className="text-[10px] font-extrabold tracking-widest text-gray-400">
                              {T("orderItems")}
                            </p>
                            {items.map((item: any, i: number) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span className="text-gray-700">
                                  {item.name}{" "}
                                  <span className="text-gray-400">×{item.quantity}</span>
                                </span>
                                <span className="font-semibold text-gray-800">
                                  {fc((item.price || 0) * (item.quantity || 1))}
                                </span>
                              </div>
                            ))}
                            <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-bold">
                              <span className="text-gray-600">{T("subtotal")}</span>
                              <span className="text-blue-600">{fc(o.total)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">🚚 {T("deliveryFee")}</span>
                              <span className="font-semibold text-sky-600">
                                {fc(orderDeliveryFee)}
                              </span>
                            </div>
                            <div className="-mt-1 flex justify-between text-[11px] text-gray-400">
                              <span>
                                {T("chargedToCustomer")} · Rider keeps{" "}
                                {config.finance.riderEarningPct}%
                              </span>
                              <span>
                                +{fc((orderDeliveryFee * config.finance.riderEarningPct) / 100)}{" "}
                                rider
                              </span>
                            </div>
                          </div>
                        )}
                        {o.deliveryAddress && (
                          <div className="flex items-start gap-2 border-t border-gray-50 px-4 py-3">
                            <span className="mt-0.5 text-base">📍</span>
                            <p className="text-sm leading-relaxed text-gray-600">
                              {o.deliveryAddress}
                            </p>
                          </div>
                        )}
                        {(o.status === "picked_up" || o.status === "out_for_delivery") && (
                          <div
                            className={`flex items-center gap-2 border-t border-gray-50 px-4 py-3 ${o.status === "out_for_delivery" ? "bg-teal-50" : "bg-cyan-50"}`}
                          >
                            <span className="text-base">🏍️</span>
                            <p className="text-sm font-bold text-gray-700">
                              {o.status === "picked_up"
                                ? "Rider has picked up your order"
                                : "Order is out for delivery"}
                            </p>
                          </div>
                        )}
                        {o.riderName && (
                          <div className="flex items-center gap-2 border-t border-gray-50 px-4 py-3">
                            <span className="text-base">🏍️</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-700">{o.riderName}</p>
                              {o.riderPhone && (
                                <p className="text-xs text-gray-400">{o.riderPhone}</p>
                              )}
                              {/* Live distance/ETA badge */}
                              {o.riderId &&
                                riderPositions[o.riderId] &&
                                vendorLat != null &&
                                vendorLng != null &&
                                (() => {
                                  const rp = riderPositions[o.riderId!]!;
                                  const distKm = haversineKm(rp.lat, rp.lng, vendorLat, vendorLng);
                                  const etaMin = Math.max(1, Math.round(distKm / 0.5));
                                  return (
                                    <p className="mt-0.5 text-xs font-bold text-green-600">
                                      📍{" "}
                                      {distKm < 1
                                        ? `${Math.round(distKm * 1000)}m`
                                        : `${distKm.toFixed(1)} km`}{" "}
                                      away · ETA ~{etaMin} min
                                    </p>
                                  );
                                })()}
                            </div>
                            {o.riderPhone && (
                              <a
                                href={`tel:${o.riderPhone}`}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600"
                              >
                                📞 Call
                              </a>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 border-t border-gray-50 px-4 py-3">
                          <span className="text-base">💳</span>
                          <p className="text-sm font-medium text-gray-600 capitalize">
                            {o.paymentMethod || T("cashOnDelivery")}
                          </p>
                        </div>
                        {next && !["picked_up", "out_for_delivery"].includes(o.status) && (
                          <div className="flex gap-2 px-4 pt-2 pb-4">
                            <button
                              onClick={() =>
                                o.status === "pending"
                                  ? setAcceptDialog({ id: o.id, total: o.total })
                                  : updateMut.mutate({ id: o.id, status: next.next })
                              }
                              disabled={isOrderPending}
                              className={`h-11 flex-1 ${next.bg} android-press rounded-xl text-sm font-bold disabled:opacity-60`}
                            >
                              {T(next.labelKey)}
                            </button>
                            {o.status === "pending" && (
                              <button
                                onClick={() => setRejectDialog({ id: o.id })}
                                disabled={isOrderPending || cancelWindowExpired}
                                title={
                                  cancelWindowExpired
                                    ? "Cancellation window (5 min) has passed"
                                    : undefined
                                }
                                className="android-press h-11 rounded-xl bg-red-50 px-4 text-sm font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {cancelWindowExpired ? "🔒 Window Closed" : `✕ ${T("rejectOrder")}`}
                              </button>
                            )}
                          </div>
                        )}
                        {/* Assign Rider button — show for ready/preparing orders with no rider yet */}
                        {(o.status === "ready" || o.status === "preparing") && !o.riderId && (
                          <div className="flex gap-2 px-4 pt-1 pb-4">
                            <button
                              onClick={() => setAssignModal({ orderId: o.id })}
                              className="android-press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-sm font-bold text-white"
                            >
                              🏍️ Assign Rider
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bulk Action Confirm Dialog */}
        {bulkConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
            onClick={() => setBulkConfirm(null)}
          >
            <div
              className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl md:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-1 text-lg font-extrabold text-gray-800">
                {bulkConfirm === "accept"
                  ? `Accept ${selectedIds.size} Orders?`
                  : `Reject ${selectedIds.size} Orders?`}
              </h3>
              <p className="mb-5 text-sm text-gray-500">
                {bulkConfirm === "accept"
                  ? "This will confirm all selected pending orders and deduct stock."
                  : "This will cancel all selected pending orders. This cannot be undone."}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setBulkConfirm(null)}
                  className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600"
                >
                  ← Back
                </button>
                <button
                  onClick={() =>
                    bulkActionMut.mutate({
                      ids: Array.from(selectedIds),
                      status: bulkConfirm === "accept" ? "confirmed" : "cancelled",
                    })
                  }
                  disabled={bulkActionMut.isPending}
                  className={`h-11 flex-1 rounded-xl text-sm font-bold ${bulkConfirm === "accept" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
                >
                  {bulkActionMut.isPending
                    ? "Processing..."
                    : bulkConfirm === "accept"
                      ? "✓ Confirm Accept"
                      : "✕ Confirm Reject"}
                </button>
              </div>
            </div>
          </div>
        )}

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
              <h3 className="mb-1 text-lg font-extrabold text-gray-800">Accept Order?</h3>
              <p className="mb-4 text-sm text-gray-500">
                Yeh order accept karna chahte hain? / By accepting, you commit to preparing this
                order ({fc(acceptDialog.total)}) within the required time.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setAcceptDialog(null)}
                  className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600"
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    updateMut.mutate({ id: acceptDialog.id, status: "confirmed" });
                    setAcceptDialog(null);
                  }}
                  className="h-11 flex-1 rounded-xl bg-green-500 text-sm font-bold text-white"
                >
                  ✓ Confirm Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject order dialog */}
        {rejectDialog && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
            onClick={() => setRejectDialog(null)}
          >
            <div
              className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl md:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-1 text-lg font-extrabold text-gray-800">Reject Order?</h3>
              <p className="mb-4 text-sm text-gray-500">
                Kya aap yeh order reject karna chahtay hain? / Are you sure you want to reject this
                order? This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setRejectDialog(null)}
                  className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600"
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    updateMut.mutate({ id: rejectDialog.id, status: "cancelled" });
                    setRejectDialog(null);
                  }}
                  className="h-11 flex-1 rounded-xl bg-red-500 text-sm font-bold text-white"
                >
                  ✕ Confirm Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assign Rider Modal */}
        {assignModal && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center"
            onClick={() => setAssignModal(null)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl md:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Assign Delivery Rider</h3>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Order #{assignModal.orderId.slice(-6).toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => setAssignModal(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500"
                >
                  ✕
                </button>
              </div>

              {/* Location guidance banner — shown when vendor location is unavailable */}
              {vendorLat == null && (
                <div
                  className={`mx-5 mt-3 flex gap-2.5 rounded-xl p-3 ${locationPermission === "denied" ? "border border-red-200 bg-red-50" : "border border-amber-200 bg-amber-50"}`}
                >
                  <span className="mt-0.5 flex-shrink-0 text-base">
                    {locationPermission === "denied" ? "🚫" : "📍"}
                  </span>
                  <div className="min-w-0 flex-1">
                    {locationPermission === "denied" ? (
                      <>
                        <p className="text-xs font-bold text-red-700">
                          Location permission blocked
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-red-600">
                          {/Firefox/.test(navigator.userAgent)
                            ? "In Firefox: click the lock icon in the address bar → Connection Secure → More Information → Permissions → Access Your Location → unblock."
                            : /Safari/.test(navigator.userAgent) &&
                                !/Chrome/.test(navigator.userAgent)
                              ? "In Safari: go to Settings → Safari → Location → set this website to Allow."
                              : "In Chrome/Edge: click the lock 🔒 icon in the address bar → Site Settings → Location → Allow. Then refresh this page."}
                        </p>
                        <a
                          href="https://support.google.com/chrome/answer/142065"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-block text-[11px] font-bold text-red-700 underline"
                        >
                          How to enable location →
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-amber-700">
                          Location access required for auto-assign
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-amber-600">
                          Riders are shown without distance sorting. Allow location for
                          nearest-rider auto-assign.
                        </p>
                        <button
                          onClick={retryLocation}
                          className="mt-1.5 text-[11px] font-bold text-amber-700 underline"
                        >
                          Try Again (re-request location)
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Auto-assign button */}
              <div className="border-b border-gray-50 px-5 py-3">
                <button
                  disabled={autoAssignMut.isPending}
                  onClick={() => autoAssignMut.mutate(assignModal.orderId)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-bold text-white disabled:opacity-50"
                >
                  {autoAssignMut.isPending ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{" "}
                      Auto-assigning...
                    </>
                  ) : (
                    <>⚡ Auto-Assign Nearest Rider (≤5 km)</>
                  )}
                </button>
                <p className="mt-1.5 text-center text-[10px] text-gray-400">
                  Selects the closest rider within 5 km of the delivery address
                </p>
              </div>

              {/* Manual rider list */}
              <div className="px-5 py-3">
                <p className="mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">
                  {vendorLat == null ? "All Online Riders" : "Or choose manually"}
                </p>
                {ridersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
                    ))}
                  </div>
                ) : !availableRidersData?.riders?.length ? (
                  <div className="py-8 text-center">
                    <p className="mb-2 text-3xl">🏍️</p>
                    <p className="text-sm font-semibold text-gray-600">
                      No riders currently online
                    </p>
                    <p className="mt-1 text-xs text-gray-400">Try again in a few minutes</p>
                  </div>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {availableRidersData.riders.map((rider) => (
                      <button
                        key={rider.id}
                        disabled={assignRiderMut.isPending}
                        onClick={() =>
                          assignRiderMut.mutate({ orderId: assignModal.orderId, riderId: rider.id })
                        }
                        className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm">
                          🏍️
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-gray-800">{rider.name}</p>
                          <p className="text-xs text-gray-400">{rider.phone}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {rider.distanceKm != null ? (
                            <p className="text-xs font-bold text-indigo-600">
                              {rider.distanceKm.toFixed(1)} km
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400">— km</p>
                          )}
                          <p className="text-[10px] font-semibold text-green-600">
                            {fc(rider.walletBalance, currencySymbol)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-4" />
            </div>
          </div>
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
    </ErrorBoundary>
  );
}
