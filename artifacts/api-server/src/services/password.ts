import bcrypt from "bcryptjs";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { logger } from "../lib/logger.js";

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = scryptSync(password, salt, KEY_LENGTH);
    const storedBuf = Buffer.from(hash, "hex");
    if (derived.length !== storedBuf.length) return false;
    return timingSafeEqual(derived, storedBuf);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return false;
  }
}

export function validatePasswordStrength(password: string): { ok: boolean; message: string } {
  if (password.length > 128)
    return { ok: false, message: "Password must not exceed 128 characters" };
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters" };
  if (!/[A-Z]/.test(password))
    return { ok: false, message: "Password must contain at least 1 uppercase letter" };
  if (!/[0-9]/.test(password))
    return { ok: false, message: "Password must contain at least 1 number" };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password))
    return {
      ok: false,
      message: "Password must contain at least 1 special character (e.g. !@#$%^&*)",
    };
  return { ok: true, message: "ok" };
}

const BCRYPT_ROUNDS = 12;
const BCRYPT_PREFIX = "$2b$";

/** Hash a sub-admin secret with bcrypt (cost factor 12) */
export function hashAdminSecret(secret: string): string {
  return bcrypt.hashSync(secret, BCRYPT_ROUNDS);
}

/** Verify a sub-admin secret against a bcrypt or legacy scrypt hash.
 *  Plaintext fallback is intentionally removed — all admin secrets must be hashed. */
export function verifyAdminSecret(secret: string, stored: string): boolean {
  if (stored.startsWith(BCRYPT_PREFIX)) {
    return bcrypt.compareSync(secret, stored);
  }
  if (stored.includes(":")) {
    return verifyPassword(secret, stored);
  }
  return false;
}

/** Cryptographically secure 6-digit OTP — never use Math.random() for auth codes */
export function generateSecureOtp(): string {
  return randomInt(100_000, 1_000_000).toString();
}

/* ── Fail-fast secret resolution ── */
function resolveRequiredSecret(envKey: string, fallbackEnvKey?: string): string {
  const val = process.env[envKey] ?? (fallbackEnvKey ? process.env[fallbackEnvKey] : undefined);
  if (!val) {
    const keys = fallbackEnvKey ? `${envKey} (or ${fallbackEnvKey})` : envKey;
    throw new Error(
      `[FATAL] ${keys} environment variable is not set. ` +
        `This secret is required for cryptographic operations. Set it before starting the server.`
    );
  }
  return val;
}

function warnTokenHashSecretOnce(): void {
  if (!process.env["TOKEN_HASH_SECRET"] && process.env["JWT_SECRET"]) {
    logger.warn(
      "TOKEN_HASH_SECRET not set — using JWT_SECRET as fallback. Set a dedicated secret in production."
    );
  }
}
warnTokenHashSecretOnce();

/* Simple hash for token generation (magic links, email verification) */
export function makeTokenHash(value: string): string {
  const secret = process.env["TOKEN_HASH_SECRET"] ?? resolveRequiredSecret("JWT_SECRET");
  return createHash("sha256")
    .update(value + secret)
    .digest("hex")
    .slice(0, 32);
}

const TOTP_ALGO = "aes-256-gcm" as const;
const TOTP_IV_LEN = 12;
const _TOTP_TAG_LEN = 16;

function getTotpEncryptionKey(): Buffer {
  const raw = resolveRequiredSecret("TOTP_ENCRYPTION_KEY", "JWT_SECRET");
  return scryptSync(raw, "totp-salt", 32);
}

export function encryptTotpSecret(plainSecret: string): string {
  const key = getTotpEncryptionKey();
  const iv = randomBytes(TOTP_IV_LEN);
  const cipher = createCipheriv(TOTP_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptTotpSecret(encryptedSecret: string): string {
  const parts = encryptedSecret.split(":");
  if (parts.length !== 3) {
    logger.error(
      { timestamp: new Date().toISOString() },
      "TOTP secret format invalid — expected encrypted 3-part value"
    );
    throw new Error("TOTP secret format invalid — expected encrypted 3-part value");
  }
  try {
    const key = getTotpEncryptionKey();
    const iv = Buffer.from(parts[0]!, "hex");
    const tag = Buffer.from(parts[1]!, "hex");
    const encrypted = Buffer.from(parts[2]!, "hex");
    const decipher = createDecipheriv(TOTP_ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[totp] decryptTotpSecret failed — TOTP misconfiguration or wrong encryption key"
    );
    throw new Error(
      "TOTP_DECRYPT_FAILED: Unable to decrypt TOTP secret. Check TOTP_ENCRYPTION_KEY configuration."
    );
  }
}

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

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    const timeStep = 30;
    const now = Math.floor(Date.now() / 1000);
    const window = 1;

    const decodedSecret = base32Decode(secret);

    for (let i = -window; i <= window; i++) {
      const counter = Math.floor(now / timeStep) + i;
      const counterBuf = Buffer.alloc(8);
      counterBuf.writeUInt32BE(0, 0);
      counterBuf.writeUInt32BE(counter, 4);

      const hmac = createHmac("sha1", decodedSecret);
      hmac.update(counterBuf);
      const hmacResult: Buffer = hmac.digest();

      const offset = hmacResult[hmacResult.length - 1]! & 0x0f;
      const truncated =
        ((hmacResult[offset]! & 0x7f) << 24) |
        ((hmacResult[offset + 1]! & 0xff) << 16) |
        ((hmacResult[offset + 2]! & 0xff) << 8) |
        (hmacResult[offset + 3]! & 0xff);
      const otp = (truncated % 1_000_000).toString().padStart(6, "0");

      if (timingSafeEqual(Buffer.from(otp), Buffer.from(code))) {
        return true;
      }
    }
    return false;
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return false;
  }
}
