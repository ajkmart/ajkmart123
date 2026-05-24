import { db } from "@workspace/db";
import {
  liveLocationsTable,
  locationHistoryTable,
  locationLogsTable,
  notificationsTable,
  ordersTable,
  parcelBookingsTable,
  pharmacyOrdersTable,
  popularLocationsTable,
  rideBidsTable,
  rideEventLogsTable,
  rideNotifiedRidersTable,
  rideRatingsTable,
  rideServiceTypesTable,
  riderProfilesTable,
  ridesTable,
  reviewsTable,
  schoolRoutesTable,
  schoolSubscriptionsTable,
  usersTable,
  vanBookingsTable,
  vendorProfilesTable,
} from "@workspace/db/schema";
import { RIDE_VALID_STATUSES } from "@workspace/service-constants";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, sum } from "drizzle-orm";
import { Request, Response, Router } from "express";
import {
  sendCreated,
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../../lib/response.js";
import { ensureDefaultLocations, ensureDefaultRideServices } from "../../../lib/seedDefaults.js";
import { AuditService } from "../../../services/admin-audit.service.js";
import { FleetService } from "../../../services/admin-fleet.service.js";
import {
  addAuditEntry,
  formatSvc,
  generateId,
  getCachedSettings,
  getClientIp,
  logger,
  type AdminRequest,
} from "../../admin-shared.js";

type AdminReq = AdminRequest & Request & { adminId?: string; adminName?: string };

const router = Router();
router.get("/rides", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query["limit"] as string) || 50, 200);
    const after = req.query["after"] as string | undefined;
    const result = await FleetService.getRidesList(limit, after);
    sendSuccess(res, {
      rides: result.rides,
      total: result.rides.length,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch rides", 500);
  }
});

const _VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["searching", "bargaining", "accepted", "cancelled"],
  searching: ["bargaining", "accepted", "cancelled"],
  bargaining: ["searching", "accepted", "cancelled"],
  accepted: ["arrived", "in_transit", "cancelled"],
  arrived: ["in_transit", "cancelled"],
  in_transit: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

router.get("/rides-enriched", async (req: Request, res: Response) => {
  try {
    const result = await FleetService.getRidesEnriched({
      page: Math.max(1, parseInt((req.query["page"] as string) || "1", 10)),
      limit: Math.min(500, Math.max(1, parseInt((req.query["limit"] as string) || "50", 10))),
      status: req.query["status"] as string | undefined,
      type: req.query["type"] as string | undefined,
      search: ((req.query["search"] as string) || "").trim().toLowerCase() || undefined,
      customer: ((req.query["customer"] as string) || "").trim().toLowerCase() || undefined,
      rider: ((req.query["rider"] as string) || "").trim().toLowerCase() || undefined,
      dateFrom: req.query["dateFrom"] as string | undefined,
      dateTo: req.query["dateTo"] as string | undefined,
      sortBy: (req.query["sortBy"] as string) === "fare" ? "fare" : "date",
      sortDir: (req.query["sortDir"] as string) === "asc" ? "asc" : "desc",
    });
    sendSuccess(res, result);
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch enriched rides", 500);
  }
});

router.patch("/rides/:id/status", async (req: Request, res: Response) => {
  const { status, riderName, riderPhone } = req.body;
  const adminReq = req as AdminReq;

  if (!status || !(RIDE_VALID_STATUSES as readonly string[]).includes(status)) {
    sendValidationError(
      res,
      `Invalid ride status "${status}". Valid statuses: ${RIDE_VALID_STATUSES.join(", ")}`
    );
    return;
  }

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "ride_status_update",
        resourceType: "ride",
        resource: req.params["id"] as string,
        details: `Status changed to: ${status}`,
      },
      () =>
        FleetService.updateRideStatus({
          rideId: req.params["id"] as string,
          status,
          riderName,
          riderPhone,
          adminId: adminReq.adminId,
        })
    );

    // Audit: record terminal ride status transitions for compliance
    if (["completed", "cancelled"].includes(status)) {
      void addAuditEntry({
        action: `ride_status_${status}`,
        adminId: adminReq.adminId,
        ip: getClientIp(req),
        details: `Ride #${result.id.slice(-6).toUpperCase()} marked ${status}`,
        result: "success",
      });
    }

    sendSuccess(res, {
      ...result,
      fare: parseFloat(result.fare),
      distance: parseFloat(result.distance),
    });
  } catch (error: unknown) {
    const errMsg = (error as Error).message || String(error);
    logger.error("Ride status update error:", errMsg);

    if (errMsg.includes("not found")) {
      sendNotFound(res, "Ride not found");
    } else if (errMsg.includes("Cannot")) {
      sendValidationError(res, errMsg);
    } else {
      sendError(res, "Status update failed: " + errMsg, 500);
    }
  }
});
router.get("/ride-services", async (_req: Request, res: Response) => {
  try {
    await ensureDefaultRideServices();
    const services = await db
      .select()
      .from(rideServiceTypesTable)
      .orderBy(asc(rideServiceTypesTable.sortOrder));
    sendSuccess(res, { services: services.map(formatSvc) });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch ride services", 500);
  }
});

/* POST /admin/ride-services — create custom service */
router.post("/ride-services", async (req: Request, res: Response) => {
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
    sendValidationError(res, "key, name, icon are required");
    return;
  }
  try {
    const existing = await db
      .select({ id: rideServiceTypesTable.id })
      .from(rideServiceTypesTable)
      .where(eq(rideServiceTypesTable.key, String(key)))
      .limit(1);
    if (existing.length > 0) {
      sendError(res, `Service key "${key}" already exists`, 409);
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
    sendCreated(res, { service: formatSvc(created) });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to create ride service", 500);
  }
});

