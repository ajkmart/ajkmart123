import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import UniversalMap, { type MapMarkerData, type MapPolylineData } from "@/components/UniversalMap";
import {
  useCustomerLocations,
  useFleetVendors,
  useLiveRiders,
  usePlatformSettings,
  useRiderRoute,
  useRiderTrailsBatch,
} from "@/hooks/use-admin";
import { adminAbsoluteFetch, adminFetch, getAdminAccessToken } from "@/lib/adminFetcher";
import { PLATFORM_DEFAULTS } from "@/lib/platformConfig";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  History,
  Layers,
  MapPin,
  MessageSquare,
  Navigation,
  RefreshCw,
  Route,
  Search,
  Store,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { io, type Socket } from "socket.io-client";

const DEFAULT_OFFLINE_AFTER_SEC = 5 * 60;

const fd = (isoStr: string) => {
  const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
};

function StatusDot({ status }: { status: "online" | "offline" | "busy" }) {
  if (status === "online")
    return <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />;
  if (status === "busy")
    return <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />;
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />;
}

type Rider = {
  userId: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
  vehicleType: string | null;
  city?: string | null;
  role?: string | null;
  lat: number;
  lng: number;
  updatedAt: string;
  ageSeconds: number;
  isFresh: boolean;
  action?: string | null;
  batteryLevel?: number | null;
  lastSeen?: string;
  lastActive?: string | null;
  offlineSince?: string | null;
  currentTripId?: string | null;
};

type CustomerLoc = {
  userId: string;
  name?: string;
  lat: number;
  lng: number;
  updatedAt: string;
};

type VendorLoc = {
  id: string;
  name: string;
  storeAddress: string | null;
  city: string | null;
  storeCategory: string | null;
  storeIsOpen: boolean;
  lat: number;
  lng: number;
  activeOrders: number;
};

type RoutePoint = {
  latitude: number;
  longitude: number;
  createdAt: string;
};

type SOSAlert = {
  userId: string;
  name: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  rideId?: string | null;
  sentAt: string;
};

type SelectedEntity =
  | { type: "rider"; id: string }
  | { type: "customer"; id: string }
  | { type: "vendor"; id: string }
  | null;

function getRiderStatus(rider: Rider): "online" | "offline" | "busy" {
  if (!rider.isOnline) return "offline";
  if (rider.action === "on_trip" || rider.action === "delivering") return "busy";
  return "online";
}

function isGpsStale(rider: Rider, offlineAfterSec: number): boolean {
  return rider.ageSeconds >= offlineAfterSec;
}

function getVehicleEmoji(vehicleType: string | null): string {
  const v = (vehicleType ?? "").toLowerCase();
  if (v.includes("bike") || v.includes("motorcycle") || v.includes("moto")) return "🏍️";
  if (v.includes("car") || v.includes("taxi")) return "🚗";
  if (v.includes("rickshaw")) return "🛺";
  if (v.includes("van") || v.includes("daba")) return "🚐";
  if (v.includes("truck") || v.includes("lori")) return "🚛";
  if (v.includes("service") || v.includes("tool") || v.includes("wrench")) return "🔧";
  return "🏍️";
}

const getVehicleIcon = getVehicleEmoji;

function getVehicleSvgPath(vehicleType: string | null): string {
  const v = (vehicleType ?? "").toLowerCase();
  if (v.includes("car") || v.includes("taxi")) {
    return `<path d="M6 11L7.5 6.5A1.5 1.5 0 0 1 9 5.5h6a1.5 1.5 0 0 1 1.5 1l1.5 4.5" stroke="white" stroke-width="1" fill="none"/><rect x="3" y="11" width="18" height="6" rx="1.5" fill="white" opacity="0.9"/><circle cx="7" cy="18" r="2" fill="white"/><circle cx="17" cy="18" r="2" fill="white"/>`;
  }
  if (v.includes("rickshaw")) {
    return `<path d="M5 14L7 8h8l3 6H5z" fill="white" opacity="0.9"/><circle cx="7" cy="17" r="2" fill="white"/><circle cx="17" cy="17" r="2" fill="white"/><circle cx="12" cy="17" r="1.5" fill="white"/>`;
  }
  if (v.includes("van") || v.includes("daba") || v.includes("bus")) {
    return `<rect x="3" y="8" width="18" height="9" rx="2" fill="white" opacity="0.9"/><rect x="4" y="9" width="7" height="4" rx="1" fill="rgba(0,0,0,0.3)"/><rect x="13" y="9" width="4" height="4" rx="1" fill="rgba(0,0,0,0.3)"/><circle cx="7" cy="18" r="2" fill="white"/><circle cx="17" cy="18" r="2" fill="white"/>`;
  }
  if (v.includes("truck") || v.includes("lori")) {
    return `<rect x="2" y="10" width="12" height="7" rx="1" fill="white" opacity="0.9"/><path d="M14 12l5 0v5h-5z" fill="white" opacity="0.8"/><circle cx="6" cy="18.5" r="2" fill="white"/><circle cx="16" cy="18.5" r="2" fill="white"/>`;
  }
  return `<ellipse cx="7" cy="17" rx="3" ry="3" stroke="white" stroke-width="1.5" fill="none"/><ellipse cx="17" cy="17" rx="3" ry="3" stroke="white" stroke-width="1.5" fill="none"/><path d="M7 17L10 10l4 0 2 4-3 3" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
}

function makeServiceProviderIcon(
  status: "online" | "offline" | "busy",
  isSelected: boolean,
  stale: boolean
) {
  const color = "#7c3aed";
  const size = isSelected ? 44 : 34;
  const innerSize = size - 8;
  const staleBorder =
    stale && status !== "offline"
      ? "3px solid #f59e0b"
      : `${isSelected ? "3px" : "2px"} solid white`;
  const svgPath = `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${staleBorder};border-radius:${isSelected ? "10px" : "8px"};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:pointer;will-change:transform;transition:background-color 0.3s,border-color 0.3s">
      <svg width="${innerSize}" height="${innerSize}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${svgPath}</svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function wasRecentlyActive(rider: Rider): boolean {
  return rider.ageSeconds < 24 * 60 * 60;
}

function makeRiderIcon(
  rider: Rider,
  status: "online" | "offline" | "busy",
  isSelected: boolean,
  stale: boolean,
  label?: string,
  dimmed?: boolean,
  hasActiveTrip?: boolean
) {
  const role = (rider.role ?? "rider").toLowerCase();
  if (role === "service_provider" || role === "provider") {
    return makeServiceProviderIcon(status, isSelected, stale);
  }
  const color = status === "online" ? "#22c55e" : status === "busy" ? "#ef4444" : "#9ca3af";
  const size = isSelected ? 44 : 34;
  const innerSize = size - 8;
  const staleBorder =
    stale && status !== "offline"
      ? "3px solid #f59e0b"
      : `${isSelected ? "3px" : "2px"} solid white`;
  const svgPath = getVehicleSvgPath(rider.vehicleType);
  const opacity = dimmed ? "0.5" : "1";
  const labelHtml = label
    ? `<div style="position:absolute;top:${-(size / 2 + 16)}px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(0,0,0,0.78);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;pointer-events:none;line-height:1.4">${label}</div>`
    : "";
  const ringSize = size + 14;
  const tripRingHtml = hasActiveTrip
    ? `<div style="position:absolute;top:50%;left:50%;width:${ringSize}px;height:${ringSize}px;transform:translate(-50%,-50%);border-radius:50%;border:2.5px solid #ef4444;opacity:0.75;animation:pulse 1.4s ease-in-out infinite;pointer-events:none;"></div>
       <div style="position:absolute;top:50%;left:50%;width:${ringSize + 10}px;height:${ringSize + 10}px;transform:translate(-50%,-50%);border-radius:50%;border:1.5px solid rgba(239,68,68,0.4);animation:pulse 1.4s ease-in-out 0.4s infinite;pointer-events:none;"></div>`
    : "";
  return L.divIcon({
    html: `<style>@keyframes pulse{0%,100%{opacity:0.75;transform:translate(-50%,-50%) scale(1)}50%{opacity:0.3;transform:translate(-50%,-50%) scale(1.15)}}</style>
    <div style="position:relative;opacity:${opacity}">
      ${labelHtml}
      ${tripRingHtml}
      <div style="width:${size}px;height:${size}px;background:${color};border:${staleBorder};border-radius:${isSelected ? "10px" : "50%"};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:pointer;will-change:transform;transition:background-color 0.3s,border-color 0.3s,opacity 0.3s">
        <svg width="${innerSize}" height="${innerSize}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${svgPath}</svg>
      </div>
    </div>`,
    className: "",
    iconSize: [size + (hasActiveTrip ? 24 : 0), size + (hasActiveTrip ? 24 : 0) + (label ? 20 : 0)],
    iconAnchor: [
      (size + (hasActiveTrip ? 24 : 0)) / 2,
      (size + (hasActiveTrip ? 24 : 0)) / 2 + (label ? 20 : 0),
    ],
  });
}

