import cookieParser from "cookie-parser";
import { createHash } from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const mockSettings: Record<string, string> = {
  auth_phone_otp_enabled: "on",
  security_login_max_attempts: "5",
  security_lockout_minutes: "30",
  security_otp_cooldown_sec: "0",
  otp_require_when_no_provider: "off",
  security_otp_bypass: "off",
  integration_whatsapp: "off",
  auth_2fa_enabled: "on",
  feature_new_users: "on",
};

const makeMockSelectChain = () => ({
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  orderBy: vi.fn().mockReturnThis(),
});

const makeMockInsertChain = () => ({
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
});

const makeMockUpdateChain = () => ({
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
});

const makeMockDeleteChain = () => ({
  where: vi.fn().mockResolvedValue(undefined),
});

let mockSelectChain = makeMockSelectChain();
let mockInsertChain = makeMockInsertChain();
let mockUpdateChain = makeMockUpdateChain();
let mockDeleteChain = makeMockDeleteChain();

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
    phone: "phone",
    email: "email",
    username: "username",
    otpCode: "otpCode",
    otpExpiry: "otpExpiry",
    otpUsed: "otpUsed",
    otpBypassUntil: "otpBypassUntil",
    isBanned: "isBanned",
    isActive: "isActive",
    roles: "roles",
    tokenVersion: "tokenVersion",
    googleId: "googleId",
    approvalStatus: "approvalStatus",
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
  pendingOtpsTable: {
    id: "id",
    phone: "phone",
    otpHash: "otpHash",
    otpExpiry: "otpExpiry",
    attempts: "attempts",
  },
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
  canonicalizePhone: (p: string) => (p.startsWith("+92") ? p : p.replace(/^0/, "+92")),
}));
vi.mock("@workspace/i18n", () => ({ t: (k: string) => k }));
vi.mock("@workspace/auth-utils/server", () => ({
  isAuthMethodEnabled: (s: Record<string, string>, k: string) => s[k] === "on",
  isAuthMethodEnabledStrict: (s: Record<string, string>, k: string) => s[k] === "on",
}));
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
  verifyUserJwt: vi.fn().mockReturnValue(null),
  generateRefreshToken: vi.fn().mockReturnValue("refresh_token"),
  hashRefreshToken: vi.fn().mockReturnValue("hash_refresh"),
  isRefreshTokenValid: vi.fn().mockResolvedValue(null),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  revokeAllUserRefreshTokens: vi.fn().mockResolvedValue(undefined),
  blacklistJti: vi.fn().mockResolvedValue(undefined),
  writeAuthAuditLog: vi.fn(),
  getRefreshTokenTtlDays: vi.fn().mockReturnValue(7),
  getAccessTokenTtlSec: vi.fn().mockReturnValue(900),
  verifyCaptcha: (_r: unknown, _s: unknown, n: () => void) => n(),
  checkAvailableRateLimit: vi.fn().mockResolvedValue({ limited: false }),
  sign2faChallengeToken: vi.fn().mockReturnValue("2fa_challenge"),
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

const mockIsValidCanonicalPhone = vi.fn().mockResolvedValue(true);
const mockIssueTokensForUser = vi.fn().mockResolvedValue({
  token: "access_token",
  refreshToken: "refresh_token",
  user: { id: "usr_001", phone: "+923001234567", roles: "customer" },
  isNewUser: false,
});
const mockCheckAndIncrOtpRateLimit = vi
  .fn()
  .mockResolvedValue({ blocked: false, retryAfterSeconds: 0 });
const mockGetWhitelistBypass = vi.fn().mockResolvedValue(null);

