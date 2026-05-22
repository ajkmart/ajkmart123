/**
 * Integration tests — POST /api/riders/rides/:id/verify-otp
 *
 * Strategy:
 *  - SMS/email providers are mocked so no real messages are sent.
 *  - Each test creates its own fresh customer user to avoid the
 *    rides_one_active_per_user_uidx unique constraint (one active ride per customer).
 *  - A shared rider user with a rider profile is created once in beforeAll.
 *  - All requests authenticate as the rider using a JWT.
 *  - Tests exercise: correct OTP, wrong OTP, already-verified ride, no OTP set,
 *    wrong ride owner, wrong status, missing body field, and unauthenticated.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted before all imports) ────────────────────────────────────────

// Bypass all rate limiters so the OTP limiter (5/min) doesn't interfere with
// the full test suite running sequentially under the same riderId.
vi.mock("express-rate-limit", () => ({
  default: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  rateLimit: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../../../services/sms.js", () => ({
  sendOtpSMS: vi.fn().mockResolvedValue({ success: true }),
  isSMSProviderConfigured: vi.fn().mockReturnValue(true),
  isSMSConsoleActive: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../services/smsGateway.js", () => ({
  sendOtpWithFailover: vi.fn().mockResolvedValue({ success: true }),
  getWhitelistBypass: vi.fn().mockReturnValue(null),
}));

vi.mock("../../../services/whatsapp.js", () => ({
  sendWhatsAppOTP: vi.fn().mockResolvedValue({ success: true }),
  isWhatsAppProviderConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../services/email.js", () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  alertNewVendor: vi.fn().mockResolvedValue(undefined),
  isEmailProviderConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../modules/otp/otp.deliver.js", () => ({
  deliverOtp: vi.fn().mockResolvedValue({ success: true, usedChannel: "sms" }),
  getAvailableChannels: vi.fn().mockReturnValue(["sms"]),
}));

// ── Imports ────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import { ridesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createServer } from "../../../app.js";
import { signAccessToken } from "../../../middleware/security.js";
import {
  cleanupRideOtpAttempts,
  createRiderProfile,
  createTestRide,
  createTestUser,
  deleteRide,
  deleteTestUser,
  generateTestPhone,
  toCanonicalPhone,
} from "../helpers/db-helpers.js";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("POST /api/riders/rides/:id/verify-otp", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];
  const createdRideIds: string[] = [];

  let riderPhone: string;
  let riderId: string;
  let riderToken: string;

  beforeAll(async () => {
    app = await createServer();

    riderPhone = toCanonicalPhone(generateTestPhone());
    riderId = await createTestUser({
      phone: riderPhone,
      phoneVerified: true,
      roles: "rider",
    });
    createdUserIds.push(riderId);
    await createRiderProfile(riderId, { vehicleType: "bike", vehiclePlate: "TEST-001" });
    riderToken = signAccessToken(riderId, riderPhone, "rider", "rider");
  });

  afterAll(async () => {
    for (const rideId of createdRideIds) {
      await cleanupRideOtpAttempts(rideId).catch(() => undefined);
      await deleteRide(rideId).catch(() => undefined);
    }
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => undefined);
    }
  });

  /** Create a fresh customer + a ride for that customer. Each test gets its own
   *  customer so the one-active-ride-per-user unique constraint is never violated. */
  async function seedCustomerAndRide(
    opts: {
      tripOtp?: string;
      otpVerified?: boolean;
      status?: string;
      assignRider?: boolean;
    } = {}
  ) {
    const customerPhone = toCanonicalPhone(generateTestPhone());
    const customerId = await createTestUser({
      phone: customerPhone,
      phoneVerified: true,
      roles: "customer",
    });
    createdUserIds.push(customerId);

    const rideId = await createTestRide({
      userId: customerId,
      riderId: opts.assignRider === false ? undefined : riderId,
      status: opts.status ?? "arrived",
      tripOtp: opts.tripOtp,
      otpVerified: opts.otpVerified ?? false,
    });
    createdRideIds.push(rideId);
    return { customerId, rideId };
  }

  // ── Correct OTP → success + otpVerified flag set ──────────────────────────

  it("returns 200 and sets otpVerified=true when correct OTP is submitted", async () => {
    const { rideId } = await seedCustomerAndRide({ tripOtp: "7777" });

    const res = await request(app)
      .post(`/api/riders/rides/${rideId}/verify-otp`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ otp: "7777" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const [ride] = await db
      .select({ otpVerified: ridesTable.otpVerified })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .limit(1);
    expect(ride?.otpVerified).toBe(true);
  });

  // ── Wrong OTP → rejected with OTP_MISMATCH ────────────────────────────────

  it("returns 400 with OTP_MISMATCH code when wrong OTP is submitted", async () => {
    const { rideId } = await seedCustomerAndRide({ tripOtp: "5555" });

    const res = await request(app)
      .post(`/api/riders/rides/${rideId}/verify-otp`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ otp: "9999" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data?.code).toBe("OTP_MISMATCH");

    const [ride] = await db
      .select({ otpVerified: ridesTable.otpVerified })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .limit(1);
    expect(ride?.otpVerified).toBe(false);
  });

  // ── Already-verified OTP → idempotent success ─────────────────────────────

  it("returns 200 with 'already verified' message when OTP was already confirmed", async () => {
    const { rideId } = await seedCustomerAndRide({
      tripOtp: "4321",
      otpVerified: true,
    });

    const res = await request(app)
      .post(`/api/riders/rides/${rideId}/verify-otp`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ otp: "4321" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/already verified/i);
  });

  // ── No OTP set on ride → validation error ─────────────────────────────────

  it("returns 400 when the ride has no tripOtp set", async () => {
    const { rideId } = await seedCustomerAndRide({ tripOtp: undefined });

    const res = await request(app)
      .post(`/api/riders/rides/${rideId}/verify-otp`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ otp: "1234" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/[Nn]o OTP/);
  });

  // ── Wrong ride owner → ride not found ────────────────────────────────────

  it("returns 404 when the ride belongs to a different rider", async () => {
    const otherRiderPhone = toCanonicalPhone(generateTestPhone());
    const otherRiderId = await createTestUser({
      phone: otherRiderPhone,
      phoneVerified: true,
      roles: "rider",
    });
    createdUserIds.push(otherRiderId);
    await createRiderProfile(otherRiderId);

    const customerPhone = toCanonicalPhone(generateTestPhone());
    const customerId = await createTestUser({ phone: customerPhone, phoneVerified: true });
    createdUserIds.push(customerId);

    const rideId = await createTestRide({
      userId: customerId,
      riderId: otherRiderId,
      status: "arrived",
      tripOtp: "8888",
    });
    createdRideIds.push(rideId);

    // Primary rider (not the owner) attempts verify
    const res = await request(app)
      .post(`/api/riders/rides/${rideId}/verify-otp`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ otp: "8888" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // ── Wrong ride status → validation error ─────────────────────────────────

  it("returns 400 when ride is not in accepted/arrived status", async () => {
    const { rideId } = await seedCustomerAndRide({
      status: "searching",
      tripOtp: "6666",
    });

    const res = await request(app)
      .post(`/api/riders/rides/${rideId}/verify-otp`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({ otp: "6666" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/accepted|arrived/i);
  });

  // ── Missing OTP body field ────────────────────────────────────────────────

  it("returns 400 when otp field is missing from the request body", async () => {
    const { rideId } = await seedCustomerAndRide({ tripOtp: "1111" });

    const res = await request(app)
      .post(`/api/riders/rides/${rideId}/verify-otp`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── Unauthenticated ───────────────────────────────────────────────────────

  it("returns 401 for unauthenticated requests", async () => {
    const { rideId } = await seedCustomerAndRide({ tripOtp: "2222" });

    const res = await request(app)
      .post(`/api/riders/rides/${rideId}/verify-otp`)
      .send({ otp: "2222" });
    // No Authorization header

    expect(res.status).toBe(401);
  });
});
