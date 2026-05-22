import { randomBytes } from "crypto";

/**
 * Base-62 alphabet: digits + uppercase + lowercase.
 * URL-safe, case-sensitive, no special characters.
 */
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function toBase62(n: bigint): string {
  if (n === 0n) return "0";
  let result = "";
  const base = BigInt(BASE62.length);
  while (n > 0n) {
    result = BASE62[Number(n % base)]! + result;
    n = n / base;
  }
  return result;
}

/**
 * Generates a cryptographically random, URL-safe, collision-resistant ID.
 *
 * Properties:
 *  - 128 bits of entropy (16 random bytes from crypto.randomBytes)
 *  - Base-62 encoded → 22 characters, always padded to exact length
 *  - No timestamp component — IDs are fully opaque and unpredictable
 *  - Compatible with all existing DB columns (TEXT primary keys)
 *  - URL-safe: only [0-9A-Za-z] characters
 *
 * Example output: "0000K8Hs3mXPqVzJ7rNyWc"
 *
 * Collision probability for 1 billion IDs: ~9.4 × 10⁻²⁰ (negligible).
 */
export function generateId(): string {
  const bytes = randomBytes(16);
  const bigInt = BigInt("0x" + bytes.toString("hex"));
  return toBase62(bigInt).padStart(22, "0");
}
