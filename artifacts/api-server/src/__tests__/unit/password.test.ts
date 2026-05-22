import { describe, expect, it } from "vitest";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateSecureOtp,
  hashAdminSecret,
  hashPassword,
  makeTokenHash,
  validatePasswordStrength,
  verifyAdminSecret,
  verifyPassword,
  verifyTotpCode,
} from "../../services/password.js";

describe("hashPassword", () => {
  it("returns a hash in salt:hash format", () => {
    const h = hashPassword("secret123");
    expect(h).toContain(":");
    const [salt, hash] = h.split(":");
    expect(salt).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(hash).toHaveLength(128); // 64 bytes = 128 hex chars
  });

  it("returns different hashes for same password", () => {
    const a = hashPassword("secret123");
    const b = hashPassword("secret123");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", () => {
    const stored = hashPassword("correct");
    expect(verifyPassword("correct", stored)).toBe(true);
  });

  it("returns false for wrong password", () => {
    const stored = hashPassword("correct");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("returns false for invalid stored format", () => {
    expect(verifyPassword("x", "nocolon")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });

  it("returns false on corrupted stored value", () => {
    const stored = "1234567890abcdef:GGGGGG"; // G not valid hex
    expect(verifyPassword("x", stored)).toBe(false);
  });
});

describe("validatePasswordStrength", () => {
  it("rejects password < 8 chars", () => {
    const r = validatePasswordStrength("Ab1!");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/at least 8/);
  });

  it("rejects password without uppercase", () => {
    const r = validatePasswordStrength("lowercase1!");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/uppercase/);
  });

  it("rejects password without number", () => {
    const r = validatePasswordStrength("NoNumber!");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/number/);
  });

  it("rejects password without special character", () => {
    const r = validatePasswordStrength("NoSpecial1");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/special/);
  });

  it("rejects password > 128 chars", () => {
    const r = validatePasswordStrength("A1!" + "x".repeat(130));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/128/);
  });

  it("accepts strong password", () => {
    const r = validatePasswordStrength("StrongPass123!");
    expect(r.ok).toBe(true);
    expect(r.message).toBe("ok");
  });
});

describe("generateSecureOtp", () => {
  it("returns 6 digits", () => {
    const otp = generateSecureOtp();
    expect(otp).toHaveLength(6);
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("is always a numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateSecureOtp();
      expect(Number.isNaN(Number(otp))).toBe(false);
      expect(otp).toMatch(/^\d{6}$/);
    }
  });

  it("generates varying values", () => {
    const otps = new Set<string>();
    for (let i = 0; i < 50; i++) otps.add(generateSecureOtp());
    // 50 random 6-digit values — collisions possible but extremely unlikely
    expect(otps.size).toBeGreaterThan(30);
  });
});

describe("hashAdminSecret", () => {
  it("returns bcrypt hash with $2b$ prefix", () => {
    const h = hashAdminSecret("admin-secret");
    expect(h).toMatch(/^\$2b\$/);
    expect(h).toHaveLength(60);
  });
});

describe("verifyAdminSecret", () => {
  it("verifies bcrypt hash", () => {
    const h = hashAdminSecret("admin-secret");
    expect(verifyAdminSecret("admin-secret", h)).toBe(true);
    expect(verifyAdminSecret("wrong", h)).toBe(false);
  });

  it("verifies legacy scrypt hash", () => {
    const h = hashPassword("legacy");
    expect(verifyAdminSecret("legacy", h)).toBe(true);
    expect(verifyAdminSecret("wrong", h)).toBe(false);
  });

  it("returns false for unhashed/unknown format", () => {
    expect(verifyAdminSecret("x", "nohash")).toBe(false);
    expect(verifyAdminSecret("x", "")).toBe(false);
  });
});

describe("makeTokenHash", () => {
  it("is deterministic (same input → same output)", () => {
    const a = makeTokenHash("same-token");
    const b = makeTokenHash("same-token");
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
    expect(a).toMatch(/^[a-f0-9]+$/);
  });

  it("is different for different inputs", () => {
    const a = makeTokenHash("token-a");
    const b = makeTokenHash("token-b");
    expect(a).not.toBe(b);
  });
});

describe("TOTP encryption", () => {
  it("encryptTotpSecret produces 3-part colon-separated string", () => {
    const secret = "JBSWY3DPEHPK3PXP"; // base32 test secret
    const encrypted = encryptTotpSecret(secret);
    const parts = encrypted.split(":");
    expect(parts.length).toBe(3);
    expect(parts[0]).toMatch(/^[a-f0-9]+$/); // IV
    expect(parts[1]).toMatch(/^[a-f0-9]+$/); // auth tag
    expect(parts[2]).toMatch(/^[a-f0-9]+$/); // ciphertext
  });

  it("decryptTotpSecret recovers original secret", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret);
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("decryptTotpSecret throws on invalid format", () => {
    expect(() => decryptTotpSecret("bad-format")).toThrow("format invalid");
  });
});

describe("verifyTotpCode", () => {
  it("validates a correct TOTP code", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const code = generateCurrentTotpCode(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects wrong code", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });
});

// ─── Helper: generate current TOTP code for testing ───
import { createHmac } from "crypto";
function base32Decode(encoded: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = encoded.replace(/[=\s]/g, "").toUpperCase();
  let bits = "";
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}
function generateCurrentTotpCode(secret: string): string {
  const timeStep = 30;
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / timeStep);
  const decoded = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(0, 0);
  counterBuf.writeUInt32BE(counter, 4);
  const hmac = createHmac("sha1", decoded);
  hmac.update(counterBuf);
  const hmacResult = hmac.digest();
  const offset = hmacResult[hmacResult.length - 1]! & 0x0f;
  const truncated =
    ((hmacResult[offset]! & 0x7f) << 24) |
    ((hmacResult[offset + 1]! & 0xff) << 16) |
    ((hmacResult[offset + 2]! & 0xff) << 8) |
    (hmacResult[offset + 3]! & 0xff);
  return (truncated % 1_000_000).toString().padStart(6, "0");
}
