/**
 * UniversalMap — switches between Mapbox GL JS (react-map-gl) and
 * OpenStreetMap/Google (react-leaflet) based on the `provider` prop.
 *
 * The Mapbox implementation is lazily loaded so the mapbox-gl bundle
 */
import { createLogger } from "@/lib/logger";
const log = createLogger("[UniversalMap]");
/**
 * (~700 KB) is only fetched when the admin has actually configured a
 * Mapbox provider.  This keeps the initial page load fast for the
 * default OSM configuration.
 *
 * Map provider and API token are fetched from /api/maps/config (DB-managed)
 * so API keys never appear in the frontend build artifacts.
 */
import { escapeHtml } from "@/lib/escapeHtml";
import { sanitizeMarkerHtml } from "@/lib/sanitizeMarkerHtml";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";

/* ── Fix Leaflet's broken default icon paths in Vite (production-safe asset imports) ── */
import leafletIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import leafletIconUrl from "leaflet/dist/images/marker-icon.png";
import leafletShadowUrl from "leaflet/dist/images/marker-shadow.png";
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: leafletIconUrl,
  iconRetinaUrl: leafletIconRetinaUrl,
  shadowUrl: leafletShadowUrl,
});

export type MapProvider = "osm" | "mapbox" | "google";

/* ── Normalised data types shared by both providers ──────────────────────── */
export interface MapMarkerData {
  id: string;
  lat: number;
  lng: number;
  /** SVG/HTML icon body. Sanitized via `sanitizeMarkerHtml` before rendering. */
  iconHtml: string;
  /** Square pixel size of the icon container */
  iconSize: number;
  /**
   * Optional text label rendered above the marker (rider name / ID).
   * Treated as plain text — HTML special characters are escaped before
   * being injected into the marker DOM.
   */
  label?: string;
  /** Reduces opacity to 50 % — used for offline-but-recently-active riders */
  dimmed?: boolean;
  onClick?: () => void;
}

export interface MapPolylineData {
  id: string;
  positions: Array<[number, number]>;
  color?: string;
  weight?: number;
  opacity?: number;
  dashArray?: string;
}

interface UniversalMapProps {
  provider: MapProvider;
  /** Mapbox access token / Google Maps API key (fetched from backend) */
  token?: string;
  center: [number, number];
  zoom?: number;
  markers?: MapMarkerData[];
  polylines?: MapPolylineData[];
  style?: React.CSSProperties;
  className?: string;
  /** Extra children passed into the Leaflet MapContainer (e.g. existing overlays) */
  leafletChildren?: React.ReactNode;
}

/* ══════════════════════════════════════════════════════════════════════════
   LEAFLET IMPLEMENTATION
══════════════════════════════════════════════════════════════════════════ */

function makeDivIcon(m: MapMarkerData): L.DivIcon {
  const opacity = m.dimmed ? "0.5" : "1";
  // Labels may contain rider names / arbitrary text from the DB. Escape
  // before interpolating into the icon HTML to defeat XSS via labels.
  const labelHtml = m.label
    ? `<div style="position:absolute;top:${-(m.iconSize / 2 + 18)}px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(0,0,0,0.75);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;pointer-events:none">${escapeHtml(m.label)}</div>`
    : "";
  const safeIcon = sanitizeMarkerHtml(m.iconHtml);
  return L.divIcon({
    html: `<div style="position:relative;opacity:${opacity}">
      ${labelHtml}
      ${safeIcon}
    </div>`,
    className: "",
    iconSize: [m.iconSize, m.iconSize],
    iconAnchor: [m.iconSize / 2, m.iconSize / 2],
  });
}

/** Pans the Leaflet map when the center prop changes programmatically */
function LeafletCenterUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const prev = useRef<[number, number]>([0, 0]);
  useEffect(() => {
    const [lat, lng] = center;
    const [pLat, pLng] = prev.current;
    if (Math.abs(lat - pLat) > 0.0001 || Math.abs(lng - pLng) > 0.0001) {
      map.setView(center, zoom, { animate: true });
      prev.current = center;
    }
  }, [center, zoom, map]);
  return null;
}

