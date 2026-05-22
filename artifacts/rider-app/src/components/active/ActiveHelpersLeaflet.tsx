import { createLogger } from "@/lib/logger";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle, ChevronDown, ChevronUp, MapPin, Navigation } from "lucide-react";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { apiFetch } from "../../lib/api";
import { patchLeafletDefaultIcon } from "../../lib/leafletIconFix";
import { usePlatformConfig } from "../../lib/useConfig";
import { buildMapsDeepLink } from "./ActiveHelpers";

/* Patch Leaflet's default marker icon URLs once — this module is lazy-loaded,
   so the patch runs only when a map is actually rendered, keeping leaflet
   completely out of the main JS bundle. */
patchLeafletDefaultIcon();

const log = createLogger("[ActiveHelpers:Leaflet]");

const pickupIcon = L.divIcon({
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  html: `<div style="width:28px;height:28px;display:flex;align-items:flex-end;justify-content:center;">
    <div style="background:#16a34a;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:22px;height:22px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
  </div>`,
});

const dropIcon = L.divIcon({
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  html: `<div style="width:28px;height:28px;display:flex;align-items:flex-end;justify-content:center;">
    <div style="background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:22px;height:22px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
  </div>`,
});

const riderIcon = L.divIcon({
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
    <div style="background:#2563eb;border-radius:50%;width:20px;height:20px;border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,0.25);">
    </div>
  </div>`,
});

function useRiderTileConfig() {
  const [tile, setTile] = useState({
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    provider: "osm",
  });
  const [tileConfigError, setTileConfigError] = useState(false);
  useEffect(() => {
    const abortCtrl = new AbortController();
    apiFetch(`/maps/config?app=rider`, { signal: abortCtrl.signal })
      .then((d: unknown) => {
        if (abortCtrl.signal.aborted) return;
        const raw = d as {
          data?: { provider?: string; token?: string };
          provider?: string;
          token?: string;
        } | null;
        const cfg = raw?.data ?? raw;
        const prov = cfg?.provider ?? "osm";
        const tok = cfg?.token ?? "";
        if (prov === "mapbox" && tok) {
          setTile({
            url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${tok}`,
            attribution: '© <a href="https://www.mapbox.com/">Mapbox</a> © OpenStreetMap',
            provider: "mapbox",
          });
        } else if (prov === "google" && tok) {
          setTile({
            url: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${tok}`,
            attribution: "© Google Maps",
            provider: "google",
          });
        } else if (prov === "locationiq" && tok) {
          setTile({
            url: `https://{s}.locationiq.com/v3/street/r/{z}/{x}/{y}.png?key=${tok}`,
            attribution:
              '© <a href="https://locationiq.com">LocationIQ</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            provider: "locationiq",
          });
        }
      })
      .catch((e: unknown) => {
        if (abortCtrl.signal.aborted) return;
        log.error("Map config fetch failed — falling back to OSM:", e);
        setTileConfigError(true);
      });
    return () => {
      abortCtrl.abort();
    };
  }, []);
  return { ...tile, hasError: tileConfigError };
}

function AutoFitMap({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const validPositions = positions.filter((p) => p != null && p[0] != null && p[1] != null);
  useEffect(() => {
    if (!validPositions.length) return;
    if (validPositions.length === 1) {
      map.setView(validPositions[0]!, 15);
      return;
    }
    map.fitBounds(L.latLngBounds(validPositions), { padding: [30, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validPositions.map((p) => p.join(",")).join("|")]);
  return null;
}

export function RideRouteMap({
  pickupLat,
  pickupLng,
  pickupLabel,
  dropLat,
  dropLng,
  dropLabel,
  riderLat,
  riderLng,
  polyline,
}: {
  pickupLat: number;
  pickupLng: number;
  pickupLabel?: string;
  dropLat: number;
  dropLng: number;
  dropLabel?: string;
  riderLat?: number | null;
  riderLng?: number | null;
  polyline?: Array<{ lat: number; lng: number }>;
}) {
  const tile = useRiderTileConfig();
  const { config } = usePlatformConfig();
  const [open, setOpen] = useState(false);

  const fallbackCenter: [number, number] = [
    config.branding?.mapCenterLat ?? 34.37,
    config.branding?.mapCenterLng ?? 73.47,
  ];

  const isValidCoord = (lat: number, lng: number) =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001);

  const positions: [number, number][] = [
    [pickupLat, pickupLng],
    [dropLat, dropLng],
    ...(riderLat != null && riderLng != null ? [[riderLat, riderLng] as [number, number]] : []),
  ];

  const mapCenter: [number, number] = isValidCoord(pickupLat, pickupLng)
    ? [pickupLat, pickupLng]
    : fallbackCenter;

  const polyPositions: [number, number][] = polyline
    ? polyline.map((p) => [p.lat, p.lng])
    : [
        [pickupLat, pickupLng],
        [dropLat, dropLng],
      ];

  return (
    <div className="overflow-hidden rounded-2xl border border-blue-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 bg-gradient-to-r from-blue-50 to-sky-50 px-4 py-3 text-left"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 shadow-md shadow-blue-200">
          <MapPin size={14} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-black tracking-wide text-gray-900 uppercase">Route Map</p>
          <p className="text-[11px] text-blue-600">
            {open ? "Tap to collapse" : "Tap to view map"} · {tile.provider.toUpperCase()}
          </p>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-blue-500" />
        ) : (
          <ChevronDown size={16} className="text-blue-500" />
        )}
      </button>
      {tile.hasError && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2">
          <AlertTriangle size={13} className="flex-shrink-0 text-amber-500" />
          <p className="text-[11px] font-medium text-amber-700">
            Map config unavailable — using standard OpenStreetMap tiles.
          </p>
        </div>
      )}
      {open && (
        <div style={{ height: 240 }}>
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={false}
            zoomControl={true}
          >
            <TileLayer url={tile.url} attribution={tile.attribution} maxZoom={19} />
            <AutoFitMap positions={positions} />
            <Marker position={[pickupLat, pickupLng]} icon={pickupIcon}>
              <Popup>
                <span className="text-xs font-bold text-green-700">
                  📍 {pickupLabel ?? "Pickup"}
                </span>
              </Popup>
            </Marker>
            <Marker position={[dropLat, dropLng]} icon={dropIcon}>
              <Popup>
                <span className="text-xs font-bold text-red-700">🎯 {dropLabel ?? "Drop-off"}</span>
              </Popup>
            </Marker>
            {riderLat != null && riderLng != null && (
              <Marker position={[riderLat, riderLng]} icon={riderIcon}>
                <Popup>
                  <span className="text-xs font-bold text-blue-700">🏍️ You</span>
                </Popup>
              </Marker>
            )}
            {polyPositions.length >= 2 && (
              <Polyline positions={polyPositions} color="#3b82f6" weight={4} opacity={0.8} />
            )}
          </MapContainer>
        </div>
      )}
      {open && (
        <div className="flex items-center gap-3 border-t border-blue-100 bg-blue-50/50 px-4 py-2">
          <a
            href={buildMapsDeepLink(dropLat, dropLng)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            <Navigation size={11} /> Open in Maps
          </a>
        </div>
      )}
    </div>
  );
}