vi.mock("../../src/routes/auth/helpers.js", () => ({
  isValidCanonicalPhone: mockIsValidCanonicalPhone,
  hashOtp: (otp: string) => createHash("sha256").update(otp).digest("hex"),
  issueTokensForUser: mockIssueTokensForUser,
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
  checkAndIncrOtpRateLimit: mockCheckAndIncrOtpRateLimit,
  isDeviceTrusted: vi.fn().mockResolvedValue(false),
  isRiderSession: vi.fn().mockReturnValue(false),
  isVendorSession: vi.fn().mockReturnValue(false),
  detectIdentifierType: vi.fn().mockReturnValue("phone"),
  shouldUseSecureCookie: vi.fn().mockReturnValue(false),
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
  loginSchema: {},
  phoneSchema: {},
}));

vi.mock("../../src/services/sms.js", () => ({
  sendOtpSMS: vi.fn().mockResolvedValue({ sent: true, provider: "console" }),
  isSMSProviderConfigured: vi.fn().mockReturnValue(true),
  isSMSConsoleActive: vi.fn().mockReturnValue(true),
}));
vi.mock("../../src/services/smsGateway.js", () => ({
  sendOtpWithFailover: vi.fn().mockResolvedValue({ sent: true }),
  getWhitelistBypass: mockGetWhitelistBypass,
}));
vi.mock("../../src/services/whatsapp.js", () => ({
  sendWhatsAppOTP: vi.fn().mockResolvedValue({ sent: false }),
  isWhatsAppProviderConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("../../src/services/email.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ sent: false }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ sent: false }),
  sendMagicLinkEmail: vi.fn().mockResolvedValue({ sent: false }),
  alertNewVendor: vi.fn().mockResolvedValue(undefined),
  isEmailProviderConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("../../src/services/password.js", () => ({
  hashPassword: vi.fn().mockReturnValue("hashed"),
  verifyPassword: vi.fn().mockReturnValue(false),
  validatePasswordStrength: vi.fn().mockReturnValue({ ok: true }),
  generateSecureOtp: vi.fn().mockReturnValue("654321"),
  verifyTotpCode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../src/services/totp.js", () => ({
  generateTotpSecret: vi.fn().mockReturnValue("SECRET"),
  verifyTotpToken: vi.fn().mockReturnValue(false),
  generateQRCodeDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xx"),
  getTotpUri: vi.fn().mockReturnValue("otpauth://totp/test"),
  encryptTotpSecret: vi.fn().mockReturnValue("enc"),
  decryptTotpSecret: vi.fn().mockReturnValue("SECRET"),
}));
vi.mock("../../src/services/auth/tokenRotation.js", () => ({
  rotateRefreshToken: vi.fn().mockResolvedValue({
    accessToken: "access_token",
    refreshToken: "new_refresh",
    expiresAt: new Date(Date.now() + 86400_000),
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
vi.mock("../../src/routes/auth/auth-common.js", () => ({
  handleRefreshToken: vi.fn(),
  handleUnifiedLogin: vi.fn(),
  consumeRecoveryCode: vi.fn(),
  doRefresh: vi.fn(),
  issueTokensForUser: vi.fn().mockResolvedValue({
    token: "access_token",
    refreshToken: "refresh_token",
    user: { id: "usr_001" },
    isNewUser: false,
  }),
}));

function resetChains() {
  mockSelectChain = makeMockSelectChain();
  mockInsertChain = makeMockInsertChain();
  mockUpdateChain = makeMockUpdateChain();
  mockDeleteChain = makeMockDeleteChain();
  mockDb.select.mockReturnValue(mockSelectChain);
  mockDb.insert.mockReturnValue(mockInsertChain);
  mockDb.update.mockReturnValue(mockUpdateChain);
  mockDb.delete.mockReturnValue(mockDeleteChain);
}

describe("POST /auth/send-otp", () => {
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetChains();
    mockIsValidCanonicalPhone.mockResolvedValue(true);
    mockCheckAndIncrOtpRateLimit.mockResolvedValue({ blocked: false });
    mockGetWhitelistBypass.mockResolvedValue(null);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const mod = await import("../../src/routes/auth/otp.js");
    app.use("/auth", mod.default);
  });

  it("sends OTP to a new user and returns otpRequired:true", async () => {
    mockSelectChain.limit.mockResolvedValue([]);

    const res = await request(app).post("/auth/send-otp").send({ phone: "03001234567" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.otpRequired).toBe(true);
  });

  it("returns 400 when phone OTP is disabled", async () => {
    const { getCachedSettings } = await import("../../src/middleware/security.js");
    vi.mocked(getCachedSettings).mockResolvedValueOnce({
      ...mockSettings,
      auth_phone_otp_enabled: "off",
    });

    const res = await request(app).post("/auth/send-otp").send({ phone: "03001234567" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 429 when account is locked", async () => {
    const { checkLockout } = await import("../../src/middleware/security.js");
    vi.mocked(checkLockout).mockResolvedValueOnce({ locked: true, minutesLeft: 15 });

    const res = await request(app).post("/auth/send-otp").send({ phone: "03001234567" });

    expect(res.status).toBe(429);
  });

  it("returns global bypass (otpRequired:false) when security_otp_bypass is on", async () => {
    const { getCachedSettings } = await import("../../src/middleware/security.js");
    vi.mocked(getCachedSettings).mockResolvedValueOnce({
      ...mockSettings,
      security_otp_bypass: "on",
    });
    mockSelectChain.limit.mockResolvedValue([]);

    const res = await request(app).post("/auth/send-otp").send({ phone: "03001234567" });

    expect(res.status).toBe(200);
    expect(res.body.data.otpRequired).toBe(false);
    expect(res.body.data.bypass).toBe(true);
  });

  it("returns 400 for invalid phone format", async () => {
    mockIsValidCanonicalPhone.mockResolvedValueOnce(false);

    const res = await request(app).post("/auth/send-otp").send({ phone: "notaphone" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /auth/verify-otp — new user path", () => {
  let app: ReturnType<typeof express>;
  const validOtp = "654321";
  const validOtpHash = sha256(validOtp);

  beforeEach(async () => {
    vi.clearAllMocks();
    resetChains();
    mockIsValidCanonicalPhone.mockResolvedValue(true);
    mockGetWhitelistBypass.mockResolvedValue(null);
    mockCheckAndIncrOtpRateLimit.mockResolvedValue({ blocked: false });
    mockIssueTokensForUser.mockResolvedValue({
      token: "access_token",
      refreshToken: "refresh_token",
      user: { id: "usr_001", phone: "+923001234567", roles: "customer" },
      isNewUser: true,
    });
    const { getCachedSettings } = await import("../../src/middleware/security.js");
    vi.mocked(getCachedSettings).mockResolvedValue(mockSettings);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const mod = await import("../../src/routes/auth/otp.js");
    app.use("/auth", mod.default);
  });

  it("returns tokens when OTP is correct", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        otpHash: validOtpHash,
        otpExpiry: new Date(Date.now() + 300_000),
        attempts: 0,
        phone: "+923001234567",
      },
    ]);

    const res = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "03001234567", otp: validOtp });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe("access_token");
  });

  it("returns 401 when OTP is wrong", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        otpHash: validOtpHash,
        otpExpiry: new Date(Date.now() + 300_000),
        attempts: 0,
        phone: "+923001234567",
      },
    ]);

    const res = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "03001234567", otp: "000000" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when OTP is expired", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        otpHash: validOtpHash,
        otpExpiry: new Date(Date.now() - 60_000),
        attempts: 0,
        phone: "+923001234567",
      },
    ]);

    const res = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "03001234567", otp: validOtp });

    expect([401, 429]).toContain(res.status);
  });

  it("returns 400 for invalid phone format", async () => {
    mockIsValidCanonicalPhone.mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/auth/verify-otp")
      .send({ phone: "notaphone", otp: "654321" });

    expect(res.status).toBe(400);
  });
});
