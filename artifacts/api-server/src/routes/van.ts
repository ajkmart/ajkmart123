import { db } from "@workspace/db";
import {
  accountConditionsTable,
  liveLocationsTable,
  notificationsTable,
  usersTable,
  vanBookingsTable,
  vanDriversTable,
  vanRoutesTable,
  vanSchedulesTable,
  vanVehiclesTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { and, asc, count, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
} from "../lib/response.js";
import { emitVanLocation, emitVanTripUpdate } from "../lib/socketio.js";
import { sendPushToUser } from "../lib/webpush.js";
import { paymentLimiter } from "../middleware/rate-limit.js";
import { customerAuth, riderAuth } from "../middleware/security.js";
import { getCachedSettings } from "./admin-shared.js";
import { adminAuth } from "./admin.js";
import { evaluateRulesForUser } from "./admin/conditions.js";

/* ═══════════════════════════════════════════════════════════════
   Helper: get van settings from platform_settings
═══════════════════════════════════════════════════════════════ */
async function getVanSettings() {
  try {
    const s = await getCachedSettings();
    return {
      minAdvanceHours: parseInt(s["van_min_advance_hours"] ?? "2"),
      maxSeatsPerBooking: parseInt(s["van_max_seats_per_booking"] ?? "4"),
      cancellationWindowH: parseInt(s["van_cancellation_window_hours"] ?? "1"),
      refundType: s["van_refund_type"] ?? "full",
      refundPartialPct: parseInt(s["van_refund_partial_pct"] ?? "50"),
      seatHoldMinutes: parseInt(s["van_seat_hold_minutes"] ?? "10"),
      minPassengers: parseInt(s["van_min_passengers"] ?? "3"),
      minCheckHoursBefore: parseInt(s["van_min_check_hours_before"] ?? "4"),
      maxDriverTripsDay: parseInt(s["van_max_driver_trips_day"] ?? "5"),
      driverRestHours: parseInt(s["van_driver_rest_hours"] ?? "2"),
      peakSurchargePct: parseFloat(s["van_peak_surcharge_pct"] ?? "0"),
      peakHours: s["van_peak_hours"] ?? "07:00-09:00,17:00-19:00",
      weekendSurchargePct: parseFloat(s["van_weekend_surcharge_pct"] ?? "0"),
      holidaySurchargePct: parseFloat(s["van_holiday_surcharge_pct"] ?? "0"),
      holidayDates: (() => {
        try {
          return JSON.parse(s["van_holiday_dates"] ?? "[]") as string[];
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "[van] Invalid holiday_dates JSON — using empty list"
          );
          return [] as string[];
        }
      })(),
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[van] getVanSettings failed"
    );
    throw err;
  }
}

function isInPeakHours(timeStr: string, peakHoursSpec: string): boolean {
  if (!peakHoursSpec) return false;
  const [hh, mm] = timeStr.split(":").map(Number);
  const mins = (hh ?? 0) * 60 + (mm ?? 0);
  const ranges = peakHoursSpec.split(",").map((r) => r.trim());
  for (const range of ranges) {
    const [start, end] = range.split("-");
    if (!start || !end) continue;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMins = (sh ?? 0) * 60 + (sm ?? 0);
    const endMins = (eh ?? 0) * 60 + (em ?? 0);
    if (mins >= startMins && mins < endMins) return true;
  }
  return false;
}

function calculateSurcharge(
  farePerSeat: number,
  seatCount: number,
  departureTime: string,
  travelDate: string,
  vs: Awaited<ReturnType<typeof getVanSettings>>
): number {
  let surchargeMultiplier = 1;
  if (vs.peakSurchargePct > 0 && isInPeakHours(departureTime, vs.peakHours)) {
    surchargeMultiplier += vs.peakSurchargePct / 100;
  }
  const dayOfWeek = new Date(travelDate + "T00:00:00").getDay();
  if (vs.weekendSurchargePct > 0 && (dayOfWeek === 0 || dayOfWeek === 6)) {
    surchargeMultiplier += vs.weekendSurchargePct / 100;
  }
  if (vs.holidaySurchargePct > 0 && vs.holidayDates.includes(travelDate)) {
    surchargeMultiplier += vs.holidaySurchargePct / 100;
  }
  return farePerSeat * seatCount * surchargeMultiplier;
}

const router = Router();

