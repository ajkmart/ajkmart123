import crypto from "crypto";

/**
 * Hash a token for secure storage in database
 * Never store raw tokens in the database
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a token against its stored hash
 */
export function verifyTokenHash(token: string, hash: string): boolean {
  const tokenHash = hashToken(token);
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
}

/**
 * Generate a secure random bytes string
 */
export function generateSecureRandom(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}
