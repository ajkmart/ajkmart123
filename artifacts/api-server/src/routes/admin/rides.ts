import { db } from "@workspace/db";
import {
  liveLocationsTable,
  locationLogsTable,
  ordersTable,
  popularLocationsTable,
  rideBidsTable,
  rideEventLogsTable,
  rideNotifiedRidersTable,
  riderProfilesTable,
  rideServiceTypesTable,
  ridesTable,
  schoolRoutesTable,
  schoolSubscriptionsTable,
  usersTable,
  vendorProfilesTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { and, asc, count, desc, eq, gte, lte, or, sql, sum } from "drizzle-orm";
import { Router } from "express";
import { emitRideDispatchUpdate } from "../../lib/socketio.js";
import {
  addAuditEntry,
  ensureDefaultRideServices,
  formatSvc,
  generateId,
  getClientIp,
  getPlatformSettings,
  getUserLanguage,
  logger,
  RIDE_NOTIF_KEYS,
  sendUserNotification,
  t,
  type AdminRequest,
} from "../admin-shared.js";

const router = Router();
router.get("/rides", async (_req, res) => {
  const rides = await db.select().from(ridesTable).orderBy(desc(ridesTable.createdAt)).limit(200);
  res.json({
    rides: rides.map((r) => ({
      ...r,
      fare: parseFloat(r.fare),
      distance: parseFloat(r.distance),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total: rides.length,
  });
});

router.patch("/rides/:id/status", async (req, res) => {
  const { status, riderName, riderPhone } = req.body;
  const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
  if (riderName) updateData.riderName = riderName;
  if (riderPhone) updateData.riderPhone = riderPhone;

  const [ride] = await db
    .update(ridesTable)
    .set(updateData)
    .where(eq(ridesTable.id, req.params["id"] as string))
    .returning();
  if (!ride) {
    res.status(404).json({ error: "Ride not found" });
    return;
  }

  const rideNotifKeys = RIDE_NOTIF_KEYS[status];
  if (rideNotifKeys) {
    const rideUserLang = await getUserLanguage(ride.userId);
    await sendUserNotification(
      ride.userId,
      t(rideNotifKeys.titleKey, rideUserLang),
      t(rideNotifKeys.bodyKey, rideUserLang),
      "ride",
      rideNotifKeys.icon
    );
  }

  // NOTE: Wallet already debited at ride booking (rides.ts).
  // On completion, credit rider's earnings share.
  if (status === "completed") {
    const fare = parseFloat(ride.fare);
    const s = await getPlatformSettings();
    const riderKeepPct = parseFloat(s["rider_keep_pct"] ?? "80") / 100;
    const riderEarning = parseFloat((fare * riderKeepPct).toFixed(2));
    if (ride.riderId) {
      /* Atomic credit — uses sql`wallet_balance + X` to avoid clobbering
         concurrent balance changes (same pattern as all other wallet mutations) */
      await db
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${riderEarning}`, updatedAt: new Date() })
        .where(eq(usersTable.id, ride.riderId));
      await db.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: ride.riderId,
        type: "credit",
        amount: String(riderEarning),
        description: `Ride earnings — #${ride.id.slice(-6).toUpperCase()} (${Math.round(riderKeepPct * 100)}%)`,
      });
      const riderLang = await getUserLanguage(ride.riderId);
      await sendUserNotification(
        ride.riderId,
        t("notifRidePaymentReceived", riderLang),
        t("notifRidePaymentReceivedBody", riderLang).replace("{amount}", String(riderEarning)),
        "ride",
        "wallet-outline"
      );
    }
  }

  // Wallet refund on admin cancellation (atomic)
  if (status === "cancelled" && ride.paymentMethod === "wallet") {
    const refundAmt = parseFloat(ride.fare);
    await db
      .transaction(async (tx) => {
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: new Date() })
          .where(eq(usersTable.id, ride.userId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: ride.userId,
          type: "credit",
          amount: refundAmt.toFixed(2),
          description: `Refund — Ride #${ride.id.slice(-6).toUpperCase()} cancelled by admin`,
        });
      })
      .catch((e: Error) => {
        logger.error(
          { err: e.message, rideId: ride.id, userId: ride.userId, refundAmt },
          "[admin] wallet refund transaction failed on ride cancellation — manual refund required"
        );
      });
    await sendUserNotification(
      ride.userId,
      "Ride Refund 💰",
      `Rs. ${refundAmt.toFixed(0)} aapki wallet mein refund ho gaya.`,
      "ride",
      "wallet-outline"
    );
  }

  res.json({ ...ride, fare: parseFloat(ride.fare), distance: parseFloat(ride.distance) });
});
router.get("/ride-services", async (_req, res) => {
  await ensureDefaultRideServices();
  const services = await db
    .select()
    .from(rideServiceTypesTable)
    .orderBy(asc(rideServiceTypesTable.sortOrder));
  res.json({ services: services.map(formatSvc) });
});

/* POST /admin/ride-services — create custom service */
router.post("/ride-services", async (req, res) => {
  const {
    key,
    name,
    nameUrdu,
    icon,
    description,
    color,
    baseFare,
    perKm,
    minFare,
    maxPassengers,
    allowBargaining,
    sortOrder,
  } = req.body;
  if (!key || !name || !icon) {
    res.status(400).json({ error: "key, name, icon are required" });
    return;
  }
  const existing = await db
    .select({ id: rideServiceTypesTable.id })
    .from(rideServiceTypesTable)
    .where(eq(rideServiceTypesTable.key, String(key)))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: `Service key "${key}" already exists` });
    return;
  }
  const [created] = await db
    .insert(rideServiceTypesTable)
    .values({
      id: `svc_${generateId()}`,
      key: String(key).toLowerCase().replace(/\s+/g, "_"),
      name: String(name),
      nameUrdu: nameUrdu || null,
      icon: String(icon),
      description: description || null,
      color: color || "#6B7280",
      isEnabled: true,
      isCustom: true,
      baseFare: String(baseFare ?? 15),
      perKm: String(perKm ?? 8),
      minFare: String(minFare ?? 50),
      maxPassengers: Number(maxPassengers ?? 1),
      allowBargaining: allowBargaining !== false,
      sortOrder: Number(sortOrder ?? 99),
    })
    .returning();
  res.status(201).json({ success: true, service: formatSvc(created) });
});

