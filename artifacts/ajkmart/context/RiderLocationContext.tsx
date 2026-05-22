/**
 * RiderLocationContext — Background GPS tracking for riders in the ajkmart Expo app.
 *
 * • Uses expo-task-manager + expo-location startLocationUpdatesAsync for background tracking.
 * • Active only when the logged-in user has role === "rider".
 * • Starts when rider calls goOnline(), stops when they call goOffline().
 * • Applies a distance throttle (default 25 m) before sending to the server.
 * • Battery level included when available via expo-battery (optional).
 * • Dual-mode: slow ping (3–5 min) when idle, fast ping (5–10 sec) when active order/ride.
 * • Persists isOnline to AsyncStorage for auto-resume after device reboot.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus, Platform } from "react-native";
import { useAuth } from "./AuthContext";

const BACKGROUND_LOCATION_TASK = "RIDER_BACKGROUND_LOCATION";
const MIN_DISTANCE_METERS = 25;

/* Dual-mode intervals */
const IDLE_INTERVAL_SEC = 4 * 60;    /* 4 minutes when idle/online */
const ACTIVE_INTERVAL_SEC = 5;       /* 5 seconds when on active order/ride — synced with web rider-app */

/* AsyncStorage key for persisting online state */
const STORAGE_KEY_IS_ONLINE = "rider_is_online";

/* ── Bug 5 fix: Use a Set of handlers instead of a single mutable global ── */
const backgroundLocationHandlers = new Set<(loc: Location.LocationObject) => void>();

/* ── Task registration (must be at module top level) ── */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<unknown>) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] })?.locations;
  if (!locations?.length) return;
  const loc = locations[locations.length - 1]!;
  backgroundLocationHandlers.forEach((handler) => {
    try { handler(loc); } catch (cbErr) { console.warn("[RiderLocation] Background task handler threw:", cbErr instanceof Error ? cbErr.message : String(cbErr)); }
  });
});

/* ── Haversine distance ── */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type GoOnlineResult = "ok" | "permission_denied" | "tracking_failed";

interface RiderLocationContextType {
  isOnline: boolean;
  hasActiveTask: boolean;
  goOnline: () => Promise<GoOnlineResult>;
  goOffline: () => Promise<void>;
  toggleOnline: () => Promise<GoOnlineResult>;
  lastPosition: { lat: number; lng: number } | null;
  locationPermission: "granted" | "denied" | "undetermined";
}

const RiderLocationContext = createContext<RiderLocationContextType | null>(null);

