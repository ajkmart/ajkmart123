/**
 * Integration tests — POST /api/locations/batch (B-020: GPS timestamp clamping)
 *
 * Strategy:
 *  - Each test creates its own fresh rider to avoid the distance-threshold
 *    filter suppressing repeated pings at identical coordinates.
 *  - The batch route returns `updatedAt` = the clamped `now` value (line 739 of
 *    locations.ts: `lastUpdatedAt = now.toISOString()` where `now = new Date(clampedTs)`).
 *    This field is directly asserted for clamping/pass-through behaviour.
 *  - DB row counts in `location_history` verify storage vs skip behaviour.
 *    The insert is fire-and-forget so a 150 ms settle period is used.
 *
 * Three timestamp branches covered:
 *   1. Future timestamps → clamped to now (response updatedAt ≤ now, NOT in future)
 *   2. Stale timestamps (>24h old) → skipped=1, NOT stored in DB
 *   3. Valid same-day timestamps → pass through unchanged (response updatedAt ≈ provided ts)
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted before all imports) ────────────────────────────────────────
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

// Socket.io broadcast is a no-op in tests — no real socket server running
vi.mock("../../../lib/socketio.js", () => ({
  emitRiderLocation: vi.fn(),
  emitCustomerLocation: vi.fn(),
  emitRideOtp: vi.fn(),
  emitRideUpdate: vi.fn(),
  getIO: vi.fn().mockReturnValue(null),
}));

// ── Imports ────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import { locationHistoryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createServer } from "../../../app.js";
import { signAccessToken } from "../../../middleware/security.js";
import {
  createTestUser,
  deleteTestUser,
  generateTestPhone,
  seedPlatformSetting,
  toCanonicalPhone,
} from "../helpers/db-helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Wait for the fire-and-forget location_history insert to settle. */
const settle = () => new Promise<void>((r) => setTimeout(r, 150));