async function vanDriverAuth(req: Request, res: Response, next: NextFunction) {
  void riderAuth(req, res, async () => {
    try {
      const driverId = req.riderId;
      if (!driverId) {
        sendForbidden(res, "Authentication required.");
        return;
      }
      const [driver] = await db
        .select({
          id: vanDriversTable.id,
          approvalStatus: vanDriversTable.approvalStatus,
          isActive: vanDriversTable.isActive,
        })
        .from(vanDriversTable)
        .where(and(eq(vanDriversTable.userId, driverId), eq(vanDriversTable.isActive, true)))
        .limit(1);
      if (!driver) {
        sendForbidden(res, "You are not registered as a van driver.");
        return;
      }
      if (driver.approvalStatus !== "approved") {
        sendForbidden(res, "Van driver account is not approved.");
        return;
      }

      // Block when an active suspension/ban or van-service restriction is in force
      const blockingConditions = await db
        .select({
          id: accountConditionsTable.id,
          conditionType: accountConditionsTable.conditionType,
          severity: accountConditionsTable.severity,
          reason: accountConditionsTable.reason,
          expiresAt: accountConditionsTable.expiresAt,
        })
        .from(accountConditionsTable)
        .where(
          and(
            eq(accountConditionsTable.userId, driverId),
            eq(accountConditionsTable.isActive, true)
          )
        );

      const now = Date.now();
      const blocker = blockingConditions.find((c) => {
        if (c.expiresAt && c.expiresAt.getTime() < now) return false;
        if (c.severity === "ban" || c.severity === "suspension") return true;
        if (
          c.conditionType === "restriction_service_block" ||
          c.conditionType === "restriction_new_order_block"
        )
          return true;
        return false;
      });
      if (blocker) {
        sendForbidden(
          res,
          `Van driver mode unavailable: ${blocker.reason || blocker.conditionType}`
        );
        return;
      }
      next();
    } catch (_e) {
      sendError(res, "Authorization check failed.", 500);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   Helper: seat tier info from seat layout
═══════════════════════════════════════════════════════════════ */
type SeatTier = "window" | "aisle" | "economy";
interface SeatLayoutInfo {
  seatsPerRow: number;
  seats: Record<string, SeatTier>;
}

function parseSeatLayout(raw: unknown, totalSeats: number): SeatLayoutInfo {
  const layout = raw as Record<string, unknown> | null;
  const seatsPerRow = (layout?.seatsPerRow as number) ?? 4;
  const seats: Record<string, SeatTier> = {};
  const seatTiers = layout?.seats as Record<string, string> | undefined;
  for (let i = 1; i <= totalSeats; i++) {
    if (seatTiers && seatTiers[String(i)]) {
      seats[String(i)] = seatTiers[String(i)] as SeatTier;
    } else {
      const posInRow = (i - 1) % seatsPerRow;
      const isLastRow = i > totalSeats - seatsPerRow;
      if (isLastRow) seats[String(i)] = "economy";
      else if (posInRow === 0 || posInRow === seatsPerRow - 1) seats[String(i)] = "window";
      else seats[String(i)] = "aisle";
    }
  }
  return { seatsPerRow, seats };
}

function getSeatFare(
  tier: SeatTier,
  route: {
    farePerSeat: string;
    fareWindow?: string | null;
    fareAisle?: string | null;
    fareEconomy?: string | null;
  }
): number {
  if (tier === "window" && route.fareWindow) return parseFloat(String(route.fareWindow));
  if (tier === "aisle" && route.fareAisle) return parseFloat(String(route.fareAisle));
  if (tier === "economy" && route.fareEconomy) return parseFloat(String(route.fareEconomy));
  return parseFloat(String(route.farePerSeat));
}

/* ═══════════════════════════════════════════════════════════════
   Helper: get confirmed seat count for a schedule on a date
═══════════════════════════════════════════════════════════════ */
async function getBookedSeats(scheduleId: string, travelDate: string): Promise<number[]> {
  const bookings = await db
    .select({ seatNumbers: vanBookingsTable.seatNumbers })
    .from(vanBookingsTable)
    .where(
      and(
        eq(vanBookingsTable.scheduleId, scheduleId),
        eq(vanBookingsTable.travelDate, travelDate),
        sql`status NOT IN ('cancelled')`
      )
    );
  const booked: number[] = [];
  for (const b of bookings) {
    const seats = Array.isArray(b.seatNumbers) ? (b.seatNumbers as number[]) : [];
    booked.push(...seats);
  }
  return booked;
}

async function getVanCodeForSchedule(scheduleId: string): Promise<string | null> {
  const [schedule] = await db
    .select({ driverId: vanSchedulesTable.driverId })
    .from(vanSchedulesTable)
    .where(eq(vanSchedulesTable.id, scheduleId))
    .limit(1);
  if (!schedule?.driverId) return null;
  const [driver] = await db
    .select({ vanCode: vanDriversTable.vanCode })
    .from(vanDriversTable)
    .where(eq(vanDriversTable.userId, schedule.driverId))
    .limit(1);
  return driver?.vanCode ?? null;
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC — Customer endpoints
═══════════════════════════════════════════════════════════════ */

router.get("/routes", async (_req, res, next) => {
  try {
    const routes = await db
      .select()
      .from(vanRoutesTable)
      .where(eq(vanRoutesTable.isActive, true))
      .orderBy(asc(vanRoutesTable.sortOrder), asc(vanRoutesTable.name));
    sendSuccess(res, routes);
  } catch (e) {
    next(e);
  }
});

router.get("/routes/:id", async (req, res, next) => {
  try {
    const [route] = await db
      .select()
      .from(vanRoutesTable)
      .where(eq(vanRoutesTable.id, req.params["id"] as string))
      .limit(1);
    if (!route) {
      sendNotFound(res, "Route not found.");
      return;
    }

    const schedules = await db
      .select({
        id: vanSchedulesTable.id,
        routeId: vanSchedulesTable.routeId,
        vehicleId: vanSchedulesTable.vehicleId,
        departureTime: vanSchedulesTable.departureTime,
        returnTime: vanSchedulesTable.returnTime,
        daysOfWeek: vanSchedulesTable.daysOfWeek,
        isActive: vanSchedulesTable.isActive,
        totalSeats: vanVehiclesTable.totalSeats,
        vehiclePlate: vanVehiclesTable.plateNumber,
        vehicleModel: vanVehiclesTable.model,
        seatLayout: vanVehiclesTable.seatLayout,
      })
      .from(vanSchedulesTable)
      .leftJoin(vanVehiclesTable, eq(vanSchedulesTable.vehicleId, vanVehiclesTable.id))
      .where(and(eq(vanSchedulesTable.routeId, route.id), eq(vanSchedulesTable.isActive, true)));

    const enrichedSchedules = await Promise.all(
      schedules.map(async (s) => {
        const vanCode = await getVanCodeForSchedule(s.id);
        return { ...s, vanCode };
      })
    );

    sendSuccess(res, { ...route, schedules: enrichedSchedules });
  } catch (e) {
    next(e);
  }
});

router.get("/schedules/:id/availability", async (req, res, next) => {
  try {
    const scheduleId = req.params["id"] as string;
    const date = String(req.query["date"] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      sendError(res, "date query param required (YYYY-MM-DD).", 400);
      return;
    }

    const [schedule] = await db
      .select({
        id: vanSchedulesTable.id,
        routeId: vanSchedulesTable.routeId,
        daysOfWeek: vanSchedulesTable.daysOfWeek,
        departureTime: vanSchedulesTable.departureTime,
        returnTime: vanSchedulesTable.returnTime,
        isActive: vanSchedulesTable.isActive,
        tripStatus: vanSchedulesTable.tripStatus,
        totalSeats: vanVehiclesTable.totalSeats,
        seatLayout: vanVehiclesTable.seatLayout,
        vehiclePlate: vanVehiclesTable.plateNumber,
        vehicleModel: vanVehiclesTable.model,
      })
      .from(vanSchedulesTable)
      .leftJoin(vanVehiclesTable, eq(vanSchedulesTable.vehicleId, vanVehiclesTable.id))
      .where(eq(vanSchedulesTable.id, scheduleId))
      .limit(1);

    if (!schedule || !schedule.isActive) {
      sendNotFound(res, "Schedule not found.");
      return;
    }

    const reqDate = new Date(date + "T00:00:00");
    const dayOfWeek = reqDate.getDay() === 0 ? 7 : reqDate.getDay();
    const daysArr = Array.isArray(schedule.daysOfWeek) ? (schedule.daysOfWeek as number[]) : [];
    const totalSeats = schedule.totalSeats ?? 12;
    const layoutInfo = parseSeatLayout(schedule.seatLayout, totalSeats);

    if (!daysArr.includes(dayOfWeek)) {
      sendSuccess(res, {
        scheduleId,
        date,
        available: false,
        reason: "not_running_this_day",
        bookedSeats: [],
        totalSeats,
        seatsPerRow: layoutInfo.seatsPerRow,
        seatTiers: layoutInfo.seats,
      });
      return;
    }

    const [route] = await db
      .select({
        farePerSeat: vanRoutesTable.farePerSeat,
        fareWindow: vanRoutesTable.fareWindow,
        fareAisle: vanRoutesTable.fareAisle,
        fareEconomy: vanRoutesTable.fareEconomy,
      })
      .from(vanRoutesTable)
      .where(eq(vanRoutesTable.id, schedule.routeId))
      .limit(1);

    const vanCode = await getVanCodeForSchedule(scheduleId);
    const bookedSeats = await getBookedSeats(scheduleId, date);
    const availableSeats = totalSeats - bookedSeats.length;

    const fareWindow = route?.fareWindow
      ? parseFloat(String(route.fareWindow))
      : parseFloat(String(route?.farePerSeat ?? "0"));
    const fareAisle = route?.fareAisle
      ? parseFloat(String(route.fareAisle))
      : parseFloat(String(route?.farePerSeat ?? "0"));
    const fareEconomy = route?.fareEconomy
      ? parseFloat(String(route.fareEconomy))
      : parseFloat(String(route?.farePerSeat ?? "0"));

    sendSuccess(res, {
      scheduleId,
      date,
      available: availableSeats > 0,
      bookedSeats,
      availableSeats,
      totalSeats,
      seatsPerRow: layoutInfo.seatsPerRow,
      seatTiers: layoutInfo.seats,
      fareWindow,
      fareAisle,
      fareEconomy,
      farePerSeat: route?.farePerSeat ? parseFloat(String(route.farePerSeat)) : 0,
      departureTime: schedule.departureTime,
      returnTime: schedule.returnTime,
      vehiclePlate: schedule.vehiclePlate,
      vehicleModel: schedule.vehicleModel,
      tripStatus: schedule.tripStatus,
      vanCode,
    });
  } catch (e) {
    next(e);
  }
});

/* ═══════════════════════════════════════════════════════════════
   CUSTOMER — authenticated booking endpoints
═══════════════════════════════════════════════════════════════ */

const bookVanSchema = z.object({
  scheduleId: z.string().min(1),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "travelDate must be YYYY-MM-DD"),
  seatNumbers: z.array(z.number().int().min(1)).min(1).max(10),
  paymentMethod: z.enum(["cash", "wallet"]).default("cash"),
  passengerName: z.string().max(80).optional(),
  passengerPhone: z.string().max(20).optional(),
});

router.post("/bookings", customerAuth, paymentLimiter, async (req, res, _next) => {
  const userId = req.customerId!;
  const parsed = bookVanSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    sendError(res, msg, 422);
    return;
  }
  const { scheduleId, travelDate, seatNumbers, paymentMethod, passengerName, passengerPhone } =
    parsed.data;

  try {
    /* ── Feature flag + maintenance gate (mirrors orders/rides/pharmacy/parcel) ── */
    const ps = await getCachedSettings();
    if ((ps["feature_van"] ?? "on") !== "on") {
      sendError(res, "Van service is currently disabled", 503);
      return;
    }
    if ((ps["app_status"] ?? "active") === "maintenance") {
      const mainKey = (ps["security_maintenance_key"] ?? "").trim();
      const bypass = ((req.headers["x-maintenance-key"] as string) ?? "").trim();
      if (!mainKey || bypass !== mainKey) {
        sendError(
          res,
          ps["content_maintenance_msg"] ?? "We're performing scheduled maintenance. Back soon!",
          503
        );
        return;
      }
    }

    const vs = await getVanSettings();

    /* Enforce max seats per booking */
    if (seatNumbers.length > vs.maxSeatsPerBooking) {
      sendError(res, `Maximum ${vs.maxSeatsPerBooking} seats per booking allowed.`, 400);
      return;
    }

    /* Validate travel date is today or future */
    const todayStr = new Date().toISOString().split("T")[0]!;
    if (travelDate < todayStr) {
      sendError(res, "Travel date cannot be in the past.", 400);
      return;
    }

    const [schedule] = await db
      .select({
        id: vanSchedulesTable.id,
        routeId: vanSchedulesTable.routeId,
        driverId: vanSchedulesTable.driverId,
        daysOfWeek: vanSchedulesTable.daysOfWeek,
        isActive: vanSchedulesTable.isActive,
        vehicleId: vanSchedulesTable.vehicleId,
        departureTime: vanSchedulesTable.departureTime,
        totalSeats: vanVehiclesTable.totalSeats,
        seatLayout: vanVehiclesTable.seatLayout,
      })
      .from(vanSchedulesTable)
      .leftJoin(vanVehiclesTable, eq(vanSchedulesTable.vehicleId, vanVehiclesTable.id))
      .where(eq(vanSchedulesTable.id, scheduleId))
      .limit(1);

    if (!schedule || !schedule.isActive) {
      sendError(res, "Schedule not found or inactive.", 404);
      return;
    }

    /* Enforce advance booking window */
    const departureDateTime = new Date(`${travelDate}T${schedule.departureTime ?? "00:00"}:00`);
    const hoursUntilDeparture = (departureDateTime.getTime() - Date.now()) / 3_600_000;
    if (vs.minAdvanceHours > 0 && hoursUntilDeparture < vs.minAdvanceHours) {
      sendError(
        res,
        `Booking must be made at least ${vs.minAdvanceHours} hour(s) before departure.`,
        400
      );
      return;
    }

    /* Validate day of week */
    const reqDate = new Date(travelDate + "T00:00:00");
    const dayOfWeek = reqDate.getDay() === 0 ? 7 : reqDate.getDay();
    const daysArr = Array.isArray(schedule.daysOfWeek) ? (schedule.daysOfWeek as number[]) : [];
    if (!daysArr.includes(dayOfWeek)) {
      sendError(res, "Van does not operate on this day.", 400);
      return;
    }

    const [route] = await db
      .select()
      .from(vanRoutesTable)
      .where(eq(vanRoutesTable.id, schedule.routeId))
      .limit(1);
    if (!route) {
      sendError(res, "Route not found.", 404);
      return;
    }

    const totalSeats = schedule.totalSeats ?? 12;
    const layoutInfo = parseSeatLayout(schedule.seatLayout, totalSeats);

    const seatTiers: Record<string, SeatTier> = {};
    const tierBreakdown: Record<string, { count: number; fare: number }> = {};
    let baseFare = 0;
    for (const seatNum of seatNumbers) {
      const tier = layoutInfo.seats[String(seatNum)] || "aisle";
      seatTiers[String(seatNum)] = tier;
      const fare = getSeatFare(tier, route);
      baseFare += fare;
      if (!tierBreakdown[tier]) tierBreakdown[tier] = { count: 0, fare };
      tierBreakdown[tier]!.count++;
    }
    const totalFare = calculateSurcharge(
      baseFare / seatNumbers.length,
      seatNumbers.length,
      schedule.departureTime,
      travelDate,
      vs
    );

    const booking = await db.transaction(async (tx) => {
      const bookedSeats = await getBookedSeats(scheduleId, travelDate);
      const conflict = seatNumbers.filter((s) => bookedSeats.includes(s));
      if (conflict.length > 0) {
        throw new Error(`Seat(s) ${conflict.join(", ")} already booked.`);
      }
      if (bookedSeats.length + seatNumbers.length > totalSeats) {
        throw new Error("Not enough seats available.");
      }
      for (const s of seatNumbers) {
        if (s < 1 || s > totalSeats)
          throw new Error(`Seat ${s} is out of range (1-${totalSeats}).`);
      }

      if (paymentMethod === "wallet") {
        const [userRow] = await tx
          .select({ walletBalance: usersTable.walletBalance })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .for("update")
          .limit(1);
        const balance = parseFloat(String(userRow?.walletBalance ?? "0"));
        if (balance < totalFare) {
          throw new Error(
            `Insufficient wallet balance. Required: Rs ${totalFare.toFixed(0)}, Available: Rs ${balance.toFixed(0)}.`
          );
        }
        await tx
          .update(usersTable)
          .set({
            walletBalance: String(balance - totalFare),
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, userId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "debit",
          amount: totalFare.toFixed(2),
          description: `Van seat booking – ${route.name} (${seatNumbers.length} seat${seatNumbers.length > 1 ? "s" : ""})`,
          reference: `van:pending`,
          createdAt: new Date(),
        });
      }

      const bookingId = generateId();
      const tierKeys = Object.keys(tierBreakdown);
      const primaryTier = tierKeys.length === 1 ? tierKeys[0]! : "mixed";

      const [newBooking] = await tx
        .insert(vanBookingsTable)
        .values({
          id: bookingId,
          userId,
          scheduleId,
          routeId: route.id,
          seatNumbers,
          seatTiers,
          tierLabel: primaryTier,
          pricePaid: totalFare.toFixed(2),
          travelDate,
          status: "confirmed",
          fare: totalFare.toFixed(2),
          tierBreakdown,
          paymentMethod,
          passengerName: passengerName || null,
          passengerPhone: passengerPhone || null,
        })
        .returning();

      if (paymentMethod === "wallet") {
        await tx
          .update(walletTransactionsTable)
          .set({ reference: `van:${bookingId}` })
          .where(
            and(
              eq(walletTransactionsTable.userId, userId),
              eq(walletTransactionsTable.reference, "van:pending")
            )
          );
      }

      return newBooking!;
    });

    const vanCode = await getVanCodeForSchedule(scheduleId);

    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId,
        title: "Van Seat Confirmed",
        body: `${seatNumbers.length} seat${seatNumbers.length > 1 ? "s" : ""} booked on ${route.name} for ${travelDate}. Seats: ${seatNumbers.join(", ")}. Total: Rs ${totalFare.toFixed(0)}.`,
        type: "van",
        icon: "bus-outline",
        link: `/van/bookings`,
      })
      .catch((err: unknown) => {
        logger.warn(
          {
            message: "[van] booking-confirmed notification insert failed",
            error: err instanceof Error ? err.message : String(err),
            code: "VAN_NOTIF_INSERT_FAILED",
            correlationId: null,
            timestamp: new Date().toISOString(),
            userId,
          },
          "[van] booking-confirmed notification insert failed"
        );
      });

    sendPushToUser(userId, {
      title: "Van Booking Confirmed",
      body: `${seatNumbers.length} seat(s) on ${route.name} for ${travelDate}. Rs ${totalFare.toFixed(0)}.`,
      data: { type: "van_booking_confirmed", bookingId: booking.id },
    }).catch((err: unknown) => {
      logger.warn(
        {
          message: "[van] booking-confirmed push to passenger failed",
          error: err instanceof Error ? err.message : String(err),
          code: "VAN_PUSH_PASSENGER_FAILED",
          correlationId: null,
          timestamp: new Date().toISOString(),
          userId,
          bookingId: booking.id,
        },
        "[van] booking-confirmed push to passenger failed"
      );
    });

    if (schedule.driverId) {
      sendPushToUser(schedule.driverId, {
        title: "New Van Passenger",
        body: `${seatNumbers.length} seat(s) booked on ${route.name} for ${travelDate}. Seats: ${seatNumbers.join(", ")}.`,
        data: { type: "van_new_passenger", scheduleId, travelDate },
      }).catch((err: unknown) => {
        logger.warn(
          {
            message: "[van] new-passenger push to driver failed",
            error: err instanceof Error ? err.message : String(err),
            code: "VAN_PUSH_DRIVER_FAILED",
            correlationId: null,
            timestamp: new Date().toISOString(),
            driverId: schedule.driverId,
            scheduleId,
          },
          "[van] new-passenger push to driver failed"
        );
      });
    }

    sendCreated(res, {
      ...booking,
      routeName: route.name,
      totalFare,
      tierBreakdown,
      vanCode,
    });
  } catch (e) {
    logger.error({ err: e }, "[van] book seats error");
    sendError(res, (e as Error).message || "Booking failed.", 400);
  }
});

router.get("/bookings", customerAuth, async (req, res, next) => {
  try {
    const userId = req.customerId!;
    const bookings = await db
      .select({
        id: vanBookingsTable.id,
        scheduleId: vanBookingsTable.scheduleId,
        routeId: vanBookingsTable.routeId,
        seatNumbers: vanBookingsTable.seatNumbers,
        seatTiers: vanBookingsTable.seatTiers,
        tierBreakdown: vanBookingsTable.tierBreakdown,
        travelDate: vanBookingsTable.travelDate,
        status: vanBookingsTable.status,
        fare: vanBookingsTable.fare,
        paymentMethod: vanBookingsTable.paymentMethod,
        passengerName: vanBookingsTable.passengerName,
        passengerPhone: vanBookingsTable.passengerPhone,
        boardedAt: vanBookingsTable.boardedAt,
        completedAt: vanBookingsTable.completedAt,
        cancelledAt: vanBookingsTable.cancelledAt,
        createdAt: vanBookingsTable.createdAt,
        routeName: vanRoutesTable.name,
        routeFrom: vanRoutesTable.fromAddress,
        routeTo: vanRoutesTable.toAddress,
        departureTime: vanSchedulesTable.departureTime,
        tripStatus: vanSchedulesTable.tripStatus,
      })
      .from(vanBookingsTable)
      .leftJoin(vanRoutesTable, eq(vanBookingsTable.routeId, vanRoutesTable.id))
      .leftJoin(vanSchedulesTable, eq(vanBookingsTable.scheduleId, vanSchedulesTable.id))
      .where(eq(vanBookingsTable.userId, userId))
      .orderBy(desc(vanBookingsTable.createdAt));

    const enriched = await Promise.all(
      bookings.map(async (b) => {
        const vanCode = await getVanCodeForSchedule(b.scheduleId);
        return { ...b, vanCode };
      })
    );

    sendSuccess(res, enriched);
  } catch (e) {
    next(e);
  }
});

router.patch("/bookings/:id/cancel", customerAuth, async (req, res, _next) => {
  try {
    const userId = req.customerId!;
    const bookingId = req.params["id"] as string;
    const reason = String(req.body?.reason ?? "customer_cancelled");

    const [booking] = await db
      .select()
      .from(vanBookingsTable)
      .where(and(eq(vanBookingsTable.id, bookingId), eq(vanBookingsTable.userId, userId)))
      .limit(1);

    if (!booking) {
      sendNotFound(res, "Booking not found.");
      return;
    }
    if (booking.status === "cancelled") {
      sendError(res, "Booking already cancelled.", 400);
      return;
    }
    if (booking.status === "completed") {
      sendError(res, "Cannot cancel a completed booking.", 400);
      return;
    }

    const vs = await getVanSettings();

    /* Check cancellation window from settings */
    const [schedule] = await db
      .select({ departureTime: vanSchedulesTable.departureTime })
      .from(vanSchedulesTable)
      .where(eq(vanSchedulesTable.id, booking.scheduleId))
      .limit(1);
    const departureDateTime = new Date(
      `${booking.travelDate}T${schedule?.departureTime ?? "00:00"}:00`
    );
    const hoursBeforeDeparture = (departureDateTime.getTime() - Date.now()) / 3_600_000;
    if (hoursBeforeDeparture < vs.cancellationWindowH) {
      sendError(
        res,
        `Cannot cancel less than ${vs.cancellationWindowH} hour(s) before departure.`,
        400
      );
      return;
    }

    /* Calculate refund based on settings */
    const originalFare = parseFloat(String(booking.fare));
    let refundAmount = 0;
    if (vs.refundType === "full") {
      refundAmount = originalFare;
    } else if (vs.refundType === "partial") {
      refundAmount = originalFare * (vs.refundPartialPct / 100);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(vanBookingsTable)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(vanBookingsTable.id, bookingId));

      /* Refund wallet payment based on refund policy */
      if (booking.paymentMethod === "wallet" && refundAmount > 0) {
        const [userRow] = await tx
          .select({ walletBalance: usersTable.walletBalance })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .for("update")
          .limit(1);
        const bal = parseFloat(String(userRow?.walletBalance ?? "0"));
        await tx
          .update(usersTable)
          .set({
            walletBalance: String(bal + refundAmount),
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, userId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "credit",
          amount: refundAmount.toFixed(2),
          description: `Van booking refund (${vs.refundType === "full" ? "full" : vs.refundPartialPct + "%"}) – cancelled`,
          reference: `van_refund:${bookingId}`,
          createdAt: new Date(),
        });
      }
    });

    sendPushToUser(userId, {
      title: "Van Booking Cancelled",
      body: `Your van booking has been cancelled.${refundAmount > 0 ? ` Refund of Rs ${refundAmount.toFixed(0)} (${vs.refundType}) has been processed.` : ""}`,
      data: { type: "van_refund" },
    }).catch((err: unknown) => {
      logger.warn(
        {
          message: "[van] booking-cancelled push failed",
          error: err instanceof Error ? err.message : String(err),
          code: "VAN_PUSH_CANCEL_FAILED",
          correlationId: null,
          timestamp: new Date().toISOString(),
          userId,
        },
        "[van] booking-cancelled push failed"
      );
    });

    sendSuccess(res, {
      message: "Booking cancelled successfully.",
      refundAmount,
      refundType: vs.refundType,
    });
  } catch (e) {
    logger.error({ err: e }, "[van] cancel booking error");
    sendError(res, (e as Error).message || "Cancellation failed.", 400);
  }
});

