import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSettings = {
  auth_phone_otp_enabled: "on",
  auth_email_otp_enabled: "on",
  auth_username_password_enabled: "on",
  auth_google_enabled: "off",
  auth_2fa_enabled: "on",
  auth_magic_link_enabled: "off",
  auth_facebook_enabled: "off",
  security_login_max_attempts: "5",
  security_lockout_minutes: "30",
  feature_new_users: "on",
  integration_whatsapp: "off",
};

const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};

const mockDb = {
  select: vi.fn().mockReturnValue(mockSelectChain),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  }),
  delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
};

vi.mock("@workspace/db", () => ({ db: mockDb }));
vi.mock("@workspace/db/schema", () => ({
  usersTable: {
    id: "id",
    phone: "phone",
    email: "email",
    username: "username",
    roles: "roles",
    isBanned: "isBanned",
    passwordHash: "passwordHash",
    totpEnabled: "totpEnabled",
    isActive: "isActive",
  },
  refreshTokensTable: {},
  pendingOtpsTable: {},
  rateLimitsTable: {},
  userSessionsTable: {},
  loginHistoryTable: {},
  vendorProfilesTable: {},
  riderProfilesTable: {},
  totpRecoveryCodesTable: {},
  userTotpSetupTable: {},
  magicLinkTokensTable: {},
  walletTransactionsTable: {},
  notificationsTable: {},
  accountRecoveryTokensTable: {},
}));
vi.mock("@workspace/phone-utils", () => ({
  canonicalizePhone: (p: string) => p.replace(/^0/, "+92"),
}));
vi.mock("@workspace/i18n", () => ({ t: (key: string) => key }));
vi.mock("@workspace/auth-utils/server", () => ({
  isAuthMethodEnabled: (settings: Record<string, string>, key: string) => settings[key] === "on",
  isAuthMethodEnabledStrict: (settings: Record<string, string>, key: string) =>
    settings[key] === "on",
}));
vi.mock("../../src/middleware/security.js", () => ({
  getCachedSettings: vi.fn().mockResolvedValue(mockSettings),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  addSecurityEvent: vi.fn(),
  addAuditEntry: vi.fn(),
  checkLockout: vi.fn().mockResolvedValue({ locked: false }),
  recordFailedAttempt: vi.fn(),
  resetAttempts: vi.fn(),
  signUserJwt: vi.fn().mockReturnValue("mock_access_token"),
  signAccessToken: vi.fn().mockReturnValue("mock_access_token"),
  verifyUserJwt: vi.fn().mockReturnValue(null),
  generateRefreshToken: vi.fn().mockReturnValue("mock_refresh_token"),
  hashRefreshToken: vi.fn().mockReturnValue("hashed_refresh"),
  isRefreshTokenValid: vi.fn().mockResolvedValue(null),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  revokeAllUserRefreshTokens: vi.fn().mockResolvedValue(undefined),
  blacklistJti: vi.fn().mockResolvedValue(undefined),
  writeAuthAuditLog: vi.fn(),
  getRefreshTokenTtlDays: vi.fn().mockReturnValue(7),
  getAccessTokenTtlSec: vi.fn().mockReturnValue(900),
  verifyCaptcha: (_req: unknown, _res: unknown, next: () => void) => next(),
  checkAvailableRateLimit: vi.fn().mockResolvedValue({ limited: false }),
  sign2faChallengeToken: vi.fn().mockReturnValue("mock_2fa_token"),
  verify2faChallengeToken: vi.fn().mockReturnValue(null),
}));
vi.mock("../../src/middleware/rate-limit.js", () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  loginLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  otpLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../src/middleware/validate.js", () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../src/services/sms.js", () => ({
  sendOtpSMS: vi.fn().mockResolvedValue({ sent: false }),
  isSMSProviderConfigured: vi.fn().mockReturnValue(false),
  isSMSConsoleActive: vi.fn().mockReturnValue(false),
}));
vi.mock("../../src/services/smsGateway.js", () => ({
  sendOtpWithFailover: vi.fn(),
  getWhitelistBypass: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../src/services/whatsapp.js", () => ({
  sendWhatsAppOTP: vi.fn(),
  isWhatsAppProviderConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("../../src/services/email.js", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendMagicLinkEmail: vi.fn(),
  alertNewVendor: vi.fn(),
  isEmailProviderConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("../../src/services/password.js", () => ({
  hashPassword: vi.fn().mockReturnValue("hashed"),
  verifyPassword: vi.fn().mockReturnValue(false),
  validatePasswordStrength: vi.fn().mockReturnValue({ ok: true }),
  generateSecureOtp: vi.fn().mockReturnValue("123456"),
  verifyTotpCode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../src/services/totp.js", () => ({
  generateTotpSecret: vi.fn(),
  verifyTotpToken: vi.fn(),
  generateQRCodeDataURL: vi.fn(),
  getTotpUri: vi.fn(),
  encryptTotpSecret: vi.fn(),
  decryptTotpSecret: vi.fn(),
}));
vi.mock("../../src/services/auth/tokenRotation.js", () => ({
  rotateRefreshToken: vi.fn().mockResolvedValue({ token: "new_refresh", record: {} }),
  invalidateTokenFamily: vi.fn().mockResolvedValue(undefined),
  detectAndInvalidateFamily: vi.fn().mockResolvedValue({
    userId: "usr_001",
    expiresAt: new Date(Date.now() + 86400_000),
    revokedAt: null,
  }),
}));
vi.mock("../../src/lib/id.js", () => ({ generateId: vi.fn().mockReturnValue("test_id") }));
vi.mock("../../src/lib/getUserLanguage.js", () => ({
  getUserLanguage: vi.fn().mockResolvedValue("en"),
  getPlatformDefaultLanguage: vi.fn().mockResolvedValue("en"),
}));
vi.mock("../../src/lib/webhook-emitter.js", () => ({ emitWebhookEvent: vi.fn() }));
vi.mock("../../src/lib/fireAndForget.js", () => ({ fireAndForget: vi.fn() }));
vi.mock("../../src/routes/rider/index.js", () => ({ clearSpoofHits: vi.fn() }));
vi.mock("../../src/routes/admin.js", () => ({
  getPlatformSettings: vi.fn().mockResolvedValue(mockSettings),
}));
vi.mock("../../src/routes/admin-shared.js", () => ({
  getCachedSettings: vi.fn().mockResolvedValue(mockSettings),
  DEFAULT_PLATFORM_SETTINGS: {},
}));
vi.mock("../../src/routes/auth/helpers.js", () => ({
  isValidCanonicalPhone: vi.fn().mockResolvedValue(true),
  hashOtp: vi.fn().mockReturnValue("hashed_otp"),
  issueTokensForUser: vi.fn().mockResolvedValue({
    token: "access_token",
    refreshToken: "refresh_token",
    user: { id: "usr_001" },
    isNewUser: false,
  }),
  extractAuthUser: vi.fn().mockReturnValue({ userId: "usr_001" }),
  storePendingTotpSecret: vi.fn().mockResolvedValue(undefined),
  getPendingTotpSecret: vi.fn().mockResolvedValue(null),
  deletePendingTotpSecret: vi.fn().mockResolvedValue(undefined),
  normalizeVehicleTypeForStorage: vi.fn(),
  generateVerificationToken: vi.fn().mockReturnValue("token"),
  hashVerificationToken: vi.fn().mockReturnValue("hash"),
  tryEncrypt: vi.fn().mockImplementation((v: string) => v),
  decryptPii: vi.fn().mockImplementation((v: string) => v),
  setRiderRefreshCookie: vi.fn(),
  clearRiderRefreshCookie: vi.fn(),
  setVendorRefreshCookie: vi.fn(),
  clearVendorRefreshCookie: vi.fn(),
  RIDER_REFRESH_COOKIE: "ajkmart_rider_refresh",
  RIDER_REFRESH_COOKIE_PATH: "/api/auth",
  VENDOR_REFRESH_COOKIE: "ajkmart_vendor_refresh",
  VENDOR_REFRESH_COOKIE_PATH: "/api/auth",
  AUTH_OTP_TTL_MS: 5 * 60 * 1000,
  CNIC_REGEX: /^\d{5}-\d{7}-\d{1}$/,
  PHONE_REGEX: /^0?3\d{9}$/,
  checkAndIncrOtpRateLimit: vi.fn().mockResolvedValue({ blocked: false }),
  isDeviceTrusted: vi.fn().mockResolvedValue(false),
  isRiderSession: vi.fn().mockReturnValue(false),
  isVendorSession: vi.fn().mockReturnValue(false),
  detectIdentifierType: vi.fn().mockReturnValue("phone"),
  shouldUseSecureCookie: vi.fn().mockReturnValue(false),
  findUserByIdentifier: vi
    .fn()
    .mockResolvedValue({ user: null, idType: "phone", lookupKey: "+923001234567" }),
  sendOtpSchema: {},
  verifyOtpSchema: {},
  OtpBypassSchema: {},
  LoginVerifyOtpSchema: {},
  ChangePhoneRequestSchema: {},
  ChangePhoneConfirmSchema: {},
  TotpCodeSchema: {},
  TwoFaVerifySchema: {},
  TwoFaRecoverySchema: {},
  TrustDeviceSchema: {},
  refreshTokenSchema: {},
  LogoutSchema: {},
  ValidateTokenSchema: {},
  forgotPasswordSchema: {},
  registerSchema: {},
  checkIdentifierSchema: {},
  CheckAvailableSchema: {},
  loginSchema: {},
  phoneSchema: {},
}));

describe("POST /auth/check-identifier", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelectChain.limit.mockResolvedValue([]);
    mockDb.select.mockReturnValue(mockSelectChain);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const mod = await import("../../src/routes/auth/identifier.js");
    app.use("/auth", mod.default);
  });

  it("returns send_phone_otp action for a new phone number when OTP is enabled", async () => {
    const res = await request(app)
      .post("/auth/check-identifier")
      .send({ identifier: "03001234567" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.action).toBe("send_phone_otp");
    expect(res.body.data.availableMethods).toContain("phone_otp");
  });

  it("returns send_phone_otp for an existing user phone", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([
      {
        id: "usr_01",
        phone: "+923001234567",
        roles: "customer",
        isBanned: false,
        passwordHash: null,
      },
    ]);

    const res = await request(app)
      .post("/auth/check-identifier")
      .send({ identifier: "03001234567" });

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe("send_phone_otp");
  });

  it("does not reveal banned status to the client for phone identifiers", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([
      {
        id: "usr_02",
        phone: "+923001234567",
        roles: "customer",
        isBanned: true,
        passwordHash: null,
      },
    ]);

    const res = await request(app)
      .post("/auth/check-identifier")
      .send({ identifier: "03001234567" });

    expect(res.status).toBe(200);
    expect(res.body.data.isBanned).toBe(false);
    expect(res.body.data.action).toBe("send_phone_otp");
  });

  it("returns register action for an unknown username", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]);

    const res = await request(app)
      .post("/auth/check-identifier")
      .send({ identifier: "newusername" });

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe("register");
  });

  it("returns login_password action for existing username with password hash", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([
      {
        id: "usr_03",
        username: "existinguser",
        roles: "customer",
        isBanned: false,
        passwordHash: "hashed_password",
      },
    ]);

    const res = await request(app)
      .post("/auth/check-identifier")
      .send({ identifier: "existinguser" });

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe("login_password");
  });

  it("returns blocked action for a banned username user", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([
      {
        id: "usr_04",
        username: "banneduser",
        roles: "customer",
        isBanned: true,
        passwordHash: null,
      },
    ]);

    const res = await request(app)
      .post("/auth/check-identifier")
      .send({ identifier: "banneduser" });

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe("blocked");
    expect(res.body.data.isBanned).toBe(true);
  });

  it("returns non-200 for missing identifier (route or validator rejects)", async () => {
    const res = await request(app).post("/auth/check-identifier").send({});

    expect(res.status).not.toBe(200);
    expect(res.body.success).toBeFalsy();
  });
});
