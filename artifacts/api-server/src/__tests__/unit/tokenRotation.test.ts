import type { refreshTokensTable } from "@workspace/db/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBreachNotificationEmail,
  detectAndInvalidateFamily,
  invalidateTokenFamily,
  rotateRefreshToken,
  TokenFamilyBreachError,
} from "../../services/auth/tokenRotation.js";

/* ──────────────────────────────────────────────────────────────────────
 * ALL mocks are declared inside vi.mock() factory functions.
 * Nothing is referenced from the top-level scope, so hoisting
 * never tries to use a variable before it is initialized.
 * ────────────────────────────────────────────────────────────────────────────── */

vi.mock("@workspace/db", () => {
  const updateBuilder = () => ({
    set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
  });
  const insertBuilder = () => ({
    values: vi.fn(() => Promise.resolve([])),
  });
  const selectBuilder = (rows: unknown[] = []) => {
    const b = {
      from: vi.fn(() => b),
      where: vi.fn(() => b),
      limit: vi.fn(() => Promise.resolve(rows)),
    };
    return b;
  };

  const db = {
    update: vi.fn(() => updateBuilder()),
    insert: vi.fn(() => insertBuilder()),
    select: vi.fn(() => selectBuilder([])),
    /* expose builders so tests can reset mocks */
    _updateBuilder: updateBuilder,
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
  };
  return { db };
});

vi.mock("../../middleware/security.js", () => ({
  signAccessToken: vi.fn().mockReturnValue("mock-access-token"),
  generateRefreshToken: vi.fn().mockReturnValue({ raw: "mock-raw", hash: "mock-hash" }),
  addSecurityEvent: vi.fn(),
  getRefreshTokenTtlDays: vi.fn().mockReturnValue(7),
  getAccessTokenTtlSec: vi.fn().mockReturnValue(900),
  writeAuthAuditLog: vi.fn(),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function makeOldToken(
  overrides?: Partial<typeof refreshTokensTable.$inferSelect>
): typeof refreshTokensTable.$inferSelect {
  return {
    id: "rt-1",
    userId: "u-1",
    tokenHash: "old-hash",
    tokenFamilyId: "fam-1",
    authMethod: "password",
    revoked: false,
    revokedAt: null,
    revokedReason: null,
    usedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  } as unknown as typeof refreshTokensTable.$inferSelect;
}

function makeUser() {
  return {
    id: "u-1",
    phone: "+923001234567",
    roles: "customer",
    tokenVersion: 1,
  };
}

describe("rotateRefreshToken", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@workspace/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = db as any;
    d.update.mockImplementation(() => d._updateBuilder());
    d.insert.mockImplementation(() => d._insertBuilder());
  });

  it("returns new access token, refresh token, and new hash", async () => {
    const result = await rotateRefreshToken(makeOldToken(), makeUser(), "192.168.1.1");

    expect(result.accessToken).toBe("mock-access-token");
    expect(result.refreshToken).toBe("mock-raw");
    expect(result.newRefreshHash).toBe("mock-hash");
    expect(result.expiresAt).toBeTruthy();
  });
});

describe("invalidateTokenFamily", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@workspace/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = db as any;
    d.update.mockImplementation(() => d._updateBuilder());
  });

  it("revokes all tokens in a family", async () => {
    await invalidateTokenFamily("fam-1", "u-1", "SECURITY_BREACH", "192.168.1.1");
    const { db } = await import("@workspace/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((db as any).update).toHaveBeenCalled();
  });

  it("no-ops when familyId is empty", async () => {
    await invalidateTokenFamily("", "u-1", "TEST", "ip");
    const { db } = await import("@workspace/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((db as any).update).not.toHaveBeenCalled();
  });
});

describe("detectAndInvalidateFamily", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@workspace/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = db as any;
    d.select.mockImplementation(() => d._selectBuilder([]));
    d.update.mockImplementation(() => d._updateBuilder());
  });

  it("stamps usedAt on first use", async () => {
    const { db } = await import("@workspace/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = db as any;
    d.select.mockImplementationOnce(() =>
      d._selectBuilder([makeOldToken({ usedAt: null, tokenFamilyId: "fam-1" })])
    );

    const result = await detectAndInvalidateFamily("old-hash");

    expect(result.tokenHash).toBe("old-hash");
    expect(result.tokenFamilyId).toBe("fam-1");
  });

  it("detects replay and throws TokenFamilyBreachError", async () => {
    const { db } = await import("@workspace/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = db as any;
    d.select.mockImplementationOnce(() =>
      d._selectBuilder([makeOldToken({ usedAt: new Date(), tokenFamilyId: "fam-breach" })])
    );

    await expect(detectAndInvalidateFamily("old-hash")).rejects.toBeInstanceOf(
      TokenFamilyBreachError
    );
  });
});

describe("buildBreachNotificationEmail", () => {
  it("includes user name in greeting when provided", () => {
    const html = buildBreachNotificationEmail({
      userName: "Ali",
      appName: "AJKMart",
      detectedAt: "2026-05-21T04:00:00Z",
      familyId: "fam-1",
    });
    expect(html).toContain("Hello Ali");
    expect(html).toContain("Security Alert");
    expect(html).toContain("fam-1");
  });

  it("omits name in greeting when null", () => {
    const html = buildBreachNotificationEmail({
      userName: null,
      appName: "AJKMart",
      detectedAt: "2026-05-21T04:00:00Z",
      familyId: "fam-2",
    });
    expect(html).toContain("Hello,");
    expect(html).not.toContain("Hello null");
  });
});
