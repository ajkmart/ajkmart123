/**
 * TOTP (Time-based One-Time Password) service — RFC 6238.
 * Pure Node.js implementation using built-in `crypto` — no external dep.
 *
 * Generates 6-digit codes with a 30-second window.
 * Compatible with Google Authenticator, Authy, and any RFC 6238 app.
 */

import crypto from "crypto";

const APP_NAME = "AJKMart";

const ENCRYPTION_ALGO = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const raw = process.env["TOTP_ENCRYPTION_KEY"] ?? process.env["JWT_SECRET"] ?? "";
  return crypto.createHash("sha256").update(raw).digest();
}

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
      "TOTP_DECRYPT_FAILED: Invalid TOTP secret format — expected 3-part encrypted value. Check TOTP_ENCRYPTION_KEY configuration."
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
      `TOTP_DECRYPT_FAILED: Unable to decrypt TOTP secret — ${err instanceof Error ? err.message : String(err)}. Check TOTP_ENCRYPTION_KEY configuration.`
    );
  }
}

/* ── Base32 alphabet (RFC 4648) ── */
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

/* ── HOTP core ── */
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

/* ── TOTP (30-second window) ── */
function totpCode(secret: string, atMs = Date.now()): string {
  return hotp(secret, Math.floor(atMs / 30_000));
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Verify token — allows 1 step drift in either direction (±30s) */
export function verifyTotpToken(token: string, secret: string): boolean {
  const now = Date.now();
  for (const offset of [-1, 0, 1]) {
    if (totpCode(secret, now + offset * 30_000) === token) return true;
  }
  return false;
}

export async function generateQRCodeDataURL(secret: string, adminName: string): Promise<string> {
  const uri = getTotpUri(secret, adminName);
  /* Import qrcode only at runtime to avoid build issues */
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(uri);
}

export function getTotpUri(secret: string, adminName: string): string {
  const label = encodeURIComponent(`${APP_NAME}:${adminName}`);
  const issuer = encodeURIComponent(APP_NAME);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/* ── Generic alias for QR code generation ── */
export const generateTotpQr = generateQRCodeDataURL;
