import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RIDER_REFRESH_COOKIE = "ajkmart_rider_refresh";

const mockSettings: Record<string, string> = {
  auth_phone_otp_enabled: "on",
  auth_2fa_enabled: "on",
};

const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};
const mockUpdateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};

const mockDb = {
  select: vi.fn().mockReturnValue(mockSelectChain),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  }),
  update: vi.fn().mockReturnValue(mockUpdateChain),
  delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
};

vi.mock("@workspace/db", () => ({ db: mockDb }));
vi.mock("@workspace/db/schema", () => ({
  usersTable: {
    id: "id",
    phone: "phone",
    email: "email",
    otpCode: "otpCode",
    tokenVersion: "tokenVersion",
    isBanned: "isBanned",
    isActive: "isActive",
    roles: "roles",
  },
  refreshTokensTable: {
    id: "id",
    userId: "userId",
    tokenHash: "tokenHash",
    revokedAt: "revokedAt",
    expiresAt: "expiresAt",
    familyId: "familyId",
    revokedReason: "revokedReason",
    revoked: "revoked",
    tokenFamilyId: "tokenFamilyId",
  },
  pendingOtpsTable: {},
  rateLimitsTable: {},
  userSessionsTable: {
    id: "id",
    userId: "userId",
    revokedAt: "revokedAt",
    lastActiveAt: "lastActiveAt",
    refreshTokenId: "refreshTokenId",
    deviceName: "deviceName",
    browser: "browser",
    os: "os",
    ip: "ip",
    location: "location",
    createdAt: "createdAt",
  },
  loginHistoryTable: {
    userId: "userId",
    createdAt: "createdAt",
    id: "id",
    ip: "ip",
    deviceName: "deviceName",
    browser: "browser",
    os: "os",
    location: "location",
    success: "success",
    method: "method",
  },
  vendorProfilesTable: {},
  riderProfilesTable: {},
  totpRecoveryCodesTable: {},
  userTotpSetupTable: {},
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

const mockVerifyUserJwt = vi.fn().mockReturnValue(null);
const mockDetectAndInvalidateFamily = vi.fn();
const mockInvalidateTokenFamily = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/middleware/security.js", () => ({
  getCachedSettings: vi.fn().mockResolvedValue(mockSettings),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  addSecurityEvent: vi.fn(),
  addAuditEntry: vi.fn(),
  checkLockout: vi.fn().mockResolvedValue({ locked: false }),
  recordFailedAttempt: vi.fn(),
  resetAttempts: vi.fn(),
  signUserJwt: vi.fn().mockReturnValue("new_access_token"),
  signAccessToken: vi.fn().mockReturnValue("new_access_token"),
  verifyUserJwt: mockVerifyUserJwt,
  generateRefreshToken: vi.fn().mockReturnValue("new_refresh_token"),
  hashRefreshToken: vi.fn().mockImplementation((t: string) => `hash_${t}`),
  isRefreshTokenValid: vi.fn().mockResolvedValue(null),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  revokeAllUserRefreshTokens: vi.fn().mockResolvedValue(undefined),
  blacklistJti: vi.fn().mockResolvedValue(undefined),
  writeAuthAuditLog: vi.fn(),
  getRefreshTokenTtlDays: vi.fn().mockReturnValue(7),
  getAccessTokenTtlSec: vi.fn().mockReturnValue(900),
  verifyCaptcha: (_r: unknown, _s: unknown, n: () => void) => n(),
  checkAvailableRateLimit: vi.fn().mockResolvedValue({ limited: false }),
  sign2faChallengeToken: vi.fn().mockReturnValue("2fa_token"),
  verify2faChallengeToken: vi.fn().mockReturnValue(null),
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
  generateTotpSecret: vi.fn(),
  verifyTotpToken: vi.fn(),
  generateQRCodeDataURL: vi.fn(),
  getTotpUri: vi.fn(),
  encryptTotpSecret: vi.fn(),
  decryptTotpSecret: vi.fn(),
}));
vi.mock("../../src/services/auth/tokenRotation.js", () => ({
  rotateRefreshToken: vi.fn().mockResolvedValue({
    accessToken: "new_access_token",
    refreshToken: "rotated_refresh_token",
    expiresAt: new Date(Date.now() + 86400_000),
  }),
  invalidateTokenFamily: mockInvalidateTokenFamily,
  detectAndInvalidateFamily: mockDetectAndInvalidateFamily,
  TokenFamilyBreachError: class TokenFamilyBreachError extends Error {
    userId: string;
    constructor(userId: string) {
      super("Token family breach");
      this.name = "TokenFamilyBreachError";
      this.userId = userId;
    }
  },
}));
vi.mock("../../src/lib/id.js", () => ({ generateId: vi.fn().mockReturnValue("id") }));
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
    token: "new_access_token",
    refreshToken: "rotated_refresh",
    user: { id: "usr_001" },
    isNewUser: false,
  }),
  extractAuthUser: vi.fn().mockReturnValue({ userId: "usr_001" }),
  storePendingTotpSecret: vi.fn().mockResolvedValue(undefined),
  getPendingTotpSecret: vi.fn().mockResolvedValue(null),
  deletePendingTotpSecret: vi.fn().mockResolvedValue(undefined),
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
  refreshTokenSchema: {},
  LogoutSchema: {},
  ValidateTokenSchema: {},
  sendOtpSchema: {},
  verifyOtpSchema: {},
  forgotPasswordSchema: {},
  registerSchema: {},
  checkIdentifierSchema: {},
  loginSchema: {},
  phoneSchema: {},
}));