/* PATCH /admin/ride-services/:id — update any field */
router.patch("/ride-services/:id", async (req: Request, res: Response) => {
  const svcId = req.params["id"] as string;
  try {
    const [existing] = await db
      .select()
      .from(rideServiceTypesTable)
      .where(eq(rideServiceTypesTable.id, svcId))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Service not found");
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
    sendSuccess(res, { service: formatSvc(updated) });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to update ride service", 500);
  }
});

/* DELETE /admin/ride-services/:id — only custom services */
router.delete("/ride-services/:id", async (req: Request, res: Response) => {
  const svcId = req.params["id"] as string;
  try {
    const [existing] = await db
      .select()
      .from(rideServiceTypesTable)
      .where(eq(rideServiceTypesTable.id, svcId))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Service not found");
      return;
    }
    if (!existing.isCustom) {
      sendValidationError(res, "Built-in services cannot be deleted. Disable them instead.");
      return;
    }
    await db.delete(rideServiceTypesTable).where(eq(rideServiceTypesTable.id, svcId));
    sendSuccess(res);
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to delete ride service", 500);
  }
});

/* ══════════════════════════════════════════════════════
   POPULAR LOCATIONS — Admin CRUD
   GET  /admin/locations
   POST /admin/locations
   PATCH /admin/locations/:id
   DELETE /admin/locations/:id
══════════════════════════════════════════════════════ */

export { ensureDefaultLocations };

router.get("/locations", async (_req: Request, res: Response) => {
  try {
    await ensureDefaultLocations();
    const locs = await db
      .select()
      .from(popularLocationsTable)
      .orderBy(asc(popularLocationsTable.sortOrder), asc(popularLocationsTable.name));
    sendSuccess(res, {
      locations: locs.map((l) => ({
        ...l,
        lat: parseFloat(String(l.lat)),
        lng: parseFloat(String(l.lng)),
      })),
    });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch locations", 500);
  }
});

router.post("/locations", async (req: Request, res: Response) => {
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
    sendValidationError(res, "name, lat, lng required");
    return;
  }
  try {
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
    sendCreated(res, {
      ...loc,
      lat: parseFloat(String(loc!.lat)),
      lng: parseFloat(String(loc!.lng)),
    });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to create location", 500);
  }
});

router.patch("/locations/:id", async (req: Request, res: Response) => {
  try {
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
      sendNotFound(res, "Location not found");
      return;
    }
    sendSuccess(res, {
      ...updated,
      lat: parseFloat(String(updated.lat)),
      lng: parseFloat(String(updated.lng)),
    });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to update location", 500);
  }
});

router.delete("/locations/:id", async (req: Request, res: Response) => {
  try {
    const [existing] = await db
      .select({ id: popularLocationsTable.id })
      .from(popularLocationsTable)
      .where(eq(popularLocationsTable.id, req.params["id"] as string))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Location not found");
      return;
    }
    await db
      .delete(popularLocationsTable)
      .where(eq(popularLocationsTable.id, req.params["id"] as string));
    sendSuccess(res);
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to delete location", 500);
  }
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

router.get("/school-routes", async (_req: Request, res: Response) => {
  try {
    const routes = await db
      .select()
      .from(schoolRoutesTable)
      .orderBy(asc(schoolRoutesTable.sortOrder), asc(schoolRoutesTable.schoolName));
    sendSuccess(res, { routes: routes.map(fmtRoute) });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch school routes", 500);
  }
});

router.post("/school-routes", async (req: Request, res: Response) => {
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
    sendValidationError(res, "routeName, schoolName, fromArea, toAddress, monthlyPrice required");
    return;
  }
  try {
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
    sendCreated(res, fmtRoute(route!));
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to create school route", 500);
  }
});

router.patch("/school-routes/:id", async (req: Request, res: Response) => {
  const routeId = req.params["id"] as string;
  try {
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
      sendNotFound(res, "Route not found");
      return;
    }
    sendSuccess(res, fmtRoute(updated));
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to update school route", 500);
  }
});

router.delete("/school-routes/:id", async (req: Request, res: Response) => {
  const routeId = req.params["id"] as string;
  try {
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
      sendError(res, "Cannot delete route with active subscriptions. Disable it instead.", 409);
      return;
    }
    const [existing] = await db
      .select({ id: schoolRoutesTable.id })
      .from(schoolRoutesTable)
      .where(eq(schoolRoutesTable.id, routeId))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Route not found");
      return;
    }
    await db.delete(schoolRoutesTable).where(eq(schoolRoutesTable.id, routeId));
    sendSuccess(res);
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to delete school route", 500);
  }
});