function makeCustomerIcon(isSelected: boolean) {
  const size = isSelected ? 32 : 24;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:#3b82f6;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:${isSelected ? "14px" : "11px"}">👤</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function makeVendorIcon(isSelected: boolean, isOpen: boolean) {
  const size = isSelected ? 40 : 32;
  const bg = isOpen ? "#f97316" : "#9ca3af";
  const border = isSelected ? "3px solid white" : "2px solid white";
  const svgPath = `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="white" stroke-width="1.5" fill="none"/><polyline points="9 22 9 12 15 12 15 22" stroke="white" stroke-width="1.5" fill="none"/>`;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${bg};border:${border};border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.3);cursor:pointer;">
      <svg width="${size - 10}" height="${size - 10}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${svgPath}</svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function makeSOSIcon() {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;background:#ef4444;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(239,68,68,0.7);font-size:18px;animation:pulse 1s infinite">🆘</div>`,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function makeLoginIcon() {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;background:#6366f1;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px">🏠</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

interface MapConfig {
  provider: string;
  token: string;
  secondaryProvider: string;
  secondaryToken: string;
  failoverEnabled?: boolean;
  searchProvider: string;
  searchToken: string;
  routingProvider: string;
  routingEngine?: string;
  enabled: boolean;
  defaultLat: number;
  defaultLng: number;
  appOverrides?: {
    admin?: { provider: string; token: string; override: string };
    customer?: { provider: string; token: string; override: string };
    rider?: { provider: string; token: string; override: string };
    vendor?: { provider: string; token: string; override: string };
  };
  providers?: {
    osm?: { enabled: boolean; role: string; lastTested: string | null; testStatus: string };
    mapbox?: { enabled: boolean; role: string; lastTested: string | null; testStatus: string };
    google?: { enabled: boolean; role: string; lastTested: string | null; testStatus: string };
  };
}

function resolveAdminProvider(config: MapConfig | undefined): { provider: string; token: string } {
  if (!config) return { provider: "osm", token: "" };
  const adminOverride = config.appOverrides?.admin;
  if (adminOverride && adminOverride.provider)
    return { provider: adminOverride.provider, token: adminOverride.token };
  return { provider: config.provider ?? "osm", token: config.token ?? "" };
}

function DynamicTileLayer({ config }: { config: MapConfig | undefined }) {
  const [useFallback, setUseFallback] = useState(false);
  const errorCount = useRef(0);
  const ERROR_THRESHOLD = 3;
  const adminProv = resolveAdminProvider(config);
  const provider = useFallback ? (config?.secondaryProvider ?? "osm") : adminProv.provider;
  const token = useFallback ? (config?.secondaryToken ?? "") : adminProv.token;

  useEffect(() => {
    setUseFallback(false);
    errorCount.current = 0;
  }, [config?.provider]);

  const tileUrl = useMemo(() => {
    if (provider === "mapbox" && token)
      return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`;
    if (provider === "google" && token)
      return `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${token}`;
    return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  }, [provider, token]);

  const attribution = useMemo(() => {
    if (provider === "mapbox")
      return '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    if (provider === "google") return "© Google Maps";
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  }, [provider]);

  const handleTileError = useCallback(() => {
    if (!config?.failoverEnabled) return;
    errorCount.current += 1;
    if (!useFallback && errorCount.current >= ERROR_THRESHOLD) {
      setUseFallback(true);
      errorCount.current = 0;
    }
  }, [useFallback, config?.failoverEnabled]);

  return (
    <TileLayer
      key={tileUrl}
      url={tileUrl}
      attribution={attribution}
      maxZoom={provider === "mapbox" ? 22 : provider === "google" ? 21 : 19}
      eventHandlers={{ tileerror: handleTileError }}
    />
  );
}

function FitBoundsOnLoad({
  riders,
  customers,
  vendors,
  defaultLat,
  defaultLng,
}: {
  riders: Array<{ lat: number; lng: number }>;
  customers: Array<{ lat: number; lng: number }>;
  vendors: Array<{ lat: number; lng: number }>;
  defaultLat: number;
  defaultLng: number;
}) {
  const map = useMap();
  const fittedRef = useRef(false);
  const prevHashRef = useRef("");

  const points = useMemo(
    () => [
      ...riders
        .filter((r) => r.lat !== 0 || r.lng !== 0)
        .map((r) => [r.lat, r.lng] as [number, number]),
      ...customers
        .filter((c) => c.lat !== 0 || c.lng !== 0)
        .map((c) => [c.lat, c.lng] as [number, number]),
      ...vendors
        .filter((v) => v.lat !== 0 || v.lng !== 0)
        .map((v) => [v.lat, v.lng] as [number, number]),
    ],
    [riders, customers, vendors]
  );

  const pointsHash = useMemo(() => {
    if (points.length === 0) return "";
    const minLat = Math.min(...points.map((p) => p[0]));
    const maxLat = Math.max(...points.map((p) => p[0]));
    const minLng = Math.min(...points.map((p) => p[1]));
    const maxLng = Math.max(...points.map((p) => p[1]));
    return `${points.length}:${minLat.toFixed(3)}:${maxLat.toFixed(3)}:${minLng.toFixed(3)}:${maxLng.toFixed(3)}`;
  }, [points]);

  useEffect(() => {
    if (points.length === 0) {
      if (!fittedRef.current) {
        map.setView([defaultLat, defaultLng], 12);
        fittedRef.current = true;
      }
      return;
    }
    if (fittedRef.current && pointsHash === prevHashRef.current) return;
    prevHashRef.current = pointsHash;
    fittedRef.current = true;
    if (points.length === 1) {
      map.setView(points[0]!, 14);
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }, [pointsHash, map, points, defaultLat, defaultLng]);

  return null;
}

function RiderTrailOverlay({ userId, date }: { userId: string; date?: string }) {
  const { data } = useRiderRoute(userId, date);
  const pts: Array<[number, number]> = (data?.route ?? []).map(
    (p: { latitude: number; longitude: number }) => [p.latitude, p.longitude]
  );
  if (pts.length < 2) return null;
  return (
    <Polyline
      positions={pts}
      pathOptions={{ color: "#6366f1", weight: 2.5, opacity: 0.7, dashArray: "6,4" }}
    />
  );
}

function AnimatedMarker({
  position,
  icon,
  children,
  onClick,
}: {
  position: [number, number];
  icon: L.Icon | L.DivIcon;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const animRef = useRef<number | null>(null);
  const prevPos = useRef<[number, number]>(position);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const [fromLat, fromLng] = prevPos.current;
    const [toLat, toLng] = position;
    if (fromLat === toLat && fromLng === toLng) return;
    const DURATION = 1200;
    const start = performance.now();
    if (animRef.current != null) cancelAnimationFrame(animRef.current);
    const step = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      marker.setLatLng([fromLat + (toLat - fromLat) * ease, fromLng + (toLng - fromLng) * ease]);
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        prevPos.current = position;
        animRef.current = null;
      }
    };
    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [position]);

  return (
    <Marker
      ref={(m) => {
        markerRef.current = m;
      }}
      position={position}
      icon={icon}
      eventHandlers={{ click: onClick ? () => onClick() : undefined }}
    >
      {children}
    </Marker>
  );
}

interface LiveMapRendererProps {
  mapConfig: MapConfig | undefined;
  adminProvider: string;
  adminToken: string;
  defaultLat: number;
  defaultLng: number;
  nativeMarkers?: MapMarkerData[];
  nativePolylines?: MapPolylineData[];
  leafletChildren: React.ReactNode;
  style?: React.CSSProperties;
}

function LiveMapRenderer({
  mapConfig,
  adminProvider,
  adminToken,
  defaultLat,
  defaultLng,
  nativeMarkers = [],
  nativePolylines = [],
  leafletChildren,
  style = { width: "100%", height: "100%" },
}: LiveMapRendererProps) {
  if (adminProvider === "mapbox" && adminToken) {
    return (
      <UniversalMap
        provider="mapbox"
        token={adminToken}
        center={[defaultLat, defaultLng]}
        zoom={12}
        markers={nativeMarkers}
        polylines={nativePolylines}
        style={style}
      />
    );
  }
  if (adminProvider === "google" && adminToken) {
    return (
      <UniversalMap
        provider="google"
        token={adminToken}
        center={[defaultLat, defaultLng]}
        zoom={12}
        markers={nativeMarkers}
        polylines={nativePolylines}
        style={style}
      />
    );
  }
  return (
    <MapContainer center={[defaultLat, defaultLng]} zoom={12} style={style}>
      <DynamicTileLayer config={mapConfig} />
      {leafletChildren}
    </MapContainer>
  );
}

