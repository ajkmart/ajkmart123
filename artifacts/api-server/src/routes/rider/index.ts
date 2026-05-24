import { db } from "@workspace/db";
import {
  liveLocationsTable,
  locationLogsTable,
  notificationsTable,
  ordersTable,
  otpAttemptsTable,
  pushSubscriptionsTable,
  reviewsTable,
  rideBidsTable,
  rideEventLogsTable,
  rideRatingsTable,
  rideServiceTypesTable,
  riderPenaltiesTable,
  riderProfilesTable,
  ridesTable,
  usersTable,
  vendorProfilesTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { t } from "@workspace/i18n";
import { normalizeVehicleType } from "@workspace/service-constants";
import { randomInt, randomUUID } from "crypto";
import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  isNull,
  or,
  sql,
  sum,
  type InferSelectModel,
} from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { fireAndForget } from "../../lib/fireAndForget.js";
import { isInServiceZone } from "../../lib/geofence.js";
import { getUserLanguage } from "../../lib/getUserLanguage.js";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { buildCursorPage, decodeCursor } from "../../lib/pagination/cursor.js";
import {
  sendError,
  sendErrorWithData,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendTooManyRequests,
  sendValidationError,
} from "../../lib/response.js";
import { emitRideUpdate } from "../../lib/rideEvents.js";
import {
  emitRideDispatchUpdate,
  emitRideOtp,
  emitRiderLocation,
  emitRiderStatus,
  getIO,
} from "../../lib/socketio.js";
import { emitWebhookEvent } from "../../lib/webhook-emitter.js";
import { sendPushToUser } from "../../lib/webpush.js";
import { gpsAntiSpoofMiddleware } from "../../middleware/gpsSpoof.js";
import { validateRiderLocationSecurity } from "../rides/dispatch.js";
import {
  addSecurityEvent,
  detectGPSSpoof,
  getCachedSettings,
  getClientIp,
  verifyUserJwt,
} from "../../middleware/security.js";

/* ── CSRF double-submit cookie protection ────────────────────────────────────
   State-change POST endpoints (accept, cancel, status update) validate that the
   X-CSRF-Token header matches the csrf_token cookie value set by the frontend.
   This prevents cross-site request forgery on authenticated rider endpoints.   */
function csrfDoubleSubmit(req: Request, res: Response, next: NextFunction): void {
  const headerToken = req.headers["x-csrf-token"];
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.["csrf_token"];
  /* Strictly enforce double-submit: both the cookie and the matching header
     must be present. Missing either (or a mismatch) is a rejected request. */
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    sendForbidden(res, "CSRF token mismatch — request rejected.");
    return;
  }
  next();
}

/* ── Ride-action rate limiters (defined early so they can be referenced anywhere in the file) ── */

/** Ride-accept limiter: 10 accept attempts per rider per minute (prevents accept-spam) */
const rideAcceptLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many ride accept attempts. Please wait a moment.");
  },
});

/** Ride-bid limiter: 10 counter bids per rider per minute */
const rideBidLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many bid requests. Please wait before submitting another bid.");
  },
});

/** Ride-status limiter: 20 status updates per rider per minute */
const rideStatusLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many status update requests. Please wait a moment.");
  },
});

/** OTP brute-force limiter: 5 attempts per rider per minute */
const otpLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many OTP attempts. Please wait before trying again.");
  },
});

/** Ride-cancel rate limiter: 10 cancellations per rider per minute (spec requirement) */
const rideCancelLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many cancellation requests. Please wait before cancelling again.");
  },
});

/** Middleware that applies rideCancelLimiter only when the request body has status=cancelled */
const conditionalCancelLimiter = (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as { status?: string };
  if (body?.status === "cancelled") {
    return rideCancelLimiter(req, res, next);
  }
  return next();

/* ── Additional rate limiters (H-03, M-05) ───────────────────────────────── */
};

/** H-03: Request-feed limiter — 30 polls/min prevents broadcast-endpoint spam */
const requestFeedLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many request-feed polls. Please slow down.");
  },
});

/** M-05: Notifications-feed limiter — 30 fetches/min */
const notificationsFeedLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many notification fetches. Please wait a moment.");
  },
});

/** M-05: COD remittance limiter — 10 submissions per rider per 15 minutes */
const codRemitLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many remittance submissions. Please wait before submitting again.");
  },
});

/** M-05: Wallet deposit limiter — 10 deposits per rider per 15 minutes */
const riderDepositLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    sendTooManyRequests(res, "Too many deposit requests. Please wait before trying again.");
  },
});

const MAX_OTP_ATTEMPTS = 5;
const OTP_ATTEMPT_TTL_MS = 30 * 60_000;

const router: IRouter = Router();

const safeNum = (v: unknown, def = 0) => {
  const n = parseFloat(String(v ?? def));
  return isNaN(n) ? def : n;
};

/* ── Server-side idempotency deduplication for mutating rider actions ──────
   Stores responses for X-Idempotency-Key for 5 minutes so retried requests
   (offline queue replays, network retries) return the same response instead of
   executing the action a second time.                                        */
interface IdempotencyEntry {
  status: number;
  body: unknown;
  ts: number;
}
const idempotencyCache = new Map<string, IdempotencyEntry>();
const IDEM_TTL_MS = 5 * 60_000;

function idemCacheKey(req: Request): string | null {
  const key = req.headers["x-idempotency-key"];
  if (!key || typeof key !== "string") return null;
  /* Scope by rider + HTTP method + route path to prevent cross-endpoint/cross-user collisions */
  const riderId = req.riderId ?? "anon";
  return `${riderId}:${req.method}:${req.path}:${key}`;
}

function checkIdempotency(req: Request, res: Response): boolean {
  const cacheKey = idemCacheKey(req);
  if (!cacheKey) return false;
  const now = Date.now();
  /* Sweep stale entries on each call (amortised cleanup) */
  idempotencyCache.forEach((v, k) => {
    if (now - v.ts > IDEM_TTL_MS) idempotencyCache.delete(k);
  });
  const existing = idempotencyCache.get(cacheKey);
  if (existing) {
    res.status(existing.status).json(existing.body);
    return true;
  }
  return false;
}

function storeIdempotency(req: Request, status: number, body: unknown): void {
  const cacheKey = idemCacheKey(req);
  if (!cacheKey) return;
  idempotencyCache.set(cacheKey, { status, body, ts: Date.now() });
}

/** Middleware: blocks ride acceptance when the rider's vehicle profile is incomplete,
    the account is suspended/restricted, or there are active penalties in the last 30 days. */
async function validateRiderProfileComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
  const riderId = req.riderId;
  if (!riderId) { next(); return; }
  try {
    /* 1. Check user account status */
    const [user] = await db
      .select({ isRestricted: usersTable.isRestricted, approvalStatus: usersTable.approvalStatus })
      .from(usersTable)
      .where(eq(usersTable.id, riderId))
      .limit(1);
    if (user?.isRestricted) {
      sendForbidden(res, "Your account is suspended. Contact support before accepting rides.");
      return;
    }
    if ((user?.approvalStatus ?? "pending") !== "approved") {
      sendForbidden(res, "Your account is pending approval. You cannot accept rides until verified.");
      return;
    }

    /* 2. Check vehicle profile completeness */
    const [profile] = await db
      .select({
        vehicleType: riderProfilesTable.vehicleType,
        vehiclePhoto: riderProfilesTable.vehiclePhoto,
        vehiclePlate: riderProfilesTable.vehiclePlate,
        drivingLicense: riderProfilesTable.drivingLicense,
      })
      .from(riderProfilesTable)
      .where(eq(riderProfilesTable.userId, riderId))
      .limit(1);
    const missing: string[] = [];
    if (!profile?.vehicleType) missing.push("vehicle type");
    if (!profile?.vehiclePhoto) missing.push("vehicle photo");
    if (!profile?.vehiclePlate) missing.push("vehicle plate/number");
    if (!profile?.drivingLicense) missing.push("driving license");
    if (missing.length > 0) {
      sendForbidden(
        res,
        `Profile incomplete — please add your ${missing.join(", ")} in Settings before accepting rides.`
      );
      return;
    }

    /* 3. Check for active penalties in the last 30 days */
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [activePenalty] = await db
      .select({ riderId: riderPenaltiesTable.riderId })
      .from(riderPenaltiesTable)
      .where(
        and(
          eq(riderPenaltiesTable.riderId, riderId),
          sql`${riderPenaltiesTable.createdAt} >= ${thirtyDaysAgo.toISOString()}`
        )
      )
      .limit(1);
    if (activePenalty) {
      sendForbidden(res, "You have active penalties on your account. Resolve them before accepting rides.");
      return;
    }

    next();
  } catch (e: unknown) {
    next(e);
  }
}

const onlineSchema = z.object({ isOnline: z.boolean() });

const profileSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    /* M-02: Enforce the standard Pakistani CNIC format XXXXX-XXXXXXX-X. */
    cnic: z
      .string()
      .regex(/^\d{5}-\d{7}-\d$/, "CNIC must be in format XXXXX-XXXXXXX-X (e.g. 12345-1234567-1)")
      .optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    emergencyContact: z.string().optional(),
    vehicleType: z.string().optional(),
    vehiclePlate: z.string().optional(),
    vehicleRegNo: z.string().optional(),
    vehicleRegistration: z.string().optional(),
    drivingLicense: z.string().optional(),
    bankName: z.string().optional(),
    /* M-02: Enforce realistic bank account number length (8–24 digits). */
    bankAccount: z.string().min(8, "Bank account must be at least 8 digits").max(24, "Bank account number is too long").optional(),
    bankAccountTitle: z.string().optional(),
    avatar: z.string().optional(),
    cnicDocUrl: z.string().optional(),
    licenseDocUrl: z.string().optional(),
    regDocUrl: z.string().optional(),
    vehiclePhoto: z.string().optional(),
    dailyGoal: z.number().positive().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.vehicleType && !data.vehiclePhoto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "vehiclePhoto is required when setting vehicleType",
        path: ["vehiclePhoto"],
      });
    }
    if (data.vehicleType && !data.vehiclePlate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "vehiclePlate is required when setting vehicleType",
        path: ["vehiclePlate"],
      });
    }
  })
  .transform((data) => {
    if (data.vehicleRegistration && !data.vehicleRegNo) {
      data.vehicleRegNo = data.vehicleRegistration;
    }
    const { vehicleRegistration: _vr, ...rest } = data;
    return rest;
  });

const MAX_PROOF_PHOTO_BYTES = 5 * 1024 * 1024;
/* Base64 encoding inflates data by ~33%, so the encoded payload can be up to 4/3 * rawBytes.
   We measure only the base64 payload (after the data URI prefix) for accuracy. */
const MAX_PROOF_PHOTO_BASE64_LEN = Math.ceil(MAX_PROOF_PHOTO_BYTES * (4 / 3));

function proofPhotoWithinLimit(dataUri: string): boolean {
  const commaIdx = dataUri.indexOf(",");
  const payload = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
  return payload.length <= MAX_PROOF_PHOTO_BASE64_LEN;
}

const orderStatusSchema = z.object({
  status: z.enum(["out_for_delivery", "picked_up", "delivered", "cancelled"]),
  proofPhoto: z
    .string()
    .refine(
      (v) => v.startsWith("data:image/"),
      "proofPhoto must be a base64 data URI (data:image/...)"
    )
    .refine(proofPhotoWithinLimit, "proofPhoto exceeds 5 MB limit")
    .optional(),
});

const rideStatusSchema = z.object({
  status: z.enum(["arrived", "in_transit", "completed", "cancelled"]),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const RIDE_STATUS_TRANSITIONS: Record<string, string[]> = {
  accepted: ["arrived", "cancelled"],
  arrived: ["in_transit", "cancelled"],
  in_transit: ["completed", "cancelled"],
};

const DEFAULT_MAX_COUNTER_FARE = 100_000;
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const counterSchema = z.object({
  counterFare: z.number().positive(),
  note: z.string().max(300).transform(stripHtml).optional(),
});

const withdrawSchema = z.object({
  amount: z.number().positive(),
  bankName: z.string().min(1),
  /* L-04: Realistic bank account number length + digits-only guard. */
  accountNumber: z
    .string()
    .min(8, "Account number must be at least 8 digits")
    .max(24, "Account number is too long")
    .regex(/^\d+$/, "Account number must contain digits only"),
  accountTitle: z.string().min(1),
  paymentMethod: z.string().optional(),
  note: z.string().optional(),
});

const depositSchema = z.object({
  amount: z.number().min(100),
  paymentMethod: z.string().min(1),
  transactionId: z.string().min(1),
  accountNumber: z.string().optional(),
  note: z.string().optional(),
});

const idParamSchema = z.object({ id: z.string().min(1, "ID is required") });
const otpVerifySchema = z.object({
  otp: z
    .string()
    .min(1, "OTP is required")
    .max(10, "OTP is too long")
    .regex(/^\d+$/, "OTP must contain digits only"),
});

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
});

/* ── Auth Middleware ── */
async function riderAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const tokenHeader = req.headers["x-auth-token"] as string | undefined;
  const raw = tokenHeader || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!raw) {
    sendErrorWithData(res, "Authentication required", { code: "AUTH_REQUIRED" }, 401);
    return;
  }

  const payload = verifyUserJwt(raw);
  if (!payload) {
    sendErrorWithData(
      res,
      "Invalid or expired session. Please log in again.",
      { code: "TOKEN_INVALID" },
      401
    );
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);
    if (!user) {
      sendErrorWithData(res, "User not found", { code: "AUTH_REQUIRED" }, 401);
      return;
    }
    if (user.isBanned) {
      sendErrorWithData(
        res,
        "Your account has been permanently banned. Please contact support.",
        { code: "ACCOUNT_BANNED" },
        401
      );
      return;
    }
    if (!user.isActive) {
      /* Structured response for approval states so the frontend can show the right screen */
      if (user.approvalStatus === "pending") {
        sendErrorWithData(
          res,
          "Your account is pending admin approval.",
          {
            code: "APPROVAL_PENDING",
            approvalStatus: "pending",
          },
          403
        );
        return;
      }
      if (user.approvalStatus === "rejected") {
        sendErrorWithData(
          res,
          "Your account application was rejected.",
          {
            code: "APPROVAL_REJECTED",
            approvalStatus: "rejected",
            rejectionReason: user.approvalNote ?? null,
          },
          403
        );
        return;
      }
      sendErrorWithData(
        res,
        "Account is inactive. Please contact support.",
        { code: "ACCOUNT_INACTIVE" },
        403
      );
      return;
    }

    if (
      typeof payload.tokenVersion === "number" &&
      payload.tokenVersion !== (user.tokenVersion ?? 0)
    ) {
      sendErrorWithData(
        res,
        "Session revoked. Please log in again.",
        { code: "TOKEN_EXPIRED" },
        401
      );
      return;
    }

    const dbRoles = (user.roles || "").split(",").map((r: string) => r.trim());
    const jwtRoles = (payload.roles || payload.role || "").split(",").map((r: string) => r.trim());
    if (!dbRoles.includes("rider") || !jwtRoles.includes("rider")) {
      sendErrorWithData(
        res,
        "Access denied. This portal is for riders only.",
        { code: "ROLE_DENIED" },
        403
      );
      return;
    }

    const [profile] = await db
      .select()
      .from(riderProfilesTable)
      .where(eq(riderProfilesTable.userId, user.id))
      .limit(1);
    req.riderId = user.id;
    req.riderUser = profile
      ? { ...user, ...profile, kycStatus: profile.kycStatus ?? user.kycStatus }
      : user;
    next();
  } catch (err) {
    logger.error("[riderAuth] DB error:", err instanceof Error ? err.message : err);
    sendError(res, "Authentication service temporarily unavailable", 503);
  }
}

router.use(riderAuth);