router.get("/school-subscriptions", async (req: Request, res: Response) => {
  try {
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
    sendSuccess(res, { subscriptions: enriched, total: enriched.length });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch school subscriptions", 500);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /admin/live-riders
   Returns all riders who have recently sent GPS updates,
   enriched with their name, phone and online status.
   "Fresh" = updated within last 5 minutes.
══════════════════════════════════════════════════════════ */
router.get("/live-riders", async (_req: Request, res: Response) => {
  try {
    const settings = await getCachedSettings();
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
        roles: usersTable.roles,
        lastActive: usersTable.lastActive,
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
        role: loc.roles ?? "rider",
        batteryLevel: loc.batteryLevel ?? null,
        lastSeen:
          loc.lastSeen instanceof Date ? loc.lastSeen.toISOString() : (loc.lastSeen ?? null),
        onlineSince:
          loc.onlineSince instanceof Date
            ? loc.onlineSince.toISOString()
            : (loc.onlineSince ?? null),
        lastActive:
          loc.lastActive instanceof Date ? loc.lastActive.toISOString() : (loc.lastActive ?? null),
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

    sendSuccess(res, {
      riders: enriched,
      total: enriched.length,
      freshCount: enriched.filter((r) => r.isFresh).length,
      staleTimeoutSec,
    });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch live riders", 500);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /admin/customer-locations
   Returns customers who sent a GPS update (ride booking or
   order placement). Shows their identity + last position.
   "Fresh" = updated within last 2 hours.
══════════════════════════════════════════════════════════ */
router.get("/customer-locations", async (_req: Request, res: Response) => {
  try {
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

    sendSuccess(res, {
      customers: enriched,
      total: enriched.length,
      freshCount: enriched.filter((c) => c.isFresh).length,
    });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch customer locations", 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /admin/search?q=query
   Global search across users, rides, orders, pharmacy, parcels
   Returns max 5 results per category, sorted by relevance (recency)
══════════════════════════════════════════════════════════════════════════════ */
router.patch("/riders/:id/online", async (req: Request, res: Response) => {
  const { isOnline } = req.body as { isOnline: boolean };
  try {
    const [rider] = await db
      .update(usersTable)
      .set({ isOnline, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params["id"] as string))
      .returning();
    if (!rider) {
      sendNotFound(res, "Rider not found");
      return;
    }
    void addAuditEntry({
      action: "rider_online_toggle",
      ip: getClientIp(req),
      adminId: (req as AdminReq).adminId,
      details: `Rider ${req.params["id"] as string} set ${isOnline ? "online" : "offline"} by admin`,
      result: "success",
    });
    sendSuccess(res, { isOnline });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to update rider online status", 500);
  }
});

/* ── GET /admin/revenue-trend — 7-day rolling revenue + counts for dashboard sparklines ── */
router.get("/revenue-trend", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const dayPromises = Array.from({ length: 7 }, (_, idx) => {
      const i = 6 - idx;
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const from = new Date(d);
      from.setHours(0, 0, 0, 0);
      const to = new Date(d);
      to.setHours(23, 59, 59, 999);
      const dateStr = d.toISOString().slice(0, 10);
      return Promise.all([
        db
          .select({ total: sum(ordersTable.total) })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.status, "delivered"),
              isNull(ordersTable.deletedAt),
              gte(ordersTable.createdAt, from),
              lte(ordersTable.createdAt, to)
            )
          ),
        db
          .select({ total: sum(ridesTable.fare) })
          .from(ridesTable)
          .where(
            and(
              eq(ridesTable.status, "completed"),
              gte(ridesTable.createdAt, from),
              lte(ridesTable.createdAt, to)
            )
          ),
        db
          .select({ cnt: count() })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.status, "delivered"),
              isNull(ordersTable.deletedAt),
              gte(ordersTable.createdAt, from),
              lte(ordersTable.createdAt, to)
            )
          ),
        db
          .select({ cnt: count() })
          .from(ridesTable)
          .where(
            and(
              eq(ridesTable.status, "completed"),
              gte(ridesTable.createdAt, from),
              lte(ridesTable.createdAt, to)
            )
          ),
        /* SOS alerts created on this day (regardless of resolution status) */
        db
          .select({ cnt: count() })
          .from(notificationsTable)
          .where(
            and(
              eq(notificationsTable.type, "sos"),
              gte(notificationsTable.createdAt, from),
              lte(notificationsTable.createdAt, to)
            )
          ),
        /* Per-service revenue breakdowns */
        db
          .select({ total: sum(pharmacyOrdersTable.total) })
          .from(pharmacyOrdersTable)
          .where(
            and(
              eq(pharmacyOrdersTable.status, "delivered"),
              gte(pharmacyOrdersTable.createdAt, from),
              lte(pharmacyOrdersTable.createdAt, to)
            )
          ),
        db
          .select({ total: sum(parcelBookingsTable.fare) })
          .from(parcelBookingsTable)
          .where(
            and(
              eq(parcelBookingsTable.status, "delivered"),
              gte(parcelBookingsTable.createdAt, from),
              lte(parcelBookingsTable.createdAt, to)
            )
          ),
        db
          .select({ total: sum(vanBookingsTable.fare) })
          .from(vanBookingsTable)
          .where(
            and(
              eq(vanBookingsTable.status, "completed"),
              gte(vanBookingsTable.createdAt, from),
              lte(vanBookingsTable.createdAt, to)
            )
          ),
      ]).then(
        ([
          [orderRev],
          [rideRev],
          [orderCnt],
          [rideCnt],
          [sosCnt],
          [pharmacyRev],
          [parcelRev],
          [vanRev],
        ]) => {
          const mart = parseFloat(orderRev?.total ?? "0");
          const rides = parseFloat(rideRev?.total ?? "0");
          const pharmacy = parseFloat(pharmacyRev?.total ?? "0");
          const parcel = parseFloat(parcelRev?.total ?? "0");
          const van = parseFloat(vanRev?.total ?? "0");
          return {
            date: dateStr,
            revenue: mart + rides + pharmacy + parcel + van,
            mart,
            rides,
            pharmacy,
            parcel,
            van,
            orderCount: orderCnt?.cnt ?? 0,
            rideCount: rideCnt?.cnt ?? 0,
            sosCount: sosCnt?.cnt ?? 0,
          };
        }
      );
    });
    const days = await Promise.all(dayPromises);
    sendSuccess(res, { trend: days });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch revenue trend", 500);
  }
});

/* ── GET /admin/leaderboard — top-5 vendors and riders ── */
router.get("/leaderboard", async (_req: Request, res: Response) => {
  try {
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
        and(
          eq(ordersTable.vendorId, usersTable.id),
          eq(ordersTable.status, "delivered"),
          isNull(ordersTable.deletedAt)
        )
      )
      .where(and(ilike(usersTable.roles, "%vendor%"), isNull(usersTable.deletedAt)))
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
      .where(and(ilike(usersTable.roles, "%rider%"), isNull(usersTable.deletedAt)))
      .groupBy(usersTable.id)
      .orderBy(sql`count(${ridesTable.id}) desc`)
      .limit(5);

    sendSuccess(res, {
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
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch leaderboard", 500);
  }
});

/* ── GET /admin/dashboard-export (+ /fleet/dashboard-export alias) ── */
async function dashboardExportHandler(_req: Request, res: Response) {
  try {
    const now = new Date();
    const [[userCount], [orderCount], [rideCount], [revenue], [rideRev]] = await Promise.all([
      db.select({ count: count() }).from(usersTable).where(isNull(usersTable.deletedAt)),
      db.select({ count: count() }).from(ordersTable).where(isNull(ordersTable.deletedAt)),
      db.select({ count: count() }).from(ridesTable),
      db
        .select({ total: sum(ordersTable.total) })
        .from(ordersTable)
        .where(and(eq(ordersTable.status, "delivered"), isNull(ordersTable.deletedAt))),
      db
        .select({ total: sum(ridesTable.fare) })
        .from(ridesTable)
        .where(eq(ridesTable.status, "completed")),
    ]);

    const trendPromises = Array.from({ length: 7 }, (_, idx) => {
      const i = 6 - idx;
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const from = new Date(d);
      from.setHours(0, 0, 0, 0);
      const to = new Date(d);
      to.setHours(23, 59, 59, 999);
      const dateStr = d.toISOString().slice(0, 10);
      return Promise.all([
        db
          .select({ total: sum(ordersTable.total) })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.status, "delivered"),
              isNull(ordersTable.deletedAt),
              gte(ordersTable.createdAt, from),
              lte(ordersTable.createdAt, to)
            )
          ),
        db
          .select({ total: sum(ridesTable.fare) })
          .from(ridesTable)
          .where(
            and(
              eq(ridesTable.status, "completed"),
              gte(ridesTable.createdAt, from),
              lte(ridesTable.createdAt, to)
            )
          ),
        db
          .select({ cnt: count() })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.status, "delivered"),
              isNull(ordersTable.deletedAt),
              gte(ordersTable.createdAt, from),
              lte(ordersTable.createdAt, to)
            )
          ),
        db
          .select({ cnt: count() })
          .from(ridesTable)
          .where(
            and(
              eq(ridesTable.status, "completed"),
              gte(ridesTable.createdAt, from),
              lte(ridesTable.createdAt, to)
            )
          ),
        db
          .select({ cnt: count() })
          .from(notificationsTable)
          .where(
            and(
              eq(notificationsTable.type, "sos"),
              gte(notificationsTable.createdAt, from),
              lte(notificationsTable.createdAt, to)
            )
          ),
      ]).then(([[o], [r], [oCnt], [rCnt], [sosCnt]]) => ({
        date: dateStr,
        revenue: parseFloat(o?.total ?? "0") + parseFloat(r?.total ?? "0"),
        orderCount: oCnt?.cnt ?? 0,
        rideCount: rCnt?.cnt ?? 0,
        sosCount: sosCnt?.cnt ?? 0,
      }));
    });
    const trend = await Promise.all(trendPromises);

    const snapshot = {
      exportedAt: now.toISOString(),
      users: userCount?.count ?? 0,
      orders: orderCount?.count ?? 0,
      rides: rideCount?.count ?? 0,
      totalRevenue: parseFloat(revenue?.total ?? "0") + parseFloat(rideRev?.total ?? "0"),
      orderRevenue: parseFloat(revenue?.total ?? "0"),
      rideRevenue: parseFloat(rideRev?.total ?? "0"),
      trend,
    };
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dashboard-${now.toISOString().slice(0, 10)}.tson"`
    );
    sendSuccess(res, snapshot);
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to generate dashboard export", 500);
  }
}

