import { db } from "@workspace/db";
import { weatherConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendSuccess, sendValidationError } from "../../lib/response.js";
import { addAuditEntry, getClientIp, type AdminRequest } from "../admin-shared.js";

const router = Router();

async function getOrCreateConfig() {
  const [existing] = await db
    .select()
    .from(weatherConfigTable)
    .where(eq(weatherConfigTable.id, "default"))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(weatherConfigTable).values({ id: "default" }).returning();
  return created;
}

router.get("/", async (_req, res) => {
  try {
    const config = await getOrCreateConfig();
    sendSuccess(res, { config });
  } catch (_err: unknown) {
    sendError(res, "Failed to load weather config", 500);
  }
});

router.patch("/", async (req, res) => {
  try {
    const { widgetEnabled, cities } = req.body;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof widgetEnabled === "boolean") update.widgetEnabled = widgetEnabled;
    if (typeof cities === "string") update.cities = cities;
    if (Array.isArray(cities)) update.cities = cities.join(",");

    await getOrCreateConfig();
    const [updated] = await db
      .update(weatherConfigTable)
      .set(update)
      .where(eq(weatherConfigTable.id, "default"))
      .returning();

    void addAuditEntry({
      action: "weather_config_update",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Updated weather config: enabled=${updated?.widgetEnabled}, cities=${updated?.cities}`,
      result: "success",
    });
    sendSuccess(res, { config: updated });
  } catch (_err: unknown) {
    sendError(res, "Failed to update weather config", 500);
  }
});

/**
 * POST /api/admin/weather-config/test
 * Verify the weather provider (Open-Meteo) is reachable for a given city or
 * the first configured city.  No API key required.
 */
router.post("/test", async (req, res) => {
  const start = Date.now();
  let city: string | undefined = (req.body?.city as string | undefined)?.trim();
  if (!city) {
    const cfg = await getOrCreateConfig();
    city = (cfg.cities ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)[0];
  }
  if (!city) {
    sendValidationError(res, "No city to test — add one or pass { city }");
    return;
  }

  try {
    // 1) geocode the city name → lat/lon via Open-Meteo's free geocoding API
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const geoResp = await fetch(geoUrl);
    if (!geoResp.ok) {
      sendValidationError(res, `Geocoding API returned HTTP ${geoResp.status}`);
      return;
    }
    const geo = (await geoResp.json()) as {
      results?: Array<{ latitude: number; longitude: number; name?: string; country?: string }>;
    };
    const place = geo.results?.[0];
    if (place?.latitude == null || place?.longitude == null) {
      sendValidationError(res, `City "${city}" not found in geocoder`);
      return;
    }

    // 2) fetch current conditions
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code`;
    const wxResp = await fetch(wxUrl);
    if (!wxResp.ok) {
      sendValidationError(res, `Forecast API returned HTTP ${wxResp.status}`);
      return;
    }
    const wx = (await wxResp.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = wx.current?.temperature_2m;
    const latencyMs = Date.now() - start;
    sendSuccess(res, {
      ok: true,
      city,
      latitude: place.latitude,
      longitude: place.longitude,
      country: place.country,
      temperatureC: temp,
      latencyMs,
      message: `Open-Meteo OK — ${city} is currently ${temp}°C (${latencyMs}ms)`,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Weather provider test failed", 500);
  }
});

export default router;