/* ── GET /rider/me — Profile ── */
router.get("/me", async (req, res) => {
  try {
    /* appRole guard — client must supply ?appRole=rider so the server can
     reject tokens that belong to a different app context (e.g. a vendor
     JWT accidentally sent to the rider app). Returns WRONG_ROLE so clients
     can surface a meaningful "wrong app" error instead of a generic 403. */
    const appRole = req.query.appRole as string | undefined;
    if (appRole && appRole !== "rider") {
      sendErrorWithData(
        res,
        "Access denied. This endpoint requires a rider session.",
        { code: "WRONG_ROLE" },
        403
      );
      return;
    }
    const user = req.riderUser!;
    const riderId = user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const s = await getCachedSettings();
    const riderKeepPct = (Number(s["rider_keep_pct"]) || 80) / 100;

    const [riderProfile] = await db
      .select()
      .from(riderProfilesTable)
      .where(eq(riderProfilesTable.userId, riderId))
      .limit(1);

    const [
      ordersTodayStats,
      ordersAllStats,
      ridesTodayStats,
      ridesAllStats,
      bonusTodayStats,
      bonusAllStats,
    ] = await Promise.all([
      db
        .select({ c: count(), s: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            gte(ordersTable.updatedAt, today),
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ c: count(), s: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ c: count(), s: sum(ridesTable.fare) })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.riderId, riderId),
            eq(ridesTable.status, "completed"),
            gte(ridesTable.updatedAt, today)
          )
        ),
      db
        .select({ c: count(), s: sum(ridesTable.fare) })
        .from(ridesTable)
        .where(and(eq(ridesTable.riderId, riderId), eq(ridesTable.status, "completed"))),
      /* Per-trip bonus credits (rider_bonus_per_trip wallet transactions) */
      db
        .select({ s: sum(walletTransactionsTable.amount) })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "bonus"),
            gte(walletTransactionsTable.createdAt, today)
          )
        ),
      db
        .select({ s: sum(walletTransactionsTable.amount) })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "bonus")
          )
        ),
    ]);

    const deliveriesToday = (ordersTodayStats[0]?.c ?? 0) + (ridesTodayStats[0]?.c ?? 0);
    const earningsToday =
      Math.round(
        (safeNum(ordersTodayStats[0]?.s) + safeNum(ridesTodayStats[0]?.s)) * riderKeepPct * 100
      ) /
        100 +
      safeNum(bonusTodayStats[0]?.s);
    const totalDeliveries = (ordersAllStats[0]?.c ?? 0) + (ridesAllStats[0]?.c ?? 0);
    const totalEarnings =
      Math.round(
        (safeNum(ordersAllStats[0]?.s) + safeNum(ridesAllStats[0]?.s)) * riderKeepPct * 100
      ) /
        100 +
      safeNum(bonusAllStats[0]?.s);

    const [ratingRow] = await db
      .select({ avg: avg(reviewsTable.rating) })
      .from(reviewsTable)
      .where(eq(reviewsTable.riderId, riderId));
    const avgRating = ratingRow?.avg
      ? parseFloat(parseFloat(String(ratingRow.avg)).toFixed(1))
      : null;

    sendSuccess(res, {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.roles,
      roles: user.roles,
      avatar: user.avatar,
      isOnline: user.isOnline,
      isRestricted: user.isRestricted ?? (!user.isActive && (user.cancelCount ?? 0) > 0),
      approvalStatus: user.approvalStatus ?? "approved",
      rejectionReason: user.approvalNote ?? null,
      walletBalance: safeNum(user.walletBalance),
      cnic: user.cnic,
      address: user.address,
      city: user.city,
      area: user.area,
      emergencyContact: user.emergencyContact,
      vehicleType: riderProfile?.vehicleType ?? null,
      vehiclePlate: riderProfile?.vehiclePlate ?? null,
      vehicleRegNo: riderProfile?.vehicleRegNo ?? null,
      drivingLicense: riderProfile?.drivingLicense ?? null,
      vehiclePhoto: riderProfile?.vehiclePhoto ?? null,
      bankName: user.bankName,
      bankAccount: user.bankAccount,
      bankAccountTitle: user.bankAccountTitle,
      twoFactorEnabled: !!user.totpEnabled,
      accountLevel: user.accountLevel,
      kycStatus: user.kycStatus,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      dailyGoal: riderProfile?.dailyGoal ? parseFloat(String(riderProfile.dailyGoal)) : null,
      ...(() => {
        try {
          const docs = JSON.parse(riderProfile?.documents || "{}");
          return {
            cnicDocUrl: docs.cnicDocUrl || null,
            cnicBackDocUrl: docs.cnicBackDocUrl || null,
            licenseDocUrl: docs.licenseDocUrl || null,
            regDocUrl: docs.regDocUrl || null,
          };
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[fn] error with fallback return"
          );
          return { cnicDocUrl: null, cnicBackDocUrl: null, licenseDocUrl: null, regDocUrl: null };
        }
      })(),
      stats: {
        deliveriesToday,
        earningsToday: parseFloat(earningsToday.toFixed(2)),
        totalDeliveries,
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        rating: avgRating,
      },
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/kyc/request — Submit KYC review from existing registration docs ── */
router.post("/kyc/request", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const [riderProfile] = await db
      .select({ documents: riderProfilesTable.documents })
      .from(riderProfilesTable)
      .where(eq(riderProfilesTable.userId, riderId))
      .limit(1);

    let hasDocs = false;
    if (riderProfile?.documents) {
      try {
        const docs = JSON.parse(riderProfile.documents);
        hasDocs = !!(docs.cnicDocUrl || docs.licenseDocUrl || docs.vehiclePhoto);
      } catch {
        hasDocs = false;
      }
    }
    if (!hasDocs) {
      sendForbidden(
        res,
        "No documents found. Please upload your documents in the Vehicle tab first."
      );
      return;
    }

    const [user] = await db
      .select({ kycStatus: usersTable.kycStatus })
      .from(usersTable)
      .where(eq(usersTable.id, riderId))
      .limit(1);

    if (user?.kycStatus === "verified") {
      sendError(res, "Your documents are already verified.", 400);
      return;
    }
    if (user?.kycStatus === "pending") {
      sendError(res, "Your KYC review is already in progress.", 400);
      return;
    }

    await db
      .update(usersTable)
      .set({ kycStatus: "pending", updatedAt: new Date() })
      .where(eq(usersTable.id, riderId));

    logger.info({ riderId }, "[kyc] rider requested KYC review from registration docs");
    sendSuccess(res, {
      message: "KYC review requested. Our team will review your documents shortly.",
    });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "[kyc/request] error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── PATCH /rider/online — Toggle online status ── */
router.patch("/online", async (req, res) => {
  try {
    const parsed = onlineSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    const riderId = req.riderId!;
    const riderUser = req.riderUser!;
    const { isOnline } = parsed.data;
    /* Block pending-approval riders from going online */
    if (isOnline && (riderUser.approvalStatus ?? "pending") !== "approved") {
      sendForbidden(
        res,
        "Your account is pending re-verification. You cannot go online until an admin approves your profile."
      );
      return;
    }
    let serviceZoneWarning: string | undefined;
    if (isOnline) {
      try {
        const reqLat = typeof req.body.latitude === "number" ? req.body.latitude : undefined;
        const reqLng = typeof req.body.longitude === "number" ? req.body.longitude : undefined;
        let checkLat = reqLat;
        let checkLng = reqLng;
        if (checkLat === undefined || checkLng === undefined) {
          const [loc] = await db
            .select({
              latitude: liveLocationsTable.latitude,
              longitude: liveLocationsTable.longitude,
            })
            .from(liveLocationsTable)
            .where(eq(liveLocationsTable.userId, riderId))
            .limit(1);
          if (loc) {
            checkLat = parseFloat(String(loc.latitude));
            checkLng = parseFloat(String(loc.longitude));
          }
        }
        if (
          checkLat !== undefined &&
          checkLng !== undefined &&
          Number.isFinite(checkLat) &&
          Number.isFinite(checkLng) &&
          !(checkLat === 0 && checkLng === 0)
        ) {
          const zoneCheck = await isInServiceZone(checkLat, checkLng, "rides");
          if (!zoneCheck.allowed) {
            serviceZoneWarning =
              "You are currently outside the active service area. You may not receive ride requests until you move into a service zone.";
          }
        }
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          "[route] non-critical error suppressed"
        );
      }
    }

    await db
      .update(usersTable)
      .set({ isOnline: !!isOnline, updatedAt: new Date() })
      .where(eq(usersTable.id, riderId));

    /* Reset spoof hit counter when going offline so the next session starts clean.
     clearSpoofHits is defined later in this file as a hoisted function declaration
     (line ~2557) — no import needed since it lives in the same module. */
    if (!isOnline) {
      clearSpoofHits(riderId);
    }

    /* When going online, immediately upsert live_locations with last known
     coordinates so the rider appears on the admin map without waiting for
     the first GPS ping. Falls back gracefully if no prior location exists. */
    if (isOnline) {
      try {
        const STALE_SEED_MS = 30 * 60 * 1000;
        const [lastLog] = await db
          .select({
            latitude: locationLogsTable.latitude,
            longitude: locationLogsTable.longitude,
            createdAt: locationLogsTable.createdAt,
          })
          .from(locationLogsTable)
          .where(and(eq(locationLogsTable.userId, riderId), eq(locationLogsTable.role, "rider")))
          .orderBy(desc(locationLogsTable.createdAt))
          .limit(1);
        const now = new Date();
        const isStale =
          lastLog?.createdAt &&
          now.getTime() - new Date(lastLog.createdAt).getTime() > STALE_SEED_MS;
        if (lastLog && !isStale) {
          await db
            .insert(liveLocationsTable)
            .values({
              userId: riderId,
              latitude: lastLog.latitude,
              longitude: lastLog.longitude,
              role: "rider",
              action: null,
              onlineSince: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: liveLocationsTable.userId,
              /* onlineSince is set only here (session start) — heartbeat does NOT overwrite it */
              set: {
                latitude: lastLog.latitude,
                longitude: lastLog.longitude,
                role: "rider",
                action: null,
                onlineSince: now,
                updatedAt: now,
              },
            });
        } else {
          /* No prior GPS log: still set onlineSince so session start is tracked */
          await db
            .insert(liveLocationsTable)
            .values({
              userId: riderId,
              latitude: "0",
              longitude: "0",
              role: "rider",
              action: null,
              onlineSince: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: liveLocationsTable.userId,
              set: { onlineSince: now, updatedAt: now },
            })
            .catch((e: unknown) => {
              logger.warn("[rider] live_location seed failed:", (e as Error)?.message);
            });
        }
      } catch (e: unknown) {
        logger.warn("[rider] live_location seed failed:", (e as Error)?.message);
      }
    }

    /* Emit real-time status event to admin-fleet */
    try {
      emitRiderStatus({
        userId: riderId,
        isOnline: !!isOnline,
        name: riderUser.name ?? undefined,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        "[route] non-critical error suppressed"
      );
    }

    sendSuccess(res, {
      isOnline: !!isOnline,
      ...(serviceZoneWarning ? { serviceZoneWarning } : {}),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── PATCH /rider/profile — Update profile ── */
router.patch("/profile", async (req, res) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    const riderId = req.riderId!;
    const currentUser = req.riderUser!;
    const {
      name,
      email,
      cnic,
      address,
      city,
      emergencyContact,
      vehicleType,
      vehiclePlate,
      vehicleRegNo,
      drivingLicense,
      bankName,
      bankAccount,
      bankAccountTitle,
      avatar,
      cnicDocUrl,
      licenseDocUrl,
      regDocUrl,
      vehiclePhoto,
      dailyGoal,
    } = parsed.data;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const profileUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (cnic !== undefined) updates.cnic = cnic;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (vehicleType !== undefined)
      profileUpdates.vehicleType = normalizeVehicleType(vehicleType) || vehicleType;
    if (vehiclePlate !== undefined) profileUpdates.vehiclePlate = vehiclePlate;
    if (vehicleRegNo !== undefined) profileUpdates.vehicleRegNo = vehicleRegNo;
    if (drivingLicense !== undefined) profileUpdates.drivingLicense = drivingLicense;
    if (dailyGoal !== undefined)
      profileUpdates.dailyGoal = dailyGoal != null ? String(dailyGoal) : null;
    if (bankName !== undefined) updates.bankName = bankName;
    if (bankAccount !== undefined) updates.bankAccount = bankAccount;
    if (bankAccountTitle !== undefined) updates.bankAccountTitle = bankAccountTitle;
    if (avatar !== undefined) {
      if (avatar && !avatar.startsWith("/api/uploads/")) {
        sendValidationError(res, "Avatar must be an uploaded file URL");
        return;
      }
      updates.avatar = avatar;
    }
    /* Document photo URLs — stored in the rider profile `documents` JSON column. */
    if (cnicDocUrl !== undefined || licenseDocUrl !== undefined || regDocUrl !== undefined) {
      if (cnicDocUrl && !cnicDocUrl.startsWith("/api/uploads/")) {
        sendValidationError(res, "cnicDocUrl must be an uploaded file URL");
        return;
      }
      if (licenseDocUrl && !licenseDocUrl.startsWith("/api/uploads/")) {
        sendValidationError(res, "licenseDocUrl must be an uploaded file URL");
        return;
      }
      if (regDocUrl && !regDocUrl.startsWith("/api/uploads/")) {
        sendValidationError(res, "regDocUrl must be an uploaded file URL");
        return;
      }
      let existingDocs: Record<string, string> = {};
      try {
        existingDocs = JSON.parse(currentUser.documents || "{}");
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[route] intentional: ignore parse/parse error`
        );
      }
      if (cnicDocUrl !== undefined) existingDocs.cnicDocUrl = cnicDocUrl;
      if (licenseDocUrl !== undefined) existingDocs.licenseDocUrl = licenseDocUrl;
      if (regDocUrl !== undefined) existingDocs.regDocUrl = regDocUrl;
      profileUpdates.documents = JSON.stringify(existingDocs);
    }
    if (vehiclePhoto !== undefined) {
      if (vehiclePhoto && !vehiclePhoto.startsWith("/api/uploads/")) {
        sendValidationError(res, "vehiclePhoto must be an uploaded file URL");
        return;
      }
      profileUpdates.vehiclePhoto = vehiclePhoto;
    }

    /* Detect sensitive identity field changes — reset approval to pending so admin can re-verify */
    const cnicChanged = cnic !== undefined && cnic !== currentUser.cnic;
    const drivingLicenseChanged =
      drivingLicense !== undefined && drivingLicense !== currentUser.drivingLicense;
    if (cnicChanged || drivingLicenseChanged) {
      updates.approvalStatus = "pending";
      updates.isOnline = false;
    }

    let user: typeof usersTable.$inferSelect & Partial<typeof riderProfilesTable.$inferSelect>;
    try {
      /* H-01: Wrap both table writes in one transaction so a partial failure
         (e.g. riderProfiles insert failing) cannot leave users + riderProfiles
         in an inconsistent state (e.g. CNIC updated but vehicleType not). */
      const [updated, profile] = await db.transaction(async (tx) => {
        const [upd] = await tx
          .update(usersTable)
          .set(updates)
          .where(eq(usersTable.id, riderId))
          .returning();
        let prof: typeof riderProfilesTable.$inferSelect | undefined;
        if (Object.keys(profileUpdates).length > 1) {
          const [up] = await tx
            .insert(riderProfilesTable)
            .values({ userId: riderId, ...profileUpdates })
            .onConflictDoUpdate({ target: riderProfilesTable.userId, set: profileUpdates })
            .returning();
          prof = up;
        } else {
          const [existing] = await tx
            .select()
            .from(riderProfilesTable)
            .where(eq(riderProfilesTable.userId, riderId))
            .limit(1);
          prof = existing;
        }
        return [upd, prof] as const;
      });
      user = profile
        ? { ...updated, ...profile, kycStatus: profile.kycStatus ?? updated.kycStatus }
        : updated;
    } catch (dbErr: unknown) {
      const msg = (dbErr as Error)?.message || "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        /* L-01: Return a field-specific error message so the client can highlight
           the conflicting field rather than showing a generic 409 banner. */
        const isCnicConflict = msg.toLowerCase().includes("cnic");
        sendError(
          res,
          isCnicConflict
            ? "This CNIC is already registered to another account"
            : "A profile field conflicts with an existing record (e.g. duplicate CNIC)",
          409
        );
      } else {
        sendError(res, "Failed to update profile. Please try again.", 500);
      }
      return;
    }

    if (cnicChanged || drivingLicenseChanged) {
      const reVerifyLang = await getUserLanguage(riderId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: riderId,
          title: t("approvalPending", reVerifyLang),
          body: t("approvalMsg", reVerifyLang),
          type: "system",
          icon: "shield-outline",
        })
        .catch((e: Error) => {
          logger.warn(
            { riderId, err: e.message },
            "[rider] approval-pending notification insert failed"
          );
        });
    }

    sendSuccess(res, {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      role: user.roles,
      isOnline: user.isOnline,
      walletBalance: safeNum(user.walletBalance),
      approvalStatus: user.approvalStatus,
      cnic: user.cnic,
      address: user.address,
      city: user.city,
      area: user.area,
      emergencyContact: user.emergencyContact,
      vehicleType: user.vehicleType,
      vehiclePlate: user.vehiclePlate,
      vehicleRegNo: user.vehicleRegNo,
      drivingLicense: user.drivingLicense,
      bankName: user.bankName,
      bankAccount: user.bankAccount,
      bankAccountTitle: user.bankAccountTitle,
      accountLevel: user.accountLevel,
      kycStatus: user.kycStatus,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      vehiclePhoto: user.vehiclePhoto,
      ...(() => {
        try {
          const docs = JSON.parse(user.documents || "{}");
          return {
            cnicDocUrl: docs.cnicDocUrl || null,
            licenseDocUrl: docs.licenseDocUrl || null,
            regDocUrl: docs.regDocUrl || null,
          };
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[fn] error with fallback return"
          );
          return { cnicDocUrl: null, licenseDocUrl: null, regDocUrl: null };
        }
      })(),
      ...(cnicChanged || drivingLicenseChanged ? { pendingVerification: true } : {}),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── Haversine distance (km) ── */
function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Phone masking helper ──
   Returns the raw phone number only for statuses where the rider has formally accepted
   the job and needs to contact the customer. All other statuses get a masked number. */
const PHONE_REVEAL_ORDER_STATUSES = new Set(["out_for_delivery", "picked_up"]);
const PHONE_REVEAL_RIDE_STATUSES = new Set(["accepted", "arrived", "in_transit"]);

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "****";
  return `${digits.slice(0, 4)}-***-${digits.slice(-2)}`;
}

/* ── GET /rider/requests — Available orders + rides (incl. bargaining, with own bid info + distance/ETA) ── */
/* InDrive-style broadcast: ALL nearby riders within admin radius see every open ride.
   First to accept wins via atomic WHERE riderId IS NULL. */
/* H-03: Rate-limit the broadcast-request feed — without this, an always-on client
   could hammer the endpoint and inflate DB load with large IN-clauses. */
router.get("/requests", requestFeedLimiter, async (req, res) => {
  try {
    const riderId = req.riderId!;
    const s = await getCachedSettings();
    const avgSpeed = parseFloat(s["dispatch_avg_speed_kmh"] ?? "25");
    const radiusKm = parseFloat(s["dispatch_min_radius_km"] ?? "5");

    const riderUser = req.riderUser! as Record<string, unknown>;
    const riderVehicle = normalizeVehicleType(String(riderUser.vehicleType ?? ""));

    const [orders, rides, myBids, riderLoc] = await Promise.all([
      db
        .select()
        .from(ordersTable)
        .where(
          and(
            or(eq(ordersTable.status, "confirmed"), eq(ordersTable.status, "preparing")),
            isNull(ordersTable.riderId),
            isNull(ordersTable.deletedAt)
          )
        )
        .orderBy(desc(ordersTable.createdAt))
        .limit(20),
      db
        .select()
        .from(ridesTable)
        .where(
          and(
            or(eq(ridesTable.status, "searching"), eq(ridesTable.status, "bargaining")),
            isNull(ridesTable.riderId)
          )
        )
        .orderBy(desc(ridesTable.createdAt))
        .limit(30),
      db
        .select()
        .from(rideBidsTable)
        .where(and(eq(rideBidsTable.riderId, riderId), eq(rideBidsTable.status, "pending"))),
      db.select().from(liveLocationsTable).where(eq(liveLocationsTable.userId, riderId)).limit(1),
    ]);

    const myBidMap = new Map<string, (typeof myBids)[0]>(myBids.map((b) => [b.rideId, b]));
    const rLoc = riderLoc[0]
      ? {
          lat: parseFloat(String(riderLoc[0].latitude)),
          lng: parseFloat(String(riderLoc[0].longitude)),
        }
      : null;

    const filteredRides = rides
      .map((r) => {
        let riderDistanceKm: number | null = null;
        let riderEtaMin: number | null = null;
        if (rLoc && r.pickupLat && r.pickupLng) {
          riderDistanceKm =
            Math.round(
              calcDistance(rLoc.lat, rLoc.lng, parseFloat(r.pickupLat), parseFloat(r.pickupLng)) *
                10
            ) / 10;
          riderEtaMin = Math.max(1, Math.round((riderDistanceKm / avgSpeed) * 60));
        }
        return {
          ...r,
          fare: safeNum(r.fare),
          distance: safeNum(r.distance),
          offeredFare: r.offeredFare ? safeNum(r.offeredFare) : null,
          counterFare: r.counterFare ? safeNum(r.counterFare) : null,
          bargainRounds: r.bargainRounds ?? 0,
          riderDistanceKm,
          riderEtaMin,
          myBid: myBidMap.has(r.id)
            ? {
                id: myBidMap.get(r.id)!.id,
                fare: safeNum(myBidMap.get(r.id)!.fare),
                note: myBidMap.get(r.id)!.note,
              }
            : null,
        };
      })
      .filter((r) => {
        if (riderVehicle && r.type) {
          const rideType = normalizeVehicleType(r.type);
          if (rideType !== riderVehicle && rideType !== "any") return false;
        }
        if (r.riderDistanceKm == null) return true;
        return r.riderDistanceKm <= radiusKm;
      })
      .sort((a, b) => (a.riderDistanceKm ?? 999) - (b.riderDistanceKm ?? 999));

    /* Phone masking for /rider/requests:
     - ordersTable has no customerPhone column — the customer phone is only in usersTable.
       Orders are safe to spread as-is (no phone present in the row).
     - ridesTable has receiverPhone (parcel rides) which is the receiver contact.
       Mask it here: the rider has not been assigned yet so should not see full number. */
    const maskedRides = filteredRides.map((r) => ({
      ...r,
      receiverPhone: r.receiverPhone ? maskPhone(r.receiverPhone) : null,
    }));

    /* Include serverTime in the response so the client can compute clock offset
     for AcceptCountdown drift correction without a separate NTP round-trip. */
    res.status(200).json({
      success: true,
      serverTime: new Date().toISOString(),
      data: {
        orders: orders.map((o) => ({ ...o, total: safeNum(o.total) })),
        rides: maskedRides,
      },
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/active — Current active delivery ── */
router.get("/active", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const [order, ride] = await Promise.all([
      db
        .select()
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            or(
              eq(ordersTable.status, "confirmed"),
              eq(ordersTable.status, "preparing"),
              eq(ordersTable.status, "ready"),
              eq(ordersTable.status, "picked_up"),
              eq(ordersTable.status, "out_for_delivery")
            )
          )
        )
        .orderBy(desc(ordersTable.updatedAt))
        .limit(1),
      db
        .select()
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.riderId, riderId),
            or(
              eq(ridesTable.status, "accepted"),
              eq(ridesTable.status, "arrived"),
              eq(ridesTable.status, "in_transit")
            )
          )
        )
        .orderBy(desc(ridesTable.updatedAt))
        .limit(1),
    ]);

    // Enrich with customer name/phone so rider can call the customer
    let enrichedRide:
      | (Omit<NonNullable<(typeof ride)[0]>, "fare" | "distance"> & {
          fare: number;
          distance: number;
          customerName: string | null;
          customerPhone: string | null;
        })
      | null = null;
    if (ride[0]) {
      const [customer] = await db
        .select({ name: usersTable.name, phone: usersTable.phone })
        .from(usersTable)
        .where(eq(usersTable.id, ride[0].userId))
        .limit(1);
      const revealPhone = PHONE_REVEAL_RIDE_STATUSES.has(ride[0].status ?? "");
      enrichedRide = {
        ...ride[0],
        fare: safeNum(ride[0].fare),
        distance: safeNum(ride[0].distance),
        customerName: customer?.name || null,
        customerPhone: revealPhone ? customer?.phone || null : maskPhone(customer?.phone),
      };
    }

    let enrichedOrder:
      | (Omit<NonNullable<(typeof order)[0]>, "total"> & {
          total: number;
          customerName: string | null;
          customerPhone: string | null;
          vendorStoreName: string | null;
          vendorPhone: string | null;
        })
      | null = null;
    if (order[0]) {
      type CustomerRow = { name: string | null; phone: string | null };
      type VendorRow = { storeName: string | null; phone: string | null };
      const promises: [Promise<CustomerRow[]>, Promise<VendorRow[]>] = [
        db
          .select({ name: usersTable.name, phone: usersTable.phone })
          .from(usersTable)
          .where(eq(usersTable.id, order[0].userId))
          .limit(1),
        order[0].vendorId
          ? db
              .select({ storeName: vendorProfilesTable.storeName, phone: usersTable.phone })
              .from(usersTable)
              .leftJoin(vendorProfilesTable, eq(usersTable.id, vendorProfilesTable.userId))
              .where(eq(usersTable.id, order[0].vendorId))
              .limit(1)
          : Promise.resolve([]),
      ];
      const [customerRows, vendorRows] = await Promise.all(promises);
      const customer = customerRows[0];
      const vendor = vendorRows[0];
      const revealPhone = PHONE_REVEAL_ORDER_STATUSES.has(order[0].status ?? "");
      enrichedOrder = {
        ...order[0],
        total: safeNum(order[0].total),
        customerName: customer?.name || null,
        customerPhone: revealPhone ? customer?.phone || null : maskPhone(customer?.phone),
        vendorStoreName: vendor?.storeName || null,
        vendorPhone: vendor?.phone || null,
      };
    }

    sendSuccess(res, { order: enrichedOrder, ride: enrichedRide });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/orders/:id/accept — Accept an order ──
   Uses WHERE riderId IS NULL to prevent two riders accepting the same order (race condition) */
router.post("/orders/:id/accept", async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const paramParsed = idParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      sendValidationError(res, "Invalid order ID");
      return;
    }
    const riderId = req.riderId!;
    const riderUser = req.riderUser!;
    const orderId = paramParsed.data.id;

    if (riderUser.isRestricted) {
      sendForbidden(
        res,
        "Your account is restricted. You cannot accept new orders. Contact support for assistance."
      );
      return;
    }
    if ((riderUser.approvalStatus ?? "pending") !== "approved") {
      sendForbidden(
        res,
        "Your account is pending re-verification. You cannot accept orders until an admin approves your profile."
      );
      return;
    }

    const s = await getCachedSettings();

    /* ── Load target order first (needed for cash/COD checks) ── */
    const [targetOrder] = await db
      .select({ paymentMethod: ordersTable.paymentMethod })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    /* ── Cash-order gate: admin can restrict riders from taking cash orders ── */
    const cashAllowed = (s["rider_cash_allowed"] ?? "on") === "on";
    if (!cashAllowed) {
      if (targetOrder?.paymentMethod === "cash" || targetOrder?.paymentMethod === "cod") {
        sendForbidden(res, "Cash-on-delivery orders are currently not available for riders.");
        return;
      }
    }

    const isCashOrder =
      targetOrder?.paymentMethod === "cash" || targetOrder?.paymentMethod === "cod";
    const minBalance = isCashOrder ? parseFloat(s["rider_min_balance"] ?? "0") : 0;
    const maxDeliveries = parseInt(s["rider_max_deliveries"] ?? "3");

    /* ── All eligibility checks + atomic accept inside a single transaction ──
     This eliminates the TOCTOU window between the balance/count reads and the UPDATE. */
    let updated: typeof ordersTable.$inferSelect | undefined;
    let toctouError:
      | { status: number; message: string; data?: Record<string, unknown> }
      | undefined;

    await db.transaction(async (tx) => {
      /* ── Lock the rider row first to serialize concurrent accept attempts from the same rider.
       This prevents two parallel requests from both passing the activeCount check before
       either commit can update the count in the DB. ── */
      await tx.execute(sql`SELECT id FROM users WHERE id = ${riderId} FOR UPDATE`);

      /* ── Minimum wallet balance gate for cash/COD orders ── */
      if (isCashOrder && minBalance > 0) {
        const [riderRow] = await tx
          .select({ walletBalance: usersTable.walletBalance })
          .from(usersTable)
          .where(eq(usersTable.id, riderId))
          .limit(1);
        const currentBal = safeNum(riderRow?.walletBalance);
        if (currentBal < minBalance) {
          toctouError = {
            status: 403,
            message: `Minimum wallet balance required for cash orders is Rs. ${minBalance}. Your balance: Rs. ${currentBal.toFixed(0)}. Please top up your wallet to accept cash orders.`,
            data: { code: "BELOW_MIN_BALANCE", required: minBalance, current: currentBal },
          };
          return;
        }
      }

      /* ── Max simultaneous deliveries gate ── */
      const [activeOrders, activeRides] = await Promise.all([
        tx
          .select({ c: count() })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.riderId, riderId),
              or(
                eq(ordersTable.status, "out_for_delivery"),
                eq(ordersTable.status, "picked_up"),
                eq(ordersTable.status, "ready"),
                eq(ordersTable.status, "confirmed")
              )
            )
          ),
        tx
          .select({ c: count() })
          .from(ridesTable)
          .where(
            and(
              eq(ridesTable.riderId, riderId),
              or(
                eq(ridesTable.status, "accepted"),
                eq(ridesTable.status, "arrived"),
                eq(ridesTable.status, "in_transit")
              )
            )
          ),
      ]);
      const activeCount = (activeOrders[0]?.c ?? 0) + (activeRides[0]?.c ?? 0);
      if (activeCount >= maxDeliveries) {
        toctouError = {
          status: 429,
          message: `Maximum ${maxDeliveries} active deliveries allowed. Complete a current delivery first.`,
        };
        return;
      }

      /* ── Atomic accept: only succeeds if riderId is still NULL in DB ── */
      const now = new Date();
      const [result] = await tx
        .update(ordersTable)
        .set({
          riderId,
          riderName: String(riderUser.name || "Rider"),
          riderPhone: riderUser.phone ? String(riderUser.phone) : null,
          assignedRiderId: riderId,
          assignedAt: now,
          acceptedAt: now,
          updatedAt: now,
        })
        .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.riderId)))
        .returning();
      updated = result;
    });

    if (toctouError) {
      if (toctouError.data) {
        sendErrorWithData(res, toctouError.message, toctouError.data, toctouError.status);
        return;
      }
      sendError(res, toctouError.message, toctouError.status);
      return;
    }

    if (!updated) {
      // Either not found OR already taken by another rider
      const [existing] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);
      if (!existing) {
        sendNotFound(res, "Order not found");
        return;
      }
      sendError(res, "Order already taken by another rider", 409);
      return;
    }

    const orderAcceptLang = await getUserLanguage(updated.userId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: updated.userId,
        title: t("notifRideAccepted", orderAcceptLang) + " 🚴",
        body: t("notifOrderOnWay", orderAcceptLang),
        type: "order",
        icon: "bicycle-outline",
      })
      .catch((err: Error) => {
        logger.error("[rider] background op failed:", err.message);
      });

    const responseBody = { ...updated, total: safeNum(updated.total) };
    storeIdempotency(req, 200, { success: true, data: responseBody });
    sendSuccess(res, responseBody);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/orders/:id/reject — Rider explicitly rejects/skips an order ──
   Records the rejection server-side so the dispatch engine can skip this rider
   for future broadcasts of the same order. No penalty is applied. */
router.post("/orders/:id/reject", async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const paramParsed = idParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      sendValidationError(res, "Invalid order ID");
      return;
    }
    const riderId = req.riderId!;
    const orderId = paramParsed.data.id;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : "skipped";

    const [order] = await db
      .select({ id: ordersTable.id, status: ordersTable.status })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!order) {
      sendNotFound(res, "Order not found");
      return;
    }

    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: riderId,
        title: "Order skipped",
        body: `You skipped order ${orderId.slice(-6).toUpperCase()} — ${reason}`,
        type: "system",
        icon: "close-circle-outline",
      })
      .catch((e: Error) => {
        logger.warn(
          { riderId, orderId, err: e.message },
          "[rider] skip-order notification insert failed"
        );
      });

    storeIdempotency(req, 200, { success: true, data: { orderId, reason } });
    sendSuccess(res, { orderId, reason });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── Cancellation penalty helper ──
   Fully atomic: count read, base record, cancel-count increment, optional
   penalty deduction, and optional restriction are all inside ONE transaction
   so a partial failure cannot leave the cancel count inflated. Wallet balance
   is floored at 0 via GREATEST to prevent negative balances. */
async function handleCancelPenalty(
  riderId: string
): Promise<{ dailyCancels: number; penaltyApplied: number; restricted: boolean }> {
  const s = await getCachedSettings();
  const limit = parseInt(s["rider_cancel_limit_daily"] ?? "3", 10);
  const penaltyAmt = parseFloat(s["rider_cancel_penalty_amount"] ?? "50");
  const restrictEnabled = (s["rider_cancel_restrict_enabled"] ?? "on") === "on";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let penaltyApplied = 0;
  let restricted = false;
  let dailyCancels = 0;

  await db.transaction(async (tx) => {
    /* Lock-free count read inside transaction for consistency */
    const [countRow] = await tx
      .select({ c: count() })
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, riderId),
          eq(walletTransactionsTable.type, "cancel_penalty"),
          gte(walletTransactionsTable.createdAt, today),
          sql`reference LIKE 'cancel:%'`
        )
      );
    dailyCancels = (countRow?.c ?? 0) + 1;

    /* Base cancel event (amount=0) and cancel-count bump — always recorded */
    await tx.insert(walletTransactionsTable).values({
      id: generateId(),
      userId: riderId,
      type: "cancel_penalty",
      amount: "0",
      description: `Cancellation #${dailyCancels} today`,
      reference: `cancel:${randomUUID()}`,
    });
    await tx
      .update(usersTable)
      .set({ cancelCount: sql`cancel_count + 1`, updatedAt: new Date() })
      .where(eq(usersTable.id, riderId));

    if (dailyCancels > limit) {
      penaltyApplied = penaltyAmt;
      /* Floor wallet at 0 so balance can never go negative from a penalty */
      await tx
        .update(usersTable)
        .set({
          walletBalance: sql`GREATEST(wallet_balance - ${penaltyAmt}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, riderId));
      await tx.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: riderId,
        type: "cancel_penalty",
        amount: penaltyAmt.toFixed(2),
        description: `Excessive cancellation penalty (${dailyCancels}/${limit} today) — Rs. ${penaltyAmt} deducted`,
        reference: `cancel_penalty:${randomUUID()}`,
      });
      await tx.insert(riderPenaltiesTable).values({
        id: generateId(),
        riderId,
        type: "cancel",
        amount: penaltyAmt.toFixed(2),
        reason: `Excessive cancellation (${dailyCancels}/${limit} today)`,
      });

      if (restrictEnabled) {
        await tx
          .update(usersTable)
          .set({ isRestricted: true, updatedAt: new Date() })
          .where(eq(usersTable.id, riderId));
        restricted = true;
      }
    }
  });

  /* Notifications are outside the transaction (non-critical, fire-and-forget) */
  if (dailyCancels > limit) {
    const penaltyLang = await getUserLanguage(riderId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: riderId,
        title: restricted
          ? t("notifAccountRestricted", penaltyLang) + " ⚠️"
          : t("notifCancelPenalty", penaltyLang) + " ⚠️",
        body: restricted
          ? t("notifCancelRestrictedBody", penaltyLang)
              .replace("{count}", String(dailyCancels))
              .replace("{limit}", String(limit))
              .replace("{amount}", String(penaltyAmt))
          : t("notifCancelPenaltyBody", penaltyLang)
              .replace("{count}", String(dailyCancels))
              .replace("{limit}", String(limit))
              .replace("{amount}", String(penaltyAmt)),
        type: "system",
        icon: "alert-circle-outline",
      })
      .catch((e: Error) => {
        logger.warn(
          { riderId, err: e.message },
          "[rider] cancel-penalty notification insert failed"
        );
      });
  } else if (dailyCancels === limit) {
    const warnLang = await getUserLanguage(riderId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: riderId,
        title: t("notifCancelWarning", warnLang) + " ⚠️",
        body: t("notifCancelWarningBody", warnLang)
          .replace("{count}", String(dailyCancels))
          .replace("{limit}", String(limit))
          .replace("{amount}", String(penaltyAmt)),
        type: "system",
        icon: "alert-circle-outline",
      })
      .catch((e: Error) => {
        logger.warn(
          { riderId, err: e.message },
          "[rider] cancel-warning notification insert failed"
        );
      });
  }

  return { dailyCancels, penaltyApplied, restricted };
}

/* ── GET /rider/cancel-stats — Rider's cancellation stats ── */
router.get("/cancel-stats", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const s = await getCachedSettings();
    const dailyLimit = parseInt(s["rider_cancel_limit_daily"] ?? "3", 10);
    const penaltyAmt = parseFloat(s["rider_cancel_penalty_amount"] ?? "50");
    const restrictEnabled = (s["rider_cancel_restrict_enabled"] ?? "on") === "on";

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    /* Source of truth: walletTransactionsTable rows with type="cancel_penalty" where
     reference starts with "cancel:" — these are the base cancellation events (one per
     cancel, amount=0) written by handleCancelPenalty. Penalty rows have reference
     "cancel_penalty:..." and are excluded to avoid double-counting penalised cancels. */
    const [todayRow, weekRow, monthRow] = await Promise.all([
      db
        .select({ c: count() })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "cancel_penalty"),
            gte(walletTransactionsTable.createdAt, today),
            sql`reference LIKE 'cancel:%'`
          )
        ),
      db
        .select({ c: count() })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "cancel_penalty"),
            gte(walletTransactionsTable.createdAt, weekAgo),
            sql`reference LIKE 'cancel:%'`
          )
        ),
      db
        .select({ c: count() })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "cancel_penalty"),
            gte(walletTransactionsTable.createdAt, monthAgo),
            sql`reference LIKE 'cancel:%'`
          )
        ),
    ]);

    const todayCount = todayRow[0]?.c ?? 0;
    const weekCount = weekRow[0]?.c ?? 0;
    const monthCount = monthRow[0]?.c ?? 0;

    const [monthDeliveredRow, monthCompletedRow] = await Promise.all([
      db
        .select({ c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            gte(ordersTable.updatedAt, monthAgo)
          )
        ),
      db
        .select({ c: count() })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.riderId, riderId),
            eq(ridesTable.status, "completed"),
            gte(ridesTable.updatedAt, monthAgo)
          )
        ),
    ]);
    const monthTrips = (monthDeliveredRow[0]?.c ?? 0) + (monthCompletedRow[0]?.c ?? 0) + monthCount;
    const cancelRate =
      monthTrips > 0 ? parseFloat(((monthCount / monthTrips) * 100).toFixed(1)) : null;

    sendSuccess(res, {
      today: { cancels: todayCount },
      week: { cancels: weekCount },
      month: { cancels: monthCount },
      dailyCancels: todayCount,
      dailyLimit,
      penaltyAmount: penaltyAmt,
      remaining: Math.max(0, dailyLimit - todayCount),
      restrictEnabled,
      cancelRate,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── PATCH /rider/orders/:id/status — Update order status (delivered) ── */
router.patch("/orders/:id/status", async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const parsed = orderStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid status");
      return;
    }
    const riderId = req.riderId!;
    const { status, proofPhoto } = parsed.data;

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, req.params["id"] as string), eq(ordersTable.riderId, riderId)))
      .limit(1);
    if (!order) {
      sendNotFound(res, "Order not found or not yours");
      return;
    }

    /* Proof photo is mandatory for delivery confirmation — prevents fraudulent delivery claims */
    if (status === "delivered" && !proofPhoto) {
      sendValidationError(
        res,
        "Proof of delivery photo is required to mark an order as delivered. Please upload a photo."
      );
      return;
    }

    /* ── Rider Cancel: clear riderId + reset to preparing so another rider can pick it up ── */
    if (status === "cancelled") {
      const penalty = await handleCancelPenalty(riderId);

      const [cancelled] = await db
        .update(ordersTable)
        .set({ riderId: null, status: "preparing", updatedAt: new Date() })
        .where(
          and(eq(ordersTable.id, req.params["id"] as string), eq(ordersTable.riderId, riderId))
        )
        .returning();
      const riderChangeLang = await getUserLanguage(order.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: order.userId,
          title: t("notifRiderChange", riderChangeLang) + " 🔄",
          body: t("notifRiderChangeBody", riderChangeLang),
          type: "order",
          icon: "refresh-outline",
        })
        .catch((err: Error) => {
          logger.error("[rider] background op failed:", err.message);
        });
      const cancelledBody = {
        ...cancelled,
        total: safeNum(cancelled?.total || 0),
        cancelledByRider: true,
        cancelPenalty: penalty,
      };
      storeIdempotency(req, 200, { success: true, data: cancelledBody });
      sendSuccess(res, cancelledBody);
      return;
    }

    const ORDER_RIDER_TRANSITIONS: Record<string, string[]> = {
      confirmed: ["picked_up"],
      preparing: ["picked_up"],
      ready: ["picked_up"],
      picked_up: ["out_for_delivery"],
      out_for_delivery: ["delivered"],
    };
    const allowedNext = ORDER_RIDER_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(status)) {
      sendValidationError(
        res,
        `Cannot change order from "${order.status}" to "${status}". Allowed: ${allowedNext.join(", ") || "none"}.`
      );
      return;
    }

    const updateData: { status: string; updatedAt: Date; proofPhotoUrl?: string } = {
      status,
      updatedAt: new Date(),
    };
    if (status === "delivered" && proofPhoto) {
      updateData.proofPhotoUrl = proofPhoto;
    }

    let updated: typeof order;

    if (status === "delivered") {
      const s = await getCachedSettings();
      const riderKeepPct = (Number(s["rider_keep_pct"]) || 80) / 100;
      const platformFeePct = 1 - riderKeepPct;
      const bonusPerTrip = parseFloat(s["rider_bonus_per_trip"] ?? "0");
      const orderTotal = safeNum(order.total);
      const isCash = order.paymentMethod === "cash" || order.paymentMethod === "cod";

      if (isCash) {
        const platformFeeCents = Math.round(orderTotal * 100 * platformFeePct);
        const riderShareCents = Math.round(orderTotal * 100) - platformFeeCents;
        const platformFee = platformFeeCents / 100;
        const riderShare = riderShareCents / 100;
        const txResult = await db
          .transaction(async (tx) => {
            const [row] = await tx
              .update(ordersTable)
              .set(updateData)
              .where(
                and(
                  eq(ordersTable.id, req.params["id"] as string),
                  eq(ordersTable.riderId, riderId),
                  eq(ordersTable.status, order.status)
                )
              )
              .returning();
            if (!row) throw new Error("STATUS_CONFLICT");
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId: riderId,
              type: "cash_collection",
              amount: orderTotal.toFixed(2),
              description: `Cash collected — Order #${order.id.slice(-6).toUpperCase()} (Rs. ${orderTotal.toFixed(0)} total)`,
              reference: `order:${order.id}`,
              paymentMethod: "cash",
            });
            await tx
              .update(usersTable)
              .set({ walletBalance: sql`wallet_balance - ${platformFee}`, updatedAt: new Date() })
              .where(eq(usersTable.id, riderId));
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId: riderId,
              type: "platform_fee",
              amount: platformFee.toFixed(2),
              description: `Platform fee (${Math.round(platformFeePct * 100)}%) — Cash Order #${order.id.slice(-6).toUpperCase()} · Rider keeps Rs. ${riderShare}`,
              reference: `order:${order.id}`,
            });
            if (bonusPerTrip > 0) {
              await tx
                .update(usersTable)
                .set({
                  walletBalance: sql`wallet_balance + ${bonusPerTrip}`,
                  updatedAt: new Date(),
                })
                .where(eq(usersTable.id, riderId));
              await tx.insert(walletTransactionsTable).values({
                id: generateId(),
                userId: riderId,
                type: "bonus",
                amount: bonusPerTrip.toFixed(2),
                description: `Per-trip bonus — Order #${order.id.slice(-6).toUpperCase()}`,
              });
            }
            return row;
          })
          .catch((err: Error) => {
            if (err.message === "STATUS_CONFLICT") return null;
            throw err;
          });
        if (!txResult) {
          sendError(res, "Order status has already been updated", 409);
          return;
        }
        updated = txResult;
        const riderCashLang = await getUserLanguage(riderId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: riderId,
            title: t("notifOrderDelivered", riderCashLang),
            body: t("notifCashFeeDeductedBody", riderCashLang)
              .replace("{fee}", String(platformFee))
              .replace("{cash}", orderTotal.toFixed(0)),
            type: "wallet",
            icon: "wallet-outline",
          })
          .catch((e: Error) => logger.error("[rider] notif insert failed:", e.message));
      } else {
        const earnings = Math.round(orderTotal * 100 * riderKeepPct) / 100;
        const totalCredit = Math.round((earnings + bonusPerTrip) * 100) / 100;
        const txResult = await db
          .transaction(async (tx) => {
            const [row] = await tx
              .update(ordersTable)
              .set(updateData)
              .where(
                and(
                  eq(ordersTable.id, req.params["id"] as string),
                  eq(ordersTable.riderId, riderId),
                  eq(ordersTable.status, order.status)
                )
              )
              .returning();
            if (!row) throw new Error("STATUS_CONFLICT");
            await tx
              .update(usersTable)
              .set({ walletBalance: sql`wallet_balance + ${totalCredit}`, updatedAt: new Date() })
              .where(eq(usersTable.id, riderId));
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId: riderId,
              type: "credit",
              amount: earnings.toFixed(2),
              description: `Delivery earnings — Order #${order.id.slice(-6).toUpperCase()} (${Math.round(riderKeepPct * 100)}%)`,
            });
            if (bonusPerTrip > 0) {
              await tx.insert(walletTransactionsTable).values({
                id: generateId(),
                userId: riderId,
                type: "bonus",
                amount: bonusPerTrip.toFixed(2),
                description: `Per-trip bonus — Order #${order.id.slice(-6).toUpperCase()}`,
              });
            }
            return row;
          })
          .catch((err: Error) => {
            if (err.message === "STATUS_CONFLICT") return null;
            throw err;
          });
        if (!txResult) {
          sendError(res, "Order status has already been updated", 409);
          return;
        }
        updated = txResult;
        const riderEarnLang = await getUserLanguage(riderId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: riderId,
            title: t("notifWalletCredited", riderEarnLang),
            body: t("notifWalletCreditedBody", riderEarnLang).replace(
              "{amount}",
              earnings.toFixed(0)
            ),
            type: "wallet",
            icon: "wallet-outline",
          })
          .catch((e: Error) =>
            logger.warn(
              {
                message: "[rider] rider-delivery-earn notif insert failed",
                error: e.message,
                code: "RIDER_NOTIF_EARN_FAILED",
                correlationId: null,
                timestamp: new Date().toISOString(),
                userId: riderId,
              },
              "[rider] rider-delivery-earn notif insert failed"
            )
          );
      }

      const custDelivLang = await getUserLanguage(order.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: order.userId,
          title: t("notifOrderDelivered", custDelivLang) + " 🎉",
          body: t("orderDeliveredEnjoy", custDelivLang),
          type: "order",
          icon: "bag-check-outline",
        })
        .catch((e: unknown) =>
          logger.warn(
            {
              message: "[rider] customer order-delivered notif insert failed",
              error: e instanceof Error ? e.message : String(e),
              code: "RIDER_NOTIF_CUST_DELIVERED_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
              orderId: order.userId,
            },
            "[rider] customer order-delivered notif insert failed"
          )
        );

      /* ── Customer loyalty points (customer_loyalty_enabled + customer_loyalty_pts) ── */
      const loyaltyEnabled = (s["customer_loyalty_enabled"] ?? "on") === "on";
      if (loyaltyEnabled && order.userId) {
        const loyaltyPtsPerHundred = parseFloat(s["customer_loyalty_pts"] ?? "5");
        const orderTotal = safeNum(order.total);
        const loyaltyPts = Math.floor((orderTotal / 100) * loyaltyPtsPerHundred);
        if (loyaltyPts > 0) {
          try {
            await db.transaction(async (tx) => {
              await tx
                .update(usersTable)
                .set({ walletBalance: sql`wallet_balance + ${loyaltyPts}`, updatedAt: new Date() })
                .where(eq(usersTable.id, order.userId));
              await tx.insert(walletTransactionsTable).values({
                id: generateId(),
                userId: order.userId,
                type: "loyalty",
                amount: loyaltyPts.toFixed(2),
                description: `Loyalty points (${loyaltyPtsPerHundred} pts/Rs.100) — Order #${order.id.slice(-6).toUpperCase()}`,
              });
            });
            const loyaltyLang = await getUserLanguage(order.userId);
            await db
              .insert(notificationsTable)
              .values({
                id: generateId(),
                userId: order.userId,
                title: t("notifLoyaltyEarned", loyaltyLang) + " ⭐",
                body: t("notifLoyaltyEarnedBody", loyaltyLang).replace(
                  "{points}",
                  String(loyaltyPts)
                ),
                type: "wallet",
                icon: "star-outline",
              })
              .catch((err: Error) => {
                logger.error("[rider] loyalty notif failed:", err.message);
              });
          } catch (err) {
            logger.error(
              "[rider] loyalty credit tx failed:",
              err instanceof Error ? err.message : err
            );
          }
        }
      }

      /* ── Finance cashback credit to customer ── */
      const cashbackEnabled = (s["finance_cashback_enabled"] ?? "off") === "on";
      if (cashbackEnabled && order.userId) {
        const cashbackPct = parseFloat(s["finance_cashback_pct"] ?? "2") / 100;
        const cashbackMaxRs = parseFloat(s["finance_cashback_max_rs"] ?? "100");
        const orderTotal = safeNum(order.total);
        const rawCashback = parseFloat((orderTotal * cashbackPct).toFixed(2));
        const cashbackAmt = Math.min(rawCashback, cashbackMaxRs);
        if (cashbackAmt > 0) {
          try {
            await db.transaction(async (tx) => {
              await tx
                .update(usersTable)
                .set({ walletBalance: sql`wallet_balance + ${cashbackAmt}`, updatedAt: new Date() })
                .where(eq(usersTable.id, order.userId));
              await tx.insert(walletTransactionsTable).values({
                id: generateId(),
                userId: order.userId,
                type: "cashback",
                amount: cashbackAmt.toFixed(2),
                description: `Cashback ${Math.round(cashbackPct * 100)}% — Order #${order.id.slice(-6).toUpperCase()}`,
              });
            });
            const cashbackLang = await getUserLanguage(order.userId);
            await db
              .insert(notificationsTable)
              .values({
                id: generateId(),
                userId: order.userId,
                title: t("notifCashbackCredited", cashbackLang) + " 🎁",
                body: t("notifCashbackCreditedBody", cashbackLang).replace(
                  "{amount}",
                  cashbackAmt.toFixed(0)
                ),
                type: "wallet",
                icon: "wallet-outline",
              })
              .catch((err: Error) => {
                logger.error("[rider] cashback notif failed:", err.message);
              });
          } catch (err) {
            logger.error(
              "[rider] cashback credit tx failed:",
              err instanceof Error ? err.message : err
            );
          }
        }
      }
    } else {
      const [row] = await db
        .update(ordersTable)
        .set(updateData)
        .where(
          and(
            eq(ordersTable.id, req.params["id"] as string),
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, order.status)
          )
        )
        .returning();
      if (!row) {
        sendNotFound(res, "Order not found or not yours");
        return;
      }
      updated = row;
    }

    if (status === "delivered") {
      fireAndForget(
        emitWebhookEvent("order_delivered", {
          orderId: updated.id,
          riderId,
          userId: updated.userId,
          total: safeNum(updated.total).toFixed(2),
        }),
        "rider:webhook:order_delivered",
        logger,
        { orderId: updated.id, code: "WEBHOOK_EMIT" }
      );
      fireAndForget(
        emitWebhookEvent("payment_received", {
          orderId: updated.id,
          userId: updated.userId,
          amount: safeNum(updated.total).toFixed(2),
          method: updated.paymentMethod ?? "unknown",
        }),
        "rider:webhook:payment_received",
        logger,
        { orderId: updated.id, code: "WEBHOOK_EMIT" }
      );
    }

    const orderStatusBody = { ...updated, total: safeNum(updated.total) };
    storeIdempotency(req, 200, { success: true, data: orderStatusBody });
    sendSuccess(res, orderStatusBody);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/rides/:id/accept — Accept a ride ──
   Uses WHERE riderId IS NULL to prevent two riders accepting same ride (race condition) */