export function RiderLocationProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const isRider = user?.role === "rider";

  const [isOnline, setIsOnline] = useState(false);
  const [hasActiveTask, setHasActiveTask] = useState(false);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<"granted" | "denied" | "undetermined">("undetermined");

  const prevPositionRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  const isOnlineRef = useRef(false);
  isOnlineRef.current = isOnline;

  const hasActiveTaskRef = useRef(false);
  hasActiveTaskRef.current = hasActiveTask;

  const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;

  /* ── Poll for active orders/rides to determine dual-mode ── */
  useEffect(() => {
    if (!isOnline || !user?.id) {
      setHasActiveTask(false);
      return;
    }
    const checkActive = async () => {
      const tok = tokenRef.current;
      if (!tok) return;
      try {
        const r = await fetch(`${API_BASE}/rider/active`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (!r.ok) return;
        const data = await r.json();
        const active = !!(data?.order || data?.ride);
        setHasActiveTask(active);
      } catch (err) { console.warn("[RiderLocation] Active task poll failed:", err instanceof Error ? err.message : String(err)); }
    };
    checkActive();
    const interval = setInterval(checkActive, 15_000);
    return () => clearInterval(interval);
  }, [isOnline, user?.id, API_BASE]);

  /* ── Dual-mode: update background location task interval when active task changes ── */
  useEffect(() => {
    if (!isOnline || Platform.OS === "web") return;
    const updateInterval = async () => {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (!running) return;
        /* Restart with new interval */
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        const intervalSec = hasActiveTask ? ACTIVE_INTERVAL_SEC : IDLE_INTERVAL_SEC;
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: MIN_DISTANCE_METERS,
          timeInterval: intervalSec * 1000,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "AJKMart Rider",
            notificationBody: hasActiveTask
              ? "Active delivery — tracking location every 8 seconds."
              : "You are online and tracking your location.",
            notificationColor: "#1A56DB",
          },
          pausesUpdatesAutomatically: false,
        });
      } catch (err) { console.warn("[RiderLocation] Background task interval restart failed:", err instanceof Error ? err.message : String(err)); }
    };
    updateInterval();
  }, [hasActiveTask, isOnline]);

  const sendLocation = useCallback(async (loc: Location.LocationObject) => {
    const tok = tokenRef.current;
    if (!tok) return;

    const { latitude, longitude, accuracy, speed, heading } = loc.coords;
    const now = Date.now();

    /* Distance throttle */
    const prev = prevPositionRef.current;
    const intervalSec = hasActiveTaskRef.current ? ACTIVE_INTERVAL_SEC : IDLE_INTERVAL_SEC;
    const maxInterval = intervalSec * 2; /* allow 2x interval max */
    if (prev) {
      const dist = haversineMeters(prev.lat, prev.lng, latitude, longitude);
      const elapsed = (now - prev.ts) / 1000;
      if (dist < MIN_DISTANCE_METERS && elapsed < maxInterval) return;
    }

    prevPositionRef.current = { lat: latitude, lng: longitude, ts: now };
    setLastPosition({ lat: latitude, lng: longitude });

    try {
      let batteryLevel: number | undefined;
      try {
        const level = await Battery.getBatteryLevelAsync();
        if (level >= 0) batteryLevel = Math.round(level * 100);
      } catch (battErr) { console.warn("[RiderLocation] Battery level unavailable on this platform:", battErr instanceof Error ? battErr.message : String(battErr)); }

      const action = hasActiveTaskRef.current ? "on_trip" : null;

      const res = await fetch(`${API_BASE}/rider/location`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({
          latitude,
          longitude,
          accuracy: accuracy ?? undefined,
          speed: speed ?? undefined,
          heading: heading ?? undefined,
          batteryLevel,
          action,
        }),
      });
      if (!res.ok) {
        console.warn(`[RiderLocation] Location patch failed: ${res.status}`);
      }
    } catch (err) {
      console.warn("[RiderLocation] Location patch network error:", err instanceof Error ? err.message : String(err));
    }
  }, [API_BASE]);

  /* ── Bug 5 fix: Register/unregister handler in the Set (no race condition on remount) ── */
  useEffect(() => {
    backgroundLocationHandlers.add(sendLocation);
    return () => {
      backgroundLocationHandlers.delete(sendLocation);
    };
  }, [sendLocation]);

  const checkPermissions = useCallback(async (): Promise<boolean> => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== "granted") {
      setLocationPermission("denied");
      return false;
    }
    /* Background permission only needed on native */
    if (Platform.OS !== "web") {
      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg !== "granted") {
        setLocationPermission("denied");
        return false;
      }
    }
    setLocationPermission("granted");
    return true;
  }, []);

  /* ── startTracking: starts background task at current dual-mode interval ── */
  const startTracking = useCallback(async () => {
    if (Platform.OS === "web") return;
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (!running) {
      const intervalSec = hasActiveTaskRef.current ? ACTIVE_INTERVAL_SEC : IDLE_INTERVAL_SEC;
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: MIN_DISTANCE_METERS,
        timeInterval: intervalSec * 1000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "AJKMart Rider",
          notificationBody: "You are online and tracking your location.",
          notificationColor: "#1A56DB",
        },
        pausesUpdatesAutomatically: false,
      });
    }
  }, []);

  const stopTracking = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (running) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (err) { console.warn("[RiderLocation] stopTracking failed:", err instanceof Error ? err.message : String(err)); }
  }, []);

  /* Also track foreground location on web using watchPosition */
  /* On web we use navigator.geolocation directly to avoid expo-location's
     broken LocationEventEmitter.removeSubscription on web (expo-location ~19 bug). */
  const watchIdRef = useRef<Location.LocationSubscription | number | null>(null);

  const startForegroundWatch = useCallback(async () => {
    if (watchIdRef.current !== null) return;
    if (Platform.OS === "web") {
      if (!navigator?.geolocation) return;
      const intervalSec = hasActiveTaskRef.current ? ACTIVE_INTERVAL_SEC : IDLE_INTERVAL_SEC;
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          sendLocation({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              altitude: pos.coords.altitude ?? null,
              accuracy: pos.coords.accuracy,
              altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
              heading: pos.coords.heading ?? null,
              speed: pos.coords.speed ?? null,
            },
            timestamp: pos.timestamp,
            mocked: false,
          } as Location.LocationObject);
        },
        (err) => console.warn("[RiderLocation] Web watchPosition error:", err.message),
        { enableHighAccuracy: false, timeout: intervalSec * 1000, maximumAge: 30000 },
      );
    } else {
      const intervalSec = hasActiveTaskRef.current ? ACTIVE_INTERVAL_SEC : IDLE_INTERVAL_SEC;
      watchIdRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: MIN_DISTANCE_METERS,
          timeInterval: intervalSec * 1000,
        },
        (loc) => sendLocation(loc),
      );
    }
  }, [sendLocation]);

  const stopForegroundWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      if (Platform.OS === "web") {
        navigator.geolocation.clearWatch(watchIdRef.current as number);
      } else {
        (watchIdRef.current as Location.LocationSubscription).remove();
      }
      watchIdRef.current = null;
    }
  }, []);

  /* Restart foreground watch on ALL platforms when active task state changes (dual-mode).
     On native this only runs when the app is in the foreground (AppState active). */
  useEffect(() => {
    if (!isOnline) return;
    /* On native: only restart if app is currently in the foreground */
    if (Platform.OS !== "web" && AppState.currentState !== "active") return;
    stopForegroundWatch();
    startForegroundWatch().catch((err) => console.warn("[RiderLocation] Foreground watch restart failed:", err instanceof Error ? err.message : String(err)));
  }, [hasActiveTask, isOnline]);

  /* ── Bug 2 fix: AppState listener to start/stop foreground watch on native ── */
  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (!isOnlineRef.current) return;
      if (nextState === "active") {
        startForegroundWatch().catch((err) => console.warn("[RiderLocation] AppState foreground watch failed:", err instanceof Error ? err.message : String(err)));
      } else {
        stopForegroundWatch();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [startForegroundWatch, stopForegroundWatch]);

  /* ── Auto-resume on boot: read persisted isOnline from AsyncStorage ── */
  useEffect(() => {
    if (!isRider) return;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY_IS_ONLINE);
        if (stored === "true") {
          /* Background task may have been killed; attempt to restart */
          const ok = await checkPermissions();
          if (ok) {
            setIsOnline(true);
            prevPositionRef.current = null;
            if (Platform.OS !== "web") {
              try {
                await startTracking();
                if (AppState.currentState === "active") {
                  await startForegroundWatch();
                }
              } catch (err) { console.warn("[RiderLocation] Auto-resume tracking start failed:", err instanceof Error ? err.message : String(err)); }
            } else {
              await startForegroundWatch();
            }
          } else {
            /* Permission gone after reboot — clear stored state */
            await AsyncStorage.removeItem(STORAGE_KEY_IS_ONLINE);
          }
        }
      } catch (err) { console.warn("[RiderLocation] Auto-resume bootstrap failed:", err instanceof Error ? err.message : String(err)); }
    })();
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isRider]);

  /* ── Bug 1 & 7 fix: goOnline now returns a status result ── */
  const goOnline = useCallback(async (): Promise<GoOnlineResult> => {
    if (!isRider) return "permission_denied";
    const ok = await checkPermissions();
    if (!ok) return "permission_denied";
    setIsOnline(true);
    prevPositionRef.current = null;
    /* Persist online state for auto-resume after reboot */
    try { await AsyncStorage.setItem(STORAGE_KEY_IS_ONLINE, "true"); } catch (err) { console.warn("[RiderLocation] Failed to persist online state:", err instanceof Error ? err.message : String(err)); }
    if (Platform.OS === "web") {
      await startForegroundWatch();
    } else {
      try {
        await startTracking();
        /* Also start foreground watch immediately since app is in foreground now */
        await startForegroundWatch();
      } catch (err) {
        setIsOnline(false);
        try { await AsyncStorage.removeItem(STORAGE_KEY_IS_ONLINE); } catch (err) { console.warn("[RiderLocation] Failed to clear persisted online state:", err instanceof Error ? err.message : String(err)); }
        return "tracking_failed";
      }
    }
    return "ok";
  }, [isRider, checkPermissions, startTracking, startForegroundWatch]);

  const goOffline = useCallback(async () => {
    setIsOnline(false);
    setHasActiveTask(false);
    prevPositionRef.current = null;
    stopForegroundWatch();
    /* Clear persisted online state */
    try { await AsyncStorage.removeItem(STORAGE_KEY_IS_ONLINE); } catch (err) { console.warn("[RiderLocation] Failed to clear online state on goOffline:", err instanceof Error ? err.message : String(err)); }
    if (Platform.OS !== "web") {
      await stopTracking();
    }
  }, [stopTracking, stopForegroundWatch]);

  const toggleOnline = useCallback(async (): Promise<GoOnlineResult> => {
    if (isOnline) {
      await goOffline();
      return "ok";
    } else {
      return goOnline();
    }
  }, [isOnline, goOnline, goOffline]);

  /* Stop tracking on logout */
  useEffect(() => {
    if (!isRider && isOnline) {
      goOffline().catch(() => {});
    }
  }, [isRider, isOnline, goOffline]);

  return (
    <RiderLocationContext.Provider
      value={{ isOnline, hasActiveTask, goOnline, goOffline, toggleOnline, lastPosition, locationPermission }}
    >
      {children}
    </RiderLocationContext.Provider>
  );
}

export function useRiderLocation() {
  const ctx = useContext(RiderLocationContext);
  if (!ctx) throw new Error("useRiderLocation must be used within RiderLocationProvider");
  return ctx;
}
