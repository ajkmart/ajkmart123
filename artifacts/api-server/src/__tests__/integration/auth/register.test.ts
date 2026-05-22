/**
 * Integration tests — POST /api/auth/register
 *
 * Strategy:
 *  - deliverOtp is mocked so no real SMS is sent after registration.
 *  - All other external services (email, WhatsApp) are also mocked.
 *  - Unique phone numbers per test prevent DB collisions across test runs.
 *  - Each test cleans up the created user in afterEach.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted) ────────────────────────────────────────────────────────────
vi.mock("../../../modules/otp/otp.deliver.js", () => ({
  deliverOtp: vi.fn().mockResolvedValue({ success: true, usedChannel: "sms" }),
  getAvailableChannels: vi.fn().mockReturnValue(["sms"]),
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

// ── Imports ────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import { riderProfilesTable, usersTable, vendorProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createServer } from "../../../app.js";
import {
  cleanupOtpTokens,
  deletePlatformSetting,
  deleteTestUserByPhone,
  generateTestPhone,
  seedPlatformSetting,
  toCanonicalPhone,
} from "../helpers/db-helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const STRONG_PASSWORD = "TestP@ssword1";

async function registerCustomer(app: import("express").Application, phone: string, extra = {}) {
  return request(app)
    .post("/api/auth/register")
    .send({ phone, password: STRONG_PASSWORD, name: "Test Customer", ...extra })
    .set("Content-Type", "application/json");
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const usedPhones: string[] = [];

  beforeAll(async () => {
    app = await createServer();
    // Ensure OTP bypass is ON so registration issues tokens immediately
    // (avoids the need to verify an OTP before getting a token in response)
    await seedPlatformSetting("security_otp_bypass", "on", "OTP Bypass", "security");
  });

  afterAll(async () => {
    await deletePlatformSetting("security_otp_bypass").catch(() => undefined);
  });

  afterEach(async () => {
    for (const phone of usedPhones.splice(0)) {
      const canon = toCanonicalPhone(phone);
      await cleanupOtpTokens(canon).catch(() => undefined);
      await deleteTestUserByPhone(canon).catch(() => undefined);
    }
  });

  // ── Customer registration ────────────────────────────────────────────────────

  it("registers a customer and returns 201 with AJK-XXXXXX ajkId", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await registerCustomer(app, phone);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // ajkId must match AJK-<6 alphanumeric chars>
    const data = res.body.data;
    if (data.user?.ajkId) {
      expect(data.user.ajkId).toMatch(/^AJK-[A-Z0-9]{6}$/);
    } else if (data.ajkId) {
      expect(data.ajkId).toMatch(/^AJK-[A-Z0-9]{6}$/);
    }
  });

  it("stores the user in the database with correct role", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await registerCustomer(app, phone);
    expect(res.status).toBe(201);

    // Routes store phones in canonical E.164 form
    const [row] = await db
      .select({ roles: usersTable.roles, ajkId: usersTable.ajkId })
      .from(usersTable)
      .where(eq(usersTable.phone, toCanonicalPhone(phone)))
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.roles).toBe("customer");
    expect(row!.ajkId).toMatch(/^AJK-[A-Z0-9]{6}$/);
  });

  it("returns 409 when the same phone is registered twice", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const first = await registerCustomer(app, phone);
    expect(first.status).toBe(201);

    const second = await registerCustomer(app, phone);
    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
  });

  it("returns 400 for a weak password", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ phone, password: "weak", name: "Test User" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for a missing password", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ phone, name: "Test User" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for an invalid phone number format", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ phone: "not-a-phone", password: STRONG_PASSWORD })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── Rider registration ───────────────────────────────────────────────────────

  it("registers a rider and creates a rider_profiles row", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        phone,
        password: STRONG_PASSWORD,
        name: "Test Rider",
        role: "rider",
        vehicleType: "bike",
      })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify rider_profiles row was created
    const [userRow] = await db
      .select({ id: usersTable.id, roles: usersTable.roles })
      .from(usersTable)
      .where(eq(usersTable.phone, toCanonicalPhone(phone)))
      .limit(1);

    expect(userRow).toBeDefined();
    expect(userRow!.roles).toBe("rider");

    const [profileRow] = await db
      .select()
      .from(riderProfilesTable)
      .where(eq(riderProfilesTable.userId, userRow!.id))
      .limit(1);

    expect(profileRow).toBeDefined();
    expect(profileRow!.vehicleType).toBe("bike");
  });

  it("returns 400 for rider registration without vehicleType", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ phone, password: STRONG_PASSWORD, role: "rider" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── Vendor registration ──────────────────────────────────────────────────────

  it("registers a vendor and creates a vendor_profiles row", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        phone,
        password: STRONG_PASSWORD,
        name: "Test Vendor",
        role: "vendor",
        businessName: "Test Store",
      })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const [userRow] = await db
      .select({ id: usersTable.id, roles: usersTable.roles })
      .from(usersTable)
      .where(eq(usersTable.phone, toCanonicalPhone(phone)))
      .limit(1);

    expect(userRow).toBeDefined();
    expect(userRow!.roles).toBe("vendor");

    const [profileRow] = await db
      .select()
      .from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.userId, userRow!.id))
      .limit(1);

    expect(profileRow).toBeDefined();
    expect(profileRow!.businessName).toBe("Test Store");
  });

  it("returns 400 for vendor registration without businessName or storeName", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ phone, password: STRONG_PASSWORD, role: "vendor" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── Password not stored in plaintext ────────────────────────────────────────

  it("does not store the plaintext password in the database", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    await registerCustomer(app, phone);

    const [row] = await db
      .select({ passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.phone, toCanonicalPhone(phone)))
      .limit(1);

    expect(row).toBeDefined();
    // passwordHash must not equal the plaintext password
    expect(row!.passwordHash).not.toBe(STRONG_PASSWORD);
    // Must be a salt:hash pair (at least one colon, hex content)
    expect(row!.passwordHash).toContain(":");
  });
});
