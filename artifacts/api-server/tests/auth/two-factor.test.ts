import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSettings: Record<string, string> = {
  auth_2fa_enabled: "on",
  auth_phone_otp_enabled: "on",
  auth_trusted_device_days: "30",
};

const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};
const mockUpdateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};
const mockDeleteChain = { where: vi.fn().mockResolvedValue(undefined) };
const mockInsertChain = { values: vi.fn().mockResolvedValue(undefined) };

const mockDb = {
  select: vi.fn().mockReturnValue(mockSelectChain),
  insert: vi.fn().mockReturnValue(mockInsertChain),
  update: vi.fn().mockReturnValue(mockUpdateChain),
  delete: vi.fn().mockReturnValue(mockDeleteChain),
};

vi.mock("@workspace/db", () => ({ db: mockDb }));
vi.mock("@workspace/db/schema", () => ({
  usersTable: {
    id: "id",
    totpEnabled: "totpEnabled",
    totpSecret: "totpSecret",
    backupCodes: "backupCodes",
    trustedDevices: "trustedDevices",
    roles: "roles",
    isBanned: "isBanned",
    isActive: "isActive",
    tokenVersion: "tokenVersion",
    updatedAt: "updatedAt",
  },
  refreshTokensTable: {
    id: "id",
    userId: "userId",
    tokenHash: "tokenHash",
    revokedAt: "revokedAt",
    expiresAt: "expiresAt",
    familyId: "familyId",
    revokedReason: "revokedReason",
  },
  totpRecoveryCodesTable: { id: "id", userId: "userId", codeHash: "codeHash", usedAt: "usedAt" },
  userTotpSetupTable: {
    userId: "userId",
    secret: "secret",
    encryptedSecret: "encryptedSecret",
    expiresAt: "expiresAt",
  },
  pendingOtpsTable: {},
  rateLimitsTable: {},
  userSessionsTable: {},
  loginHistoryTable: {},
  vendorProfilesTable: {},
  riderProfilesTable: {},
  magicLinkTokensTable: {},
  walletTransactionsTable: {},
  notificationsTable: {},
  accountRecoveryTokensTable: {},
}));
vi.mock("@workspace/phone-utils", () => ({ canonicalizePhone: (p: string) => p }));
vi.mock("@workspace/i18n", () => ({ t: (k: string) => k }));
vi.mock("@workspace/auth-utils/server", () => ({
  isAuthMethodEnabled: (s: Record<string, string>, k: string) => s[k] === "on",
  isAuthMethodEnabledStrict: (s: Record<string, string>, k: string) => s[k] === "on",
}));

const mockVerify2faToken = vi.fn().mockReturnValue(null);
const mockVerifyTotpToken = vi.fn().mockReturnValue(false);
const mockExtractAuthUser = vi.fn().mockReturnValue({ userId: "usr_001" });
const mockStorePendingTotpSecret = vi.fn().mockResolvedValue(undefined);
const mockGetPendingTotpSecret = vi.fn().mockResolvedValue(null);
const mockIssueTokensForUser = vi.fn().mockResolvedValue({
  token: "access_token",
  refreshToken: "refresh_token",
  user: { id: "usr_001", roles: "customer" },
  isNewUser: false,
});
const mockConsumeRecoveryCode = vi.fn().mockResolvedValue({ codesRemaining: 7 });