/* ═══════════════════════════════════════════════════════════════
   RIDER (Van Driver) endpoints
═══════════════════════════════════════════════════════════════ */

router.get("/driver/today", vanDriverAuth, async (req, res, _next) => {
  try {
    const driverId = req.riderId!;
    const today = new Date().toISOString().split("T")[0]!;
    const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay();

    const [vanDriver] = await db
      .select({ vanCode: vanDriversTable.vanCode })
      .from(vanDriversTable)
      .where(eq(vanDriversTable.userId, driverId))
      .limit(1);

    const schedules = await db
      .select({
        id: vanSchedulesTable.id,
        routeId: vanSchedulesTable.routeId,
        departureTime: vanSchedulesTable.departureTime,
        returnTime: vanSchedulesTable.returnTime,
        daysOfWeek: vanSchedulesTable.daysOfWeek,
        tripStatus: vanSchedulesTable.tripStatus,
        routeName: vanRoutesTable.name,
        routeFrom: vanRoutesTable.fromAddress,
        routeTo: vanRoutesTable.toAddress,
        totalSeats: vanVehiclesTable.totalSeats,
        vehiclePlate: vanVehiclesTable.plateNumber,
        seatLayout: vanVehiclesTable.seatLayout,
      })
      .from(vanSchedulesTable)
      .leftJoin(vanRoutesTable, eq(vanSchedulesTable.routeId, vanRoutesTable.id))
      .leftJoin(vanVehiclesTable, eq(vanSchedulesTable.vehicleId, vanVehiclesTable.id))
      .where(and(eq(vanSchedulesTable.driverId, driverId), eq(vanSchedulesTable.isActive, true)));

    const todaySchedules = schedules.filter((s) => {
      const days = Array.isArray(s.daysOfWeek) ? (s.daysOfWeek as number[]) : [];
      return days.includes(todayDow);
    });

    const enriched = await Promise.all(
      todaySchedules.map(async (s) => {
        const bookedSeats = await getBookedSeats(s.id, today);
        const totalSeats = s.totalSeats ?? 12;
        const layoutInfo = parseSeatLayout(s.seatLayout, totalSeats);
        return {
          ...s,
          date: today,
          bookedCount: bookedSeats.length,
          bookedSeats,
          vanCode: vanDriver?.vanCode ?? null,
          seatTiers: layoutInfo.seats,
        };
      })
    );

    sendSuccess(res, enriched);
  } catch (e) {
    logger.error({ err: e }, "[van] driver today error");
    sendError(res, "Could not load today's schedule.", 500);
  }
});