/* PATCH /admin/ride-services/:id — update any field */
router.patch("/ride-services/:id", async (req, res) => {
  const svcId = req.params["id"] as string;
  const [existing] = await db
    .select()
    .from(rideServiceTypesTable)
    .where(eq(rideServiceTypesTable.id, svcId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const {
    name,
    nameUrdu,
    icon,
    description,
    color,
    isEnabled,
    baseFare,
    perKm,
    minFare,
    maxPassengers,
    allowBargaining,
    sortOrder,
  } = req.body;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch["name"] = String(name);
  if (nameUrdu !== undefined) patch["nameUrdu"] = nameUrdu;
  if (icon !== undefined) patch["icon"] = String(icon);
  if (description !== undefined) patch["description"] = description;
  if (color !== undefined) patch["color"] = String(color);
  if (isEnabled !== undefined) patch["isEnabled"] = Boolean(isEnabled);
  if (baseFare !== undefined) patch["baseFare"] = String(baseFare);
  if (perKm !== undefined) patch["perKm"] = String(perKm);
  if (minFare !== undefined) patch["minFare"] = String(minFare);
  if (maxPassengers !== undefined) patch["maxPassengers"] = Number(maxPassengers);
  if (allowBargaining !== undefined) patch["allowBargaining"] = Boolean(allowBargaining);
  if (sortOrder !== undefined) patch["sortOrder"] = Number(sortOrder);
  const [updated] = await db
    .update(rideServiceTypesTable)
    .set(patch as Partial<typeof rideServiceTypesTable.$inferInsert>)
    .where(eq(rideServiceTypesTable.id, svcId))
    .returning();
  res.json({ success: true, service: formatSvc(updated) });
});

/* DELETE /admin/ride-services/:id — only custom services */
router.delete("/ride-services/:id", async (req, res) => {
  const svcId = req.params["id"] as string;
  const [existing] = await db
    .select()
    .from(rideServiceTypesTable)
    .where(eq(rideServiceTypesTable.id, svcId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  if (!existing.isCustom) {
    res.status(400).json({ error: "Built-in services cannot be deleted. Disable them instead." });
    return;
  }
  await db.delete(rideServiceTypesTable).where(eq(rideServiceTypesTable.id, svcId));
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════
   POPULAR LOCATIONS — Admin CRUD
   GET  /admin/locations
   POST /admin/locations
   PATCH /admin/locations/:id
   DELETE /admin/locations/:id
══════════════════════════════════════════════════════ */

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

export async function ensureDefaultLocations() {
  const existing = await db.select({ c: count() }).from(popularLocationsTable);
  if ((existing[0]?.c ?? 0) === 0) {
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
  }
}

router.get("/locations", async (_req, res) => {
  await ensureDefaultLocations();
  const locs = await db
    .select()
    .from(popularLocationsTable)
    .orderBy(asc(popularLocationsTable.sortOrder), asc(popularLocationsTable.name));
  res.json({
    locations: locs.map((l) => ({
      ...l,
      lat: parseFloat(String(l.lat)),
      lng: parseFloat(String(l.lng)),
    })),
  });
});

router.post("/locations", async (req, res) => {
  const {
    name,
    nameUrdu,
    lat,
    lng,
    category = "general",
    icon = "📍",
    isActive = true,
    sortOrder = 0,
  } = req.body;
  if (!name || !lat || !lng) {
    res.status(400).json({ error: "name, lat, lng required" });
    return;
  }
  const [loc] = await db
    .insert(popularLocationsTable)
    .values({
      id: generateId(),
      name,
      nameUrdu: nameUrdu || null,
      lat: String(lat),
      lng: String(lng),
      category,
      icon,
      isActive: Boolean(isActive),
      sortOrder: Number(sortOrder),
    })
    .returning();
  res
    .status(201)
    .json({ ...loc, lat: parseFloat(String(loc!.lat)), lng: parseFloat(String(loc!.lng)) });
});

router.patch("/locations/:id", async (req, res) => {
  const { name, nameUrdu, lat, lng, category, icon, isActive, sortOrder } = req.body;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch.name = name;
  if (nameUrdu !== undefined) patch.nameUrdu = nameUrdu || null;
  if (lat !== undefined) patch.lat = String(lat);
  if (lng !== undefined) patch.lng = String(lng);
  if (category !== undefined) patch.category = category;
  if (icon !== undefined) patch.icon = icon;
  if (isActive !== undefined) patch.isActive = Boolean(isActive);
  if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder);
  const [updated] = await db
    .update(popularLocationsTable)
    .set(patch)
    .where(eq(popularLocationsTable.id, req.params["id"] as string))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  res.json({
    ...updated,
    lat: parseFloat(String(updated.lat)),
    lng: parseFloat(String(updated.lng)),
  });
});

router.delete("/locations/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: popularLocationsTable.id })
    .from(popularLocationsTable)
    .where(eq(popularLocationsTable.id, req.params["id"] as string))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  await db
    .delete(popularLocationsTable)
    .where(eq(popularLocationsTable.id, req.params["id"] as string));
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════
   SCHOOL ROUTES — Admin CRUD + Subscriptions view
   GET  /admin/school-routes
   POST /admin/school-routes
   PATCH /admin/school-routes/:id
   DELETE /admin/school-routes/:id
   GET  /admin/school-subscriptions
══════════════════════════════════════════════════════ */

function fmtRoute(r: Record<string, unknown>) {
  return {
    ...r,
    monthlyPrice: parseFloat(String(r.monthlyPrice ?? "0")),
    fromLat: r.fromLat ? parseFloat(String(r.fromLat)) : null,
    fromLng: r.fromLng ? parseFloat(String(r.fromLng)) : null,
    toLat: r.toLat ? parseFloat(String(r.toLat)) : null,
    toLng: r.toLng ? parseFloat(String(r.toLng)) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

router.get("/school-routes", async (_req, res) => {
  const routes = await db
    .select()
    .from(schoolRoutesTable)
    .orderBy(asc(schoolRoutesTable.sortOrder), asc(schoolRoutesTable.schoolName));
  res.json({ routes: routes.map(fmtRoute) });
});

router.post("/school-routes", async (req, res) => {
  const {
    routeName,
    schoolName,
    schoolNameUrdu,
    fromArea,
    fromAreaUrdu,
    toAddress,
    fromLat,
    fromLng,
    toLat,
    toLng,
    monthlyPrice,
    morningTime,
    afternoonTime,
    capacity = 30,
    vehicleType = "school_shift",
    notes,
    isActive = true,
    sortOrder = 0,
  } = req.body;
  if (!routeName || !schoolName || !fromArea || !toAddress || !monthlyPrice) {
    res
      .status(400)
      .json({ error: "routeName, schoolName, fromArea, toAddress, monthlyPrice required" });
    return;
  }
  const [route] = await db
    .insert(schoolRoutesTable)
    .values({
      id: generateId(),
      routeName,
      schoolName,
      schoolNameUrdu: schoolNameUrdu || null,
      fromArea,
      fromAreaUrdu: fromAreaUrdu || null,
      toAddress,
      fromLat: fromLat ? String(fromLat) : null,
      fromLng: fromLng ? String(fromLng) : null,
      toLat: toLat ? String(toLat) : null,
      toLng: toLng ? String(toLng) : null,
      monthlyPrice: String(parseFloat(monthlyPrice)),
      morningTime: morningTime || "7:30 AM",
      afternoonTime: afternoonTime || null,
      capacity: Number(capacity),
      enrolledCount: 0,
      vehicleType,
      notes: notes || null,
      isActive: Boolean(isActive),
      sortOrder: Number(sortOrder),
    })
    .returning();
  res.status(201).json(fmtRoute(route!));
});

router.patch("/school-routes/:id", async (req, res) => {
  const routeId = req.params["id"] as string;
  const {
    routeName,
    schoolName,
    schoolNameUrdu,
    fromArea,
    fromAreaUrdu,
    toAddress,
    fromLat,
    fromLng,
    toLat,
    toLng,
    monthlyPrice,
    morningTime,
    afternoonTime,
    capacity,
    vehicleType,
    notes,
    isActive,
    sortOrder,
  } = req.body;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (routeName !== undefined) patch.routeName = routeName;
  if (schoolName !== undefined) patch.schoolName = schoolName;
  if (schoolNameUrdu !== undefined) patch.schoolNameUrdu = schoolNameUrdu || null;
  if (fromArea !== undefined) patch.fromArea = fromArea;
  if (fromAreaUrdu !== undefined) patch.fromAreaUrdu = fromAreaUrdu || null;
  if (toAddress !== undefined) patch.toAddress = toAddress;
  if (fromLat !== undefined) patch.fromLat = fromLat ? String(fromLat) : null;
  if (fromLng !== undefined) patch.fromLng = fromLng ? String(fromLng) : null;
  if (toLat !== undefined) patch.toLat = toLat ? String(toLat) : null;
  if (toLng !== undefined) patch.toLng = toLng ? String(toLng) : null;
  if (monthlyPrice !== undefined) patch.monthlyPrice = String(parseFloat(monthlyPrice));
  if (morningTime !== undefined) patch.morningTime = morningTime;
  if (afternoonTime !== undefined) patch.afternoonTime = afternoonTime || null;
  if (capacity !== undefined) patch.capacity = Number(capacity);
  if (vehicleType !== undefined) patch.vehicleType = vehicleType;
  if (notes !== undefined) patch.notes = notes || null;
  if (isActive !== undefined) patch.isActive = Boolean(isActive);
  if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder);
  const [updated] = await db
    .update(schoolRoutesTable)
    .set(patch)
    .where(eq(schoolRoutesTable.id, routeId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Route not found" });
    return;
  }
  res.json(fmtRoute(updated));
});

router.delete("/school-routes/:id", async (req, res) => {
  const routeId = req.params["id"] as string;
  /* Only delete if no active subscriptions */
  const [activeSub] = await db
    .select({ id: schoolSubscriptionsTable.id })
    .from(schoolSubscriptionsTable)
    .where(
      and(
        eq(schoolSubscriptionsTable.routeId, routeId),
        eq(schoolSubscriptionsTable.status, "active")
      )
    )
    .limit(1);
  if (activeSub) {
    res
      .status(409)
      .json({ error: "Cannot delete route with active subscriptions. Disable it instead." });
    return;
  }
  const [existing] = await db
    .select({ id: schoolRoutesTable.id })
    .from(schoolRoutesTable)
    .where(eq(schoolRoutesTable.id, routeId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Route not found" });
    return;
  }
  await db.delete(schoolRoutesTable).where(eq(schoolRoutesTable.id, routeId));
  res.json({ success: true });
});

router.get("/school-subscriptions", async (req, res) => {
  const routeIdFilter = req.query["routeId"] as string | undefined;
  const query = routeIdFilter
    ? db
        .select()
        .from(schoolSubscriptionsTable)
        .where(eq(schoolSubscriptionsTable.routeId, routeIdFilter))
    : db.select().from(schoolSubscriptionsTable);
  const subs = await query.orderBy(desc(schoolSubscriptionsTable.createdAt));
  /* Enrich with user info */
  const enriched = await Promise.all(
    subs.map(async (sub) => {
      const [user] = await db
        .select({ name: usersTable.name, phone: usersTable.phone })
        .from(usersTable)
        .where(eq(usersTable.id, sub.userId))
        .limit(1);
      const [route] = await db
        .select({
          routeName: schoolRoutesTable.routeName,
          schoolName: schoolRoutesTable.schoolName,
        })
        .from(schoolRoutesTable)
        .where(eq(schoolRoutesTable.id, sub.routeId))
        .limit(1);
      return {
        ...sub,
        monthlyAmount: parseFloat(String(sub.monthlyAmount ?? "0")),
        userName: user?.name || null,
        userPhone: user?.phone || null,
        routeName: route?.routeName || null,
        schoolName: route?.schoolName || null,
        startDate: sub.startDate instanceof Date ? sub.startDate.toISOString() : sub.startDate,
        nextBillingDate:
          sub.nextBillingDate instanceof Date
            ? sub.nextBillingDate.toISOString()
            : sub.nextBillingDate,
        createdAt: sub.createdAt instanceof Date ? sub.createdAt.toISOString() : sub.createdAt,
      };
    })
  );
  res.json({ subscriptions: enriched, total: enriched.length });
});

/* ══════════════════════════════════════════════════════════
   GET /admin/live-riders
   Returns all riders who have recently sent GPS updates,
   enriched with their name, phone and online status.
   "Fresh" = updated within last 5 minutes.
══════════════════════════════════════════════════════════ */
router.get("/live-riders", async (_req, res) => {
  const settings = await getPlatformSettings();
  const staleTimeoutSec = parseInt(settings["gps_stale_timeout_sec"] ?? "300", 10);
  const STALE_MS = staleTimeoutSec * 1000;
  const cutoff = new Date(Date.now() - STALE_MS);

  /* Single JOIN query — eliminates N+1 per-rider lookups */
  const locs = await db
    .select({
      userId: liveLocationsTable.userId,
      latitude: liveLocationsTable.latitude,
      longitude: liveLocationsTable.longitude,
      action: liveLocationsTable.action,
      updatedAt: liveLocationsTable.updatedAt,
      batteryLevel: liveLocationsTable.batteryLevel,
      lastSeen: liveLocationsTable.lastSeen,
      onlineSince: liveLocationsTable.onlineSince,
      name: usersTable.name,
      phone: usersTable.phone,
      isOnline: usersTable.isOnline,
      vehicleType: riderProfilesTable.vehicleType,
      city: usersTable.city,
      role: usersTable.roles,
    })
    .from(liveLocationsTable)
    .leftJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
    .leftJoin(riderProfilesTable, eq(liveLocationsTable.userId, riderProfilesTable.userId))
    .where(
      or(eq(liveLocationsTable.role, "rider"), eq(liveLocationsTable.role, "service_provider"))
    );

  const enriched = locs.map((loc) => {
    const updatedAt = loc.updatedAt instanceof Date ? loc.updatedAt : new Date(loc.updatedAt);
    const ageSeconds = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
    const isFresh = updatedAt >= cutoff;
    return {
      userId: loc.userId,
      name: loc.name ?? "Unknown Rider",
      phone: loc.phone ?? null,
      isOnline: loc.isOnline ?? false,
      vehicleType: loc.vehicleType ?? null,
      city: loc.city ?? null,
      role: loc.role ?? "rider",
      batteryLevel: loc.batteryLevel ?? null,
      lastSeen: loc.lastSeen instanceof Date ? loc.lastSeen.toISOString() : (loc.lastSeen ?? null),
      onlineSince:
        loc.onlineSince instanceof Date ? loc.onlineSince.toISOString() : (loc.onlineSince ?? null),
      lat: parseFloat(String(loc.latitude)),
      lng: parseFloat(String(loc.longitude)),
      action: loc.action ?? null,
      updatedAt: updatedAt.toISOString(),
      ageSeconds,
      isFresh,
    };
  });

  /* Sort: online first, then by freshness */
  enriched.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return a.ageSeconds - b.ageSeconds;
  });

  res.json({
    riders: enriched,
    total: enriched.length,
    freshCount: enriched.filter((r) => r.isFresh).length,
    staleTimeoutSec,
  });
});

/* ══════════════════════════════════════════════════════════
   GET /admin/customer-locations
   Returns customers who sent a GPS update (ride booking or
   order placement). Shows their identity + last position.
   "Fresh" = updated within last 2 hours.
══════════════════════════════════════════════════════════ */
router.get("/customer-locations", async (_req, res) => {
  const STALE_MS = 2 * 60 * 60 * 1000; /* 2 hours */
  const cutoff = new Date(Date.now() - STALE_MS);

  /* Single JOIN query — eliminates N+1 per-customer lookups */
  const locs = await db
    .select({
      userId: liveLocationsTable.userId,
      latitude: liveLocationsTable.latitude,
      longitude: liveLocationsTable.longitude,
      action: liveLocationsTable.action,
      updatedAt: liveLocationsTable.updatedAt,
      name: usersTable.name,
      phone: usersTable.phone,
      email: usersTable.email,
    })
    .from(liveLocationsTable)
    .leftJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
    .where(eq(liveLocationsTable.role, "customer"))
    .orderBy(desc(liveLocationsTable.updatedAt));

  const enriched = locs.map((loc) => {
    const updatedAt =
      loc.updatedAt instanceof Date ? loc.updatedAt : new Date(loc.updatedAt as string);
    const ageSeconds = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
    const isFresh = updatedAt >= cutoff;
    return {
      userId: loc.userId,
      name: loc.name ?? "Unknown User",
      phone: loc.phone ?? null,
      email: loc.email ?? null,
      lat: parseFloat(String(loc.latitude)),
      lng: parseFloat(String(loc.longitude)),
      action: loc.action ?? null,
      updatedAt: updatedAt.toISOString(),
      ageSeconds,
      isFresh,
    };
  });

  res.json({
    customers: enriched,
    total: enriched.length,
    freshCount: enriched.filter((c) => c.isFresh).length,
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /admin/search?q=query
   Global search across users, rides, orders, pharmacy, parcels
   Returns max 5 results per category, sorted by relevance (recency)
══════════════════════════════════════════════════════════════════════════════ */
router.patch("/riders/:id/online", async (req, res) => {
  const { isOnline } = req.body as { isOnline: boolean };
  const [rider] = await db
    .update(usersTable)
    .set({ isOnline, updatedAt: new Date() })
    .where(eq(usersTable.id, req.params["id"] as string))
    .returning();
  if (!rider) {
    res.status(404).json({ error: "Rider not found" });
    return;
  }
  void addAuditEntry({
    action: "rider_online_toggle",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Rider ${req.params["id"] as string} set ${isOnline ? "online" : "offline"} by admin`,
    result: "success",
  });
  res.json({ success: true, isOnline });
});

/* ── GET /admin/revenue-trend — 7-day rolling revenue for dashboard sparkline ── */
router.get("/revenue-trend", async (_req, res) => {
  const days: { date: string; revenue: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const from = new Date(d);
    from.setHours(0, 0, 0, 0);
    const to = new Date(d);
    to.setHours(23, 59, 59, 999);
    const [row] = await db
      .select({ total: sum(ordersTable.total) })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.status, "delivered"),
          gte(ordersTable.createdAt, from),
          lte(ordersTable.createdAt, to)
        )
      );
    const [rideRow] = await db
      .select({ total: sum(ridesTable.fare) })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.status, "completed"),
          gte(ridesTable.createdAt, from),
          lte(ridesTable.createdAt, to)
        )
      );
    days.push({
      date: d.toISOString().slice(0, 10),
      revenue: parseFloat(row?.total ?? "0") + parseFloat(rideRow?.total ?? "0"),
    });
  }
  res.json({ trend: days });
});

/* ── GET /admin/leaderboard — top-5 vendors and riders ── */
router.get("/leaderboard", async (_req, res) => {
  const vendors = await db
    .select({
      id: usersTable.id,
      name: vendorProfilesTable.storeName,
      phone: usersTable.phone,
      totalOrders: sql<number>`count(${ordersTable.id})`,
      totalRevenue: sql<number>`coalesce(sum(${ordersTable.total}),0)`,
    })
    .from(usersTable)
    .leftJoin(vendorProfilesTable, eq(usersTable.id, vendorProfilesTable.userId))
    .leftJoin(
      ordersTable,
      and(eq(ordersTable.vendorId, usersTable.id), eq(ordersTable.status, "delivered"))
    )
    .where(eq(usersTable.roles, "vendor"))
    .groupBy(usersTable.id, vendorProfilesTable.storeName)
    .orderBy(sql`coalesce(sum(${ordersTable.total}),0) desc`)
    .limit(5);

  const riders = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      completedTrips: sql<number>`count(${ridesTable.id})`,
      totalEarned: sql<number>`coalesce(sum(${ridesTable.fare}),0)`,
    })
    .from(usersTable)
    .leftJoin(
      ridesTable,
      and(eq(ridesTable.riderId, usersTable.id), eq(ridesTable.status, "completed"))
    )
    .where(eq(usersTable.roles, "rider"))
    .groupBy(usersTable.id)
    .orderBy(sql`count(${ridesTable.id}) desc`)
    .limit(5);

  res.json({
    vendors: vendors.map((v) => ({
      ...v,
      totalRevenue: parseFloat(String(v.totalRevenue)),
      totalOrders: Number(v.totalOrders),
    })),
    riders: riders.map((r) => ({
      ...r,
      totalEarned: parseFloat(String(r.totalEarned)),
      completedTrips: Number(r.completedTrips),
    })),
  });
});

/* ── GET /admin/dashboard-export — export current dashboard stats as JSON ── */
router.get("/dashboard-export", async (_req, res) => {
  const [userCount] = await db.select({ count: count() }).from(usersTable);
  const [orderCount] = await db.select({ count: count() }).from(ordersTable);
  const [rideCount] = await db.select({ count: count() }).from(ridesTable);
  const [revenue] = await db
    .select({ total: sum(ordersTable.total) })
    .from(ordersTable)
    .where(eq(ordersTable.status, "delivered"));
  const [rideRev] = await db
    .select({ total: sum(ridesTable.fare) })
    .from(ridesTable)
    .where(eq(ridesTable.status, "completed"));
  const snapshot = {
    exportedAt: new Date().toISOString(),
    users: userCount?.count ?? 0,
    orders: orderCount?.count ?? 0,
    rides: rideCount?.count ?? 0,
    totalRevenue: parseFloat(revenue?.total ?? "0") + parseFloat(rideRev?.total ?? "0"),
    orderRevenue: parseFloat(revenue?.total ?? "0"),
    rideRevenue: parseFloat(rideRev?.total ?? "0"),
  };
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="dashboard-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.json(snapshot);
});

/* ══════════════════════════════════════════════════════════════════════════════
   RIDE MANAGEMENT MODULE — Admin ride actions with full audit logging
══════════════════════════════════════════════════════════════════════════════ */

router.post("/rides/:id/cancel", async (req, res) => {
  const rideId = req.params["id"] as string;
  const { reason } = req.body as { reason?: string };
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) {
    res.status(404).json({ error: "Ride not found" });
    return;
  }
  if (["completed", "cancelled"].includes(ride.status)) {
    res.status(400).json({ error: `Cannot cancel a ride that is already ${ride.status}` });
    return;
  }

  const isWallet = ride.paymentMethod === "wallet";
  const refundAmt = parseFloat(ride.fare);
  let refunded = false;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(ridesTable)
        .set({ status: "cancelled", cancellationReason: reason || null, updatedAt: new Date() })
        .where(eq(ridesTable.id, rideId));

      await tx
        .update(rideBidsTable)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(and(eq(rideBidsTable.rideId, rideId), eq(rideBidsTable.status, "pending")));

      if (isWallet) {
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: new Date() })
          .where(eq(usersTable.id, ride.userId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: ride.userId,
          type: "credit",
          amount: refundAmt.toFixed(2),
          description: `Refund — Ride #${rideId.slice(-6).toUpperCase()} cancelled by admin`,
        });
        refunded = true;
      }
    });
  } catch (txErr: unknown) {
    void addAuditEntry({
      action: "ride_cancel",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Ride ${rideId} cancel failed — transaction error: ${txErr instanceof Error ? txErr.message : String(txErr)}`,
      result: "fail",
    });
    res.status(500).json({ error: "Cancellation failed: could not complete transaction" });
    return;
  }

  if (refunded) {
    await sendUserNotification(
      ride.userId,
      "Ride Cancelled & Refunded 💰",
      `Rs. ${refundAmt.toFixed(0)} refund ho gaya. ${reason ? `Reason: ${reason}` : ""}`,
      "ride",
      "wallet-outline"
    );
  } else {
    await sendUserNotification(
      ride.userId,
      "Ride Cancelled ❌",
      `Your ride has been cancelled by admin. ${reason ? `Reason: ${reason}` : ""}`,
      "ride",
      "close-circle-outline"
    );
  }

  if (ride.riderId) {
    await sendUserNotification(
      ride.riderId,
      "Ride Cancelled ❌",
      `Ride #${rideId.slice(-6).toUpperCase()} admin ne cancel ki.`,
      "ride",
      "close-circle-outline"
    );
  }

  void addAuditEntry({
    action: "ride_cancel",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Admin cancelled ride ${rideId}${reason ? ` — ${reason}` : ""}${refunded ? " (wallet refunded)" : ""}`,
    result: "success",
  });
  emitRideDispatchUpdate({ rideId, action: "cancel", status: "cancelled" });
  res.json({ success: true, rideId, refunded });
});

router.post("/rides/:id/refund", async (req, res) => {
  const rideId = req.params["id"] as string;
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) {
    res.status(404).json({ error: "Ride not found" });
    return;
  }

  const refundAmt = amount ?? parseFloat(ride.fare);
  if (refundAmt <= 0 || !isFinite(refundAmt)) {
    res.status(400).json({ error: "Invalid refund amount" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: new Date() })
        .where(eq(usersTable.id, ride.userId));
      await tx.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: ride.userId,
        type: "credit",
        amount: refundAmt.toFixed(2),
        description: `Admin refund — Ride #${rideId.slice(-6).toUpperCase()}${reason ? ` (${reason})` : ""}`,
      });
    });
  } catch (txErr: unknown) {
    void addAuditEntry({
      action: "ride_refund",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Ride ${rideId} refund failed — transaction error: ${txErr instanceof Error ? txErr.message : String(txErr)}`,
      result: "fail",
    });
    res.status(500).json({ error: "Refund failed: could not complete transaction" });
    return;
  }

  await sendUserNotification(
    ride.userId,
    "Ride Refund 💰",
    `Rs. ${refundAmt.toFixed(0)} aapki wallet mein refund ho gaya.`,
    "ride",
    "wallet-outline"
  );
  void addAuditEntry({
    action: "ride_refund",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Admin refunded Rs. ${refundAmt} for ride ${rideId}${reason ? ` — ${reason}` : ""}`,
    result: "success",
  });
  emitRideDispatchUpdate({ rideId, action: "refund", status: ride.status });
  res.json({ success: true, rideId, refundedAmount: refundAmt });
});

router.post("/rides/:id/reassign", async (req, res) => {
  const rideId = req.params["id"] as string;
  const { riderId, riderName, riderPhone } = req.body as {
    riderId?: string;
    riderName?: string;
    riderPhone?: string;
  };
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) {
    res.status(404).json({ error: "Ride not found" });
    return;
  }
  if (["completed", "cancelled"].includes(ride.status)) {
    res.status(400).json({ error: `Cannot reassign a ride that is ${ride.status}` });
    return;
  }

  if (!riderId) {
    res.status(400).json({ error: "riderId is required to reassign" });
    return;
  }

  const [riderUser] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      roles: usersTable.roles,
    })
    .from(usersTable)
    .where(eq(usersTable.id, riderId))
    .limit(1);
  if (!riderUser) {
    res.status(404).json({ error: "Rider not found" });
    return;
  }
  if (riderUser.roles !== "rider") {
    res.status(400).json({ error: "Selected user is not a rider" });
    return;
  }

  const oldRiderId = ride.riderId;
  const resolvedName = riderName || riderUser.name;
  const resolvedPhone = riderPhone || riderUser.phone;
  const updateData: Partial<typeof ridesTable.$inferInsert> = {
    riderId,
    riderName: resolvedName,
    riderPhone: resolvedPhone,
    updatedAt: new Date(),
  };
  if (!ride.riderId) updateData.status = "accepted";

  const [updated] = await db
    .update(ridesTable)
    .set(updateData)
    .where(eq(ridesTable.id, rideId))
    .returning();

  if (oldRiderId && oldRiderId !== riderId) {
    await sendUserNotification(
      oldRiderId,
      "Ride Reassigned",
      `Ride #${rideId.slice(-6).toUpperCase()} doosre rider ko assign ho gayi.`,
      "ride",
      "swap-horizontal-outline"
    );
  }
  if (riderId) {
    await sendUserNotification(
      riderId,
      "New Ride Assigned 🚗",
      `Ride #${rideId.slice(-6).toUpperCase()} aapko assign ho gayi!`,
      "ride",
      "car-outline"
    );
  }
  await sendUserNotification(
    ride.userId,
    "Rider Changed",
    `Aapki ride ka rider change ho gaya hai${resolvedName ? ` — ${resolvedName}` : ""}.`,
    "ride",
    "swap-horizontal-outline"
  );

  void addAuditEntry({
    action: "ride_reassign",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Admin reassigned ride ${rideId} from ${oldRiderId ?? "none"} to ${riderId} (${resolvedName})`,
    result: "success",
  });
  emitRideDispatchUpdate({ rideId, action: "reassign", status: updated!.status });
  res.json({
    success: true,
    ride: { ...updated, fare: parseFloat(updated!.fare), distance: parseFloat(updated!.distance) },
  });
});

router.get("/rides/:id/audit-trail", async (req, res) => {
  const rideId = req.params["id"] as string;
  const shortId = rideId.slice(-6).toUpperCase();
  const trail = (
    [] as Array<{
      action: string;
      details?: string;
      ip?: string;
      adminId?: string;
      result: string;
      timestamp: string;
    }>
  )
    .filter((e) => e.details?.includes(rideId) || e.details?.includes(shortId))
    .map((e) => ({
      action: e.action,
      details: e.details,
      ip: e.ip,
      adminId: e.adminId,
      result: e.result,
      timestamp: e.timestamp,
    }));
  trail.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json({ trail, rideId });
});

router.get("/rides/:id/detail", async (req, res) => {
  const rideId = req.params["id"] as string;
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) {
    res.status(404).json({ error: "Ride not found" });
    return;
  }

  const [customer] = await db
    .select({ name: usersTable.name, phone: usersTable.phone, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, ride.userId))
    .limit(1);
  let rider: { name: string | null; phone: string | null; email: string | null } | null = null;
  if (ride.riderId) {
    const [r] = await db
      .select({ name: usersTable.name, phone: usersTable.phone, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, ride.riderId))
      .limit(1);
    rider = r ?? null;
  }

  const eventLogs = await db
    .select()
    .from(rideEventLogsTable)
    .where(eq(rideEventLogsTable.rideId, rideId))
    .orderBy(asc(rideEventLogsTable.createdAt));

  const bidRows = await db
    .select()
    .from(rideBidsTable)
    .where(eq(rideBidsTable.rideId, rideId))
    .orderBy(desc(rideBidsTable.createdAt));

  const notifiedCount = await db
    .select({ cnt: count() })
    .from(rideNotifiedRidersTable)
    .where(eq(rideNotifiedRidersTable.rideId, rideId));

  const s = await getPlatformSettings();
  const gstEnabled = (s["finance_gst_enabled"] ?? "off") === "on";
  const gstPct = parseFloat(s["finance_gst_pct"] ?? "17");
  const surgeEnabled = (s["ride_surge_enabled"] ?? "off") === "on";
  const surgeMultiplier = surgeEnabled ? parseFloat(s["ride_surge_multiplier"] ?? "1.5") : 1;
  const fare = parseFloat(ride.fare);
  const gstAmount = gstEnabled ? parseFloat(((fare * gstPct) / (100 + gstPct)).toFixed(2)) : 0;
  const baseFare = fare - gstAmount;

  res.json({
    ride: {
      ...ride,
      fare,
      distance: parseFloat(ride.distance),
      offeredFare: ride.offeredFare ? parseFloat(ride.offeredFare) : null,
      counterFare: ride.counterFare ? parseFloat(ride.counterFare) : null,
      createdAt: ride.createdAt.toISOString(),
      updatedAt: ride.updatedAt.toISOString(),
      acceptedAt: ride.acceptedAt ? ride.acceptedAt.toISOString() : null,
      dispatchedAt: ride.dispatchedAt ? ride.dispatchedAt.toISOString() : null,
      arrivedAt: ride.arrivedAt ? ride.arrivedAt.toISOString() : null,
      startedAt: ride.startedAt ? ride.startedAt.toISOString() : null,
      completedAt: ride.completedAt ? ride.completedAt.toISOString() : null,
      cancelledAt: ride.cancelledAt ? ride.cancelledAt.toISOString() : null,
      tripOtp: ride.tripOtp ?? null,
      otpVerified: ride.otpVerified ?? false,
      isParcel: ride.isParcel ?? false,
      receiverName: ride.receiverName ?? null,
      receiverPhone: ride.receiverPhone ?? null,
      packageType: ride.packageType ?? null,
    },
    customer: customer ?? null,
    rider: rider ?? null,
    fareBreakdown: {
      baseFare,
      gstAmount,
      gstPct: gstEnabled ? gstPct : 0,
      surgeMultiplier,
      total: fare,
    },
    eventLogs: eventLogs.map((e) => ({
      ...e,
      lat: e.lat ? parseFloat(e.lat) : null,
      lng: e.lng ? parseFloat(e.lng) : null,
      createdAt: e.createdAt.toISOString(),
    })),
    bids: bidRows.map((b) => ({
      ...b,
      fare: parseFloat(b.fare),
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
    notifiedRiderCount: Number(notifiedCount[0]?.cnt ?? 0),
  });
});

router.get("/dispatch-monitor", async (_req, res) => {
  const activeRides = await db
    .select()
    .from(ridesTable)
    .where(or(eq(ridesTable.status, "searching"), eq(ridesTable.status, "bargaining")))
    .orderBy(desc(ridesTable.createdAt));

  const rideIds = activeRides.map((r) => r.id);
  let notifiedCounts: Record<string, number> = {};
  if (rideIds.length > 0) {
    const counts = await db
      .select({ rideId: rideNotifiedRidersTable.rideId, cnt: count() })
      .from(rideNotifiedRidersTable)
      .where(
        sql`${rideNotifiedRidersTable.rideId} IN (${sql.join(
          rideIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
      .groupBy(rideNotifiedRidersTable.rideId);
    notifiedCounts = Object.fromEntries(counts.map((c) => [c.rideId, Number(c.cnt)]));
  }

  const userIds = [...new Set(activeRides.map((r) => r.userId))];
  let userMap: Record<string, { name: string | null; phone: string | null }> = {};
  if (userIds.length > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(
        sql`${usersTable.id} IN (${sql.join(
          userIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    userMap = Object.fromEntries(users.map((u) => [u.id, { name: u.name, phone: u.phone }]));
  }

  const bidCounts =
    rideIds.length > 0
      ? await db
          .select({ rideId: rideBidsTable.rideId, total: count(rideBidsTable.id) })
          .from(rideBidsTable)
          .where(
            sql`${rideBidsTable.rideId} IN (${sql.join(
              rideIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          )
          .groupBy(rideBidsTable.rideId)
      : [];
  const bidCountMap = Object.fromEntries(bidCounts.map((b) => [b.rideId, Number(b.total)]));

  res.json({
    rides: activeRides.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      pickupAddress: r.pickupAddress,
      dropAddress: r.dropAddress,
      pickupLat: r.pickupLat ? parseFloat(r.pickupLat) : null,
      pickupLng: r.pickupLng ? parseFloat(r.pickupLng) : null,
      fare: parseFloat(r.fare),
      offeredFare: r.offeredFare ? parseFloat(r.offeredFare) : null,
      customerName: userMap[r.userId]?.name ?? "Unknown",
      customerPhone: userMap[r.userId]?.phone ?? null,
      notifiedRiders: notifiedCounts[r.id] ?? 0,
      totalBids: bidCountMap[r.id] ?? 0,
      elapsedSeconds: Math.floor((Date.now() - r.createdAt.getTime()) / 1000),
      createdAt: r.createdAt.toISOString(),
      bargainStatus: r.bargainStatus,
    })),
    total: activeRides.length,
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /admin/fleet-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
   Returns:
   - heatmap: array of { lat, lng, weight } from location_logs in date range
   - avgResponseTime: average minutes between ride/order creation and acceptance
   - peakZones: top location clusters by ping density
   - riderDistances: total estimated distance per rider (haversine over log trail)
══════════════════════════════════════════════════════════════════════════════ */
router.get("/fleet-analytics", async (req, res) => {
  const fromParam = req.query["from"] as string | undefined;
  const toParam = req.query["to"] as string | undefined;

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const from =
    fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
      ? new Date(`${fromParam}T00:00:00.000Z`)
      : defaultFrom;
  const to =
    toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? new Date(`${toParam}T23:59:59.999Z`) : now;

  /* Heatmap data: all rider pings in the date range */
  const heatPoints = await db
    .select({
      latitude: locationLogsTable.latitude,
      longitude: locationLogsTable.longitude,
    })
    .from(locationLogsTable)
    .where(
      and(
        eq(locationLogsTable.role, "rider"),
        gte(locationLogsTable.createdAt, from),
        lte(locationLogsTable.createdAt, to)
      )
    )
    .limit(10000);

  const heatmap = heatPoints.map((p) => ({
    lat: parseFloat(String(p.latitude)),
    lng: parseFloat(String(p.longitude)),
    weight: 1,
  }));

  /* Average response time: time from request creation to first acceptance, across rides AND orders */
  const [ridesResponseRow] = await db
    .select({
      avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)) * 1000)`,
    })
    .from(ridesTable)
    .where(
      and(
        sql`accepted_at IS NOT NULL`,
        gte(ridesTable.createdAt, from),
        lte(ridesTable.createdAt, to)
      )
    );

  /* Orders: estimate acceptance time as time between created_at and updated_at
     when riderId is assigned. This is an approximation since orders lack an acceptedAt column. */
  const [ordersResponseRow] = await db
    .select({
      avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000)`,
    })
    .from(ordersTable)
    .where(
      and(
        sql`rider_id IS NOT NULL`,
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
        /* Filter outliers: ignore if acceptance took >60 min (likely a stale update) */
        sql`EXTRACT(EPOCH FROM (updated_at - created_at)) < 3600`
      )
    );

  /* Weighted average: prefer rides (more precise) but blend in orders when available */
  const ridesAvgMs = ridesResponseRow?.avgMs ? Number(ridesResponseRow.avgMs) : null;
  const ordersAvgMs = ordersResponseRow?.avgMs ? Number(ordersResponseRow.avgMs) : null;
  const blendedMs =
    ridesAvgMs != null && ordersAvgMs != null
      ? (ridesAvgMs + ordersAvgMs) / 2
      : (ridesAvgMs ?? ordersAvgMs);
  const avgResponseTimeMin = blendedMs != null ? Math.round((blendedMs / 60000) * 10) / 10 : null;

  /* Per-rider distance estimation from location logs */
  const riderLogs = await db
    .select({
      userId: locationLogsTable.userId,
      latitude: locationLogsTable.latitude,
      longitude: locationLogsTable.longitude,
      createdAt: locationLogsTable.createdAt,
    })
    .from(locationLogsTable)
    .where(
      and(
        eq(locationLogsTable.role, "rider"),
        gte(locationLogsTable.createdAt, from),
        lte(locationLogsTable.createdAt, to)
      )
    )
    .orderBy(asc(locationLogsTable.userId), asc(locationLogsTable.createdAt))
    .limit(50000);

  const riderDistanceMap = new Map<string, number>();
  const prevByRider = new Map<string, { lat: number; lng: number }>();

  for (const log of riderLogs) {
    const lat = parseFloat(String(log.latitude));
    const lng = parseFloat(String(log.longitude));
    const prev = prevByRider.get(log.userId);
    if (prev) {
      const R = 6371;
      const dLat = ((lat - prev.lat) * Math.PI) / 180;
      const dLng = ((lng - prev.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((prev.lat * Math.PI) / 180) *
          Math.cos((lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      riderDistanceMap.set(log.userId, (riderDistanceMap.get(log.userId) ?? 0) + distKm);
    }
    prevByRider.set(log.userId, { lat, lng });
  }

  /* Enrich rider distances with rider names */
  const riderIds = [...riderDistanceMap.keys()];
  const riderNames =
    riderIds.length > 0
      ? await db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(
            sql`${usersTable.id} = ANY(ARRAY[${sql.join(
              riderIds.map((id) => sql`${id}`),
              sql`, `
            )}])`
          )
      : [];
  const nameMap = new Map(riderNames.map((r) => [r.id, r.name ?? "Unknown"]));

  const riderDistances = [...riderDistanceMap.entries()]
    .map(([userId, distKm]) => ({
      userId,
      name: nameMap.get(userId) ?? "Unknown",
      distanceKm: Math.round(distKm * 10) / 10,
    }))
    .sort((a, b) => b.distanceKm - a.distanceKm)
    .slice(0, 20);

  /* Peak zones: bin pings into ~500 m grid cells, return top clusters */
  const GRID_DEG = 0.005; /* ~500 m resolution */
  const cellCounts = new Map<string, { lat: number; lng: number; count: number }>();
  for (const p of heatmap) {
    const cellLat = Math.round(p.lat / GRID_DEG) * GRID_DEG;
    const cellLng = Math.round(p.lng / GRID_DEG) * GRID_DEG;
    const key = `${cellLat.toFixed(4)},${cellLng.toFixed(4)}`;
    const existing = cellCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      cellCounts.set(key, { lat: cellLat, lng: cellLng, count: 1 });
    }
  }
  const peakZones = [...cellCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((z) => ({ lat: z.lat, lng: z.lng, pings: z.count }));

  res.json({
    heatmap,
    avgResponseTimeMin,
    riderDistances,
    peakZones,
    totalPings: heatmap.length,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
});

/* ── GET /admin/riders/:userId/route?date=YYYY-MM-DD&sinceOnline=true — fleet history for admin ──
   When sinceOnline=true (or no date), the trail is scoped to the rider's current login session:
   it uses the rider's live_locations.lastSeen timestamp as the session start boundary,
   giving "current shift to now" semantics rather than calendar midnight. */
router.get("/riders/:userId/route", async (req, res) => {
  const { userId } = req.params as Record<string, string>;
  const dateParam = req.query["date"] as string | undefined;
  const sinceOnline = req.query["sinceOnline"] === "true";

  let startOfDay: Date;
  let endOfDay: Date;

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    /* Historic date requested — use full calendar day */
    startOfDay = new Date(`${dateParam}T00:00:00.000Z`);
    endOfDay = new Date(`${dateParam}T23:59:59.999Z`);
  } else if (sinceOnline) {
    /* Session-scoped: use onlineSince (set once when rider goes online, never overwritten by heartbeat).
       This gives stable "current session start" semantics, unlike lastSeen which moves on every heartbeat. */
    const [liveLoc] = await db
      .select({ onlineSince: liveLocationsTable.onlineSince })
      .from(liveLocationsTable)
      .where(eq(liveLocationsTable.userId, userId))
      .limit(1);
    const sessionStart = liveLoc?.onlineSince ? new Date(liveLoc.onlineSince) : null;
    /* Fallback: 8-hour shift window (covers most shifts even without a logged session start) */
    startOfDay = sessionStart ?? new Date(Date.now() - 8 * 60 * 60 * 1000);
    endOfDay = new Date();
  } else {
    const now = new Date();
    startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }

  const logs = await db
    .select()
    .from(locationLogsTable)
    .where(
      and(
        eq(locationLogsTable.userId, userId),
        gte(locationLogsTable.createdAt, startOfDay),
        lte(locationLogsTable.createdAt, endOfDay)
      )
    )
    .orderBy(asc(locationLogsTable.createdAt));

  const points = logs.map((l) => ({
    latitude: parseFloat(String(l.latitude)),
    longitude: parseFloat(String(l.longitude)),
    accuracy: l.accuracy,
    speed: l.speed,
    heading: l.heading,
    batteryLevel: l.batteryLevel,
    isSpoofed: l.isSpoofed,
    createdAt: l.createdAt.toISOString(),
  }));

  const loginLocation = points[0] ?? null;
  const lastLocation = points[points.length - 1] ?? null;

  res.json({
    userId,
    date: dateParam ?? "today",
    loginLocation,
    lastLocation,
    route: points,
    total: points.length,
  });
});

/* ══════════════════════════════════════════════════════════════
   Admin — Review Management
   ══════════════════════════════════════════════════════════════ */

/* ── GET /admin/reviews — paginated list of all reviews (order reviews + ride ratings) ── */

export default router;