function LeafletMap({
  provider,
  token,
  center,
  zoom = 12,
  markers = [],
  polylines = [],
  style,
  className,
  leafletChildren,
}: UniversalMapProps) {
  /* Tile layer URL based on provider */
  const tileUrl = useMemo(() => {
    if (provider === "mapbox" && token) {
      return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`;
    }
    if (provider === "google" && token) {
      return `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${token}`;
    }
    return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  }, [provider, token]);

  const tileAttrib = useMemo(() => {
    if (provider === "mapbox")
      return '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    if (provider === "google") return "© Google Maps";
    return '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  }, [provider]);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={style ?? { width: "100%", height: "100%" }}
      className={className}
      zoomControl={false}
    >
      <TileLayer url={tileUrl} attribution={tileAttrib} maxZoom={19} />
      <LeafletCenterUpdater center={center} zoom={zoom} />

      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={makeDivIcon(m)}
          eventHandlers={{ click: m.onClick ?? (() => {}) }}
        />
      ))}

      {polylines.map((p) => (
        <Polyline
          key={p.id}
          positions={p.positions}
          pathOptions={{
            color: p.color ?? "#6366f1",
            weight: p.weight ?? 2.5,
            opacity: p.opacity ?? 0.7,
            dashArray: p.dashArray ?? "6,4",
          }}
        />
      ))}

      {leafletChildren}
    </MapContainer>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAPBOX GL JS IMPLEMENTATION — lazily loaded (react-map-gl + mapbox-gl)
   Isolated in a separate module to avoid a static import that would fail
   in `tsc --noEmit` due to the pnpm virtual store symlink layout.
══════════════════════════════════════════════════════════════════════════ */

/* Dynamic import wrapper — only executed when Mapbox is active */
const MapboxMapLazy = lazy(() =>
  /* react-map-gl v8 uses subpath exports — import the mapbox entry directly */
  import("react-map-gl/mapbox").then((rgl) => {
    const { default: MapGL, Marker: MapboxMarker, Source, Layer, NavigationControl } = rgl;

    function MapboxMapImpl(props: UniversalMapProps) {
      const {
        token = "",
        center,
        zoom = 12,
        markers = [],
        polylines = [],
        style,
        className,
      } = props;
      const [viewState, setViewState] = useState({
        longitude: center[1],
        latitude: center[0],
        zoom,
      });

      useEffect(() => {
        setViewState((v) => ({ ...v, latitude: center[0], longitude: center[1] }));
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
      }, [center[0], center[1]]);

      const polylineGeoJSON = useMemo(
        () => ({
          type: "FeatureCollection" as const,
          features: polylines.map((p) => ({
            type: "Feature" as const,
            id: p.id,
            geometry: {
              type: "LineString" as const,
              coordinates: p.positions.map(([lat, lng]) => [lng, lat]),
            },
            properties: {
              color: p.color ?? "#6366f1",
              opacity: p.opacity ?? 0.7,
              weight: p.weight ?? 2.5,
            },
          })),
        }),
        [polylines]
      );

      return (
        <MapGL
          {...viewState}
          onMove={(e: { viewState: typeof viewState }) => setViewState(e.viewState)}
          mapboxAccessToken={token}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          style={style ?? { width: "100%", height: "100%" }}
          className={className}
        >
          <NavigationControl position="top-right" />

          {polylines.length > 0 && (
            <Source id="polylines" type="geojson" data={polylineGeoJSON}>
              <Layer
                id="polyline-layer"
                type="line"
                paint={{
                  "line-color": ["get", "color"],
                  "line-opacity": ["get", "opacity"],
                  "line-width": ["get", "weight"],
                }}
                layout={{ "line-join": "round", "line-cap": "round" }}
              />
            </Source>
          )}

          {markers.map((m) => (
            <MapboxMarker
              key={m.id}
              longitude={m.lng}
              latitude={m.lat}
              anchor="center"
              onClick={m.onClick}
            >
              <div
                style={{
                  opacity: m.dimmed ? 0.5 : 1,
                  position: "relative",
                  cursor: m.onClick ? "pointer" : "default",
                }}
              >
                {m.label && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: "50%",
                      transform: "translateX(-50%)",
                      marginBottom: 4,
                      whiteSpace: "nowrap",
                      background: "rgba(0,0,0,0.75)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 4,
                      pointerEvents: "none",
                    }}
                  >
                    {m.label}
                  </div>
                )}
                <div dangerouslySetInnerHTML={{ __html: sanitizeMarkerHtml(m.iconHtml) }} />
              </div>
            </MapboxMarker>
          ))}
        </MapGL>
      );
    }

    /* React.lazy requires a default export */
    return { default: MapboxMapImpl };
  })
);

/**
 * Sized Suspense fallback for the lazy Mapbox bundle. The fallback
 * inherits the `style` / `className` props passed to `<UniversalMap>`
 * so the skeleton occupies the same box the resolved map will occupy —
 * eliminating the layout shift between the placeholder and the
 * fully-hydrated map when the dynamic import resolves.
 */
function MapboxMap(props: UniversalMapProps) {
  const { style, className } = props;
  const fallbackStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f8f9fa",
    borderRadius: 8,
    ...style,
  };
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading map"
          data-testid="mapbox-skeleton"
          className={className}
          style={fallbackStyle}
        >
          <div style={{ textAlign: "center", color: "#6b7280", fontSize: 13 }}>
            <div
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                border: "4px solid #6366f1",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 8px",
              }}
            />
            Loading Mapbox…
          </div>
        </div>
      }
    >
      <MapboxMapLazy {...props} />
    </Suspense>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   GOOGLE MAPS JS IMPLEMENTATION — loads Maps JS API via dynamic script tag
   Uses @googlemaps/js-api-loader so the API script is fetched lazily only
   when Google is configured as primary provider.
══════════════════════════════════════════════════════════════════════════ */

/* Typed surfaces needed after the Google Maps JS API script loads.
   We use local interfaces instead of depending on @types/google.maps so
   the build doesn't require the types package at compile time. */
interface GmLatLng {
  lat: number;
  lng: number;
}
interface GmMapInstance {
  panTo(pos: GmLatLng): void;
  setZoom(z: number): void;
}
interface GmMarkerInstance {
  setMap(m: GmMapInstance | null): void;
  addListener(event: string, fn: () => void): void;
}
interface GmPolylineInstance {
  setMap(m: GmMapInstance | null): void;
}

/* Module-level singleton — Google Maps JS script must only be loaded once per page */
let gmLoaderPromise: Promise<void> | null = null;

type LoaderWithLoad = { load(): Promise<void> };

function ensureGoogleMapsLoaded(apiKey: string): Promise<void> {
  if (gmLoaderPromise) return gmLoaderPromise;
  gmLoaderPromise = import("@googlemaps/js-api-loader").then(({ Loader }) => {
    const loader: LoaderWithLoad = new Loader({
      apiKey,
      version: "weekly",
      libraries: ["maps", "marker"],
    }) as LoaderWithLoad;
    return loader.load();
  });
  return gmLoaderPromise;
}

/* Returns the global google.maps namespace (populated after loader.load() resolves) */
function getGmNS() {
  /* window.google is set by the Google Maps JS API script */
  return (
    window as unknown as {
      google?: {
        maps: {
          Map: new (el: HTMLElement, opts: object) => GmMapInstance;
          Marker: new (opts: object) => GmMarkerInstance;
          Polyline: new (opts: object) => GmPolylineInstance;
        };
      };
    }
  ).google?.maps;
}

function GoogleMap({
  token = "",
  center,
  zoom = 12,
  markers = [],
  polylines = [],
  style,
  className,
}: UniversalMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<GmMapInstance | null>(null);
  const gmMarkersRef = useRef<GmMarkerInstance[]>([]);
  const gmPolylinesRef = useRef<GmPolylineInstance[]>([]);
  const [gmReady, setGmReady] = useState(false);

  /* Load Google Maps JS API script and initialise map */
  useEffect(() => {
    if (!token || !mapRef.current) return;
    let cancelled = false;

    ensureGoogleMapsLoaded(token)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const gm = getGmNS();
        if (!gm) return;
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new gm.Map(mapRef.current, {
            center: { lat: center[0], lng: center[1] },
            zoom,
            mapTypeId: "roadmap",
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
          });
        }
        setGmReady(true);
      })
      .catch((err) => {
        // Loader failure (invalid API key, network error, billing disabled).
        // Logged so admins can diagnose why the Google map didn't render.
        log.error("Google Maps loader failed:", err);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* Update center when props change */
  useEffect(() => {
    mapInstanceRef.current?.panTo({ lat: center[0], lng: center[1] });
  }, [center]);

  /* Sync markers whenever gmReady or markers list changes */
  useEffect(() => {
    if (!gmReady) return;
    const gm = getGmNS();
    const map = mapInstanceRef.current;
    if (!gm || !map) return;
    gmMarkersRef.current.forEach((m) => m.setMap(null));
    gmMarkersRef.current = markers.map((m) => {
      const marker = new gm.Marker({
        position: { lat: m.lat, lng: m.lng },
        map,
        label: m.label
          ? { text: m.label.slice(0, 1), fontSize: "10px", fontWeight: "700", color: "#fff" }
          : undefined,
        title: m.label,
        opacity: m.dimmed ? 0.5 : 1,
      });
      if (m.onClick) marker.addListener("click", m.onClick);
      return marker;
    });
  }, [gmReady, markers]);

  /* Sync polylines */
  useEffect(() => {
    if (!gmReady) return;
    const gm = getGmNS();
    const map = mapInstanceRef.current;
    if (!gm || !map) return;
    gmPolylinesRef.current.forEach((p) => p.setMap(null));
    gmPolylinesRef.current = polylines.map(
      (p) =>
        new gm.Polyline({
          path: p.positions.map(([lat, lng]) => ({ lat, lng })),
          map,
          strokeColor: p.color ?? "#6366f1",
          strokeWeight: p.weight ?? 2.5,
          strokeOpacity: p.opacity ?? 0.7,
        })
    );
  }, [gmReady, polylines]);

  if (!token) {
    return (
      <div
        style={{
          ...style,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8f9fa",
          color: "#6b7280",
          fontSize: 13,
        }}
        className={className}
      >
        Google Maps API key not configured
      </div>
    );
  }

  return (
    <div ref={mapRef} style={style ?? { width: "100%", height: "100%" }} className={className} />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PUBLIC EXPORT — switches between implementations
══════════════════════════════════════════════════════════════════════════ */

export default function UniversalMap(props: UniversalMapProps) {
  if (props.provider === "mapbox" && props.token) {
    return <MapboxMap {...props} />;
  }
  if (props.provider === "google") {
    return <GoogleMap {...props} />;
  }
  /* OSM uses Leaflet */
  return <LeafletMap {...props} />;
}