router.get(
  "/driver/schedules/:scheduleId/date/:date/passengers",
  vanDriverAuth,
  async (req, res, next) => {
    try {
      const driverId = req.riderId!;
      const { scheduleId, date } = req.params as {
        scheduleId: string;
        date: string;
      };

      const [schedule] = await db
        .select({
          driverId: vanSchedulesTable.driverId,
          vehicleId: vanSchedulesTable.vehicleId,
        })
        .from(vanSchedulesTable)
        .where(and(eq(vanSchedulesTable.id, scheduleId), eq(vanSchedulesTable.driverId, driverId)))
        .limit(1);
      if (!schedule) {
        sendForbidden(res, "Not your schedule.");
        return;
      }

      const bookings = await db
        .select({
          id: vanBookingsTable.id,
          seatNumbers: vanBookingsTable.seatNumbers,
          seatTiers: vanBookingsTable.seatTiers,
          status: vanBookingsTable.status,
          passengerName: vanBookingsTable.passengerName,
          passengerPhone: vanBookingsTable.passengerPhone,
          paymentMethod: vanBookingsTable.paymentMethod,
          fare: vanBookingsTable.fare,
          boardedAt: vanBookingsTable.boardedAt,
          userName: usersTable.name,
          userPhone: usersTable.phone,
        })
        .from(vanBookingsTable)
        .leftJoin(usersTable, eq(vanBookingsTable.userId, usersTable.id))
        .where(
          and(
            eq(vanBookingsTable.scheduleId, scheduleId),
            eq(vanBookingsTable.travelDate, date),
            sql`${vanBookingsTable.status} NOT IN ('cancelled')`
          )
        )
        .orderBy(asc(vanBookingsTable.createdAt));

      sendSuccess(res, bookings);
    } catch (e) {
      next(e);
    }
  }
);

