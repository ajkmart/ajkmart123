import { toast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { getAdminSocket } from "@/lib/adminSocket";
import { createLogger } from "@/lib/logger";
import {
  AlertTriangle,
  Bell,
  Check,
  ExternalLink,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Socket } from "socket.io-client";
import { Link, useLocation } from "wouter";
const log = createLogger("[AdminNotificationBell]");

// ─── Types ───────────────────────────────────────────────────────────────────

type NotifType = "order" | "sos" | "kyc";

interface AdminNotif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  href: string;
  ts: number;
  read: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

const TYPE_META: Record<
  NotifType,
  { label: string; href: string; iconBg: string; iconColor: string }
> = {
  order: { label: "New Order", href: "/orders", iconBg: "bg-blue-50", iconColor: "text-blue-500" },
  sos: { label: "SOS Alert", href: "/sos-alerts", iconBg: "bg-red-50", iconColor: "text-red-500" },
  kyc: {
    label: "KYC Submission",
    href: "/kyc",
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-500",
  },
};

const LS_KEY = "ajkmart_admin_bell_read";

function loadReadTs(): number {
  try {
    return parseInt(localStorage.getItem(LS_KEY) ?? "0", 10) || 0;
  } catch (err) {
    log.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[AdminNotificationBell] localStorage unavailable — defaulting readTs=0"
    );
    return 0;
  }
}