/** Count location_history rows for a given userId. */
async function countHistoryRows(userId: string): Promise<number> {
  const rows = await db
    .select({ id: locationHistoryTable.id })
    .from(locationHistoryTable)
    .where(eq(locationHistoryTable.userId, userId));
  return rows.length;
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("POST /api/locations/batch — GPS timestamp clamping (B-020)", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createServer();
    // Enable GPS tracking (required for rider batch uploads)
    await seedPlatformSetting("security_gps_tracking", "on", "GPS Tracking", "security");
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => undefined);
    }
  });

  /** Create a fresh rider and return its ID + auth token. Each test gets its own
   *  rider so the distance-threshold filter never suppresses first-ever pings. */
  async function createFreshRider(): Promise<{ id: string; token: string }> {
    const phone = toCanonicalPhone(generateTestPhone());
    const id = await createTestUser({
      phone,
      phoneVerified: true,
      roles: "rider",
      approvalStatus: "approved",
    });
    createdUserIds.push(id);
    const token = signAccessToken(id, phone, "rider", "rider");
    return { id, token };
  }

  /** A minimal valid GPS ping at Muzaffarabad coordinates. */
  function makePing(overrides: Record<string, unknown> = {}) {
    return {
      latitude: "34.3700",
      longitude: "73.4718",
      accuracy: "10",
      ...overrides,
    };
  }

  // ── Future timestamps: clamped to now in response updatedAt ───────────────
  //
  // The batch handler computes: clampedTs = Math.min(rawTs, nowMs)
  // Then sets: lastUpdatedAt = new Date(clampedTs).toISOString()
  // The response `updatedAt` field carries this clamped value directly.

  it("clamps a future timestamp to now in the response updatedAt (not 1 hour ahead)", async () => {
    const { id, token } = await createFreshRider();
    const beforeSendMs = Date.now();
    const futureTimestamp = new Date(beforeSendMs + 60 * 60 * 1000).toISOString(); // +1 hour

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [makePing({ timestamp: futureTimestamp })] });

    const afterSendMs = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.processed).toBe(1);
    expect(res.body.skipped).toBe(0);

    // Core assertion: updatedAt must be clamped — never 1 hour in the future
    const returnedMs = new Date(res.body.updatedAt as string).getTime();
    expect(returnedMs).toBeGreaterThanOrEqual(beforeSendMs - 1000); // at least as early as just before we sent
    expect(returnedMs).toBeLessThanOrEqual(afterSendMs + 2000); // no more than a couple seconds after response

    // DB row IS stored (ping was processed after clamping)
    await settle();
    expect(await countHistoryRows(id)).toBe(1);
  });

  it("clamps a ping 1 second in the future to current time in updatedAt", async () => {
    const { id, token } = await createFreshRider();
    const beforeSendMs = Date.now();
    const justFuture = new Date(beforeSendMs + 1000).toISOString(); // +1 second

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [makePing({ timestamp: justFuture })] });

    const afterSendMs = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(1);
    expect(res.body.skipped).toBe(0);

    const returnedMs = new Date(res.body.updatedAt as string).getTime();
    // Clamped: the 1-second-future timestamp must be brought back to ≤ now
    expect(returnedMs).toBeLessThanOrEqual(afterSendMs + 2000);
    // And it must be near now, not in the distant past
    expect(returnedMs).toBeGreaterThanOrEqual(beforeSendMs - 1000);

    await settle();
    expect(await countHistoryRows(id)).toBe(1);
  });

  // ── Stale pings: skipped AND not stored ───────────────────────────────────

  it("skips a ping older than 24 hours and does NOT store it in location_history", async () => {
    const { id, token } = await createFreshRider();
    const staleTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 h ago

    const beforeCount = await countHistoryRows(id);

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [makePing({ timestamp: staleTimestamp })] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.processed).toBe(0);
    expect(res.body.skipped).toBe(1);

    // No row should be inserted — stale pings are rejected before processLocationUpdate
    await settle();
    expect(await countHistoryRows(id)).toBe(beforeCount);
  });

  it("skips a ping just over the 24-hour boundary and does NOT store it", async () => {
    const { id, token } = await createFreshRider();
    const overBoundary = new Date(Date.now() - (24 * 60 * 60 * 1000 + 1000)).toISOString();

    const beforeCount = await countHistoryRows(id);

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [makePing({ timestamp: overBoundary })] });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(res.body.skipped).toBe(1);

    await settle();
    expect(await countHistoryRows(id)).toBe(beforeCount);
  });

  it("skips a far-past timestamp (year 2000) and does NOT store it", async () => {
    const { id, token } = await createFreshRider();
    const farPast = new Date("2000-01-01T00:00:00Z").toISOString();

    const beforeCount = await countHistoryRows(id);

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [makePing({ timestamp: farPast })] });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(res.body.skipped).toBe(1);

    await settle();
    expect(await countHistoryRows(id)).toBe(beforeCount);
  });

  // ── Valid same-day timestamps: pass through unchanged in updatedAt ─────────
  //
  // For valid timestamps, clampedTs = rawTs (no clamping), so:
  //   lastUpdatedAt = new Date(rawTs).toISOString() ≈ the timestamp we sent

  it("passes a valid 5-minute-old timestamp through unchanged in response updatedAt", async () => {
    const { id, token } = await createFreshRider();
    const fiveMinAgoMs = Date.now() - 5 * 60 * 1000;
    const recentTimestamp = new Date(fiveMinAgoMs).toISOString();

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [makePing({ timestamp: recentTimestamp })] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.processed).toBe(1);
    expect(res.body.skipped).toBe(0);

    // updatedAt should reflect the provided timestamp (±5 s tolerance for processing time)
    const returnedMs = new Date(res.body.updatedAt as string).getTime();
    expect(returnedMs).toBeGreaterThanOrEqual(fiveMinAgoMs - 5000);
    expect(returnedMs).toBeLessThanOrEqual(fiveMinAgoMs + 5000);

    // A timestamp 5 minutes ago is NOT near "now" — verify it wasn't incorrectly clamped
    expect(returnedMs).toBeLessThan(Date.now() - 60_000); // at least 1 min behind now

    await settle();
    expect(await countHistoryRows(id)).toBe(1);
  });

  it("passes a valid 1-hour-old timestamp through unchanged in response updatedAt", async () => {
    const { id, token } = await createFreshRider();
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
    const oneHourAgoTs = new Date(oneHourAgoMs).toISOString();

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [makePing({ timestamp: oneHourAgoTs })] });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(1);
    expect(res.body.skipped).toBe(0);

    // Response updatedAt should equal the provided timestamp (±5 s)
    const returnedMs = new Date(res.body.updatedAt as string).getTime();
    expect(returnedMs).toBeGreaterThanOrEqual(oneHourAgoMs - 5000);
    expect(returnedMs).toBeLessThanOrEqual(oneHourAgoMs + 5000);

    await settle();
    expect(await countHistoryRows(id)).toBe(1);
  });

  it("uses current time when no timestamp is provided (defaults to now)", async () => {
    const { id, token } = await createFreshRider();
    const beforeSendMs = Date.now();

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [makePing()] }); // no timestamp key

    const afterSendMs = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(1);
    expect(res.body.skipped).toBe(0);

    const returnedMs = new Date(res.body.updatedAt as string).getTime();
    expect(returnedMs).toBeGreaterThanOrEqual(beforeSendMs - 1000);
    expect(returnedMs).toBeLessThanOrEqual(afterSendMs + 2000);

    await settle();
    expect(await countHistoryRows(id)).toBe(1);
  });

  // ── Mixed batch: valid + stale + future ───────────────────────────────────

  it("correctly splits a mixed batch and only stores valid/future pings", async () => {
    const { id, token } = await createFreshRider();

    const validTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago (valid)
    const staleTimestamp = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30 h ago (skip)
    const futureTimestamp = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2 h (clamp → process)

    const beforeCount = await countHistoryRows(id);

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({
        pings: [
          // Different final coordinates so consecutive valid pings aren't distance-filtered
          makePing({ latitude: "34.3700", longitude: "73.4718", timestamp: validTimestamp }),
          makePing({ latitude: "34.3700", longitude: "73.4718", timestamp: staleTimestamp }),
          makePing({ latitude: "34.4500", longitude: "73.5500", timestamp: futureTimestamp }),
        ],
      });

    const afterSendMs = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 2 processed (valid + clamped-future), 1 skipped (stale)
    expect(res.body.processed).toBe(2);
    expect(res.body.skipped).toBe(1);

    // updatedAt is set to the LAST valid ping's clamped time — the clamped future ping
    // was processed last (batch is sorted chronologically, so future → last after sort).
    // After clamping, it should be near now, not 2h ahead.
    const returnedMs = new Date(res.body.updatedAt as string).getTime();
    expect(returnedMs).toBeLessThanOrEqual(afterSendMs + 2000);

    // Only the 2 processed pings are stored
    await settle();
    expect(await countHistoryRows(id)).toBe(beforeCount + 2);
  });

  // ── Invalid coordinates: skipped regardless of timestamp ─────────────────

  it("skips pings with out-of-range coordinates and does not store them", async () => {
    const { id, token } = await createFreshRider();

    const beforeCount = await countHistoryRows(id);

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({
        pings: [
          { latitude: "999", longitude: "73.4718" }, // latitude > 90
          { latitude: "34.37", longitude: "200" }, // longitude > 180
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(res.body.skipped).toBe(2);

    await settle();
    expect(await countHistoryRows(id)).toBe(beforeCount);
  });

  // ── Auth guards ───────────────────────────────────────────────────────────

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(app)
      .post("/api/locations/batch")
      .send({ pings: [makePing()] });

    expect(res.status).toBe(401);
  });

  it("returns 400 when pings array is empty", async () => {
    const { token } = await createFreshRider();

    const res = await request(app)
      .post("/api/locations/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({ pings: [] });

    expect(res.status).toBe(400);
  });
});
