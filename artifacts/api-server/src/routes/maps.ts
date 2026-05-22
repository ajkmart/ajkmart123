import { db } from "@workspace/db";
import {
  mapApiUsageLogTable,
  platformSettingsTable,
  popularLocationsTable,
} from "@workspace/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { logger } from "../lib/logger.js";
import { sendError, sendSuccess, sendValidationError } from "../lib/response.js";
import { verifyUserJwt } from "../middleware/security.js";
import type {
  GoogleAutocompleteResponse,
  GoogleDirectionsResponse,
  GoogleGeocodeResponse,
  LocationIQAutocompleteResult,
  NominatimResult,
} from "../types/external-apis.js";
import { adminAuth, getCachedSettings } from "./admin.js";

const router: IRouter = Router();

const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";

/* ── Reverse-geocode LRU cache: keyed by "lat,lng" rounded to 4 decimal places
   (~11m precision), so minor coordinate drift reuses the cached result.
   TTL and max size are read dynamically from platform_settings so the admin can tune
   them live from the Maps Management UI without a server restart. ── */
interface RevGeoCache {
  address: string;
  ts: number;
}
const _revGeoCache = new Map<string, RevGeoCache>();

/* Default limits (used when settings unavailable) */
const REV_GEO_TTL_MS_DEFAULT = 10 * 60_000;
const REV_GEO_MAX_DEFAULT = 200;

/* Dynamic read from platform_settings (safe bounds: 1–1440 min, 10–5000 entries) */
async function getRevGeoCacheConfig(): Promise<{ ttlMs: number; maxSize: number }> {
  try {
    const s = (await getCachedSettings()) as Record<string, string>;
    const ttlMin = Math.max(1, Math.min(1440, parseInt(s["geocode_cache_ttl_min"] ?? "10", 10)));
    const maxSize = Math.max(
      10,
      Math.min(5000, parseInt(s["geocode_cache_max_size"] ?? "200", 10))
    );
    return { ttlMs: ttlMin * 60_000, maxSize };
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return { ttlMs: REV_GEO_TTL_MS_DEFAULT, maxSize: REV_GEO_MAX_DEFAULT };
  }
}

function revGeoCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function revGeoCacheGet(lat: number, lng: number): Promise<string | null> {
  const key = revGeoCacheKey(lat, lng);
  const entry = _revGeoCache.get(key);
  if (!entry) return null;
  const { ttlMs } = await getRevGeoCacheConfig();
  if (Date.now() - entry.ts > ttlMs) {
    _revGeoCache.delete(key);
    return null;
  }
  return entry.address;
}

async function revGeoCacheSet(lat: number, lng: number, address: string): Promise<void> {
  const { maxSize } = await getRevGeoCacheConfig();
  if (_revGeoCache.size >= maxSize) {
    /* Evict the oldest entry */
    const firstKey = _revGeoCache.keys().next().value;
    if (firstKey) _revGeoCache.delete(firstKey);
  }
  _revGeoCache.set(revGeoCacheKey(lat, lng), { address, ts: Date.now() });
}

/**
 * Extract the highest-precision (street-level) address component from a
 * Google Geocoding result.  Priority order:
 *   route (street name) → sublocality_level_1 → locality → formatted_address
 */
function extractStreetAddress(result: {
  address_components?: Array<{ long_name: string; types: string[] }>;
  formatted_address?: string;
}): string {
  const components: Array<{ long_name: string; types: string[] }> = result.address_components ?? [];

  const find = (...types: string[]) =>
    components.find((c) => types.some((t) => c.types.includes(t)))?.long_name;

  const streetNumber = find("street_number") ?? "";
  const route = find("route") ?? "";
  const sublocality = find("sublocality_level_1", "sublocality") ?? "";
  const locality = find("locality") ?? "";

  if (route) {
    const parts = [streetNumber, route, sublocality || locality].filter(Boolean);
    return parts.join(", ");
  }
  if (sublocality) return sublocality + (locality ? `, ${locality}` : "");
  if (locality) return locality;
  return result.formatted_address ?? "";
}

/* ─── Helper: resolve API key + check feature gate ─── */
async function getKey(): Promise<{
  key: string | null;
  enabled: boolean;
  autocomplete: boolean;
  geocoding: boolean;
  distanceMatrix: boolean;
  provider: string;
  locationiqKey: string | null;
}> {
  const s = await getCachedSettings();
  const enabled = (s["integration_maps"] ?? "off") === "on";
  const provider = s["map_provider_primary"] ?? s["map_provider"] ?? "osm";
  /* Read new multi-provider key first, fall back to legacy key for backward compatibility */
  const key = s["google_maps_api_key"] ?? s["maps_api_key"] ?? "";
  const liqKey = s["locationiq_api_key"] ?? "";
  return {
    key: key.trim() || null,
    enabled,
    autocomplete: (s["maps_places_autocomplete"] ?? "on") === "on",
    geocoding: (s["maps_geocoding"] ?? "on") === "on",
    provider,
    locationiqKey: liqKey.trim() || null,
    distanceMatrix: (s["maps_distance_matrix"] ?? "on") === "on",
  };
}

/* ─── AJK Fallback locations (used when Maps key not configured) ─── */
const AJK_FALLBACK = [
  {
    placeId: "ajk_muzaffarabad",
    description: "Muzaffarabad Chowk, Muzaffarabad, AJK",
    mainText: "Muzaffarabad Chowk",
    lat: 34.3697,
    lng: 73.4716,
  },
  {
    placeId: "ajk_mirpur",
    description: "Mirpur City Centre, Mirpur, AJK",
    mainText: "Mirpur City Centre",
    lat: 33.1413,
    lng: 73.7508,
  },
  {
    placeId: "ajk_rawalakot",
    description: "Rawalakot Bazar, Rawalakot, AJK",
    mainText: "Rawalakot Bazar",
    lat: 33.8572,
    lng: 73.7613,
  },
  {
    placeId: "ajk_bagh",
    description: "Bagh City, Bagh, AJK",
    mainText: "Bagh City",
    lat: 33.9732,
    lng: 73.7729,
  },
  {
    placeId: "ajk_kotli",
    description: "Kotli Main Chowk, Kotli, AJK",
    mainText: "Kotli Main Chowk",
    lat: 33.5152,
    lng: 73.9019,
  },
  {
    placeId: "ajk_bhimber",
    description: "Bhimber, Mirpur, AJK",
    mainText: "Bhimber",
    lat: 32.9755,
    lng: 74.0727,
  },
  {
    placeId: "ajk_poonch",
    description: "Poonch City, Poonch, AJK",
    mainText: "Poonch City",
    lat: 33.77,
    lng: 74.0954,
  },
  {
    placeId: "ajk_neelum",
    description: "Neelum Valley, Neelum, AJK",
    mainText: "Neelum Valley",
    lat: 34.5689,
    lng: 73.8765,
  },
  {
    placeId: "ajk_hattian",
    description: "Hattian Bala, Hattian, AJK",
    mainText: "Hattian Bala",
    lat: 34.0523,
    lng: 73.8265,
  },
  {
    placeId: "ajk_sudhnoti",
    description: "Sudhnoti, Sudhnoti, AJK",
    mainText: "Sudhnoti",
    lat: 33.7457,
    lng: 73.692,
  },
  {
    placeId: "ajk_haveli",
    description: "Haveli, Haveli, AJK",
    mainText: "Haveli",
    lat: 33.6667,
    lng: 73.95,
  },
  {
    placeId: "ajk_airport",
    description: "Airport Rawalakot, Rawalakot, AJK",
    mainText: "Airport Rawalakot",
    lat: 33.8489,
    lng: 73.7978,
  },
  {
    placeId: "ajk_university",
    description: "AJK University, Muzaffarabad, AJK",
    mainText: "AJK University",
    lat: 34.3601,
    lng: 73.5088,
  },
  {
    placeId: "ajk_cmh",
    description: "CMH Muzaffarabad, Muzaffarabad, AJK",
    mainText: "CMH Muzaffarabad",
    lat: 34.366,
    lng: 73.478,
  },
  {
    placeId: "ajk_pallandri",
    description: "Pallandri, Sudhnoti, AJK",
    mainText: "Pallandri",
    lat: 33.7124,
    lng: 73.9294,
  },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ══════════════════════════════════════════════════════════
   GET /api/maps/autocomplete?input=TEXT[&lat=LAT&lng=LNG]
   Returns place suggestions for a search query.
   Falls back to AJK city list if Maps not configured.
══════════════════════════════════════════════════════════ */
/* ── Build combined fallback list: hardcoded AJK + admin-managed popular locations ── */
async function getFallbackPredictions(input: string) {
  try {
    const query = input.toLowerCase();

    /* Admin-managed popular locations from DB */
    let dbLocs: typeof AJK_FALLBACK = [];
    try {
      const rows = await db
        .select()
        .from(popularLocationsTable)
        .where(eq(popularLocationsTable.isActive, true))
        .orderBy(asc(popularLocationsTable.sortOrder));
      dbLocs = rows.map((l) => ({
        placeId: `pop_${l.id}`,
        description: l.nameUrdu ? `${l.name} — ${l.nameUrdu}` : l.name,
        mainText: l.name,
        lat: parseFloat(String(l.lat)),
        lng: parseFloat(String(l.lng)),
      }));
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[maps/fallback] DB unavailable — using hardcoded AJK locations"
      );
    }

    /* Merge: DB locations first (admin-curated), then hardcoded as backup */
    const dbIds = new Set(dbLocs.map((l) => l.description.toLowerCase()));
    const hardcoded = AJK_FALLBACK.filter((l) => !dbIds.has(l.description.toLowerCase()));
    const combined = [...dbLocs, ...hardcoded];

    if (!input) return combined;
    return combined.filter(
      (l) => l.description.toLowerCase().includes(query) || l.mainText.toLowerCase().includes(query)
    );
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[maps/fallback] getFallbackPredictions unexpected error — returning hardcoded only"
    );
    if (!input) return AJK_FALLBACK;
    const q = input.toLowerCase();
    return AJK_FALLBACK.filter(
      (l) => l.description.toLowerCase().includes(q) || l.mainText.toLowerCase().includes(q)
    );
  }
}

