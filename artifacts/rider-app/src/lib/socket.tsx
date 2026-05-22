import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { api, registerTokenRefreshCallback } from "./api";

import { createLogger } from "@/lib/logger";
import { getRiderSocketOrigin } from "./envValidation";
import { syncQueue } from "./offline/queueManager";
import { useAuth } from "./rider-auth";
const log = createLogger("[socket]");

type SocketContextType = {
  socket: Socket | null;
  connected: boolean;
  setRiderPosition: (lat: number, lng: number) => void;
  batteryLevel: number | undefined;
  setSlowGps: (slow: boolean) => void;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  setRiderPosition: () => {},
  batteryLevel: undefined,
  setSlowGps: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  /* Cached position fed by Home.tsx / Active.tsx watchPosition — no separate GPS listener here */
  const lastLatRef = useRef<number | undefined>(undefined);
  const lastLngRef = useRef<number | undefined>(undefined);
  /* Slow-GPS flag set by Active.tsx when battery is low or rider is far from waypoint */
  const slowGpsRef = useRef(false);
  const lastHeartbeatMsRef = useRef(0);

  /* Called from watchPosition callbacks in Home.tsx and Active.tsx */
  const setRiderPosition = useCallback((lat: number, lng: number) => {
    lastLatRef.current = lat;
    lastLngRef.current = lng;
  }, []);

  /* Called by Active.tsx to signal battery-aware slow-down mode */
  const setSlowGps = useCallback((slow: boolean) => {
    slowGpsRef.current = slow;
  }, []);

  useEffect(() => {
    const token = api.getToken();
    if (!token || !user?.id) return;

    const socketOrigin = getRiderSocketOrigin() ?? window.location.origin;

    const s = io(socketOrigin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: 20,
      /* withCredentials lets the browser attach the HttpOnly refresh cookie
         to the polling-transport handshake. The websocket transport does
         not require it but enabling here is harmless and keeps both
         transports symmetric for any cookie-aware server middleware. */
      withCredentials: true,
    });
    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => {
      log.info({ socketId: s.id }, "Socket connected — draining offline action queue");
      setConnected(true);
      syncQueue().catch((err) => log.warn({ err }, "syncQueue failed after socket connect"));
    });
    s.on("disconnect", (reason) => {
      log.warn({ reason }, "Socket disconnected");
      setConnected(false);
    });
    s.on("connect_error", (err) => {
      log.warn({ message: err.message }, "Socket connection error");
      setConnected(false);
    });

    /* S1 / T4: On token refresh, reconnect the socket so the new auth token
       is sent on the next handshake. socket.io's typings model `auth` as
       `string | object`, so we narrow once via a typed local rather than
       re-casting at every read site. The cast is kept inside one helper so a
       future socket.io upgrade only needs to delete this block. */
    type AuthBag = { token?: string };
    const readSocketAuth = (): AuthBag => {
      const a = (s as { auth?: unknown }).auth;
      return (a && typeof a === "object" ? (a as AuthBag) : {}) as AuthBag;
    };
    const writeSocketAuth = (next: AuthBag) => {
      (s as { auth?: unknown }).auth = next;
    };
    /* Immediate reconnect when a token refresh completes — eliminates the gap
       where real-time messages are missed between token refresh and the next
       polling tick. Registered on every socket lifecycle so the callback always
       references the current socket instance. */
    const handleTokenRefresh = () => {
      const freshToken = api.getToken();
      if (!freshToken) return;
      writeSocketAuth({ ...readSocketAuth(), token: freshToken });
      s.disconnect();
      s.connect();
    };
    const unregisterRefreshCallback = registerTokenRefreshCallback(handleTokenRefresh);

    /* Polling fallback: detect token changes that don't come through the
       callback (e.g. token set by other code paths). Interval reduced to 5 s
       so the reconnect happens within 5 seconds at most. */
    const tokenRefreshInterval = setInterval(() => {
      const freshToken = api.getToken();
      const current = readSocketAuth().token;
      if (freshToken && freshToken !== current) {
        writeSocketAuth({ ...readSocketAuth(), token: freshToken });
        s.disconnect();
        s.connect();
      }
    }, 5_000);

    return () => {
      unregisterRefreshCallback();
      clearInterval(tokenRefreshInterval);

      s.removeAllListeners(); /* S4: Remove all listeners on cleanup (COMPLETED) */
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id]);

  /* Shared battery source for Home.tsx and heartbeat pings.
     batteryLevelRef is used by the heartbeat interval (no re-render needed there).
     batteryLevelState drives the context value so consumers actually see updates —
     reading batteryLevelRef.current directly in the Provider JSX would always
     yield the initial undefined because refs don't trigger re-renders. */
  const batteryLevelRef = useRef<number | undefined>(undefined);
  const [batteryLevelState, setBatteryLevelState] = useState<number | undefined>(undefined);

  /* Initialize battery listener once at mount */
  useEffect(() => {
    type BatteryManager = {
      level: number;
      addEventListener: (event: string, cb: () => void) => void;
      removeEventListener: (event: string, cb: () => void) => void;
    };
    let batt: BatteryManager | undefined;
    let mounted = true;
    const onLevelChange = () => {
      if (batt) {
        batteryLevelRef.current = batt.level;
        setBatteryLevelState(batt.level);
      }
    };
    (navigator as unknown as { getBattery?: () => Promise<BatteryManager> })
      .getBattery?.()
      .then((b) => {
        if (!mounted) return;
        batt = b;
        batteryLevelRef.current = batt.level;
        setBatteryLevelState(batt.level);
        batt.addEventListener("levelchange", onLevelChange);
      })
      .catch((err) => {
        console.warn("[artifacts/rider-app/src/lib/socket.tsx]", err);
      }); // eslint-disable-line no-console
    return () => {
      mounted = false;
      batt?.removeEventListener("levelchange", onLevelChange);
    };
  }, []);

  /* Heartbeat effect - keyed on the socket instance so connect listeners rebind */
  useEffect(() => {
    const s = socket;
    if (!s || !user?.isOnline) return;

    const emitHeartbeat = () => {
      if (!s?.connected) return;
      const now = Date.now();
      /* When slow-GPS mode is active, throttle heartbeats to 30 s.
         Normal mode stays at 10 s (the setInterval cadence). */
      const minHeartbeatMs = slowGpsRef.current ? 30_000 : 0;
      if (now - lastHeartbeatMsRef.current < minHeartbeatMs) return;
      lastHeartbeatMsRef.current = now;

      s.emit("rider:heartbeat", {
        batteryLevel: batteryLevelRef.current,
        isOnline: true,
        timestamp: new Date().toISOString(),
        /* Use position cached from the page-level watchPosition — no duplicate GPS listener */
        ...(lastLatRef.current !== undefined && lastLngRef.current !== undefined
          ? { latitude: lastLatRef.current, longitude: lastLngRef.current }
          : {}),
      });
    };

    s.off("connect", emitHeartbeat);
    s.on("connect", emitHeartbeat);
    emitHeartbeat();
    const heartbeatInterval = setInterval(emitHeartbeat, 10_000);

    return () => {
      clearInterval(heartbeatInterval);
      s.off("connect", emitHeartbeat);
    };
  }, [socket, user?.isOnline]);

  return (
    <SocketContext.Provider
      value={{ socket, connected, setRiderPosition, batteryLevel: batteryLevelState, setSlowGps }}
    >
      {children}
    </SocketContext.Provider>
  );
}
