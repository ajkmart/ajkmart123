import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bus,
  CheckCircle,
  ChevronRight,
  Clock,
  Navigation,
  Play,
  Square,
  Timer,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { ErrorState } from "../components/ui/ErrorState";
import { apiFetch } from "../lib/api";
import { enqueueAction, subscribeActionSuccess } from "../lib/offline/queueManager";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useAuth } from "../lib/rider-auth";
import { usePlatformConfig } from "../lib/useConfig";

interface DriverMetrics {
  tripsToday: number;
  earningsToday: number;
  onlineHoursToday: number;
  passengersToday: number;
  tripsThisMonth: number;
  earningsThisMonth: number;
  cancellationsLast30d: number;
  noShowsLast30d: number;
}

type SeatTier = "window" | "aisle" | "economy";

const TIER_BADGE: Record<SeatTier, { bg: string; text: string; label: string }> = {
  window: { bg: "bg-amber-100", text: "text-amber-700", label: "Window" },
  aisle: { bg: "bg-blue-100", text: "text-blue-700", label: "Aisle" },
  economy: { bg: "bg-green-100", text: "text-green-700", label: "Economy" },
};

interface VanSchedule {
  id: string;
  routeId: string;
  departureTime: string;
  returnTime?: string;
  routeName?: string;
  routeFrom?: string;
  routeTo?: string;
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  totalSeats?: number;
  date: string;
  bookedCount: number;
  bookedSeats: number[];
  vanCode?: string | null;
  tripStatus?: string;
  seatTiers?: Record<string, SeatTier>;
}

interface Passenger {
  id: string;
  seatNumbers: number[];
  seatTiers?: Record<string, SeatTier> | null;
  status: string;
  passengerName?: string;
  passengerPhone?: string;
  paymentMethod: string;
  fare: string;
  boardedAt?: string;
  userName?: string;
  userPhone?: string;
}

async function fetchTodaySchedules(): Promise<VanSchedule[]> {
  const data = await apiFetch("/van/driver/today");
  return data ?? [];
}

async function fetchPassengers(scheduleId: string, date: string): Promise<Passenger[]> {
  const data = await apiFetch(`/van/driver/schedules/${scheduleId}/date/${date}/passengers`);
  return data ?? [];
}

async function markBoarded(bookingId: string): Promise<void> {
  await apiFetch(`/van/driver/bookings/${bookingId}/board`, {
    method: "PATCH",
    body: JSON.stringify({ boarded: true, boardedAt: new Date().toISOString() }),
  });
}