router.patch("/driver/bookings/:id/board", vanDriverAuth, async (req, res, next) => {
  try {
    const driverId = req.riderId!;
    const bookingId = req.params["id"] as string;

    const [booking] = await db
      .select({
        id: vanBookingsTable.id,
        scheduleId: vanBookingsTable.scheduleId,
        status: vanBookingsTable.status,
        userId: vanBookingsTable.userId,
        travelDate: vanBookingsTable.travelDate,
      })
      .from(vanBookingsTable)
      .where(eq(vanBookingsTable.id, bookingId))
      .limit(1);
    if (!booking) {
      sendNotFound(res, "Booking not found.");
      return;
    }

    const [schedule] = await db
      .select({ driverId: vanSchedulesTable.driverId })
      .from(vanSchedulesTable)
      .where(eq(vanSchedulesTable.id, booking.scheduleId))
      .limit(1);
    if (schedule?.driverId !== driverId) {
      sendForbidden(res, "Not authorized.");
      return;
    }

    if (booking.status !== "confirmed") {
      sendError(res, "Booking is not in confirmed state.", 400);
      return;
    }

    await db
      .update(vanBookingsTable)
      .set({ status: "boarded", boardedAt: new Date(), updatedAt: new Date() })
      .where(eq(vanBookingsTable.id, bookingId));

    sendPushToUser(booking.userId, {
      title: "You're Boarded!",
      body: "You have been marked as boarded on the van. Enjoy your ride!",
      data: { type: "van_boarded" },
    }).catch((err: unknown) => {
      logger.warn(
        {
          message: "[van] boarded push failed",
          error: err instanceof Error ? err.message : String(err),
          code: "VAN_PUSH_BOARDED_FAILED",
          correlationId: null,
          timestamp: new Date().toISOString(),
          userId: booking.userId,
          bookingId,
        },
        "[van] boarded push failed"
      );
    });

    emitVanTripUpdate(booking.scheduleId, booking.travelDate, {
      event: "passenger_boarded",
      data: { bookingId },
    });

    sendSuccess(res, { message: "Passenger marked as boarded." });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/driver/schedules/:scheduleId/date/:date/start-trip",
  vanDriverAuth,
  async (req, res, next) => {
    try {
      const driverId = req.riderId!;
      const { scheduleId, date } = req.params as {
        scheduleId: string;
        date: string;
      };

      const [schedule] = await db
        .select({
          driverId: vanSchedulesTable.driverId,
          tripStatus: vanSchedulesTable.tripStatus,
        })
        .from(vanSchedulesTable)
        .where(eq(vanSchedulesTable.id, scheduleId))
        .limit(1);
      if (schedule?.driverId !== driverId) {
        sendForbidden(res, "Not authorized.");
        return;
      }

      await db
        .update(vanSchedulesTable)
        .set({ tripStatus: "in_progress", updatedAt: new Date() })
        .where(eq(vanSchedulesTable.id, scheduleId));

      const bookings = await db
        .select({
          userId: vanBookingsTable.userId,
          status: vanBookingsTable.status,
        })
        .from(vanBookingsTable)
        .where(
          and(
            eq(vanBookingsTable.scheduleId, scheduleId),
            eq(vanBookingsTable.travelDate, date),
            sql`${vanBookingsTable.status} NOT IN ('cancelled')`
          )
        );

      for (const b of bookings) {
        if (b.status === "boarded") {
          sendPushToUser(b.userId, {
            title: "Van Departed!",
            body: "Your van has started the trip. Track it live in the app.",
            data: { type: "van_trip_started", scheduleId, date },
          }).catch((err: unknown) => {
            logger.warn(
              {
                message: "[van] trip-started push to boarded passenger failed",
                error: err instanceof Error ? err.message : String(err),
                code: "VAN_PUSH_TRIP_STARTED_FAILED",
                correlationId: null,
                timestamp: new Date().toISOString(),
                userId: b.userId,
                scheduleId,
              },
              "[van] trip-started push to boarded passenger failed"
            );
          });
        } else {
          sendPushToUser(b.userId, {
            title: "Departure Reminder",
            body: "Your van is departing now! Please board immediately or track the van live.",
            data: { type: "van_departure_reminder", scheduleId, date },
          }).catch((err: unknown) => {
            logger.warn(
              {
                message: "[van] departure-reminder push failed",
                error: err instanceof Error ? err.message : String(err),
                code: "VAN_PUSH_DEPARTURE_REMINDER_FAILED",
                correlationId: null,
                timestamp: new Date().toISOString(),
                userId: b.userId,
                scheduleId,
              },
              "[van] departure-reminder push failed"
            );
          });
        }
      }

      emitVanTripUpdate(scheduleId, date, { event: "trip_started" });

      sendSuccess(res, { message: "Trip started. GPS broadcasting enabled." });
    } catch (e) {
      next(e);
    }
  }
);

const vanDriverLocationSchema = z.object({
  scheduleId: z.string().min(1, "scheduleId is required"),
  date: z.string().min(1, "date is required"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().optional(),
  heading: z.number().optional(),
});

router.post("/driver/location", vanDriverAuth, async (req, res, _next) => {
  try {
    const driverId = req.riderId!;
    const parsed = vanDriverLocationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, parsed.error.issues[0]?.message || "Missing location data.", 400);
      return;
    }
    const { scheduleId, date, latitude, longitude, speed, heading } = parsed.data;

    const [schedule] = await db
      .select({
        driverId: vanSchedulesTable.driverId,
        tripStatus: vanSchedulesTable.tripStatus,
      })
      .from(vanSchedulesTable)
      .where(eq(vanSchedulesTable.id, scheduleId))
      .limit(1);
    if (!schedule || schedule.driverId !== driverId) {
      sendForbidden(res, "Not authorized for this schedule.");
      return;
    }
    if (schedule.tripStatus !== "in_progress") {
      sendError(res, "Trip is not in progress.", 400);
      return;
    }

    const now = new Date();
    emitVanLocation(scheduleId, date, {
      latitude,
      longitude,
      speed,
      heading,
      updatedAt: now.toISOString(),
    });

    await db
      .insert(liveLocationsTable)
      .values({
        userId: driverId,
        role: "van_driver",
        latitude: String(latitude),
        longitude: String(longitude),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: liveLocationsTable.userId,
        set: {
          latitude: String(latitude),
          longitude: String(longitude),
          updatedAt: now,
        },
      })
      .catch((e: Error) =>
        logger.warn(
          { err: e.message, driverId },
          "[van/driver/location] live_locations upsert failed"
        )
      );

    sendSuccess(res, { ok: true });
  } catch (_e) {
    sendError(res, "Failed to broadcast location.", 500);
  }
});

router.patch(
  "/driver/schedules/:scheduleId/date/:date/complete",
  vanDriverAuth,
  async (req, res, next) => {
    try {
      const driverId = req.riderId!;
      const { scheduleId, date } = req.params as {
        scheduleId: string;
        date: string;
      };

      const [schedule] = await db
        .select({ driverId: vanSchedulesTable.driverId })
        .from(vanSchedulesTable)
        .where(eq(vanSchedulesTable.id, scheduleId))
        .limit(1);
      if (schedule?.driverId !== driverId) {
        sendForbidden(res, "Not authorized.");
        return;
      }

      await db
        .update(vanBookingsTable)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(vanBookingsTable.scheduleId, scheduleId),
            eq(vanBookingsTable.travelDate, date),
            sql`${vanBookingsTable.status} NOT IN ('cancelled', 'completed')`
          )
        );

      await db
        .update(vanSchedulesTable)
        .set({ tripStatus: "completed", updatedAt: new Date() })
        .where(eq(vanSchedulesTable.id, scheduleId));

      const bookings = await db
        .select({ userId: vanBookingsTable.userId })
        .from(vanBookingsTable)
        .where(
          and(
            eq(vanBookingsTable.scheduleId, scheduleId),
            eq(vanBookingsTable.travelDate, date),
            eq(vanBookingsTable.status, "completed")
          )
        );

      for (const b of bookings) {
        sendPushToUser(b.userId, {
          title: "Trip Completed",
          body: "Your van trip has been completed. Thank you for riding with us!",
          data: { type: "van_completed" },
        }).catch((err: unknown) => {
          logger.warn(
            {
              message: "[van] trip-completed push failed",
              error: err instanceof Error ? err.message : String(err),
              code: "VAN_PUSH_TRIP_COMPLETED_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
              userId: b.userId,
              scheduleId,
            },
            "[van] trip-completed push failed"
          );
        });
      }

      emitVanTripUpdate(scheduleId, date, { event: "trip_completed" });

      sendSuccess(res, { message: "Trip completed." });
    } catch (e) {
      next(e);
    }
  }
);

/* ─── Driver eligibility: returns active blocking conditions + triggers rule engine ─── */
router.get("/driver/eligibility", riderAuth, async (req, res, next) => {
  try {
    const driverId = req.riderId!;
    const [driver] = await db
      .select({
        approvalStatus: vanDriversTable.approvalStatus,
        isActive: vanDriversTable.isActive,
      })
      .from(vanDriversTable)
      .where(and(eq(vanDriversTable.userId, driverId), eq(vanDriversTable.isActive, true)))
      .limit(1);

    if (!driver) {
      sendSuccess(res, {
        eligible: false,
        reason: "not_registered",
        conditions: [],
        triggered: [],
      });
      return;
    }
    if (driver.approvalStatus !== "approved") {
      sendSuccess(res, {
        eligible: false,
        reason: "not_approved",
        conditions: [],
        triggered: [],
      });
      return;
    }

    // Trigger rule engine deterministically — fail closed if it errors,
    // since this gate decides whether the driver may enter van mode.
    let triggered: Array<{
      ruleId: string;
      ruleName: string;
      metric: string;
      value: number;
      conditionId?: string;
    }> = [];
    let triggeredCount = 0;
    try {
      const result = await evaluateRulesForUser(driverId);
      triggered = result.details.triggered;
      triggeredCount = result.triggered;
    } catch (err) {
      logger.error({ err }, "[van] rule evaluation failed — denying van mode");
      sendSuccess(res, {
        eligible: false,
        reason: "Eligibility check failed. Please retry shortly or contact support.",
        conditions: [],
        triggered: [],
        triggeredCount: 0,
        evaluationError: true,
      });
      return;
    }

    const activeConditions = await db
      .select({
        id: accountConditionsTable.id,
        conditionType: accountConditionsTable.conditionType,
        severity: accountConditionsTable.severity,
        reason: accountConditionsTable.reason,
        expiresAt: accountConditionsTable.expiresAt,
      })
      .from(accountConditionsTable)
      .where(
        and(eq(accountConditionsTable.userId, driverId), eq(accountConditionsTable.isActive, true))
      );

    const now = Date.now();
    const blocker = activeConditions.find((c) => {
      if (c.expiresAt && c.expiresAt.getTime() < now) return false;
      if (c.severity === "ban" || c.severity === "suspension") return true;
      if (
        c.conditionType === "restriction_service_block" ||
        c.conditionType === "restriction_new_order_block"
      )
        return true;
      return false;
    });

    sendSuccess(res, {
      eligible: !blocker,
      reason: blocker ? blocker.reason || blocker.conditionType : null,
      conditions: activeConditions,
      triggered,
      triggeredCount,
    });
  } catch (e) {
    next(e);
  }
});

