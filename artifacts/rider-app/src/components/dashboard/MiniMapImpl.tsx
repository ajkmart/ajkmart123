import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, Navigation, X } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { riderEnv } from "../../lib/envValidation";
import { patchLeafletDefaultIcon } from "../../lib/leafletIconFix";
import { buildMapsDeepLink } from "./helpers";

/* Patch Leaflet's default marker icon URLs once at lazy-load time so that any
   <Marker> without an explicit icon prop renders correctly in Vite builds. */
patchLeafletDefaultIcon();

const PICKUP_ICON_MINI = L.divIcon({
  html: `<div style="width:14px;height:14px;background:#22c55e;border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});
const DROP_ICON_MINI = L.divIcon({
  html: `<div style="width:14px;height:14px;background:#ef4444;border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});
const PICKUP_ICON_FULL = L.divIcon({
  html: `<div style="width:18px;height:18px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
const DROP_ICON_FULL = L.divIcon({
  html: `<div style="width:18px;height:18px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

interface AppOverride {
  provider: string;
  token: string;
}

interface MapsConfigPublic {
  provider: string;
  token: string;
  secondaryProvider?: string;
  secondaryToken?: string;
  appOverrides?: { rider?: AppOverride; [key: string]: AppOverride | undefined };
}

function MiniMapFitter({
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  hasPick,
  hasDrop,
}: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  hasPick: boolean;
  hasDrop: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (hasPick && hasDrop) {
      map.fitBounds(
        [
          [pickupLat, pickupLng],
          [dropLat, dropLng],
        ],
        { padding: [20, 20], maxZoom: 15 }
      );
    } else if (hasPick) {
      map.setView([pickupLat, pickupLng], 14);
    } else if (hasDrop) {
      map.setView([dropLat, dropLng], 14);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupLat, pickupLng, dropLat, dropLng, hasPick, hasDrop]);
  return null;
}

function useMiniMapTileConfig(): { tileUrl: string; attribution: string } {
  const { data } = useQuery<MapsConfigPublic>({
    queryKey: ["maps-config-public"],
    queryFn: async (): Promise<MapsConfigPublic> => {
      const res = await fetch(`${riderEnv.baseUrl}api/maps/config?app=rider`);
      const json = (await res.json()) as { data?: MapsConfigPublic } & MapsConfigPublic;
      return (json.data ?? json) as MapsConfigPublic;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const riderOverride = data?.appOverrides?.rider;
  const provider = riderOverride?.provider ?? data?.provider ?? "osm";
  const token = riderOverride?.token ?? data?.token ?? "";

  if (provider === "mapbox" && token)
    return {
      tileUrl: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`,
      attribution: "© Mapbox © OSM",
    };
  if (provider === "google" && token)
    return {
      tileUrl: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${token}`,
      attribution: "© Google Maps",
    };
  if (provider === "locationiq" && token)
    return {
      tileUrl: `https://{s}.locationiq.com/v3/street/r/{z}/{x}/{y}.png?key=${token}`,
      attribution: '© <a href="https://locationiq.com">LocationIQ</a> © OSM',
    };
  return {
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OSM",
  };
}

function FullscreenMap({
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  hasPick,
  hasDrop,
  tileUrl,
  attribution,
  onClose,
}: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  hasPick: boolean;
  hasDrop: boolean;
  tileUrl: string;
  attribution: string;
  onClose: () => void;
}) {
  const centerLat = hasPick && hasDrop ? (pickupLat + dropLat) / 2 : hasPick ? pickupLat : dropLat;
  const centerLng = hasPick && hasDrop ? (pickupLng + dropLng) / 2 : hasPick ? pickupLng : dropLng;

  const mapsHref = hasDrop
    ? buildMapsDeepLink(dropLat, dropLng)
    : buildMapsDeepLink(pickupLat, pickupLng);

  return (
    <div
      className="fixed inset-0 z-[2000] flex flex-col bg-black/80"
      role="dialog"
      aria-label="Route map fullscreen"
    >
      <div className="flex flex-shrink-0 items-center justify-between bg-gray-900 px-4 py-3 text-white">
        <p className="text-sm font-extrabold tracking-tight">Route Preview</p>
        <div className="flex items-center gap-2">
          {mapsHref !== "#" && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
            >
              <Navigation size={12} /> Open in Maps
            </a>
          )}
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 p-1.5"
            aria-label="Close fullscreen map"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="relative flex-1">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
          zoomControl={true}
          scrollWheelZoom={true}
          dragging={true}
        >
          <TileLayer url={tileUrl} attribution={attribution} maxZoom={19} />
          {hasPick && <Marker position={[pickupLat, pickupLng]} icon={PICKUP_ICON_FULL} />}
          {hasDrop && <Marker position={[dropLat, dropLng]} icon={DROP_ICON_FULL} />}
          <MiniMapFitter
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            hasPick={hasPick}
            hasDrop={hasDrop}
          />
        </MapContainer>
        <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] flex gap-1.5">
          {hasPick && (
            <span className="rounded-full bg-green-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
              PICKUP
            </span>
          )}
          {hasDrop && (
            <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
              DROP
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export const MiniMapImpl = memo(function MiniMapImpl({
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
}: {
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropLat?: number | null;
  dropLng?: number | null;
}) {
  const hasPick = pickupLat != null && pickupLng != null;
  const hasDrop = dropLat != null && dropLng != null;
  const { tileUrl, attribution } = useMiniMapTileConfig();
  const [fullscreen, setFullscreen] = useState(false);

  if (!hasPick && !hasDrop) return null;

  const centerLat =
    hasPick && hasDrop ? (pickupLat! + dropLat!) / 2 : hasPick ? pickupLat! : dropLat!;
  const centerLng =
    hasPick && hasDrop ? (pickupLng! + dropLng!) / 2 : hasPick ? pickupLng! : dropLng!;

  return (
    <>
      {fullscreen && (
        <FullscreenMap
          pickupLat={pickupLat ?? 0}
          pickupLng={pickupLng ?? 0}
          dropLat={dropLat ?? 0}
          dropLng={dropLng ?? 0}
          hasPick={hasPick}
          hasDrop={hasDrop}
          tileUrl={tileUrl}
          attribution={attribution}
          onClose={() => setFullscreen(false)}
        />
      )}
      <div className="relative mt-3 h-28 w-full overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 shadow-inner">
        <MapContainer
          center={[centerLat!, centerLng!]}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          keyboard={false}
          attributionControl={false}
        >
          <TileLayer url={tileUrl} />
          {hasPick && <Marker position={[pickupLat!, pickupLng!]} icon={PICKUP_ICON_MINI} />}
          {hasDrop && <Marker position={[dropLat!, dropLng!]} icon={DROP_ICON_MINI} />}
          <MiniMapFitter
            pickupLat={pickupLat ?? 0}
            pickupLng={pickupLng ?? 0}
            dropLat={dropLat ?? 0}
            dropLng={dropLng ?? 0}
            hasPick={hasPick}
            hasDrop={hasDrop}
          />
        </MapContainer>

        <div className="pointer-events-none absolute right-1.5 bottom-1.5 z-[1000] rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
          {attribution}
        </div>
        {hasPick && (
          <div className="pointer-events-none absolute top-1.5 left-1.5 z-[1000] rounded-full bg-green-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            PICKUP
          </div>
        )}
        {hasDrop && (
          <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1000] rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            DROP
          </div>
        )}

        <button
          onClick={() => setFullscreen(true)}
          className="absolute top-1.5 right-1.5 z-[1001] rounded-lg bg-white/80 p-1 text-gray-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
          aria-label="Expand map fullscreen"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </>
  );
});

export default MiniMapImpl;
