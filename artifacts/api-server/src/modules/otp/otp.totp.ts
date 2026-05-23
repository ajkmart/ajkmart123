/**
 * otp.totp.ts — TOTP/2FA module (RFC 6238).
 *
 * Pure Node.js implementation — no external dependency for TOTP math.
 * Compatible with Google Authenticator, Authy, and any RFC 6238 app.
 *
 * Consolidated from artifacts/api-server/src/services/totp.ts.
 * New additions: generateRecoveryCodes(), verifyRecoveryCode().
 */

import { db } from "@workspace/db";
import { totpRecoveryCodesTable, userTotpSetupTable } from "@workspace/db/schema";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { hashPassword, verifyPassword } from "../../services/password.js";

const APP_NAME = "AJKMart";
const ENCRYPTION_ALGO = "aes-256-gcm";
const RECOVERY_CODE_COUNT = 8;

// ─── Encryption Key ─────────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw = process.env["TOTP_ENCRYPTION_KEY"];
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[FATAL] TOTP_ENCRYPTION_KEY must be set in production. " +
          "This secret is used to encrypt TOTP secrets and must not fall back to JWT_SECRET. " +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    logger.warn(
      "[totp] TOTP_ENCRYPTION_KEY not set — using JWT_SECRET as fallback. " +
        "This is NOT safe for production. " +
        "Set a dedicated TOTP_ENCRYPTION_KEY before deploying."
    );
    const fallback = process.env["JWT_SECRET"];
    if (!fallback) {
      throw new Error(
        "TOTP_ENCRYPTION_KEY is not set. Set it in Replit Secrets. " +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    return crypto.createHash("sha256").update(fallback).digest();
  }
  return crypto.createHash("sha256").update(raw).digest();
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────────────────

export function encryptTotpSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decryptTotpSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "TOTP_DECRYPT_FAILED: Invalid encrypted secret format. " +
        "Check TOTP_ENCRYPTION_KEY configuration."
    );
  }
  const [ivHex, tagHex, encrypted] = parts;
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, Buffer.from(ivHex!, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex!, "hex"));
    let decrypted = decipher.update(encrypted!, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    throw new Error(
      `TOTP_DECRYPT_FAILED: ${err instanceof Error ? err.message : String(err)}. ` +
        "Check TOTP_ENCRYPTION_KEY configuration."
    );
  }
}

// ─── Base32 (RFC 4648) ─────────────────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0,
    value = 0,
    output = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ─── HOTP / TOTP Core ──────────────────────────────────────────────────────────

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[19]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function totpCode(secret: string, atMs = Date.now()): string {
  return hotp(secret, Math.floor(atMs / 30_000));
}

// ─── Public: Secret Generation ────────────────────────────────────────────────

export function generateTotpSecret(): { secret: string; encryptedSecret: string } {
  const secret = base32Encode(crypto.randomBytes(20));
  const encryptedSecret = encryptTotpSecret(secret);
  return { secret, encryptedSecret };
}

// ─── Public: Verification ─────────────────────────────────────────────────────

/**
 * Verify a 6-digit TOTP token.
 * Accepts ±1 time-step (±30 seconds) drift for clock skew.
 *
 * @param token           - 6-digit code from authenticator app
 * @param encryptedSecret - AES-GCM encrypted secret from DB
 */
export function verifyTotpToken(token: string, encryptedSecret: string): boolean {
  try {
    const secret = decryptTotpSecret(encryptedSecret);
    const now = Date.now();
    for (const offset of [-1, 0, 1]) {
      if (totpCode(secret, now + offset * 30_000) === token.trim()) return true;
    }
    return false;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "[totp] verifyTotpToken failed"
    );
    return false;
  }
}

// ─── Public: QR Code ──────────────────────────────────────────────────────────

export function getTotpUri(secret: string, accountName: string, issuer = APP_NAME): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const iss = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}

export async function generateQrCodeDataUrl(secret: string, accountName: string): Promise<string> {
  const uri = getTotpUri(secret, accountName);
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(uri);
}

// ─── Public: Pending Setup (temp storage before activation) ───────────────────

export async function savePendingTotpSecret(
  userId: string,
  encryptedSecret: string
): Promise<void> {
  // Delete any prior pending entry (idempotent)
  await db.delete(userTotpSetupTable).where(eq(userTotpSetupTable.userId, userId));
  await db.insert(userTotpSetupTable).values({
    id: generateId(),
    userId,
    secret: decryptTotpSecret(encryptedSecret),
    encryptedSecret,
  });
}

export async function getPendingTotpSecret(
  userId: string
): Promise<{ secret: string; encryptedSecret: string } | null> {
  const rows = await db
    .select()
    .from(userTotpSetupTable)
    .where(eq(userTotpSetupTable.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { secret: row.secret, encryptedSecret: row.encryptedSecret };
}

export async function deletePendingTotpSecret(userId: string): Promise<void> {
  await db.delete(userTotpSetupTable).where(eq(userTotpSetupTable.userId, userId));
}

// ─── Public: Recovery Codes ───────────────────────────────────────────────────

export interface RecoveryCodeSet {
  plainCodes: string[];
}

/**
 * Generate 8 single-use recovery codes, hash them, and store in DB.
 * Previous codes for the user are deleted first (idempotent re-enrollment).
 *
 * Returns plain-text codes — shown to user ONCE, never again.
 * Format: 8-character hex string (e.g. "a3f8c201")
 */
export async function generateRecoveryCodes(userId: string): Promise<RecoveryCodeSet> {
  const plainCodes: string[] = [];
  const rows: { id: string; userId: string; codeHash: string }[] = [];

  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = crypto.randomBytes(4).toString("hex"); // 8 hex chars
    plainCodes.push(raw);
    rows.push({ id: generateId(), userId, codeHash: hashPassword(raw) });
  }

  // Delete stale codes first (re-enrollment is idempotent)
  await db.delete(totpRecoveryCodesTable).where(eq(totpRecoveryCodesTable.userId, userId));
  await db.insert(totpRecoveryCodesTable).values(rows);

  logger.info({ userId, count: RECOVERY_CODE_COUNT }, "[totp] Recovery codes generated");

  return { plainCodes };
}

/**
 * Verify a recovery code against all unused stored hashes.
 * On match: marks that code as used (single-use).
 * Returns true if valid, false otherwise.
 */
export async function verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
  const unused = await db
    .select()
    .from(totpRecoveryCodesTable)
    .where(eq(totpRecoveryCodesTable.userId, userId));

  const unusedCodes = unused.filter((row) => row.usedAt == null);

  for (const row of unusedCodes) {
    const match = verifyPassword(code.trim(), row.codeHash);
    if (match) {
      // Mark this code as used — single-use guarantee
      await db
        .update(totpRecoveryCodesTable)
        .set({ usedAt: new Date() })
        .where(eq(totpRecoveryCodesTable.id, row.id));

      logger.info({ userId, codeId: row.id }, "[totp] Recovery code used");
      return true;
    }
  }

  return false;
}

/**
 * Count how many unused recovery codes a user still has.
 */
export async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  const rows = await db
    .select()
    .from(totpRecoveryCodesTable)
    .where(eq(totpRecoveryCodesTable.userId, userId));

  return rows.filter((r) => !r.usedAt).length;
}