router.post("/rides/:id/accept", csrfDoubleSubmit, validateRiderProfileComplete, rideAcceptLimiter, async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const paramParsed = idParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      sendValidationError(res, "Invalid ride ID");
      return;
    }
    const riderId = req.riderId!;
    const riderUser = req.riderUser!;
    const rideId = paramParsed.data.id;

    if (riderUser.isRestricted) {
      sendForbidden(
        res,
        "Your account is restricted. You cannot accept new rides. Contact support for assistance."
      );
      return;
    }
    if ((riderUser.approvalStatus ?? "pending") !== "approved") {
      sendForbidden(
        res,
        "Your account is pending re-verification. You cannot accept rides until an admin approves your profile."
      );
      return;
    }

    /* GPS spoof guard — validate the rider's current position before processing accept */
    {
      const [livePos] = await db
        .select({ latitude: liveLocationsTable.latitude, longitude: liveLocationsTable.longitude })
        .from(liveLocationsTable)
        .where(eq(liveLocationsTable.userId, riderId))
        .limit(1);
      if (livePos) {
        try {
          await validateRiderLocationSecurity(
            riderId,
            parseFloat(String(livePos.latitude)),
            parseFloat(String(livePos.longitude))
          );
        } catch (spoofErr) {
          const se = spoofErr as { code?: string; httpStatus?: number; message?: string };
          if (se.code === "GPS_SPOOF") {
            sendForbidden(res, se.message ?? "GPS validation failed");
            return;
          }
          throw spoofErr;
        }
      }
    }

    const s = await getCachedSettings();
    const maxDeliveries = parseInt(s["rider_max_deliveries"] ?? "3");

    /* Check if this is a bargaining ride — load it first (non-destructive pre-flight read) */
    const [targetRide] = await db
      .select()
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .limit(1);
    if (!targetRide) {
      sendNotFound(res, "Ride not found");
      return;
    }

    /* For bargaining rides, rider accepts the customer's offered fare */
    const isBargaining = targetRide.status === "bargaining";
    const agreedFare = isBargaining ? (targetRide.offeredFare ?? targetRide.fare) : targetRide.fare;

    /* Pre-flight balance check for bargaining + wallet — fail fast before touching the DB.
     The actual deduction happens AFTER the atomic accept to prevent double-charging:
     if two riders race, only the winner should pay; loser's wallet stays untouched. */
    if (isBargaining && targetRide.paymentMethod === "wallet") {
      const fareAmt = safeNum(agreedFare);
      const [customer] = await db
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, targetRide.userId))
        .limit(1);
      if (!customer) {
        sendNotFound(res, "Customer not found");
        return;
      }
      if (safeNum(customer.walletBalance) < fareAmt) {
        sendValidationError(res, "Customer has insufficient wallet balance");
        return;
      }
    }

    /* Atomic accept: only succeeds if riderId is still NULL in the DB.
     All eligibility checks (active count, min balance) run INSIDE the transaction
     after locking the rider row — eliminating the TOCTOU window that existed when
     these checks ran outside the transaction (two concurrent requests from the same
     rider could both pass the count check before either commit wrote back to the DB).
     Wallet deduction is also all-or-nothing: the losing rider's money stays untouched. */
    const acceptedAt = new Date();
    const fareAmt = safeNum(agreedFare);

    let toctouError:
      | { status: number; message: string; data?: Record<string, unknown> }
      | undefined;
    let updated: typeof ridesTable.$inferSelect | undefined;
    try {
      updated = await db.transaction(async (tx) => {
        /* Lock the rider row first to serialize concurrent accept attempts from the same rider.
         This prevents two parallel requests from both passing the activeCount check before
         either commit can update the count in the DB — matching the order accept pattern. */
        await tx.execute(sql`SELECT id FROM users WHERE id = ${riderId} FOR UPDATE`);

        /* ── Max simultaneous deliveries gate (inside lock so count is authoritative) ── */
        const [activeOrders, activeRides] = await Promise.all([
          tx
            .select({ c: count() })
            .from(ordersTable)
            .where(
              and(
                eq(ordersTable.riderId, riderId),
                or(
                  eq(ordersTable.status, "out_for_delivery"),
                  eq(ordersTable.status, "picked_up"),
                  eq(ordersTable.status, "ready"),
                  eq(ordersTable.status, "confirmed")
                )
              )
            ),
          tx
            .select({ c: count() })
            .from(ridesTable)
            .where(
              and(
                eq(ridesTable.riderId, riderId),
                or(
                  eq(ridesTable.status, "accepted"),
                  eq(ridesTable.status, "arrived"),
                  eq(ridesTable.status, "in_transit")
                )
              )
            ),
        ]);
        const activeCount = (activeOrders[0]?.c ?? 0) + (activeRides[0]?.c ?? 0);
        if (activeCount >= maxDeliveries) {
          toctouError = {
            status: 429,
            message: `Maximum ${maxDeliveries} active deliveries allowed. Complete a current delivery first.`,
          };
          return undefined;
        }

        /* ── Minimum wallet balance gate for cash rides (inside lock so balance is authoritative) ── */
        if (targetRide.paymentMethod === "cash") {
          const minBalance = parseFloat(s["rider_min_balance"] ?? "0");
          if (minBalance > 0) {
            const [riderRow] = await tx
              .select({ walletBalance: usersTable.walletBalance })
              .from(usersTable)
              .where(eq(usersTable.id, riderId))
              .limit(1);
            const currentBal = safeNum(riderRow?.walletBalance);
            if (currentBal < minBalance) {
              toctouError = {
                status: 403,
                message: `Minimum wallet balance required for cash rides is Rs. ${minBalance}. Your balance: Rs. ${currentBal.toFixed(0)}. Please top up your wallet first.`,
                data: { code: "BELOW_MIN_BALANCE", required: minBalance, current: currentBal },
              };
              return undefined;
            }
          }
        }

        const [accepted] = await tx
          .update(ridesTable)
          .set({
            riderId,
            riderName: riderUser.name || "Rider",
            riderPhone: riderUser.phone,
            status: "accepted",
            fare: isBargaining ? fareAmt.toFixed(2) : targetRide.fare,
            bargainStatus: isBargaining ? "agreed" : targetRide.bargainStatus,
            acceptedAt,
            updatedAt: acceptedAt,
          })
          .where(
            and(
              eq(ridesTable.id, rideId),
              isNull(ridesTable.riderId),
              or(eq(ridesTable.status, "searching"), eq(ridesTable.status, "bargaining"))
            )
          )
          .returning();

        if (!accepted) return undefined; // another rider won the race or ride was cancelled

        /* Deduct wallet only if this rider won the accept race */
        if (isBargaining && targetRide.paymentMethod === "wallet") {
          const [walletDeducted] = await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance - ${fareAmt}`, updatedAt: new Date() })
            .where(
              and(
                eq(usersTable.id, targetRide.userId),
                gte(usersTable.walletBalance, fareAmt.toFixed(2))
              )
            )
            .returning({ id: usersTable.id });
          if (!walletDeducted) throw new Error("Insufficient wallet balance for ride payment.");
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: targetRide.userId,
            type: "debit",
            amount: fareAmt.toFixed(2),
            description: `Ride payment (bargained) — #${targetRide.id.slice(-6).toUpperCase()}`,
          });
        }

        await tx
          .update(rideBidsTable)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(and(eq(rideBidsTable.rideId, rideId), eq(rideBidsTable.status, "pending")));

        return accepted;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Insufficient wallet balance")) {
        sendErrorWithData(res, msg, { code: "INSUFFICIENT_WALLET" }, 402);
        return;
      }
      logger.error("[rider] ride accept transaction failed:", msg);
      sendError(res, "Failed to accept ride. Please try again.", 500);
      return;
    }

    if (toctouError) {
      if (toctouError.data) {
        sendErrorWithData(res, toctouError.message, toctouError.data, toctouError.status);
        return;
      }
      sendError(res, toctouError.message, toctouError.status);
      return;
    }

    if (!updated) {
      sendError(res, "Ride already taken by another rider", 409);
      return;
    }

    const rideAssignLang = await getUserLanguage(updated.userId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: updated.userId,
        title: t("notifRideAccepted", rideAssignLang) + " 🚗",
        body: isBargaining
          ? `${riderUser.name || "Your rider"} ne Rs. ${safeNum(agreedFare).toFixed(0)} par offer accept kar liya!`
          : `${riderUser.name || "Your rider"} ${t("notifRiderComingBody", rideAssignLang)}`,
        type: "ride",
        icon: updated.type === "bike" ? "bicycle-outline" : "car-outline",
      })
      .catch((err: Error) => {
        logger.error("[rider] background op failed:", err.message);
      });

    /* Generate trip OTP and emit to customer */
    const tripOtp = String(randomInt(1000, 10000));
    await db
      .update(ridesTable)
      .set({ tripOtp, updatedAt: new Date() })
      .where(eq(ridesTable.id, updated.id))
      .catch((e: Error) => {
        logger.error({ rideId: updated.id, err: e.message }, "[rider] tripOtp DB update failed");
      });
    emitRideOtp(updated.userId, updated.id, tripOtp, updated.riderId);

    emitRideDispatchUpdate({ rideId: updated.id, action: "accepted", status: "accepted" });
    emitRideUpdate(updated.id);
    const { tripOtp: _omitOtp, ...rideWithoutOtp } = updated;
    const rideAcceptBody = {
      ...rideWithoutOtp,
      fare: safeNum(updated.fare),
      distance: safeNum(updated.distance),
    };
    storeIdempotency(req, 200, { success: true, data: rideAcceptBody });
    sendSuccess(res, rideAcceptBody);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/rides/:id/verify-otp — Verify customer OTP before starting trip ── */