router.get("/dashboard-export", dashboardExportHandler);
router.get("/fleet/dashboard-export", dashboardExportHandler);

/* ══════════════════════════════════════════════════════════════════════════════
   RIDE MANAGEMENT MODULE — Admin ride actions with full audit logging
══════════════════════════════════════════════════════════════════════════════ */

router.post("/rides/:id/cancel", async (req: Request, res: Response) => {
  const rideId = req.params["id"] as string;
  const { reason } = req.body as { reason?: string };
  const adminReq = req as AdminReq;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "ride_cancel",
        resourceType: "ride",
        resource: rideId,
        details: `Cancelled${reason ? ` — ${reason}` : ""}`,
      },
      () =>
        FleetService.cancelRide({
          rideId,
          reason,
          adminId: adminReq.adminId,
        })
    );
    sendSuccess(res, result);
  } catch (error: unknown) {
    const errMsg = (error as Error).message || String(error);
    logger.error("Ride cancel error:", errMsg);
    sendError(res, "Cancellation failed: " + errMsg, errMsg.includes("not found") ? 404 : 400);
  }
});

router.post("/rides/:id/refund", async (req: Request, res: Response) => {
  const rideId = req.params["id"] as string;
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  const adminReq = req as AdminReq;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "ride_refund",
        resourceType: "ride",
        resource: rideId,
        details: `Refund${reason ? ` — ${reason}` : ""}`,
      },
      () =>
        FleetService.refundRide({
          rideId,
          amount,
          reason,
          adminId: adminReq.adminId,
        })
    );
    sendSuccess(res, result);
  } catch (error: unknown) {
    const errMsg = (error as Error).message || String(error);
    logger.error("Ride refund error:", errMsg);
    sendError(res, "Refund failed: " + errMsg, errMsg.includes("not found") ? 404 : 400);
  }
});