/* ─── Driver metrics: trips today, earnings today, online hours, 30d totals ─── */
router.get("/driver/metrics", vanDriverAuth, async (req, res, next) => {
  try {
    const driverId = req.riderId!;
    const now = new Date();
    const today = now.toISOString().split("T")[0]!;
    const startOfDay = new Date(today + "T00:00:00");
    const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const driverSchedules = await db
      .select({
        id: vanSchedulesTable.id,
        tripStatus: vanSchedulesTable.tripStatus,
      })
      .from(vanSchedulesTable)
      .where(eq(vanSchedulesTable.driverId, driverId));
    const scheduleIds = driverSchedules.map((s) => s.id);

    if (scheduleIds.length === 0) {
      sendSuccess(res, {
        tripsToday: 0,
        earningsToday: 0,
        onlineHoursToday: 0,
        passengersToday: 0,
        tripsThisMonth: 0,
        earningsThisMonth: 0,
        cancellationsLast30d: 0,
        noShowsLast30d: 0,
      });
      return;
    }

    const todayBookings = await db
      .select({
        id: vanBookingsTable.id,
        status: vanBookingsTable.status,
        fare: vanBookingsTable.fare,
        boardedAt: vanBookingsTable.boardedAt,
        completedAt: vanBookingsTable.completedAt,
        scheduleId: vanBookingsTable.scheduleId,
      })
      .from(vanBookingsTable)
      .where(
        and(
          inArray(vanBookingsTable.scheduleId, scheduleIds),
          eq(vanBookingsTable.travelDate, today)
        )
      );

    const boardedToday = todayBookings.filter(
      (b) => b.status === "boarded" || b.status === "completed"
    );
    const passengersToday = boardedToday.length;
    const earningsToday = boardedToday.reduce((sum, b) => sum + parseFloat(b.fare ?? "0"), 0);
    const tripsToday = new Set(boardedToday.map((b) => b.scheduleId)).size;

    let onlineMs = 0;
    const tripGroups = new Map<string, { firstBoard?: Date; lastEnd?: Date }>();
    for (const b of boardedToday) {
      const g = tripGroups.get(b.scheduleId) ?? {};
      if (b.boardedAt && (!g.firstBoard || b.boardedAt < g.firstBoard)) g.firstBoard = b.boardedAt;
      const endAt = b.completedAt ?? (b.status === "boarded" ? now : undefined);
      if (endAt && (!g.lastEnd || endAt > g.lastEnd)) g.lastEnd = endAt;
      tripGroups.set(b.scheduleId, g);
    }
    for (const g of tripGroups.values()) {
      if (g.firstBoard && g.lastEnd && g.lastEnd > g.firstBoard) {
        onlineMs += g.lastEnd.getTime() - g.firstBoard.getTime();
      }
    }
    const onlineHoursToday = Math.round((onlineMs / 3_600_000) * 10) / 10;

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthDate = startOfMonth.toISOString().split("T")[0]!;
    const monthBookings = await db
      .select({
        fare: vanBookingsTable.fare,
        status: vanBookingsTable.status,
        scheduleId: vanBookingsTable.scheduleId,
        travelDate: vanBookingsTable.travelDate,
      })
      .from(vanBookingsTable)
      .where(
        and(
          inArray(vanBookingsTable.scheduleId, scheduleIds),
          gte(vanBookingsTable.travelDate, startOfMonthDate)
        )
      );
    const monthCompleted = monthBookings.filter(
      (b) => b.status === "boarded" || b.status === "completed"
    );
    const earningsThisMonth = monthCompleted.reduce((sum, b) => sum + parseFloat(b.fare ?? "0"), 0);
    const tripsThisMonth = new Set(monthCompleted.map((b) => `${b.scheduleId}|${b.travelDate}`))
      .size;

    const [{ c: cancellationsLast30d } = { c: 0 }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(vanBookingsTable)
      .where(
        and(
          inArray(vanBookingsTable.scheduleId, scheduleIds),
          eq(vanBookingsTable.status, "cancelled"),
          gte(vanBookingsTable.cancelledAt, ago30)
        )
      );

    // Only count past-dated trips as no-shows; future confirmed bookings excluded.
    const [{ c: noShowsLast30d } = { c: 0 }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(vanBookingsTable)
      .where(
        and(
          inArray(vanBookingsTable.scheduleId, scheduleIds),
          eq(vanBookingsTable.status, "confirmed"),
          gte(vanBookingsTable.createdAt, ago30),
          sql`${vanBookingsTable.travelDate} < ${today}`,
          sql`${vanBookingsTable.boardedAt} IS NULL`
        )
      );

    void startOfDay;
    sendSuccess(res, {
      tripsToday,
      earningsToday: Math.round(earningsToday),
      onlineHoursToday,
      passengersToday,
      tripsThisMonth,
      earningsThisMonth: Math.round(earningsThisMonth),
      cancellationsLast30d: Number(cancellationsLast30d ?? 0),
      noShowsLast30d: Number(noShowsLast30d ?? 0),
    });
  } catch (e) {
    next(e);
  }
});

/* ═══════════════════════════════════════════════════════════════
   ADMIN — van management endpoints
═══════════════════════════════════════════════════════════════ */

router.get("/admin/routes", adminAuth, async (_req, res, _next) => {
  try {
    const routes = await db
      .select()
      .from(vanRoutesTable)
      .orderBy(asc(vanRoutesTable.sortOrder), asc(vanRoutesTable.name));
    sendSuccess(res, routes);
  } catch (_e) {
    sendError(res, "Failed to load routes.", 500);
  }
});

const routeSchema = z.object({
  name: z.string().min(1).max(100),
  nameUrdu: z.string().max(100).optional(),
  fromAddress: z.string().min(1).max(200),
  fromAddressUrdu: z.string().max(200).optional(),
  fromLat: z.number().optional(),
  fromLng: z.number().optional(),
  toAddress: z.string().min(1).max(200),
  toAddressUrdu: z.string().max(200).optional(),
  toLat: z.number().optional(),
  toLng: z.number().optional(),
  distanceKm: z.number().optional(),
  durationMin: z.number().int().optional(),
  farePerSeat: z.number().min(1),
  fareWindow: z.number().min(0).optional().nullable(),
  fareAisle: z.number().min(0).optional().nullable(),
  fareEconomy: z.number().min(0).optional().nullable(),
  notes: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post("/admin/routes", adminAuth, async (req, res, next) => {
  const p = routeSchema.safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, p.error.issues.map((i) => i.message).join("; "), 422);
    return;
  }
  try {
    const [route] = await db
      .insert(vanRoutesTable)
      .values({
        id: generateId(),
        ...p.data,
        farePerSeat: String(p.data.farePerSeat),
        fareWindow: p.data.fareWindow != null ? String(p.data.fareWindow) : null,
        fareAisle: p.data.fareAisle != null ? String(p.data.fareAisle) : null,
        fareEconomy: p.data.fareEconomy != null ? String(p.data.fareEconomy) : null,
        distanceKm: p.data.distanceKm ? String(p.data.distanceKm) : null,
        fromLat: p.data.fromLat ? String(p.data.fromLat) : null,
        fromLng: p.data.fromLng ? String(p.data.fromLng) : null,
        toLat: p.data.toLat ? String(p.data.toLat) : null,
        toLng: p.data.toLng ? String(p.data.toLng) : null,
      })
      .returning();
    sendCreated(res, route);
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/routes/:id", adminAuth, async (req, res, next) => {
  const p = routeSchema.partial().safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, p.error.issues.map((i) => i.message).join("; "), 422);
    return;
  }
  try {
    const updates: Record<string, unknown> = {
      ...p.data,
      updatedAt: new Date(),
    };
    if (p.data.farePerSeat !== undefined) updates["farePerSeat"] = String(p.data.farePerSeat);
    if (p.data.fareWindow !== undefined)
      updates["fareWindow"] = p.data.fareWindow != null ? String(p.data.fareWindow) : null;
    if (p.data.fareAisle !== undefined)
      updates["fareAisle"] = p.data.fareAisle != null ? String(p.data.fareAisle) : null;
    if (p.data.fareEconomy !== undefined)
      updates["fareEconomy"] = p.data.fareEconomy != null ? String(p.data.fareEconomy) : null;
    if (p.data.distanceKm !== undefined) updates["distanceKm"] = String(p.data.distanceKm);
    if (p.data.fromLat !== undefined) updates["fromLat"] = String(p.data.fromLat);
    if (p.data.fromLng !== undefined) updates["fromLng"] = String(p.data.fromLng);
    if (p.data.toLat !== undefined) updates["toLat"] = String(p.data.toLat);
    if (p.data.toLng !== undefined) updates["toLng"] = String(p.data.toLng);
    const [route] = await db
      .update(vanRoutesTable)
      .set(updates)
      .where(eq(vanRoutesTable.id, req.params["id"] as string))
      .returning();
    if (!route) {
      sendNotFound(res, "Route not found.");
      return;
    }
    sendSuccess(res, route);
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/routes/:id", adminAuth, async (req, res, _next) => {
  try {
    await db
      .update(vanRoutesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vanRoutesTable.id, req.params["id"] as string));
    sendSuccess(res, { message: "Route deactivated." });
  } catch (_e) {
    sendError(res, "Failed to deactivate route.", 500);
  }
});

router.get("/admin/vehicles", adminAuth, async (_req, res, _next) => {
  try {
    const vehicles = await db
      .select({
        id: vanVehiclesTable.id,
        plateNumber: vanVehiclesTable.plateNumber,
        model: vanVehiclesTable.model,
        totalSeats: vanVehiclesTable.totalSeats,
        seatLayout: vanVehiclesTable.seatLayout,
        isActive: vanVehiclesTable.isActive,
        driverId: vanVehiclesTable.driverId,
        driverName: usersTable.name,
        driverPhone: usersTable.phone,
        createdAt: vanVehiclesTable.createdAt,
      })
      .from(vanVehiclesTable)
      .leftJoin(usersTable, eq(vanVehiclesTable.driverId, usersTable.id))
      .orderBy(desc(vanVehiclesTable.createdAt));
    sendSuccess(res, vehicles);
  } catch (_e) {
    sendError(res, "Failed to load vehicles.", 500);
  }
});

const vehicleSchema = z.object({
  plateNumber: z.string().min(1).max(20),
  model: z.string().max(50).optional(),
  totalSeats: z.number().int().min(1).max(50).optional(),
  seatLayout: z.record(z.unknown()).optional().nullable(),
  driverId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

router.post("/admin/vehicles", adminAuth, async (req, res, _next) => {
  const p = vehicleSchema.safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, p.error.issues.map((i) => i.message).join("; "), 422);
    return;
  }
  try {
    const [vehicle] = await db
      .insert(vanVehiclesTable)
      .values({ id: generateId(), ...p.data })
      .returning();
    sendCreated(res, vehicle);
  } catch (_e) {
    sendError(res, "Failed to create vehicle.", 500);
  }
});

router.patch("/admin/vehicles/:id", adminAuth, async (req, res, _next) => {
  const p = vehicleSchema.partial().safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, p.error.issues.map((i) => i.message).join("; "), 422);
    return;
  }
  try {
    const [vehicle] = await db
      .update(vanVehiclesTable)
      .set({ ...p.data, updatedAt: new Date() })
      .where(eq(vanVehiclesTable.id, req.params["id"] as string))
      .returning();
    if (!vehicle) {
      sendNotFound(res, "Vehicle not found.");
      return;
    }
    sendSuccess(res, vehicle);
  } catch (_e) {
    sendError(res, "Failed to update vehicle.", 500);
  }
});