vi.mock("../../src/middleware/security.js", () => ({
  getCachedSettings: vi.fn().mockResolvedValue(mockSettings),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  addSecurityEvent: vi.fn(),
  addAuditEntry: vi.fn(),
  checkLockout: vi.fn().mockResolvedValue({ locked: false }),
  recordFailedAttempt: vi.fn(),
  resetAttempts: vi.fn(),
  signUserJwt: vi.fn().mockReturnValue("access_token"),
  signAccessToken: vi.fn().mockReturnValue("access_token"),
  verifyUserJwt: vi.fn().mockReturnValue({ userId: "usr_001" }),
  generateRefreshToken: vi.fn().mockReturnValue("refresh_token"),
  hashRefreshToken: vi.fn().mockReturnValue("hash"),
  isRefreshTokenValid: vi.fn().mockResolvedValue(null),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  revokeAllUserRefreshTokens: vi.fn().mockResolvedValue(undefined),
  blacklistJti: vi.fn().mockResolvedValue(undefined),
  writeAuthAuditLog: vi.fn(),
  getRefreshTokenTtlDays: vi.fn().mockReturnValue(7),
  getAccessTokenTtlSec: vi.fn().mockReturnValue(900),
  verifyCaptcha: (_r: unknown, _s: unknown, n: () => void) => n(),
  checkAvailableRateLimit: vi.fn().mockResolvedValue({ limited: false }),
  sign2faChallengeToken: vi.fn().mockReturnValue("challenge_token"),
  verify2faChallengeToken: mockVerify2faToken,
}));
vi.mock("../../src/middleware/rate-limit.js", () => ({
  authLimiter: (_r: unknown, _s: unknown, n: () => void) => n(),
  loginLimiter: (_r: unknown, _s: unknown, n: () => void) => n(),
  otpLimiter: (_r: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock("../../src/middleware/validate.js", () => ({
  validateBody: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock("../../src/services/sms.js", () => ({
  sendOtpSMS: vi.fn(),
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
  hashPassword: vi.fn().mockReturnValue("h"),
  verifyPassword: vi.fn(),
  validatePasswordStrength: vi.fn().mockReturnValue({ ok: true }),
  generateSecureOtp: vi.fn().mockReturnValue("123456"),
}));
vi.mock("../../src/services/totp.js", () => ({
  generateTotpSecret: vi.fn().mockReturnValue("TOTP_SECRET_123"),
  verifyTotpToken: mockVerifyTotpToken,
  generateQRCodeDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xx"),
  getTotpUri: vi.fn().mockReturnValue("otpauth://totp/test"),
  encryptTotpSecret: vi.fn().mockReturnValue("encrypted_secret"),
  decryptTotpSecret: vi.fn().mockReturnValue("TOTP_SECRET_123"),
}));
vi.mock("../../src/services/auth/tokenRotation.js", () => ({
  rotateRefreshToken: vi.fn().mockResolvedValue({
    token: "new_refresh",
    record: { expiresAt: new Date(Date.now() + 86400_000), userId: "usr_001" },
  }),
  invalidateTokenFamily: vi.fn().mockResolvedValue(undefined),
  detectAndInvalidateFamily: vi.fn().mockResolvedValue({
    userId: "usr_001",
    expiresAt: new Date(Date.now() + 86400_000),
    revokedAt: null,
  }),
}));
vi.mock("../../src/lib/id.js", () => ({ generateId: vi.fn().mockReturnValue("gen_id") }));
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
  issueTokensForUser: mockIssueTokensForUser,
  extractAuthUser: mockExtractAuthUser,
  storePendingTotpSecret: mockStorePendingTotpSecret,
  getPendingTotpSecret: mockGetPendingTotpSecret,
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
  TotpCodeSchema: {},
  TwoFaVerifySchema: {},
  TwoFaRecoverySchema: {},
  TrustDeviceSchema: {},
  sendOtpSchema: {},
  verifyOtpSchema: {},
  refreshTokenSchema: {},
  LogoutSchema: {},
  ValidateTokenSchema: {},
  forgotPasswordSchema: {},
  registerSchema: {},
  checkIdentifierSchema: {},
  loginSchema: {},
  phoneSchema: {},
}));
vi.mock("../../src/routes/auth/auth-common.js", () => ({
  consumeRecoveryCode: mockConsumeRecoveryCode,
  handleRefreshToken: vi.fn(),
  handleUnifiedLogin: vi.fn(),
  doRefresh: vi.fn(),
  issueTokensForUser: mockIssueTokensForUser,
}));

const authUser = {
  id: "usr_001",
  phone: "+923001234567",
  roles: "customer",
  isActive: true,
  isBanned: false,
  totpEnabled: false,
  totpSecret: null,
  backupCodes: null,
  trustedDevices: null,
  tokenVersion: 0,
  email: null,
  name: "Test",
  updatedAt: new Date(),
};

describe("GET /auth/2fa/setup", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelectChain.limit.mockResolvedValue([authUser]);
    mockDb.select.mockReturnValue(mockSelectChain);
    mockDb.insert.mockReturnValue(mockInsertChain);
    mockDb.update.mockReturnValue(mockUpdateChain);
    mockExtractAuthUser.mockReturnValue({ userId: "usr_001" });
    mockStorePendingTotpSecret.mockResolvedValue(undefined);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const mod = await import("../../src/routes/auth/two-factor.js");
    app.use("/auth", mod.default);
  });

  it("returns TOTP secret and QR code for authenticated user", async () => {
    const res = await request(app)
      .get("/auth/2fa/setup")
      .set("Authorization", "Bearer valid_token");

    expect(res.status).toBe(200);
    expect(res.body.data.secret).toBe("TOTP_SECRET_123");
    expect(res.body.data.qrDataUrl).toContain("data:image/png");
    expect(res.body.data.uri).toContain("otpauth://totp");
  });

  it("returns 409 when 2FA is already enabled", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([{ ...authUser, totpEnabled: true }]);

    const res = await request(app)
      .get("/auth/2fa/setup")
      .set("Authorization", "Bearer valid_token");

    expect(res.status).toBe(409);
  });

  it("returns 403 when 2FA is disabled in platform settings", async () => {
    const { getCachedSettings } = await import("../../src/middleware/security.js");
    vi.mocked(getCachedSettings).mockResolvedValueOnce({
      ...mockSettings,
      auth_2fa_enabled: "off",
    });

    const res = await request(app)
      .get("/auth/2fa/setup")
      .set("Authorization", "Bearer valid_token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when user is not found", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]);

    const res = await request(app)
      .get("/auth/2fa/setup")
      .set("Authorization", "Bearer valid_token");

    expect(res.status).toBe(404);
  });
});

