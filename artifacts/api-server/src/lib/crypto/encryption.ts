/**
 * AES-256-GCM encryption utility for PII fields.
 *
 * encrypt() / decrypt() use Node's built-in `crypto` module.
 * The master key is read from ENCRYPTION_MASTER_KEY env var.
 *
 * Output format (hex): <12-byte iv><16-byte auth tag><ciphertext>
 * All components are hex-encoded and concatenated, so the result is
 * a plain hex string safe to store in a TEXT/BYTEA column.
 *
 * Key derivation: PBKDF2-HMAC-SHA256 with a fixed app-level salt
 * (stretches short or uneven keys to exactly 256 bits).
 */

import crypto from "crypto";
import { logger } from "../logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12; // 96-bit IV — GCM recommended
const TAG_LEN = 16; // 128-bit auth tag
const KEY_ITERS = 100_000;
const SALT = Buffer.from("ajkmart-pii-salt-v1", "utf-8");

let _cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const masterKey = process.env["ENCRYPTION_MASTER_KEY"];
  if (!masterKey || masterKey.length < 16) {
    throw new Error(
      "[encryption] ENCRYPTION_MASTER_KEY is not set or too short (minimum 16 chars). " +
        "Add this secret in the Replit Secrets panel."
    );
  }

  _cachedKey = crypto.pbkdf2Sync(Buffer.from(masterKey, "utf-8"), SALT, KEY_ITERS, 32, "sha256");
  return _cachedKey;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a hex string: <iv><authTag><ciphertext>
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LEN });

  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf-8")), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

/**
 * Decrypt a hex-encoded ciphertext produced by encrypt().
 * Throws if the data is tampered or the key is wrong (GCM auth tag mismatch).
 */
export function decrypt(ciphertext: string): string {
  const key = deriveKey();
  const buf = Buffer.from(ciphertext, "hex");

  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("[encryption] Ciphertext is too short — data may be corrupt");
  }

  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf-8");
}

/** Returns true when ENCRYPTION_MASTER_KEY is configured and usable. */
export function isEncryptionAvailable(): boolean {
  try {
    deriveKey();
    return true;
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