router.get("/admin/schedules", adminAuth, async (_req, res, _next) => {
  try {
    const schedules = await db
      .select({
        id: vanSchedulesTable.id,
        routeId: vanSchedulesTable.routeId,
        vehicleId: vanSchedulesTable.vehicleId,
        driverId: vanSchedulesTable.driverId,
        departureTime: vanSchedulesTable.departureTime,
        returnTime: vanSchedulesTable.returnTime,
        daysOfWeek: vanSchedulesTable.daysOfWeek,
        tripStatus: vanSchedulesTable.tripStatus,
        isActive: vanSchedulesTable.isActive,
        routeName: vanRoutesTable.name,
        vehiclePlate: vanVehiclesTable.plateNumber,
        driverName: usersTable.name,
      })
      .from(vanSchedulesTable)
      .leftJoin(vanRoutesTable, eq(vanSchedulesTable.routeId, vanRoutesTable.id))
      .leftJoin(vanVehiclesTable, eq(vanSchedulesTable.vehicleId, vanVehiclesTable.id))
      .leftJoin(usersTable, eq(vanSchedulesTable.driverId, usersTable.id))
      .orderBy(asc(vanSchedulesTable.departureTime));

    const enriched = await Promise.all(
      schedules.map(async (s) => {
        if (!s.driverId) return { ...s, vanCode: null };
        const [driver] = await db
          .select({ vanCode: vanDriversTable.vanCode })
          .from(vanDriversTable)
          .where(eq(vanDriversTable.userId, s.driverId))
          .limit(1);
        return { ...s, vanCode: driver?.vanCode ?? null };
      })
    );

    sendSuccess(res, enriched);
  } catch (_e) {
    sendError(res, "Failed to load schedules.", 500);
  }
});

const scheduleSchema = z.object({
  routeId: z.string().min(1),
  vehicleId: z.string().optional().nullable(),
  driverId: z.string().optional().nullable(),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/, "departureTime must be HH:MM"),
  returnTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  isActive: z.boolean().optional(),
});

router.post("/admin/schedules", adminAuth, async (req, res, _next) => {
  const p = scheduleSchema.safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, p.error.issues.map((i) => i.message).join("; "), 422);
    return;
  }
  try {
    /* Enforce driver rules if driverId provided */
    if (p.data.driverId) {
      const vs = await getVanSettings();
      const driverId = p.data.driverId;

      /* Check max trips per day — count active schedules for this driver */
      const [tripCount] = await db
        .select({ count: count() })
        .from(vanSchedulesTable)
        .where(and(eq(vanSchedulesTable.driverId, driverId), eq(vanSchedulesTable.isActive, true)));
      if ((tripCount?.count ?? 0) >= vs.maxDriverTripsDay) {
        sendError(
          res,
          `Driver already has ${vs.maxDriverTripsDay} active schedules (max per day).`,
          400
        );
        return;
      }

      /* Check rest hours between trips */
      if (vs.driverRestHours > 0 && p.data.departureTime) {
        const existingSchedules = await db
          .select({
            departureTime: vanSchedulesTable.departureTime,
            returnTime: vanSchedulesTable.returnTime,
          })
          .from(vanSchedulesTable)
          .where(
            and(eq(vanSchedulesTable.driverId, driverId), eq(vanSchedulesTable.isActive, true))
          );
        const newDeptMins = (() => {
          const [h, m] = p.data.departureTime.split(":").map(Number);
          return (h ?? 0) * 60 + (m ?? 0);
        })();
        const restMins = vs.driverRestHours * 60;
        for (const es of existingSchedules) {
          const retTime = es.returnTime || es.departureTime;
          const [rh, rm] = retTime.split(":").map(Number);
          const retMins = (rh ?? 0) * 60 + (rm ?? 0);
          if (Math.abs(newDeptMins - retMins) < restMins) {
            sendError(
              res,
              `Driver needs at least ${vs.driverRestHours} hour(s) rest between trips. Conflicts with existing schedule.`,
              400
            );
            return;
          }
        }
      }
    }

    const [schedule] = await db
      .insert(vanSchedulesTable)
      .values({ id: generateId(), ...p.data })
      .returning();
    sendCreated(res, schedule);
  } catch (_e) {
    sendError(res, "Failed to create schedule.", 500);
  }
});

router.patch("/admin/schedules/:id", adminAuth, async (req, res, _next) => {
  const p = scheduleSchema.partial().safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, p.error.issues.map((i) => i.message).join("; "), 422);
    return;
  }
  try {
    const [schedule] = await db
      .update(vanSchedulesTable)
      .set({ ...p.data, updatedAt: new Date() })
      .where(eq(vanSchedulesTable.id, req.params["id"] as string))
      .returning();
    if (!schedule) {
      sendNotFound(res, "Schedule not found.");
      return;
    }
    sendSuccess(res, schedule);
  } catch (_e) {
    sendError(res, "Failed to update schedule.", 500);
  }
});

router.delete("/admin/schedules/:id", adminAuth, async (req, res, _next) => {
  try {
    await db
      .update(vanSchedulesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vanSchedulesTable.id, req.params["id"] as string));
    sendSuccess(res, { message: "Schedule deactivated." });
  } catch (_e) {
    sendError(res, "Failed to deactivate schedule.", 500);
  }
});

/* ── Van Drivers CRUD ── */
router.get("/admin/drivers", adminAuth, async (_req, res, _next) => {
  try {
    const drivers = await db
      .select({
        id: vanDriversTable.id,
        userId: vanDriversTable.userId,
        vanCode: vanDriversTable.vanCode,
        approvalStatus: vanDriversTable.approvalStatus,
        isActive: vanDriversTable.isActive,
        notes: vanDriversTable.notes,
        createdAt: vanDriversTable.createdAt,
        userName: usersTable.name,
        userPhone: usersTable.phone,
        userEmail: usersTable.email,
      })
      .from(vanDriversTable)
      .leftJoin(usersTable, eq(vanDriversTable.userId, usersTable.id))
      .orderBy(desc(vanDriversTable.createdAt));
    sendSuccess(res, drivers);
  } catch (_e) {
    sendError(res, "Failed to load van drivers.", 500);
  }
});

