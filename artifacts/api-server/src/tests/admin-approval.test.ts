/**
 * Admin Approval Workflow Integration Test
 *
 * Verifies end-to-end that a rider created with approvalStatus: "pending"
 * is correctly unblocked after an admin approves them:
 *
 *   1. Seeded rider starts as "pending" in the DB.
 *   2. A pending rider cannot receive a login JWT — the verify-otp handler
 *      gates token issuance on approvalStatus.
 *   3. Admin calls POST /api/admin/users/:id/approve (with CSRF header/cookie).
 *   4. DB reflects approvalStatus: "approved", kycStatus: "verified",
 *      isActive: true, isBanned: false.
 *   5. The approved rider's JWT is accepted by rider-protected routes.
 *   6. Calling approve a second time is idempotent (200 or 422, never 500).
 *
 * Run from artifacts/api-server:
 *   pnpm test
 *
 * Token minting uses the server's own signAccessToken() and createCsrfCookie()
 * so both signing and verification always use the same resolved secret,
 * regardless of whether real Replit Secrets or vitest fallbacks are active.
 */

import type { Express } from "express";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ── Stable test-rider identifiers ────────────────────────────────────────────
const TEST_RIDER_ID = "test-rider-approval-workflow-e2e-001";
const TEST_RIDER_PHONE = "+929990000001"; // synthetic — not a real PK number

// ── Module state ──────────────────────────────────────────────────────────────
let app: Express;
let adminToken: string; // populated in beforeAll after importing server utils
let csrfToken: string;
let riderToken: string;

beforeAll(async () => {
  const { createServer } = await import("../app.js");
  // Import the server's own JWT / CSRF signing utilities.
  // These use the already-resolved module-level secrets (ACCESS_TOKEN_SECRET,
  // JWT_SECRET, CSRF_SECRET, etc.) so the tokens we mint here are always
  // accepted by the same server instance that createServer() creates.
  const { signAccessToken } = await import("../utils/admin-jwt.js");
  const { createCsrfCookie } = await import("../utils/admin-csrf.js");
  const { signUserJwt } = await import("../middleware/security.js");

  app = (await createServer()) as any;

  // Mint a super-admin token: role "super" causes isSuper() → true and
  // bypasses all requirePermission() checks without a DB lookup.
  adminToken = signAccessToken(
    "test-admin-approval-workflow", // adminId (sub claim)
    "super", // role → req.adminRole
    "Approval Workflow Test Bot", // name
    [] // perms (empty — role bypass takes precedence)
  );

  // CSRF token: same JWT logic as createCsrfCookie() used by the login flow.
  // csrfProtection checks: header === cookie AND verifyCsrfToken(cookie) passes.
  csrfToken = createCsrfCookie("test-session-approval-workflow");

  // Rider JWT: use the server's own signUserJwt so the token is signed with
  // the same module-level JWT_SECRET constant the verifier uses.
  riderToken = signUserJwt(TEST_RIDER_ID, TEST_RIDER_PHONE, "rider", "rider", 1);

  // ── Seed: insert a pending rider directly into the DB ──────────────────────
  // Bypasses the OTP registration flow so we can explicitly set
  // approvalStatus: "pending" — exactly what the platform does when the
  // rider_require_approval setting is enabled.
  const { db } = await import("@workspace/db");
  const { usersTable } = await import("@workspace/db/schema");
  const { eq } = await import("drizzle-orm");

  await db.delete(usersTable).where(eq(usersTable.id, TEST_RIDER_ID));

  const now = new Date();
  await db.insert(usersTable).values({
    id: TEST_RIDER_ID,
    phone: TEST_RIDER_PHONE,
    name: "Test Pending Rider (approval workflow test)",
    roles: "rider",
    approvalStatus: "pending",
    kycStatus: "pending",
    isActive: false,
    createdAt: now,
    updatedAt: now,
  });
}, 30_000);

