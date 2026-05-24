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
import { batchDrainGpsQueue } from "./gpsQueue";
import { syncQueue } from "./offline/queueManager";
import { useAuth } from "./rider-auth";
const log = createLogger("[socket]");

/** Haversine great-circle distance in metres between two WGS-84 coordinates. */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type SocketContextType = {
  socket: Socket | null;
  connected: boolean;
  setRiderPosition: (lat: number, lng: number) => void;
  batteryLevel: number | undefined;
  setSlowGps: (slow: boolean) => void;
  setCurrentTripId: (tripId: string | null) => void;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  setRiderPosition: () => {},
  batteryLevel: undefined,
  setSlowGps: () => {},
  setCurrentTripId: () => {},
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

  /* Active ride/trip ID — set by Active.tsx when a ride is in progress */
  const currentTripIdRef = useRef<string | null>(null);

  /* Called from watchPosition callbacks in Home.tsx and Active.tsx */
  const setRiderPosition = useCallback((lat: number, lng: number) => {
    lastLatRef.current = lat;
    lastLngRef.current = lng;
  }, []);

  /* Called by Active.tsx to signal battery-aware slow-down mode */
  const setSlowGps = useCallback((slow: boolean) => {
    slowGpsRef.current = slow;
  }, []);

  /* Called by Active.tsx when an active ride starts/ends so the heartbeat
     payload always includes the current tripId for admin-fleet tracking. */
  const setCurrentTripId = useCallback((tripId: string | null) => {
    currentTripIdRef.current = tripId;
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
      reconnectionDelayMax: 20000,
      /* Adaptive retry count: fewer attempts when offline to save battery.
         Full count (5) when online, minimal (2) when offline so we don't churn
         for 5+ minutes against a down network. A new socket lifecycle starts
         when the device comes back online (window online listener in App.tsx). */
      reconnectionAttempts: typeof navigator !== "undefined" && !navigator.onLine ? 2 : 5,
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
      batchDrainGpsQueue();
    });
    s.on("disconnect", (reason) => {
      log.warn({ reason }, "Socket disconnected");
      setConnected(false);
      /* "io server disconnect" means the server explicitly kicked this client
         (e.g. auth revoked / token invalidated). Fully disconnect so the
         socket does not attempt automatic reconnection with stale credentials.
         The token refresh + new socket lifecycle will reconnect when ready. */
      if (reason === "io server disconnect") {
        s.disconnect();
      }
    });
    s.on("connect_error", (err) => {
      log.warn({ message: err.message }, "Socket connection error");
      setConnected(false);
    });
    s.on("error", (err: Error) => {
      log.warn({ message: err?.message }, "Socket transport error");
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

  /* Platform-configurable heartbeat cadence and minimum movement distance.
     Fetched once after the socket connects; defaults match the platform setting
     defaults so the rider app works without a server round-trip at startup. */
  const heartbeatIntervalMsRef = useRef(5_000);
  const heartbeatMinDistanceMRef = useRef(25);

  /* Last position at which we sent a heartbeat — used for 25 m deduplication. */
  const lastHeartbeatLatRef = useRef<number | undefined>(undefined);
  const lastHeartbeatLngRef = useRef<number | undefined>(undefined);

  /* Fetch platform settings once when socket connects so the heartbeat cadence
     and minimum movement distance are driven by admin-configurable values. */
  useEffect(() => {
    if (!connected) return;
    api
      .getSettings()
      .then((settings: unknown) => {
        if (!settings || typeof settings !== "object") return;
        const rows = (settings as Record<string, unknown>).settings;
        if (!Array.isArray(rows)) return;
        for (const row of rows as Array<{ key: string; value: string }>) {
          if (row.key === "rider_heartbeat_interval_ms") {
            const v = parseInt(row.value, 10);
            if (!isNaN(v) && v >= 1_000) heartbeatIntervalMsRef.current = v;
          }
          if (row.key === "rider_heartbeat_min_distance_m") {
            const v = parseFloat(row.value);
            if (!isNaN(v) && v >= 0) heartbeatMinDistanceMRef.current = v;
          }
        }
        log.info(
          {
            intervalMs: heartbeatIntervalMsRef.current,
            minDistanceM: heartbeatMinDistanceMRef.current,
          },
          "Heartbeat config loaded from platform settings"
        );
      })
      .catch((err: unknown) => {
        log.warn(
          { err },
          "Failed to fetch platform settings for heartbeat config — using defaults"
        );
      });
  }, [connected]);

  /* Heartbeat effect - keyed on the socket instance so connect listeners rebind */
  useEffect(() => {
    const s = socket;
    if (!s || !user?.isOnline) return;

    const emitHeartbeat = () => {
      if (!s?.connected) return;
      const now = Date.now();
      /* When slow-GPS mode is active, throttle heartbeats to 30 s.
         Normal mode is governed by the platform-configurable interval. */
      const minHeartbeatMs = slowGpsRef.current ? 30_000 : heartbeatIntervalMsRef.current;
      if (now - lastHeartbeatMsRef.current < minHeartbeatMs) return;

      /* Heartbeat always fires on the interval for server-side liveness.
         25 m gate only controls whether the cached coordinate is refreshed —
         the emit happens regardless so ghost-rider cleanup never evicts an
         online-but-stationary rider. */
      const lat = lastLatRef.current;
      const lng = lastLngRef.current;

      /* Decide which coordinates to include in this heartbeat:
         - First beat with GPS → use current position and cache it.
         - Subsequent beats where rider moved ≥ minDistance → update cache, send fresh coords.
         - Subsequent beats where rider moved < minDistance → re-send last cached position
           (server still receives a heartbeat; no stale-marker false-positive). */
      let coordsToSend: { latitude: number; longitude: number } | undefined;
      if (lat !== undefined && lng !== undefined) {
        if (
          lastHeartbeatLatRef.current === undefined ||
          lastHeartbeatLngRef.current === undefined
        ) {
          lastHeartbeatLatRef.current = lat;
          lastHeartbeatLngRef.current = lng;
          coordsToSend = { latitude: lat, longitude: lng };
        } else {
          const moved = haversineMetres(
            lastHeartbeatLatRef.current,
            lastHeartbeatLngRef.current,
            lat,
            lng
          );
          if (moved >= heartbeatMinDistanceMRef.current) {
            lastHeartbeatLatRef.current = lat;
            lastHeartbeatLngRef.current = lng;
            coordsToSend = { latitude: lat, longitude: lng };
          } else {
            /* Re-use last-cached position so coord field is always present */
            coordsToSend = {
              latitude: lastHeartbeatLatRef.current,
              longitude: lastHeartbeatLngRef.current,
            };
          }
        }
      }

      lastHeartbeatMsRef.current = now;

      s.emit("rider:heartbeat", {
        batteryLevel: batteryLevelRef.current,
        isOnline: true,
        timestamp: new Date().toISOString(),
        /* vehicleType from user profile for admin-fleet vehicle icon rendering */
        vehicleType: (user as unknown as Record<string, unknown> | null)?.vehicleType as
          | string
          | undefined,
        /* currentTripId set by Active.tsx when a ride is in progress */
        tripId: currentTripIdRef.current ?? undefined,
        action: currentTripIdRef.current ? "in_trip" : "idle",
        ...coordsToSend,
      });
    };

    s.off("connect", emitHeartbeat);
    s.on("connect", emitHeartbeat);
    emitHeartbeat();
    /* Poll at 1 s — actual emit is gated by interval + distance checks above */
    const heartbeatInterval = setInterval(emitHeartbeat, 1_000);

    return () => {
      clearInterval(heartbeatInterval);
      s.off("connect", emitHeartbeat);
    };
  }, [socket, user]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        setRiderPosition,
        batteryLevel: batteryLevelState,
        setSlowGps,
        setCurrentTripId,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}