describe("POST /auth/2fa/verify", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelectChain.limit.mockResolvedValue([
      { ...authUser, totpEnabled: true, totpSecret: "encrypted_secret" },
    ]);
    mockDb.select.mockReturnValue(mockSelectChain);
    mockIssueTokensForUser.mockResolvedValue({
      token: "access_token",
      refreshToken: "refresh_token",
      user: { id: "usr_001", roles: "customer" },
      isNewUser: false,
    });

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const mod = await import("../../src/routes/auth/two-factor.js");
    app.use("/auth", mod.default);
  });

  it("returns 401 when 2FA challenge token is invalid or missing", async () => {
    mockVerify2faToken.mockReturnValueOnce(null);

    const res = await request(app)
      .post("/auth/2fa/verify")
      .send({ tempToken: "invalid", code: "123456" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when TOTP code is wrong", async () => {
    mockVerify2faToken.mockReturnValueOnce({ userId: "usr_001", authMethod: "phone_otp" });
    mockVerifyTotpToken.mockReturnValueOnce(false);

    const res = await request(app)
      .post("/auth/2fa/verify")
      .send({ tempToken: "valid_challenge", code: "000000" });

    expect(res.status).toBe(401);
  });

  it("returns tokens when TOTP code is correct", async () => {
    mockVerify2faToken.mockReturnValueOnce({ userId: "usr_001", authMethod: "phone_otp" });
    mockVerifyTotpToken.mockReturnValueOnce(true);

    const res = await request(app)
      .post("/auth/2fa/verify")
      .send({ tempToken: "valid_challenge", code: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe("access_token");
  });
});

describe("POST /auth/2fa/recovery — backup code flow", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelectChain.limit.mockResolvedValue([
      { ...authUser, totpEnabled: true, totpSecret: "encrypted_secret" },
    ]);
    mockDb.select.mockReturnValue(mockSelectChain);
    mockDb.update.mockReturnValue(mockUpdateChain);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const mod = await import("../../src/routes/auth/two-factor.js");
    app.use("/auth", mod.default);
  });

  it("returns 401 when challenge token is missing or invalid", async () => {
    mockVerify2faToken.mockReturnValueOnce(null);

    const res = await request(app)
      .post("/auth/2fa/recovery")
      .send({ tempToken: "bad_token", backupCode: "abcd1234" });

    expect(res.status).toBe(401);
  });

  it("issues tokens when recovery code is valid", async () => {
    mockVerify2faToken.mockReturnValueOnce({ userId: "usr_001", authMethod: "phone_otp" });
    mockConsumeRecoveryCode.mockResolvedValueOnce({ codesRemaining: 6 });
    mockIssueTokensForUser.mockResolvedValueOnce({
      token: "access_token",
      refreshToken: "refresh_token",
      user: { id: "usr_001", roles: "customer" },
      isNewUser: false,
    });

    const res = await request(app)
      .post("/auth/2fa/recovery")
      .send({ tempToken: "valid_challenge", backupCode: "abcd1234" });

    expect(res.status).toBe(200);
    expect(res.body.data.codesRemaining).toBe(6);
    expect(res.body.data.token).toBe("access_token");
  });

  it("returns error when recovery code is invalid", async () => {
    mockVerify2faToken.mockReturnValueOnce({ userId: "usr_001", authMethod: "phone_otp" });
    mockConsumeRecoveryCode.mockResolvedValueOnce({ error: "Invalid recovery code", status: 401 });

    const res = await request(app)
      .post("/auth/2fa/recovery")
      .send({ tempToken: "valid_challenge", backupCode: "wrong_code" });

    expect(res.status).toBe(401);
  });
});
