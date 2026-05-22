/**
 * Unit tests — acquireWalletIdempotency
 *
 * Tests the four main branching scenarios of the idempotency helper:
 *  1. Fresh key → INSERT succeeds → acquired
 *  2. In-flight key → INSERT conflicts, SELECT returns responseData="{}" → in_flight
 *  3. Completed key → INSERT conflicts, SELECT returns stored response → replay
 *  4. Race: key deleted between INSERT and SELECT → retry INSERT succeeds → acquired
 *  5. Full race: retry INSERT also conflicts → in_flight
 *
 * Uses vi.hoisted + vi.mock to intercept @workspace/db before module load, so the
 * wallet module's acquireWalletIdempotency uses the mocked DB connection.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mock ───────────────────────────────────────────────────────────────────
// vi.hoisted runs before vi.mock (and before imports), making these functions
// available inside the mock factory closure.
const { mockInsertReturning, mockSelectLimit, mockDeleteWhere } = vi.hoisted(() => ({
  mockInsertReturning: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockDeleteWhere: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: mockInsertReturning,
    })),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: mockSelectLimit,
    })),
    delete: vi.fn(() => ({
      where: mockDeleteWhere,
    })),
  },
}));

import { acquireWalletIdempotency } from "../../routes/wallet.js";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("acquireWalletIdempotency", () => {
  const USER_ID = "user_unit_test_123";
  const PREFIX = "deposit";
  const RAW_KEY = "idem-key-abc-001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  // ── Scenario 1: Fresh key — INSERT succeeds ─────────────────────────────

  it("returns acquired=true when INSERT succeeds (new key)", async () => {
    mockInsertReturning.mockResolvedValueOnce([{ id: "row-1" }]);

    const result = await acquireWalletIdempotency(USER_ID, PREFIX, RAW_KEY);

    expect(result).toEqual({ acquired: true });
  });

  // ── Scenario 2: In-flight — INSERT conflicts, responseData is "{}" ──────

  it("returns action=in_flight when existing key has empty responseData", async () => {
    mockInsertReturning.mockResolvedValueOnce([]); // INSERT conflict
    mockSelectLimit.mockResolvedValueOnce([
      {
        id: "row-1",
        userId: USER_ID,
        idempotencyKey: `${PREFIX}:${RAW_KEY}`,
        responseData: "{}", // still in-flight
        createdAt: new Date(), // within TTL
      },
    ]);

    const result = await acquireWalletIdempotency(USER_ID, PREFIX, RAW_KEY);

    expect(result).toEqual({ acquired: false, action: "in_flight" });
  });

  // ── Scenario 3: Replay — INSERT conflicts, stored response present ────────

  it("returns action=replay with stored body and statusCode when key has a completed response", async () => {
    const storedBody = { success: true, message: "Deposit submitted" };
    const storedPayload = JSON.stringify({ _sc: 200, ...storedBody });

    mockInsertReturning.mockResolvedValueOnce([]); // INSERT conflict
    mockSelectLimit.mockResolvedValueOnce([
      {
        id: "row-1",
        userId: USER_ID,
        idempotencyKey: `${PREFIX}:${RAW_KEY}`,
        responseData: storedPayload,
        createdAt: new Date(),
      },
    ]);

    const result = await acquireWalletIdempotency(USER_ID, PREFIX, RAW_KEY);

    expect(result.acquired).toBe(false);
    if (!result.acquired) {
      expect(result.action).toBe("replay");
      expect(result.statusCode).toBe(200);
      const body = result.body as Record<string, unknown>;
      expect(body["success"]).toBe(true);
      expect(body["message"]).toBe("Deposit submitted");
      expect(body["_sc"]).toBeUndefined(); // _sc must be stripped from the replay body
    }
  });

  // ── Scenario 4: Race — key deleted between INSERT and SELECT ─────────────

  it("retries INSERT and returns acquired=true when key was deleted between INSERT and SELECT", async () => {
    mockInsertReturning.mockResolvedValueOnce([]); // first INSERT conflicts
    mockSelectLimit.mockResolvedValueOnce([]); // SELECT finds nothing (deleted)
    mockInsertReturning.mockResolvedValueOnce([{ id: "row-2" }]); // retry INSERT succeeds

    const result = await acquireWalletIdempotency(USER_ID, PREFIX, RAW_KEY);

    expect(result).toEqual({ acquired: true });
  });

  // ── Scenario 5: Full race — retry INSERT also conflicts ───────────────────

  it("returns action=in_flight when retry INSERT also conflicts (concurrent request wins the race)", async () => {
    mockInsertReturning.mockResolvedValueOnce([]); // first INSERT conflicts
    mockSelectLimit.mockResolvedValueOnce([]); // SELECT finds nothing
    mockInsertReturning.mockResolvedValueOnce([]); // retry INSERT also conflicts

    const result = await acquireWalletIdempotency(USER_ID, PREFIX, RAW_KEY);

    expect(result).toEqual({ acquired: false, action: "in_flight" });
  });
});
