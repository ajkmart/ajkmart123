import { createLogger } from "@/lib/logger";
import { formatCurrency as _sharedFc } from "@workspace/api-zod";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  Car,
  CheckCircle,
  Clock,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  RefreshCw,
  ShoppingCart,
  Zap,
} from "lucide-react";
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { apiFetch } from "../../lib/api";
import { useLanguage } from "../../lib/useLanguage";
const log = createLogger("[Active]");

/* Leaflet and react-leaflet are lazy-loaded — they must NOT appear at module
   scope here because Active.tsx is eagerly imported in App.tsx. Any static
   reference to leaflet/react-leaflet would pull the ~150 KB library into the
   initial JS bundle. */
const LazyRideRouteMap = lazy(() =>
  import("./ActiveHelpersLeaflet").then((m) => ({ default: m.RideRouteMap }))
);

export function RideRouteMap(props: ComponentProps<typeof LazyRideRouteMap>) {
  return (
    <Suspense
      fallback={
        <div className="flex h-12 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-400">
          Loading map…
        </div>
      }
    >
      <LazyRideRouteMap {...props} />
    </Suspense>
  );
}

export class MapErrorBoundary extends Component<
  { children: ReactNode; fallbackMsg?: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_: Error, info: ErrorInfo) {
    log.error("MapErrorBoundary caught:", _, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <AlertTriangle size={20} className="mx-auto mb-2 text-red-400" />
          <p className="text-sm font-semibold text-red-600">
            {this.props.fallbackMsg ?? "Map/route could not load"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 text-xs font-bold text-indigo-500 underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className || ""}`} />;
}

export function SkeletonActive() {
  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-green-500/[0.04]" />
        <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
        <div className="relative flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-7 w-40 !bg-white/10" />
            <SkeletonBlock className="h-4 w-56 !bg-white/10" />
          </div>
          <SkeletonBlock className="h-16 w-20 rounded-2xl !bg-white/[0.06]" />
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <SkeletonBlock className="h-16 !rounded-none" />
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between px-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <SkeletonBlock className="h-10 w-10 !rounded-full" />
                  <SkeletonBlock className="h-2 w-14" />
                </div>
              ))}
            </div>
            <SkeletonBlock className="mx-6 h-2" />
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <SkeletonBlock className="h-12 !rounded-none" />
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-20" />
            <SkeletonBlock className="h-16" />
            <div className="grid grid-cols-2 gap-2">
              <SkeletonBlock className="h-12" />
              <SkeletonBlock className="h-12" />
            </div>
            <SkeletonBlock className="h-14" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function useElapsedTimer(startIso?: string | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startIso) {
      setElapsed(0);
      return;
    }
    const base = new Date(startIso).getTime();
    if (isNaN(base)) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - base) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startIso]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  const urgent = elapsed > 1200;
  return { label, elapsed, urgent };
}

export function formatCurrency(n: string | number | null | undefined, currencySymbol = "Rs.") {
  return _sharedFc(n != null ? String(n) : (n as null | undefined), currencySymbol);
}

export function ElapsedBadge({ startIso }: { startIso?: string | null }) {
  const { label, urgent, elapsed } = useElapsedTimer(startIso);
  if (!startIso) return null;
  const progress = Math.min(elapsed / 3600, 1);
  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl border px-4 py-2.5 backdrop-blur-sm ${urgent ? "border-red-400/30 bg-red-500/90 shadow-lg shadow-red-500/20" : "border-white/[0.06] bg-white/[0.06]"}`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Clock size={10} className={urgent ? "text-red-200" : "text-white/40"} />
        <span
          className={`text-[9px] font-bold tracking-widest uppercase ${urgent ? "text-red-200" : "text-white/40"}`}
        >
          Elapsed
        </span>
      </div>
      <span
        className={`text-lg leading-none font-black text-white tabular-nums ${urgent ? "animate-pulse" : ""}`}
      >
        {label}
      </span>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${urgent ? "bg-red-300" : "bg-green-400"}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

export function buildMapsDeepLink(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "#";
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS) {
    return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
  }
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) {
    return `geo:${lat},${lng}?q=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function NavButton({
  label,
  lat,
  lng,
  address,
  color = "blue",
}: {
  label: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  color?: "blue" | "green" | "orange";
}) {
  const validCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const href = validCoords
    ? buildMapsDeepLink(lat!, lng!)
    : address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;
  if (!href || href === "#") return null;
  const styles = {
    blue: "from-blue-500 to-indigo-600 shadow-blue-200",
    green: "from-green-500 to-emerald-600 shadow-green-200",
    orange: "from-orange-500 to-amber-600 shadow-amber-200",
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-2 bg-gradient-to-r ${styles[color]} rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.97]`}
    >
      <Navigation size={14} /> {label}
    </a>
  );
}