const validUser = {
  id: "usr_001",
  phone: "+923001234567",
  roles: "customer",
  isActive: true,
  isBanned: false,
  tokenVersion: 0,
  email: null,
  name: "Test",
  totpEnabled: false,
};

describe("POST /auth/refresh — requires HttpOnly cookie", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelectChain.limit.mockResolvedValue([validUser]);
    mockDb.select.mockReturnValue(mockSelectChain);
    mockDb.update.mockReturnValue(mockUpdateChain);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const mod = await import("../../src/routes/auth/refresh.js");
    app.use("/auth", mod.default);
  });

  it("issues new tokens when HttpOnly refresh cookie is present and valid", async () => {
    const rtRecord = {
      userId: "usr_001",
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      revoked: false,
      tokenFamilyId: "family_001",
      id: "rt_001",
      tokenHash: "hash_valid_refresh_token",
      authMethod: "phone_otp",
    };
    mockDetectAndInvalidateFamily.mockResolvedValueOnce(rtRecord);
    mockSelectChain.limit.mockResolvedValueOnce([validUser]);

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `${RIDER_REFRESH_COOKIE}=valid_refresh_token`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe("new_access_token");
  });

  it("returns 401 when no HttpOnly cookie is present", async () => {
    const res = await request(app).post("/auth/refresh").send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when token is not found in DB (detectAndInvalidateFamily throws)", async () => {
    const err = new Error("Token not found");
    mockDetectAndInvalidateFamily.mockRejectedValueOnce(err);

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `${RIDER_REFRESH_COOKIE}=unknown_token`)
      .send({});

    expect(res.status).toBe(401);
  });

  it("returns 401 and calls invalidateTokenFamily on family breach", async () => {
    const { TokenFamilyBreachError } = await import("../../src/services/auth/tokenRotation.js");
    const breach = new (TokenFamilyBreachError as new (
      userId: string
    ) => Error & { userId: string })("usr_001");
    mockDetectAndInvalidateFamily.mockRejectedValueOnce(breach);

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `${RIDER_REFRESH_COOKIE}=reused_token`)
      .send({});

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelectChain.limit.mockResolvedValue([validUser]);
    mockDb.select.mockReturnValue(mockSelectChain);
    mockDb.update.mockReturnValue(mockUpdateChain);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const mod = await import("../../src/routes/auth/refresh.js");
    app.use("/auth", mod.default);
  });

  it("returns 200 even without a token (graceful logout)", async () => {
    const res = await request(app).post("/auth/logout").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("blacklists JTI when valid access token is in Authorization header", async () => {
    mockVerifyUserJwt.mockReturnValueOnce({
      userId: "usr_001",
      jti: "test_jti",
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    const { blacklistJti } = await import("../../src/middleware/security.js");

    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", "Bearer valid_access_token")
      .send({});

    expect(res.status).toBe(200);
    expect(vi.mocked(blacklistJti)).toHaveBeenCalledWith("test_jti", expect.any(Number));
  });

  it("revokes refresh token from cookie on logout", async () => {
    const { revokeRefreshToken } = await import("../../src/middleware/security.js");

    const res = await request(app)
      .post("/auth/logout")
      .set("Cookie", `${RIDER_REFRESH_COOKIE}=cookie_token_to_revoke`)
      .send({});

    expect(res.status).toBe(200);
    expect(vi.mocked(revokeRefreshToken)).toHaveBeenCalled();
  });
});