async function startTrip(scheduleId: string, date: string): Promise<void> {
  await apiFetch(`/van/driver/schedules/${scheduleId}/date/${date}/start-trip`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function completeTrip(scheduleId: string, date: string): Promise<void> {
  await apiFetch(`/van/driver/schedules/${scheduleId}/date/${date}/complete`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

async function sendLocation(
  scheduleId: string,
  date: string,
  lat: number,
  lng: number
): Promise<void> {
  await apiFetch(`/van/driver/location`, {
    method: "POST",
    body: JSON.stringify({ scheduleId, date, latitude: lat, longitude: lng }),
  });
}

async function fetchMetrics(): Promise<DriverMetrics> {
  const data = await apiFetch("/van/driver/metrics");
  return (data ?? {}) as DriverMetrics;
}

interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
  conditions: Array<{ id: string; conditionType: string; severity: string; reason: string | null }>;
  triggered: Array<{ ruleName: string; metric: string; value: number }>;
  triggeredCount?: number;
}

async function fetchEligibility(): Promise<EligibilityResult> {
  const data = await apiFetch("/van/driver/eligibility");
  return (data ?? {
    eligible: true,
    reason: null,
    conditions: [],
    triggered: [],
    triggeredCount: 0,
  }) as EligibilityResult;
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  boarded: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-gray-100 text-gray-600",
};

function AutoPanMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const riderMarkerIcon = L.divIcon({
  className: "",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
    <div style="background:#4f46e5;border-radius:50%;width:16px;height:16px;border:3px solid white;box-shadow:0 0 0 4px rgba(79,70,229,0.3);"></div>
  </div>`,
});

export default function VanDriver() {
  const { user: _user } = useAuth();
  const { config } = usePlatformConfig();
  const qc = useQueryClient();

  /* Feature flag — checked during render (not as early return) so all hooks below
     are always called unconditionally, satisfying React Rules of Hooks. */
  const vanEnabled = config.features?.van === true;

  const [selectedSchedule, setSelectedSchedule] = useState<VanSchedule | null>(null);
  const [error, setError] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [riderPos, setRiderPos] = useState<[number, number] | null>(null);
  const gpsIntervalRef = useRef<number | null>(null);

  /* Optimistic "Trip Ending…" state shown immediately when completeTrip fails
     offline so the screen never freezes waiting for the queue to sync. */
  const [tripEndingOffline, setTripEndingOffline] = useState(false);

  const {
    data: schedules = [],
    isLoading,
    isError: schedulesError,
    refetch: refetchSchedules,
  } = useQuery<VanSchedule[]>({
    queryKey: ["van-driver-today"],
    queryFn: fetchTodaySchedules,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  const { data: metrics } = useQuery<DriverMetrics>({
    queryKey: ["van-driver-metrics"],
    queryFn: fetchMetrics,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: eligibility, isLoading: loadingEligibility } = useQuery<EligibilityResult>({
    queryKey: ["van-driver-eligibility"],
    queryFn: fetchEligibility,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  const { data: passengers = [], isLoading: loadingPassengers } = useQuery<Passenger[]>({
    queryKey: ["van-passengers", selectedSchedule?.id, selectedSchedule?.date],
    queryFn: () =>
      selectedSchedule
        ? fetchPassengers(selectedSchedule.id, selectedSchedule.date)
        : Promise.resolve([]),
    enabled: !!selectedSchedule,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  const boardMut = useMutation({
    mutationFn: (bookingId: string) => markBoarded(bookingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["van-passengers"] }),
    onError: (e: Error, bookingId: string) => {
      const looksLikeNetErr = /network|fetch|timeout|offline/i.test(e?.message || "");
      if (looksLikeNetErr) {
        enqueueAction("board_passenger", bookingId, { boardedAt: new Date().toISOString() }).catch(
          (err) => {
            console.warn("[artifacts/rider-app/src/pages/VanDriver.tsx]", err);
          }
        ); // eslint-disable-line no-console
      }
      setError(e.message);
    },
  });

  const startMut = useMutation({
    mutationFn: () =>
      selectedSchedule ? startTrip(selectedSchedule.id, selectedSchedule.date) : Promise.resolve(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-driver-today"] });
      startGpsBroadcast();
    },
    onError: (e: Error) => setError(e.message),
  });

  const completeMut = useMutation({
    mutationFn: () =>
      selectedSchedule
        ? completeTrip(selectedSchedule.id, selectedSchedule.date)
        : Promise.resolve(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-passengers"] });
      void qc.invalidateQueries({ queryKey: ["van-driver-today"] });
      stopGpsBroadcast();
      setTripEndingOffline(false);
      setSelectedSchedule(null);
    },
    onError: (e: Error) => {
      /* Persist to IndexedDB queue so the trip completion survives connectivity loss */
      const looksLikeNetErr = /network|fetch|timeout|offline/i.test(e?.message || "");
      if (looksLikeNetErr && selectedSchedule) {
        enqueueAction("complete_trip", selectedSchedule.id, { date: selectedSchedule.date }).catch(
          (err) => {
            console.warn("[artifacts/rider-app/src/pages/VanDriver.tsx]", err);
          }
        ); // eslint-disable-line no-console
        /* Immediately show optimistic "Trip Ending…" state so the UI never appears
           frozen while the action hits the offline queue to sync. */
        setTripEndingOffline(true);
      } else {
        setError(e.message);
      }
    },
  });

  /* When the offline queue replays complete_trip successfully, reset the
     optimistic state and refresh the schedule/passenger data. */
  useEffect(() => {
    if (!selectedSchedule) return;
    const scheduleId = selectedSchedule.id;
    const unsub = subscribeActionSuccess("complete_trip", (action) => {
      if (action.entityId !== scheduleId) return;
      setTripEndingOffline(false);
      stopGpsBroadcast();
      void qc.invalidateQueries({ queryKey: ["van-driver-today"] });
      void qc.invalidateQueries({ queryKey: ["van-passengers"] });
      setSelectedSchedule(null);
    });
    return unsub;
  }, [selectedSchedule?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* G6: Surface geolocation errors to the UI rather than swallowing them.
     G7: Use an in-flight flag so the 5s interval never queues a second
         getCurrentPosition while the first is still running.
     G8: Stop the broadcast when tripStatus leaves in_progress (e.g. dispatcher
         cancels server-side). We reuse the existing `error` state for the
         UI banner so users see the same red bar that mutation failures use,
         rather than introducing a parallel display surface. */
  const gpsInflightRef = useRef<boolean>(false);
  const gpsStoppedRef = useRef<boolean>(false);
  const highAccuracyRef = useRef<boolean>(true);
  const setGpsError = (msg: string | null) => {
    /* Only overwrite the error banner when there's something to show — never
       clobber a mutation error with a stale clear, or vice versa. */
    if (msg) setError(msg);
  };

  function startGpsBroadcast() {
    if (!selectedSchedule) return;
    if (!navigator?.geolocation) {
      /* G6: Don't silently say "broadcasting" when geolocation is unavailable. */
      setGpsError("Location services are not available on this device.");
      return;
    }
    setBroadcasting(true);
    gpsStoppedRef.current = false;
    setGpsError(null);
    const schedId = selectedSchedule.id;
    const schedDate = selectedSchedule.date;
    gpsIntervalRef.current = window.setInterval(() => {
      /* G7: Skip this tick if the previous getCurrentPosition is still
         pending. Stacking concurrent requests on weak GPS used to ANR. */
      if (gpsInflightRef.current) return;
      gpsInflightRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsInflightRef.current = false;
          if (gpsStoppedRef.current) return;
          setGpsError(null);
          setRiderPos([pos.coords.latitude, pos.coords.longitude]);
          sendLocation(schedId, schedDate, pos.coords.latitude, pos.coords.longitude).catch(
            (err) => {
              console.warn("[artifacts/rider-app/src/pages/VanDriver.tsx]", err);
            }
          ); // eslint-disable-line no-console
        },
        (err) => {
          gpsInflightRef.current = false;
          /* G6: Map the standard PositionError codes to actionable UI strings.
             On PERMISSION_DENIED we stop the broadcast — there is no point
             retrying since the OS won't re-prompt without a user gesture. */
          if (err.code === 1 /* PERMISSION_DENIED */) {
            setGpsError(
              "Location permission denied. Enable it in your browser/OS settings to broadcast."
            );
            stopGpsBroadcast();
          } else if (err.code === 3 /* TIMEOUT */) {
            /* G6: Fall back to coarse accuracy on timeout. */
            highAccuracyRef.current = false;
            setGpsError("GPS timed out — falling back to coarse accuracy.");
          } else {
            setGpsError("Couldn't read location — try moving to an open-sky area.");
          }
        },
        { enableHighAccuracy: highAccuracyRef.current, timeout: 4500, maximumAge: 2000 }
      );
    }, 5000);
  }

  function stopGpsBroadcast() {
    setBroadcasting(false);
    gpsStoppedRef.current = true;
    gpsInflightRef.current = false;
    if (gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      stopGpsBroadcast();
    };
  }, []);

  useEffect(() => {
    if (selectedSchedule?.tripStatus === "in_progress" && !broadcasting) {
      startGpsBroadcast();
    } else if (selectedSchedule?.tripStatus !== "in_progress" && broadcasting) {
      /* G8: tripStatus left in_progress (server-side cancel, completion, etc.)
         — stop broadcasting immediately rather than waiting for navigation. */
      stopGpsBroadcast();
    }
  }, [selectedSchedule?.tripStatus, broadcasting]); // eslint-disable-line react-hooks/exhaustive-deps

  const boardedCount = passengers.filter(
    (p) => p.status === "boarded" || p.status === "completed"
  ).length;
  const confirmedCount = passengers.filter((p) => p.status === "confirmed").length;
  const isTripInProgress = selectedSchedule?.tripStatus === "in_progress" || broadcasting;

  /* Gate: vehicle-type must be van or bus.
     Only block when vehicleType is explicitly set to a non-van/bus value.
     If the field is absent (profile not yet populated) we allow through so new
     approvals are never locked out while their profile is being filled in. */
  const vehicleType = _user?.vehicleType;
  const isVanOrBus = !vehicleType || vehicleType === "van" || vehicleType === "bus";
  if (!isVanOrBus)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-xs space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-200">
            <Bus size={32} className="text-gray-400" />
          </div>
          <h2 className="text-lg font-black text-gray-800">Van Module Not Available</h2>
          <p className="text-sm text-gray-500">
            This module is for van and bus drivers only. Your registered vehicle type is{" "}
            <strong>{vehicleType}</strong>.
          </p>
        </div>
      </div>
    );

  /* Gate: van service must be explicitly enabled by admin. */
  if (!vanEnabled)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-xs space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-200">
            <Bus size={32} className="text-gray-400" />
          </div>
          <h2 className="text-lg font-black text-gray-800">Van Service Unavailable</h2>
          <p className="text-sm text-gray-500">
            Van/commuter service is not enabled on this platform. Contact your administrator.
          </p>
        </div>
      </div>
    );

  if (schedulesError)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <ErrorState onRetry={() => refetchSchedules()} />
      </div>
    );

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading your schedule…</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-indigo-900 to-indigo-700 px-4 pt-12 pb-6 text-white">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Bus className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Van Service</h1>
            <p className="text-sm text-indigo-200">Today's route assignments</p>
          </div>
          {schedules.length > 0 && schedules[0]?.vanCode && (
            <div className="rounded-lg bg-white/15 px-3 py-1.5">
              <p className="text-xs text-indigo-200">Van Code</p>
              <p className="text-lg font-bold text-white">{schedules[0].vanCode}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-4 px-4 py-5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
            <button className="ml-auto font-bold" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        {/* Eligibility banner — blocks van mode entry when account conditions are active */}
        {!loadingEligibility && eligibility && !eligibility.eligible && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div className="flex-1">
                <div className="text-sm font-bold text-red-800">Van driver mode unavailable</div>
                <div className="mt-1 text-xs text-red-700">
                  {eligibility.reason || "Your account has an active restriction."}
                </div>
                {eligibility.conditions.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {eligibility.conditions.slice(0, 3).map((c) => (
                      <li key={c.id} className="text-[11px] text-red-700">
                        • <span className="font-semibold">{c.severity}</span> —{" "}
                        {c.reason || c.conditionType}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 text-[11px] text-red-600">
                  Contact support to lift the restriction.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Driver daily metrics */}
        {!selectedSchedule && (
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Trips Today",
                value: metrics?.tripsToday ?? 0,
                icon: TrendingUp,
                color: "text-indigo-600 bg-indigo-50",
              },
              {
                label: "Earnings",
                value: `Rs ${(metrics?.earningsToday ?? 0).toLocaleString()}`,
                icon: Wallet,
                color: "text-emerald-600 bg-emerald-50",
              },
              {
                label: "Online Hrs",
                value: (metrics?.onlineHoursToday ?? 0).toFixed(1),
                icon: Timer,
                color: "text-amber-600 bg-amber-50",
              },
            ].map((m) => (
              <div key={m.label} className={`rounded-xl p-3 ${m.color}`}>
                <m.icon className="mb-1.5 h-4 w-4 opacity-70" />
                <div className="text-lg leading-tight font-bold">{m.value}</div>
                <div className="mt-0.5 text-[11px] font-medium opacity-80">{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {!selectedSchedule &&
          metrics &&
          (metrics.tripsThisMonth > 0 || metrics.earningsThisMonth > 0) && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
              <div>
                <div className="text-xs font-medium text-gray-500">This Month</div>
                <div className="text-base font-bold text-gray-900">
                  {metrics.tripsThisMonth} trips
                </div>
                <div className="text-xs text-gray-600">
                  Rs {metrics.earningsThisMonth.toLocaleString()} earned
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Last 30 Days</div>
                <div className="text-base font-bold text-gray-900">
                  {metrics.cancellationsLast30d} cancellations
                </div>
                <div className="text-xs text-gray-600">{metrics.noShowsLast30d} no-shows</div>
              </div>
            </div>
          )}

        {!selectedSchedule ? (
          <>
            {schedules.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                <Bus className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="font-medium text-gray-500">No schedules today</p>
                <p className="mt-1 text-sm text-gray-400">
                  You have no van routes assigned for today.
                </p>
              </div>
            ) : (
              schedules.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSchedule(s)}
                  className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {s.vanCode && (
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">
                          <Bus className="h-3.5 w-3.5" />
                          {s.vanCode}
                        </div>
                      )}
                      <div className="font-semibold text-gray-900">{s.routeName || s.routeId}</div>
                      <div className="mt-0.5 text-sm text-gray-500">
                        {s.routeFrom} → {s.routeTo}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="flex items-center gap-1 text-sm font-medium text-indigo-600">
                          <Clock className="h-4 w-4" />
                          {s.departureTime}
                        </span>
                        <span className="flex items-center gap-1 text-sm text-gray-500">
                          <Users className="h-4 w-4" />
                          {s.bookedCount}/{s.totalSeats ?? "?"} booked
                        </span>
                      </div>
                      {s.tripStatus === "in_progress" && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          <Navigation className="h-3 w-3" />
                          In Progress
                        </span>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 text-gray-400" />
                  </div>
                </button>
              ))
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedSchedule(null);
                  stopGpsBroadcast();
                }}
                className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
              >
                ← Back
              </button>
              <span className="text-gray-400">|</span>
              <span className="font-semibold text-gray-800">{selectedSchedule.routeName}</span>
              {selectedSchedule.vanCode && (
                <span className="ml-auto rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                  {selectedSchedule.vanCode}
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Boarded", value: boardedCount, color: "text-green-600 bg-green-50" },
                { label: "Pending", value: confirmedCount, color: "text-blue-600 bg-blue-50" },
                { label: "Total", value: passengers.length, color: "text-gray-700 bg-gray-50" },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="mt-0.5 text-xs font-medium">{s.label}</div>
                </div>
              ))}
            </div>

            {/* GPS broadcasting indicator */}
            {broadcasting && (
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-700">
                  Broadcasting GPS to passengers
                </span>
              </div>
            )}

            {/* Live location map — shows rider's position while broadcasting */}
            {isTripInProgress &&
              riderPos &&
              (() => {
                const hasRouteCoords =
                  selectedSchedule.fromLat != null &&
                  selectedSchedule.fromLng != null &&
                  selectedSchedule.toLat != null &&
                  selectedSchedule.toLng != null;
                const routePolyline: [number, number][] = hasRouteCoords
                  ? [
                      [selectedSchedule.fromLat as number, selectedSchedule.fromLng as number],
                      riderPos,
                      [selectedSchedule.toLat as number, selectedSchedule.toLng as number],
                    ]
                  : [];
                return (
                  <div
                    className="relative overflow-hidden rounded-2xl border border-indigo-100 shadow-sm"
                    style={{ height: 180 }}
                  >
                    <MapContainer
                      center={riderPos}
                      zoom={14}
                      style={{ width: "100%", height: "100%" }}
                      zoomControl={false}
                      dragging={false}
                      scrollWheelZoom={false}
                      doubleClickZoom={false}
                      keyboard={false}
                      attributionControl={false}
                    >
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      {routePolyline.length > 0 && (
                        <Polyline
                          positions={routePolyline}
                          pathOptions={{
                            color: "#4f46e5",
                            weight: 3,
                            opacity: 0.7,
                            dashArray: "6 4",
                          }}
                        />
                      )}
                      <Marker position={riderPos} icon={riderMarkerIcon} />
                      <AutoPanMap lat={riderPos[0]} lng={riderPos[1]} />
                    </MapContainer>
                    <div className="pointer-events-none absolute bottom-1 left-1 z-[1000] rounded-full bg-indigo-600/80 px-2 py-0.5 text-[9px] font-bold text-white">
                      Your Location
                    </div>
                    {hasRouteCoords && (
                      <div className="pointer-events-none absolute right-1 bottom-1 z-[1000] rounded-full bg-indigo-600/80 px-2 py-0.5 text-[9px] font-bold text-white">
                        {selectedSchedule.routeFrom?.split(",")[0]} →{" "}
                        {selectedSchedule.routeTo?.split(",")[0]}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Start Trip button */}
            {!isTripInProgress && passengers.length > 0 && (
              <button
                onClick={() => {
                  if (
                    confirm("Start the trip? This will begin GPS broadcasting to all passengers.")
                  ) {
                    startMut.mutate();
                  }
                }}
                disabled={startMut.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                <Play className="h-5 w-5" />
                {startMut.isPending ? "Starting…" : "Start Trip"}
              </button>
            )}

            {/* Seat Map */}
            {selectedSchedule.totalSeats && selectedSchedule.totalSeats > 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-bold tracking-wider text-gray-500 uppercase">
                  Seat Map
                </p>
                <div
                  className="grid gap-1.5"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(8, selectedSchedule.totalSeats)}, 1fr)`,
                  }}
                >
                  {Array.from({ length: selectedSchedule.totalSeats }, (_, i) => i + 1).map(
                    (seatNum) => {
                      const passenger = passengers.find((p) =>
                        (Array.isArray(p.seatNumbers) ? p.seatNumbers : []).includes(seatNum)
                      );
                      const status = passenger?.status;
                      const cls = !passenger
                        ? "bg-gray-100 text-gray-400"
                        : status === "boarded" || status === "completed"
                          ? "bg-green-500 text-white"
                          : status === "confirmed"
                            ? "bg-blue-500 text-white"
                            : "bg-red-100 text-red-500";
                      return (
                        <div
                          key={seatNum}
                          title={
                            passenger
                              ? `${passenger.passengerName || passenger.userName || "Passenger"} · ${status}`
                              : "Free"
                          }
                          className={`flex h-7 items-center justify-center rounded text-[10px] font-bold ${cls} cursor-default select-none`}
                        >
                          {seatNum}
                        </div>
                      );
                    }
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-3">
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded border border-gray-200 bg-gray-100" />
                    <span className="text-[10px] text-gray-500">Free</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-blue-500" />
                    <span className="text-[10px] text-gray-500">Confirmed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-green-500" />
                    <span className="text-[10px] text-gray-500">Boarded</span>
                  </div>
                </div>
              </div>
            )}

            {/* Passengers */}
            {loadingPassengers ? (
              <div className="py-8 text-center text-gray-400">Loading passengers…</div>
            ) : passengers.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center">
                <Users className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">No confirmed bookings for today yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {passengers.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">
                          {p.passengerName || p.userName || "Unknown"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {p.passengerPhone || p.userPhone || ""}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[p.status] || "bg-gray-100 text-gray-600"}`}
                          >
                            {p.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {p.paymentMethod} · Rs {parseFloat(p.fare).toFixed(0)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(Array.isArray(p.seatNumbers) ? (p.seatNumbers as number[]) : []).map(
                            (s) => {
                              const tier = (p.seatTiers?.[String(s)] || "aisle") as SeatTier;
                              const tb = TIER_BADGE[tier];
                              return (
                                <span
                                  key={s}
                                  className={`${tb.bg} ${tb.text} inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold`}
                                >
                                  Seat {s}
                                  <span className="text-[10px] font-medium opacity-75">
                                    {tb.label}
                                  </span>
                                </span>
                              );
                            }
                          )}
                        </div>
                      </div>
                      {p.status === "confirmed" && (
                        <button
                          onClick={() => boardMut.mutate(p.id)}
                          disabled={boardMut.isPending}
                          className="ml-3 flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Board
                        </button>
                      )}
                      {(p.status === "boarded" || p.status === "completed") && (
                        <div className="ml-3 flex items-center gap-1 text-xs font-semibold text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          Boarded
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* End Trip button */}
            {isTripInProgress &&
              passengers.some((p) => p.status === "confirmed" || p.status === "boarded") && (
                <>
                  {tripEndingOffline && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                      <span>No connection — will sync automatically when back online.</span>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (tripEndingOffline) return;
                      if (
                        confirm(
                          "End the trip? This will complete all boarded passengers and stop GPS broadcasting."
                        )
                      ) {
                        completeMut.mutate();
                      }
                    }}
                    disabled={completeMut.isPending || tripEndingOffline}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    <Square className="h-5 w-5" />
                    {completeMut.isPending || tripEndingOffline ? "Trip Ending…" : "End Trip"}
                  </button>
                </>
              )}
          </>
        )}
      </div>
    </div>
  );
}
