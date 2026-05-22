import { createLogger } from "@/lib/logger";
import { io, type Socket } from "socket.io-client";
import { api } from "./api";
import { markOrderSeen, wasOrderSeenRecently } from "./notificationSound";
const log = createLogger("[vendor-socket]");

export interface VendorNewOrderEvent {
  id: string;
  type?: string;
  total?: number;
  items?: unknown[];
  deliveryAddress?: string;
  paymentMethod?: string;
  [key: string]: unknown;
}

type NewOrderHandler = (order: VendorNewOrderEvent) => void;
type OrderUpdateHandler = (order: Record<string, unknown>) => void;

let _socket: Socket | null = null;
const _newOrderHandlers = new Set<NewOrderHandler>();
const _orderUpdateHandlers = new Set<OrderUpdateHandler>();
let _currentVendorId: string | null = null;

function resolveSocketUrl(): string {
  const isCapacitor = (import.meta.env.VITE_CAPACITOR as string) === "true";
  if (isCapacitor) {
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "");
    return base ?? "";
  }
  return window.location.origin;
}

export function connectVendorSocket(vendorId: string): void {
  if (_socket?.connected && _currentVendorId === vendorId) return;
  disconnectVendorSocket();

  const token = api.getToken();
  if (!token || !vendorId) return;

  _currentVendorId = vendorId;

  _socket = io(resolveSocketUrl(), {
    path: "/api/socket.io",
    auth: { token },
    query: { rooms: `vendor:${vendorId}` },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
    reconnectionAttempts: Infinity,
  });

  _socket.on("connect", () => {
    log.debug("connected, joined vendor:", vendorId);
  });

  _socket.on("order:new", (order: VendorNewOrderEvent) => {
    const orderId = String(order?.id ?? "");
    if (orderId && wasOrderSeenRecently(orderId)) return;
    if (orderId) markOrderSeen(orderId);
    _newOrderHandlers.forEach((fn) => {
      try {
        fn(order);
      } catch (err) {
        console.warn("[artifacts/vendor-app/src/lib/socket.ts]", err);
      } // eslint-disable-line no-console
    });
  });

  _socket.on("order:update", (order: Record<string, unknown>) => {
    _orderUpdateHandlers.forEach((fn) => {
      try {
        fn(order);
      } catch (err) {
        console.warn("[artifacts/vendor-app/src/lib/socket.ts]", err);
      } // eslint-disable-line no-console
    });
  });

  _socket.on("connect_error", (err) => {
    log.warn("connect_error:", err.message);
  });

  _socket.on("disconnect", (reason) => {
    log.debug("disconnected:", reason);
  });
}

export function disconnectVendorSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
  _currentVendorId = null;
}

export function onNewOrder(fn: NewOrderHandler): () => void {
  _newOrderHandlers.add(fn);
  return () => {
    _newOrderHandlers.delete(fn);
  };
}

export function onOrderUpdate(fn: OrderUpdateHandler): () => void {
  _orderUpdateHandlers.add(fn);
  return () => {
    _orderUpdateHandlers.delete(fn);
  };
}
