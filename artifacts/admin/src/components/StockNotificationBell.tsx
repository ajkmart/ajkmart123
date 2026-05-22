import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { adminFetch } from "@/lib/adminFetcher";
import { getAdminSocket } from "@/lib/adminSocket";
import { createLogger } from "@/lib/logger";
import {
  AlertTriangle,
  Bell,
  ExternalLink,
  Package,
  RefreshCw,
  TrendingDown,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Socket } from "socket.io-client";
import { Link } from "wouter";
const log = createLogger("[StockNotificationBell]");

const LOW_STOCK_THRESHOLD = 5;

interface StockNotification {
  id: string;
  productId: string;
  productName: string | null;
  vendorId: string;
  previousStock: number | null;
  newStock: number | null;
  quantityDelta: number | null;
  reason: string;
  source: string;
  orderId: string | null;
  changedAt: string;
  isLow: boolean;
  isOutOfStock: boolean;
}

function relativeTime(ts: string | number): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "order":
      return "Order";
    case "order_confirmed":
      return "Confirmed";
    case "manual":
      return "Manual";
    default:
      return reason;
  }
}

function NotificationRow({ n }: { n: StockNotification }) {
  const isOut = n.isOutOfStock;
  const isLow = n.isLow && !isOut;

  return (
    <div
      className={`flex items-start gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50 ${isOut ? "bg-red-50/40" : isLow ? "bg-amber-50/40" : ""}`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isOut ? "bg-red-100" : isLow ? "bg-amber-100" : "bg-blue-50"}`}
      >
        {isOut ? (
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
        ) : isLow ? (
          <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
        ) : (
          <Package className="h-3.5 w-3.5 text-blue-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm leading-tight font-semibold ${isOut ? "text-red-700" : isLow ? "text-amber-700" : "text-gray-800"}`}
        >
          {isOut ? "Out of Stock" : isLow ? "Low Stock Alert" : "Stock Updated"}
        </p>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {n.productName ?? n.productId} — {n.newStock ?? 0} units left
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[10px] text-gray-400">{reasonLabel(n.reason)}</span>
          {n.quantityDelta != null && n.quantityDelta !== 0 && (
            <span
              className={`text-[10px] font-bold ${n.quantityDelta < 0 ? "text-red-500" : "text-green-600"}`}
            >
              {n.quantityDelta > 0 ? "+" : ""}
              {n.quantityDelta}
            </span>
          )}
        </div>
      </div>
      <span className="mt-0.5 shrink-0 text-[10px] whitespace-nowrap text-gray-400 tabular-nums">
        {relativeTime(n.changedAt)}
      </span>
    </div>
  );
}

