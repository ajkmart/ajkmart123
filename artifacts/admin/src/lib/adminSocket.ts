import { io, type Socket } from "socket.io-client";

export type SocketStatus = "connected" | "disconnected" | "reconnecting";

export const socketStatus$ = {
  value: "disconnected" as SocketStatus,
  listeners: new Set<(s: SocketStatus) => void>(),
  set(s: SocketStatus) {
    this.value = s;
    this.listeners.forEach((fn) => fn(s));
  },
};

const SOS_LS_KEY = "ajkmart_sos_unread";

let _socket: Socket | null = null;
let _currentToken: string | null = null;

export function getAdminSocket(accessToken: string): Socket {
  if (_socket && _currentToken === accessToken && _socket.connected) {
    return _socket;
  }

  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
    socketStatus$.set("disconnected");
  }

  _currentToken = accessToken;
  _socket = io(window.location.origin, {
    path: "/api/socket.io",
    query: { rooms: "admin-fleet" },
    auth: (cb: (d: Record<string, string>) => void) => cb({ token: accessToken }),
    transports: ["websocket", "polling"],
  });

  _socket.on("connect", () => {
    socketStatus$.set("connected");
    _socket?.emit("join", "admin-fleet");
    _socket?.emit("admin:join", { token: accessToken });
  });

  _socket.on("disconnect", () => {
    socketStatus$.set("disconnected");
  });

  _socket.on("reconnect_attempt", () => {
    socketStatus$.set("reconnecting");
  });

  _socket.on("reconnect", () => {
    socketStatus$.set("connected");
  });

  _socket.on("sos:new", () => {
    try {
      const current = parseInt(localStorage.getItem(SOS_LS_KEY) ?? "0", 10) || 0;
      const count = current + 1;
      localStorage.setItem(SOS_LS_KEY, String(count));
      window.dispatchEvent(new CustomEvent("sos:badge:update", { detail: { count } }));
    } catch (_e) {
      // localStorage unavailable
    }
  });

  return _socket;
}

export function resetSosBadge(): void {
  try {
    localStorage.setItem(SOS_LS_KEY, "0");
    window.dispatchEvent(new CustomEvent("sos:badge:update", { detail: { count: 0 } }));
  } catch (_e) {
    // localStorage unavailable
  }
}

export function getSosBadgeCount(): number {
  try {
    return parseInt(localStorage.getItem(SOS_LS_KEY) ?? "0", 10) || 0;
  } catch (_e) {
    return 0;
  }
}

export function disconnectAdminSocket(): void {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
    _currentToken = null;
    socketStatus$.set("disconnected");
  }
}
