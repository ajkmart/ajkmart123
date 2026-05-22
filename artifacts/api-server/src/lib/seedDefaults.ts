import { db, popularLocationsTable, rideServiceTypesTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { logger } from "./logger.js";

/* ── DEFAULT RIDE SERVICES ───────────────────────────────────────────────── */

const DEFAULT_RIDE_SERVICES = [
  { id: "bike", name: "Bike", icon: "bicycle-outline", baseFare: "30", perKm: "10" },
  { id: "car", name: "Car", icon: "car-outline", baseFare: "80", perKm: "20" },
  { id: "rickshaw", name: "Rickshaw", icon: "car-sport-outline", baseFare: "50", perKm: "12" },
];

/* ── DEFAULT POPULAR LOCATIONS ───────────────────────────────────────────── */

const DEFAULT_LOCATIONS = [
  {
    name: "Muzaffarabad Chowk",
    nameUrdu: "مظفرآباد چوک",
    lat: 34.3697,
    lng: 73.4716,
    category: "chowk",
    icon: "🏙️",
    sortOrder: 1,
  },
  {
    name: "Kohala Bridge",
    nameUrdu: "کوہالہ پل",
    lat: 34.2021,
    lng: 73.3791,
    category: "landmark",
    icon: "🌉",
    sortOrder: 2,
  },
  {
    name: "Mirpur City Centre",
    nameUrdu: "میرپور سٹی سینٹر",
    lat: 33.1413,
    lng: 73.7508,
    category: "chowk",
    icon: "🏙️",
    sortOrder: 3,
  },
  {
    name: "Rawalakot Bazar",
    nameUrdu: "راولاکوٹ بازار",
    lat: 33.8572,
    lng: 73.7613,
    category: "bazar",
    icon: "🛍️",
    sortOrder: 4,
  },
  {
    name: "Bagh City",
    nameUrdu: "باغ شہر",
    lat: 33.9732,
    lng: 73.7729,
    category: "general",
    icon: "🌆",
    sortOrder: 5,
  },
  {
    name: "Kotli Main Chowk",
    nameUrdu: "کوٹلی مین چوک",
    lat: 33.5152,
    lng: 73.9019,
    category: "chowk",
    icon: "🏙️",
    sortOrder: 6,
  },
  {
    name: "Poonch City",
    nameUrdu: "پونچھ شہر",
    lat: 33.77,
    lng: 74.0954,
    category: "general",
    icon: "🌆",
    sortOrder: 7,
  },
  {
    name: "Neelum Valley",
    nameUrdu: "نیلم ویلی",
    lat: 34.5689,
    lng: 73.8765,
    category: "landmark",
    icon: "🏔️",
    sortOrder: 8,
  },
  {
    name: "AJK University",
    nameUrdu: "یونیورسٹی آف آزاد کشمیر",
    lat: 34.3601,
    lng: 73.5088,
    category: "school",
    icon: "🎓",
    sortOrder: 9,
  },
  {
    name: "District Headquarters Hospital",
    nameUrdu: "ضلعی ہیڈکوارٹر ہسپتال",
    lat: 34.3712,
    lng: 73.473,
    category: "hospital",
    icon: "🏥",
    sortOrder: 10,
  },
  {
    name: "Muzaffarabad Bus Stand",
    nameUrdu: "مظفرآباد بس اڈہ",
    lat: 34.3664,
    lng: 73.4726,
    category: "landmark",
    icon: "🚏",
    sortOrder: 11,
  },
  {
    name: "Hattian Bala",
    nameUrdu: "ہٹیاں بالا",
    lat: 34.0949,
    lng: 73.8185,
    category: "general",
    icon: "🌆",
    sortOrder: 12,
  },
];

/* ── SEED GUARDS ─────────────────────────────────────────────────────────── */

let _rideServicesSeedInProgress = false;
let _locationsSeedInProgress = false;

export async function ensureDefaultRideServices(): Promise<void> {
  if (_rideServicesSeedInProgress) return;
  _rideServicesSeedInProgress = true;
  try {
    const [row] = await db.select({ c: count() }).from(rideServiceTypesTable);
    if ((row?.c ?? 0) > 0) return;
    await db
      .insert(rideServiceTypesTable)
      .values(
        DEFAULT_RIDE_SERVICES.map((s, idx) => ({
          id: `svc_${s.id}`,
          key: s.id,
          name: s.name,
          icon: s.icon,
          baseFare: s.baseFare,
          perKm: s.perKm,
          minFare: "50",
          isEnabled: true,
          isCustom: false,
          allowBargaining: true,
          sortOrder: idx + 1,
        }))
      )
      .onConflictDoNothing();
  } catch (err) {
    logger.error({ err }, "[seedDefaults] ensureDefaultRideServices failed");
  } finally {
    _rideServicesSeedInProgress = false;
  }
}

export async function ensureDefaultLocations(): Promise<void> {
  if (_locationsSeedInProgress) return;
  _locationsSeedInProgress = true;
  try {
    const [row] = await db.select({ c: count() }).from(popularLocationsTable);
    if ((row?.c ?? 0) > 0) return;
    await db
      .insert(popularLocationsTable)
      .values(
        DEFAULT_LOCATIONS.map((l) => ({
          id: `loc_${l.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
          name: l.name,
          nameUrdu: l.nameUrdu,
          lat: l.lat.toFixed(6),
          lng: l.lng.toFixed(6),
          category: l.category,
          icon: l.icon,
          isActive: true,
          sortOrder: l.sortOrder,
        }))
      )
      .onConflictDoNothing();
  } catch (err) {
    logger.error({ err }, "[seedDefaults] ensureDefaultLocations failed");
  } finally {
    _locationsSeedInProgress = false;
  }
}