async function generateVanCode(): Promise<string> {
  const [result] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(vanDriversTable);
  const num = (result?.cnt ?? 0) + 1;
  return `VAN-${String(num).padStart(3, "0")}`;
}

const vanDriverSchema = z.object({
  userId: z.string().min(1),
  approvalStatus: z.enum(["pending", "approved", "suspended"]).optional(),
  notes: z.string().max(500).optional(),
});

router.post("/admin/drivers", adminAuth, async (req, res, next) => {
  const p = vanDriverSchema.safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, p.error.issues.map((i) => i.message).join("; "), 422);
    return;
  }
  try {
    const existing = await db
      .select({ id: vanDriversTable.id })
      .from(vanDriversTable)
      .where(eq(vanDriversTable.userId, p.data.userId))
      .limit(1);
    if (existing.length > 0) {
      sendError(res, "This user is already registered as a van driver.", 400);
      return;
    }

    const vanCode = await generateVanCode();
    const [driver] = await db
      .insert(vanDriversTable)
      .values({
        id: generateId(),
        userId: p.data.userId,
        vanCode,
        approvalStatus: p.data.approvalStatus || "approved",
        notes: p.data.notes || null,
      })
      .returning();

    await db
      .update(usersTable)
      .set({
        roles: sql`CASE WHEN roles LIKE '%van_driver%' THEN roles ELSE roles || ',van_driver' END`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, p.data.userId));

    sendCreated(res, driver);
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/drivers/:id", adminAuth, async (req, res, _next) => {
  const p = z
    .object({
      approvalStatus: z.enum(["pending", "approved", "suspended"]).optional(),
      notes: z.string().max(500).optional(),
      isActive: z.boolean().optional(),
    })
    .safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, p.error.issues.map((i) => i.message).join("; "), 422);
    return;
  }
  try {
    const [driver] = await db
      .update(vanDriversTable)
      .set({ ...p.data, updatedAt: new Date() })
      .where(eq(vanDriversTable.id, req.params["id"] as string))
      .returning();
    if (!driver) {
      sendNotFound(res, "Van driver not found.");
      return;
    }
    sendSuccess(res, driver);
  } catch (_e) {
    sendError(res, "Failed to update van driver.", 500);
  }
});

router.delete("/admin/drivers/:id", adminAuth, async (req, res, _next) => {
  try {
    await db
      .update(vanDriversTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vanDriversTable.id, req.params["id"] as string));
    sendSuccess(res, { message: "Van driver deactivated." });
  } catch (_e) {
    sendError(res, "Failed to deactivate van driver.", 500);
  }
});

/* ── Admin bookings ── */
router.get("/admin/bookings", adminAuth, async (req, res, next) => {
  try {
    const dateFilter = req.query["date"] ? String(req.query["date"]) : null;
    const routeFilter = req.query["routeId"] ? String(req.query["routeId"]) : null;
    const statusFilter = req.query["status"] ? String(req.query["status"]) : null;

    const conditions: SQL[] = []; // drizzle dynamic query
    if (dateFilter) conditions.push(eq(vanBookingsTable.travelDate, dateFilter));
    if (routeFilter) conditions.push(eq(vanBookingsTable.routeId, routeFilter));
    if (statusFilter) conditions.push(sql`${vanBookingsTable.status} = ${statusFilter}`);

    const bookings = await db
      .select({
        id: vanBookingsTable.id,
        userId: vanBookingsTable.userId,
        scheduleId: vanBookingsTable.scheduleId,
        seatNumbers: vanBookingsTable.seatNumbers,
        seatTiers: vanBookingsTable.seatTiers,
        tierBreakdown: vanBookingsTable.tierBreakdown,
        travelDate: vanBookingsTable.travelDate,
        status: vanBookingsTable.status,
        fare: vanBookingsTable.fare,
        paymentMethod: vanBookingsTable.paymentMethod,
        passengerName: vanBookingsTable.passengerName,
        passengerPhone: vanBookingsTable.passengerPhone,
        boardedAt: vanBookingsTable.boardedAt,
        completedAt: vanBookingsTable.completedAt,
        cancelledAt: vanBookingsTable.cancelledAt,
        createdAt: vanBookingsTable.createdAt,
        routeName: vanRoutesTable.name,
        routeFrom: vanRoutesTable.fromAddress,
        routeTo: vanRoutesTable.toAddress,
        departureTime: vanSchedulesTable.departureTime,
        tripStatus: vanSchedulesTable.tripStatus,
        userName: usersTable.name,
        userPhone: usersTable.phone,
      })
      .from(vanBookingsTable)
      .leftJoin(vanRoutesTable, eq(vanBookingsTable.routeId, vanRoutesTable.id))
      .leftJoin(vanSchedulesTable, eq(vanBookingsTable.scheduleId, vanSchedulesTable.id))
      .leftJoin(usersTable, eq(vanBookingsTable.userId, usersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(vanBookingsTable.createdAt))
      .limit(200);
    sendSuccess(res, bookings);
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/bookings/:id/status", adminAuth, async (req, res, _next) => {
  const p = z
    .object({
      status: z.enum(["confirmed", "boarded", "completed", "cancelled"]),
    })
    .safeParse(req.body ?? {});
  if (!p.success) {
    sendError(res, "Invalid status.", 422);
    return;
  }
  try {
    const [booking] = await db
      .update(vanBookingsTable)
      .set({ status: p.data.status, updatedAt: new Date() })
      .where(eq(vanBookingsTable.id, req.params["id"] as string))
      .returning();
    if (!booking) {
      sendNotFound(res, "Booking not found.");
      return;
    }
    sendSuccess(res, booking);
  } catch (_e) {
    sendError(res, "Failed to update status.", 500);
  }
});

const sentDepartureReminders = new Set<string>();

setInterval(
  () => {
    const cutoff = Date.now() - 3 * 60 * 60 * 1000;
    for (const key of sentDepartureReminders) {
      const ts = parseInt(key.split("|").pop() || "0", 10);
      if (ts < cutoff) sentDepartureReminders.delete(key);
    }
  },
  30 * 60 * 1000
);

export async function sendVanDepartureReminders() {
  try {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
    const currentDow = now.getDay() === 0 ? 7 : now.getDay();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const todayStr = `${y}-${m}-${d}`;

    const schedules = await db
      .select({
        id: vanSchedulesTable.id,
        departureTime: vanSchedulesTable.departureTime,
        daysOfWeek: vanSchedulesTable.daysOfWeek,
        tripStatus: vanSchedulesTable.tripStatus,
      })
      .from(vanSchedulesTable)
      .where(and(eq(vanSchedulesTable.isActive, true), eq(vanSchedulesTable.tripStatus, "idle")));

    for (const sched of schedules) {
      const days = Array.isArray(sched.daysOfWeek) ? sched.daysOfWeek : [];
      if (!days.includes(currentDow)) continue;

      const [hStr, mStr] = (sched.departureTime || "").split(":");
      if (!hStr || !mStr) continue;
      const depHour = parseInt(hStr, 10);
      const depMin = parseInt(mStr, 10);
      if (isNaN(depHour) || isNaN(depMin)) continue;

      const depDate = new Date(now);
      depDate.setHours(depHour, depMin, 0, 0);
      const diffMs = depDate.getTime() - now.getTime();
      const diffMin = diffMs / 60000;

      if (diffMin < 55 || diffMin > 65) continue;

      const reminderKey = `${sched.id}|${todayStr}|${depDate.getTime()}`;
      if (sentDepartureReminders.has(reminderKey)) continue;
      sentDepartureReminders.add(reminderKey);

      const bookings = await db
        .select({ userId: vanBookingsTable.userId })
        .from(vanBookingsTable)
        .where(
          and(
            eq(vanBookingsTable.scheduleId, sched.id),
            eq(vanBookingsTable.travelDate, todayStr),
            sql`${vanBookingsTable.status} NOT IN ('cancelled', 'completed')`
          )
        );

      for (const b of bookings) {
        sendPushToUser(b.userId, {
          title: "Departure in 1 Hour",
          body: `Your van departs at ${sched.departureTime}. Please be at the pickup point on time!`,
          data: {
            type: "van_departure_reminder_1h",
            scheduleId: sched.id,
            date: todayStr,
          },
        }).catch((err: unknown) => {
          logger.warn(
            {
              message: "[van] 1h-departure-reminder push failed",
              error: err instanceof Error ? err.message : String(err),
              code: "VAN_PUSH_1H_REMINDER_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
              userId: b.userId,
              scheduleId: sched.id,
            },
            "[van] 1h-departure-reminder push failed"
          );
        });
      }

      logger.info(
        { scheduleId: sched.id, passengers: bookings.length },
        "[van] sent 1h departure reminders"
      );
    }
  } catch (e) {
    logger.error({ err: e }, "[van] departure reminder scan failed");
  }
}

export default router;