const SOS_RESET_MS = 5 * 60 * 1000;

export function SosButton({
  rideId,
  riderPos,
  T,
  showToast: _showToast,
}: {
  rideId?: string | null;
  riderPos?: { lat: number; lng: number } | null;
  T: (key: TranslationKey) => string;
  showToast: (msg: string, isError?: boolean) => void;
}) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [noLocWarning, setNoLocWarning] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sent) return;
    resetTimerRef.current = setTimeout(() => setSent(false), SOS_RESET_MS);
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [sent]);

  const fireSos = async (lat?: number, lng?: number) => {
    const hasCoords =
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001);
    await apiFetch("/riders/sos", {
      method: "POST",
      body: JSON.stringify({
        rideId: rideId ?? null,
        ...(hasCoords ? { latitude: lat, longitude: lng } : {}),
      }),
      headers: { "Content-Type": "application/json" },
    });
    setSent(true);
    setNoLocWarning(false);
  };

  return (
    <>
      {noLocWarning && (
        <div className="mb-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs font-medium text-yellow-800">
          <p className="mb-1 font-bold">Location unavailable</p>
          <p>
            Your GPS position could not be determined. SOS will be sent without location — admin
            will contact you by phone.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await fireSos();
                } catch (err) {
                  console.warn(
                    "[artifacts/rider-app/src/components/active/ActiveHelpers.tsx]",
                    err
                  );
                }
                setLoading(false);
              }} // eslint-disable-line no-console
              disabled={loading}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              Send SOS anyway
            </button>
            <button
              onClick={() => setNoLocWarning(false)}
              className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <button
        onClick={async () => {
          if (sent || loading) return;
          setLoading(true);
          try {
            let lat = riderPos?.lat;
            let lng = riderPos?.lng;
            if (!lat || !lng) {
              try {
                const pos = await new Promise<GeolocationPosition>((res, rej) => {
                  navigator.geolocation.getCurrentPosition(res, rej, {
                    timeout: 5000,
                    maximumAge: 10000,
                  });
                });
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
              } catch (err) {
                console.warn("[artifacts/rider-app/src/components/active/ActiveHelpers.tsx]", err);
              } // eslint-disable-line no-console
            }
            const hasCoords =
              lat != null &&
              lng != null &&
              Number.isFinite(lat) &&
              Number.isFinite(lng) &&
              !(Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001);
            if (!hasCoords) {
              setNoLocWarning(true);
              setLoading(false);
              return;
            }
            await fireSos(lat!, lng!);
          } catch (err) {
            console.warn("[artifacts/rider-app/src/components/active/ActiveHelpers.tsx]", err);
          } // eslint-disable-line no-console
          setLoading(false);
        }}
        disabled={sent || loading || noLocWarning}
        className={`flex items-center justify-center gap-2 self-end rounded-xl px-5 py-2.5 text-sm font-black shadow-lg transition-all ${sent ? "cursor-default bg-gray-200 text-gray-500 shadow-none" : "text-white shadow-red-400/40 active:scale-[0.96]"}`}
        style={
          sent
            ? undefined
            : { backgroundColor: "#FF2D2D", boxShadow: "0 4px 14px rgba(255,45,45,0.45)" }
        }
      >
        <AlertTriangle size={15} />
        {loading ? T("sending") : sent ? T("sosSent") : T("sosEmergency")}
      </button>
    </>
  );
}

type OsrmStep = {
  instruction: string;
  streetName: string;
  distanceM: number;
  durationSec: number;
  maneuverLat: number | null;
  maneuverLng: number | null;
};
type OsrmRoute = {
  distanceM: number;
  durationSec: number;
  steps: OsrmStep[];
  geometry?: Array<{ lat: number; lng: number }>;
};

const REROUTE_THRESHOLD_M = 150;
const STEP_ADVANCE_M = 30;