router.post("/rides/:id/verify-otp", otpLimiter, async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const riderId = req.riderId!;
    const rideId = req.params["id"] as string;
    const parsed = otpVerifySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "OTP is required");
      return;
    }
    const { otp } = parsed.data;

    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.riderId, riderId)))
      .limit(1);

    if (!ride) {
      sendNotFound(res, "Ride not found or not yours");
      return;
    }
    if (!["arrived", "accepted"].includes(ride.status)) {
      sendValidationError(
        res,
        "OTP can only be verified once you have accepted and are en route to the pickup location."
      );
      return;
    }
    if (ride.otpVerified) {
      /* Already verified — reject further attempts; the trip is already gated */
      sendForbidden(
        res,
        "otp_already_verified",
        "This trip's OTP has already been verified. Start the trip from the rider app."
      );
      return;
    }
    if (!ride.tripOtp) {
      sendValidationError(
        res,
        "No OTP found for this ride. The customer needs to request a new one."
      );
      return;
    }
    if (ride.tripOtp.trim() !== otp.trim()) {
      /* Track failed attempt with a single atomic SQL statement.
       The CASE expression handles expiry entirely in the DB:
       - If the row is new or expired → count resets to 1, window starts fresh
       - If the row is active → count is incremented by 1
       RETURNING count gives us the authoritative value without a separate read. */
      const expiresAt = new Date(Date.now() + OTP_ATTEMPT_TTL_MS);
      const result = await db.execute<{ count: number }>(sql`
      INSERT INTO otp_attempts (key, count, first_at, expires_at)
      VALUES (${rideId}, 1, now(), ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET
        count      = CASE WHEN otp_attempts.expires_at < now() THEN 1 ELSE otp_attempts.count + 1 END,
        first_at   = CASE WHEN otp_attempts.expires_at < now() THEN now() ELSE otp_attempts.first_at END,
        expires_at = CASE WHEN otp_attempts.expires_at < now() THEN ${expiresAt} ELSE otp_attempts.expires_at END
      RETURNING count
    `);
      const newCount = (result.rows[0] as { count: number } | undefined)?.count ?? 1;

      if (newCount >= MAX_OTP_ATTEMPTS) {
        /* Invalidate the current OTP so the customer must request a fresh one */
        await db
          .update(ridesTable)
          .set({ tripOtp: null, updatedAt: new Date() })
          .where(eq(ridesTable.id, rideId))
          .catch((e: Error) => {
            logger.error(
              { rideId, err: e.message },
              "[rider] tripOtp invalidation DB update failed"
            );
          });
        db.delete(otpAttemptsTable)
          .where(eq(otpAttemptsTable.key, rideId))
          .catch((err: unknown) => {
            logger.debug(
              { err: err instanceof Error ? err.message : String(err), rideId },
              "[rider] OTP attempts cleanup (max-exceeded) failed — non-critical"
            );
          });
        sendErrorWithData(
          res,
          "Too many incorrect OTP attempts. The current OTP has been invalidated. Please ask the customer to refresh their app to receive a new OTP.",
          { code: "OTP_INVALIDATED" },
          403
        );
        return;
      }

      const remaining = MAX_OTP_ATTEMPTS - newCount;
      sendErrorWithData(
        res,
        `Incorrect OTP. Please check with your customer. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        { code: "OTP_MISMATCH", attemptsRemaining: remaining },
        403
      );
      return;
    }

    /* Success — clear attempt row and mark verified */
    db.delete(otpAttemptsTable)
      .where(eq(otpAttemptsTable.key, rideId))
      .catch((err: unknown) => {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err), rideId },
          "[rider] OTP attempts cleanup (success) failed — non-critical"
        );
      });
    await db
      .update(ridesTable)
      .set({ otpVerified: true, updatedAt: new Date() })
      .where(eq(ridesTable.id, rideId));
    emitRideDispatchUpdate({ rideId, action: "otp-verified", status: ride.status });
    emitRideUpdate(rideId);
    storeIdempotency(req, 200, {
      success: true,
      message: "OTP verified. You may now start the trip.",
    });
    sendSuccess(res, undefined, "OTP verified. You may now start the trip.");
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/rides/cancel — Cancel an active ride ──
   Dedicated cancel endpoint with per-rider rate limiting (10/min).
   Accepts { rideId, reason? } in the request body.                           */
const rideCancelBodySchema = z.object({
  rideId: z.string().min(1),
  reason: z.string().max(500).optional(),
});
router.post("/rides/cancel", csrfDoubleSubmit, rideCancelLimiter, async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const parsed = rideCancelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid request body");
      return;
    }
    const riderId = req.riderId!;
    const { rideId, reason } = parsed.data;
    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.riderId, riderId)))
      .limit(1);
    if (!ride) {
      sendNotFound(res, "Ride not found or not yours");
      return;
    }
    const allowed = RIDE_STATUS_TRANSITIONS[ride.status];
    if (!allowed?.includes("cancelled")) {
      sendValidationError(res, `Cannot cancel a ride in "${ride.status}" status.`);
      return;
    }
    await db
      .update(ridesTable)
      .set({ status: "cancelled", cancellationReason: reason ?? "Rider cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.riderId, riderId)));
    emitRideUpdate(rideId);
    const body = { success: true, message: "Ride cancelled" };
    storeIdempotency(req, 200, body);
    sendSuccess(res, body);
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "[route] POST /rides/cancel error");
    sendError(res, "Internal server error", 500);
  }
});

/* ── PATCH /rider/rides/:id/status — Update ride status (completed/cancelled) ── */
router.patch("/rides/:id/status", csrfDoubleSubmit, rideStatusLimiter, conditionalCancelLimiter, async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const parsed = rideStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid status");
      return;
    }
    const riderId = req.riderId!;
    const { status, lat: _lat, lng: _lng } = parsed.data;

    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(and(eq(ridesTable.id, req.params["id"] as string), eq(ridesTable.riderId, riderId)))
      .limit(1);
    if (!ride) {
      sendNotFound(res, "Ride not found or not yours");
      return;
    }

    /* ── State Machine: enforce valid transitions ── */
    const allowed = RIDE_STATUS_TRANSITIONS[ride.status];
    if (!allowed || !allowed.includes(status)) {
      sendValidationError(
        res,
        `Cannot transition from "${ride.status}" to "${status}". Allowed: ${(allowed || []).join(", ") || "none"}`
      );
      return;
    }

    /* ── Proximity check: "arrived" requires rider to be near pickup ── */
    if (status === "arrived" && ride.pickupLat && ride.pickupLng) {
      const s = await getCachedSettings();
      const proximityM = parseFloat(s["dispatch_ride_start_proximity_m"] ?? "500");

      /* Use ONLY server-stored live location (trusted) for proximity verification.
       Client-supplied lat/lng is NOT used — it can be spoofed.
       Reject stale locations older than 2 minutes to prevent false proximity matches. */
      const PROXIMITY_STALE_MS = 2 * 60 * 1000;
      let riderLat: number | undefined;
      let riderLng: number | undefined;
      const [storedLoc] = await db
        .select()
        .from(liveLocationsTable)
        .where(eq(liveLocationsTable.userId, riderId))
        .limit(1);
      if (
        storedLoc &&
        storedLoc.updatedAt &&
        Date.now() - new Date(storedLoc.updatedAt).getTime() < PROXIMITY_STALE_MS
      ) {
        riderLat = parseFloat(storedLoc.latitude);
        riderLng = parseFloat(storedLoc.longitude);
      }

      if (riderLat == null || riderLng == null) {
        sendValidationError(
          res,
          "Unable to verify your location. Please enable GPS and try again."
        );
        return;
      }

      const distKm = calcDistance(
        riderLat,
        riderLng,
        parseFloat(ride.pickupLat),
        parseFloat(ride.pickupLng)
      );
      if (distKm * 1000 > proximityM) {
        sendValidationError(
          res,
          `You must be within ${proximityM}m of the pickup location to mark arrived. Current distance: ${(distKm * 1000).toFixed(0)}m`
        );
        return;
      }
    }

    /* ── OTP gate: in_transit requires OTP verification ── */
    if (status === "in_transit" && !ride.otpVerified) {
      sendErrorWithData(
        res,
        "Customer OTP not verified. Ask the customer for the 4-digit code, then tap 'Verify OTP'.",
        { code: "OTP_REQUIRED" },
        400
      );
      return;
    }

    let updated: typeof ride;

    if (status === "completed") {
      const s = await getCachedSettings();
      const riderKeepPct = (Number(s["rider_keep_pct"]) || 80) / 100;
      const platformFeePct = 1 - riderKeepPct;
      const bonusPerTrip = parseFloat(s["rider_bonus_per_trip"] ?? "0");
      const fareAmt = safeNum(ride.fare);
      const isCashRide = ride.paymentMethod === "cash";

      if (isCashRide) {
        const platformFeeCents = Math.round(fareAmt * 100 * platformFeePct);
        const riderShareCents = Math.round(fareAmt * 100) - platformFeeCents;
        const platformFee = platformFeeCents / 100;
        const riderShare = riderShareCents / 100;
        let newRiderBalance = 0;
        updated = await db.transaction(async (tx) => {
          const [statusRow] = await tx
            .update(ridesTable)
            .set({ status, completedAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(ridesTable.id, req.params["id"] as string),
                eq(ridesTable.riderId, riderId),
                eq(ridesTable.status, ride.status)
              )
            )
            .returning();
          if (!statusRow) throw new Error("Ride not found or status already changed");
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: riderId,
            type: "cash_collection",
            amount: fareAmt.toFixed(2),
            description: `Cash collected — Ride #${ride.id.slice(-6).toUpperCase()} (Rs. ${fareAmt.toFixed(0)} total)`,
            reference: `ride:${ride.id}`,
            paymentMethod: "cash",
          });
          const [riderAfter] = await tx
            .update(usersTable)
            .set({
              walletBalance: sql`GREATEST(0, wallet_balance - ${platformFee})`,
              updatedAt: new Date(),
            })
            .where(eq(usersTable.id, riderId))
            .returning({ walletBalance: usersTable.walletBalance });
          newRiderBalance = safeNum(riderAfter?.walletBalance);
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: riderId,
            type: "platform_fee",
            amount: platformFee.toFixed(2),
            description: `Platform fee (${Math.round(platformFeePct * 100)}%) — Cash Ride #${ride.id.slice(-6).toUpperCase()} · Rider keeps Rs. ${riderShare}`,
            reference: `ride:${ride.id}`,
          });
          if (bonusPerTrip > 0) {
            await tx
              .update(usersTable)
              .set({ walletBalance: sql`wallet_balance + ${bonusPerTrip}`, updatedAt: new Date() })
              .where(eq(usersTable.id, riderId));
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId: riderId,
              type: "bonus",
              amount: bonusPerTrip.toFixed(2),
              description: `Per-trip bonus — Ride #${ride.id.slice(-6).toUpperCase()}`,
            });
            newRiderBalance += bonusPerTrip;
          }
          /* M-01: Auto-offline set inside the transaction so that if any wallet
             write is rolled back, the rider is not silently taken offline with
             their balance unchanged. Push notification stays outside. */
          if (newRiderBalance <= 0) {
            await tx
              .update(usersTable)
              .set({ isOnline: false, updatedAt: new Date() })
              .where(eq(usersTable.id, riderId));
          }
          return statusRow;
        });
        const rideCashLang = await getUserLanguage(riderId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: riderId,
            title: t("rideCompleted", rideCashLang),
            body: t("notifCashFeeDeductedBody", rideCashLang)
              .replace("{fee}", String(platformFee))
              .replace("{cash}", fareAmt.toFixed(0)),
            type: "wallet",
            icon: "wallet-outline",
          })
          .catch((e: Error) => logger.error("[rider] notif insert failed:", e.message));
        /* Push notification only — DB update is now inside the transaction above. */
        if (newRiderBalance <= 0) {
          sendPushToUser(riderId, {
            title: "Wallet Empty — You are now Offline",
            body: "Your wallet balance is 0. Top up to go online and accept rides.",
            tag: "wallet-empty",
          }).catch((e: Error) =>
            logger.warn(
              { riderId, err: e.message },
              "[rider/complete] wallet-empty push notification failed"
            )
          );
        }
      } else {
        const earnings = Math.round(fareAmt * 100 * riderKeepPct) / 100;
        const totalCredit = Math.round((earnings + bonusPerTrip) * 100) / 100;
        updated = await db.transaction(async (tx) => {
          const [statusRow] = await tx
            .update(ridesTable)
            .set({ status, completedAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(ridesTable.id, req.params["id"] as string),
                eq(ridesTable.riderId, riderId),
                eq(ridesTable.status, ride.status)
              )
            )
            .returning();
          if (!statusRow) throw new Error("Ride not found or status already changed");
          await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${totalCredit}`, updatedAt: new Date() })
            .where(eq(usersTable.id, riderId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: riderId,
            type: "credit",
            amount: earnings.toFixed(2),
            description: `Ride earnings — #${ride.id.slice(-6).toUpperCase()} (${Math.round(riderKeepPct * 100)}%)`,
          });
          if (bonusPerTrip > 0) {
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId: riderId,
              type: "bonus",
              amount: bonusPerTrip.toFixed(2),
              description: `Per-trip bonus — Ride #${ride.id.slice(-6).toUpperCase()}`,
            });
          }
          return statusRow;
        });
        const rideEarnLang = await getUserLanguage(riderId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: riderId,
            title: t("notifWalletCredited", rideEarnLang),
            body: t("notifWalletCreditedBody", rideEarnLang).replace(
              "{amount}",
              earnings.toFixed(0)
            ),
            type: "wallet",
            icon: "wallet-outline",
          })
          .catch((e: unknown) =>
            logger.warn(
              {
                message: "[rider] ride-earn wallet notif insert failed",
                error: e instanceof Error ? e.message : String(e),
                code: "RIDER_NOTIF_RIDE_EARN_FAILED",
                correlationId: null,
                timestamp: new Date().toISOString(),
                userId: riderId,
              },
              "[rider] ride-earn wallet notif insert failed"
            )
          );
      }

      const custRideCompleteLang = await getUserLanguage(ride.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: ride.userId,
          title: t("rideCompleted", custRideCompleteLang) + " ✅",
          body: t("notifRideCompletedBody", custRideCompleteLang),
          type: "ride",
          icon: "checkmark-circle-outline",
        })
        .catch((e) => logger.error("customer notif insert failed:", e));
      /* Web Push: trip completed */
      sendPushToUser(ride.userId, {
        title: "Trip Completed ✅",
        body: `Your ride has been completed. Fare: Rs. ${safeNum(ride.fare).toFixed(0)}`,
        tag: "ride-completed",
        data: { rideId: ride.id },
      }).catch((e: Error) => {
        logger.warn(
          {
            message: "[rider] trip-completed push to customer failed",
            error: e.message,
            code: "RIDER_PUSH_TRIP_CUST_FAILED",
            correlationId: null,
            timestamp: new Date().toISOString(),
            rideId: ride.id,
            userId: ride.userId,
          },
          "[rider] trip-completed push to customer failed"
        );
      });
      sendPushToUser(riderId, {
        title: "Trip Completed 🎉",
        body: `You've completed a trip. Check your wallet for earnings.`,
        tag: "ride-completed-rider",
        data: { rideId: ride.id },
      }).catch((e: Error) => {
        logger.warn(
          {
            message: "[rider] trip-completed push to rider failed",
            error: e.message,
            code: "RIDER_PUSH_TRIP_RIDER_FAILED",
            correlationId: null,
            timestamp: new Date().toISOString(),
            rideId: ride.id,
            riderId,
          },
          "[rider] trip-completed push to rider failed"
        );
      });
      fireAndForget(
        emitWebhookEvent("ride_completed", {
          rideId: ride.id,
          riderId,
          userId: ride.userId,
          fare: safeNum(ride.fare).toFixed(2),
        }),
        "rider:webhook:ride_completed",
        logger,
        { rideId: ride.id, code: "WEBHOOK_EMIT" }
      );
    } else {
      const now = new Date();
      const timestampFields =
        status === "arrived"
          ? { arrivedAt: now }
          : status === "in_transit"
            ? { startedAt: now }
            : status === "cancelled"
              ? { cancelledAt: now }
              : {};
      const [row] = await db
        .update(ridesTable)
        .set({ status, updatedAt: now, ...timestampFields })
        .where(
          and(
            eq(ridesTable.id, req.params["id"] as string),
            eq(ridesTable.riderId, riderId),
            eq(ridesTable.status, ride.status)
          )
        )
        .returning();
      if (!row) {
        sendNotFound(res, "Ride not found, not yours, or status already changed");
        return;
      }
      updated = row;
      /* Web Push + OTP re-emit: rider arrived at pickup */
      if (status === "arrived") {
        sendPushToUser(ride.userId, {
          title: "Rider Has Arrived 📍",
          body: "Your rider is at the pickup location. Share your OTP to start the trip.",
          tag: "rider-arrived",
          data: { rideId: ride.id },
        }).catch((e: Error) => {
          logger.warn(
            { rideId: ride.id, userId: ride.userId, err: e.message },
            "[rider] rider-arrived push to customer failed"
          );
        });
        /* Re-emit the OTP on arrived so that any customer who missed the
         original socket event (e.g. brief disconnect) gets the OTP now. */
        if (ride.tripOtp) {
          emitRideOtp(ride.userId, ride.id, ride.tripOtp, ride.riderId);
        }
      }
    }

    emitRideDispatchUpdate({ rideId: updated.id, action: "status-change", status });
    emitRideUpdate(updated.id);
    const rideStatusBody = {
      ...updated,
      fare: safeNum(updated.fare),
      distance: safeNum(updated.distance),
    };
    storeIdempotency(req, 200, { success: true, data: rideStatusBody });
    sendSuccess(res, rideStatusBody);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/rides/:id/counter — Rider submits a bid on a bargaining ride (InDrive multi-bid) ── */
