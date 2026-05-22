import type { OtpChannel } from "./otp.types.js";

export const OTP_CONFIG = {
  CODE_LENGTH: 6,

  TRIP_CODE_LENGTH: 4,

  TTL_MS: 5 * 60 * 1000,

  MAX_ATTEMPTS: 5,

  LOCKOUT_DURATION_MS: 15 * 60 * 1000,

  MAX_SEND_PER_HOUR: 5,

  RESEND_COOLDOWN_MS: 60 * 1000,

  CHANNEL_PRIORITY: ["whatsapp", "sms", "email"] as OtpChannel[],

  CLEANUP_USED_AFTER_MS: 24 * 60 * 60 * 1000,
} as const;