export function TurnByTurnPanel({
  fromLat,
  fromLng,
  toLat,
  toLng,
  label,
  riderLat,
  riderLng,
}: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  label: string;
  riderLat?: number | null;
  riderLng?: number | null;
}) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState<OsrmRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const stepListRef = useRef<HTMLDivElement | null>(null);
  const rerouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRerouteTimeRef = useRef<number>(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const REROUTE_COOLDOWN_MS = 30_000;

  const fetchRoute = async (lat?: number, lng?: number) => {
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    fetchAbortRef.current = abortController;

    setLoading(true);
    setError(null);
    const startLat = lat ?? fromLat;
    const startLng = lng ?? fromLng;
    try {
      const data = (await apiFetch(
        `/riders/osrm-route?fromLat=${startLat}&fromLng=${startLng}&toLat=${toLat}&toLng=${toLng}`,
        { signal: abortController.signal }
      )) as OsrmRoute & { error?: string };
      if (data.error) {
        setError(data.error);
        return;
      }
      setRoute(data);
      setCurrentStep(0);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        setError(e.message || "Could not fetch route");
      }
    } finally {
      if (!abortController.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (!route || riderLat == null || riderLng == null) return;

    const steps = route.steps;
    let newStep = currentStep;
    for (let i = currentStep; i < steps.length - 1; i++) {
      const step = steps[i + 1]!;
      if (step.maneuverLat != null && step.maneuverLng != null) {
        const distM =
          haversineDistance(riderLat, riderLng, step.maneuverLat, step.maneuverLng) * 1000;
        if (distM <= STEP_ADVANCE_M) {
          newStep = i + 1;
        }
      }
    }
    if (newStep !== currentStep) {
      setCurrentStep(newStep);
      const el = stepListRef.current?.querySelector(`[data-step="${newStep}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    if (route.geometry && route.geometry.length > 0) {
      let minDistM = Infinity;
      for (const pt of route.geometry) {
        const d = haversineDistance(riderLat, riderLng, pt.lat, pt.lng) * 1000;
        if (d < minDistM) minDistM = d;
      }
      if (minDistM > REROUTE_THRESHOLD_M) {
        if (!rerouteTimerRef.current) {
          rerouteTimerRef.current = setTimeout(() => {
            rerouteTimerRef.current = null;
            const now = Date.now();
            if (now - lastRerouteTimeRef.current >= REROUTE_COOLDOWN_MS) {
              lastRerouteTimeRef.current = now;
              void fetchRoute(riderLat, riderLng);
            }
          }, 5000);
        }
      } else {
        if (rerouteTimerRef.current) {
          clearTimeout(rerouteTimerRef.current);
          rerouteTimerRef.current = null;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderLat, riderLng, route, currentStep]);

  useEffect(
    () => () => {
      if (rerouteTimerRef.current) clearTimeout(rerouteTimerRef.current);
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
    },
    []
  );

  const distKm = route
    ? route.distanceM < 1000
      ? `${route.distanceM}m`
      : `${(route.distanceM / 1000).toFixed(1)} km`
    : "";
  const etaMin = route ? Math.max(1, Math.round(route.durationSec / 60)) : 0;
  const currentInstruction = route?.steps[currentStep]?.instruction ?? null;

  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-200">
      <button
        onClick={() => {
          if (!open && !route) void fetchRoute();
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-3 bg-gradient-to-r from-indigo-50 to-blue-50 px-4 py-3 text-left"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-md shadow-indigo-200">
          <Navigation size={14} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-900">Turn-by-Turn to {label}</p>
          {route && currentInstruction && (
            <p className="truncate text-xs font-semibold text-indigo-600">{currentInstruction}</p>
          )}
          {route && !currentInstruction && (
            <p className="text-xs font-semibold text-indigo-500">
              {distKm} · ~{etaMin} min
            </p>
          )}
          {!route && <p className="text-xs text-gray-400">Tap for directions</p>}
        </div>
        <span className="text-xs font-bold text-indigo-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-3">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              {T("fetchingRoute")}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 py-3 text-sm text-red-500">
              <AlertTriangle size={13} /> {error}
              <button onClick={() => fetchRoute()} className="ml-1 text-indigo-500 underline">
                {T("retry")}
              </button>
            </div>
          )}
          {route && !loading && (
            <>
              <div className="flex items-center justify-between pt-2 pb-1">
                <span className="text-xs text-gray-400">
                  {distKm} · ~{etaMin} min · Step {currentStep + 1}/{route.steps.length}
                </span>
                <button
                  onClick={() => fetchRoute(riderLat ?? undefined, riderLng ?? undefined)}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:underline"
                >
                  <RefreshCw size={10} /> Reroute
                </button>
              </div>
              <div ref={stepListRef} className="max-h-56 space-y-1.5 overflow-y-auto">
                {route.steps.map((step, i) => {
                  const isActive = i === currentStep;
                  const isPast = i < currentStep;
                  return (
                    <div
                      key={i}
                      data-step={i}
                      className={`flex items-start gap-2 rounded-lg border-b border-gray-100 py-1.5 text-sm transition-colors last:border-0 ${isActive ? "-mx-2 bg-indigo-50 px-2" : ""} ${isPast ? "opacity-40" : ""}`}
                    >
                      <div
                        className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isActive ? "bg-indigo-500 text-white" : "bg-indigo-100 text-indigo-600"}`}
                      >
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`leading-tight font-semibold ${isActive ? "text-indigo-700" : "text-gray-800"}`}
                        >
                          {step.instruction}
                        </p>
                        {step.streetName && (
                          <p className="mt-0.5 text-xs text-gray-400">{step.streetName}</p>
                        )}
                      </div>
                      <span className="mt-0.5 flex-shrink-0 text-xs text-gray-400">
                        {step.distanceM < 1000
                          ? `${step.distanceM}m`
                          : `${(step.distanceM / 1000).toFixed(1)}km`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CallButton({
  name,
  phone,
  label,
}: {
  name?: string | null;
  phone?: string | null;
  label?: string;
}) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone}`}
      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-green-200 transition-all active:scale-[0.97]"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.36 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17z" />
      </svg>
      {label || `Call ${name || "Customer"}`}
    </a>
  );
}

export function ChatButton({ name }: { name?: string | null }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate("/chat")}
      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-200 transition-all active:scale-[0.97]"
    >
      <MessageSquare size={14} /> Chat {(name || "").split(" ")[0] || "Customer"}
    </button>
  );
}

export type OrderItem = { name: string; quantity: number; price: number };

export const ORDER_STEPS = ["store", "picked_up", "delivered"];
export const ORDER_STEP_ICONS = [
  <ShoppingCart key="store" size={16} />,
  <Package key="picked" size={16} />,
  <CheckCircle key="done" size={16} />,
];

export const RIDE_STEPS = ["accepted", "arrived", "in_transit", "completed"];
export const RIDE_STEP_ICONS = [
  <Zap key="accept" size={14} />,
  <MapPin key="arrive" size={14} />,
  <Car key="transit" size={14} />,
  <CheckCircle key="done" size={14} />,
];

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function EstimatedArrivalBadge({
  riderPos,
  pickupLat,
  pickupLng,
  vehicleType,
}: {
  riderPos: { lat: number; lng: number } | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  vehicleType?: string | null;
}) {
  if (!riderPos || pickupLat == null || pickupLng == null) return null;
  const distKm = haversineDistance(riderPos.lat, riderPos.lng, pickupLat, pickupLng);
  const speedKmh =
    vehicleType === "car"
      ? 30
      : vehicleType === "bike"
        ? 25
        : vehicleType === "rickshaw"
          ? 20
          : vehicleType === "daba"
            ? 20
            : 22;
  const etaMin = Math.max(1, Math.round((distKm / speedKmh) * 60));
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-200">
        <Navigation size={16} className="text-white" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-bold tracking-wider text-blue-500 uppercase">
          Est. Arrival to Pickup
        </p>
        <p className="text-base font-black text-gray-900">
          {etaMin} min{" "}
          <span className="text-xs font-semibold text-gray-400">
            ({distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)} km`})
          </span>
        </p>
        <p className="text-[10px] text-blue-400">Estimate only · {speedKmh} km/h avg</p>
      </div>
    </div>
  );
}

export async function compressImage(
  file: File,
  maxWidthPx = 1920,
  maxSizeBytes = 1.5 * 1024 * 1024
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Photo too large, please try again."));
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) {
        reject(new Error("Photo too large, please try again."));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("Photo too large, please try again."));
      img.onload = () => {
        const scale = Math.min(1, maxWidthPx / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Photo too large, please try again."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Photo too large, please try again."));
              return;
            }
            if (blob.size > maxSizeBytes) {
              reject(new Error("Photo too large, please try again."));
              return;
            }
            const baseName = (file.name || "proof").replace(/\.[^.]+$/, "");
            resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.85
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