router.post("/rides/:id/counter", rideBidLimiter, async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const parsed = counterSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "counterFare required");
      return;
    }
    const riderId = req.riderId!;
    const riderUser = req.riderUser!;
    const rideId = req.params["id"] as string;
    const { counterFare, note } = parsed.data;

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) {
      sendNotFound(res, "Ride not found");
      return;
    }
    if (ride.status !== "bargaining") {
      sendValidationError(res, "This ride is not in bargaining state");
      return;
    }

    const parsedCounter = safeNum(counterFare);
    const platformFare = safeNum(ride.fare);
    const offeredAmt = safeNum(ride.offeredFare ?? 0);

    const rideSettings = await getCachedSettings();
    const maxFare = parseFloat(rideSettings["ride_max_fare"] ?? String(DEFAULT_MAX_COUNTER_FARE));
    if (parsedCounter > maxFare) {
      sendValidationError(res, `Counter offer cannot exceed Rs. ${maxFare.toFixed(0)}`);
      return;
    }
    const maxMultiplier = parseFloat(rideSettings["ride_counter_offer_max_multiplier"] ?? "3");
    const maxAllowedByMultiplier = platformFare > 0 ? platformFare * maxMultiplier : maxFare;
    if (parsedCounter > maxAllowedByMultiplier) {
      sendValidationError(
        res,
        `Counter offer cannot exceed ${maxMultiplier}× the platform fare (Rs. ${maxAllowedByMultiplier.toFixed(0)})`
      );
      return;
    }
    if (parsedCounter <= offeredAmt) {
      sendValidationError(
        res,
        `Counter offer must be higher than customer's offer (Rs. ${offeredAmt.toFixed(0)})`
      );
      return;
    }

    /* Enforce service min_fare — check platform_settings first, fall back to rideServiceTypesTable
     so the constraint works even when per-type settings haven't been configured in the admin panel */
    const minFareKey = `ride_${ride.type}_min_fare`;
    const psMinFare = rideSettings[minFareKey];
    let serviceMinFare = psMinFare !== undefined ? parseFloat(psMinFare) : 0;
    if (!(serviceMinFare > 0)) {
      const [svc] = await db
        .select({ minFare: rideServiceTypesTable.minFare })
        .from(rideServiceTypesTable)
        .where(eq(rideServiceTypesTable.key, ride.type))
        .limit(1);
      serviceMinFare = svc ? parseFloat(svc.minFare ?? "0") : 0;
    }
    if (serviceMinFare > 0 && parsedCounter < serviceMinFare) {
      sendValidationError(
        res,
        `Counter offer cannot be lower than the minimum fare of Rs. ${serviceMinFare.toFixed(0)} for this service`
      );
      return;
    }

    /*
     * Strict one-bid-per-rider-per-ride: DB UNIQUE INDEX on (ride_id, rider_id).
     * UPSERT: update fare+note on existing bid; insert on first bid.
     * FOR-UPDATE on the ride row serialises concurrent submissions.
     */

    let bid: InferSelectModel<typeof rideBidsTable> | undefined;
    let isFirstBid = false;
    try {
      const result = await db.transaction(async (tx) => {
        const [lockedRide] = await tx
          .select({ id: ridesTable.id, status: ridesTable.status })
          .from(ridesTable)
          .where(eq(ridesTable.id, rideId))
          .for("update");

        /*
         * Allow bids in both 'searching' (initial offer, no bids yet) and
         * 'bargaining' (counter after customer's rejection). Restricting to
         * 'bargaining' only would block the very first bid a rider submits.
         */
        if (!lockedRide || !["searching", "bargaining"].includes(lockedRide.status)) {
          throw Object.assign(new Error("Ride is no longer accepting bids"), { statusCode: 409 });
        }

        /* Check for any existing bid row (any status) for this rider on this ride. */
        const [existingBid] = await tx
          .select({ id: rideBidsTable.id })
          .from(rideBidsTable)
          .where(and(eq(rideBidsTable.rideId, rideId), eq(rideBidsTable.riderId, riderId)))
          .limit(1);

        if (existingBid) {
          /* UPSERT branch: update fare, note and reset to pending.
           expiresAt is refreshed to 30 minutes from now so the re-submitted
           bid is not immediately hidden by the expiry filter in bid queries. */
          const refreshedExpiresAt = new Date(Date.now() + 30 * 60_000);
          const [updated] = await tx
            .update(rideBidsTable)
            .set({
              fare: parsedCounter.toFixed(2),
              note: note ?? null,
              status: "pending",
              expiresAt: refreshedExpiresAt,
              updatedAt: new Date(),
            })
            .where(and(eq(rideBidsTable.id, existingBid.id), eq(rideBidsTable.riderId, riderId)))
            .returning();
          isFirstBid = false;
          return updated;
        } else {
          /* INSERT branch: first-time bid from this rider on this ride.
           expiresAt is set to 30 minutes from now so ghost bids from
           offline riders are automatically excluded from negotiation screens. */
          const bidExpiresAt = new Date(Date.now() + 30 * 60_000);
          const [inserted] = await tx
            .insert(rideBidsTable)
            .values({
              id: generateId(),
              rideId,
              riderId,
              riderName: riderUser.name || "Rider",
              riderPhone: riderUser.phone ?? null,
              fare: parsedCounter.toFixed(2),
              note: note ?? null,
              status: "pending",
              expiresAt: bidExpiresAt,
            })
            .returning();
          isFirstBid = true;
          return inserted;
        }
      });
      bid = result;
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      const status = err.statusCode ?? 400;
      sendError(res, err.message ?? "Bid failed", status);
      return;
    }

    if (isFirstBid) {
      const bidLang = await getUserLanguage(ride.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: ride.userId,
          title: t("notifNewBid", bidLang) + " 💬",
          body: t("notifNewBidBody", bidLang)
            .replace("{name}", riderUser.name || "A rider")
            .replace("{amount}", parsedCounter.toFixed(0)),
          type: "ride",
          icon: "chatbubble-outline",
          link: "/ride",
        })
        .catch((err: Error) => {
          logger.error("[rider] background op failed:", err.message);
        });
    }

    emitRideDispatchUpdate({ rideId, action: "bid", status: "bargaining" });
    emitRideUpdate(rideId);
    const counterBody = { bid: { ...bid, fare: safeNum(bid!.fare) } };
    storeIdempotency(req, 200, { success: true, data: counterBody });
    sendSuccess(res, counterBody);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/rides/:id/reject-offer — Rider dismisses a bargaining ride (local dismiss, no DB lock) ── */
