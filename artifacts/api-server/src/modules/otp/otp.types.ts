export type OtpChannel = "sms" | "whatsapp" | "email" | "console";

export type OtpType = "login" | "register" | "reset" | "merge" | "trip";

export type OtpIdentifierType = "phone" | "email";

export interface OtpSendOptions {
  identifier: string;
  identifierType: OtpIdentifierType;
  otpType: OtpType;
  userId?: string;
  channel?: OtpChannel;
  ipAddress?: string;
  deviceFingerprint?: string;
}

export interface OtpVerifyOptions {
  identifier: string;
  identifierType: OtpIdentifierType;
  otpType: OtpType;
  code: string;
  ipAddress?: string;
  deviceFingerprint?: string;
}

export interface OtpSendResult {
  success: true;
  otpRequired: boolean;
  channel?: OtpChannel;
  expiresAt?: Date;
  resendAfter?: number;
  devCode?: string;
}

export interface OtpVerifyResult {
  success: true;
  userId?: string;
  isNewUser: boolean;
}

export interface OtpAttemptStatus {
  blocked: boolean;
  attemptsLeft: number;
  unlocksAt?: Date;
}

export class OtpDeliveryError extends Error {
  readonly channel: OtpChannel;
  readonly provider?: string;

  constructor(message: string, channel: OtpChannel, provider?: string) {
    super(message);
    this.name = "OtpDeliveryError";
    this.channel = channel;
    this.provider = provider;
  }
}

export class OtpRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "OtpRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class OtpBlockedError extends Error {
  readonly unlocksAt: Date;

  constructor(message: string, unlocksAt: Date) {
    super(message);
    this.name = "OtpBlockedError";
    this.unlocksAt = unlocksAt;
  }
}

export class OtpInvalidError extends Error {
  readonly attemptsLeft: number;

  constructor(message: string, attemptsLeft: number) {
    super(message);
    this.name = "OtpInvalidError";
    this.attemptsLeft = attemptsLeft;
  }
}

export class OtpExpiredError extends Error {
  constructor() {
    super("OTP has expired. Please request a new one.");
    this.name = "OtpExpiredError";
  }
}

export class OtpAlreadyUsedError extends Error {
  constructor() {
    super("OTP has already been used.");
    this.name = "OtpAlreadyUsedError";
  }
}
