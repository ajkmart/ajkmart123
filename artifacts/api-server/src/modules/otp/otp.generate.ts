import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { logger } from "../../lib/logger.js";
import { OTP_CONFIG } from "./otp.config.js";

function resolveHmacSecret(): string {
  const secret = process.env["HMAC_OTP_SECRET"] ?? process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error(
      "HMAC_OTP_SECRET (or JWT_SECRET fallback) is not set. " +
        "Set HMAC_OTP_SECRET in Replit Secrets."
    );
  }
  if (!process.env["HMAC_OTP_SECRET"] && process.env["JWT_SECRET"]) {
    logger.warn(
      "HMAC_OTP_SECRET not set — using JWT_SECRET as fallback. " +
        "Set a dedicated HMAC_OTP_SECRET in production."
    );
  }
  return secret;
}

export function generateOtpCode(length: number = OTP_CONFIG.CODE_LENGTH): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(randomInt(min, max + 1)).padStart(length, "0");
}

export function generateTripOtp(): string {
  return generateOtpCode(OTP_CONFIG.TRIP_CODE_LENGTH);
}

export function hashOtpCode(code: string): string {
  const secret = resolveHmacSecret();
  return createHmac("sha256", secret).update(code).digest("hex");
}

export function verifyOtpHash(code: string, storedHash: string): boolean {
  try {
    const incomingHash = hashOtpCode(code);
    const incomingBuf = Buffer.from(incomingHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (incomingBuf.length !== storedBuf.length) return false;
    return timingSafeEqual(incomingBuf, storedBuf);
  } catch {
    return false;
  }
}