router.post("/rides/:id/reassign", async (req: Request, res: Response) => {
  const rideId = req.params["id"] as string;
  const { riderId, riderName, riderPhone } = req.body as {
    riderId?: string;
    riderName?: string;
    riderPhone?: string;
  };
  const adminReq = req as AdminReq;

  if (!riderId) {
    sendValidationError(res, "riderId is required to reassign");
    return;
  }

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "ride_reassign",
        resourceType: "ride",
        resource: rideId,
        details: `Reassigned to rider ${riderId}`,
      },
      () =>
        FleetService.reassignRide({
          rideId,
          riderId,
          riderName,
          riderPhone,
          adminId: adminReq.adminId,
        })
    );
    sendSuccess(res, result);
  } catch (error: unknown) {
    const errMsg = (error as Error).message || String(error);
    logger.error("Ride reassign error:", errMsg);

    if (errMsg.includes("not found")) {
      sendNotFound(res, errMsg);
    } else if (
      errMsg.includes("Cannot") ||
      errMsg.includes("is not a rider") ||
      errMsg.includes("deactivated") ||
      errMsg.includes("offline")
    ) {
      sendValidationError(res, errMsg);
    } else {
      sendError(res, "Reassignment failed: " + errMsg, 400);
    }
  }
});

router.get("/rides/:id/audit-trail", async (req: Request, res: Response) => {
  const rideId = req.params["id"] as string;
  try {
    const events = await db
      .select()
      .from(rideEventLogsTable)
      .where(eq(rideEventLogsTable.rideId, rideId))
      .orderBy(desc(rideEventLogsTable.createdAt));
    const trail = events.map((e) => ({
      action: e.event,
      details: e.notes,
      ip: null,
      adminId: e.adminId,
      result: "success",
      timestamp: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    }));
    sendSuccess(res, { trail, rideId });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch audit trail", 500);
  }
});

