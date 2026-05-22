/**
 * Unit tests — wallet validation schemas
 *
 * Tests depositSchema, sendSchema, withdrawSchema from routes/wallet.ts.
 * acquireWalletIdempotency requires real DB access and is covered via the
 * integration tests in src/__tests__/integration/wallet/.
 */

import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { depositSchema, sendSchema, withdrawSchema } from "../../routes/wallet.js";

// ── depositSchema ─────────────────────────────────────────────────────────────

describe("depositSchema", () => {
  const validBase = {
    amount: 500,
    paymentMethod: "jazzcash",
    transactionId: "TXN-12345",
    idempotencyKey: randomUUID(),
  };

  it("accepts a valid deposit payload", () => {
    const result = depositSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(500);
      expect(result.data.paymentMethod).toBe("jazzcash");
    }
  });

  it("accepts optional accountNumber and note", () => {
    const result = depositSchema.safeParse({
      ...validBase,
      accountNumber: "03001234567",
      note: "Test deposit",
    });
    expect(result.success).toBe(true);
  });

  it("accepts string amount and coerces to number", () => {
    const result = depositSchema.safeParse({ ...validBase, amount: "250" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe(250);
  });

  it("rejects negative amount", () => {
    const result = depositSchema.safeParse({ ...validBase, amount: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = depositSchema.safeParse({ ...validBase, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects amount with more than 2 decimal places", () => {
    const result = depositSchema.safeParse({ ...validBase, amount: 100.001 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/2 decimal/);
  });

  it("accepts amount with exactly 2 decimal places", () => {
    const result = depositSchema.safeParse({ ...validBase, amount: 100.99 });
    expect(result.success).toBe(true);
  });

  it("rejects missing transactionId", () => {
    const { transactionId: _t, ...rest } = validBase;
    const result = depositSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty transactionId", () => {
    const result = depositSchema.safeParse({ ...validBase, transactionId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing idempotencyKey", () => {
    const { idempotencyKey: _k, ...rest } = validBase;
    const result = depositSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID idempotencyKey", () => {
    const result = depositSchema.safeParse({ ...validBase, idempotencyKey: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/UUID/);
  });

  it("rejects paymentMethod with uppercase letters", () => {
    const result = depositSchema.safeParse({ ...validBase, paymentMethod: "JazzCash" });
    expect(result.success).toBe(false);
  });

  it("rejects empty paymentMethod", () => {
    const result = depositSchema.safeParse({ ...validBase, paymentMethod: "" });
    expect(result.success).toBe(false);
  });

  it("rejects note exceeding 200 characters", () => {
    const result = depositSchema.safeParse({ ...validBase, note: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("accepts note at exactly 200 characters", () => {
    const result = depositSchema.safeParse({ ...validBase, note: "x".repeat(200) });
    expect(result.success).toBe(true);
  });
});

// ── sendSchema ───────────────────────────────────────────────────────────────

describe("sendSchema", () => {
  const validWithPhone = {
    receiverPhone: "03001234567",
    amount: 100,
  };

  const validWithAjkId = {
    ajkId: "AJK-ABC123",
    amount: 200,
  };

  it("accepts valid payload with receiverPhone", () => {
    const result = sendSchema.safeParse(validWithPhone);
    expect(result.success).toBe(true);
  });

  it("accepts valid payload with ajkId", () => {
    const result = sendSchema.safeParse(validWithAjkId);
    expect(result.success).toBe(true);
  });

  it("accepts both receiverPhone and ajkId (prefers phone on receiver resolution)", () => {
    const result = sendSchema.safeParse({ ...validWithPhone, ajkId: "AJK-XYZ" });
    expect(result.success).toBe(true);
  });

  it("rejects payload with neither receiverPhone nor ajkId", () => {
    const result = sendSchema.safeParse({ amount: 100 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/receiverPhone or ajkId/);
  });

  it("rejects negative amount", () => {
    const result = sendSchema.safeParse({ ...validWithPhone, amount: -50 });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = sendSchema.safeParse({ ...validWithPhone, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects amount with more than 2 decimal places", () => {
    const result = sendSchema.safeParse({ ...validWithPhone, amount: 99.999 });
    expect(result.success).toBe(false);
  });

  it("accepts note up to 200 characters", () => {
    const result = sendSchema.safeParse({ ...validWithPhone, note: "x".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("rejects note exceeding 200 characters", () => {
    const result = sendSchema.safeParse({ ...validWithPhone, note: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("accepts string amount and coerces to number", () => {
    const result = sendSchema.safeParse({ ...validWithPhone, amount: "150.50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe(150.5);
  });
});

// ── withdrawSchema ────────────────────────────────────────────────────────────

describe("withdrawSchema", () => {
  const validBase = {
    amount: 500,
    paymentMethod: "bank",
    accountNumber: "PK36SCBL0000001123456702",
  };

  it("accepts a valid withdrawal payload", () => {
    const result = withdrawSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts optional note", () => {
    const result = withdrawSchema.safeParse({ ...validBase, note: "Payout to bank" });
    expect(result.success).toBe(true);
  });

  it("rejects negative amount", () => {
    const result = withdrawSchema.safeParse({ ...validBase, amount: -200 });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = withdrawSchema.safeParse({ ...validBase, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects amount with more than 2 decimal places", () => {
    const result = withdrawSchema.safeParse({ ...validBase, amount: 100.123 });
    expect(result.success).toBe(false);
  });

  it("rejects missing accountNumber", () => {
    const { accountNumber: _a, ...rest } = validBase;
    const result = withdrawSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty accountNumber", () => {
    const result = withdrawSchema.safeParse({ ...validBase, accountNumber: "" });
    expect(result.success).toBe(false);
  });

  it("rejects paymentMethod with special characters", () => {
    const result = withdrawSchema.safeParse({ ...validBase, paymentMethod: "bank-transfer" });
    expect(result.success).toBe(false);
  });

  it("accepts easypaisa as paymentMethod", () => {
    const result = withdrawSchema.safeParse({ ...validBase, paymentMethod: "easypaisa" });
    expect(result.success).toBe(true);
  });

  it("rejects note exceeding 200 characters", () => {
    const result = withdrawSchema.safeParse({ ...validBase, note: "y".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("coerces string amount to number", () => {
    const result = withdrawSchema.safeParse({ ...validBase, amount: "750" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe(750);
  });
});