router.get("/autocomplete", async (req, res, next) => {
  try {
    const input = String(req.query.input ?? "").trim();
    if (!input) {
      const all = await getFallbackPredictions("");
      res.json({ predictions: all, source: "fallback" });
      return;
    }

    const {
      key,
      enabled,
      autocomplete,
      provider: configuredProvider,
      locationiqKey,
    } = await getKey();

    const useLocationIQ =
      enabled && configuredProvider === "locationiq" && locationiqKey && autocomplete;
    const useGoogle = enabled && configuredProvider !== "locationiq" && key && autocomplete;

    if (!useLocationIQ && !useGoogle) {
      const filtered = await getFallbackPredictions(input);
      res.status(503).json({
        predictions: filtered,
        source: "fallback",
        approximate: true,
        warning:
          "Maps service is not configured. Results are limited to pre-defined AJK locations.",
      });
      return;
    }

    if (useLocationIQ) {
      try {
        const parsedLat = parseFloat(String(req.query.lat ?? ""));
        const parsedLng = parseFloat(String(req.query.lng ?? ""));
        const latParam =
          !isNaN(parsedLat) && !isNaN(parsedLng)
            ? `&viewbox=${parsedLng - 0.5},${parsedLat - 0.5},${parsedLng + 0.5},${parsedLat + 0.5}&bounded=1`
            : "";
        const liqUrl = `https://us1.locationiq.com/v1/autocomplete?key=${locationiqKey}&q=${encodeURIComponent(input)}&countrycodes=pk&limit=5${latParam}`;
        const liqRaw = await fetch(liqUrl, { signal: AbortSignal.timeout(8000) });
        if (!liqRaw.ok) {
          const filtered = await getFallbackPredictions(input);
          res.status(503).json({
            predictions: filtered,
            source: "fallback",
            approximate: true,
            warning:
              "Maps service temporarily unavailable. Results are limited to pre-defined AJK locations.",
          });
          return;
        }
        const results = (await liqRaw.json()) as LocationIQAutocompleteResult[];
        const predictions = (Array.isArray(results) ? results : []).map((r) => ({
          placeId: r.place_id ?? r.osm_id ?? "",
          description: r.display_name ?? "",
          mainText: r.display_name?.split(",")[0] ?? "",
          secondaryText: r.display_name?.split(",").slice(1).join(",").trim() ?? "",
        }));
        void trackMapUsage("locationiq", "autocomplete");
        res.json({ predictions, source: "locationiq" });
      } catch (err) {
        logger.warn(
          {
            error: err instanceof Error ? err.message : String(err),
            code: "MAPS_AUTOCOMPLETE_FAILED",
            timestamp: new Date().toISOString(),
          },
          "[maps] LocationIQ autocomplete failed — using fallback predictions"
        );
        const filtered = await getFallbackPredictions(input);
        res.status(503).json({
          predictions: filtered,
          source: "fallback",
          approximate: true,
          warning:
            "Maps service temporarily unavailable. Results are limited to pre-defined AJK locations.",
        });
      }
      return;
    }

    try {
      const lat = req.query.lat ? `&location=${req.query.lat},${req.query.lng}&radius=50000` : "";
      const url = `${GOOGLE_BASE}/place/autocomplete/json?input=${encodeURIComponent(input)}${lat}&components=country:pk&language=en&key=${key}`;
      const raw = await fetch(url);
      const data = (await raw.json()) as GoogleAutocompleteResponse;

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        const filtered = AJK_FALLBACK.filter((l) =>
          l.description.toLowerCase().includes(input.toLowerCase())
        );
        res.status(503).json({
          predictions: filtered,
          source: "fallback",
          approximate: true,
          warning:
            "Maps service temporarily unavailable. Results are limited to pre-defined AJK locations.",
          googleStatus: data.status,
        });
        return;
      }

      const predictions = (data.predictions ?? []).map((p) => {
        const sf = p["structured_formatting"] as Record<string, string> | undefined;
        return {
          placeId: p["place_id"],
          description: p["description"],
          mainText: sf?.["main_text"] ?? p["description"],
          secondaryText: sf?.["secondary_text"] ?? "",
        };
      });

      void trackMapUsage("google", "autocomplete");
      res.json({ predictions, source: "google" });
    } catch (_err) {
      const filtered = AJK_FALLBACK.filter((l) =>
        l.description.toLowerCase().includes(input.toLowerCase())
      );
      res.status(503).json({
        predictions: filtered,
        source: "fallback",
        approximate: true,
        warning:
          "Maps service temporarily unavailable. Results are limited to pre-defined AJK locations.",
      });
    }
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/maps/geocode?place_id=ID  OR  ?address=TEXT
   Resolves a place ID or address to lat/lng.
   Falls back to AJK_FALLBACK lookup by placeId.
══════════════════════════════════════════════════════════ */
router.get("/geocode", async (req, res, next) => {
  try {
    const placeId = String(req.query.place_id ?? "").trim();
    const address = String(req.query.address ?? "").trim();

    /* Resolve from hardcoded fallback list by placeId */
    if (placeId.startsWith("ajk_")) {
      const loc = AJK_FALLBACK.find((l) => l.placeId === placeId);
      if (loc) {
        res.json({
          lat: loc.lat,
          lng: loc.lng,
          formattedAddress: loc.description,
          source: "fallback",
          approximate: true,
        });
        return;
      }
    }

    /* Resolve admin-managed popular location by placeId (pop_{id}) */
    if (placeId.startsWith("pop_")) {
      const id = placeId.slice(4);
      try {
        const [row] = await db
          .select()
          .from(popularLocationsTable)
          .where(eq(popularLocationsTable.id, id))
          .limit(1);
        if (row) {
          res.json({
            lat: parseFloat(String(row.lat)),
            lng: parseFloat(String(row.lng)),
            formattedAddress: row.name,
            source: "fallback",
            approximate: true,
          });
          return;
        }
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[route] fall through`
        );
      }
    }

    const { key, enabled, geocoding, provider: configuredProvider, locationiqKey } = await getKey();

    /* Helper: try Nominatim forward geocode for a text address query */
    async function nominatimForwardGeocode(query: string) {
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1`;
      const nomRaw = await fetch(nomUrl, { headers: { "User-Agent": "AJKMart-Server/1.0" } });
      if (!nomRaw.ok) return null;
      const results = (await nomRaw.json()) as NominatimResult[];
      if (!Array.isArray(results) || !results.length) return null;
      const r = results[0];
      return {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        formattedAddress: r.display_name as string,
      };
    }

    /* Helper: try LocationIQ forward geocode */
    async function locationiqForwardGeocode(query: string, liqKey: string) {
      const liqUrl = `https://us1.locationiq.com/v1/search?key=${liqKey}&q=${encodeURIComponent(query)}&format=json&limit=1`;
      const liqRaw = await fetch(liqUrl, { signal: AbortSignal.timeout(8000) });
      if (!liqRaw.ok) return null;
      const results = (await liqRaw.json()) as NominatimResult[];
      if (!Array.isArray(results) || !results.length) return null;
      const r = results[0];
      return {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        formattedAddress: r.display_name as string,
      };
    }

    const useLocationIQ =
      enabled && configuredProvider === "locationiq" && locationiqKey && geocoding;
    const useGoogle = enabled && configuredProvider !== "locationiq" && key && geocoding;

    if (!useLocationIQ && !useGoogle) {
      const query = (placeId || address).toLowerCase();
      const loc = AJK_FALLBACK.find(
        (l) =>
          l.placeId === query ||
          l.description.toLowerCase().includes(query) ||
          l.mainText.toLowerCase().includes(query)
      );
      if (loc) {
        res.json({
          lat: loc.lat,
          lng: loc.lng,
          formattedAddress: loc.description,
          source: "fallback",
          approximate: true,
        });
        return;
      }

      if (address) {
        try {
          const nom = await nominatimForwardGeocode(address);
          if (nom) {
            res.json({ ...nom, source: "nominatim" });
            return;
          }
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            `[route] Nominatim unavailable`
          );
        }
      }

      res.status(503).json({ error: "Maps not configured and location not found in local list." });
      return;
    }

    if (useLocationIQ) {
      try {
        const query = address || placeId;
        const result = await locationiqForwardGeocode(query, locationiqKey!);
        if (result) {
          void trackMapUsage("locationiq", "geocode");
          res.json({ ...result, source: "locationiq" });
          return;
        }
        if (address) {
          try {
            const nom = await nominatimForwardGeocode(address);
            if (nom) {
              void trackMapUsage("osm", "geocode");
              res.json({ ...nom, source: "nominatim" });
              return;
            }
          } catch (err) {
            logger.debug(
              { error: err instanceof Error ? err.message : String(err) },
              `[route] Nominatim unavailable`
            );
          }
        }
        res.status(404).json({ error: "Location not found" });
      } catch (err) {
        logger.warn(
          {
            error: err instanceof Error ? err.message : String(err),
            code: "MAPS_GEOCODE_FAILED",
            timestamp: new Date().toISOString(),
          },
          "[maps] Primary geocode failed — trying Nominatim fallback"
        );
        if (address) {
          try {
            const nom = await nominatimForwardGeocode(address);
            if (nom) {
              void trackMapUsage("osm", "geocode");
              res.json({ ...nom, source: "nominatim" });
              return;
            }
          } catch (err) {
            logger.debug(
              { error: err instanceof Error ? err.message : String(err) },
              `[route] Nominatim unavailable`
            );
          }
        }
        res.status(500).json({ error: "Maps geocode request failed" });
      }
      return;
    }

    try {
      const param = placeId
        ? `place_id=${encodeURIComponent(placeId)}`
        : `address=${encodeURIComponent(address)}`;
      const url = `${GOOGLE_BASE}/geocode/json?${param}&key=${key}`;
      const raw = await fetch(url);
      const data = (await raw.json()) as GoogleGeocodeResponse;

      if (data.status !== "OK" || !data.results?.length) {
        if (address) {
          try {
            const nom = await nominatimForwardGeocode(address);
            if (nom) {
              res.json({ ...nom, source: "nominatim" });
              return;
            }
          } catch (err) {
            logger.debug(
              { error: err instanceof Error ? err.message : String(err) },
              `[route] Nominatim unavailable`
            );
          }
        }
        res.status(404).json({ error: "Location not found", googleStatus: data.status });
        return;
      }

      const result = data.results[0];
      void trackMapUsage("google", "geocode");
      res.json({
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
        source: "google",
      });
    } catch (_err) {
      if (address) {
        try {
          const nom = await nominatimForwardGeocode(address);
          if (nom) {
            void trackMapUsage("osm", "geocode");
            res.json({ ...nom, source: "nominatim" });
            return;
          }
        } catch (err) {
          logger.warn({ err }, "[maps] Nominatim fallback unavailable during geocode");
        }
      }
      res.status(500).json({ error: "Maps geocode request failed" });
    }
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/maps/reverse-geocode?lat=LAT&lng=LNG
   Converts lat/lng to a street-level address.
   Uses street-level component extraction + in-process cache to avoid
   redundant API calls on minor coordinate drift.
══════════════════════════════════════════════════════════ */
router.get("/reverse-geocode", async (req, res, next) => {
  try {
    const lat = parseFloat(String(req.query.lat ?? ""));
    const lng = parseFloat(String(req.query.lng ?? ""));

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: "lat and lng are required" });
      return;
    }

    /* Cache hit — avoid redundant API call */
    const cached = await revGeoCacheGet(lat, lng);
    if (cached) {
      res.json({ address: cached, source: "cache" });
      return;
    }

    const { key, enabled, geocoding, provider: configuredProvider, locationiqKey } = await getKey();

    /* Helper: Nominatim reverse geocode for lat/lng */
    async function nominatimReverseGeocode(rlat: number, rlng: number): Promise<string | null> {
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${rlat}&lon=${rlng}&format=json&addressdetails=1`;
      const nomRaw = await fetch(nomUrl, { headers: { "User-Agent": "AJKMart-Server/1.0" } });
      if (!nomRaw.ok) return null;
      const nomData = (await nomRaw.json()) as NominatimResult;
      if (!nomData?.display_name) return null;
      const addr = nomData.address;
      const parts: string[] = [];
      if (addr?.road) parts.push(addr.road);
      else if (addr?.suburb) parts.push(addr.suburb);
      else if (addr?.village) parts.push(addr.village);
      if (addr?.city || addr?.town || addr?.county)
        parts.push(addr.city ?? addr.town ?? addr.county ?? "");
      return parts.length ? parts.join(", ") : nomData.display_name;
    }

    /* Helper: LocationIQ reverse geocode */
    async function locationiqReverseGeocode(
      rlat: number,
      rlng: number,
      liqKey: string
    ): Promise<{ address: string; formattedAddress: string } | null> {
      const liqUrl = `https://us1.locationiq.com/v1/reverse?key=${liqKey}&lat=${rlat}&lon=${rlng}&format=json&addressdetails=1`;
      const liqRaw = await fetch(liqUrl, { signal: AbortSignal.timeout(8000) });
      if (!liqRaw.ok) return null;
      const liqData = (await liqRaw.json()) as NominatimResult;
      if (!liqData?.display_name) return null;
      const addr = liqData.address;
      const parts: string[] = [];
      if (addr?.road) parts.push(addr.road);
      else if (addr?.suburb) parts.push(addr.suburb);
      else if (addr?.village) parts.push(addr.village);
      if (addr?.city || addr?.town || addr?.county)
        parts.push(addr.city ?? addr.town ?? addr.county ?? "");
      const address = parts.length ? parts.join(", ") : liqData.display_name;
      return { address, formattedAddress: liqData.display_name };
    }

    /* Helper: fallback to nearest AJK location */
    function ajkFallback(): string {
      let closest = AJK_FALLBACK[0]!;
      let closestDist = Infinity;
      for (const loc of AJK_FALLBACK) {
        const d = haversineKm(lat, lng, loc.lat, loc.lng);
        if (d < closestDist) {
          closestDist = d;
          closest = loc;
        }
      }
      return closest.description;
    }

    const useLocationIQ =
      enabled && configuredProvider === "locationiq" && locationiqKey && geocoding;
    const useGoogle = enabled && configuredProvider !== "locationiq" && key && geocoding;

    if (!useLocationIQ && !useGoogle) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
        const nomRaw = await fetch(nomUrl, { headers: { "User-Agent": "AJKMart-Server/1.0" } });
        if (nomRaw.ok) {
          const nomData = (await nomRaw.json()) as NominatimResult;
          if (nomData?.display_name) {
            const addr = nomData.address;
            const parts: string[] = [];
            if (addr?.road) parts.push(addr.road);
            else if (addr?.suburb) parts.push(addr.suburb);
            else if (addr?.village) parts.push(addr.village);
            if (addr?.city || addr?.town || addr?.county)
              parts.push(addr.city ?? addr.town ?? addr.county ?? "");
            const address = parts.length ? parts.join(", ") : nomData.display_name;
            await revGeoCacheSet(lat, lng, address);
            void trackMapUsage("osm", "reverse-geocode");
            res.json({ address, formattedAddress: nomData.display_name, source: "nominatim" });
            return;
          }
        }
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[route] Nominatim unavailable`
        );
      }

      const address = ajkFallback();
      await revGeoCacheSet(lat, lng, address);
      res.json({ address, source: "fallback" });
      return;
    }

    if (useLocationIQ) {
      try {
        const result = await locationiqReverseGeocode(lat, lng, locationiqKey!);
        if (result) {
          await revGeoCacheSet(lat, lng, result.address);
          void trackMapUsage("locationiq", "reverse-geocode");
          res.json({
            address: result.address,
            formattedAddress: result.formattedAddress,
            source: "locationiq",
          });
          return;
        }
        try {
          const nomAddr = await nominatimReverseGeocode(lat, lng);
          if (nomAddr) {
            await revGeoCacheSet(lat, lng, nomAddr);
            void trackMapUsage("osm", "reverse-geocode");
            res.json({ address: nomAddr, source: "nominatim" });
            return;
          }
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            `[route] Nominatim unavailable`
          );
        }
        const address = ajkFallback();
        await revGeoCacheSet(lat, lng, address);
        res.json({ address, source: "fallback" });
      } catch (err) {
        logger.warn(
          {
            error: err instanceof Error ? err.message : String(err),
            code: "MAPS_LOCATIONIQ_REVERSE_FAILED",
            timestamp: new Date().toISOString(),
          },
          "[maps] LocationIQ reverse geocode failed — trying Nominatim fallback"
        );
        try {
          const nomAddr = await nominatimReverseGeocode(lat, lng);
          if (nomAddr) {
            await revGeoCacheSet(lat, lng, nomAddr);
            void trackMapUsage("osm", "reverse-geocode");
            res.json({ address: nomAddr, source: "nominatim" });
            return;
          }
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            `[route] Nominatim also unavailable`
          );
        }
        const address = ajkFallback();
        await revGeoCacheSet(lat, lng, address);
        res.json({ address, source: "fallback" });
      }
      return;
    }

    try {
      const url = `${GOOGLE_BASE}/geocode/json?latlng=${lat},${lng}&language=en&key=${key}`;
      const raw = await fetch(url);
      const data = (await raw.json()) as GoogleGeocodeResponse;

      if (data.status !== "OK" || !data.results?.length) {
        try {
          const nomAddr = await nominatimReverseGeocode(lat, lng);
          if (nomAddr) {
            await revGeoCacheSet(lat, lng, nomAddr);
            void trackMapUsage("osm", "reverse-geocode");
            res.json({ address: nomAddr, source: "nominatim" });
            return;
          }
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            `[route] Nominatim unavailable`
          );
        }
        res.status(404).json({ error: "Address not found", googleStatus: data.status });
        return;
      }

      const address = extractStreetAddress(data.results[0]);
      await revGeoCacheSet(lat, lng, address);
      void trackMapUsage("google", "reverse-geocode");
      res.json({ address, formattedAddress: data.results[0].formatted_address, source: "google" });
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          code: "MAPS_GOOGLE_REVERSE_GEOCODE_FAILED",
          timestamp: new Date().toISOString(),
        },
        "[maps] Google reverse geocode failed — trying Nominatim fallback"
      );
      try {
        const nomAddr = await nominatimReverseGeocode(lat, lng);
        if (nomAddr) {
          await revGeoCacheSet(lat, lng, nomAddr);
          void trackMapUsage("osm", "reverse-geocode");
          res.json({ address: nomAddr, source: "nominatim" });
          return;
        }
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[route] Nominatim also unavailable`
        );
      }
      res.status(500).json({ error: "Reverse geocode request failed" });
    }
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/maps/directions
     ?origin_lat=&origin_lng=&dest_lat=&dest_lng=
     &mode=driving|bicycling  (default: driving)
   Returns distance, duration and encoded polyline.
   Honors the admin-configured routing_engine setting:
     • osrm    — Open Source Routing Machine (free, no key required)
     • google  — Google Directions API (requires maps_api_key)
     • mapbox  — Mapbox Directions API (requires mapbox_api_key)
   Falls back to Haversine + speed estimate when no engine is available.
══════════════════════════════════════════════════════════ */
router.get("/directions", async (req, res, next) => {
  try {
    const oLat = parseFloat(String(req.query.origin_lat ?? ""));
    const oLng = parseFloat(String(req.query.origin_lng ?? ""));
    const dLat = parseFloat(String(req.query.dest_lat ?? ""));
    const dLng = parseFloat(String(req.query.dest_lng ?? ""));
    const mode = String(req.query.mode ?? "driving");

    if ([oLat, oLng, dLat, dLng].some(isNaN)) {
      res.status(400).json({ error: "origin_lat, origin_lng, dest_lat, dest_lng are required" });
      return;
    }

    /* Read routing engine from platform settings */
    const settings = (await getCachedSettings()) as Record<string, string>;
    const routingEngine = settings["routing_engine"] ?? settings["routing_api_provider"] ?? "osrm";

    /* Haversine fallback payload helper */
    function haversineFallback(source: string) {
      const km = Math.round(haversineKm(oLat, oLng, dLat, dLng) * 10) / 10;
      const avg = mode === "bicycling" ? 25 : 45;
      const min = Math.round((km / avg) * 60);
      return {
        distanceKm: km,
        distanceText: `${km} km`,
        durationSeconds: min * 60,
        durationText: `${min} min`,
        polyline: null,
        source,
      };
    }

    /* ── OSRM (Open Source Routing Machine) — free, no key required ── */
    if (routingEngine === "osrm") {
      try {
        const osrmMode = mode === "bicycling" ? "cycling" : "driving";
        const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;
        const raw = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = (await raw.json()) as {
          code?: string;
          routes?: Array<{ distance: number; duration: number; geometry?: unknown }>;
        };
        if (data?.code !== "Ok" || !data?.routes?.length) {
          res.json(haversineFallback("fallback"));
          return;
        }
        const route = data.routes[0];
        const distKm = Math.round(route.distance / 100) / 10;
        const minEst = Math.round(route.duration / 60);
        void trackMapUsage("osm", "directions");
        res.json({
          distanceKm: distKm,
          distanceText: `${distKm} km`,
          durationSeconds: Math.round(route.duration),
          durationText: `${minEst} min`,
          polyline: null,
          geojson: route.geometry ?? null,
          source: "osrm",
        });
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[maps/directions] OSRM failed — using haversine fallback"
        );
        res.json(haversineFallback("fallback"));
      }
      return;
    }

    /* ── Mapbox Directions API ── */
    if (routingEngine === "mapbox") {
      const mapboxToken = settings["mapbox_api_key"] ?? "";
      if (!mapboxToken) {
        res.json(haversineFallback("fallback"));
        return;
      }
      try {
        const mbMode = mode === "bicycling" ? "cycling" : "driving";
        const url = `https://api.mapbox.com/directions/v5/mapbox/${mbMode}/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson&access_token=${mapboxToken}`;
        const raw = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = (await raw.json()) as {
          routes?: Array<{ distance: number; duration: number; geometry?: unknown }>;
        };
        if (!data?.routes?.length) {
          res.json(haversineFallback("fallback"));
          return;
        }
        const route = data.routes[0];
        const distKm = Math.round(route.distance / 100) / 10;
        const minEst = Math.round(route.duration / 60);
        void trackMapUsage("mapbox", "directions");
        res.json({
          distanceKm: distKm,
          distanceText: `${distKm} km`,
          durationSeconds: Math.round(route.duration),
          durationText: `${minEst} min`,
          polyline: null,
          geojson: route.geometry ?? null,
          source: "mapbox",
        });
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[maps/directions] Mapbox failed — using haversine fallback"
        );
        res.json(haversineFallback("fallback"));
      }
      return;
    }

    /* ── Google Directions API (default for routing_engine=google or legacy path) ── */
    const { key, enabled, distanceMatrix } = await getKey();

    if (!enabled || !key || !distanceMatrix) {
      res.json(haversineFallback("fallback"));
      return;
    }

    try {
      const url = `${GOOGLE_BASE}/directions/json?origin=${oLat},${oLng}&destination=${dLat},${dLng}&mode=${mode}&key=${key}`;
      const raw = await fetch(url);
      const data = (await raw.json()) as GoogleDirectionsResponse;

      if (data.status !== "OK" || !data.routes?.length) {
        res.json({ ...haversineFallback("fallback"), googleStatus: data.status });
        return;
      }

      const leg = data.routes[0].legs[0];
      void trackMapUsage("google", "directions");
      res.json({
        distanceKm: Math.round(leg.distance.value / 100) / 10,
        distanceText: leg.distance.text,
        durationSeconds: leg.duration.value,
        durationText: leg.duration.text,
        polyline: data.routes[0].overview_polyline?.points ?? null,
        source: "google",
      });
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[maps/directions] Google Directions failed — using haversine fallback"
      );
      res.json(haversineFallback("fallback"));
    }
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/maps/status
   Returns whether Maps is configured and active.
══════════════════════════════════════════════════════════ */
router.get("/status", async (_req, res, next) => {
  try {
    const { key, enabled, provider, locationiqKey } = await getKey();
    const providerKeyConfigured = provider === "locationiq" ? !!locationiqKey : !!key;
    res.json({
      mapsEnabled: enabled,
      keyConfigured: providerKeyConfigured,
      apisAvailable: ["autocomplete", "directions", "geocode"],
      fallbackActive: !enabled || !providerKeyConfigured,
    });
  } catch (err) {
    next(err);
  }
});

/* ── Helper: extract and verify Bearer token from Authorization header or socket auth ── */
function extractAuthToken(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function isRequestAuthenticated(req: Request): boolean {
  const token = extractAuthToken(req);
  if (!token) return false;
  return verifyUserJwt(token) != null;
}

/* ── GET /api/maps/config — Serves map provider config to authenticated clients.
   API keys are fetched from platform_settings (DB-managed) and returned at request
   time so they never appear in frontend build artifacts or source code.
   Unauthenticated requests receive provider/tile config but NO API keys, preventing
   key exposure to scrapers and bots. Authenticated users get full config.
   Rate limiting is enforced by the global API rate limiter.

   Optional query param ?app=customer|rider|vendor|admin scopes the returned
   token to only the effective provider for that app (reduces over-exposure).
   When ?app is absent the token for the global primary provider is returned.
── */
router.get("/config", async (req, res, next) => {
  try {
    const authenticated = isRequestAuthenticated(req);
    const settings = await getCachedSettings();
    const s = settings as Record<string, string>;

    /* Primary provider: new multi-provider schema (fallback to legacy map_provider) */
    const mapProvider = s["map_provider_primary"] ?? s["map_provider"] ?? "osm";
    const secondaryProvider = s["map_provider_secondary"] ?? "osm";
    const failoverEnabled = (s["map_failover_enabled"] ?? "on") === "on";

    const mapboxToken = s["mapbox_api_key"] ?? "";
    const googleKey = s["google_maps_api_key"] ?? s["maps_api_key"] ?? "";
    const searchProvider = s["map_search_provider"] ?? s["search_api_provider"] ?? "locationiq";
    const locationIqKey = s["locationiq_api_key"] ?? "";
    const routingEngine = s["routing_engine"] ?? s["routing_api_provider"] ?? "osrm";

    /* Helper: resolve token for a given provider — only returned for that provider */
    const tokenFor = (prov: string) =>
      prov === "mapbox"
        ? mapboxToken
        : prov === "google"
          ? googleKey
          : prov === "locationiq"
            ? locationIqKey
            : "";

    /* Per-app provider overrides */
    const appOverrideKeys: Record<string, string> = {
      customer: s["map_app_override_customer"] ?? "primary",
      rider: s["map_app_override_rider"] ?? "primary",
      vendor: s["map_app_override_vendor"] ?? "primary",
      admin: s["map_app_override_admin"] ?? "primary",
    };

    /* Resolve actual provider for a given override value */
    const resolveAppProvider = (override: string): string => {
      if (override === "primary") return mapProvider;
      if (override === "secondary") return secondaryProvider;
      if (["osm", "mapbox", "google", "locationiq"].includes(override)) return override;
      return mapProvider;
    };

    /* If ?app is specified, only return the token for that app's effective provider.
     This prevents unnecessarily exposing all provider keys to every client. */
    const reqApp = String(req.query.app ?? "").toLowerCase();
    const validApps = ["customer", "rider", "vendor", "admin"];
    const scopedApp = validApps.includes(reqApp) ? reqApp : null;

    /* Strip API keys from unauthenticated responses — provider name and tile
     config are always returned so the map can render with free-tier OSM tiles.
     Authenticated requests (valid Bearer JWT) receive the full key set. */
    const resolveToken = (t: string) => (authenticated ? t : "");

    const primaryToken = resolveToken(tokenFor(mapProvider));

    /* searchToken: only the token for the configured search provider */
    const searchToken = authenticated
      ? searchProvider === "locationiq"
        ? locationIqKey
        : searchProvider === "google"
          ? googleKey
          : ""
      : "";

    /* Geocode cache config */
    const rawTtl = parseInt(s["geocode_cache_ttl_min"] ?? "10", 10);
    const rawSize = parseInt(s["geocode_cache_max_size"] ?? "200", 10);
    const geocodeCacheTtlMin = Number.isFinite(rawTtl) ? Math.max(1, Math.min(1440, rawTtl)) : 10;
    const geocodeCacheMaxSize = Number.isFinite(rawSize)
      ? Math.max(10, Math.min(5000, rawSize))
      : 200;

    /* Build per-app overrides — token only included for authenticated requests */
    const buildAppOverrides = () => {
      const result: Record<string, { provider: string; token: string; override: string }> = {};
      for (const app of validApps) {
        const override = appOverrideKeys[app];
        const provider = resolveAppProvider(override);
        const token =
          authenticated && (scopedApp == null || scopedApp === app) ? tokenFor(provider) : "";
        result[app] = { provider, token, override };
      }
      return result;
    };

    res.json({
      /* Canonical schema keys (required contract) */
      primary: mapProvider,
      primaryToken,
      secondary: secondaryProvider,
      /* secondaryToken is returned because DynamicTileLayer needs it for client-side failover.
       Both primary and secondary keys are domain-restricted by the provider. */
      secondaryToken: resolveToken(tokenFor(secondaryProvider)),
      failoverEnabled,

      /* Backward-compatible aliases for existing consumers */
      provider: mapProvider,
      token: primaryToken,
      secondaryProvider,

      /* Per-app overrides — tokens scoped to requesting app when ?app= is provided */
      appOverrides: buildAppOverrides(),

      /* Routing */
      routingEngine,
      routingProvider: routingEngine /* backward-compat alias */,

      /* Search/autocomplete */
      searchProvider,
      searchToken,

      /* Indicate to the client whether it received full key config */
      keysIncluded: authenticated,

      /* Per-provider health/status — no tokens in this block */
      providers: {
        osm: {
          enabled: (s["osm_enabled"] ?? "on") === "on",
          role: s["map_provider_role_osm"] ?? "primary",
          lastTested: s["map_last_tested_osm"] ?? null,
          testStatus: s["map_test_status_osm"] ?? "unknown",
        },
        mapbox: {
          enabled: (s["mapbox_enabled"] ?? "off") === "on",
          role: s["map_provider_role_mapbox"] ?? "disabled",
          lastTested: s["map_last_tested_mapbox"] ?? null,
          testStatus: s["map_test_status_mapbox"] ?? "unknown",
        },
        google: {
          enabled: (s["google_maps_enabled"] ?? "off") === "on",
          role: s["map_provider_role_google"] ?? "disabled",
          lastTested: s["map_last_tested_google"] ?? null,
          testStatus: s["map_test_status_google"] ?? "unknown",
        },
        locationiq: {
          enabled: (s["locationiq_enabled"] ?? "off") === "on",
          role: s["map_provider_role_locationiq"] ?? "disabled",
          lastTested: s["map_last_tested_locationiq"] ?? null,
          testStatus: s["map_test_status_locationiq"] ?? "unknown",
        },
      },

      /* General */
      enabled: s["integration_maps"] !== "off",
      defaultLat: parseFloat(s["map_default_lat"] || "33.7294"),
      defaultLng: parseFloat(s["map_default_lng"] || "73.3872"),

      /* Geocoding cache (admin-tunable live via platform_settings) */
      geocodeCacheTtlMin,
      geocodeCacheMaxSize,
      geocodeCacheCurrentSize: _revGeoCache.size,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/maps/picker
   Serves a full-screen interactive Leaflet map for pin-drop
   location selection. Used by the customer app via iframe.
   Query params:
     lat   - initial latitude  (default: 33.73)
     lng   - initial longitude (default: 73.39)
     zoom  - initial zoom      (default: 13)
     label - label shown in toolbar (e.g. "Pickup" / "Drop-off")
     lang  - "en" | "ur"
══════════════════════════════════════════════════════════ */
router.get("/picker", (req, res) => {
  const lat = parseFloat(String(req.query.lat ?? "33.7294"));
  const lng = parseFloat(String(req.query.lng ?? "73.3872"));
  const zoom = parseInt(String(req.query.zoom ?? "14"), 10);
  const label = String(req.query.label ?? "Location");
  const lang = String(req.query.lang ?? "en");

  const isUrdu = lang === "ur";
  const t = {
    title: isUrdu ? `${label} چنیں` : `Select ${label}`,
    searchPH: isUrdu ? "جگہ تلاش کریں..." : "Search location...",
    pinHint: isUrdu ? "پن کھینچ کر مقام تبدیل کریں" : "Drag pin to adjust location",
    myLocation: isUrdu ? "میری جگہ" : "My Location",
    confirm: isUrdu ? "مقام تصدیق کریں ✓" : "Confirm Location ✓",
    loading: isUrdu ? "مقام لوڈ ہو رہا ہے..." : "Loading address...",
  };

  const html = `<!DOCTYPE html>
<html lang="${isUrdu ? "ur" : "en"}" dir="${isUrdu ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <title>${t.title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;height:100dvh;display:flex;flex-direction:column;overflow:hidden}
    #toolbar{background:#fff;padding:10px 12px 0;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,.12)}
    #titlebar{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    #titlebar h2{font-size:15px;font-weight:700;color:#1a1a2e;flex:1}
    #search-wrap{position:relative;margin-bottom:8px}
    #search{width:100%;padding:9px 36px 9px 12px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;transition:border-color .2s}
    #search:focus{border-color:#4a90e2}
    #search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#999;font-size:16px;display:none}
    #suggestions{background:#fff;border:1px solid #e0e0e0;border-radius:8px;max-height:160px;overflow-y:auto;position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:2000;display:none;box-shadow:0 4px 12px rgba(0,0,0,.15)}
    .suggestion{padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;transition:background .15s}
    .suggestion:last-child{border-bottom:none}
    .suggestion:hover,.suggestion:active{background:#f0f7ff}
    .sug-main{font-weight:600;color:#1a1a2e}
    .sug-sub{font-size:11px;color:#888;margin-top:1px}
    #map{flex:1;z-index:1}
    #address-bar{background:#fff;padding:8px 12px;z-index:1000;box-shadow:0 -2px 8px rgba(0,0,0,.08)}
    #address-text{font-size:13px;color:#333;margin-bottom:6px;min-height:18px;font-weight:500}
    #hint{font-size:11px;color:#888;margin-bottom:8px}
    #btn-row{display:flex;gap:8px;padding-bottom:env(safe-area-inset-bottom,0px)}
    #btn-locate{flex:0 0 auto;padding:11px 14px;background:#f0f0f0;border:none;border-radius:10px;cursor:pointer;font-size:13px;color:#555;font-weight:600;transition:background .2s}
    #btn-locate:active{background:#e0e0e0}
    #btn-confirm{flex:1;padding:11px;background:#4a90e2;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:background .2s}
    #btn-confirm:active{background:#357abd}
    #btn-confirm:disabled{background:#ccc;cursor:not-allowed}
    .leaflet-control-attribution{display:none}
    #crosshair{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);z-index:500;pointer-events:none;font-size:32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))}
  </style>
</head>
<body>
<div id="toolbar">
  <div id="titlebar"><h2>${t.title}</h2></div>
  <div id="search-wrap">
    <input id="search" type="text" placeholder="${t.searchPH}" autocomplete="off"/>
    <button id="search-clear">✕</button>
    <div id="suggestions"></div>
  </div>
</div>
<div id="map"></div>
<div id="address-bar">
  <div id="address-text">${t.loading}</div>
  <div id="hint">${t.pinHint}</div>
  <div id="btn-row">
    <button id="btn-locate">📍 ${t.myLocation}</button>
    <button id="btn-confirm" disabled>${t.confirm}</button>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js"></script>
<script>
  const INITIAL_LAT = ${isNaN(lat) ? 33.7294 : lat};
  const INITIAL_LNG = ${isNaN(lng) ? 73.3872 : lng};
  const INITIAL_ZOOM = ${isNaN(zoom) ? 14 : zoom};
  const API_BASE = window.location.origin;

  const map = L.map('map', { zoomControl: true }).setView([INITIAL_LAT, INITIAL_LNG], INITIAL_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ''
  }).addTo(map);

  const pinIcon = L.divIcon({
    html: '<div style="font-size:36px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">📍</div>',
    iconSize: [36,36], iconAnchor: [18,36], className: ''
  });

  let marker = L.marker([INITIAL_LAT, INITIAL_LNG], { icon: pinIcon, draggable: true }).addTo(map);
  let currentLat = INITIAL_LAT, currentLng = INITIAL_LNG, currentAddress = '';
  let addrTimer = null;

  const addrEl = document.getElementById('address-text');
  const confirmBtn = document.getElementById('btn-confirm');

  function setLoading() {
    addrEl.textContent = '${t.loading}';
    confirmBtn.disabled = true;
  }

  async function reverseGeocode(lat, lng) {
    setLoading();
    try {
      const r = await fetch(API_BASE + '/api/maps/reverse-geocode?lat=' + lat + '&lng=' + lng);
      const d = await r.json();
      currentAddress = d.address || d.formattedAddress || (lat.toFixed(5) + ', ' + lng.toFixed(5));
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }, '[route] unhandled error');
      currentAddress = lat.toFixed(5) + ', ' + lng.toFixed(5);
    }
    addrEl.textContent = currentAddress;
    confirmBtn.disabled = false;
  }

  function onMarkerMoved(lat, lng) {
    currentLat = lat; currentLng = lng;
    if (addrTimer) clearTimeout(addrTimer);
    addrTimer = setTimeout(() => reverseGeocode(lat, lng), 600);
  }

  marker.on('dragend', e => {
    const pos = e.target.getLatLng();
    onMarkerMoved(pos.lat, pos.lng);
  });

  map.on('click', e => {
    marker.setLatLng(e.latlng);
    onMarkerMoved(e.latlng.lat, e.latlng.lng);
  });

  reverseGeocode(INITIAL_LAT, INITIAL_LNG);

  document.getElementById('btn-confirm').addEventListener('click', () => {
    const payload = { type: 'MAP_PICKER_CONFIRM', lat: currentLat, lng: currentLng, address: currentAddress };
    window.parent.postMessage(payload, '*');
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  });

  document.getElementById('btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      map.setView([lat, lng], 16);
      marker.setLatLng([lat, lng]);
      onMarkerMoved(lat, lng);
    }, () => {});
  });

  /* Search autocomplete */
  const searchEl = document.getElementById('search');
  const clearEl = document.getElementById('search-clear');
  const sugEl = document.getElementById('suggestions');
  let searchTimer = null;

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim();
    clearEl.style.display = q ? 'block' : 'none';
    if (searchTimer) clearTimeout(searchTimer);
    if (!q) { sugEl.style.display = 'none'; return; }
    searchTimer = setTimeout(async () => {
      try {
        const r = await fetch(API_BASE + '/api/maps/autocomplete?input=' + encodeURIComponent(q));
        const d = await r.json();
        const preds = d.predictions || [];
        if (!preds.length) { sugEl.style.display = 'none'; return; }
        sugEl.innerHTML = preds.slice(0, 8).map(p =>
          '<div class="suggestion" data-lat="' + (p.lat||'') + '" data-lng="' + (p.lng||'') + '" data-pid="' + (p.placeId||'') + '" data-desc="' + encodeURIComponent(p.description||p.mainText||'') + '">'
          + '<div class="sug-main">' + (p.mainText||p.description||'') + '</div>'
          + (p.secondaryText ? '<div class="sug-sub">' + p.secondaryText + '</div>' : '')
          + '</div>'
        ).join('');
        sugEl.style.display = 'block';
      } catch (err) { logger.debug({ error: err instanceof Error ? err.message : String(err) }, "[fn] error with fallback"); sugEl.style.display = 'none'; }
    }, 300);
  });

  clearEl.addEventListener('click', () => {
    searchEl.value = ''; clearEl.style.display = 'none'; sugEl.style.display = 'none';
  });

  sugEl.addEventListener('click', async e => {
    const el = e.target.closest('.suggestion');
    if (!el) return;
    sugEl.style.display = 'none';
    searchEl.value = '';
    clearEl.style.display = 'none';

    let lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
    const desc = decodeURIComponent(el.dataset.desc || '');

    if (!lat || !lng) {
      try {
        const pid = el.dataset.pid;
        const r = await fetch(API_BASE + '/api/maps/geocode?place_id=' + encodeURIComponent(pid));
        const d = await r.json();
        lat = d.lat; lng = d.lng;
      } catch (err) { logger.debug({ error: err instanceof Error ? err.message : String(err) }, "[fn] early return on error"); return; }
    }
    if (!lat || !lng) return;
    map.setView([lat, lng], 16);
    marker.setLatLng([lat, lng]);
    currentLat = lat; currentLng = lng;
    currentAddress = desc;
    addrEl.textContent = desc;
    confirmBtn.disabled = false;
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#search-wrap')) sugEl.style.display = 'none';
  });
</script>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.send(html);
});

/* ══════════════════════════════════════════════════════════
   USAGE TRACKING — increments the map_api_usage_log counter
   Called by geocode, reverse-geocode, directions, autocomplete handlers.
   Silently swallows errors so tracking failures never break API responses.
══════════════════════════════════════════════════════════ */
export async function trackMapUsage(provider: string, endpointType: string): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    /* Upsert: increment count if row exists, insert with count=1 if not */
    await db.execute(sql`
      INSERT INTO map_api_usage_log (provider, endpoint_type, count, date)
      VALUES (${provider}, ${endpointType}, 1, ${today})
      ON CONFLICT (provider, endpoint_type, date)
      DO UPDATE SET count = map_api_usage_log.count + 1, updated_at = NOW()
    `);
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[route] silent — usage tracking must not break API`
    );
  }
}

/* ══════════════════════════════════════════════════════════
   ADMIN MAPS SUB-ROUTER
   Exposed at TWO paths for full contract coverage:
     • /api/maps/admin/*  (primary, via mapsRouter)
     • /api/admin/maps/*  (alias, mounted separately in routes/index.ts)
   All handlers require admin auth.
══════════════════════════════════════════════════════════ */

export const adminMapsRouter: IRouter = Router();

/* ── POST /test
   Pings the real provider API and returns { ok, latencyMs, error? }
   Body: { provider: "osm"|"mapbox"|"google"|"locationiq", key?: string }
   ── */
async function handleMapsTest(
  req: import("express").Request,
  res: import("express").Response
): Promise<void> {
  const { provider, key: keyOverride } = req.body as { provider?: string; key?: string };
  if (!provider || !["osm", "mapbox", "google", "locationiq"].includes(provider)) {
    sendValidationError(res, "provider must be 'osm', 'mapbox', 'google', or 'locationiq'");
    return;
  }

  const settings = await getCachedSettings();
  const s = settings as Record<string, string>;

  const mapboxToken = keyOverride ?? (provider === "mapbox" ? (s["mapbox_api_key"] ?? "") : "");
  const googleKey =
    keyOverride ??
    (provider === "google" ? (s["google_maps_api_key"] ?? s["maps_api_key"] ?? "") : "");
  const locationiqKey =
    keyOverride ?? (provider === "locationiq" ? (s["locationiq_api_key"] ?? "") : "");

  const start = Date.now();
  let ok = false;
  let error: string | undefined;

  try {
    if (provider === "osm") {
      /* Ping Nominatim with a lightweight lookup */
      const r = await fetch(
        "https://nominatim.openstreetmap.org/search?q=Muzaffarabad&format=json&limit=1",
        {
          headers: { "User-Agent": "AJKMart-Admin-Test/1.0" },
          signal: AbortSignal.timeout(8000),
        }
      );
      ok = r.ok;
      if (!r.ok) error = `HTTP ${r.status}`;
    } else if (provider === "mapbox") {
      if (!mapboxToken) {
        sendError(res, "Mapbox token is not configured", 422);
        return;
      }
      /* Ping the Mapbox styles endpoint — lightweight, returns 200 if token is valid */
      const r = await fetch(
        `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${mapboxToken}`,
        { signal: AbortSignal.timeout(8000) }
      );
      ok = r.ok;
      if (!r.ok) {
        const body = (await r.json().catch((err: unknown) => {
          logger.debug(
            {
              err: err instanceof Error ? err.message : String(err),
              provider: "mapbox",
              status: r.status,
            },
            "[maps] key-validation error body parse failed"
          );
          return {};
        })) as { message?: string };
        error = body?.message ?? `HTTP ${r.status}`;
      }
    } else if (provider === "google") {
      if (!googleKey) {
        sendError(res, "Google Maps API key is not configured", 422);
        return;
      }
      /* Ping the Geocoding API with a minimal query */
      const r = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=Muzaffarabad&key=${googleKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = (await r.json()) as GoogleGeocodeResponse;
      ok = data?.status === "OK" || data?.status === "ZERO_RESULTS";
      if (!ok) error = data?.error_message ?? data?.status ?? `HTTP ${r.status}`;
    } else if (provider === "locationiq") {
      if (!locationiqKey) {
        sendError(res, "LocationIQ API key is not configured", 422);
        return;
      }
      const r = await fetch(
        `https://us1.locationiq.com/v1/search?key=${locationiqKey}&q=Muzaffarabad&format=json&limit=1`,
        { signal: AbortSignal.timeout(8000) }
      );
      ok = r.ok;
      if (!r.ok) {
        const body = (await r.json().catch((err: unknown) => {
          logger.debug(
            {
              err: err instanceof Error ? err.message : String(err),
              provider: "locationiq",
              status: r.status,
            },
            "[maps] key-validation error body parse failed"
          );
          return {};
        })) as { error?: string };
        error = body?.error ?? `HTTP ${r.status}`;
      }
    }
  } catch (e: unknown) {
    ok = false;
    error = (e as Error | null)?.message ?? "Request timed out";
  }

  const latencyMs = Date.now() - start;

  /* Persist test result to platform_settings */
  const now = new Date().toISOString();
  try {
    await db
      .update(platformSettingsTable)
      .set({ value: now, updatedAt: new Date() })
      .where(eq(platformSettingsTable.key, `map_last_tested_${provider}`));
    await db
      .update(platformSettingsTable)
      .set({ value: ok ? "ok" : "fail", updatedAt: new Date() })
      .where(eq(platformSettingsTable.key, `map_test_status_${provider}`));
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[route] ignore persistence errors`
    );
  }

  sendSuccess(res, { ok, latencyMs, provider, error, testedAt: now });
}

/* ── GET /usage
   Returns daily and monthly call counts per provider/endpoint.
   ── */
async function handleMapsUsage(
  _req: import("express").Request,
  res: import("express").Response
): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(mapApiUsageLogTable)
      .orderBy(mapApiUsageLogTable.date, mapApiUsageLogTable.provider);

    /* Group into daily (last 30 days) and monthly summaries */
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const daily = rows.filter((r) => r.date >= thirtyDaysAgo);

    /* Build per-day aggregated data suitable for a Recharts bar chart */
    const byDay: Record<string, Record<string, number>> = {};
    for (const row of daily) {
      const d = row.date;
      if (!byDay[d]) byDay[d] = {};
      byDay[d]![row.provider] = (byDay[d]![row.provider] ?? 0) + row.count;
    }
    const dailyChart = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    /* Monthly totals */
    const monthKey = now.toISOString().slice(0, 7);
    const monthly = rows.filter((r) => r.date.startsWith(monthKey));
    const monthlyByProvider: Record<string, Record<string, number>> = {};
    for (const row of monthly) {
      if (!monthlyByProvider[row.provider]) monthlyByProvider[row.provider] = {};
      monthlyByProvider[row.provider]![row.endpointType] =
        (monthlyByProvider[row.provider]![row.endpointType] ?? 0) + row.count;
    }

    /* Cost estimates (approximate published pricing, USD per 1000 calls) */
    const COST_PER_1K: Record<string, Record<string, number>> = {
      google: { geocode: 5, directions: 5, autocomplete: 2.83, "reverse-geocode": 5 },
      mapbox: { geocode: 0.75, directions: 1, autocomplete: 0.75, "reverse-geocode": 0.75 },
      osm: { geocode: 0, directions: 0, autocomplete: 0, "reverse-geocode": 0 },
      locationiq: { geocode: 0.5, directions: 0, autocomplete: 0.5, "reverse-geocode": 0.5 },
    };

    const costEstimates: Record<string, number> = {};
    for (const [prov, endpoints] of Object.entries(monthlyByProvider)) {
      let cost = 0;
      const provCosts = COST_PER_1K[prov] ?? {};
      for (const [ep, cnt] of Object.entries(endpoints)) {
        cost += ((provCosts[ep] ?? 0) * cnt) / 1000;
      }
      costEstimates[prov] = Math.round(cost * 100) / 100;
    }

    sendSuccess(res, {
      dailyChart,
      monthlyByProvider,
      costEstimates,
      totalRows: rows.length,
    });
  } catch (e: unknown) {
    sendError(res, (e as Error | null)?.message ?? "Failed to fetch usage data", 500);
  }
}

/* ── POST /cache/clear
   Flushes the in-process reverse-geocode LRU cache.
   ── */
async function handleMapsCacheClear(
  _req: import("express").Request,
  res: import("express").Response
): Promise<void> {
  const before = _revGeoCache.size;
  _revGeoCache.clear();
  sendSuccess(res, { cleared: before, cacheSize: 0 });
}

/* Register on the main maps router: /api/maps/admin/* */
router.post("/admin/test", adminAuth, handleMapsTest);
router.get("/admin/usage", adminAuth, handleMapsUsage);
router.post("/admin/cache/clear", adminAuth, handleMapsCacheClear);

/* Register on the dedicated admin sub-router: /api/admin/maps/* */
adminMapsRouter.post("/test", adminAuth, handleMapsTest);
adminMapsRouter.get("/usage", adminAuth, handleMapsUsage);
adminMapsRouter.post("/cache/clear", adminAuth, handleMapsCacheClear);

router.get("/default-center", async (_req, res, _next) => {
  try {
    const s = (await getCachedSettings()) as Record<string, string>;
    sendSuccess(res, {
      lat: parseFloat(s["brand_map_center_lat"] ?? "34.37"),
      lng: parseFloat(s["brand_map_center_lng"] ?? "73.47"),
      label: s["brand_map_center_label"] ?? "Muzaffarabad",
    });
  } catch (_e) {
    sendSuccess(res, { lat: 34.37, lng: 73.47, label: "Muzaffarabad" });
  }
});

/* ── GET /maps/popular-cities — Public list of city names for profile/registration forms ──
   Returns active popular locations from the admin-managed table.
   Falls back to a hardcoded AJK city list if the DB query fails. */
const FALLBACK_CITIES = [
  "Muzaffarabad",
  "Mirpur",
  "Rawalakot",
  "Bagh",
  "Kotli",
  "Bhimber",
  "Jhelum",
  "Rawalpindi",
  "Islamabad",
  "Other",
];
router.get("/popular-cities", async (_req, res, _next) => {
  try {
    const rows = await db
      .select({ name: popularLocationsTable.name })
      .from(popularLocationsTable)
      .where(eq(popularLocationsTable.isActive, true))
      .orderBy(asc(popularLocationsTable.sortOrder));
    const cities = rows.length > 0 ? rows.map((r) => r.name).filter(Boolean) : FALLBACK_CITIES;
    sendSuccess(res, { cities });
  } catch {
    sendSuccess(res, { cities: FALLBACK_CITIES });
  }
});

export default router;