router.get("/rides/:id/detail", async (req: Request, res: Response) => {
  try {
    const rideId = req.params["id"] as string;
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) {
      sendNotFound(res, "Ride not found");
      return;
    }

    const [customer] = await db
      .select({
        name: usersTable.name,
        phone: usersTable.phone,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.id, ride.userId))
      .limit(1);
    let rider: {
      name: string | null;
      phone: string | null;
      email: string | null;
    } | null = null;
    if (ride.riderId) {
      const [r] = await db
        .select({
          name: usersTable.name,
          phone: usersTable.phone,
          email: usersTable.email,
        })
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

    const s = await getCachedSettings();
    const gstEnabled = (s["finance_gst_enabled"] ?? "off") === "on";
    const gstPct = parseFloat(s["finance_gst_pct"] ?? "17");
    const surgeEnabled = (s["ride_surge_enabled"] ?? "off") === "on";
    const surgeMultiplier = surgeEnabled ? parseFloat(s["ride_surge_multiplier"] ?? "1.5") : 1;
    const fare = parseFloat(ride.fare);
    const gstAmount = gstEnabled ? parseFloat(((fare * gstPct) / (100 + gstPct)).toFixed(2)) : 0;
    const baseFare = fare - gstAmount;

    sendSuccess(res, {
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
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch ride detail", 500);
  }
});

router.get("/dispatch-monitor", async (_req: Request, res: Response) => {
  try {
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
        .select({
          id: usersTable.id,
          name: usersTable.name,
          phone: usersTable.phone,
        })
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
            .select({
              rideId: rideBidsTable.rideId,
              total: count(rideBidsTable.id),
            })
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

    sendSuccess(res, {
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
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch dispatch monitor", 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /admin/fleet-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
   Returns:
   - heatmap: array of { lat, lng, weight } from location_logs in date range
   - avgResponseTime: average minutes between ride/order creation and acceptance
   - peakZones: top location clusters by ping density
   - riderDistances: total estimated distance per rider (haversine over log trail)
══════════════════════════════════════════════════════════════════════════════ */
router.get("/fleet-analytics", async (req: Request, res: Response) => {
  try {
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

    /* Per-type daily revenue: GROUP BY date + type over completed rides */
    const revenueByTypeRaw = await db
      .select({
        date: sql<string>`DATE(${ridesTable.createdAt})::text`,
        type: ridesTable.type,
        revenue: sql<number>`COALESCE(SUM(${ridesTable.fare}::numeric), 0)`,
        rideCount: sql<number>`COUNT(*)::int`,
      })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.status, "completed"),
          gte(ridesTable.createdAt, from),
          lte(ridesTable.createdAt, to)
        )
      )
      .groupBy(sql`DATE(${ridesTable.createdAt})`, ridesTable.type)
      .orderBy(sql`DATE(${ridesTable.createdAt}) ASC`);

    /* Build [{date, bike, car, rickshaw, ...}, ...] rows, one per calendar day */
    const revByDateMap = new Map<string, Record<string, number>>();
    for (const row of revenueByTypeRaw) {
      if (!revByDateMap.has(row.date)) revByDateMap.set(row.date, {});
      revByDateMap.get(row.date)![row.type] = Number(row.revenue);
    }
    const revenueTrend = [...revByDateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, byType]) => ({ date, ...byType }));

    const revenueServiceTypes = [
      ...new Set(revenueByTypeRaw.map((r) => r.type)),
    ].sort() as string[];

    sendSuccess(res, {
      heatmap,
      avgResponseTimeMin,
      riderDistances,
      peakZones,
      totalPings: heatmap.length,
      revenueTrend,
      revenueServiceTypes,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch fleet analytics", 500);
  }
});

/* ── GET /admin/riders/:userId/route?date=YYYY-MM-DD&sinceOnline=true — fleet history for admin ──
   When sinceOnline=true (or no date), the trail is scoped to the rider's current login session:
   it uses the rider's live_locations.lastSeen timestamp as the session start boundary,
   giving "current shift to now" semantics rather than calendar midnight. */
router.get("/riders/:userId/route", async (req: Request, res: Response) => {
  try {
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

    /* location_history stores smart-filtered waypoints (significant movement only, ≥ threshold metres).
     This gives the admin a clean path trace rather than raw GPS noise from location_logs. */
    const logs = await db
      .select()
      .from(locationHistoryTable)
      .where(
        and(
          eq(locationHistoryTable.userId, userId),
          gte(locationHistoryTable.createdAt, startOfDay),
          lte(locationHistoryTable.createdAt, endOfDay)
        )
      )
      .orderBy(asc(locationHistoryTable.createdAt));

    const points = logs.map((l) => ({
      latitude: (l.coords as { lat: number; lng: number }).lat,
      longitude: (l.coords as { lat: number; lng: number }).lng,
      speed: l.speed != null ? parseFloat(String(l.speed)) : null,
      heading: l.heading != null ? parseFloat(String(l.heading)) : null,
      createdAt: l.createdAt.toISOString(),
    }));

    const loginLocation = points[0] ?? null;
    const lastLocation = points[points.length - 1] ?? null;

    sendSuccess(res, {
      userId,
      date: dateParam ?? "today",
      loginLocation,
      lastLocation,
      route: points,
      total: points.length,
    });
  } catch (error: unknown) {
    sendError(res, (error as Error).message || "Failed to fetch rider route", 500);
  }
});

/* ══════════════════════════════════════════════════════════════
   Admin — Review Management
   ══════════════════════════════════════════════════════════════ */

/* ── GET /admin/reviews — paginated list of all reviews (order reviews + ride ratings) ── */
router.get("/reviews", async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "25",
      type,
      stars,
      status,
      subject,
      dateFrom,
      dateTo,
      q,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 25);
    const offset = (pageNum - 1) * limitNum;

    /* ── Build where conditions for reviewsTable ── */
    const reviewConditions: ReturnType<typeof and>[] = [];
    if (type === "ride") {
      reviewConditions.push(eq(reviewsTable.orderType, "ride"));
    } else if (type === "order") {
      reviewConditions.push(sql`${reviewsTable.orderType} != 'ride'`);
    }
    const starsNum = parseInt(stars, 10);
    if (stars && !isNaN(starsNum) && starsNum >= 1 && starsNum <= 5) {
      reviewConditions.push(eq(reviewsTable.rating, starsNum));
    }
    if (status === "visible")
      reviewConditions.push(eq(reviewsTable.status, "visible"), isNull(reviewsTable.deletedAt));
    else if (status === "pending_moderation")
      reviewConditions.push(eq(reviewsTable.status, "pending_moderation"));
    else if (status === "rejected") reviewConditions.push(eq(reviewsTable.status, "rejected"));
    else if (status === "hidden")
      reviewConditions.push(eq(reviewsTable.hidden, true), isNull(reviewsTable.deletedAt));
    else if (status === "deleted") reviewConditions.push(isNotNull(reviewsTable.deletedAt));
    if (subject === "vendor") reviewConditions.push(isNotNull(reviewsTable.vendorId));
    else if (subject === "rider") reviewConditions.push(isNotNull(reviewsTable.riderId));
    const dateFromParsed = dateFrom ? new Date(dateFrom) : null;
    const dateToParsed = dateTo ? new Date(dateTo) : null;
    if (dateFromParsed && !isNaN(dateFromParsed.getTime())) {
      reviewConditions.push(gte(reviewsTable.createdAt, dateFromParsed));
    }
    if (dateToParsed && !isNaN(dateToParsed.getTime())) {
      dateToParsed.setHours(23, 59, 59, 999);
      reviewConditions.push(lte(reviewsTable.createdAt, dateToParsed));
    }

    const baseCondition = reviewConditions.length > 0 ? and(...reviewConditions) : undefined;
    const searchCondition = q
      ? or(
          ilike(usersTable.name, `%${q}%`),
          ilike(usersTable.phone, `%${q}%`),
          sql`${reviewsTable.comment} ILIKE ${"%" + q + "%"}`
        )
      : undefined;
    const fullCondition = searchCondition
      ? baseCondition
        ? and(baseCondition, searchCondition)
        : searchCondition
      : baseCondition;

    /* ── Build rideRatings conditions ── */
    const ratingConditions: ReturnType<typeof and>[] = [];
    if (type === "order") {
      /* no ride ratings for order-only filter */
      ratingConditions.push(sql`1=0`);
    }
    if (!isNaN(starsNum) && starsNum >= 1 && starsNum <= 5) {
      ratingConditions.push(eq(rideRatingsTable.stars, starsNum));
    }
    if (status === "visible" || !status)
      ratingConditions.push(isNull(rideRatingsTable.deletedAt));
    else if (status === "hidden")
      ratingConditions.push(eq(rideRatingsTable.hidden, true), isNull(rideRatingsTable.deletedAt));
    else if (status === "deleted") ratingConditions.push(isNotNull(rideRatingsTable.deletedAt));
    else if (status === "pending_moderation" || status === "rejected") {
      /* ride ratings have no moderation status — skip */
      ratingConditions.push(sql`1=0`);
    }
    if (subject === "vendor") ratingConditions.push(sql`1=0`);
    if (dateFromParsed && !isNaN(dateFromParsed.getTime())) {
      ratingConditions.push(gte(rideRatingsTable.createdAt, dateFromParsed));
    }
    if (dateToParsed && !isNaN(dateToParsed.getTime())) {
      const dt2 = new Date(dateToParsed);
      dt2.setHours(23, 59, 59, 999);
      ratingConditions.push(lte(rideRatingsTable.createdAt, dt2));
    }
    const ratingBaseCondition =
      ratingConditions.length > 0 ? and(...ratingConditions) : undefined;

    /* ── Fetch both sources + aggregates in parallel ── */
    const reviewRows = await db
      .select({
        id: reviewsTable.id,
        type: sql<"order" | "ride">`CASE WHEN ${reviewsTable.orderType} = 'ride' THEN 'ride' ELSE 'order' END`,
        rating: reviewsTable.rating,
        riderRating: reviewsTable.riderRating,
        comment: reviewsTable.comment,
        orderType: reviewsTable.orderType,
        hidden: reviewsTable.hidden,
        status: reviewsTable.status,
        moderationNote: reviewsTable.moderationNote,
        vendorReply: reviewsTable.vendorReply,
        deletedAt: reviewsTable.deletedAt,
        createdAt: reviewsTable.createdAt,
        reviewerId: reviewsTable.userId,
        subjectId: sql<string | null>`COALESCE(${reviewsTable.vendorId}, ${reviewsTable.riderId})`,
        orderId: reviewsTable.orderId,
        reviewerName: usersTable.name,
        reviewerPhone: usersTable.phone,
      })
      .from(reviewsTable)
      .leftJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
      .where(fullCondition)
      .orderBy(desc(reviewsTable.createdAt));

    const ratingRows =
      type !== "order"
        ? await db
            .select({
              id: rideRatingsTable.id,
              type: sql<"order" | "ride">`'ride'`,
              rating: rideRatingsTable.stars,
              riderRating: sql<null>`NULL`,
              comment: rideRatingsTable.comment,
              orderType: sql<string>`'ride'`,
              hidden: rideRatingsTable.hidden,
              status: sql<string>`'visible'`,
              moderationNote: sql<null>`NULL`,
              vendorReply: sql<null>`NULL`,
              deletedAt: rideRatingsTable.deletedAt,
              createdAt: rideRatingsTable.createdAt,
              reviewerId: rideRatingsTable.userId,
              subjectId: rideRatingsTable.riderId,
              orderId: rideRatingsTable.rideId,
              reviewerName: usersTable.name,
              reviewerPhone: usersTable.phone,
            })
            .from(rideRatingsTable)
            .leftJoin(usersTable, eq(rideRatingsTable.userId, usersTable.id))
            .where(ratingBaseCondition)
            .orderBy(desc(rideRatingsTable.createdAt))
        : [];

    /* ── Merge, sort, paginate ── */
    const allReviews = [...reviewRows, ...ratingRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const totalCount = allReviews.length;
    const paginated = allReviews.slice(offset, offset + limitNum);

    /* ── Enrich with subject names ── */
    const subjectIds = [
      ...new Set(paginated.map((r) => r.subjectId).filter(Boolean) as string[]),
    ];
    const subjectUsers =
      subjectIds.length > 0
        ? await db
            .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
            .from(usersTable)
            .where(inArray(usersTable.id, subjectIds))
        : [];
    const subjectMap = new Map(subjectUsers.map((u) => [u.id, u]));

    const result = paginated.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
      deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
      subjectName: r.subjectId ? (subjectMap.get(r.subjectId)?.name ?? null) : null,
      subjectPhone: r.subjectId ? (subjectMap.get(r.subjectId)?.phone ?? null) : null,
    }));

    /* ── StarBreakdown from all reviews (not just current page) ── */
    const starBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of allReviews) {
      const s = Number(r.rating);
      if (s >= 1 && s <= 5) starBreakdown[s] = (starBreakdown[s] ?? 0) + 1;
    }

    sendSuccess(res, {
      reviews: result,
      total: totalCount,
      pages: Math.ceil(totalCount / limitNum),
      starBreakdown,
    });
  } catch (err) {
    logger.error({ err }, "[admin/reviews] GET failed");
    sendError(res, "Failed to fetch reviews", 500);
  }
});