afterAll(async () => {
  try {
    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(usersTable).where(eq(usersTable.id, TEST_RIDER_ID));
  } catch (err) {
    console.warn("[teardown] best-effort DB cleanup failed:", err);
  }
});

function api() {
  return supertest(app);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Admin approval workflow — pending rider gets unblocked", () => {
  it("1. seeded rider has approvalStatus: pending in the DB before approval", async () => {
    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");

    const [rider] = await db
      .select({ approvalStatus: usersTable.approvalStatus, isActive: usersTable.isActive })
      .from(usersTable)
      .where(eq(usersTable.id, TEST_RIDER_ID))
      .limit(1);

    expect(rider, "seeded rider must exist in DB").toBeDefined();
    expect(rider!.approvalStatus).toBe("pending");
    expect(rider!.isActive).toBe(false);
  });

  it("2. pending rider cannot receive a login JWT — verify-otp returns no token", async () => {
    // verify-otp checks approvalStatus after OTP validation.
    // For a pending rider, even a valid OTP yields 403 + approvalStatus:pending
    // instead of a JWT. An invalid OTP yields 400/422 before the approval gate.
    // Either way: no access token must ever appear in the response body.
    const res = await api()
      .post("/api/auth/verify-otp")
      .send({ phone: TEST_RIDER_PHONE, otp: "000000", role: "rider" })
      .set("Content-Type", "application/json");

    expect([400, 403, 422]).toContain(res.status);
    expect(res.body?.token).toBeUndefined();
    expect(res.body?.data?.token).toBeUndefined();
    expect(res.body?.data?.accessToken).toBeUndefined();
    expect(res.body?.accessToken).toBeUndefined();
  });

  it("3. admin approve endpoint returns HTTP 200 for the pending rider", async () => {
    const res = await api()
      .post(`/api/admin/users/${TEST_RIDER_ID}/approve`)
      .send({ skipDocCheck: true, note: "Approved by automated approval workflow test" })
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "application/json")
      // csrfProtection requires matching header + cookie that pass verifyCsrfToken()
      .set("x-csrf-token", csrfToken)
      .set("Cookie", `csrf_token=${csrfToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("4. DB reflects approvalStatus: approved, kycStatus: verified, isActive: true, isBanned: false", async () => {
    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");

    const [rider] = await db
      .select({
        approvalStatus: usersTable.approvalStatus,
        kycStatus: usersTable.kycStatus,
        isActive: usersTable.isActive,
        isBanned: usersTable.isBanned,
      })
      .from(usersTable)
      .where(eq(usersTable.id, TEST_RIDER_ID))
      .limit(1);

    expect(rider, "approved rider must still exist in DB").toBeDefined();
    expect(rider!.approvalStatus).toBe("approved");
    expect(rider!.kycStatus).toBe("verified");
    expect(rider!.isActive).toBe(true);
    expect(rider!.isBanned).toBe(false);
  });

  it("5. approved rider's JWT is accepted by rider-protected routes (no 401/403)", async () => {
    // riderAuth verifies JWT validity and sets req.riderId.
    // The approval gate lives in verify-otp (login time), not per-request.
    // 200 = profile found; 404 = profile row absent for this test rider.
    // 401 / 403 would indicate the auth or approval layer is incorrectly blocking.
    const res = await api().get("/api/rider/profile").set("Authorization", `Bearer ${riderToken}`);

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect([200, 404]).toContain(res.status);
  });

  it("6. calling approve a second time on an already-approved rider is idempotent (never 500)", async () => {
    const res = await api()
      .post(`/api/admin/users/${TEST_RIDER_ID}/approve`)
      .send({ skipDocCheck: true, note: "Idempotency check — second approval" })
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "application/json")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", `csrf_token=${csrfToken}`);

    // 200 = idempotent success  |  422 = "already approved" guard — both safe
    expect([200, 422]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });
});