router.post("/rides/:id/reject-offer", async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    /* InDrive model: riders don't lock the ride anymore, so "rejection" is purely a local dismiss.
     If this rider had submitted a pending bid, we cancel it. */
    const riderId = req.riderId!;
    const rideId = req.params["id"] as string;

    /* Cancel any pending bid this rider submitted */
    await db
      .update(rideBidsTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(
        and(
          eq(rideBidsTable.rideId, rideId),
          eq(rideBidsTable.riderId, riderId),
          eq(rideBidsTable.status, "pending")
        )
      );

    storeIdempotency(req, 200, { success: true, message: "Ride dismissed" });
    sendSuccess(res, undefined, "Ride dismissed");
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/rides/:id/event-log — GPS-tagged audit event ──
   Records a rider-emitted lifecycle event (e.g. "arrived_at_pickup",
   "customer_not_found") against the ride for admin audit.
   Body: { event: string, lat?: number, lng?: number }
   Guards: ride must belong to this rider. */
const rideEventLogSchema = z.object({
  event: z.string().min(1).max(100),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});

router.post("/rides/:id/event-log", async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const riderId = req.riderId!;
    const rideId = req.params["id"] as string;

    const parsed = rideEventLogSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid event data");
      return;
    }
    const { event, lat, lng } = parsed.data;

    const [ride] = await db
      .select({ id: ridesTable.id, status: ridesTable.status, riderId: ridesTable.riderId })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .limit(1);

    if (!ride) {
      sendNotFound(res, "Ride not found");
      return;
    }
    if (ride.riderId !== riderId) {
      sendForbidden(res, "You are not assigned to this ride");
      return;
    }

    const logId = generateId();
    await db.insert(rideEventLogsTable).values({
      id: logId,
      rideId,
      riderId,
      event,
      lat: lat != null ? String(lat) : null,
      lng: lng != null ? String(lng) : null,
    });

    storeIdempotency(req, 200, { success: true, data: { id: logId, rideId, event } });
    sendSuccess(res, { id: logId, rideId, event }, "Event logged");
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/history — Delivery history ── */
router.get("/history", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const s = await getCachedSettings();
    const riderKeepPct = (Number(s["rider_keep_pct"]) || 80) / 100;

    const rawLimit = parseInt(String(req.query["limit"] || "50"), 10);
    const rawOffset = parseInt(String(req.query["offset"] || "0"), 10);
    const limitParam = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 200);
    const offsetParam = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;
    /* Each table is queried with its own OFFSET/LIMIT so only the rows needed for
     the current page are transferred — no full-table scans for large offsets. */
    const [orders, rides] = await Promise.all([
      db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.riderId, riderId), eq(ordersTable.status, "delivered")))
        .orderBy(desc(ordersTable.updatedAt))
        .limit(limitParam + 1)
        .offset(offsetParam),
      db
        .select()
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.riderId, riderId),
            or(eq(ridesTable.status, "completed"), eq(ridesTable.status, "cancelled"))
          )
        )
        .orderBy(desc(ridesTable.updatedAt))
        .limit(limitParam + 1)
        .offset(offsetParam),
    ]);

    const sorted = [
      ...orders.map((o) => ({
        kind: "order" as const,
        id: o.id,
        status: o.status,
        amount: safeNum(o.total),
        earnings: Math.round(safeNum(o.total) * 100 * riderKeepPct) / 100,
        address: o.deliveryAddress,
        type: o.type,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
      /* Cancelled rides have no earnings — the rider was never paid. Returning a
       non-zero earnings value for cancelled rides caused totalEarnings on the
       frontend to be inflated by fare×keepPct for every cancelled ride. */
      ...rides.map((r) => ({
        kind: "ride" as const,
        id: r.id,
        status: r.status,
        amount: safeNum(r.fare),
        earnings:
          r.status === "cancelled" ? 0 : Math.round(safeNum(r.fare) * 100 * riderKeepPct) / 100,
        address: r.dropAddress,
        type: r.type,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        origin: r.pickupAddress,
        destination: r.dropAddress,
        fare: safeNum(r.fare),
        distance: r.distance,
      })),
    ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const hasMore = sorted.length > limitParam;
    const combined = sorted.slice(0, limitParam);

    sendSuccess(res, { history: combined, hasMore, limit: limitParam, offset: offsetParam });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/reviews — Reviews received by this rider (excludes hidden/deleted) ── */
router.get("/reviews", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const pageLimit = 50;

    /* For unified reviews table: COALESCE(riderRating, rating) gives the rider-specific score.
     - Dual-rated delivery: `riderRating` = rider score, `rating` = vendor score.
     - Ride-only: `rating` IS the rider score, `riderRating` is null. */
    const riderScore = sql<number>`COALESCE(${reviewsTable.riderRating}, ${reviewsTable.rating})`;
    const visibleReviewConditions = and(
      eq(reviewsTable.riderId, riderId),
      eq(reviewsTable.hidden, false),
      isNull(reviewsTable.deletedAt)
    );
    const visibleRatingConditions = and(
      eq(rideRatingsTable.riderId, riderId),
      eq(rideRatingsTable.hidden, false),
      isNull(rideRatingsTable.deletedAt)
    );

    /* ── Aggregates from reviewsTable (DB-level, no limit) ── */
    const [reviewStats, reviewBreakdown] = await Promise.all([
      db
        .select({ total: count(), avgRating: avg(riderScore) })
        .from(reviewsTable)
        .where(visibleReviewConditions),
      db
        .select({ star: sql<number>`ROUND(${riderScore})`, cnt: count() })
        .from(reviewsTable)
        .where(visibleReviewConditions)
        .groupBy(sql`ROUND(${riderScore})`),
    ]);

    /* ── Aggregates from rideRatingsTable (DB-level, exclude rides already in reviewsTable) ── */
    /* Use a correlated NOT EXISTS subquery so the database uses its indexes directly —
     no extra round-trip and no dynamic NOT IN list that degrades the query plan. */
    const legacyConditions = and(
      visibleRatingConditions,
      sql`NOT EXISTS (
      SELECT 1 FROM reviews
      WHERE reviews.order_id = ride_ratings.ride_id
        AND reviews.rider_id = ${riderId}
        AND reviews.order_type = 'ride'
        AND reviews.hidden = false
        AND reviews.deleted_at IS NULL
    )`
    );

    const [legacyStats, legacyBreakdown] = await Promise.all([
      db
        .select({ total: count(), avgSum: sql<number>`SUM(${rideRatingsTable.stars})` })
        .from(rideRatingsTable)
        .where(legacyConditions),
      db
        .select({ star: sql<number>`ROUND(${rideRatingsTable.stars})`, cnt: count() })
        .from(rideRatingsTable)
        .where(legacyConditions)
        .groupBy(sql`ROUND(${rideRatingsTable.stars})`),
    ]);

    /* ── Compute unified aggregates ── */
    const reviewTotal = reviewStats[0]?.total ?? 0;
    const legacyTotal = legacyStats[0]?.total ?? 0;
    const total = reviewTotal + legacyTotal;

    /* Weighted avg: (reviewAvg * reviewTotal + legacySum) / total */
    const reviewAvgRaw = reviewStats[0]?.avgRating ? parseFloat(reviewStats[0].avgRating) : 0;
    const legacySum = legacyStats[0]?.avgSum ? Number(legacyStats[0].avgSum) : 0;
    const avgRating =
      total > 0 ? parseFloat(((reviewAvgRaw * reviewTotal + legacySum) / total).toFixed(1)) : null;

    const starBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of reviewBreakdown) {
      const s = Math.round(Number(row.star));
      if (s >= 1 && s <= 5) starBreakdown[s] = (starBreakdown[s] ?? 0) + row.cnt;
    }
    for (const row of legacyBreakdown) {
      const s = Math.round(Number(row.star));
      if (s >= 1 && s <= 5) starBreakdown[s] = (starBreakdown[s] ?? 0) + row.cnt;
    }

    /* ── Paginated review list (most recent 50) from both sources ── */
    const [reviewRows, ratingRows] = await Promise.all([
      db
        .select({
          id: reviewsTable.id,
          orderId: reviewsTable.orderId,
          rating: riderScore,
          comment: reviewsTable.comment,
          orderType: reviewsTable.orderType,
          createdAt: reviewsTable.createdAt,
          customerName: usersTable.name,
        })
        .from(reviewsTable)
        .leftJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
        .where(visibleReviewConditions)
        .orderBy(desc(reviewsTable.createdAt))
        .limit(pageLimit),

      db
        .select({
          id: rideRatingsTable.id,
          orderId: rideRatingsTable.rideId,
          rating: rideRatingsTable.stars,
          comment: rideRatingsTable.comment,
          orderType: sql<string>`'ride'`,
          createdAt: rideRatingsTable.createdAt,
          customerName: usersTable.name,
        })
        .from(rideRatingsTable)
        .leftJoin(usersTable, eq(rideRatingsTable.userId, usersTable.id))
        .where(legacyConditions)
        .orderBy(desc(rideRatingsTable.createdAt))
        .limit(pageLimit),
    ]);

    const reviews = [...reviewRows, ...ratingRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, pageLimit);

    sendSuccess(res, { reviews, avgRating, total, starBreakdown });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/earnings — Earnings summary ── */
router.get("/earnings", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const s = await getCachedSettings();
    const riderKeepPct = (Number(s["rider_keep_pct"]) || 80) / 100;

    /* Bonus transactions are credited per completed trip and must be included in the
     earnings summary — otherwise the displayed total is always lower than actual
     when rider_bonus_per_trip > 0. */
    const [
      todayOrders,
      weekOrders,
      monthOrders,
      todayRides,
      weekRides,
      monthRides,
      todayBonus,
      weekBonus,
      monthBonus,
      profileRow,
      todayFoodOrders,
      weekFoodOrders,
      monthFoodOrders,
    ] = await Promise.all([
      db
        .select({ s: sum(ordersTable.total), c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            gte(ordersTable.updatedAt, today)
          )
        ),
      db
        .select({ s: sum(ordersTable.total), c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            gte(ordersTable.updatedAt, weekAgo)
          )
        ),
      db
        .select({ s: sum(ordersTable.total), c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            gte(ordersTable.updatedAt, monthAgo)
          )
        ),
      db
        .select({ s: sum(ridesTable.fare), c: count() })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.riderId, riderId),
            eq(ridesTable.status, "completed"),
            gte(ridesTable.updatedAt, today)
          )
        ),
      db
        .select({ s: sum(ridesTable.fare), c: count() })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.riderId, riderId),
            eq(ridesTable.status, "completed"),
            gte(ridesTable.updatedAt, weekAgo)
          )
        ),
      db
        .select({ s: sum(ridesTable.fare), c: count() })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.riderId, riderId),
            eq(ridesTable.status, "completed"),
            gte(ridesTable.updatedAt, monthAgo)
          )
        ),
      /* Per-trip bonuses credited to wallet on ride/delivery completion */
      db
        .select({ s: sum(walletTransactionsTable.amount) })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "bonus"),
            gte(walletTransactionsTable.createdAt, today)
          )
        ),
      db
        .select({ s: sum(walletTransactionsTable.amount) })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "bonus"),
            gte(walletTransactionsTable.createdAt, weekAgo)
          )
        ),
      db
        .select({ s: sum(walletTransactionsTable.amount) })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "bonus"),
            gte(walletTransactionsTable.createdAt, monthAgo)
          )
        ),
      db
        .select({ dailyGoal: riderProfilesTable.dailyGoal })
        .from(riderProfilesTable)
        .where(eq(riderProfilesTable.userId, riderId))
        .limit(1),
      /* Food order breakdown */
      db
        .select({ s: sum(ordersTable.total), c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            eq(ordersTable.type, "food"),
            gte(ordersTable.updatedAt, today)
          )
        ),
      db
        .select({ s: sum(ordersTable.total), c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            eq(ordersTable.type, "food"),
            gte(ordersTable.updatedAt, weekAgo)
          )
        ),
      db
        .select({ s: sum(ordersTable.total), c: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            eq(ordersTable.type, "food"),
            gte(ordersTable.updatedAt, monthAgo)
          )
        ),
    ]);

    const todayTotal =
      (safeNum(todayOrders[0]?.s) + safeNum(todayRides[0]?.s)) * riderKeepPct +
      safeNum(todayBonus[0]?.s);
    const weekTotal =
      (safeNum(weekOrders[0]?.s) + safeNum(weekRides[0]?.s)) * riderKeepPct +
      safeNum(weekBonus[0]?.s);
    const monthTotal =
      (safeNum(monthOrders[0]?.s) + safeNum(monthRides[0]?.s)) * riderKeepPct +
      safeNum(monthBonus[0]?.s);

    const personalDailyGoal = profileRow[0]?.dailyGoal
      ? parseFloat(String(profileRow[0].dailyGoal))
      : null;

    function mkBreakdown(
      allOrders: typeof todayOrders,
      foodOrders: typeof todayFoodOrders,
      rides: typeof todayRides
    ) {
      const foodEarnings = parseFloat((safeNum(foodOrders[0]?.s) * riderKeepPct).toFixed(2));
      const foodCount = Number(foodOrders[0]?.c ?? 0);
      const parcelEarnings = parseFloat(
        (Math.max(0, safeNum(allOrders[0]?.s) - safeNum(foodOrders[0]?.s)) * riderKeepPct).toFixed(
          2
        )
      );
      const parcelCount = Math.max(0, Number(allOrders[0]?.c ?? 0) - foodCount);
      const ridesEarnings = parseFloat((safeNum(rides[0]?.s) * riderKeepPct).toFixed(2));
      const ridesCount = Number(rides[0]?.c ?? 0);
      return {
        food: { earnings: foodEarnings, count: foodCount },
        parcel: { earnings: parcelEarnings, count: parcelCount },
        rides: { earnings: ridesEarnings, count: ridesCount },
      };
    }

    /* ── Net breakdown summary (audit requirement: gross/platformFees/cancellationFees/bonus/net) ── */
    const monthGrossRides = safeNum(monthRides[0]?.s);
    const monthGrossOrders = safeNum(monthOrders[0]?.s);
    const monthGross = parseFloat((monthGrossRides + monthGrossOrders).toFixed(2));
    /* platform_fee is stored per ride at booking time (default 0 until set by admin) */
    const [monthPlatformFeesRow] = await db
      .select({ s: sum(ridesTable.platformFee) })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.riderId, riderId),
          eq(ridesTable.status, "completed"),
          gte(ridesTable.updatedAt, monthAgo)
        )
      );
    /* Cancellation fees are recorded as wallet debit transactions with reference 'cancel_penalty:*' */
    const [monthCancelFeesRow] = await db
      .select({ s: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, riderId),
          eq(walletTransactionsTable.type, "debit"),
          sql`${walletTransactionsTable.reference} LIKE 'cancel_penalty:%'`,
          gte(walletTransactionsTable.createdAt, monthAgo)
        )
      );
    const monthPlatformFees = parseFloat((safeNum(monthPlatformFeesRow?.s)).toFixed(2));
    const monthCancellationFees = parseFloat((safeNum(monthCancelFeesRow?.s)).toFixed(2));
    const monthBonusAmt = parseFloat((safeNum(monthBonus[0]?.s)).toFixed(2));
    const monthNet = parseFloat(
      (monthGrossRides * riderKeepPct + monthGrossOrders * riderKeepPct + monthBonusAmt - monthCancellationFees).toFixed(2)
    );
    const monthTotalRides = Number(monthRides[0]?.c ?? 0);

    sendSuccess(res, {
      today: {
        earnings: parseFloat(todayTotal.toFixed(2)),
        deliveries: (todayOrders[0]?.c ?? 0) + (todayRides[0]?.c ?? 0),
        breakdown: mkBreakdown(todayOrders, todayFoodOrders, todayRides),
      },
      week: {
        earnings: parseFloat(weekTotal.toFixed(2)),
        deliveries: (weekOrders[0]?.c ?? 0) + (weekRides[0]?.c ?? 0),
        breakdown: mkBreakdown(weekOrders, weekFoodOrders, weekRides),
      },
      month: {
        earnings: parseFloat(monthTotal.toFixed(2)),
        deliveries: (monthOrders[0]?.c ?? 0) + (monthRides[0]?.c ?? 0),
        breakdown: mkBreakdown(monthOrders, monthFoodOrders, monthRides),
      },
      /** Audit-required net breakdown (30-day rolling window) */
      summary: {
        gross: monthGross,
        platformFees: monthPlatformFees,
        cancellationFees: monthCancellationFees,
        bonus: monthBonusAmt,
        net: monthNet,
        totalRides: monthTotalRides,
      },
      dailyGoal: personalDailyGoal,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/wallet/transactions ──
   Cursor-paginated. Default page size 50, hard cap 200. The cursor is an
   opaque base64 of `{ createdAt, id }` from the last item of the previous
   page; pages are sorted by `(createdAt DESC, id DESC)` so the (createdAt,id)
   tuple is a strict, deterministic ordering even when two transactions land
   in the same millisecond.

   Legacy mode: when the request includes `?legacy=1` we return the original
   non-paginated `{ balance, transactions }` shape (capped at 100) so that
   any client still on the old API keeps working through the transition. The
   rider-app frontend uses the paginated path. */
router.get("/wallet/transactions", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const user = req.riderUser!;

    /* Parse `limit` defensively: malformed query strings (e.g. `?limit=abc`)
     produce NaN from parseInt, which would silently propagate as a broken
     LIMIT clause. Normalise to the default and clamp into the allowed range. */
    function parseLimit(raw: unknown, fallback: number, max: number): number {
      const n = parseInt(String(raw ?? ""), 10);
      const safe = Number.isFinite(n) && n > 0 ? n : fallback;
      return Math.min(Math.max(1, safe), max);
    }

    const isLegacy = String(req.query["legacy"] ?? "") === "1";
    if (isLegacy) {
      const legacyLimit = parseLimit(req.query["limit"], 50, 100);
      const txns = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, riderId))
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(legacyLimit);
      sendSuccess(res, {
        balance: safeNum(user.walletBalance),
        transactions: txns.map((t) => ({ ...t, amount: safeNum(t.amount) })),
      });
      return;
    }

    const limit = parseLimit(req.query["limit"], 50, 200);

    /* Decode compound cursor (createdAt + id) using the shared cursor utility.
     Compound keys guarantee deterministic ordering even when two transactions
     land in the same millisecond. Bad/forged cursors are silently treated as
     "no cursor" so a stale link cannot 500 the endpoint. */
    let cursorCreatedAt: Date | null = null;
    let cursorId: string | null = null;
    const cursorDecoded = decodeCursor(String(req.query["cursor"] ?? ""));
    if (cursorDecoded) {
      try {
        const parsed = JSON.parse(cursorDecoded);
        const ts = typeof parsed?.createdAt === "string" ? new Date(parsed.createdAt) : null;
        const cid = typeof parsed?.id === "string" ? parsed.id : null;
        if (ts && !isNaN(ts.getTime()) && cid) {
          cursorCreatedAt = ts;
          cursorId = cid;
        }
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          `[route] ignore malformed cursor`
        );
      }
    }

    /* Fetch limit+1 to determine whether a next page exists without a count(). */
    const baseFilter = eq(walletTransactionsTable.userId, riderId);
    const filter =
      cursorCreatedAt && cursorId
        ? and(
            baseFilter,
            or(
              sql`${walletTransactionsTable.createdAt} < ${cursorCreatedAt}`,
              and(
                sql`${walletTransactionsTable.createdAt} = ${cursorCreatedAt}`,
                sql`${walletTransactionsTable.id} < ${cursorId}`
              )
            )
          )
        : baseFilter;

    const rows = await db
      .select()
      .from(walletTransactionsTable)
      .where(filter)
      .orderBy(desc(walletTransactionsTable.createdAt), desc(walletTransactionsTable.id))
      .limit(limit + 1);

    /* Use the shared buildCursorPage utility for consistent page slicing.
     The cursor value is the JSON-encoded compound key so clients remain
     decoupled from internal field names. */
    type WalletTxRow = (typeof rows)[number];
    const cursorPage = buildCursorPage<WalletTxRow>({
      data: rows,
      limit,
      getCursorValue: (row: WalletTxRow) => {
        const createdAt =
          row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt));
        return JSON.stringify({ createdAt: createdAt.toISOString(), id: row.id });
      },
    });
    const { data: page, nextCursor, hasMore: _hasMore } = cursorPage;

    const [promoRow] = await db
      .select({ s: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, riderId),
          sql`${walletTransactionsTable.type} IN ('bonus', 'cashback', 'loyalty')`
        )
      );
    const promoBalance = parseFloat(safeNum(promoRow?.s).toFixed(2));

    sendSuccess(res, {
      balance: safeNum(user.walletBalance),
      promoBalance,
      items: page.map((t) => ({ ...t, amount: safeNum(t.amount) })),
      nextCursor,
      limit,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/wallet/withdraw — Atomic withdrawal (prevents race condition) ── */
router.post("/wallet/withdraw", async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    const riderId = req.riderId!;
    const { amount, accountTitle, accountNumber, bankName, paymentMethod, note } = parsed.data;
    const amt = amount;

    const s = await getCachedSettings();
    const withdrawalEnabled = (s["rider_withdrawal_enabled"] ?? "on") === "on";
    const minPayout = parseFloat(s["rider_min_payout"] ?? "500");
    const maxPayout = parseFloat(s["rider_max_payout"] ?? "50000");

    if (!withdrawalEnabled) {
      sendForbidden(res, "Withdrawals are currently paused by admin. Please try again later.");
      return;
    }
    if (!amt || amt <= 0) {
      sendValidationError(res, "Valid amount required");
      return;
    }
    if (amt < minPayout) {
      sendValidationError(res, `Minimum withdrawal is Rs. ${minPayout}`);
      return;
    }
    if (amt > maxPayout) {
      sendValidationError(res, `Maximum single withdrawal is Rs. ${maxPayout}`);
      return;
    }
    if (!accountTitle || !accountNumber || !bankName) {
      sendValidationError(res, "Account title, number and bank name are required");
      return;
    }

    try {
      const txId = generateId();
      const result = await db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, riderId))
          .limit(1);
        if (!user) throw new Error("User not found");

        const balance = safeNum(user.walletBalance);
        if (amt > balance) throw new Error(`Insufficient balance. Available: Rs. ${balance}`);

        /* DB floor guard — prevents negative balance if two withdrawals clear pre-flight simultaneously */
        const [deducted] = await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance - ${amt}`, updatedAt: new Date() })
          .where(and(eq(usersTable.id, riderId), gte(usersTable.walletBalance, amt.toFixed(2))))
          .returning({ id: usersTable.id });
        if (!deducted) throw new Error(`Insufficient balance. Please try again.`);
        await tx.insert(walletTransactionsTable).values({
          id: txId,
          userId: riderId,
          type: "debit",
          amount: amt.toFixed(2),
          description: `Withdrawal — ${bankName} · ${accountNumber} · ${accountTitle}${note ? ` · ${note}` : ""}`,
          reference: "pending",
          paymentMethod: paymentMethod || bankName,
        });
        return balance - amt;
      });

      const withdrawLang = await getUserLanguage(riderId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: riderId,
          title: t("notifWithdrawalPending", withdrawLang) + " ✅",
          body: t("notifWithdrawalPendingBody", withdrawLang).replace("{amount}", amt.toFixed(0)),
          type: "wallet",
          icon: "cash-outline",
        })
        .catch((err: Error) => {
          logger.error("[rider] background op failed:", err.message);
        });

      const withdrawBody = { newBalance: parseFloat(result.toFixed(2)), amount: amt, txId };
      storeIdempotency(req, 200, { success: true, data: withdrawBody });
      sendSuccess(res, withdrawBody);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Withdrawal failed";
      sendValidationError(res, msg);
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/cod-summary — COD balance + remittance history ── */
router.get("/cod-summary", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const [codAgg, verifiedAgg, remittances] = await Promise.all([
      db
        .select({ total: sum(ordersTable.total), count: count() })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            eq(ordersTable.status, "delivered"),
            eq(ordersTable.paymentMethod, "cod")
          )
        ),
      db
        .select({ total: sum(walletTransactionsTable.amount) })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "cod_remittance"),
            sql`reference LIKE 'verified:%'`
          )
        ),
      db
        .select()
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.userId, riderId),
            eq(walletTransactionsTable.type, "cod_remittance")
          )
        )
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(30),
    ]);
    const totalCollected = safeNum(codAgg[0]?.total);
    const totalVerified = safeNum(verifiedAgg[0]?.total);
    sendSuccess(res, {
      totalCollected,
      totalVerified,
      netOwed: Math.max(0, totalCollected - totalVerified),
      codOrderCount: Number(codAgg[0]?.count ?? 0),
      remittances: remittances.map((r) => ({ ...r, amount: safeNum(r.amount) })),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

const remitSchema = z.object({
  /* L-03: Clamp to 2 decimal places to prevent floating-point drift in PKR amounts. */
  amount: z.coerce
    .number()
    .positive("Amount must be positive")
    .refine((v) => Math.round(v * 100) / 100 === v, {
      message: "Amount must have at most 2 decimal places",
    }),
  paymentMethod: z.string().min(1, "Payment method is required"),
  accountNumber: z.string().optional(),
  transactionId: z.string().optional(),
  note: z.string().max(500).optional(),
});

/* ── POST /rider/cod/remit — submit COD cash remittance ── */
/* M-05: Rate-limit COD remittance to prevent accidental double-submission spam. */
router.post("/cod/remit", codRemitLimiter, async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const riderId = req.riderId!;
    const parsed = remitSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid remittance data");
      return;
    }
    const { amount, paymentMethod, accountNumber, transactionId, note } = parsed.data;

    const txId = generateId();
    const refParts = [paymentMethod];
    if (accountNumber) refParts.push(accountNumber);
    if (transactionId) refParts.push(transactionId);

    const result = await db
      .transaction(async (tx) => {
        const [codAgg] = await tx
          .select({ total: sum(ordersTable.total) })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.riderId, riderId),
              eq(ordersTable.status, "delivered"),
              eq(ordersTable.paymentMethod, "cod")
            )
          );
        const [verifiedAgg] = await tx
          .select({ total: sum(walletTransactionsTable.amount) })
          .from(walletTransactionsTable)
          .where(
            and(
              eq(walletTransactionsTable.userId, riderId),
              eq(walletTransactionsTable.type, "cod_remittance"),
              sql`reference LIKE 'verified:%'`
            )
          );
        const [pendingAgg] = await tx
          .select({ total: sum(walletTransactionsTable.amount) })
          .from(walletTransactionsTable)
          .where(
            and(
              eq(walletTransactionsTable.userId, riderId),
              eq(walletTransactionsTable.type, "cod_remittance"),
              sql`reference LIKE 'pending:%'`
            )
          );

        const totalCollected = safeNum(codAgg?.total);
        const totalVerified = safeNum(verifiedAgg?.total);
        const totalPending = safeNum(pendingAgg?.total);
        const netOwed = Math.max(0, totalCollected - totalVerified - totalPending);

        if (Number(amount) > netOwed) {
          throw new Error(`OVER_LIMIT:${netOwed}`);
        }

        await tx.insert(walletTransactionsTable).values({
          id: txId,
          userId: riderId,
          amount: String(amount),
          type: "cod_remittance",
          description: note || `COD remittance via ${paymentMethod}`,
          reference: `pending:${refParts.join(":")}`,
        });

        return { netOwed };
      })
      .catch((err: Error) => {
        if (err.message.startsWith("OVER_LIMIT:")) return { overLimit: err.message.split(":")[1] };
        throw err;
      });

    if ("overLimit" in result) {
      sendError(res, `Remittance amount exceeds available owed balance (${result.overLimit})`, 400);
      return;
    }

    const remitBody = {
      transactionId: txId,
      message: "Remittance submitted for admin verification",
    };
    storeIdempotency(req, 200, { success: true, data: remitBody });
    sendSuccess(res, remitBody);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to submit remittance";
    sendError(res, msg, 500);
  }
});

/* ── GET /rider/notifications ── */
/* M-05: Limit notification polling to 30 req/min to prevent flooding. */
router.get("/notifications", notificationsFeedLimiter, async (req, res) => {
  try {
    const riderId = req.riderId!;
    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, riderId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(30);
    sendSuccess(res, {
      notifications: notifs,
      unread: notifs.filter((n: Record<string, unknown>) => !n.isRead).length,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── PATCH /rider/notifications/read-all ── */
router.patch("/notifications/read-all", async (req, res) => {
  try {
    const riderId = req.riderId!;
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, riderId));
    sendSuccess(res);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── PATCH /rider/notifications/:id/read ── */
router.patch("/notifications/:id/read", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const { id } = req.params as Record<string, string>;
    if (!id || typeof id !== "string") {
      sendValidationError(res, "Invalid notification id");
      return;
    }
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, riderId)));
    const [updated] = await db
      .select({ id: notificationsTable.id, isRead: notificationsTable.isRead })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, riderId)))
      .limit(1);
    if (!updated) {
      sendNotFound(res, "Notification not found");
      return;
    }
    sendSuccess(res);
    return;
  } catch (err) {
    logger.error("Failed to mark notification read:", err);
    sendError(res, "Failed to mark notification as read", 500);
    return;
  }
});

/* ── POST /riders/push-token — Register FCM or VAPID push token for this rider.
   Mirrors the behaviour of POST /push/subscribe but scoped to rider auth and
   always sets role="rider". Used by the rider app's push.ts when calling
   /api/riders/push-token (the rider-scoped endpoint). */
router.post("/push-token", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const body = req.body as Record<string, unknown>;
    const tokenType = body["type"] as string | undefined;

    if (tokenType === "fcm") {
      const token = body["token"] as string | undefined;
      if (!token) {
        sendValidationError(res, "token required for FCM");
        return;
      }
      await db
        .delete(pushSubscriptionsTable)
        .where(
          and(
            eq(pushSubscriptionsTable.userId, riderId),
            eq(pushSubscriptionsTable.tokenType, "fcm"),
            eq(pushSubscriptionsTable.role, "rider")
          )
        );
      const id = generateId();
      await db.insert(pushSubscriptionsTable).values({
        id,
        userId: riderId,
        role: "rider",
        tokenType: "fcm",
        endpoint: token,
        p256dh: null,
        authKey: null,
      });
      sendSuccess(res, { id });
      return;
    }

    /* VAPID subscription */
    const endpoint = body["endpoint"] as string | undefined;
    const p256dh = body["p256dh"] as string | undefined;
    const auth = body["auth"] as string | undefined;
    if (!endpoint) {
      sendValidationError(res, "endpoint required for VAPID");
      return;
    }
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.userId, riderId),
          eq(pushSubscriptionsTable.endpoint, endpoint)
        )
      );
    const id = generateId();
    await db.insert(pushSubscriptionsTable).values({
      id,
      userId: riderId,
      role: "rider",
      tokenType: "vapid",
      endpoint,
      p256dh: p256dh ?? null,
      authKey: auth ?? null,
    });
    sendSuccess(res, { id });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[rider] push-token registration failed"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/wallet/min-balance — Returns min balance config ── */
router.get("/wallet/min-balance", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const s = await getCachedSettings();
    const minBalance = parseFloat(s["rider_min_balance"] ?? "0");
    const depositEnabled = (s["rider_deposit_enabled"] ?? "on") === "on";
    const [user] = await db
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, riderId))
      .limit(1);
    const currentBalance = safeNum(user?.walletBalance);
    sendSuccess(res, {
      minBalance,
      depositEnabled,
      currentBalance,
      isBelowMin: minBalance > 0 && currentBalance < minBalance,
      shortfall: minBalance > 0 ? Math.max(0, minBalance - currentBalance) : 0,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /rider/wallet/deposit — Submit a manual deposit request ── */
/* M-05: Limit deposit submissions to 10 per 15 minutes per rider. */
router.post("/wallet/deposit", riderDepositLimiter, async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const parsed = depositSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    const riderId = req.riderId!;
    const { amount, paymentMethod, accountNumber, transactionId, note } = parsed.data;
    const amt = amount;

    const s = await getCachedSettings();
    const depositEnabled = (s["rider_deposit_enabled"] ?? "on") === "on";

    if (!depositEnabled) {
      sendForbidden(res, "Deposits are currently disabled by admin. Please contact support.");
      return;
    }
    if (!amt || amt <= 0) {
      sendValidationError(res, "Valid amount required");
      return;
    }
    if (amt < 100) {
      sendValidationError(res, "Minimum deposit is Rs. 100");
      return;
    }
    if (!paymentMethod) {
      sendValidationError(res, "Payment method required");
      return;
    }
    if (!transactionId?.trim()) {
      sendValidationError(res, "Transaction ID is required for verification");
      return;
    }

    /* Build explicit allowlist of currently-enabled payment methods */
    const PAYMENT_METHOD_SETTING: Record<string, string> = {
      jazzcash: "jazzcash_enabled",
      easypaisa: "easypaisa_enabled",
      bank: "bank_enabled",
    };
    const enabledMethods = Object.entries(PAYMENT_METHOD_SETTING)
      .filter(([, settingKey]) => (s[settingKey] ?? "off") === "on")
      .map(([key]) => key);
    const methodKey = paymentMethod.toLowerCase().replace(/\s+/g, "");
    if (enabledMethods.length > 0 && !enabledMethods.includes(methodKey)) {
      sendValidationError(
        res,
        `Payment method '${paymentMethod}' is not enabled. Available: ${enabledMethods.join(", ")}.`
      );
      return;
    }

    const txId = generateId();
    await db.insert(walletTransactionsTable).values({
      id: txId,
      userId: riderId,
      type: "deposit",
      amount: amt.toFixed(2),
      description: `Wallet Deposit — ${paymentMethod}${accountNumber ? ` · From: ${accountNumber}` : ""}${transactionId ? ` · TxID: ${transactionId}` : ""}${note ? ` · ${note}` : ""}`,
      reference: "pending",
      paymentMethod,
    });

    const depositNotifLang = await getUserLanguage(riderId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: riderId,
        title: t("notifWalletDeposit", depositNotifLang) + " ✅",
        body: t("notifWalletDepositBody", depositNotifLang).replace("{amount}", amt.toFixed(0)),
        type: "wallet",
        icon: "wallet-outline",
      })
      .catch((e: unknown) =>
        logger.warn(
          {
            message: "[rider] deposit notif insert failed",
            error: e instanceof Error ? e.message : String(e),
            code: "RIDER_NOTIF_DEPOSIT_FAILED",
            correlationId: null,
            timestamp: new Date().toISOString(),
            userId: riderId,
          },
          "[rider] deposit notif insert failed"
        )
      );

    const depositBody = { txId, amount: amt };
    storeIdempotency(req, 200, { success: true, data: depositBody });
    sendSuccess(res, depositBody);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

const spoofHitStore = new Map<string, number>();

/* Exported so auth logout and online-status toggle can clear hits for a session */
export function clearSpoofHits(riderId: string): void {
  spoofHitStore.delete(`spoof_hits:${riderId}`);
}

const locationRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => req.riderId ?? getClientIp(req) ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendTooManyRequests(
      res,
      "Location update rate limit exceeded (60/min). Please wait before sending another update."
    );
  },
});

/* ── PATCH /rider/location — GPS heartbeat: rider sends periodic location updates ── */
router.patch("/location", locationRateLimiter, gpsAntiSpoofMiddleware, async (req, res) => {
  try {
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid location data");
      return;
    }
    const riderId = req.riderId!;

    const { latitude, longitude, accuracy, speed, heading, batteryLevel } = parsed.data;

    const settings = await getCachedSettings();

    if (settings["security_gps_tracking"] === "off") {
      sendForbidden(res, "GPS tracking is currently disabled by admin.");
      return;
    }

    /* ── Server-side distance throttling ── */
    const minDistanceMeters = parseInt(settings["gps_min_distance_meters"] ?? "25", 10);
    if (minDistanceMeters > 0) {
      const [prev] = await db
        .select({ lat: liveLocationsTable.latitude, lng: liveLocationsTable.longitude })
        .from(liveLocationsTable)
        .where(eq(liveLocationsTable.userId, riderId))
        .limit(1);
      if (prev) {
        const R = 6371000;
        const pLat = parseFloat(String(prev.lat));
        const pLng = parseFloat(String(prev.lng));
        const dLat = ((latitude - pLat) * Math.PI) / 180;
        const dLng = ((longitude - pLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((pLat * Math.PI) / 180) *
            Math.cos((latitude * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (dist < minDistanceMeters) {
          sendSuccess(res, {
            skipped: true,
            reason: "distance_threshold",
            updatedAt: new Date().toISOString(),
          });
          return;
        }
      }
    }

    /* accuracy === 0, mockProvider flag, and emulator-signature coordinate checks are
     handled upstream by gpsAntiSpoofMiddleware — no need to repeat them here. */

    /* GPS Spoof Detection — spoofed pings are rejected immediately on detection.
     Minimum threshold is always 200 km/h (physically impossible for standard ground transport),
     or the admin-configured max if it's higher. Mock GPS provider flag is also checked. */
    if (accuracy !== undefined) {
      const minAccuracyMeters = parseInt(settings["security_gps_accuracy"] ?? "50", 10);
      if (accuracy > minAccuracyMeters) {
        /* Reject low-accuracy pings — cell-tower or Wi-Fi triangulation produces
         very high accuracy values (100-1000m+) and must not update live locations
         or be used for proximity checks like "arrived". */
        sendErrorWithData(
          res,
          `GPS accuracy (${Math.round(accuracy)}m) exceeds the allowed threshold (${minAccuracyMeters}m). Please move to an open area or enable high-accuracy GPS.`,
          {
            code: "GPS_ACCURACY_LOW",
            accuracy,
            threshold: minAccuracyMeters,
          },
          422
        );
        return;
      }
    }

    /* Stale grace period threshold — configurable via admin settings, default 30 min */
    const staleGraceMinutes = parseInt(settings["security_gps_stale_grace_minutes"] ?? "30", 10);
    const STALE_GRACE_MS = staleGraceMinutes * 60 * 1000;

    /* speedWarning is set when a speed anomaly is detected on hit 1 or 2 (warn-before-reject).
     The ping is still accepted (DB writes proceed) — only the response payload differs. */
    let speedWarning: { hit: number; detectedSpeedKmh: number } | null = null;

    if (settings["security_spoof_detection"] === "on") {
      const configMaxSpeed = parseInt(settings["security_max_speed_kmh"] ?? "150", 10);
      let MAX_ALLOWED_KMH = Math.max(configMaxSpeed, 200); /* never below 200 km/h */

      /* Accuracy-proportional speed tolerance: moderate GPS accuracy (20–50m) at
       startup can produce legitimate jumps. Apply a 1.5× multiplier so a 50m
       GPS drift in 1 second isn't treated the same as a 500km jump. */
      if (accuracy !== undefined && accuracy >= 20 && accuracy <= 50) {
        MAX_ALLOWED_KMH = MAX_ALLOWED_KMH * 1.5;
      }

      const [prev] = await db
        .select()
        .from(liveLocationsTable)
        .where(eq(liveLocationsTable.userId, riderId))
        .limit(1);

      /* Stale location grace period: if the previous ping is older than the configured threshold,
       skip speed-based comparison entirely — treat this as a fresh session start.
       This prevents false positives when riders open the app after a long break. */
      const prevIsStale = prev && Date.now() - new Date(prev.updatedAt).getTime() > STALE_GRACE_MS;

      /* Emulator-signature, accuracy===0, and mockProvider checks are now handled
       upstream by gpsAntiSpoofMiddleware before the request reaches this handler.
       Only speed-based spoofing (requires DB context) remains here. */
      const mockFlagged = false; /* always false at this point — middleware already blocked */
      const emulatorFlagged = false; /* always false at this point — middleware already blocked */

      const spoofHitKey = `spoof_hits:${riderId}`;
      const currentHits: number = spoofHitStore.get(spoofHitKey) ?? 0;

      /* Check speed-based spoofing if we have a non-stale previous location */
      let speedSpoofed = false;
      let detectedSpeedKmh = 0;
      if (prev && !prevIsStale) {
        const prevLat = parseFloat(String(prev.latitude));
        const prevLon = parseFloat(String(prev.longitude));
        const result = detectGPSSpoof(
          prevLat,
          prevLon,
          prev.updatedAt,
          latitude,
          longitude,
          MAX_ALLOWED_KMH
        );
        speedSpoofed = result.spoofed;
        detectedSpeedKmh = result.speedKmh;
      }

      if (speedSpoofed || mockFlagged || emulatorFlagged) {
        const newHits = currentHits + 1;
        spoofHitStore.set(spoofHitKey, newHits);

        const reason = emulatorFlagged
          ? "Emulator signature detected — known fake GPS coordinates"
          : mockFlagged
            ? "Mock GPS provider detected"
            : `Speed ${detectedSpeedKmh.toFixed(1)} km/h exceeds ${MAX_ALLOWED_KMH.toFixed(0)} km/h`;

        const ip = getClientIp(req);
        addSecurityEvent({
          type: "gps_spoof_detected",
          ip,
          userId: riderId,
          details: `GPS spoof: ${reason} (hit ${newHits})`,
          severity: newHits >= 3 ? "high" : "medium",
        });

        /* 3rd+ consecutive violation: auto-offline + emit admin alert + hard reject
           (applies to both speed anomalies and mock/emulator detections) */
        if (newHits >= 3) {
          spoofHitStore.set(spoofHitKey, 0);
          let autoOffline = false;
          try {
            await db
              .update(usersTable)
              .set({ isOnline: false, updatedAt: new Date() })
              .where(eq(usersTable.id, riderId));
            autoOffline = true;
          } catch (err) {
            logger.warn(
              { riderId, err: err instanceof Error ? err.message : String(err) },
              "[rider] Failed to auto-offline rider due to spoofing"
            );
          }
          const io = getIO();
          if (io) {
            io.to("admin-fleet").emit("rider:spoof-alert", {
              userId: riderId,
              reason,
              autoOffline,
              sentAt: new Date().toISOString(),
            });
          }
          sendErrorWithData(
            res,
            "GPS location rejected: repeated spoofing detected. You have been taken offline.",
            {
              autoOffline,
              code: "GPS_SPOOF_DETECTED",
              hit: newHits,
            },
            422
          );
          return;
        }

        /* Emulator/mock on hits 1-2: always hard-reject (unambiguous signal).
           Hit count still accumulates toward 3-hit auto-offline enforcement above. */
        if (mockFlagged || emulatorFlagged) {
          sendErrorWithData(
            res,
            "GPS location rejected: mock GPS provider detected. Please disable fake GPS apps.",
            {
              autoOffline: false,
              code: "GPS_SPOOF_DETECTED",
              hit: newHits,
            },
            422
          );
          return;
        }

        /* 1st or 2nd speed anomaly: tolerate the ping — continue to DB writes.
           A warning is attached to the success response to inform the client. */
        speedWarning = { hit: newHits, detectedSpeedKmh: Math.round(detectedSpeedKmh) };
      } else if (currentHits > 0) {
        spoofHitStore.set(spoofHitKey, 0);
      }
    }

    const nowDate = new Date();

    await db.insert(locationLogsTable).values({
      id: generateId(),
      userId: riderId,
      role: "rider",
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      heading: heading ?? null,
      batteryLevel: batteryLevel ?? null,
      isSpoofed: false,
      createdAt: nowDate,
    });

    const action = req.body.action ?? null;

    await db
      .insert(liveLocationsTable)
      .values({
        userId: riderId,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        role: "rider",
        action,
        updatedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: liveLocationsTable.userId,
        set: {
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          role: "rider",
          action,
          updatedAt: nowDate,
        },
      });

    /* Derive rideId from DB — never trust client-supplied value to prevent
     unauthorized injection into arbitrary ride:{rideId} Socket.io rooms. */
    let rideId: string | null = null;
    let vendorId: string | null = null;
    try {
      const [activeRide] = await db
        .select({ id: ridesTable.id })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.riderId, riderId),
            or(
              eq(ridesTable.status, "accepted"),
              eq(ridesTable.status, "arrived"),
              eq(ridesTable.status, "in_transit")
            )
          )
        )
        .orderBy(desc(ridesTable.updatedAt))
        .limit(1);
      rideId = activeRide?.id ?? null;
    } catch (err) {
      logger.warn(
        { riderId, err: err instanceof Error ? err.message : String(err) },
        "[rider] Failed to lookup active ride"
      );
    }

    /* Look up vendor and orderId for active delivery order */
    let orderId: string | null = null;
    try {
      const [activeOrder] = await db
        .select({ id: ordersTable.id, vendorId: ordersTable.vendorId })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.riderId, riderId),
            or(eq(ordersTable.status, "out_for_delivery"), eq(ordersTable.status, "picked_up"))
          )
        )
        .limit(1);
      vendorId = activeOrder?.vendorId ?? null;
      orderId = activeOrder?.id ?? null;
    } catch (err) {
      logger.warn(
        { riderId, err: err instanceof Error ? err.message : String(err) },
        "[rider] Failed to lookup active delivery order"
      );
    }

    const updatedAt = nowDate.toISOString();

    emitRiderLocation({
      userId: riderId,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      batteryLevel,
      action,
      rideId,
      vendorId,
      orderId,
      vehicleType: normalizeVehicleType(String(req.riderUser?.vehicleType ?? "")) || null,
      updatedAt,
    });

    if (speedWarning) {
      sendSuccess(res, {
        updatedAt,
        warning: "GPS_SPEED_ANOMALY",
        hit: speedWarning.hit,
        detectedSpeedKmh: speedWarning.detectedSpeedKmh,
      });
    } else {
      sendSuccess(res, { updatedAt });
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── validateGpsPing — stateless per-ping GPS sanity check ──────────────────
   Performs coordinate-range, mock-provider (accuracy===0), and GPS accuracy
   threshold checks without requiring any DB context.  Speed-based detection
   (which needs the previous location) is handled separately in the batch loop.

   Returns { valid: true } on success, or { valid: false, reason } on failure.
   ─────────────────────────────────────────────────────────────────────────── */
function validateGpsPing(
  ping: { latitude: number; longitude: number; accuracy?: number },
  minAccuracyMeters: number
): { valid: boolean; reason?: string } {
  /* accuracy === 0 is a physical impossibility from real GPS hardware and a
     reliable emulator / mock-provider signature */
  if (ping.accuracy === 0) {
    return { valid: false, reason: "accuracy_zero" };
  }
  /* accuracy exceeds the platform-configured threshold */
  if (ping.accuracy !== undefined && ping.accuracy > minAccuracyMeters) {
    return { valid: false, reason: "accuracy_low" };
  }
  return { valid: true };
}

/* ── POST /rider/location/batch — Replay queued offline GPS pings ── */
const batchLocationSchema = z.object({
  locations: z
    .array(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().optional(),
        speed: z.number().optional(),
        heading: z.number().optional(),
        batteryLevel: z.number().min(0).max(100).optional(),
        timestamp: z.string(),
      })
    )
    .min(1)
    .max(100),
});

router.post("/location/batch", async (req, res) => {
  try {
    const parsed = batchLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    const riderId = req.riderId!;

    const settings = await getCachedSettings();

    /* GPS accuracy threshold — same as the single-ping endpoint */
    const minAccuracyMeters = parseInt(settings["security_gps_accuracy"] ?? "50", 10);

    /* Speed-spoof threshold — same floor as single-ping endpoint */
    const configMaxSpeed = parseInt(settings["security_max_speed_kmh"] ?? "150", 10);
    const BASE_MAX_ALLOWED_KMH = Math.max(configMaxSpeed, 200); /* never below 200 km/h */

    /* Stale grace period — configurable, same key as single-ping endpoint */
    const batchStaleGraceMinutes = parseInt(
      settings["security_gps_stale_grace_minutes"] ?? "30",
      10
    );
    const BATCH_STALE_GRACE_MS = batchStaleGraceMinutes * 60 * 1000;

    const nowMs = Date.now();
    /* Reject timestamps more than 24 h old or more than 60 s in the future.
     Client-supplied timestamps are untrusted; bounding them prevents arbitrary
     historical backdating of location records. */
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const MAX_FUTURE_MS = 60 * 1000;

    const sorted = parsed.data.locations.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let inserted = 0;
    let skipped = 0;
    let rejectedMock = 0;
    let batchSpoofWarnings = 0;
    let prevBatchLat: number | null = null;
    let prevBatchLng: number | null = null;
    let prevBatchTs: Date | null = null;
    const bulkRows: Array<typeof locationLogsTable.$inferInsert> = [];

    /* Batch-scoped spoof hit counter — mirrors single-ping warn-before-reject logic */
    const batchSpoofHitKey = `spoof_hits:${riderId}`;
    let batchCurrentHits: number = spoofHitStore.get(batchSpoofHitKey) ?? 0;

    /* Track whether 3+ hit enforcement was triggered mid-batch */
    let batchHardBlocked = false;
    let batchHardBlockReason = "";

    for (const loc of sorted) {
      const ts = new Date(loc.timestamp);
      const tsMs = ts.getTime();

      /* ── Timestamp sanity ── */
      if (isNaN(tsMs) || nowMs - tsMs > MAX_AGE_MS || tsMs - nowMs > MAX_FUTURE_MS) {
        skipped++;
        continue;
      }

      /* ── Per-ping static validation (mock provider + accuracy threshold) ── */
      const pingCheck = validateGpsPing(loc, minAccuracyMeters);
      if (!pingCheck.valid) {
        if (pingCheck.reason === "accuracy_zero") rejectedMock++;
        skipped++;
        continue;
      }

      /* ── Speed-based spoof detection within the batch ── */
      if (
        settings["security_spoof_detection"] === "on" &&
        prevBatchLat != null &&
        prevBatchLng != null &&
        prevBatchTs != null
      ) {
        /* Stale grace period: if gap between consecutive batch pings exceeds threshold, skip speed check */
        const gapMs = ts.getTime() - prevBatchTs.getTime();
        const isStaleGap = gapMs > BATCH_STALE_GRACE_MS;

        /* Accuracy-proportional speed tolerance: same 1.5× multiplier for moderate accuracy */
        const batchMaxSpeed =
          loc.accuracy !== undefined && loc.accuracy >= 20 && loc.accuracy <= 50
            ? BASE_MAX_ALLOWED_KMH * 1.5
            : BASE_MAX_ALLOWED_KMH;

        if (!isStaleGap) {
          const result = detectGPSSpoof(
            prevBatchLat,
            prevBatchLng,
            prevBatchTs,
            loc.latitude,
            loc.longitude,
            batchMaxSpeed
          );
          if (result.spoofed) {
            batchCurrentHits++;
            spoofHitStore.set(batchSpoofHitKey, batchCurrentHits);
            if (batchCurrentHits >= 3) {
              /* 3rd+ violation: mark hard block, stop processing further pings */
              batchHardBlocked = true;
              batchHardBlockReason = `Speed ${result.speedKmh.toFixed(1)} km/h exceeds ${batchMaxSpeed.toFixed(0)} km/h`;
              skipped++;
              continue;
            }
            /* 1st or 2nd: tolerate and persist the ping (warn only) */
            batchSpoofWarnings++;
            /* Fall through to bulkRows.push — ping is accepted with a warning */
          } else {
            /* Clean ping after previous anomaly(ies) — reset consecutive counter */
            if (batchCurrentHits > 0) {
              batchCurrentHits = 0;
              spoofHitStore.set(batchSpoofHitKey, 0);
            }
          }
        } else {
          /* Stale gap treated as fresh start — reset consecutive counter */
          if (batchCurrentHits > 0) {
            batchCurrentHits = 0;
            spoofHitStore.set(batchSpoofHitKey, 0);
          }
        }
      }

      /* Skip pings after a hard block is triggered */
      if (batchHardBlocked) {
        skipped++;
        continue;
      }

      /* Deterministic row ID: (riderId, ms timestamp, batch-sequence index).
       Including `bulkRows.length` as a sequence disambiguates two pings that
       share the same millisecond timestamp (e.g. rapid client polling or
       clock drift), while still being stable across retries: the client sends
       the identical sorted array so the same index is assigned to the same
       ping every time. onConflictDoNothing then silently skips duplicates. */
      const deterministicId = `loc:${riderId}:${tsMs}:${bulkRows.length}`;
      bulkRows.push({
        id: deterministicId,
        userId: riderId,
        role: "rider" as const,
        latitude: loc.latitude.toString(),
        longitude: loc.longitude.toString(),
        accuracy: loc.accuracy ?? null,
        speed: loc.speed ?? null,
        heading: loc.heading ?? null,
        batteryLevel: loc.batteryLevel ?? null,
        isSpoofed: false,
        createdAt: ts,
      });
      prevBatchLat = loc.latitude;
      prevBatchLng = loc.longitude;
      prevBatchTs = ts;
    }

    if (bulkRows.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < bulkRows.length; i += CHUNK_SIZE) {
        const chunk = bulkRows.slice(i, i + CHUNK_SIZE);
        try {
          /* onConflictDoNothing: idempotent on retry — duplicate pings (same
           deterministic ID) are silently ignored rather than failing the batch. */
          const result = await db
            .insert(locationLogsTable)
            .values(chunk)
            .onConflictDoNothing()
            .returning({ id: locationLogsTable.id });
          inserted += result.length;
          skipped += chunk.length - result.length;
        } catch (err) {
          logger.warn(
            {
              error: err instanceof Error ? err.message : String(err),
              code: "LOCATION_LOG_BATCH_FAILED",
              timestamp: new Date().toISOString(),
            },
            "[rider] Location log batch insert failed — trying row-by-row"
          );
          for (const row of chunk) {
            try {
              const r = await db
                .insert(locationLogsTable)
                .values(row)
                .onConflictDoNothing()
                .returning({ id: locationLogsTable.id });
              if (r.length > 0) inserted++;
              else skipped++;
            } catch (err) {
              logger.debug(
                { error: err instanceof Error ? err.message : String(err) },
                "[fn] skipped on error"
              );
              skipped++;
            }
          }
        }
      }
    }

    /* Only update live location and emit if at least one clean ping was inserted.
     prevBatchLat/Lng hold the last accepted (non-spoofed, in-accuracy) coordinates. */
    if (inserted > 0) {
      const nowDate = new Date();
      await db
        .insert(liveLocationsTable)
        .values({
          userId: riderId,
          latitude: prevBatchLat!.toString(),
          longitude: prevBatchLng!.toString(),
          role: "rider",
          action: null,
          updatedAt: nowDate,
        })
        .onConflictDoUpdate({
          target: liveLocationsTable.userId,
          set: {
            latitude: prevBatchLat!.toString(),
            longitude: prevBatchLng!.toString(),
            role: "rider",
            action: null,
            updatedAt: nowDate,
          },
        });

      emitRiderLocation({
        userId: riderId,
        latitude: prevBatchLat!,
        longitude: prevBatchLng!,
        accuracy: undefined,
        speed: undefined,
        heading: undefined,
        batteryLevel: undefined,
        action: null,
        rideId: null,
        vendorId: null,
        orderId: null,
        vehicleType: normalizeVehicleType(String(req.riderUser?.vehicleType ?? "")) || null,
        updatedAt: nowDate.toISOString(),
      });
    }

    /* If a 3rd+ consecutive speed violation was hit: emit admin alert and auto-offline
     AFTER inserting previously accepted (warn-tolerated) pings. */
    if (batchHardBlocked) {
      spoofHitStore.set(batchSpoofHitKey, 0);
      try {
        await db
          .update(usersTable)
          .set({ isOnline: false, updatedAt: new Date() })
          .where(eq(usersTable.id, riderId));
      } catch (err) {
        logger.warn(
          { riderId, err: err instanceof Error ? err.message : String(err) },
          "[rider] Failed to auto-offline rider due to batch spoofing"
        );
      }
      const io = getIO();
      if (io) {
        io.to("admin-fleet").emit("rider:spoof-alert", {
          userId: riderId,
          reason: batchHardBlockReason,
          autoOffline: true,
          sentAt: new Date().toISOString(),
        });
      }
      addSecurityEvent({
        type: "gps_spoof_detected",
        ip: getClientIp(req),
        userId: riderId,
        details: `GPS spoof (batch): ${batchHardBlockReason} (hit 3+)`,
        severity: "high",
      });
      /* M-04: 403 (Forbidden) is more semantically correct than 422 for active
         enforcement decisions — the server understands the request but refuses
         it because policy has been violated. 422 is reserved for malformed data. */
      sendErrorWithData(
        res,
        "GPS location rejected: repeated spoofing detected in batch. You have been taken offline.",
        {
          autoOffline: true,
          code: "GPS_SPOOF_DETECTED",
          inserted,
          skipped,
        },
        403
      );
      return;
    }

    const batchResponse: Record<string, unknown> = {
      inserted,
      skipped,
      rejectedMock,
      total: sorted.length,
    };
    if (batchSpoofWarnings > 0) {
      batchResponse["warning"] = "GPS_SPEED_ANOMALY";
      batchResponse["spoofWarnings"] = batchSpoofWarnings;
    }
    sendSuccess(res, batchResponse);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/wallet/deposits — Deposit history ── */
router.get("/wallet/deposits", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const deposits = await db
      .select()
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, riderId),
          eq(walletTransactionsTable.type, "deposit")
        )
      )
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(20);
    sendSuccess(res, {
      deposits: deposits.map((d) => {
        const ref = d.reference ?? "pending";
        const status =
          ref.startsWith("approved:") ||
          ref.startsWith("paid:") ||
          ref === "verified" ||
          ref === "approved"
            ? "verified"
            : ref.startsWith("rejected:")
              ? "rejected"
              : "pending";
        return {
          ...d,
          amount: safeNum(d.amount),
          status,
          method: d.paymentMethod ?? null,
        };
      }),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── Ignore penalty helper ── */
async function handleIgnorePenalty(
  riderId: string
): Promise<{ dailyIgnores: number; penaltyApplied: number; restricted: boolean }> {
  const s = await getCachedSettings();
  const limit = parseInt(s["rider_ignore_limit_daily"] ?? "5", 10);
  const penaltyAmt = parseFloat(s["rider_ignore_penalty_amount"] ?? "30");
  const restrictEnabled = (s["rider_ignore_restrict_enabled"] ?? "off") === "on";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let penaltyApplied = 0;
  let restricted = false;
  let dailyIgnores = 0;

  await db.transaction(async (tx) => {
    const [countRow] = await tx
      .select({ c: count() })
      .from(riderPenaltiesTable)
      .where(
        and(
          eq(riderPenaltiesTable.riderId, riderId),
          eq(riderPenaltiesTable.type, "ignore"),
          gte(riderPenaltiesTable.createdAt, today)
        )
      );
    dailyIgnores = (countRow?.c ?? 0) + 1;

    await tx
      .update(usersTable)
      .set({ ignoreCount: sql`ignore_count + 1`, updatedAt: new Date() })
      .where(eq(usersTable.id, riderId));

    await tx.insert(riderPenaltiesTable).values({
      id: generateId(),
      riderId,
      type: "ignore",
      amount: "0",
      reason: `Ignore #${dailyIgnores} today`,
    });

    if (dailyIgnores > limit) {
      penaltyApplied = penaltyAmt;
      /* Floor wallet at 0 so balance can never go negative from an ignore penalty */
      await tx
        .update(usersTable)
        .set({
          walletBalance: sql`GREATEST(wallet_balance - ${penaltyAmt}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, riderId));
      await tx.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: riderId,
        type: "ignore_penalty",
        amount: penaltyAmt.toFixed(2),
        description: `Ignore penalty (${dailyIgnores}/${limit} today) — Rs. ${penaltyAmt}`,
        reference: `ignore_penalty:${Date.now()}`,
      });

      if (restrictEnabled) {
        await tx
          .update(usersTable)
          .set({ isRestricted: true, updatedAt: new Date() })
          .where(eq(usersTable.id, riderId));
        restricted = true;
      }
    }
  });

  if (dailyIgnores > limit) {
    const ignorePenaltyLang = await getUserLanguage(riderId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: riderId,
        title: restricted
          ? t("notifAccountRestricted", ignorePenaltyLang) + " ⚠️"
          : t("notifCancelPenalty", ignorePenaltyLang) + " ⚠️",
        body: restricted
          ? t("notifIgnoreRestrictedBody", ignorePenaltyLang)
              .replace("{count}", String(dailyIgnores))
              .replace("{limit}", String(limit))
              .replace("{amount}", String(penaltyAmt))
          : t("notifIgnorePenaltyBody", ignorePenaltyLang)
              .replace("{count}", String(dailyIgnores))
              .replace("{limit}", String(limit))
              .replace("{amount}", String(penaltyAmt)),
        type: "system",
        icon: "alert-circle-outline",
      })
      .catch((e: Error) => {
        logger.warn(
          { riderId, err: e.message },
          "[rider] ignore-penalty notification insert failed"
        );
      });
  } else if (dailyIgnores === limit) {
    const ignoreWarnLang = await getUserLanguage(riderId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId: riderId,
        title: t("notifCancelWarning", ignoreWarnLang) + " ⚠️",
        body: t("notifIgnoreWarningBody", ignoreWarnLang)
          .replace("{count}", String(dailyIgnores))
          .replace("{limit}", String(limit))
          .replace("{amount}", String(penaltyAmt)),
        type: "system",
        icon: "alert-circle-outline",
      })
      .catch((e: Error) => {
        logger.warn(
          { riderId, err: e.message },
          "[rider] ignore-warning notification insert failed"
        );
      });
  }

  return { dailyIgnores, penaltyApplied, restricted };
}

/* ── POST /rider/rides/:id/ignore — Rider ignores a ride request ── */
router.post("/rides/:id/ignore", async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const riderId = req.riderId!;
    const rideId = req.params["id"] as string;

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) {
      sendNotFound(res, "Ride not found");
      return;
    }
    if (!["searching", "bargaining"].includes(ride.status)) {
      sendValidationError(res, "Ride is no longer available");
      return;
    }

    const penalty = await handleIgnorePenalty(riderId);

    const ignoreBody = { rideId, ignorePenalty: penalty };
    storeIdempotency(req, 200, { success: true, data: ignoreBody });
    sendSuccess(res, ignoreBody);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/ignore-stats — Rider's ignore stats for today ── */
router.get("/ignore-stats", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const s = await getCachedSettings();
    const limit = parseInt(s["rider_ignore_limit_daily"] ?? "5", 10);
    const penaltyAmt = parseFloat(s["rider_ignore_penalty_amount"] ?? "30");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [countRow] = await db
      .select({ c: count() })
      .from(riderPenaltiesTable)
      .where(
        and(
          eq(riderPenaltiesTable.riderId, riderId),
          eq(riderPenaltiesTable.type, "ignore"),
          gte(riderPenaltiesTable.createdAt, today)
        )
      );

    sendSuccess(res, {
      dailyIgnores: countRow?.c ?? 0,
      dailyLimit: limit,
      penaltyAmount: penaltyAmt,
      remaining: Math.max(0, limit - (countRow?.c ?? 0)),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /rider/penalty-history — Rider's penalty history ── */
router.get("/penalty-history", async (req, res) => {
  try {
    const riderId = req.riderId!;
    const penalties = await db
      .select()
      .from(riderPenaltiesTable)
      .where(eq(riderPenaltiesTable.riderId, riderId))
      .orderBy(desc(riderPenaltiesTable.createdAt))
      .limit(50);
    const mapped = penalties.map((p) => ({
      ...p,
      amount: safeNum(p.amount),
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    }));
    const totalDeducted = mapped.reduce(
      (s, p) => s + (typeof p.amount === "number" ? p.amount : safeNum(p.amount)),
      0
    );
    sendSuccess(res, {
      penalties: mapped,
      total_deducted: parseFloat(totalDeducted.toFixed(2)),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

const sosSchema = z.object({
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  rideId: z.string().optional().nullable(),
});

/* ── POST /rider/sos — Rider SOS alert ── */
router.post("/sos", async (req, res) => {
  try {
    if (checkIdempotency(req, res)) return;
    const settings = await getCachedSettings();
    if ((settings["feature_sos"] ?? "on") !== "on") {
      sendError(res, "SOS feature is currently disabled", 503);
      return;
    }

    const parsed = sosSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message || "Invalid SOS data");
      return;
    }
    const riderId = req.riderId!;
    const riderUser = req.riderUser!;
    const { latitude, longitude, rideId } = parsed.data;

    const parsedLat = latitude ?? null;
    const parsedLng = longitude ?? null;

    const validCoords =
      parsedLat != null &&
      parsedLng != null &&
      isFinite(parsedLat) &&
      isFinite(parsedLng) &&
      !(Math.abs(parsedLat) < 0.001 && Math.abs(parsedLng) < 0.001);

    const locationStr = validCoords
      ? ` · Location: ${parsedLat!.toFixed(5)},${parsedLng!.toFixed(5)}`
      : "";
    const rideStr = rideId ? ` · Ride: #${String(rideId).slice(-8).toUpperCase()}` : "";

    const alertId = generateId();
    const sosLang = await getUserLanguage(riderId);

    const now = new Date();
    const sosTitle = `🆘 ${t("sosAlert", sosLang)} — ${riderUser.name || "Unknown"} (rider)`;
    const sosBody = `Phone: ${riderUser.phone || "N/A"}${rideStr}${locationStr}`;
    const sosLink = rideId ? `/rides/${rideId}` : `/users/${riderId}`;

    try {
      await db.insert(notificationsTable).values({
        id: alertId,
        userId: riderId,
        title: sosTitle,
        body: sosBody,
        type: "sos",
        icon: "alert-circle-outline",
        link: sosLink,
        sosStatus: "pending",
      });
    } catch (err) {
      logger.error(
        "[rider] SOS notification insert failed — cannot persist SOS:",
        err instanceof Error ? err.message : err
      );
      sendError(res, "SOS alert could not be saved. Please call emergency contacts directly.", 503);
      return;
    }

    const { emitRiderSOS, emitSosNew } = await import("../../lib/socketio.js");

    /* Legacy relay event — keep for backward compat with existing fleet map listener */
    emitRiderSOS({
      userId: riderId,
      name: riderUser.name ?? "Rider",
      phone: riderUser.phone ?? null,
      latitude: validCoords ? parsedLat! : null,
      longitude: validCoords ? parsedLng! : null,
    });

    /* New lifecycle event — drives admin SOS alert panel and sidebar badge */
    emitSosNew({
      id: alertId,
      userId: riderId,
      title: sosTitle,
      body: sosBody,
      link: sosLink,
      sosStatus: "pending",
      acknowledgedAt: null,
      acknowledgedBy: null,
      acknowledgedByName: null,
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolutionNotes: null,
      createdAt: now.toISOString(),
    });

    const sosResponseBody = { alertId, sentAt: now.toISOString() };
    storeIdempotency(req, 200, { success: true, data: sosResponseBody });
    sendSuccess(res, sosResponseBody);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

const osrmQuerySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLng: z.coerce.number().min(-180).max(180),
});

/* ── GET /rider/osrm-route — Fetch turn-by-turn directions from OSRM ── */
router.get("/osrm-route", async (req, res) => {
  try {
    const parsed = osrmQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(
        res,
        parsed.error.issues[0]?.message ||
          "fromLat, fromLng, toLat, toLng required (valid coordinates)"
      );
      return;
    }
    const { fromLat, fromLng, toLat, toLng } = parsed.data;

    const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
    const osrmBase = process.env.OSRM_API_URL ?? "https://router.project-osrm.org";
    const osrmUrl = `${osrmBase}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&annotations=false`;

    /* Haversine fallback helper — straight-line distance when OSRM is unavailable */
    const haversineFallback = () => {
      const distanceKm = calcDistance(fromLat, fromLng, toLat, toLng);
      const durationMin = Math.round((distanceKm / 30) * 60); /* assume 30 km/h avg speed */
      sendSuccess(res, {
        fallback: true,
        distanceKm: Math.round(distanceKm * 10) / 10,
        durationMin,
      });
    };

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      let osrmResp: Awaited<ReturnType<typeof fetch>>;
      try {
        osrmResp = await fetch(osrmUrl, { signal: ctrl.signal });
      } catch (fetchErr: unknown) {
        clearTimeout(timeout);
        logger.warn(
          "[rider/osrm-route] OSRM unreachable, using Haversine fallback:",
          fetchErr instanceof Error ? fetchErr.message : fetchErr
        );
        haversineFallback();
        return;
      }
      clearTimeout(timeout);

      if (!osrmResp.ok) {
        /* Rate-limited or any other non-2xx: always return a usable fallback estimate
         rather than propagating the upstream error to the rider. */
        logger.warn(
          "[rider/osrm-route] OSRM returned non-200:",
          osrmResp.status,
          "— using Haversine fallback"
        );
        haversineFallback();
        return;
      }

      const data = (await osrmResp.json()) as {
        code: string;
        routes?: Array<{
          geometry: { coordinates: [number, number][] };
          legs: Array<{
            steps: Array<{
              maneuver: {
                instruction?: string;
                type: string;
                modifier?: string;
                location?: [number, number];
              };
              name: string;
              distance: number;
              duration: number;
            }>;
          }>;
          distance: number;
          duration: number;
        }>;
      };

      if (data.code !== "Ok" || !data.routes?.length) {
        logger.warn(
          "[rider/osrm-route] OSRM returned no route (code:",
          data.code,
          ") — using Haversine fallback"
        );
        haversineFallback();
        return;
      }

      const route = data.routes[0]!;
      const steps = route.legs.flatMap((leg) =>
        leg.steps.map((step) => ({
          instruction:
            step.maneuver.instruction ??
            `${step.maneuver.type}${step.maneuver.modifier ? ` ${step.maneuver.modifier}` : ""}`,
          streetName: step.name || "",
          distanceM: Math.round(step.distance),
          durationSec: Math.round(step.duration),
          /* Maneuver location so client can auto-advance steps as rider position updates */
          maneuverLat: step.maneuver.location?.[1] ?? null,
          maneuverLng: step.maneuver.location?.[0] ?? null,
        }))
      );

      sendSuccess(res, {
        distanceM: Math.round(route.distance),
        durationSec: Math.round(route.duration),
        geometry: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        steps,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Routing request failed";
      logger.warn("[rider/osrm-route] Unexpected error:", msg, "— using Haversine fallback");
      if (!res.headersSent) haversineFallback();
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

/* ── Rider AI Assistant ────────────────────────────────────────────────────────
   POST /rider/ai-chat
   Riders can ask questions about their work, earnings, app features, policies,
   etc. Uses Gemini with a rider-specific system prompt; falls back to smart
   templates when the API key is unavailable. */
const aiChatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

router.post("/ai-chat", async (req: Request, res: Response) => {
  try {
    const parse = aiChatSchema.safeParse(req.body);
    if (!parse.success) {
      sendError(res, "Invalid request", 400);
      return;
    }
    const { message, history = [] } = parse.data;

    try {
      const { generateAIContent } = await import("../../services/communicationAI.js");

      const RIDER_SYSTEM =
        "You are a helpful AI assistant for AJKMart rider partners in AJK, Pakistan. " +
        "You answer questions about deliveries, rides, earnings, wallet, policies, app features, and support. " +
        "Keep answers short (2-4 sentences), practical, and friendly. Respond in the same language as the question (Urdu or English).";

      const historyText = history
        .slice(-6)
        .map((h) => `${h.role === "user" ? "Rider" : "Assistant"}: ${h.content}`)
        .join("\n");

      const fullPrompt = historyText
        ? `${RIDER_SYSTEM}\n\nConversation so far:\n${historyText}\n\nRider: ${message}\nAssistant:`
        : `${RIDER_SYSTEM}\n\nRider: ${message}\nAssistant:`;

      const result = await generateAIContent(fullPrompt);
      sendSuccess(res, { reply: result.content, source: result.source });

      /* Fire a push notification to the requesting rider so they know the reply
       arrived if they navigated away from the AI Help tab.
       This is non-blocking — errors are swallowed so they never affect the
       response already sent above. Only sent to the exact rider who asked,
       preventing any cross-user leakage. */
      const riderId = req.riderId;
      if (riderId) {
        const preview =
          result.content.length > 80 ? result.content.slice(0, 80) + "…" : result.content;
        sendPushToUser(riderId, {
          title: "AI Assistant replied",
          body: preview,
          data: { type: "ai_chat" },
        }).catch((pushErr: unknown) => {
          logger.warn({ err: (pushErr as Error)?.message }, "[rider] ai-chat push failed");
        });
      }
    } catch (err) {
      logger.error({ err }, "rider ai-chat error");
      sendError(res, "Could not get AI response", 500);
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Internal server error", 500);
  }
});

export default router;