/* ── GET /admin/reviews/moderation-queue ── */
router.get("/reviews/moderation-queue", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        orderType: reviewsTable.orderType,
        moderationNote: reviewsTable.moderationNote,
        createdAt: reviewsTable.createdAt,
        reviewerName: usersTable.name,
        reviewerPhone: usersTable.phone,
        userId: reviewsTable.userId,
      })
      .from(reviewsTable)
      .leftJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
      .where(
        and(eq(reviewsTable.status, "pending_moderation"), isNull(reviewsTable.deletedAt))
      )
      .orderBy(asc(reviewsTable.createdAt))
      .limit(100);
    sendSuccess(res, {
      reviews: rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })),
      total: rows.length,
    });
  } catch (err) {
    logger.error({ err }, "[admin/reviews/moderation-queue] GET failed");
    sendError(res, "Failed to fetch moderation queue", 500);
  }
});

/* ── PATCH /admin/reviews/:id/hide ── */
router.patch("/reviews/:id/hide", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [row] = await db.select({ hidden: reviewsTable.hidden }).from(reviewsTable).where(eq(reviewsTable.id, id)).limit(1);
    if (!row) return sendNotFound(res, "Review not found");
    await db.update(reviewsTable).set({ hidden: !row.hidden }).where(eq(reviewsTable.id, id));
    sendSuccess(res, { hidden: !row.hidden });
  } catch (err) {
    logger.error({ err }, "[admin/reviews/:id/hide] PATCH failed");
    sendError(res, "Failed to toggle visibility", 500);
  }
});

/* ── PATCH /admin/reviews/:id/approve ── */
router.patch("/reviews/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await db.update(reviewsTable).set({ status: "visible", hidden: false }).where(eq(reviewsTable.id, id));
    sendSuccess(res, { status: "visible" });
  } catch (err) {
    logger.error({ err }, "[admin/reviews/:id/approve] PATCH failed");
    sendError(res, "Failed to approve review", 500);
  }
});

/* ── PATCH /admin/reviews/:id/reject ── */
router.patch("/reviews/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await db.update(reviewsTable).set({ status: "rejected", hidden: true }).where(eq(reviewsTable.id, id));
    sendSuccess(res, { status: "rejected" });
  } catch (err) {
    logger.error({ err }, "[admin/reviews/:id/reject] PATCH failed");
    sendError(res, "Failed to reject review", 500);
  }
});

/* ── DELETE /admin/reviews/:id ── */
router.delete("/reviews/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await db.update(reviewsTable).set({ deletedAt: new Date() }).where(eq(reviewsTable.id, id));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error({ err }, "[admin/reviews/:id] DELETE failed");
    sendError(res, "Failed to delete review", 500);
  }
});