function FleetAnalyticsTab({ mapConfig }: { mapConfig?: MapConfig }) {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-fleet-analytics", fromDate, toDate],
    queryFn: () => adminFetch(`/fleet-analytics?from=${fromDate}&to=${toDate}`),
    staleTime: 60_000,
  });

  const heatPoints: Array<{ lat: number; lng: number; weight: number }> = data?.heatmap ?? [];
  const riderDistances: Array<{ userId: string; name: string; distanceKm: number }> =
    data?.riderDistances ?? [];
  const peakZones: Array<{ lat: number; lng: number; pings: number }> = data?.peakZones ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground text-sm font-medium">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            max={toDate}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground text-sm font-medium">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            min={fromDate}
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="h-9 gap-2 rounded-xl"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/50 rounded-2xl p-4 shadow-sm">
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
            Total GPS Pings
          </p>
          <p className="text-foreground text-3xl font-black">
            {(data?.totalPings ?? 0).toLocaleString()}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Rider location updates</p>
        </Card>
        <Card className="border-border/50 rounded-2xl p-4 shadow-sm">
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
            Avg Response Time
          </p>
          <p className="text-foreground text-3xl font-black">
            {data?.avgResponseTimeMin != null ? `${data.avgResponseTimeMin}m` : "—"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Ride request to acceptance</p>
        </Card>
        <Card className="border-border/50 rounded-2xl p-4 shadow-sm">
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
            Active Riders
          </p>
          <p className="text-foreground text-3xl font-black">{riderDistances.length}</p>
          <p className="text-muted-foreground mt-1 text-xs">With tracked distance</p>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
          <div className="border-border/40 border-b p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-500" />
              <h3 className="text-sm font-bold">Activity Heatmap</h3>
              <span className="text-muted-foreground text-xs">
                ({heatPoints.length.toLocaleString()} points)
              </span>
            </div>
          </div>
          <div style={{ height: 350 }}>
            {heatPoints.length > 0 ? (
              <MapContainer
                center={heatPoints[0] ? [heatPoints[0].lat, heatPoints[0].lng] : [30.3753, 69.3451]}
                zoom={11}
                style={{ width: "100%", height: "100%" }}
              >
                <DynamicTileLayer config={mapConfig} />
                {heatPoints.slice(0, 2000).map((pt, i) => (
                  <Circle
                    key={i}
                    center={[pt.lat, pt.lng]}
                    radius={100}
                    pathOptions={{ color: "transparent", fillColor: "#f97316", fillOpacity: 0.15 }}
                  />
                ))}
              </MapContainer>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-50">
                <p className="text-muted-foreground text-sm">
                  {isLoading ? "Loading heatmap..." : "No location data for selected period"}
                </p>
              </div>
            )}
          </div>
        </Card>
        <Card className="border-border/50 rounded-2xl shadow-sm">
          <div className="border-border/40 border-b p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-bold">Distance Covered</h3>
              <span className="text-muted-foreground text-xs">(km, top riders)</span>
            </div>
          </div>
          {riderDistances.length > 0 ? (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={riderDistances.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 8, right: 20 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11 }} unit=" km" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={(v) => [`${v} km`, "Distance"]} />
                  <Bar dataKey="distanceKm" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-muted-foreground p-8 text-center text-sm">
              {isLoading ? "Loading..." : "No rider distance data"}
            </div>
          )}
        </Card>
      </div>
      {peakZones.length > 0 && (
        <Card className="border-border/50 rounded-2xl shadow-sm">
          <div className="border-border/40 border-b p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-bold">Peak Activity Zones</h3>
              <span className="text-muted-foreground text-xs">
                (top {peakZones.length} clusters)
              </span>
            </div>
          </div>
          <div className="divide-border/40 divide-y">
            {peakZones.map((zone, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-black text-orange-500">#{i + 1}</span>
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${zone.lat}&mlon=${zone.lng}&zoom=15`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        View on map
                      </a>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-foreground text-sm font-bold">{zone.pings.toLocaleString()}</p>
                  <p className="text-muted-foreground text-xs">pings</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function LiveRidersMap() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, dataUpdatedAt } = useLiveRiders();
  const { data: settingsData } = usePlatformSettings();
  const { data: vendorData } = useFleetVendors();

  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sliderVal, setSliderVal] = useState(100);
  const [wsConnected, setWsConnected] = useState(false);
  const [secAgo, setSecAgo] = useState(0);
  const [riderOverrides, setRiderOverrides] = useState<
    Record<string, { lat: number; lng: number; updatedAt: string; action?: string | null }>
  >({});
  const [customerOverrides, setCustomerOverrides] = useState<
    Record<string, { lat: number; lng: number; updatedAt: string }>
  >({});
  const [riderStatusOverrides, setRiderStatusOverrides] = useState<
    Record<string, { isOnline: boolean; updatedAt: string }>
  >({});
  const [riderHeartbeats, setRiderHeartbeats] = useState<
    Record<string, { batteryLevel?: number | null; lastSeen: string }>
  >({});
  const [spoofAlerts, setSpoofAlerts] = useState<
    Array<{ userId: string; reason: string; autoOffline: boolean; sentAt: string }>
  >([]);
  const [activeTab, setActiveTab] = useState<"map" | "analytics">("map");
  const [detailTab, setDetailTab] = useState<"info" | "trail" | "chat" | "actions">("info");
  const [vendorDetailTab, setVendorDetailTab] = useState<"info" | "orders">("info");
  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);
  const [selectedSOS, setSelectedSOS] = useState<SOSAlert | null>(null);
  const [chatMessages, setChatMessages] = useState<
    Record<string, Array<{ text: string; ts: string; from: "admin" | "rider" }>>
  >({});
  const [chatInput, setChatInput] = useState("");

  /* Sidebar state */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(sidebarSearch), 200);
    return () => clearTimeout(t);
  }, [sidebarSearch]);
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "busy">("all");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [activeRideFilter, setActiveRideFilter] = useState(false);

  /* Layer toggles */
  const [showRiders, setShowRiders] = useState(true);
  const [showCustomers, setShowCustomers] = useState(true);
  const [showVendors, setShowVendors] = useState(true);
  const [showSOS, setShowSOS] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  /* Per-rider trail toggle */
  const [trailSet, setTrailSet] = useState<Set<string>>(new Set());
  const toggleTrail = (uid: string) =>
    setTrailSet((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const [adminPos, setAdminPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    const wid = navigator.geolocation.watchPosition(
      (pos) => setAdminPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 }
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, []);

  const [vehicleTypeOverrides, setVehicleTypeOverrides] = useState<Record<string, string | null>>(
    {}
  );
  const [currentTripIdOverrides, setCurrentTripIdOverrides] = useState<
    Record<string, string | null>
  >({});
  const [riderOfflineAtOverrides, setRiderOfflineAtOverrides] = useState<Record<string, string>>(
    {}
  );

  /* Provider picker */
  const [quickProvider, setQuickProvider] = useState<string | null>(null);
  const [showProviderPicker, setShowProviderPicker] = useState(false);

  const { data: mapConfigData, error: _mapConfigError } = useQuery<MapConfig | undefined>({
    queryKey: ["map-config"],
    // Failures are surfaced via React Query's `error` channel and a console
    // log — previously a bare `catch {}` made every map-config failure
    // (auth, network, malformed JSON) invisible, leaving the live tracker
    // silently stuck on the OSM fallback.
    queryFn: async (): Promise<MapConfig | undefined> => {
      return adminAbsoluteFetch("/api/maps/config?app=admin") as Promise<MapConfig | undefined>;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const selectedId = selectedEntity?.type === "rider" ? selectedEntity.id : null;
  const { data: routeData } = useRiderRoute(selectedId, routeDate);
  const { data: customerData } = useCustomerLocations();

  const adminMapProv = useMemo(() => resolveAdminProvider(mapConfigData), [mapConfigData]);
  const effectiveProvider = quickProvider ?? adminMapProv.provider;
  const effectiveToken = quickProvider === "osm" ? "" : adminMapProv.token;

  const trailRiderIds = useMemo(() => Array.from(trailSet), [trailSet]);
  const riderTrails = useRiderTrailsBatch(
    effectiveProvider === "mapbox" || effectiveProvider === "google" ? trailRiderIds : []
  );

  const routePoints: RoutePoint[] = routeData?.route ?? [];
  const sliderMax = Math.max(0, routePoints.length - 1);
  const sliderIndex = sliderMax > 0 ? Math.round((sliderVal / 100) * sliderMax) : 0;
  const visibleRoute = routePoints.slice(0, sliderIndex + 1);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getAdminAccessToken() ?? "";
    const socketUrl = window.location.origin;
    const socket = io(socketUrl, {
      path: "/api/socket.io",
      query: { rooms: "admin-fleet" },
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setWsConnected(true);
      socket.emit("join", "admin-fleet");
    });
    socket.on("connect_error", () => setWsConnected(false));
    socket.on("disconnect", () => setWsConnected(false));

    socket.on(
      "rider:location",
      (payload: {
        userId: string;
        latitude: number;
        longitude: number;
        action?: string | null;
        updatedAt: string;
        vehicleType?: string | null;
        currentTripId?: string | null;
      }) => {
        if (
          typeof payload.userId !== "string" ||
          typeof payload.latitude !== "number" ||
          typeof payload.longitude !== "number"
        )
          return;
        if (payload.vehicleType !== undefined)
          setVehicleTypeOverrides((prev) => ({
            ...prev,
            [payload.userId]: payload.vehicleType ?? null,
          }));
        if (payload.currentTripId !== undefined)
          setCurrentTripIdOverrides((prev) => ({
            ...prev,
            [payload.userId]: payload.currentTripId ?? null,
          }));
        setRiderOverrides((prev) => {
          const next = {
            ...prev,
            [payload.userId]: {
              lat: payload.latitude,
              lng: payload.longitude,
              updatedAt: payload.updatedAt,
              action: payload.action,
            },
          };
          const keys = Object.keys(next);
          if (keys.length > 500) {
            const sorted = keys.sort(
              (a, b) =>
                new Date(prev[a]?.updatedAt ?? 0).getTime() -
                new Date(prev[b]?.updatedAt ?? 0).getTime()
            );
            for (const k of sorted.slice(0, keys.length - 500)) delete next[k];
          }
          return next;
        });
        setSecAgo(0);
      }
    );

    socket.on(
      "customer:location",
      (payload: { userId: string; latitude: number; longitude: number; updatedAt: string }) => {
        if (
          typeof payload.userId !== "string" ||
          typeof payload.latitude !== "number" ||
          typeof payload.longitude !== "number"
        )
          return;
        setCustomerOverrides((prev) => {
          const next = {
            ...prev,
            [payload.userId]: {
              lat: payload.latitude,
              lng: payload.longitude,
              updatedAt: payload.updatedAt,
            },
          };
          const keys = Object.keys(next);
          if (keys.length > 500) {
            const sorted = keys.sort(
              (a, b) =>
                new Date(prev[a]?.updatedAt ?? 0).getTime() -
                new Date(prev[b]?.updatedAt ?? 0).getTime()
            );
            for (const k of sorted.slice(0, keys.length - 500)) delete next[k];
          }
          return next;
        });
      }
    );

    socket.on("rider:sos", (payload: SOSAlert) => {
      if (typeof payload.userId !== "string") return;
      setSosAlerts((prev) => [payload, ...prev.filter((a) => a.userId !== payload.userId)]);
    });

    socket.on(
      "rider:chat",
      (payload: { userId: string; message: string; sentAt: string; from: "rider" }) => {
        if (typeof payload.userId !== "string" || typeof payload.message !== "string") return;
        setChatMessages((prev) => ({
          ...prev,
          [payload.userId]: [
            ...(prev[payload.userId] ?? []),
            { text: payload.message, ts: payload.sentAt, from: "rider" as const },
          ],
        }));
      }
    );

    socket.on(
      "rider:status",
      (payload: { userId: string; isOnline: boolean; updatedAt: string }) => {
        if (typeof payload.userId !== "string") return;
        setRiderStatusOverrides((prev) => ({
          ...prev,
          [payload.userId]: { isOnline: payload.isOnline, updatedAt: payload.updatedAt },
        }));
      }
    );

    socket.on(
      "rider:offline",
      (payload: { userId: string; isOnline: boolean; reason?: string; lastSeenAt: string }) => {
        if (typeof payload.userId !== "string") return;
        setRiderStatusOverrides((prev) => ({
          ...prev,
          [payload.userId]: { isOnline: false, updatedAt: payload.lastSeenAt },
        }));
        setRiderOfflineAtOverrides((prev) => ({
          ...prev,
          [payload.userId]: payload.lastSeenAt,
        }));
      }
    );

    socket.on(
      "rider:heartbeat",
      (payload: { userId: string; batteryLevel?: number | null; sentAt: string }) => {
        if (typeof payload.userId !== "string") return;
        setRiderHeartbeats((prev) => ({
          ...prev,
          [payload.userId]: { batteryLevel: payload.batteryLevel, lastSeen: payload.sentAt },
        }));
      }
    );

    socket.on(
      "rider:spoof-alert",
      (payload: { userId: string; reason: string; autoOffline: boolean; sentAt: string }) => {
        if (typeof payload.userId !== "string") return;
        setSpoofAlerts((prev) => [payload, ...prev].slice(0, 20));
        if (payload.autoOffline)
          setRiderStatusOverrides((prev) => ({
            ...prev,
            [payload.userId]: { isOnline: false, updatedAt: payload.sentAt },
          }));
      }
    );

    socket.on("order:new", () => {
      void qc.invalidateQueries({ queryKey: ["admin-orders"] });
      void qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] });
    });
    socket.on("order:update", () => {
      void qc.invalidateQueries({ queryKey: ["admin-orders"] });
      void qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [qc]);

  useEffect(() => {
    setSecAgo(0);
    const t = setInterval(() => setSecAgo((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [dataUpdatedAt]);

  const settings: Record<string, string> = {};
  if (settingsData?.settings) {
    for (const s of settingsData.settings) settings[s.key] = s.value;
  }
  const defaultLat = parseFloat(
    settings["map_default_lat"] ||
      settings["platform_default_lat"] ||
      String(PLATFORM_DEFAULTS.defaultLat)
  );
  const defaultLng = parseFloat(
    settings["map_default_lng"] ||
      settings["platform_default_lng"] ||
      String(PLATFORM_DEFAULTS.defaultLng)
  );

  const baseRiders: Rider[] = data?.riders || [];
  const offlineAfterSec: number = data?.staleTimeoutSec ?? DEFAULT_OFFLINE_AFTER_SEC;

  const mergedBaseRiders: Rider[] = baseRiders.map((r) => {
    const ov = riderOverrides[r.userId];
    const statusOv = riderStatusOverrides[r.userId];
    const hb = riderHeartbeats[r.userId];
    const base = ov
      ? { ...r, lat: ov.lat, lng: ov.lng, updatedAt: ov.updatedAt, action: ov.action ?? r.action }
      : r;
    const latestTs = ov ? ov.updatedAt : r.updatedAt;
    const ageSeconds = Math.floor((Date.now() - new Date(latestTs).getTime()) / 1000);
    return {
      ...base,
      ageSeconds,
      isFresh: ageSeconds < offlineAfterSec,
      isOnline: statusOv ? statusOv.isOnline : r.isOnline,
      batteryLevel: hb?.batteryLevel ?? null,
      lastSeen: hb?.lastSeen ?? r.updatedAt,
      lastActive: r.lastActive ?? null,
      offlineSince: riderOfflineAtOverrides[r.userId] ?? r.lastActive ?? null,
      vehicleType: (() => {
        const vtOv = vehicleTypeOverrides[r.userId];
        return vtOv !== undefined ? vtOv : r.vehicleType;
      })(),
      currentTripId:
        currentTripIdOverrides[r.userId] !== undefined
          ? currentTripIdOverrides[r.userId]
          : r.currentTripId,
    };
  });

  const mergedBaseRiderIds = new Set(mergedBaseRiders.map((r) => r.userId));
  const wsOnlyRiders: Rider[] = Object.entries(riderOverrides)
    .filter(([uid]) => !mergedBaseRiderIds.has(uid))
    .map(([uid, ov]) => {
      const statusOv = riderStatusOverrides[uid];
      const hb = riderHeartbeats[uid];
      const ageSeconds = Math.floor((Date.now() - new Date(ov.updatedAt).getTime()) / 1000);
      return {
        userId: uid,
        name: "Rider",
        phone: null,
        isOnline: statusOv ? statusOv.isOnline : ageSeconds < offlineAfterSec,
        vehicleType: vehicleTypeOverrides[uid] ?? null,
        currentTripId: currentTripIdOverrides[uid] ?? null,
        lat: ov.lat,
        lng: ov.lng,
        updatedAt: ov.updatedAt,
        ageSeconds,
        isFresh: ageSeconds < offlineAfterSec,
        action: ov.action ?? null,
        batteryLevel: hb?.batteryLevel ?? null,
        lastSeen: hb?.lastSeen ?? ov.updatedAt,
        offlineSince: riderOfflineAtOverrides[uid] ?? null,
      };
    });

  const riders: Rider[] = useMemo(
    () => [...mergedBaseRiders, ...wsOnlyRiders],
    [mergedBaseRiders, wsOnlyRiders]
  );

  const filteredRiders = riders.filter((rider) => {
    const status = getRiderStatus(rider);
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (vehicleFilter !== "all") {
      const vt = (rider.vehicleType ?? "").toLowerCase();
      const normalized = vt === "bike" || vt === "motorbike" || vt === "moto" ? "motorcycle" : vt;
      if (normalized !== vehicleFilter) return false;
    }
    if (activeRideFilter && status !== "busy") return false;
    if (zoneFilter !== "all" && (rider.city ?? null) !== zoneFilter) return false;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      if (!rider.name?.toLowerCase().includes(q) && !rider.phone?.includes(q)) return false;
    }
    return true;
  });

  type RawCustomer = {
    userId: string;
    name?: string;
    lat?: number;
    latitude?: number;
    lng?: number;
    longitude?: number;
    updatedAt: string;
  };
  const baseCustomers: CustomerLoc[] = ((customerData?.customers ?? []) as RawCustomer[]).map(
    (c) => ({
      userId: c.userId,
      name: c.name,
      lat: c.lat ?? c.latitude ?? 0,
      lng: c.lng ?? c.longitude ?? 0,
      updatedAt: c.updatedAt,
    })
  );

  const mergedCustomers: CustomerLoc[] = baseCustomers.map((c) => {
    const ov = customerOverrides[c.userId];
    if (!ov) return c;
    return { ...c, lat: ov.lat, lng: ov.lng, updatedAt: ov.updatedAt };
  });
  const customers: CustomerLoc[] = useMemo(() => {
    const mergedCustomerIds = new Set(mergedCustomers.map((c) => c.userId));
    return [
      ...mergedCustomers,
      ...Object.entries(customerOverrides)
        .filter(([uid]) => !mergedCustomerIds.has(uid))
        .map(([uid, ov]) => ({ userId: uid, lat: ov.lat, lng: ov.lng, updatedAt: ov.updatedAt })),
    ];
  }, [mergedCustomers, customerOverrides]);

  const vendors: VendorLoc[] = useMemo(() => vendorData?.vendors ?? [], [vendorData?.vendors]);

  const onlineCount = riders.filter((r) => getRiderStatus(r) === "online").length;
  const busyCount = riders.filter((r) => getRiderStatus(r) === "busy").length;

  const selectedRider =
    selectedEntity?.type === "rider"
      ? (riders.find((r) => r.userId === selectedEntity.id) ?? null)
      : null;
  const selectedCustomer =
    selectedEntity?.type === "customer"
      ? (customers.find((c) => c.userId === selectedEntity.id) ?? null)
      : null;
  const selectedVendor =
    selectedEntity?.type === "vendor"
      ? (vendors.find((v) => v.id === selectedEntity.id) ?? null)
      : null;

  const prevEntityIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = selectedEntity ? `${selectedEntity.type}:${selectedEntity.id}` : null;
    if (id !== prevEntityIdRef.current) {
      prevEntityIdRef.current = id;
      setDetailTab("info");
      setVendorDetailTab("info");
    }
  }, [selectedEntity]);

  const riderIconCacheRef = useRef<Map<string, ReturnType<typeof makeRiderIcon>>>(new Map());
  const customerIconCacheRef = useRef<Map<string, ReturnType<typeof makeCustomerIcon>>>(new Map());
  const vendorIconCacheRef = useRef<Map<string, ReturnType<typeof makeVendorIcon>>>(new Map());

  const riderNumberMap = useMemo(() => {
    const m = new Map<string, number>();
    let n = 1;
    for (const r of riders) {
      if (!r.name && r.isOnline) m.set(r.userId, n++);
    }
    return m;
  }, [riders]);

  const riderDisplayName = useCallback(
    (rider: Rider): string => {
      if (rider.name) return rider.name;
      const n = riderNumberMap.get(rider.userId);
      return n != null ? `Rider #${n}` : `Rider #?`;
    },
    [riderNumberMap]
  );

  const riderIconMap = (() => {
    const result = new Map<string, ReturnType<typeof makeRiderIcon>>();
    for (const rider of riders) {
      const status = getRiderStatus(rider);
      const stale = isGpsStale(rider, offlineAfterSec);
      const isSelected = selectedEntity?.type === "rider" && selectedEntity.id === rider.userId;
      const dimmed = status === "offline" && wasRecentlyActive(rider);
      const labelText = showLabels
        ? rider.name
          ? rider.name.split(" ")[0]!.slice(0, 10)
          : riderNumberMap.get(rider.userId) != null
            ? `#${riderNumberMap.get(rider.userId)}`
            : undefined
        : undefined;
      const hasActiveTrip = !!rider.currentTripId;
      const cacheKey = `${rider.userId}:${status}:${isSelected ? "1" : "0"}:${stale ? "s" : "f"}:${dimmed ? "d" : "n"}:${labelText ?? ""}:${hasActiveTrip ? "t" : "f"}`;
      let icon = riderIconCacheRef.current.get(cacheKey);
      if (!icon) {
        icon = makeRiderIcon(rider, status, isSelected, stale, labelText, dimmed, hasActiveTrip);
        riderIconCacheRef.current.set(cacheKey, icon);
      }
      result.set(rider.userId, icon);
    }
    return result;
  })();

  const customerIconMap = (() => {
    const result = new Map<string, ReturnType<typeof makeCustomerIcon>>();
    for (const c of customers) {
      const isSelected = selectedEntity?.type === "customer" && selectedEntity.id === c.userId;
      const cacheKey = `customer:${isSelected}`;
      let icon = customerIconCacheRef.current.get(cacheKey);
      if (!icon) {
        icon = makeCustomerIcon(isSelected);
        customerIconCacheRef.current.set(cacheKey, icon);
      }
      result.set(c.userId, icon);
    }
    return result;
  })();

  const vendorIconMap = (() => {
    const result = new Map<string, ReturnType<typeof makeVendorIcon>>();
    for (const v of vendors) {
      const isSelected = selectedEntity?.type === "vendor" && selectedEntity.id === v.id;
      const cacheKey = `vendor:${isSelected}:${v.storeIsOpen}`;
      let icon = vendorIconCacheRef.current.get(cacheKey);
      if (!icon) {
        icon = makeVendorIcon(isSelected, v.storeIsOpen);
        vendorIconCacheRef.current.set(cacheKey, icon);
      }
      result.set(v.id, icon);
    }
    return result;
  })();

  const polylinePositions: [number, number][] = visibleRoute.map((p) => [p.latitude, p.longitude]);
  const loginPoint = routePoints[0] ?? null;
  const replayPoint = visibleRoute[visibleRoute.length - 1] ?? null;

  const nativeMarkers = useMemo<MapMarkerData[]>(() => {
    if (effectiveProvider !== "mapbox" && effectiveProvider !== "google") return [];
    const ms: MapMarkerData[] = [];
    if (showRiders) {
      for (const rider of filteredRiders) {
        const status = getRiderStatus(rider);
        const color = status === "busy" ? "#ef4444" : status === "online" ? "#22c55e" : "#9ca3af";
        const emoji = getVehicleEmoji(rider.vehicleType);
        ms.push({
          id: rider.userId,
          lat: rider.lat,
          lng: rider.lng,
          label: rider.name,
          dimmed: status === "offline",
          iconHtml: `<div style="width:28px;height:28px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:13px">${emoji}</div>`,
          iconSize: 28,
          onClick: () => setSelectedEntity({ type: "rider", id: rider.userId }),
        });
      }
    }
    if (showCustomers) {
      for (const c of customers) {
        ms.push({
          id: `cust-${c.userId}`,
          lat: c.lat,
          lng: c.lng,
          label: c.name ?? "Customer",
          iconHtml: `<div style="width:22px;height:22px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:11px">👤</div>`,
          iconSize: 22,
          onClick: () => setSelectedEntity({ type: "customer", id: c.userId }),
        });
      }
    }
    if (showVendors) {
      for (const v of vendors) {
        ms.push({
          id: `vnd-${v.id}`,
          lat: v.lat,
          lng: v.lng,
          label: v.name,
          iconHtml: `<div style="width:28px;height:28px;background:${v.storeIsOpen ? "#f97316" : "#9ca3af"};border:2px solid white;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:13px">🏪</div>`,
          iconSize: 28,
          onClick: () => setSelectedEntity({ type: "vendor", id: v.id }),
        });
      }
    }
    if (showSOS) {
      for (const sos of sosAlerts) {
        if (sos.latitude == null || sos.longitude == null) continue;
        ms.push({
          id: `sos-${sos.userId}`,
          lat: sos.latitude,
          lng: sos.longitude,
          label: `SOS: ${sos.name}`,
          iconHtml: `<div style="width:28px;height:28px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:13px">🆘</div>`,
          iconSize: 28,
        });
      }
    }
    if (selectedId && loginPoint) {
      ms.push({
        id: "login-pin",
        lat: loginPoint.latitude,
        lng: loginPoint.longitude,
        label: "Login",
        iconHtml: `<div style="width:22px;height:22px;background:#6366f1;border:2px solid white;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:11px">📍</div>`,
        iconSize: 22,
      });
    }
    if (selectedId && replayPoint && sliderVal < 100) {
      ms.push({
        id: "replay-pin",
        lat: replayPoint.latitude,
        lng: replayPoint.longitude,
        iconHtml: `<div style="width:18px;height:18px;background:#6366f1;border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
        iconSize: 18,
      });
    }
    return ms;
  }, [
    effectiveProvider,
    filteredRiders,
    customers,
    vendors,
    showRiders,
    showCustomers,
    showVendors,
    showSOS,
    sosAlerts,
    selectedId,
    loginPoint,
    replayPoint,
    sliderVal,
  ]);

  const nativePolylines = useMemo<MapPolylineData[]>(() => {
    if (effectiveProvider !== "mapbox" && effectiveProvider !== "google") return [];
    const pls: MapPolylineData[] = [];
    if (selectedId && polylinePositions.length > 1) {
      pls.push({
        id: "route",
        positions: polylinePositions,
        color: "#6366f1",
        weight: 3,
        opacity: 0.75,
      });
    }
    for (const trail of riderTrails) {
      pls.push({
        id: `trail-${trail.riderId}`,
        positions: trail.points,
        color: "#6366f1",
        weight: 2.5,
        opacity: 0.7,
        dashArray: "6,4",
      });
    }
    return pls;
  }, [effectiveProvider, selectedId, polylinePositions, riderTrails]);

  const sendChatMessage = (riderId: string) => {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit("admin:chat", { riderId, message: chatInput.trim() });
    setChatMessages((prev) => ({
      ...prev,
      [riderId]: [
        ...(prev[riderId] ?? []),
        { text: chatInput.trim(), ts: new Date().toISOString(), from: "admin" },
      ],
    }));
    setChatInput("");
  };

  const dismissSOS = (userId: string) => {
    setSosAlerts((prev) => prev.filter((a) => a.userId !== userId));
    if (selectedSOS?.userId === userId) setSelectedSOS(null);
  };

  const detailPanelOpen = selectedEntity != null;

  if (activeTab === "analytics") {
    return (
      <div className="space-y-5">
        <PageHeader
          icon={Navigation}
          title="Live Fleet Map"
          subtitle={`${riders.length} riders · ${vendors.length} vendors · ${onlineCount} online`}
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
          actions={
            <div className="border-border flex overflow-hidden rounded-xl border">
              <button
                onClick={() => setActiveTab("map")}
                className="text-muted-foreground flex items-center gap-1.5 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-gray-50"
              >
                <MapPin className="h-3.5 w-3.5" /> Map
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className="flex items-center gap-1.5 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                <BarChart2 className="h-3.5 w-3.5" /> Analytics
              </button>
            </div>
          }
        />
        <FleetAnalyticsTab mapConfig={mapConfigData} />
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Live Riders Map page crashed. Please reload.
        </div>
      }
    >
      <div className="flex flex-col" style={{ height: "calc(100vh - 80px)", minHeight: 600 }}>
        {/* GPS Spoof Alert Banner */}
        {spoofAlerts.length > 0 && (
          <div className="mb-2 flex flex-shrink-0 items-start gap-3 rounded-xl bg-orange-600 p-3 text-white shadow-lg">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">⚠ GPS Spoof Detected ({spoofAlerts.length})</p>
              <div className="mt-1.5 space-y-1">
                {spoofAlerts.slice(0, 3).map((alert, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl bg-orange-700/50 px-3 py-1.5 text-xs"
                  >
                    <span className="flex-1">
                      {alert.userId.slice(0, 8)}… — {alert.reason}
                    </span>
                    {alert.autoOffline && (
                      <span className="rounded bg-orange-800 px-1.5 py-0.5 text-[9px] font-bold">
                        AUTO-OFFLINE
                      </span>
                    )}
                    <button
                      onClick={() => setSpoofAlerts((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setSpoofAlerts([])}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* SOS Banner */}
        {sosAlerts.length > 0 && (
          <div className="mb-2 flex flex-shrink-0 animate-pulse items-start gap-3 rounded-xl bg-red-600 p-3 text-white shadow-lg">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                🆘 SOS Alert{sosAlerts.length > 1 ? `s (${sosAlerts.length})` : ""}
              </p>
              <div className="mt-1.5 space-y-1">
                {sosAlerts.map((sos) => (
                  <div
                    key={sos.userId}
                    className="flex items-center gap-2 rounded-xl bg-red-700/50 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">
                        {sos.name}
                        {sos.phone ? ` · ${sos.phone}` : ""}
                      </p>
                      <p className="text-xs text-red-200">{fd(sos.sentAt)}</p>
                    </div>
                    <button
                      onClick={() => setSelectedSOS(sos)}
                      className="flex items-center gap-1 rounded-lg bg-white px-3 py-1 text-xs font-bold text-red-600"
                    >
                      <MessageSquare className="h-3 w-3" /> Reply
                    </button>
                    <button
                      onClick={() => dismissSOS(sos.userId)}
                      className="rounded-lg bg-red-800/50 px-2 py-1 text-xs"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Page header */}
        <PageHeader
          icon={Navigation}
          title="Live Fleet Map"
          subtitle={`${riders.length} riders · ${vendors.length} vendors · ${onlineCount} online · ${busyCount} busy`}
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
          actions={
            <div className="flex items-center gap-2">
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span
                  className={`h-2 w-2 rounded-full ${wsConnected ? "animate-pulse bg-green-500" : "bg-amber-400"}`}
                />
                {wsConnected ? "Live" : `${secAgo}s ago`}
              </div>
              <div className="border-border flex overflow-hidden rounded-xl border">
                <button
                  onClick={() => setActiveTab("map")}
                  className="flex items-center gap-1.5 bg-green-600 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  <MapPin className="h-3.5 w-3.5" /> Map
                </button>
                <button
                  onClick={() => setActiveTab("analytics")}
                  className="text-muted-foreground flex items-center gap-1.5 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-gray-50"
                >
                  <BarChart2 className="h-3.5 w-3.5" /> Analytics
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-8 gap-1.5 rounded-xl"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Main 3-column layout: sidebar | map | detail panel */}
        <div className="border-border/50 flex min-h-0 flex-1 gap-0 overflow-hidden rounded-2xl border shadow-sm">
          {/* LEFT SIDEBAR */}
          <div
            className="border-border/50 flex flex-col border-r bg-white transition-all duration-300"
            style={{
              width: sidebarCollapsed ? 0 : 280,
              minWidth: sidebarCollapsed ? 0 : 280,
              overflow: "hidden",
            }}
          >
            {/* Sidebar header + stat cards */}
            <div className="border-border/40 flex-shrink-0 border-b px-3 pt-3 pb-2">
              {/* Stat cards row */}
              <div className="mb-2.5 grid grid-cols-2 gap-1.5">
                <div className="border-border/30 rounded-xl border bg-gray-50 p-2 text-center">
                  <p className="text-foreground text-base leading-none font-bold">
                    {riders.length}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[9px]">Tracked</p>
                </div>
                <div className="rounded-xl border border-green-100 bg-green-50 p-2 text-center">
                  <p className="text-base leading-none font-bold text-green-700">{onlineCount}</p>
                  <p className="mt-0.5 text-[9px] text-green-600">Online</p>
                </div>
                <div className="rounded-xl border border-red-100 bg-red-50 p-2 text-center">
                  <p className="text-base leading-none font-bold text-red-600">{busyCount}</p>
                  <p className="mt-0.5 text-[9px] text-red-500">Busy</p>
                </div>
                <div className="rounded-xl border border-orange-100 bg-orange-50 p-2 text-center">
                  <p className="text-base leading-none font-bold text-orange-600">
                    {vendors.length}
                  </p>
                  <p className="mt-0.5 text-[9px] text-orange-500">Vendors</p>
                </div>
              </div>
              <div className="relative mb-2">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                <input
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Search rider or phone..."
                  className="border-border/60 w-full rounded-lg border bg-white py-1.5 pr-3 pl-7 text-xs outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              {/* Status filter */}
              <div className="mb-1.5 flex flex-wrap gap-1">
                {(["all", "online", "busy", "offline"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                      statusFilter === f
                        ? f === "online"
                          ? "border-green-600 bg-green-600 text-white"
                          : f === "busy"
                            ? "border-red-600 bg-red-600 text-white"
                            : f === "offline"
                              ? "border-gray-500 bg-gray-500 text-white"
                              : "bg-foreground text-background border-foreground"
                        : "text-muted-foreground border-border/50 hover:bg-muted bg-transparent"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              {/* Vehicle filter */}
              <div className="mb-1.5 flex flex-wrap gap-1">
                {(["all", "motorcycle", "car", "rickshaw", "van"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVehicleFilter(v)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                      vehicleFilter === v
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "text-muted-foreground border-border/50 hover:bg-muted bg-transparent"
                    }`}
                  >
                    {v === "all" ? "All" : `${getVehicleIcon(v)}`}
                  </button>
                ))}
                <button
                  onClick={() => setActiveRideFilter((p) => !p)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${activeRideFilter ? "border-purple-600 bg-purple-600 text-white" : "text-muted-foreground border-border/50 hover:bg-muted bg-transparent"}`}
                >
                  🚗 Active
                </button>
              </div>
              {/* Zone filter */}
              {(() => {
                const cities = [
                  "all",
                  ...Array.from(
                    new Set(riders.map((r) => r.city).filter(Boolean) as string[])
                  ).sort(),
                ];
                if (cities.length <= 1) return null;
                return (
                  <div className="flex flex-wrap gap-1">
                    {cities.map((c) => (
                      <button
                        key={c}
                        onClick={() => setZoneFilter(c)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${zoneFilter === c ? "border-teal-600 bg-teal-600 text-white" : "text-muted-foreground border-border/50 hover:bg-muted bg-transparent"}`}
                      >
                        {c === "all" ? "All" : c}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Rider list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && riders.length === 0 ? (
                <div className="text-muted-foreground p-6 text-center text-sm">
                  Loading riders...
                </div>
              ) : riders.length === 0 ? (
                <div className="p-6 text-center">
                  <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-muted-foreground text-sm">No riders tracked</p>
                </div>
              ) : (
                <div className="divide-border/30 divide-y">
                  {filteredRiders
                    .slice()
                    .sort((a, b) => {
                      const sa = getRiderStatus(a),
                        sb = getRiderStatus(b);
                      if (sa !== sb) {
                        const order = { online: 0, busy: 1, offline: 2 };
                        return (order[sa] ?? 3) - (order[sb] ?? 3);
                      }
                      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                    })
                    .map((rider) => {
                      const status = getRiderStatus(rider);
                      const stale = isGpsStale(rider, offlineAfterSec);
                      const battPct =
                        rider.batteryLevel != null ? Math.round(rider.batteryLevel * 100) : null;
                      const battColor =
                        battPct != null
                          ? battPct > 50
                            ? "#22c55e"
                            : battPct > 20
                              ? "#f59e0b"
                              : "#ef4444"
                          : null;
                      const hasTrail = trailSet.has(rider.userId);
                      const isSelected =
                        selectedEntity?.type === "rider" && selectedEntity.id === rider.userId;
                      return (
                        <div
                          key={rider.userId}
                          role="button"
                          onClick={() =>
                            setSelectedEntity(
                              isSelected ? null : { type: "rider", id: rider.userId }
                            )
                          }
                          className={`hover:bg-muted/30 flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors ${isSelected ? "border-l-2 border-green-500 bg-green-50" : ""}`}
                        >
                          <StatusDot status={status} />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate text-xs font-semibold">
                              {riderDisplayName(rider)}
                            </p>
                            <p className="text-muted-foreground truncate text-[10px]">
                              {getVehicleIcon(rider.vehicleType)} {rider.phone || "—"}
                            </p>
                            <p className="text-muted-foreground text-[10px]">
                              {status === "offline" && rider.lastActive
                                ? `Last active: ${fd(rider.lastActive)}`
                                : `Seen: ${fd(rider.lastSeen ?? rider.updatedAt)}`}
                            </p>
                            {stale && status !== "offline" && (
                              <p className="text-[10px] text-amber-500">⚠ GPS stale</p>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTrail(rider.userId);
                              }}
                              className={`mt-0.5 flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold transition-colors ${hasTrail ? "border-indigo-600 bg-indigo-600 text-white" : "text-muted-foreground border-border/50 hover:bg-muted bg-transparent"}`}
                            >
                              <History className="h-2.5 w-2.5" />
                              {hasTrail ? "Trail On" : "Trail"}
                            </button>
                          </div>
                          <div className="flex-shrink-0 space-y-1">
                            <Badge
                              className={`text-[9px] font-bold ${status === "busy" ? "bg-red-100 text-red-700" : status === "online" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                            >
                              {status === "busy" ? "Busy" : status === "online" ? "Online" : "Off"}
                            </Badge>
                            {battPct != null && (
                              <div className="flex items-center gap-0.5">
                                <div className="h-1.5 w-8 overflow-hidden rounded-full bg-gray-200">
                                  <div
                                    style={{
                                      width: `${battPct}%`,
                                      background: battColor ?? "#22c55e",
                                    }}
                                    className="h-full rounded-full"
                                  />
                                </div>
                                <span
                                  className="text-[8px] font-bold"
                                  style={{ color: battColor ?? "#22c55e" }}
                                >
                                  {battPct}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {/* Vendor list section */}
                  {showVendors && vendors.length > 0 && (
                    <>
                      <div className="border-t border-b border-orange-100 bg-orange-50 px-3 py-1.5">
                        <p className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-orange-600 uppercase">
                          <Store className="h-3 w-3" /> Vendors ({vendors.length})
                        </p>
                      </div>
                      {vendors.map((v) => {
                        const isSelected =
                          selectedEntity?.type === "vendor" && selectedEntity.id === v.id;
                        return (
                          <div
                            key={v.id}
                            role="button"
                            onClick={() =>
                              setSelectedEntity(isSelected ? null : { type: "vendor", id: v.id })
                            }
                            className={`hover:bg-muted/30 flex w-full cursor-pointer items-center gap-2 px-3 py-2 transition-colors ${isSelected ? "border-l-2 border-orange-500 bg-orange-50" : ""}`}
                          >
                            <span className="text-base">🏪</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-foreground truncate text-xs font-semibold">
                                {v.name}
                              </p>
                              <p className="text-muted-foreground truncate text-[10px]">
                                {v.city ?? v.storeAddress ?? "—"}
                              </p>
                              {v.activeOrders > 0 && (
                                <p className="text-[10px] font-bold text-orange-600">
                                  {v.activeOrders} active orders
                                </p>
                              )}
                            </div>
                            <Badge
                              className={`text-[9px] font-bold ${v.storeIsOpen ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}
                            >
                              {v.storeIsOpen ? "Open" : "Closed"}
                            </Badge>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="border-border/50 z-10 flex w-5 flex-shrink-0 items-center justify-center border-r bg-white transition-colors hover:bg-gray-50"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="text-muted-foreground h-3 w-3" />
            ) : (
              <ChevronLeft className="text-muted-foreground h-3 w-3" />
            )}
          </button>

          {/* CENTER MAP */}
          <div className="relative min-w-0 flex-1">
            {/* Layer toggle bar — absolute overlay on map */}
            <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
              {/* Layer toggles */}
              <div className="border-border/40 flex flex-col gap-1 rounded-xl border bg-white/95 p-2 shadow-lg backdrop-blur-sm">
                <p className="text-muted-foreground mb-0.5 px-1 text-[9px] font-bold tracking-wider uppercase">
                  Layers
                </p>
                {[
                  {
                    key: "riders",
                    label: "Riders",
                    color: "bg-green-500",
                    icon: "🏍️",
                    state: showRiders,
                    set: setShowRiders,
                  },
                  {
                    key: "customers",
                    label: "Customers",
                    color: "bg-blue-500",
                    icon: "👤",
                    state: showCustomers,
                    set: setShowCustomers,
                  },
                  {
                    key: "vendors",
                    label: "Vendors",
                    color: "bg-orange-500",
                    icon: "🏪",
                    state: showVendors,
                    set: setShowVendors,
                  },
                  {
                    key: "sos",
                    label: "SOS",
                    color: "bg-red-500",
                    icon: "🆘",
                    state: showSOS,
                    set: setShowSOS,
                  },
                ].map((layer) => (
                  <button
                    key={layer.key}
                    onClick={() => layer.set((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${layer.state ? "text-foreground bg-gray-100" : "text-muted-foreground bg-transparent opacity-50"}`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${layer.state ? layer.color : "bg-gray-300"}`}
                    />
                    {layer.icon} {layer.label}
                  </button>
                ))}
                <div className="border-border/30 mt-0.5 border-t pt-1">
                  <button
                    onClick={() => setShowLabels((v) => !v)}
                    className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${showLabels ? "text-foreground bg-gray-100" : "text-muted-foreground opacity-50"}`}
                  >
                    {showLabels ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    Labels
                  </button>
                </div>
              </div>

              {/* Provider picker */}
              <div className="relative">
                <button
                  onClick={() => setShowProviderPicker((v) => !v)}
                  className="border-border/40 flex items-center gap-1.5 rounded-xl border bg-white/95 px-2.5 py-1.5 text-[11px] font-bold shadow-lg backdrop-blur-sm hover:bg-gray-50"
                >
                  <Layers className="h-3 w-3" />
                  {effectiveProvider.toUpperCase()}
                </button>
                {showProviderPicker && (
                  <div className="border-border/40 absolute top-full left-0 z-50 mt-1 min-w-40 overflow-hidden rounded-xl border bg-white shadow-lg">
                    {[
                      { value: "osm", label: "🗺 OpenStreetMap" },
                      { value: "mapbox", label: "🗺 Mapbox" },
                      { value: "google", label: "🌍 Google Maps" },
                    ].map((p) => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setQuickProvider(p.value === adminMapProv.provider ? null : p.value);
                          setShowProviderPicker(false);
                        }}
                        className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${effectiveProvider === p.value ? "bg-green-50 font-bold text-green-700" : "text-gray-700"}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Map */}
            {isLoading && riders.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center bg-gray-50">
                <div className="text-center">
                  <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
                  <p className="text-muted-foreground text-sm">Loading map...</p>
                </div>
              </div>
            ) : (
              <LiveMapRenderer
                mapConfig={mapConfigData}
                adminProvider={effectiveProvider}
                adminToken={effectiveToken}
                defaultLat={defaultLat}
                defaultLng={defaultLng}
                nativeMarkers={nativeMarkers}
                nativePolylines={nativePolylines}
                style={{ width: "100%", height: "100%" }}
                leafletChildren={
                  <>
                    <FitBoundsOnLoad
                      riders={riders}
                      customers={customers}
                      vendors={vendors}
                      defaultLat={defaultLat}
                      defaultLng={defaultLng}
                    />

                    {filteredRiders
                      .filter((r) => trailSet.has(r.userId))
                      .map((r) => (
                        <RiderTrailOverlay key={`trail-${r.userId}`} userId={r.userId} />
                      ))}

                    {showRiders &&
                      filteredRiders.map((rider) => {
                        const status = getRiderStatus(rider);
                        const _stale = isGpsStale(rider, offlineAfterSec);
                        return (
                          <AnimatedMarker
                            key={rider.userId}
                            position={[rider.lat, rider.lng]}
                            icon={riderIconMap.get(rider.userId)!}
                            onClick={() =>
                              setSelectedEntity((prev) =>
                                prev?.type === "rider" && prev.id === rider.userId
                                  ? null
                                  : { type: "rider", id: rider.userId }
                              )
                            }
                          >
                            <Popup maxWidth={200} autoPanPadding={[40, 40]}>
                              <div style={{ fontFamily: "sans-serif" }}>
                                <p style={{ fontWeight: 700, margin: "0 0 4px", fontSize: 13 }}>
                                  {riderDisplayName(rider)}
                                </p>
                                <span
                                  style={{
                                    display: "inline-block",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color:
                                      status === "online"
                                        ? "#22c55e"
                                        : status === "busy"
                                          ? "#ef4444"
                                          : "#9ca3af",
                                    background:
                                      status === "online"
                                        ? "#f0fdf4"
                                        : status === "busy"
                                          ? "#fef2f2"
                                          : "#f9fafb",
                                    border: `1px solid ${status === "online" ? "#bbf7d0" : status === "busy" ? "#fecaca" : "#e5e7eb"}`,
                                    borderRadius: 4,
                                    padding: "1px 6px",
                                  }}
                                >
                                  {status === "online"
                                    ? "Online"
                                    : status === "busy"
                                      ? "On Trip"
                                      : "Offline"}
                                </span>
                                <p
                                  style={{
                                    margin: "5px 0 0",
                                    fontSize: 11,
                                    color: status === "offline" ? "#ef4444" : "#6b7280",
                                  }}
                                >
                                  {status === "offline"
                                    ? `Last seen: ${fd(rider.offlineSince ?? rider.lastActive ?? rider.updatedAt)}`
                                    : `Seen: ${fd(rider.lastSeen ?? rider.updatedAt)}`}
                                </p>
                                {rider.phone && (
                                  <p style={{ margin: "3px 0 0", fontSize: 10, color: "#9ca3af" }}>
                                    {rider.phone}
                                  </p>
                                )}
                              </div>
                            </Popup>
                          </AnimatedMarker>
                        );
                      })}

                    {showCustomers &&
                      customers.map((c) => (
                        <Marker
                          key={c.userId}
                          position={[c.lat, c.lng]}
                          icon={customerIconMap.get(c.userId)!}
                          eventHandlers={{
                            click: () =>
                              setSelectedEntity((prev) =>
                                prev?.type === "customer" && prev.id === c.userId
                                  ? null
                                  : { type: "customer", id: c.userId }
                              ),
                          }}
                        >
                          <Popup maxWidth={140} autoPanPadding={[40, 40]}>
                            <div style={{ fontFamily: "sans-serif" }}>
                              <p style={{ fontWeight: 700, margin: "0 0 3px", fontSize: 13 }}>
                                {c.name || "Customer"}
                              </p>
                              <span
                                style={{
                                  display: "inline-block",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "#3b82f6",
                                  background: "#eff6ff",
                                  border: "1px solid #bfdbfe",
                                  borderRadius: 4,
                                  padding: "1px 6px",
                                }}
                              >
                                Active
                              </span>
                            </div>
                          </Popup>
                        </Marker>
                      ))}

                    {showVendors &&
                      vendors.map((v) => (
                        <Marker
                          key={v.id}
                          position={[v.lat, v.lng]}
                          icon={vendorIconMap.get(v.id)!}
                          eventHandlers={{
                            click: () =>
                              setSelectedEntity((prev) =>
                                prev?.type === "vendor" && prev.id === v.id
                                  ? null
                                  : { type: "vendor", id: v.id }
                              ),
                          }}
                        >
                          <Popup maxWidth={160} autoPanPadding={[40, 40]}>
                            <div style={{ fontFamily: "sans-serif" }}>
                              <p style={{ fontWeight: 700, margin: "0 0 3px", fontSize: 13 }}>
                                {v.name}
                              </p>
                              <span
                                style={{
                                  display: "inline-block",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: v.storeIsOpen ? "#f97316" : "#9ca3af",
                                  background: v.storeIsOpen ? "#fff7ed" : "#f9fafb",
                                  border: `1px solid ${v.storeIsOpen ? "#fed7aa" : "#e5e7eb"}`,
                                  borderRadius: 4,
                                  padding: "1px 6px",
                                }}
                              >
                                {v.storeIsOpen ? "Open" : "Closed"}
                              </span>
                            </div>
                          </Popup>
                        </Marker>
                      ))}

                    {adminPos && (
                      <Marker
                        position={[adminPos.lat, adminPos.lng]}
                        icon={L.divIcon({
                          className: "",
                          iconSize: [22, 22],
                          iconAnchor: [11, 11],
                          html: `<div style="width:22px;height:22px;position:relative"><div style="position:absolute;inset:0;background:rgba(59,130,246,0.25);border-radius:50%;animation:adminPulse 2s ease-out infinite"></div><div style="width:14px;height:14px;background:#3b82f6;border:3px solid white;border-radius:50%;position:absolute;top:4px;left:4px;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div></div><style>@keyframes adminPulse{0%{transform:scale(1);opacity:1}100%{transform:scale(2.5);opacity:0}}</style>`,
                        })}
                      >
                        <Popup maxWidth={140} autoPanPadding={[40, 40]}>
                          <div style={{ fontFamily: "sans-serif", textAlign: "center" }}>
                            <p style={{ fontWeight: 700, margin: 0, fontSize: 13 }}>
                              📍 You Are Here
                            </p>
                            <p style={{ fontSize: 11, color: "#3b82f6", margin: "2px 0 0" }}>
                              Admin location
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    )}

                    {showSOS &&
                      sosAlerts
                        .filter((sos) => sos.latitude != null && sos.longitude != null)
                        .map((sos) => (
                          <Marker
                            key={`sos-${sos.userId}`}
                            position={[sos.latitude!, sos.longitude!]}
                            icon={makeSOSIcon()}
                          >
                            <Popup maxWidth={200} autoPanPadding={[40, 40]}>
                              <div style={{ fontFamily: "sans-serif" }}>
                                <p style={{ fontWeight: 700, color: "#ef4444", margin: "0 0 4px" }}>
                                  🆘 SOS — {sos.name}
                                </p>
                                {sos.phone && (
                                  <p style={{ fontSize: 12, margin: 0 }}>{sos.phone}</p>
                                )}
                                <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0" }}>
                                  {fd(sos.sentAt)}
                                </p>
                              </div>
                            </Popup>
                          </Marker>
                        ))}

                    {selectedRider && polylinePositions.length > 1 && (
                      <Polyline
                        positions={polylinePositions}
                        color="#6366f1"
                        weight={3}
                        opacity={0.75}
                      />
                    )}

                    {selectedRider && loginPoint && (
                      <Marker
                        position={[loginPoint.latitude, loginPoint.longitude]}
                        icon={makeLoginIcon()}
                      >
                        <Popup autoPanPadding={[40, 40]}>
                          <div style={{ fontFamily: "sans-serif" }}>
                            <p style={{ fontWeight: 700, margin: "0 0 2px" }}>Login Location</p>
                            <p style={{ fontSize: 11, color: "#6366f1", margin: 0 }}>
                              {new Date(loginPoint.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    )}

                    {selectedRider && replayPoint && sliderVal < 100 && (
                      <Marker
                        position={[replayPoint.latitude, replayPoint.longitude]}
                        icon={L.divIcon({
                          html: `<div style="width:18px;height:18px;background:#6366f1;border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
                          className: "",
                          iconSize: [18, 18],
                          iconAnchor: [9, 9],
                        })}
                      >
                        <Popup autoPanPadding={[40, 40]}>
                          <p style={{ fontFamily: "sans-serif", fontSize: 11 }}>
                            {new Date(replayPoint.createdAt).toLocaleTimeString()}
                          </p>
                        </Popup>
                      </Marker>
                    )}
                  </>
                }
              />
            )}
          </div>

          {/* RIGHT DETAIL PANEL */}
          <div
            className="border-border/50 flex flex-col overflow-hidden border-l bg-white transition-all duration-300"
            style={{ width: detailPanelOpen ? 340 : 0, minWidth: detailPanelOpen ? 340 : 0 }}
          >
            {detailPanelOpen && (
              <>
                {/* Panel header */}
                <div className="border-border/40 flex flex-shrink-0 items-center justify-between border-b bg-gray-50/60 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {selectedRider && (
                      <span className="text-lg">{getVehicleEmoji(selectedRider.vehicleType)}</span>
                    )}
                    {selectedCustomer && <span className="text-lg">👤</span>}
                    {selectedVendor && <span className="text-lg">🏪</span>}
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-bold">
                        {selectedRider
                          ? riderDisplayName(selectedRider)
                          : selectedCustomer
                            ? (selectedCustomer.name ?? "Customer")
                            : (selectedVendor?.name ?? "Vendor")}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        {selectedRider
                          ? (selectedRider.vehicleType ?? "Rider")
                          : selectedCustomer
                            ? "Customer"
                            : (selectedVendor?.storeCategory ?? "Vendor")}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedEntity(null)}
                    className="text-muted-foreground hover:text-foreground flex-shrink-0 rounded-lg p-1 hover:bg-gray-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Panel body */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  {/* ── RIDER DETAIL ── */}
                  {selectedRider &&
                    (() => {
                      const status = getRiderStatus(selectedRider);
                      const stale = isGpsStale(selectedRider, offlineAfterSec);
                      const battPct =
                        selectedRider.batteryLevel != null
                          ? Math.round(selectedRider.batteryLevel * 100)
                          : null;
                      const battColor =
                        battPct != null
                          ? battPct > 50
                            ? "#22c55e"
                            : battPct > 20
                              ? "#f59e0b"
                              : "#ef4444"
                          : null;
                      const msgs = chatMessages[selectedRider.userId] ?? [];
                      return (
                        <div className="flex min-h-0 flex-1 flex-col">
                          {/* Status bar */}
                          <div className="border-border/30 flex flex-shrink-0 items-center gap-2 border-b px-4 pt-3 pb-2">
                            <StatusDot status={status} />
                            <span
                              className={`text-xs font-bold ${status === "online" ? "text-green-600" : status === "busy" ? "text-red-600" : "text-gray-500"}`}
                            >
                              {status === "online"
                                ? "Online / Available"
                                : status === "busy"
                                  ? "Busy / On Trip"
                                  : "Offline"}
                            </span>
                            {stale && status !== "offline" && (
                              <Badge className="bg-amber-100 text-[9px] text-amber-700">
                                Stale GPS
                              </Badge>
                            )}
                          </div>

                          {/* Tabs */}
                          <div className="border-border/30 flex flex-shrink-0 border-b bg-gray-50/60">
                            {(["info", "trail", "chat", "actions"] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => setDetailTab(t)}
                                className={`flex-1 border-b-2 py-2 text-[10px] font-bold tracking-wider uppercase transition-colors ${detailTab === t ? "border-foreground text-foreground bg-white" : "text-muted-foreground hover:text-foreground border-transparent"}`}
                              >
                                {t === "info"
                                  ? "Info"
                                  : t === "trail"
                                    ? "Trail"
                                    : t === "chat"
                                      ? `Chat${msgs.length > 0 ? ` (${msgs.length})` : ""}`
                                      : "Actions"}
                              </button>
                            ))}
                          </div>

                          {/* Tab content */}
                          <div className="flex-1 overflow-y-auto p-4">
                            {detailTab === "info" && (
                              <div className="space-y-2">
                                {selectedRider.phone && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Phone</span>
                                    <a
                                      href={`tel:${selectedRider.phone}`}
                                      className="font-semibold text-blue-600 hover:underline"
                                    >
                                      {selectedRider.phone}
                                    </a>
                                  </div>
                                )}
                                {selectedRider.vehicleType && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Vehicle</span>
                                    <span className="font-semibold">
                                      {getVehicleEmoji(selectedRider.vehicleType)}{" "}
                                      {selectedRider.vehicleType}
                                    </span>
                                  </div>
                                )}
                                {selectedRider.city && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">City</span>
                                    <span className="font-semibold">{selectedRider.city}</span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Last seen</span>
                                  <span className="font-semibold">
                                    {fd(selectedRider.lastSeen ?? selectedRider.updatedAt)}
                                  </span>
                                </div>
                                {selectedRider.currentTripId && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Trip ID</span>
                                    <span className="font-mono text-[10px] font-bold text-red-600">
                                      {selectedRider.currentTripId.slice(0, 14)}…
                                    </span>
                                  </div>
                                )}
                                {selectedRider.role && selectedRider.role !== "rider" && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Role</span>
                                    <span className="font-semibold text-purple-700 capitalize">
                                      {selectedRider.role.replace(/_/g, " ")}
                                    </span>
                                  </div>
                                )}
                                {battPct != null && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Battery</span>
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                                        <div
                                          style={{
                                            width: `${battPct}%`,
                                            background: battColor ?? "#22c55e",
                                          }}
                                          className="h-full rounded-full"
                                        />
                                      </div>
                                      <span
                                        className="font-bold"
                                        style={{ color: battColor ?? "#22c55e" }}
                                      >
                                        {battPct}%
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Coords</span>
                                  <span className="font-mono text-[10px]">
                                    {selectedRider.lat.toFixed(5)}, {selectedRider.lng.toFixed(5)}
                                  </span>
                                </div>
                              </div>
                            )}

                            {detailTab === "trail" && (
                              <div className="space-y-3">
                                <button
                                  onClick={() => toggleTrail(selectedRider.userId)}
                                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${trailSet.has(selectedRider.userId) ? "border-indigo-600 bg-indigo-600 text-white" : "text-foreground border-border bg-white hover:bg-gray-50"}`}
                                >
                                  <History className="h-3.5 w-3.5" />
                                  {trailSet.has(selectedRider.userId)
                                    ? "Hide GPS Trail"
                                    : "Show GPS Trail"}
                                </button>
                                <div className="flex items-center gap-2">
                                  <label className="text-muted-foreground text-[10px]">Date</label>
                                  <input
                                    type="date"
                                    value={routeDate}
                                    onChange={(e) => {
                                      setRouteDate(e.target.value);
                                      setSliderVal(100);
                                    }}
                                    className="flex-1 rounded-lg border px-2 py-1 text-xs"
                                    max={new Date().toISOString().slice(0, 10)}
                                  />
                                </div>
                                {routePoints.length > 1 ? (
                                  <div>
                                    <div className="text-muted-foreground mb-1.5 flex items-center justify-between text-[10px]">
                                      <span className="flex items-center gap-1">
                                        <Route className="h-3 w-3" /> {routePoints.length} pts
                                      </span>
                                      <span>
                                        {replayPoint
                                          ? new Date(replayPoint.createdAt).toLocaleTimeString()
                                          : "--"}
                                      </span>
                                    </div>
                                    <Slider
                                      value={[sliderVal]}
                                      onValueChange={([v]) => setSliderVal(v ?? 100)}
                                      min={0}
                                      max={100}
                                      step={1}
                                      className="w-full"
                                    />
                                    <p className="text-muted-foreground mt-1.5 text-center text-[10px]">
                                      Drag to replay route history
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground py-4 text-center text-xs">
                                    No route data for selected date
                                  </p>
                                )}
                              </div>
                            )}

                            {detailTab === "chat" && (
                              <div className="flex flex-col gap-2">
                                <div className="max-h-[220px] min-h-[80px] space-y-1.5 overflow-y-auto rounded-xl bg-gray-50 p-2">
                                  {msgs.length === 0 ? (
                                    <p className="py-4 text-center text-[10px] text-gray-400">
                                      No messages yet
                                    </p>
                                  ) : (
                                    msgs.map((m, i) => (
                                      <div
                                        key={i}
                                        className={`flex ${m.from === "admin" ? "justify-end" : "justify-start"}`}
                                      >
                                        <div
                                          className={`max-w-[80%] rounded-xl px-2.5 py-1.5 text-[11px] ${m.from === "admin" ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-800"}`}
                                        >
                                          {m.text}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) =>
                                      e.key === "Enter" && sendChatMessage(selectedRider.userId)
                                    }
                                    placeholder="Message rider..."
                                    className="flex-1 rounded-xl border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400"
                                  />
                                  <button
                                    onClick={() => sendChatMessage(selectedRider.userId)}
                                    className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}

                            {detailTab === "actions" && (
                              <div className="space-y-2">
                                <a
                                  href={`/admin/riders?id=${selectedRider.userId}`}
                                  className="text-foreground block w-full rounded-xl bg-gray-100 px-3 py-2.5 text-center text-xs font-bold transition-colors hover:bg-gray-200"
                                >
                                  View Rider Profile →
                                </a>
                                <button
                                  onClick={() => {
                                    setSelectedEntity(null);
                                  }}
                                  className="block w-full rounded-xl bg-red-50 px-3 py-2.5 text-center text-xs font-bold text-red-600 transition-colors hover:bg-red-100"
                                >
                                  Deselect Rider
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                  {/* ── CUSTOMER DETAIL ── */}
                  {selectedCustomer && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                        <span className="text-sm font-bold text-blue-600">Active Customer</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Last Update</span>
                          <span className="font-semibold">{fd(selectedCustomer.updatedAt)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Coords</span>
                          <span className="font-mono text-[10px]">
                            {selectedCustomer.lat.toFixed(5)}, {selectedCustomer.lng.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── VENDOR DETAIL ── */}
                  {selectedVendor && (
                    <div className="flex min-h-0 flex-1 flex-col">
                      {/* Status bar */}
                      <div className="border-border/30 flex flex-shrink-0 items-center gap-2 border-b px-4 pt-3 pb-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${selectedVendor.storeIsOpen ? "bg-orange-500" : "bg-gray-400"}`}
                        />
                        <span
                          className={`text-xs font-bold ${selectedVendor.storeIsOpen ? "text-orange-600" : "text-gray-500"}`}
                        >
                          {selectedVendor.storeIsOpen ? "Store Open" : "Store Closed"}
                        </span>
                        {selectedVendor.activeOrders > 0 && (
                          <Badge className="ml-auto bg-orange-100 text-[9px] text-orange-700">
                            {selectedVendor.activeOrders} active
                          </Badge>
                        )}
                      </div>

                      {/* Tabs */}
                      <div className="border-border/30 flex flex-shrink-0 border-b bg-gray-50/60">
                        {(["info", "orders"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setVendorDetailTab(t)}
                            className={`flex-1 border-b-2 py-2 text-[10px] font-bold tracking-wider uppercase transition-colors ${vendorDetailTab === t ? "border-foreground text-foreground bg-white" : "text-muted-foreground hover:text-foreground border-transparent"}`}
                          >
                            {t === "info"
                              ? "Info"
                              : `Orders${selectedVendor.activeOrders > 0 ? ` (${selectedVendor.activeOrders})` : ""}`}
                          </button>
                        ))}
                      </div>

                      {/* Tab content */}
                      <div className="flex-1 overflow-y-auto p-4">
                        {vendorDetailTab === "info" && (
                          <div className="space-y-2">
                            {selectedVendor.storeCategory && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Category</span>
                                <span className="font-semibold capitalize">
                                  {selectedVendor.storeCategory}
                                </span>
                              </div>
                            )}
                            {selectedVendor.city && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">City</span>
                                <span className="font-semibold">{selectedVendor.city}</span>
                              </div>
                            )}
                            {selectedVendor.storeAddress && (
                              <div className="flex flex-col gap-0.5 text-xs">
                                <span className="text-muted-foreground">Address</span>
                                <span className="font-semibold">{selectedVendor.storeAddress}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Coords</span>
                              <span className="font-mono text-[10px]">
                                {selectedVendor.lat.toFixed(5)}, {selectedVendor.lng.toFixed(5)}
                              </span>
                            </div>
                            <div className="pt-2">
                              <a
                                href={`/admin/vendors?id=${selectedVendor.id}`}
                                className="text-foreground block w-full rounded-xl bg-gray-100 px-3 py-2.5 text-center text-xs font-bold transition-colors hover:bg-gray-200"
                              >
                                View Vendor Profile →
                              </a>
                            </div>
                          </div>
                        )}

                        {vendorDetailTab === "orders" && (
                          <div className="space-y-2">
                            {selectedVendor.activeOrders > 0 ? (
                              <>
                                <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-center">
                                  <p className="text-2xl font-black text-orange-600">
                                    {selectedVendor.activeOrders}
                                  </p>
                                  <p className="text-xs text-orange-500">Active Orders</p>
                                  <p className="text-muted-foreground mt-1 text-[10px]">
                                    Pending / Preparing / Out for delivery
                                  </p>
                                </div>
                                <a
                                  href={`/admin/orders?vendorId=${selectedVendor.id}`}
                                  className="block w-full rounded-xl bg-orange-600 px-3 py-2.5 text-center text-xs font-bold text-white transition-colors hover:bg-orange-700"
                                >
                                  View All Orders →
                                </a>
                              </>
                            ) : (
                              <div className="py-8 text-center">
                                <p className="text-muted-foreground text-sm">No active orders</p>
                                <p className="text-muted-foreground mt-1 text-[10px]">
                                  Orders will appear here when placed
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* SOS Chat Modal */}
        {selectedSOS && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
            <div
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-2 font-bold text-red-600">
                    <AlertTriangle className="h-4 w-4" /> SOS — {selectedSOS.name}
                  </p>
                  {selectedSOS.phone && (
                    <p className="text-xs text-gray-500">{selectedSOS.phone}</p>
                  )}
                  <p className="text-xs text-gray-400">{fd(selectedSOS.sentAt)}</p>
                </div>
                <button
                  onClick={() => setSelectedSOS(null)}
                  className="text-gray-400 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mb-3 max-h-40 min-h-[80px] space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">
                {(chatMessages[selectedSOS.userId] ?? []).length === 0 ? (
                  <p className="py-4 text-center text-xs text-gray-400">No messages yet.</p>
                ) : (
                  (chatMessages[selectedSOS.userId] ?? []).map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.from === "admin" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs ${m.from === "admin" ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-800"}`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChatMessage(selectedSOS.userId)}
                  placeholder="Type a reply..."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={() => sendChatMessage(selectedSOS.userId)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
