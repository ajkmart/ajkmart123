import { useAdminAuth } from "@/lib/adminAuthContext";
import { getAdminSocket } from "@/lib/adminSocket";
import { useEffect, useRef, useState } from "react";
import { type Socket } from "socket.io-client";

export type ActivityEventType =
  | "order:new"
  | "order:update"
  | "ride:dispatch_update"
  | "rider:sos"
  | "rider:status"
  | "rider:offline"
  | "rider:spoof-alert"
  | "wallet:admin-topup"
  | "wallet:deposit-approved"
  | "product:stock_updated"
  | "product:stock_low";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  subtitle: string;
  ts: number;
  payload: unknown;
}

const MAX_EVENTS = 50;

function describe(
  type: ActivityEventType,
  payload: Record<string, unknown>
): { title: string; subtitle: string } {
  const p = payload ?? {};
  switch (type) {
    case "order:new":
      return {
        title: `New ${String(p.type ?? "order")} order`,
        subtitle: `#${String(p.id ?? "")
          .slice(-6)
          .toUpperCase()} · Rs. ${p.total ?? "?"}`,
      };
    case "order:update":
      return {
        title: `Order ${String(p.status ?? "updated").replace(/_/g, " ")}`,
        subtitle: `#${String(p.id ?? "")
          .slice(-6)
          .toUpperCase()} · ${p.type ?? ""}`,
      };
    case "ride:dispatch_update": {
      const status = String(p.status ?? p.event ?? "updated").replace(/_/g, " ");
      const ref = p.rideId
        ? `#${String(p.rideId).slice(-6).toUpperCase()}`
        : p.orderId
          ? `#${String(p.orderId).slice(-6).toUpperCase()}`
          : "";
      return { title: `Ride ${status}`, subtitle: ref };
    }
    case "rider:sos":
      return {
        title: "SOS Alert",
        subtitle: p.riderId
          ? `Rider #${String(p.riderId).slice(-6).toUpperCase()}`
          : "Emergency alert received",
      };
    case "rider:status":
      return {
        title: `Rider ${String(p.status ?? "status changed")}`,
        subtitle: p.riderId ? `#${String(p.riderId).slice(-6).toUpperCase()}` : "Fleet update",
      };
    case "rider:offline":
      return {
        title: "Rider went offline",
        subtitle: p.riderId
          ? `#${String(p.riderId).slice(-6).toUpperCase()}`
          : "Inactive rider removed",
      };
    case "rider:spoof-alert":
      return {
        title: "GPS Spoof Detected",
        subtitle: p.riderId
          ? `Rider #${String(p.riderId).slice(-6).toUpperCase()}`
          : "Suspicious GPS activity",
      };
    case "wallet:admin-topup":
      return {
        title: "Admin wallet top-up",
        subtitle:
          p.amount != null ? `Rs. ${Number(p.amount).toLocaleString()}` : "Balance credited",
      };
    case "wallet:deposit-approved":
      return {
        title: "Deposit approved",
        subtitle: p.amount != null ? `Rs. ${Number(p.amount).toLocaleString()}` : "Wallet credited",
      };
    case "product:stock_updated":
      return {
        title: "Stock updated",
        subtitle: p.productName
          ? `${String(p.productName)} — ${p.stock ?? 0} units`
          : `Product ${String(p.productId ?? "")
              .slice(-6)
              .toUpperCase()} — ${p.stock ?? 0} units`,
      };
    case "product:stock_low":
      return {
        title: (p.stock as number) <= 0 ? "Out of stock!" : "Low stock alert",
        subtitle: p.productName
          ? `${String(p.productName)} — ${p.stock ?? 0} units left`
          : `Product ${String(p.productId ?? "")
              .slice(-6)
              .toUpperCase()} — ${p.stock ?? 0} units`,
      };
    default:
      return { title: String(type), subtitle: "" };
  }
}

let _counter = 0;
function nextId() {
  return `af-${Date.now()}-${++_counter}`;
}

const FEED_EVENTS: ActivityEventType[] = [
  "order:new",
  "order:update",
  "ride:dispatch_update",
  "rider:sos",
  "rider:status",
  "rider:offline",
  "rider:spoof-alert",
  "wallet:admin-topup",
  "wallet:deposit-approved",
  "product:stock_updated",
  "product:stock_low",
];

export function useActivityFeed() {
  const { state } = useAdminAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!state.accessToken) return;

    const socket = getAdminSocket(state.accessToken);
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    if (socket.connected) setConnected(true);

    function push(type: ActivityEventType, payload: unknown) {
      const safe = (payload && typeof payload === "object" ? payload : {}) as Record<
        string,
        unknown
      >;
      const { title, subtitle } = describe(type, safe);
      setEvents((prev) => {
        const next: ActivityEvent[] = [
          { id: nextId(), type, title, subtitle, ts: Date.now(), payload },
          ...prev,
        ];
        return next.slice(0, MAX_EVENTS);
      });
    }

    const handlers = new Map<ActivityEventType, (payload: unknown) => void>();
    FEED_EVENTS.forEach((ev) => {
      const handler = (payload: unknown) => push(ev, payload);
      handlers.set(ev, handler);
      socket.on(ev, handler);
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
      handlers.forEach((handler, ev) => socket.off(ev, handler));
      socketRef.current = null;
      setConnected(false);
    };
  }, [state.accessToken]);

  const clear = () => setEvents([]);

  return { events, connected, clear };
}
