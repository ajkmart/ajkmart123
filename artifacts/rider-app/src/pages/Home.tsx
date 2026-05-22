import { createLogger } from "@/lib/logger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPollingIntervalForTier, useNetworkQuality } from "../hooks/useNetworkQuality";
const log = createLogger("[Home]");

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual } from "@workspace/i18n";
import { AlertTriangle, CheckCircle, ChevronRight, Clock, Wifi, Zap } from "lucide-react";
import { Link } from "wouter";
import { haversineMeters } from "../components/dashboard/helpers";
import { api, type Order, type Ride } from "../lib/api";
import {
  addDismissed,
  clearAllDismissed,
  enqueue,
  removeDismissed,
  sweepAndLoadDismissed,
} from "../lib/gpsQueue";
import {
  getSilenceMode,
  getSilenceRemaining,
  isAudioLocked,
  isSilenced,
  playRequestSound,
  setSilenceMode,
  unlockAudio,
} from "../lib/notificationSound";
import { enqueueAction } from "../lib/offline/queueManager";
import { useAuth } from "../lib/rider-auth";
import { logRideEvent } from "../lib/rideUtils";
import { useSocket } from "../lib/socket";
import { parseRideAssignedPayload } from "../lib/socketEvents";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

import {
  ActiveTaskBanner,
  FixedBanners,
  InlineWarnings,
  LiveClock,
  OfflineConfirmDialog,
  OnlineToggleCard,
  RequestListHeader,
  SilenceControls,
  SkeletonHome,
  StatsGrid,
  formatCurrency,
} from "../components/dashboard";
import { GoalSection } from "../components/home/GoalSection";
import { HomeRequestList } from "../components/home/HomeRequestList";