/* ── PATCH /admin/ride-ratings/:id/hide ── */
router.patch("/ride-ratings/:id/hide", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [row] = await db.select({ hidden: rideRatingsTable.hidden }).from(rideRatingsTable).where(eq(rideRatingsTable.id, id)).limit(1);
    if (!row) return sendNotFound(res, "Ride rating not found");
    await db.update(rideRatingsTable).set({ hidden: !row.hidden }).where(eq(rideRatingsTable.id, id));
    sendSuccess(res, { hidden: !row.hidden });
  } catch (err) {
    logger.error({ err }, "[admin/ride-ratings/:id/hide] PATCH failed");
    sendError(res, "Failed to toggle visibility", 500);
  }
});

/* ── DELETE /admin/ride-ratings/:id ── */
router.delete("/ride-ratings/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await db.update(rideRatingsTable).set({ deletedAt: new Date() }).where(eq(rideRatingsTable.id, id));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error({ err }, "[admin/ride-ratings/:id] DELETE failed");
    sendError(res, "Failed to delete ride rating", 500);
  }
});

/* ── GET /admin/reviews/export ── */
router.get("/reviews/export", async (req: Request, res: Response) => {
  try {
    const { status, type } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof and>[] = [];
    if (status && status !== "all") {
      if (status === "deleted") conditions.push(isNotNull(reviewsTable.deletedAt));
      else conditions.push(eq(reviewsTable.status, status), isNull(reviewsTable.deletedAt));
    }
    if (type === "order") conditions.push(sql`${reviewsTable.orderType} != 'ride'`);
    else if (type === "ride") conditions.push(eq(reviewsTable.orderType, "ride"));
    const csvEsc = (v: unknown): string => {
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const COLS = ["id","orderType","orderId","rating","riderRating","comment","status","hidden","vendorReply","createdAt","reviewerName","reviewerPhone"] as const;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reviews-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader("Transfer-Encoding", "chunked");
    res.write(COLS.join(",") + "\n");

    /* Stream in batches of 500 — avoids loading all rows into memory at once */
    const BATCH = 500;
    let offset = 0;
    let fetched = 0;
    do {
      const rows = await db
        .select({
          id: reviewsTable.id,
          orderType: reviewsTable.orderType,
          orderId: reviewsTable.orderId,
          rating: reviewsTable.rating,
          riderRating: reviewsTable.riderRating,
          comment: reviewsTable.comment,
          status: reviewsTable.status,
          hidden: reviewsTable.hidden,
          vendorReply: reviewsTable.vendorReply,
          createdAt: reviewsTable.createdAt,
          reviewerName: usersTable.name,
          reviewerPhone: usersTable.phone,
        })
        .from(reviewsTable)
        .leftJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(reviewsTable.createdAt))
        .limit(BATCH)
        .offset(offset);
      fetched = rows.length;
      for (const r of rows) {
        res.write(
          [r.id, r.orderType, r.orderId, r.rating, r.riderRating, r.comment, r.status, r.hidden, r.vendorReply, new Date(r.createdAt).toISOString(), r.reviewerName, r.reviewerPhone]
            .map(csvEsc)
            .join(",") + "\n"
        );
      }
      offset += BATCH;
    } while (fetched === BATCH);

    res.end();
  } catch (err) {
    logger.error({ err }, "[admin/reviews/export] GET failed");
    sendError(res, "Export failed", 500);
  }
});

/* ── POST /admin/reviews/import ── */
router.post("/reviews/import", async (req: Request, res: Response) => {
  try {
    const { csvData } = req.body as { csvData?: string };
    if (!csvData?.trim()) return sendValidationError(res, "csvData is required");
    /* RFC 4180-compliant CSV field parser — handles quoted fields with commas/newlines */
    const parseCsvLine = (line: string): string[] => {
      const fields: string[] = [];
      let i = 0;
      while (i < line.length) {
        if (line[i] === '"') {
          let val = "";
          i++; // skip opening quote
          while (i < line.length) {
            if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
            else if (line[i] === '"') { i++; break; }
            else { val += line[i++]; }
          }
          fields.push(val);
          if (line[i] === ",") i++;
        } else {
          const end = line.indexOf(",", i);
          if (end === -1) { fields.push(line.slice(i).trim()); break; }
          fields.push(line.slice(i, end).trim());
          i = end + 1;
        }
      }
      return fields;
    };

    const lines = csvData.trim().split(/\r?\n/);
    const header = parseCsvLine(lines[0] ?? "").map((h) => h.replace(/^"|"$/g, "").trim());
    let imported = 0;
    let skipped = 0;
    let errored = 0;
    for (let i = 1; i < lines.length; i++) {
      try {
        const rawLine = lines[i]?.trim();
        if (!rawLine) { skipped++; continue; }
        const cols = parseCsvLine(rawLine);
        if (cols.length < 3) { skipped++; continue; }
        const row: Record<string, string> = {};
        header.forEach((h, idx) => { row[h] = (cols[idx] ?? "").trim(); });
        const stars = parseInt(row.stars ?? row.rating ?? "", 10);
        if (!row.orderType || !row.orderId || isNaN(stars)) { skipped++; continue; }
        const id = generateId();
        await db.insert(reviewsTable).values({
          id,
          orderId: row.orderId,
          userId: row.userId || "ajkmart_system",
          vendorId: row.vendorId || null,
          riderId: row.riderId || null,
          orderType: row.orderType,
          rating: Math.min(5, Math.max(1, stars)),
          comment: row.comment || null,
          status: (row.status as "visible" | "pending_moderation" | "rejected") || "visible",
          vendorReply: row.vendorReply || null,
        }).onConflictDoNothing();
        imported++;
      } catch {
        errored++;
      }
    }
    sendSuccess(res, { imported, skipped, errored });
  } catch (err) {
    logger.error({ err }, "[admin/reviews/import] POST failed");
    sendError(res, "Import failed", 500);
  }
});

export default router;