function saveReadTs(ts: number): void {
  try {
    localStorage.setItem(LS_KEY, String(ts));
  } catch (err) {
    log.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[AdminNotificationBell] localStorage unavailable — skipping persistence"
    );
  }
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function NotifRow({ n, onClick }: { n: AdminNotif; onClick: () => void }) {
  const meta = TYPE_META[n.type];
  const Icon = n.type === "order" ? ShoppingBag : n.type === "sos" ? AlertTriangle : ShieldCheck;

  return (
    <Link href={meta.href} onClick={onClick}>
      <div
        className={`flex cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50 ${!n.read ? "bg-blue-50/30" : ""}`}
      >
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.iconBg}`}
        >
          <Icon className={`h-3.5 w-3.5 ${meta.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-semibold text-gray-800">{meta.label}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">{n.body}</p>
        </div>
        <span className="mt-0.5 shrink-0 text-[10px] whitespace-nowrap text-gray-400 tabular-nums">
          {relativeTime(n.ts)}
        </span>
      </div>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminNotificationBell() {
  const { state } = useAdminAuth();
  const [, _setLocation] = useLocation();

  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<AdminNotif[]>([]);
  const [unread, setUnread] = useState(0);
  const [lastRead, setLastRead] = useState<number>(loadReadTs);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Recompute unread count whenever notifs or lastRead changes
  useEffect(() => {
    setUnread(notifs.filter((n) => n.ts > lastRead).length);
  }, [notifs, lastRead]);

  // Socket listeners
  useEffect(() => {
    if (!state.accessToken) return;
    const socket = getAdminSocket(state.accessToken);
    socketRef.current = socket;

    type OrderPayload = {
      id?: string;
      total?: string | number;
      status?: string;
      itemCount?: number;
      items?: unknown[];
    };
    type SosPayload = {
      id?: string;
      userId?: string;
      title?: string;
      body?: string;
      createdAt?: string;
    };
    type KycPayload = { userId: string; submittedAt: string };

    const onOrder = (data: OrderPayload) => {
      if (data?.status && data.status !== "pending") return;
      const itemCount = data.items ? (data.items as unknown[]).length : (data.itemCount ?? 0);
      const total = data.total != null ? `Rs. ${Number(data.total).toFixed(0)}` : "";
      const n: AdminNotif = {
        id: `order-${data.id ?? Date.now()}`,
        type: "order",
        title: "New Order",
        body:
          [total, itemCount ? `${itemCount} item${itemCount !== 1 ? "s" : ""}` : ""]
            .filter(Boolean)
            .join(" · ") || "A new order was placed",
        href: data.id ? `/orders/${data.id}` : "/orders",
        ts: Date.now(),
        read: false,
      };
      setNotifs((prev) => [n, ...prev].slice(0, 50));
      toast({ title: "📦 New Order", description: n.body });
    };

    const onSos = (data: SosPayload) => {
      const n: AdminNotif = {
        id: `sos-${data.id ?? Date.now()}`,
        type: "sos",
        title: "SOS Alert",
        body: data.title ?? data.body ?? "Emergency alert from a user",
        href: "/sos-alerts",
        ts: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
        read: false,
      };
      setNotifs((prev) => [n, ...prev].slice(0, 50));
      toast({ title: "🚨 SOS Alert", description: n.body, variant: "destructive" });
    };

    const onKyc = (data: KycPayload) => {
      const n: AdminNotif = {
        id: `kyc-${data.userId}-${Date.now()}`,
        type: "kyc",
        title: "KYC Submission",
        body: "A user submitted identity documents for review",
        href: "/kyc",
        ts: data.submittedAt ? new Date(data.submittedAt).getTime() : Date.now(),
        read: false,
      };
      setNotifs((prev) => [n, ...prev].slice(0, 50));
      toast({ title: "🪪 KYC Submission", description: n.body });
    };

    socket.on("order:new", onOrder);
    socket.on("sos:new", onSos);
    socket.on("kyc:submitted", onKyc);

    return () => {
      socket.off("order:new", onOrder);
      socket.off("sos:new", onSos);
      socket.off("kyc:submitted", onKyc);
      socketRef.current = null;
    };
  }, [state.accessToken]);

  // Outside-click dismissal
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

  const handleOpen = useCallback(() => {
    setOpen((o) => {
      if (!o) {
        const now = Date.now();
        setLastRead(now);
        setUnread(0);
        saveReadTs(now);
        // Mark all in-memory notifs as read
        setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
      }
      return !o;
    });
  }, []);

  const handleRowClick = useCallback(() => {
    setOpen(false);
  }, []);

  const handleClearAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifs([]);
    const now = Date.now();
    setLastRead(now);
    setUnread(0);
    saveReadTs(now);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-150 hover:bg-indigo-50"
        style={{
          borderColor: unread > 0 ? "rgba(99,102,241,0.3)" : "rgba(0,0,0,0.08)",
          background: open ? "rgba(99,102,241,0.06)" : undefined,
        }}
      >
        <Bell className={`h-4 w-4 ${unread > 0 ? "text-indigo-500" : "text-slate-400"}`} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] animate-bounce items-center justify-center rounded-full text-[9px] font-black text-white"
            style={{
              background: "#EF4444",
              padding: "0 3px",
              boxShadow: "0 1px 4px rgba(239,68,68,0.5)",
              animationIterationCount: 3,
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 z-50 mt-2 overflow-hidden rounded-2xl"
          style={{
            width: 340,
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.14)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
          >
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-bold text-gray-800">Notifications</span>
              {notifs.length > 0 && (
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                  {notifs.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {notifs.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="Clear all"
                >
                  <Check className="h-2.5 w-2.5" />
                  Clear all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100"
                aria-label="Close notifications"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50">
                  <Bell className="h-4 w-4 text-indigo-300" />
                </div>
                <p className="text-sm font-semibold text-gray-700">You're all caught up</p>
                <p className="text-xs text-gray-400">
                  New orders, KYC submissions, and SOS alerts will appear here.
                </p>
              </div>
            ) : (
              notifs.map((n) => <NotifRow key={n.id} n={n} onClick={handleRowClick} />)
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <Link href="/orders" onClick={handleRowClick}>
                  <span className="flex cursor-pointer items-center gap-1 font-semibold text-blue-500 transition-colors hover:text-blue-700">
                    Orders <ExternalLink className="h-2.5 w-2.5" />
                  </span>
                </Link>
                <Link href="/kyc" onClick={handleRowClick}>
                  <span className="flex cursor-pointer items-center gap-1 font-semibold text-indigo-500 transition-colors hover:text-indigo-700">
                    KYC <ExternalLink className="h-2.5 w-2.5" />
                  </span>
                </Link>
                <Link href="/sos-alerts" onClick={handleRowClick}>
                  <span className="flex cursor-pointer items-center gap-1 font-semibold text-red-500 transition-colors hover:text-red-700">
                    SOS <ExternalLink className="h-2.5 w-2.5" />
                  </span>
                </Link>
              </div>
              <span className="text-[10px] text-gray-300">Live via WebSocket</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