export default function Home() {
  const { user, refreshUser, loading: authLoading } = useAuth();
  const { tier: networkTier } = useNetworkQuality();

  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = useCallback((key: Parameters<typeof tDual>[0]) => tDual(key, language), [language]);
  const currency = config.platform.currencySymbol ?? "Rs.";
  const qc = useQueryClient();
  const [toggling, setToggling] = useState(false);
  const [tabVisible, setTabVisible] = useState(!document.hidden);
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [newFlash, setNewFlash] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set<string>());
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("_ajkm_profileBannerDismissed") === "1";
    } catch {
      return false;
    }
  });

  const [audioLocked, setAudioLocked] = useState(false);

  useEffect(() => {
    void sweepAndLoadDismissed().then((ids) => {
      if (ids.size > 0) setDismissed(ids);
    });
    /* Check audio lock state on mount */
    setAudioLocked(isAudioLocked());
  }, []);

  const [silenceOn, setSilenceOn] = useState(getSilenceMode());
  const prevIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasUnseenRequestsRef = useRef(false);
  const [silenced, setSilenced] = useState(isSilenced());
  const [silenceRemaining, setSilenceRemaining] = useState(getSilenceRemaining());
  const [showSilenceMenu, setShowSilenceMenu] = useState(false);

  useEffect(() => {
    const handler = () => {
      unlockAudio();
      setAudioLocked(false);
    };
    document.addEventListener("click", handler, { once: true });
    document.addEventListener("touchstart", handler, { once: true });
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (soundIntervalRef.current) clearInterval(soundIntervalRef.current);
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  const { socket: sharedSocket, connected: socketConnected, setRiderPosition } = useSocket();

  useEffect(() => {
    if (!silenced) return;
    const t = setInterval(() => {
      const rem = getSilenceRemaining();
      setSilenceRemaining(rem);
      if (rem <= 0) {
        setSilenced(false);
        setShowSilenceMenu(false);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [silenced]);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    setToastType(type);
    toastTimerRef.current = setTimeout(() => setToastMsg(""), 3000);
  }, []);

  const [wakeLockWarning, setWakeLockWarning] = useState(false);
  const [optimisticOnline, setOptimisticOnline] = useState<boolean | null>(null);
  const effectiveOnline = optimisticOnline != null ? optimisticOnline : !!user?.isOnline;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const TOGGLE_DEBOUNCE_MS = 1000;
  const lastToggleRef = useRef<number>(0);
  /* Ref kept in sync with the derived totalRequests value (defined after the
     query hooks below). Using a ref avoids both a forward-reference TypeScript
     error and a stale closure inside toggleOnline's useCallback. */
  const totalRequestsRef = useRef(0);

  const [showOfflineConfirm, setShowOfflineConfirm] = useState(false);
  const [zoneWarning, setZoneWarning] = useState<string | null>(null);

  const doActualToggle = useCallback(async () => {
    const now = Date.now();
    lastToggleRef.current = now;
    setToggling(true);
    const newStatus = !effectiveOnline;
    setOptimisticOnline(newStatus);
    let succeeded = false;
    try {
      const result = await api.setOnline(newStatus);
      if (!isMountedRef.current) return;
      if (result?.serviceZoneWarning) {
        setZoneWarning(result.serviceZoneWarning);
      } else {
        setZoneWarning(null);
      }
      await refreshUser().catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Home] refreshUser failed"
        );
      });
      if (!isMountedRef.current) return;
      succeeded = true;
      showToast(newStatus ? T("youAreNowOnline") : T("youAreNowOffline"), "success");
    } catch (e: unknown) {
      if (!isMountedRef.current) return;
      setOptimisticOnline(!newStatus);
      showToast(e instanceof Error ? e.message : T("somethingWentWrong"), "error");
    } finally {
      if (isMountedRef.current) {
        if (succeeded) setOptimisticOnline(null);
        setToggling(false);
      }
    }
  }, [effectiveOnline, refreshUser, showToast, T]);

  const toggleOnline = useCallback(async () => {
    const now = Date.now();
    if (toggling || now - lastToggleRef.current < TOGGLE_DEBOUNCE_MS) return;
    lastToggleRef.current = now;

    if (effectiveOnline && totalRequestsRef.current > 0) {
      setShowOfflineConfirm(true);
      return;
    }

    await doActualToggle();
  }, [toggling, effectiveOnline, doActualToggle]);

  const { data: earningsData } = useQuery({
    queryKey: ["rider-earnings"],
    queryFn: () => api.getEarnings(),
    refetchInterval: tabVisible ? 60000 : false,
    enabled: tabVisible,
  });

  const { data: activeData } = useQuery({
    queryKey: ["rider-active"],
    queryFn: () => api.getActive(),
    refetchInterval: tabVisible ? 8000 : false,
    enabled: effectiveOnline && tabVisible,
  });
  const hasActiveTask = !!(activeData?.order || activeData?.ride);

  const {
    data: requestsData,
    isLoading: requestsLoading,
    isError: requestsError,
  } = useQuery({
    queryKey: ["rider-requests"],
    queryFn: () => api.getRequests(),
    refetchInterval:
      tabVisible && effectiveOnline ? getPollingIntervalForTier(networkTier) : 60_000,
    enabled: effectiveOnline,
  });

  const { data: cancelStatsData } = useQuery({
    queryKey: ["rider-cancel-stats"],
    queryFn: () => api.getCancelStats(),
    refetchInterval: tabVisible ? 120000 : false,
    staleTime: 60000,
  });

  const { data: ignoreStatsData } = useQuery({
    queryKey: ["rider-ignore-stats"],
    queryFn: () => api.getIgnoreStats(),
    refetchInterval: tabVisible ? 120000 : false,
    staleTime: 60000,
  });

  const allOrders: Order[] = requestsData?.orders || []; // eslint-disable-line react-hooks/exhaustive-deps
  const allRides: Ride[] = requestsData?.rides || []; // eslint-disable-line react-hooks/exhaustive-deps
  /* Server time from the API envelope — used to offset AcceptCountdown for clock drift */
  const requestsServerTime: string | null = requestsData?._serverTime ?? null;

  /* Sync dismissed set with server: drop dismissed IDs no longer on server */
  useEffect(() => {
    if (!requestsData) return;
    const serverIds = new Set<string>([
      ...allOrders.map((o) => o.id),
      ...allRides.map((r) => r.id),
    ]);
    setDismissed((prev) => {
      /* Keep only IDs that still exist on the server */
      const next = new Set([...prev].filter((id) => serverIds.has(id)));
      if (next.size === prev.size) return prev;
      [...prev].filter((id) => !serverIds.has(id)).forEach((id) => removeDismissed(id));
      return next;
    });
  }, [requestsData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* New-request flash — pulse the header text; ring around the card container */
  const currentIdsSig = [...allOrders.map((o) => o.id), ...allRides.map((r) => r.id)]
    .sort()
    .join(",");
  useEffect(() => {
    const currentIds = new Set<string>(currentIdsSig.split(",").filter(Boolean));
    const prevIds = prevIdsRef.current;
    let hasNew = false;
    currentIds.forEach((id) => {
      if (!prevIds.has(id)) hasNew = true;
    });

    if (hasNew && currentIds.size > 0) {
      setNewFlash(true);
      setTimeout(() => setNewFlash(false), 2500);
      /* Recheck audio lock before playing — policy may have changed since mount */
      const locked = isAudioLocked();
      setAudioLocked(locked);
      if (!locked) playRequestSound();
      hasUnseenRequestsRef.current = true;
    }

    if (currentIds.size === 0) {
      hasUnseenRequestsRef.current = false;
      if (soundIntervalRef.current) {
        clearInterval(soundIntervalRef.current);
        soundIntervalRef.current = null;
      }
    } else if (hasUnseenRequestsRef.current) {
      if (soundIntervalRef.current) {
        clearInterval(soundIntervalRef.current);
        soundIntervalRef.current = null;
      }
      soundIntervalRef.current = setInterval(() => {
        if (
          hasUnseenRequestsRef.current &&
          !getSilenceMode() &&
          !isSilenced() &&
          !document.hidden &&
          !isAudioLocked()
        )
          playRequestSound();
      }, 8000);
    }

    prevIdsRef.current = currentIds;
  }, [currentIdsSig]);

  /* On tab re-focus: purge expired dismissed entries, then refetch */
  useEffect(() => {
    const handler = () => {
      const visible = !document.hidden;
      setTabVisible(visible);
      if (visible) {
        /* Recheck audio lock — browser may re-suspend AudioContext while hidden */
        setAudioLocked(isAudioLocked());
        /* Sweep expired dismissed entries before triggering the refetch */
        void sweepAndLoadDismissed().then((freshIds) => {
          setDismissed(freshIds);
          void qc.invalidateQueries({ queryKey: ["rider-requests"] });
          void qc.invalidateQueries({ queryKey: ["rider-active"] });
        });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [qc]);

  useEffect(() => {
    if (!effectiveOnline || !tabVisible) return;
    if (!("wakeLock" in navigator)) {
      setWakeLockWarning(true);
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (cancelled || document.hidden) return;
        sentinel = await (
          navigator as Navigator & {
            wakeLock: { request(type: string): Promise<WakeLockSentinel> };
          }
        ).wakeLock.request("screen");
        setWakeLockWarning(false);
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Home] GPS watchPosition error"
        );
      }
    };

    void acquire();

    return () => {
      cancelled = true;
      sentinel?.release().catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Home] sentinel release failed"
        );
      });
    };
  }, [effectiveOnline, tabVisible]);

  useEffect(() => {
    const handleLogout = () => {
      setDismissed(new Set());
      void clearAllDismissed();
    };
    window.addEventListener("ajkmart:logout", handleLogout);
    return () => window.removeEventListener("ajkmart:logout", handleLogout);
  }, []);

  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  const gpsWarningRef = useRef<string | null>(null);

  const setGpsWarningWithRef = useCallback((val: string | null) => {
    gpsWarningRef.current = val;
    setGpsWarning(val);
  }, []);

  const batteryRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("getBattery" in navigator)) return;
    type BattMgr = {
      level: number;
      addEventListener: (e: string, cb: () => void) => void;
      removeEventListener: (e: string, cb: () => void) => void;
    };
    let mounted = true;
    let batt: BattMgr | undefined;
    const onLevelChange = () => {
      if (batt) batteryRef.current = Math.round(batt.level * 100);
    };
    (navigator as unknown as { getBattery: () => Promise<BattMgr> })
      .getBattery()
      .then((b) => {
        if (!mounted) return;
        batt = b;
        batteryRef.current = Math.round(b.level * 100);
        b.addEventListener("levelchange", onLevelChange);
      })
      .catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Home] GPS ping enqueue failed"
        );
      });
    return () => {
      mounted = false;
      batt?.removeEventListener("levelchange", onLevelChange);
    };
  }, []);

  /* Socket event listeners — invalidate queries on new or changed requests */
  useEffect(() => {
    if (!sharedSocket) return;
    const handleNewRequest = () => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
    };
    /* Also listen for admin/customer-driven state changes */
    const handleStateChange = () => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
    };
    /* Invalidate earnings immediately when a delivery or ride completes so the
       Home screen progress bar updates within seconds instead of waiting for the
       60-second polling cycle. The mutations in Active.tsx also call this on the
       happy-path; this socket handler covers cases where the update arrives via
       server push (e.g. admin marks delivered, or another tab completes the task). */
    const handleCompletionEvent = () => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
      void qc.invalidateQueries({ queryKey: ["rider-earnings"] });
    };
    /* ride:assigned — server pushes the assigned ride summary to the rider.
       We validate the payload shape before invalidating queries so malformed
       payloads can never trigger unexpected re-renders. */
    const handleRideAssigned = (raw: unknown) => {
      const payload = parseRideAssignedPayload(raw);
      if (!payload) return;
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
    };
    sharedSocket.on("rider:new_request", handleNewRequest);
    sharedSocket.on("new:request", handleNewRequest);
    sharedSocket.on("ride:assigned", handleRideAssigned);
    sharedSocket.on("rider:request-cancelled", handleStateChange);
    sharedSocket.on("rider:ride-updated", handleCompletionEvent);
    sharedSocket.on("rider:order-updated", handleCompletionEvent);
    return () => {
      sharedSocket.off("rider:new_request", handleNewRequest);
      sharedSocket.off("new:request", handleNewRequest);
      sharedSocket.off("ride:assigned", handleRideAssigned);
      sharedSocket.off("rider:request-cancelled", handleStateChange);
      sharedSocket.off("rider:ride-updated", handleCompletionEvent);
      sharedSocket.off("rider:order-updated", handleCompletionEvent);
    };
  }, [sharedSocket, qc]);

  /* GPS watch — idle Home screen, no active task.
     The socket heartbeat (socket.tsx) is the sole liveness signal.
     REST pings here only update the stored coordinate when position changes
     meaningfully; they are not keepalive traffic. Memoized haversineMeters
     from helpers.ts is used so no redundant trig runs per position event. */
  useEffect(() => {
    if (!user?.isOnline || hasActiveTask || !user?.id) return;
    if (!navigator?.geolocation) return;

    let lastSentTime = 0;
    let lastLat: number | null = null;
    let lastLng: number | null = null;
    /* Only send REST location updates on meaningful movement. No time-based
       periodic fallback — the socket heartbeat is the sole liveness signal. */
    const MIN_DISTANCE_METERS = 25;
    /* Minimum interval to debounce burst callbacks from the OS */
    const DEBOUNCE_MS = 1000;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;

        /* Heuristic mock-GPS check: real devices rarely have accuracy=0 AND
           speed=0 AND no heading simultaneously. A single zero is not enough
           to trigger because some chipsets legitimately return accuracy=0 on a
           perfect fix. Server-side spoof detection is the authoritative gate. */
        const isMockGps = accuracy === 0 && speed === 0 && heading == null;
        if (isMockGps) {
          setGpsWarningWithRef(
            "Suspicious GPS accuracy detected. Please disable mock location apps."
          );
          return;
        }

        if (now - lastSentTime < DEBOUNCE_MS) return;

        /* Always update the shared socket position cache so the heartbeat
           has a fresh position without running its own GPS listener */
        setRiderPosition(latitude, longitude);

        /* memoized haversine — skip REST ping if position hasn't changed meaningfully */
        if (lastLat != null && lastLng != null) {
          const dist = haversineMeters(lastLat, lastLng, latitude, longitude);
          if (dist < MIN_DISTANCE_METERS) return;
        }
        /* No previous position — record it but don't send a keepalive ping;
           the socket heartbeat already signals liveness to the server. */
        if (lastLat == null) {
          lastLat = latitude;
          lastLng = longitude;
          lastSentTime = now;
          return;
        }

        lastSentTime = now;
        lastLat = latitude;
        lastLng = longitude;
        const locationData = {
          latitude,
          longitude,
          accuracy: accuracy ?? undefined,
          speed: speed ?? undefined,
          heading: heading ?? undefined,
          batteryLevel: batteryRef.current,
        };
        const queuedPing = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: new Date().toISOString(),
          ...locationData,
        };

        if (!navigator.onLine) {
          enqueue(queuedPing).catch((err) => {
            log.error(
              { err: err instanceof Error ? err.message : String(err) },
              "[Home] GPS ping enqueue failed"
            );
          });
          return;
        }

        api
          .updateLocation(locationData)
          .then(() => {
            if (gpsWarningRef.current) setGpsWarningWithRef(null);
          })
          .catch((err: Error) => {
            const msg = err.message || "";
            const isSpoofError =
              msg.toLowerCase().includes("spoof") || msg.toLowerCase().includes("mock");
            if (isSpoofError) {
              setGpsWarningWithRef(`GPS Spoof Detected: ${msg}`);
            } else {
              enqueue(queuedPing).catch((err) => {
                log.error(
                  { err: err instanceof Error ? err.message : String(err) },
                  "[Home] GPS ping enqueue failed"
                );
              });
              setGpsWarningWithRef(T("gpsLocationError"));
            }
          });
      },
      () => {
        setGpsWarningWithRef(T("gpsNotAvailable"));
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [user?.isOnline, hasActiveTask, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* PF5: Memoize the filtered request lists so unrelated re-renders (e.g.
     typing into a controlled input on Home, GPS-driven `setGpsWarning`
     updates) don't re-allocate these arrays and force every request card to
     re-render. The dismissed set is a stable identity within React state, so
     including it as a dep is correct. T2: typed callbacks instead of `any`. */
  const orders = useMemo(
    () => allOrders.filter((o: Order) => !dismissed.has(o.id)),
    [allOrders, dismissed]
  );
  const rides = useMemo(
    () => allRides.filter((r: Ride) => !dismissed.has(r.id)),
    [allRides, dismissed]
  );
  const totalRequests = orders.length + rides.length;
  totalRequestsRef.current = totalRequests;

  const dismiss = useCallback(
    (id: string) => {
      void addDismissed(id);
      setDismissed((prev) => {
        const next = new Set([...prev, id]);
        const serverIds = new Set<string>([
          ...allOrders.map((o) => o.id),
          ...allRides.map((r) => r.id),
        ]);
        const remainingVisible = [...serverIds].filter((sid) => !next.has(sid));
        if (remainingVisible.length === 0) {
          hasUnseenRequestsRef.current = false;
          if (soundIntervalRef.current) {
            clearInterval(soundIntervalRef.current);
            soundIntervalRef.current = null;
          }
        }
        return next;
      });
    },
    [allOrders, allRides]
  );

  const stopRequestSoundIfEmpty = () => {
    const remainingCount = allOrders.length + allRides.length;
    if (remainingCount <= 1) {
      hasUnseenRequestsRef.current = false;
      if (soundIntervalRef.current) {
        clearInterval(soundIntervalRef.current);
        soundIntervalRef.current = null;
      }
    }
  };

  /* O2: Order/Ride accept mutations.
     - We invalidate `rider-requests` in `onSettled` so both the win path
       (server returns the order) and the loss path (409 race / "already
       taken") trigger a refetch from a single place. The previous code
       invalidated in `onError` and `onSuccess` separately, which meant the
       409 race could briefly show a "ghost" accepted card before the refetch
       completed.
     - We never navigate to /active from here; the rider's BottomNav handles
       routing. This avoids the original bug where the loser of a race
       navigated to /active and saw a 404. */
  const acceptOrderMut = useMutation({
    mutationFn: (id: string) => api.acceptOrder(id),
    onSuccess: (_: unknown, id: string) => {
      /* Accepted items should NOT be added to the dismissed set (dismissed = rejected by rider).
         Remove the id from dismissed persistence if it was there, and prune cache directly. */
      removeDismissed(id).catch((err: unknown) => {
        log.debug("[Home] removeDismissed order accept failed:", err);
      });
      setDismissed((prev) => {
        const next = new Set([...prev]);
        next.delete(id);
        return next;
      });
      qc.setQueryData(
        ["rider-requests"],
        (old: { orders?: { id: string }[]; rides?: { id: string }[] } | undefined) => {
          if (!old) return old;
          return { ...old, orders: (old.orders ?? []).filter((o) => o.id !== id) };
        }
      );
      stopRequestSoundIfEmpty();
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
      showToast("Order accepted! Check Active tab.", "success");
    },
    onError: (e: Error & { status?: number }, id) => {
      if (e?.status === 409 || /already taken|already accepted/i.test(e?.message || "")) {
        dismiss(id);
        qc.setQueryData(
          ["rider-requests"],
          (old: { orders?: { id: string }[]; rides?: { id: string }[] } | undefined) => {
            if (!old) return old;
            return { ...old, orders: (old.orders || []).filter((o) => o.id !== id) };
          }
        );
        showToast("This order was already accepted by another rider.", "error");
      } else {
        /* Persist to IndexedDB queue so the accept survives connectivity loss */
        const looksLikeNetErr = /network|fetch|timeout|offline/i.test(e?.message || "");
        if (looksLikeNetErr)
          enqueueAction("accept_order", id, {}).catch((err) => {
            log.error(
              { err: err instanceof Error ? err.message : String(err) },
              "[Home] enqueueAction accept_order failed"
            );
          });
        showToast(e.message || "Could not accept order. Please try again.", "error");
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
    },
  });

  const rejectOrderMut = useMutation({
    mutationFn: (id: string) => api.rejectOrder(id),
    onSuccess: (_: unknown, id: string) => {
      dismiss(id);
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      showToast("Order rejected.", "success");
    },
    onError: (e: Error) => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      showToast(e.message || "Could not reject order", "error");
    },
  });

  const acceptRideMut = useMutation({
    mutationFn: (id: string) => api.acceptRide(id),
    onSuccess: (_: unknown, id: string) => {
      /* Accepted items should NOT be added to the dismissed set (dismissed = rejected by rider).
         Remove the id from dismissed persistence if it was there, and prune cache directly. */
      removeDismissed(id).catch((err: unknown) => {
        log.debug("[Home] removeDismissed ride accept failed:", err);
      });
      setDismissed((prev) => {
        const next = new Set([...prev]);
        next.delete(id);
        return next;
      });
      qc.setQueryData(
        ["rider-requests"],
        (old: { orders?: { id: string }[]; rides?: { id: string }[] } | undefined) => {
          if (!old) return old;
          return { ...old, rides: (old.rides ?? []).filter((r) => r.id !== id) };
        }
      );
      stopRequestSoundIfEmpty();
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
      logRideEvent(id, "accepted", (msg, isErr) => showToast(msg, isErr ? "error" : "success"));
      showToast("Ride accepted! Check Active tab.", "success");
    },
    onError: (e: Error & { status?: number }, id) => {
      if (e?.status === 409 || /already taken|already accepted/i.test(e?.message || "")) {
        dismiss(id);
        qc.setQueryData(
          ["rider-requests"],
          (old: { orders?: { id: string }[]; rides?: { id: string }[] } | undefined) => {
            if (!old) return old;
            return { ...old, rides: (old.rides || []).filter((r) => r.id !== id) };
          }
        );
        showToast("This ride was already accepted by another rider.", "error");
      } else {
        /* Persist to IndexedDB queue so the accept survives connectivity loss */
        const looksLikeNetErr = /network|fetch|timeout|offline/i.test(e?.message || "");
        if (looksLikeNetErr)
          enqueueAction("accept_ride", id, {}).catch((err) => {
            log.error(
              { err: err instanceof Error ? err.message : String(err) },
              "[Home] enqueueAction accept_ride failed"
            );
          });
        showToast(e.message || "Could not accept ride. Please try again.", "error");
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
    },
  });

  const counterRideMut = useMutation({
    mutationFn: ({ id, counterFare }: { id: string; counterFare: number }) =>
      api.counterRide(id, { counterFare }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      showToast("Counter offer submitted!", "success");
    },
    onError: (e: Error) => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      showToast(e.message || "Counter offer failed", "error");
    },
  });

  const rejectOfferMut = useMutation({
    mutationFn: (id: string) => api.rejectOffer(id),
    onSuccess: (_: unknown, id: string) => {
      dismiss(id);
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      showToast("Ride skipped.", "success");
    },
    onError: (e: Error) => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      showToast(e.message, "error");
    },
  });

  interface IgnorePenaltyData {
    ignorePenalty?: { penaltyApplied?: number; restricted?: boolean; dailyIgnores?: number };
    penaltyApplied?: number;
    restricted?: boolean;
    dailyIgnores?: number;
  }

  const ignoreRideMut = useMutation({
    mutationFn: (id: string) => api.ignoreRide(id),
    onSuccess: (data: IgnorePenaltyData, id: string) => {
      dismiss(id);
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      const p = data?.ignorePenalty ?? data;
      if ((p?.penaltyApplied ?? 0) > 0) {
        showToast(
          `Ignored — ${currency} ${p.penaltyApplied} penalty deducted!${p.restricted ? " Account restricted." : ""}`,
          "error"
        );
      } else {
        showToast(`Ride ignored (${p?.dailyIgnores || "?"} today).`, "success");
      }
    },
    onError: (e: Error) => {
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      showToast(e.message || "Ignore failed", "error");
    },
  });

  const toggleSilence = () => {
    const next = !getSilenceMode();
    setSilenceMode(next);
    setSilenceOn(next);
    showToast(
      next ? "Silence mode ON — no alert sounds" : "Silence mode OFF — sounds enabled",
      "success"
    );
  };

  if (authLoading) return <SkeletonHome />;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return T("goodMorning");
    if (h < 17) return T("goodAfternoon");
    return T("goodEvening");
  })();

  /* Count how many top-fixed banners are currently active (28 px each).
     This must mirror the logic in FixedBanners so the header always sits
     below the last visible banner regardless of how many are showing. */
  const BANNER_H_PX = 28;
  const topBannerCount =
    (!socketConnected && effectiveOnline ? 1 : 0) +
    (!!zoneWarning && effectiveOnline ? 1 : 0) +
    (audioLocked && effectiveOnline ? 1 : 0);
  const topBannerOffsetPx = topBannerCount * BANNER_H_PX;

  return (
    <div className="flex min-h-screen animate-[fadeIn_0.3s_ease-out] flex-col bg-[#F5F6F8]">
      <FixedBanners
        socketConnected={socketConnected}
        effectiveOnline={effectiveOnline}
        zoneWarning={zoneWarning}
        onDismissZone={() => setZoneWarning(null)}
        wakeLockWarning={wakeLockWarning}
        onDismissWakeLock={() => setWakeLockWarning(false)}
        audioLocked={audioLocked}
        onUnlockAudio={() => {
          unlockAudio();
          setAudioLocked(false);
        }}
        T={T}
      />

      <header
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-4 pb-6 text-white sm:px-6 sm:pb-8"
        style={{
          paddingTop: `calc(env(safe-area-inset-top, 0px) + 3.5rem + ${topBannerOffsetPx}px)`,
        }}
      >
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-green-500/[0.04]" />
        <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
        <div className="absolute top-1/2 right-1/4 h-32 w-32 rounded-full bg-white/[0.015]" />

        <div className="relative mx-auto max-w-2xl">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-white/40 uppercase">
                <Clock size={11} /> <LiveClock /> · AJKMart Rider
              </p>
              <h1
                className={`text-[20px] leading-tight font-extrabold tracking-tight transition-colors sm:text-[22px] ${newFlash ? "text-green-300" : "text-white"}`}
              >
                {greeting}, {user?.name?.split(" ")[0] || "Rider"} 👋
              </h1>
              {newFlash && (
                <p className="mt-0.5 flex animate-pulse items-center gap-1 text-[11px] font-bold text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  New request available!
                </p>
              )}
            </div>
            <Link
              href="/wallet"
              className="flex flex-shrink-0 flex-col items-end"
              aria-label="View wallet balance"
            >
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] px-3 py-2 text-right backdrop-blur-sm sm:px-3.5">
                <p className="text-[9px] font-bold tracking-wider text-white/40 uppercase">
                  {T("wallet")}
                </p>
                <p className="text-base leading-tight font-extrabold sm:text-lg">
                  {formatCurrency(user?.walletBalance ?? "0", currency)}
                </p>
              </div>
            </Link>
          </div>

          <OnlineToggleCard
            effectiveOnline={effectiveOnline}
            toggling={toggling}
            silenceOn={silenceOn}
            onToggleOnline={toggleOnline}
            onToggleSilence={toggleSilence}
            T={T}
          />

          <SilenceControls
            silenced={silenced}
            silenceRemaining={silenceRemaining}
            showSilenceMenu={showSilenceMenu}
            onSetShowSilenceMenu={setShowSilenceMenu}
            onSetSilenced={setSilenced}
            onSetSilenceRemaining={setSilenceRemaining}
            showToast={showToast}
          />

          <StatsGrid
            deliveriesToday={user?.stats?.deliveriesToday || 0}
            earningsToday={user?.stats?.earningsToday || 0}
            weekEarnings={earningsData?.week?.earnings || 0}
            totalDeliveries={user?.stats?.totalDeliveries || 0}
            currency={currency}
            maxDeliveries={config.rider?.maxDeliveries ?? 3}
          />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-2xl space-y-3 px-3 pt-4 pb-6 sm:px-4">
        <InlineWarnings
          gpsWarning={gpsWarning}
          onDismissGps={() => setGpsWarning(null)}
          isRestricted={!!user?.isRestricted}
          riderNotice={config.content.riderNotice}
          riderNoticeDismissed={dismissed.has("rider-notice")}
          onDismissRiderNotice={() => {
            void addDismissed("rider-notice");
            setDismissed((prev) => {
              const next = new Set(prev);
              next.add("rider-notice");
              return next;
            });
          }}
          cancelStatsData={cancelStatsData}
          ignoreStatsData={ignoreStatsData}
          currency={currency}
          minBalance={config.rider?.minBalance ?? 0}
          walletBalance={Number(user?.walletBalance) || 0}
        />

        {/* Incomplete profile banner — dismissible per session */}
        {(() => {
          const hasBankInfo = !!(user?.bankName && user?.bankAccount);
          const kycStatus = (user as { kycStatus?: string } | null)?.kycStatus ?? "none";
          const kycVerified = kycStatus === "verified" || kycStatus === "pending";
          const showBankBanner = !hasBankInfo;
          const showKycBanner = config.wallet?.kycRequired && !kycVerified;
          if (profileBannerDismissed || (!showBankBanner && !showKycBanner)) return null;

          const dismissBanner = () => {
            try {
              sessionStorage.setItem("_ajkm_profileBannerDismissed", "1");
            } catch (err) {
              log.warn("[Home] sessionStorage.setItem failed:", err);
            }
            setProfileBannerDismissed(true);
          };

          return (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-amber-800">
                  Complete your profile to unlock withdrawals
                </p>
                <div className="mt-1 space-y-0.5">
                  {showBankBanner && (
                    <p className="flex items-center gap-1 text-[10px] text-amber-700">
                      <span className="h-1 w-1 flex-shrink-0 rounded-full bg-amber-500" />
                      Bank account not added
                    </p>
                  )}
                  {showKycBanner && (
                    <p className="flex items-center gap-1 text-[10px] text-amber-700">
                      <span className="h-1 w-1 flex-shrink-0 rounded-full bg-amber-500" />
                      KYC not verified
                    </p>
                  )}
                </div>
                <Link
                  to="/profile"
                  className="mt-1.5 text-[10px] font-bold text-amber-800 underline underline-offset-2"
                >
                  Go to Profile →
                </Link>
              </div>
              <button
                onClick={dismissBanner}
                className="flex-shrink-0 p-0.5 text-amber-400 transition-colors hover:text-amber-600"
                aria-label="Dismiss banner"
              >
                ✕
              </button>
            </div>
          );
        })()}

        <GoalSection
          adminGoal={config.rider?.dailyGoal ?? 5000}
          personalGoal={earningsData?.dailyGoal ?? user?.dailyGoal ?? null}
          todayEarnings={earningsData?.today?.earnings ?? user?.stats?.earningsToday ?? 0}
          currency={currency}
          T={T}
          showToast={showToast}
          refreshUser={refreshUser}
        />

        {config.content.trackerBannerEnabled &&
          hasActiveTask &&
          config.content.trackerBannerPosition === "top" && (
            <ActiveTaskBanner activeData={activeData} variant="green" />
          )}

        {user?.isOnline ? (
          <>
            {hasActiveTask && !config.content.trackerBannerEnabled && (
              <ActiveTaskBanner activeData={activeData} variant="amber" />
            )}

            <div
              className={`overflow-hidden rounded-3xl shadow-sm transition-all duration-300 ${newFlash ? "ring-4 ring-green-400 ring-offset-2 ring-offset-[#F5F6F8]" : ""}`}
            >
              <RequestListHeader totalRequests={totalRequests} T={T} />
              <HomeRequestList
                requestsLoading={requestsLoading}
                requestsError={requestsError}
                totalRequests={totalRequests}
                dismissed={dismissed}
                onClearDismissed={() => {
                  setDismissed(new Set());
                  void clearAllDismissed();
                }}
                orders={orders}
                rides={rides}
                currency={currency}
                config={config}
                onAcceptOrder={(id) => acceptOrderMut.mutate(id)}
                onRejectOrder={(id) => rejectOrderMut.mutate(id)}
                onAcceptRide={(id) => acceptRideMut.mutate(id)}
                onCounterRide={(id, fare) => counterRideMut.mutate({ id, counterFare: fare })}
                onRejectOffer={(id) => rejectOfferMut.mutate(id)}
                onIgnoreRide={(id) => ignoreRideMut.mutate(id)}
                onDismiss={dismiss}
                acceptOrderPending={acceptOrderMut.isPending}
                rejectOrderPending={rejectOrderMut.isPending}
                acceptRidePending={acceptRideMut.isPending}
                counterRidePending={counterRideMut.isPending}
                rejectOfferPending={rejectOfferMut.isPending}
                ignoreRidePending={ignoreRideMut.isPending}
                requestsServerTime={requestsServerTime}
                userId={user?.id || ""}
                isRestricted={!!user?.isRestricted}
                onRetry={() => qc.invalidateQueries({ queryKey: ["rider-requests"] })}
                T={T}
              />
            </div>
          </>
        ) : (
          <div className="animate-[slideUp_0.3s_ease-out] rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm sm:p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gray-50 sm:h-20 sm:w-20">
              <Wifi size={32} className="text-gray-300" />
            </div>
            <p className="text-base font-extrabold tracking-tight text-gray-700 sm:text-lg">
              You are Offline
            </p>
            <p className="mt-1.5 text-sm text-gray-400">
              Toggle the switch above to start accepting orders
            </p>
            <button
              onClick={toggleOnline}
              disabled={toggling}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60"
              aria-label="Go online to start accepting orders"
            >
              <Zap size={16} /> Go Online
            </button>
          </div>
        )}

        {config.content.trackerBannerEnabled &&
          hasActiveTask &&
          config.content.trackerBannerPosition === "bottom" && (
            <div className="mt-3">
              <ActiveTaskBanner activeData={activeData} variant="green" />
            </div>
          )}
      </main>

      {toastMsg && (
        <div className="pointer-events-none fixed top-6 right-4 left-4 z-[1100] animate-[slideDown_0.3s_ease-out]">
          <div
            className={`${toastType === "success" ? "bg-green-600" : "bg-red-600"} mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-2xl`}
          >
            {toastType === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            {toastMsg}
          </div>
        </div>
      )}

      {hasActiveTask && !config.content.trackerBannerEnabled && (
        <Link
          href="/active"
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] left-4 z-30 block animate-[slideUp_0.3s_ease-out] rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3 shadow-lg shadow-green-300/40 transition-transform active:scale-[0.98]"
          aria-label="Go to active task"
        >
          <div className="mx-auto flex max-w-md items-center gap-2.5">
            <div className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-white" />
            <p className="flex-1 truncate text-sm font-extrabold text-white">
              {T("youHaveActiveTask")}
            </p>
            <ChevronRight size={14} className="flex-shrink-0 text-white/80" />
          </div>
        </Link>
      )}

      {showOfflineConfirm && (
        <OfflineConfirmDialog
          totalRequests={totalRequests}
          onStayOnline={() => setShowOfflineConfirm(false)}
          onGoOffline={async () => {
            setShowOfflineConfirm(false);
            await doActualToggle();
          }}
        />
      )}
    </div>
  );
}
