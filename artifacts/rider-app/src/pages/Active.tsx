import { createLogger } from "@/lib/logger";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { AlertTriangle, Bike, MapPin, MessageSquare, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { enqueue } from "../lib/gpsQueue";
import { enqueueAction } from "../lib/offline/queueManager";
import { useAuth } from "../lib/rider-auth";
import { logRideEvent } from "../lib/rideUtils";
import { useSocket } from "../lib/socket";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
const log = createLogger("[Active]");

import {
  compressImage,
  ElapsedBadge,
  haversineDistance,
  RIDE_STEPS,
  SkeletonActive,
} from "../components/active/ActiveHelpers";
import { ActiveModals } from "../components/active/ActiveModals";
import { ActiveOrderPanel } from "../components/active/ActiveOrderPanel";
import { ActiveRidePanel } from "../components/active/ActiveRidePanel";
import { parseAdminChatPayload, parseRideOtpPayload } from "../lib/socketEvents";

export default function Active() {
  const qc = useQueryClient();
  const { config } = usePlatformConfig();
  const { user } = useAuth();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const currency = config.platform.currencySymbol ?? "Rs.";
  const ORDER_LABELS = [T("goToStore"), T("pickedUp"), T("delivered")];
  const RIDE_LABELS = [T("acceptOrder"), T("atPickup"), T("inTransit"), T("done")];
  const [toastMsg, setToastMsg] = useState("");
  const [toastIsError, setToastIsError] = useState(false);
  const [syncFailedCount, setSyncFailedCount] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [cancelTarget, setCancelTarget] = useState<"order" | "ride">("order");
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofFileName, setProofFileName] = useState<string>("");
  const [proofUploading, setProofUploading] = useState(false);
  const [proofStagedForRetry, setProofStagedForRetry] = useState(false);
  const [showNoPhotoWarning, setShowNoPhotoWarning] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressedBtn, setPressedBtn] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [adminMessages, setAdminMessages] = useState<
    Array<{ text: string; ts: string; from: "admin" | "rider" }>
  >([]);
  const [showAdminChat, setShowAdminChat] = useState(false);
  const [chatReply, setChatReply] = useState("");
  const { socket: sharedSocket, setRiderPosition, setSlowGps } = useSocket();

  const socketRef = useRef(sharedSocket);
  socketRef.current = sharedSocket;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sharedSocket) return;
    const handler = (raw: unknown) => {
      if (!isMountedRef.current) return;
      const msg = parseAdminChatPayload(raw);
      if (!msg) return;
      setAdminMessages((prev) => [...prev, { text: msg.message, ts: msg.sentAt, from: "admin" }]);
      setShowAdminChat(true);
    };
    sharedSocket.on("admin:chat", handler);
    return () => {
      sharedSocket.off("admin:chat", handler);
    };
  }, [sharedSocket]);

  useEffect(() => {
    if (!sharedSocket) return;
    const onOrderUpdate = () => {
      if (!isMountedRef.current) return;
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
    };
    sharedSocket.on("order:update", onOrderUpdate);
    sharedSocket.on("order:assigned", onOrderUpdate);
    return () => {
      sharedSocket.off("order:update", onOrderUpdate);
      sharedSocket.off("order:assigned", onOrderUpdate);
    };
  }, [sharedSocket, qc]);

  useEffect(() => {
    if (!sharedSocket) return;
    const onRideOtp = (raw: unknown) => {
      if (!isMountedRef.current) return;
      const data = parseRideOtpPayload(raw);
      if (!data) return;
      /* The real shape returned by api.getActive() and cached under
         ["rider-active"] is: { order?: {...}, ride?: {...} }
         Update ride.otp in-place so the OTP button gate becomes active
         without waiting for the next polling interval. */
      type ActiveCache =
        | { order?: Record<string, unknown>; ride?: Record<string, unknown> }
        | null
        | undefined;
      qc.setQueryData(["rider-active"], (old: ActiveCache) => {
        if (!old) return old;
        const ride = old.ride;
        if (!ride || ride["id"] !== data.rideId) return old;
        return { ...old, ride: { ...ride, tripOtp: data.otp, otpVerified: false } };
      });
    };
    sharedSocket.on("ride:otp", onRideOtp);
    return () => {
      sharedSocket.off("ride:otp", onRideOtp);
    };
  }, [sharedSocket, qc]);

  type QueuedUpdate = { kind: "location" | "status"; run: () => Promise<unknown> };
  const pendingUpdatesRef = useRef<QueuedUpdate[]>([]);
  const queueUpdate = (update: QueuedUpdate) => {
    pendingUpdatesRef.current = [
      ...pendingUpdatesRef.current.filter((u) => u.kind !== update.kind),
      update,
    ];
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const refetchRef = useRef<(() => void) | null>(null);
  const showToastRef = useRef<((msg: string, isError?: boolean) => void) | null>(null);
  const TRef = useRef<((key: TranslationKey) => string) | null>(null);
  const retrySyncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      setSyncFailedCount(0);
      const pending = [...pendingUpdatesRef.current];
      pendingUpdatesRef.current = [];
      const locationUpdates = pending.filter((item) => item.kind === "location");
      const statusUpdates = pending.filter((item) => item.kind === "status");
      if (locationUpdates.length > 0) {
        const latest = locationUpdates[locationUpdates.length - 1];
        latest.run().catch((err) => {
          log.error(
            { err: err instanceof Error ? err.message : String(err) },
            "[Active] latest.run failed"
          );
        });
      }
      if (statusUpdates.length > 0) {
        pendingUpdatesRef.current.push(...statusUpdates);
        retrySyncRef.current?.();
      }
      refetchRef.current?.();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [qc]);

  const showToast = (msg: string, isError = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    setToastIsError(isError);
    toastTimerRef.current = setTimeout(() => setToastMsg(""), 3000);
  };
  showToastRef.current = showToast;
  TRef.current = T;

  const [tabVisible, setTabVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const drainStatusQueue = () => {
    const allPending = [...pendingUpdatesRef.current];
    const statusUpdates = allPending.filter((item) => item.kind === "status");
    if (statusUpdates.length === 0) return;
    pendingUpdatesRef.current = allPending.filter((item) => item.kind === "location");
    setSyncFailedCount(0);
    void Promise.allSettled(statusUpdates.map((item) => item.run())).then((results) => {
      results.forEach((result, i) => {
        if (result.status === "rejected") log.error(`Status update ${i} failed:`, result.reason);
      });
      const failed = statusUpdates.filter((_, i) => results[i]?.status === "rejected");
      if (failed.length > 0) {
        pendingUpdatesRef.current.push(...failed);
        setSyncFailedCount(failed.length);
      }
      if (results.some((r) => r.status === "fulfilled")) {
        void qc.invalidateQueries({ queryKey: ["rider-active"] });
        void qc.invalidateQueries({ queryKey: ["rider-history"] });
        void qc.invalidateQueries({ queryKey: ["rider-earnings"] });
        void qc.invalidateQueries({ queryKey: ["rider-requests"] });
        showToastRef.current?.(TRef.current?.("statusUpdated") ?? "Status updated");
      }
    });
  };
  retrySyncRef.current = drainStatusQueue;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rider-active"],
    queryFn: () => api.getActive(),
    refetchInterval: tabVisible ? 8000 : false,
  });
  refetchRef.current = refetch;

  useEffect(() => {
    if (tabVisible) void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabVisible]);

  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  const gpsWarningRef = useRef<string | null>(null);
  const [showProximityWarning, setShowProximityWarning] = useState(false);

  const setGpsWarningWithRef = (val: string | null) => {
    gpsWarningRef.current = val;
    setGpsWarning(val);
  };

  const batteryRef = useRef<number | undefined>(undefined);
  const minGpsIntervalMsRef = useRef(5_000);
  const activeDataRef = useRef(data);
  /** Stable GPS options object — extracted to a ref so the watchPosition call
   *  never sees a new object reference between renders, preventing unnecessary
   *  watcher teardown/restart while an active ride is in progress. */
  const gpsOptionsRef = useRef<PositionOptions>({
    enableHighAccuracy: true,
    maximumAge: 10_000,
    timeout: 20_000,
  });
  activeDataRef.current = data;

  useEffect(() => {
    type BatteryManager = {
      level: number;
      addEventListener: (ev: string, cb: () => void) => void;
      removeEventListener: (ev: string, cb: () => void) => void;
    };
    let batt: BatteryManager | undefined;
    let mounted = true;
    const onLevelChange = () => {
      if (batt) batteryRef.current = batt.level;
    };
    (navigator as unknown as { getBattery?: () => Promise<BatteryManager> })
      .getBattery?.()
      .then((b) => {
        if (!mounted) return;
        batt = b;
        batteryRef.current = b.level;
        b.addEventListener("levelchange", onLevelChange);
      })
      .catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Active] sendLocation failed"
        );
      });
    return () => {
      mounted = false;
      batt?.removeEventListener("levelchange", onLevelChange);
    };
  }, []);

  useEffect(() => {
    if (data?.order && !data?.ride) setCancelTarget("order");
    else if (data?.ride && !data?.order) setCancelTarget("ride");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data?.order, !!data?.ride]);

  useEffect(() => {
    if (!riderPos || !data?.order) {
      setShowProximityWarning(false);
      return;
    }
    const vendorLat = (data.order as Record<string, unknown>).vendorLat as number | undefined;
    const vendorLng = (data.order as Record<string, unknown>).vendorLng as number | undefined;
    if (!vendorLat || !vendorLng) {
      setShowProximityWarning(false);
      return;
    }
    const R = 6371000;
    const dLat = ((vendorLat - riderPos.lat) * Math.PI) / 180;
    const dLng = ((vendorLng - riderPos.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((riderPos.lat * Math.PI) / 180) *
        Math.cos((vendorLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    setShowProximityWarning(
      dist > 500 &&
        !data.order.status?.startsWith("picked") &&
        data.order.status !== "out_for_delivery"
    );
  }, [riderPos, data?.order]);

  useEffect(() => {
    const hasActiveWork = !!(data?.order || data?.ride);
    if (!hasActiveWork || !user?.id) return;
    if (!navigator?.geolocation) return;
    let lastSentTime = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRiderPosition(pos.coords.latitude, pos.coords.longitude);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const batteryLow = typeof batteryRef.current === "number" && batteryRef.current < 0.2;
        let isFar = false;
        const active = activeDataRef.current;
        if (active?.order) {
          const o = active.order as Record<string, unknown>;
          const wLat = (o.dropoffLat ?? o.pickupLat) as number | undefined;
          const wLng = (o.dropoffLng ?? o.pickupLng) as number | undefined;
          if (wLat && wLng) isFar = haversineDistance(lat, lng, wLat, wLng) > 2;
        } else if (active?.ride) {
          const r = active.ride as Record<string, unknown>;
          const wLat = (r.dropoffLat ?? r.pickupLat) as number | undefined;
          const wLng = (r.dropoffLng ?? r.pickupLng) as number | undefined;
          if (wLat && wLng) isFar = haversineDistance(lat, lng, wLat, wLng) > 2;
        }
        const slow = batteryLow || isFar;
        minGpsIntervalMsRef.current = slow ? 30_000 : 5_000;
        setSlowGps(slow);
        const now = Date.now();
        if (now - lastSentTime < minGpsIntervalMsRef.current) return;
        lastSentTime = now;
        /* Heuristic mock-GPS check: real devices rarely have accuracy=0 AND
           speed=0 AND heading=null simultaneously. A single zero is not enough
           to trigger because some chipsets legitimately return accuracy=0 on a
           perfect fix. Server-side spoof detection is the authoritative gate. */
        const isMockGps =
          pos.coords.accuracy === 0 && pos.coords.speed === 0 && pos.coords.heading == null;
        if (isMockGps) {
          if (isMountedRef.current)
            setGpsWarningWithRef(
              "Suspicious GPS accuracy detected. Please disable mock location apps."
            );
          return;
        }
        const gpsPayload = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          speed: pos.coords.speed ?? undefined,
          heading: pos.coords.heading ?? undefined,
          rideId: activeDataRef.current?.ride?.id ?? undefined,
        };
        const queuedPing = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          speed: pos.coords.speed ?? undefined,
          heading: pos.coords.heading ?? undefined,
        };
        const doUpdate = () =>
          api
            .updateLocation(gpsPayload)
            .then(() => {
              if (isMountedRef.current && gpsWarningRef.current) setGpsWarningWithRef(null);
            })
            .catch((err: unknown) => {
              if (!isMountedRef.current) return;
              const msg = err instanceof Error ? err.message : "";
              const isSpoofError =
                msg.toLowerCase().includes("spoof") || msg.toLowerCase().includes("mock");
              if (isSpoofError) {
                setGpsWarningWithRef("Mock location detected — please disable fake GPS apps.");
              } else {
                enqueue(queuedPing).catch((err) => {
                  log.error(
                    { err: err instanceof Error ? err.message : String(err) },
                    "[Active] GPS ping enqueue (spoof error) failed"
                  );
                });
                setGpsWarningWithRef(
                  TRef.current?.("gpsLocationError") ??
                    "Location not being tracked — check GPS permissions"
                );
              }
            });
        if (!navigator.onLine) {
          enqueue(queuedPing).catch((err) => {
            log.error(
              { err: err instanceof Error ? err.message : String(err) },
              "[Active] GPS ping enqueue (offline) failed"
            );
          });
          queueUpdate({ kind: "location", run: doUpdate });
        } else {
          void doUpdate();
        }
      },
      () => {
        if (!isMountedRef.current) return;
        setGpsWarningWithRef(
          TRef.current?.("gpsNotAvailable") ??
            "GPS not available — please enable location in Settings"
        );
      },
      gpsOptionsRef.current
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data?.order, !!data?.ride, user?.id]);

  /* GPS drain handler is registered globally in App.tsx for the full session
     lifetime — registering a second one here would overwrite it and nullify it
     when this component unmounts, breaking batch uploads on other pages. */

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFileName(file.name);
    let compressed: File = file;
    try {
      compressed = await compressImage(file, 1920, 1.5 * 1024 * 1024);
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[Active] compressImage failed — using original"
      );
    }
    setProofFile(compressed);
    const compressForPreview = (dataUrl: string): Promise<string> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 1280 / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      if (!raw) return;
      const preview = await compressForPreview(raw);
      setProofPhoto(preview);
      setProofStagedForRetry(false);
    };
    reader.onerror = () => {
      setProofFileName("");
      setProofFile(null);
    };
    reader.readAsDataURL(file);
  };

  const handleMarkDelivered = async (id: string, forceNoPhoto = false) => {
    if (!proofPhoto && !forceNoPhoto) {
      setShowNoPhotoWarning(true);
      return;
    }
    setShowNoPhotoWarning(false);
    if (proofPhoto && !navigator.onLine) {
      /* Offline with a photo already in state as a base64 DataURL.
         The backend accepts proofPhoto as a base64 DataURL directly (not just a
         server URL), so we can enqueue the full delivery payload right now without
         uploading to the server first. The queue will replay it when reconnected. */
      showToast("You're offline — delivery queued with photo for retry.", true);
      enqueueAction("update_order", id, { status: "delivered", proofPhoto }).catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Active] enqueueAction deliver-offline failed"
        );
      });
      return;
    }
    let photoUrl: string | undefined;
    if (proofFile) {
      setProofUploading(true);
      try {
        const uploadRes = await api.uploadProof(proofFile);
        if (typeof uploadRes?.url !== "string" || !uploadRes.url.trim())
          throw new Error("Photo upload succeeded but server returned no URL — please retake");
        photoUrl = uploadRes.url;
      } catch (e: unknown) {
        const status = (e as { status?: number })?.status;
        if (status === 400 || status === 413) {
          showToast("Photo too large, please try again.", true);
        } else {
          const isNetworkErr = !status;
          if (isNetworkErr) {
            setProofStagedForRetry(true);
            showToast(
              "Photo upload failed — file is held, tap 'Mark Delivered' again to retry.",
              true
            );
          } else {
            showToast(
              e instanceof Error ? e.message : "Photo upload failed. Please try again.",
              true
            );
          }
        }
        setProofUploading(false);
        return;
      }
      setProofUploading(false);
    }
    if (!navigator.onLine) {
      showToast("You're offline — update queued for retry", true);
      enqueueAction("update_order", id, {
        status: "delivered",
        ...(photoUrl ? { proofPhoto: photoUrl } : {}),
      }).catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Active] enqueueAction deliver-offline (post-upload) failed"
        );
      });
      return;
    }
    updateOrderMut.mutate({ id, status: "delivered", photoUrl });
  };

  const mapMutationError = (e: Error, t: typeof T): string => {
    const lower = (e?.message ?? "").toLowerCase();
    if (lower.includes("offline") || lower.includes("network"))
      return "Network unavailable — will retry when online";
    if (lower.includes("timeout")) return "Request timed out — please try again";
    return t("somethingWentWrong") as string;
  };

  const updateOrderMut = useMutation({
    /* NOTE: The offline guard lives in handleMarkDelivered (which returns early
       and enqueues there). This mutationFn is therefore only reached when
       navigator.onLine was true at call-time. If the network drops mid-flight,
       onError's network-error branch enqueues the action (single enqueue,
       guarded by context.enqueued). No synthetic-success path needed here. */
    mutationFn: ({ id, status, photoUrl }: { id: string; status: string; photoUrl?: string }) =>
      api.updateOrder(id, status, photoUrl),
    onMutate: () => ({ enqueued: false }),

    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
      void qc.invalidateQueries({ queryKey: ["rider-history"] });
      void qc.invalidateQueries({ queryKey: ["rider-earnings"] });
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      if (vars.status === "delivered") {
        setProofPhoto(null);
        setProofFileName("");
        setProofFile(null);
        setProofStagedForRetry(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
        showToast(T("orderDeliveredEarnings"));
      } else if (vars.status === "cancelled") {
        setProofPhoto(null);
        setProofFile(null);
        setProofFileName("");
        setProofStagedForRetry(false);
        showToast(T("orderCancelledMsg"));
      } else {
        showToast(T("statusUpdated"));
      }
    },
    onError: (e: Error, vars, context) => {
      const looksLikeNetworkErr = /network|fetch|timeout|offline/i.test(e?.message || "");
      if (looksLikeNetworkErr && !context?.enqueued)
        enqueueAction("update_order", vars.id, {
          status: vars.status,
          ...(vars.photoUrl ? { proofPhoto: vars.photoUrl } : {}),
        }).catch((err) => {
          log.error(
            { err: err instanceof Error ? err.message : String(err) },
            "[Active] enqueueAction update_order (network error retry) failed"
          );
        });
      showToast(mapMutationError(e, T), true);
    },
    onSettled: () => {
      setShowCancelConfirm(false);
    },
  });

  const updateRideMut = useMutation({
    mutationFn: ({
      id,
      status,
      lat,
      lng,
    }: {
      id: string;
      status: string;
      lat?: number;
      lng?: number;
    }) => {
      const loc = lat != null && lng != null ? { lat, lng } : undefined;
      return api.updateRide(id, status, loc);
    },
    onMutate: () => ({ enqueued: false }),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
      void qc.invalidateQueries({ queryKey: ["rider-history"] });
      void qc.invalidateQueries({ queryKey: ["rider-earnings"] });
      void qc.invalidateQueries({ queryKey: ["rider-requests"] });
      logRideEvent(vars.id, vars.status, (msg, isErr) => showToast(msg, isErr));
      if (vars.status === "completed") showToast(T("rideCompletedEarnings"));
      else if (vars.status === "cancelled") showToast(T("rideCancelledMsg"));
      else showToast(T("statusUpdated"));
    },
    onError: (e: Error, vars, context) => {
      const looksLikeNetworkErr = /network|fetch|timeout|offline/i.test(e?.message || "");
      if (looksLikeNetworkErr && !context?.enqueued) {
        const loc =
          vars.lat != null && vars.lng != null ? { lat: vars.lat, lng: vars.lng } : undefined;
        enqueueAction("update_ride", vars.id, { status: vars.status, ...(loc ?? {}) }).catch(
          (err) => {
            log.error(
              { err: err instanceof Error ? err.message : String(err) },
              "[Active] enqueueAction update_ride (network error retry) failed"
            );
          }
        );
      }
      showToast(mapMutationError(e, T), true);
    },
    onSettled: () => {
      setShowCancelConfirm(false);
    },
  });

  const verifyOtpMut = useMutation({
    mutationFn: ({ id, otp }: { id: string; otp: string }) => api.verifyRideOtp(id, otp),
    onSuccess: () => {
      setShowOtpModal(false);
      setOtpInput("");
      void qc.invalidateQueries({ queryKey: ["rider-active"] });
      showToast("OTP verified! You can now start the ride.");
    },
    onError: (e: Error) => showToast(e.message, true),
  });

  if (isLoading) return <SkeletonActive />;

  const order = data?.order;
  const ride = data?.ride;

  if (!order && !ride)
    return (
      <div className="flex min-h-screen flex-col bg-[#F5F6F8]">
        <div
          className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-10"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
        >
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-green-500/[0.04]" />
          <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
          <div className="relative">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">{T("activeTask")}</h1>
            <p className="mt-0.5 text-sm text-white/40">{T("noCurrentAssignment")}</p>
          </div>
        </div>
        {syncFailedCount > 0 && !isOffline && (
          <div className="mx-4 mt-4 flex items-center gap-3 rounded-3xl border border-red-300 bg-gradient-to-r from-red-50 to-orange-50 p-3.5 shadow-sm">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-100">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug font-extrabold text-red-800">
                {syncFailedCount} status update{syncFailedCount > 1 ? "s" : ""} could not be synced
                — tap to retry manually.
              </p>
            </div>
            <button
              onClick={() => retrySyncRef.current?.()}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-2xl bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-red-200 transition-transform active:scale-95"
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-[2rem] border border-gray-200/50 bg-gradient-to-br from-gray-50 to-gray-100 shadow-inner">
              <Bike size={52} className="text-gray-300" />
            </div>
            <h2 className="text-xl font-extrabold text-gray-700">{T("noActiveTask")}</h2>
            <p className="mx-auto mt-2 max-w-[260px] text-sm leading-relaxed text-gray-400">
              {T("acceptFromHome")}
            </p>
            <button
              onClick={() => refetch()}
              className="mx-auto mt-6 flex items-center gap-2 rounded-xl bg-gray-900 px-7 py-3.5 text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.97]"
            >
              <RefreshCw size={15} /> {T("refresh")}
            </button>
          </div>
        </div>
      </div>
    );

  const orderStep = !order
    ? 0
    : order.status === "delivered"
      ? 2
      : order.status === "picked_up" || order.status === "out_for_delivery"
        ? 1
        : 0;
  const rideStep = ride ? Math.max(0, RIDE_STEPS.indexOf(ride.status)) : 0;
  const startedAt = order?.acceptedAt || ride?.acceptedAt || null;
  const riderEarningPct = config.rides?.riderEarningPct ?? config.finance?.riderEarningPct ?? 0;

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-7"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-green-500/[0.04]" />
        <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
        <div className="absolute top-1/2 left-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.015]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-400 shadow-sm shadow-green-400" />
              <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">
                Live
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              {order ? T("activeDelivery") : T("activeRide")}
            </h1>
            <p className="mt-1 text-sm font-medium text-white/40">
              {order
                ? `${order.type} order — ${order.status === "picked_up" || order.status === "out_for_delivery" ? "Delivering to customer" : "Pick up from store"}`
                : `${ride?.type} ride in progress`}
            </p>
          </div>
          <ElapsedBadge startIso={startedAt} />
        </div>
      </div>

      {/* Status banners */}
      {isOffline && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-3xl border border-red-300 bg-gradient-to-r from-red-50 to-orange-50 p-3.5 shadow-sm">
          <div className="flex h-9 w-9 flex-shrink-0 animate-pulse items-center justify-center rounded-xl bg-red-100">
            <WifiOff size={18} className="text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-extrabold text-red-800">
              You're offline
              {pendingUpdatesRef.current.length > 0
                ? ` — ${pendingUpdatesRef.current.length} update${pendingUpdatesRef.current.length > 1 ? "s" : ""} queued`
                : ""}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-red-600">
              Updates will retry automatically when reconnected.
            </p>
          </div>
        </div>
      )}

      {syncFailedCount > 0 && !isOffline && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-3xl border border-red-300 bg-gradient-to-r from-red-50 to-orange-50 p-3.5 shadow-sm">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-100">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-snug font-extrabold text-red-800">
              {syncFailedCount} status update{syncFailedCount > 1 ? "s" : ""} could not be synced.
            </p>
          </div>
          <button
            onClick={() => retrySyncRef.current?.()}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-2xl bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-red-200 transition-transform active:scale-95"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {gpsWarning && (
        <div className="mx-4 mt-3 flex animate-[slideDown_0.3s_ease-out] items-start gap-3 rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3.5 shadow-sm">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-extrabold text-amber-800">GPS Warning</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700">{gpsWarning}</p>
          </div>
          <button
            onClick={() => setGpsWarning(null)}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-500 transition-colors active:bg-amber-200"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {showProximityWarning && (
        <div className="mx-4 mt-3 flex animate-[slideDown_0.3s_ease-out] items-center gap-3 rounded-3xl border border-yellow-300 bg-gradient-to-r from-yellow-50 to-amber-50 p-3.5 shadow-sm">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-yellow-100">
            <MapPin size={18} className="text-yellow-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-extrabold text-yellow-800">Far from store</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-yellow-700">
              You're more than 500m from the store. Head there to pick up the order.
            </p>
          </div>
        </div>
      )}

      {/* Admin chat banner */}
      {adminMessages.length > 0 && (
        <div className="mx-4 mt-3 flex animate-[slideDown_0.3s_ease-out] items-center gap-3 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 shadow-lg shadow-blue-200">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
            <MessageSquare size={16} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-white">Message from Admin</p>
            <p className="mt-0.5 truncate text-[11px] leading-relaxed text-blue-100">
              {adminMessages[adminMessages.length - 1]?.text}
            </p>
          </div>
          <button
            onClick={() => setShowAdminChat(true)}
            className="flex-shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-blue-600"
          >
            View
          </button>
          <button
            onClick={() => setAdminMessages(() => [])}
            className="flex-shrink-0 text-xs text-white/60 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="space-y-4 px-4 py-4">
        {order && (
          <ActiveOrderPanel
            order={order as Record<string, unknown>}
            orderStep={orderStep}
            ORDER_LABELS={ORDER_LABELS}
            riderPos={riderPos}
            currency={currency}
            deliveryFeeConfig={config.deliveryFee}
            riderEarningPct={riderEarningPct}
            updateOrderMut={updateOrderMut}
            proofPhoto={proofPhoto}
            proofFile={proofFile}
            proofFileName={proofFileName}
            proofUploading={proofUploading}
            proofStagedForRetry={proofStagedForRetry}
            setProofPhoto={setProofPhoto}
            setProofFile={setProofFile}
            setProofFileName={setProofFileName}
            setShowNoPhotoWarning={setShowNoPhotoWarning}
            photoInputRef={photoInputRef}
            handlePhotoCapture={handlePhotoCapture}
            handleMarkDelivered={handleMarkDelivered}
            setCancelTarget={setCancelTarget}
            setShowCancelConfirm={setShowCancelConfirm}
            pressedBtn={pressedBtn}
            setPressedBtn={setPressedBtn}
            T={T}
          />
        )}

        {ride && (
          <ActiveRidePanel
            ride={ride as Record<string, unknown>}
            rideStep={rideStep}
            RIDE_LABELS={RIDE_LABELS}
            riderPos={riderPos}
            currency={currency}
            riderEarningPct={riderEarningPct}
            config={
              config as {
                rides?: { riderEarningPct?: number };
                finance: { riderEarningPct?: number };
                features?: { sos?: boolean };
              }
            }
            updateRideMut={updateRideMut}
            setShowOtpModal={setShowOtpModal}
            setOtpInput={setOtpInput}
            setCancelTarget={setCancelTarget}
            setShowCancelConfirm={setShowCancelConfirm}
            pressedBtn={pressedBtn}
            setPressedBtn={setPressedBtn}
            showToast={showToast}
            T={T}
          />
        )}
      </div>

      <ActiveModals
        showOtpModal={showOtpModal}
        showCancelConfirm={showCancelConfirm}
        showNoPhotoWarning={showNoPhotoWarning}
        showAdminChat={showAdminChat}
        toastMsg={toastMsg}
        toastIsError={toastIsError}
        cancelTarget={cancelTarget}
        otpInput={otpInput}
        setOtpInput={setOtpInput}
        setShowOtpModal={setShowOtpModal}
        setShowCancelConfirm={setShowCancelConfirm}
        setShowNoPhotoWarning={setShowNoPhotoWarning}
        setShowAdminChat={setShowAdminChat}
        chatReply={chatReply}
        setChatReply={setChatReply}
        adminMessages={adminMessages}
        setAdminMessages={setAdminMessages}
        socketRef={socketRef}
        order={order as Record<string, unknown> | null}
        ride={ride as Record<string, unknown> | null}
        updateOrderMut={updateOrderMut}
        updateRideMut={updateRideMut}
        verifyOtpMut={verifyOtpMut}
        handleMarkDelivered={handleMarkDelivered}
        proofUploading={proofUploading}
        T={T}
      />
    </div>
  );
}