export function StockNotificationBell() {
  const { state } = useAdminAuth();
  const { has, isSuper } = usePermissions();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<StockNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [_lastRead, setLastRead] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem("ajkmart_stock_bell_read") ?? "0", 10) || 0;
    } catch {
      return 0;
    }
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await adminFetch("/stock-notifications")) as {
        notifications: StockNotification[];
      };
      const list = data.notifications ?? [];
      setNotifications(list);
      // Badge = ALL currently low/out-of-stock items from DB so the count
      // persists across page refreshes, not just items since last read.
      const alertCount = list.filter((n) => n.isLow || n.isOutOfStock).length;
      setUnreadCount(alertCount);
      // eslint-disable-next-line ajk-local/no-silent-catch -- stock notification fetch failure is non-critical; badge simply stays empty
    } catch {
      /* silent — badge just won't show */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!state.accessToken) return;
    const socket = getAdminSocket(state.accessToken);
    socketRef.current = socket;

    type StockPayload = {
      productId: string;
      productName?: string;
      vendorId: string;
      stock: number;
      inStock: boolean;
    };

    const onStockLow = (payload: StockPayload) => {
      const isOut = payload.stock <= 0;
      toast({
        title: isOut ? "⚠️ Out of Stock" : "⚠️ Low Stock Alert",
        description: `"${payload.productName ?? payload.productId}" — ${payload.stock} unit${payload.stock !== 1 ? "s" : ""} remaining`,
        variant: isOut ? "destructive" : "default",
      });
      const synthetic: StockNotification = {
        id: `live-${Date.now()}`,
        productId: payload.productId,
        productName: payload.productName ?? null,
        vendorId: payload.vendorId,
        previousStock: null,
        newStock: payload.stock,
        quantityDelta: null,
        reason: "order",
        source: "live",
        orderId: null,
        changedAt: new Date().toISOString(),
        isLow: !isOut && payload.stock < LOW_STOCK_THRESHOLD,
        isOutOfStock: isOut,
      };
      setNotifications((prev) => [synthetic, ...prev].slice(0, 60));
      setUnreadCount((c) => c + 1);
    };

    const onStockUpdated = (payload: StockPayload) => {
      const isOut = payload.stock <= 0;
      const isLow = !isOut && payload.stock < LOW_STOCK_THRESHOLD;
      if (!isLow && !isOut) return;
      const synthetic: StockNotification = {
        id: `live-upd-${Date.now()}`,
        productId: payload.productId,
        productName: payload.productName ?? null,
        vendorId: payload.vendorId,
        previousStock: null,
        newStock: payload.stock,
        quantityDelta: null,
        reason: "order",
        source: "live",
        orderId: null,
        changedAt: new Date().toISOString(),
        isLow,
        isOutOfStock: isOut,
      };
      setNotifications((prev) => {
        const exists = prev.findIndex(
          (n) => n.productId === payload.productId && n.source === "live"
        );
        if (exists >= 0) {
          const next = [...prev];
          next[exists] = synthetic;
          return next;
        }
        return [synthetic, ...prev].slice(0, 60);
      });
    };

    socket.on("product:stock_low", onStockLow);
    socket.on("product:stock_updated", onStockUpdated);

    return () => {
      socket.off("product:stock_low", onStockLow);
      socket.off("product:stock_updated", onStockUpdated);
      socketRef.current = null;
    };
  }, [state.accessToken]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((o) => {
      if (!o) {
        const now = Date.now();
        setLastRead(now);
        setUnreadCount(0);
        try {
          localStorage.setItem("ajkmart_stock_bell_read", String(now));
        } catch (err) {
          log.debug(
            { err: err instanceof Error ? err.message : String(err) },
            "[StockNotificationBell] localStorage unavailable — skipping persistence"
          );
        }
      }
      return !o;
    });
  };

  const lowAndOut = notifications.filter((n) => n.isLow || n.isOutOfStock);
  const displayList = open ? (lowAndOut.length > 0 ? lowAndOut : notifications).slice(0, 20) : [];

  // Only render for super-admins or admins with inventory.view permission.
  if (!isSuper && !has("inventory.view")) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        aria-label={`Stock notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-150 hover:bg-amber-50"
        style={{
          borderColor: unreadCount > 0 ? "rgba(245,158,11,0.3)" : "rgba(0,0,0,0.08)",
          background: open ? "rgba(245,158,11,0.06)" : undefined,
        }}
      >
        <Bell className={`h-4 w-4 ${unreadCount > 0 ? "text-amber-500" : "text-slate-400"}`} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full text-[9px] font-black text-white"
            style={{
              background: "#EF4444",
              padding: "0 3px",
              boxShadow: "0 1px 4px rgba(239,68,68,0.5)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full right-0 z-50 mt-2 overflow-hidden rounded-2xl"
          style={{
            width: 340,
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.14)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
          >
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-bold text-gray-800">Stock Alerts</span>
              {lowAndOut.length > 0 && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                  {lowAndOut.length} alert{lowAndOut.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchNotifications}
                disabled={loading}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100"
                title="Refresh"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : displayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-green-50">
                  <Package className="h-4.5 w-4.5 text-green-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700">All stock levels healthy</p>
                <p className="text-xs text-gray-400">
                  No low-stock or out-of-stock products right now.
                </p>
              </div>
            ) : (
              displayList.map((n) => <NotificationRow key={n.id} n={n} />)
            )}
          </div>

          <div className="px-4 py-2.5" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
            <Link href="/products" onClick={() => setOpen(false)}>
              <div className="flex cursor-pointer items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700">
                View all products
                <ExternalLink className="h-3 w-3" />
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
