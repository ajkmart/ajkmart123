/**
 * Integration test database helpers.
 * Direct DB access for seeding and cleanup — bypasses route handlers.
 */

import { db } from "@workspace/db";
import {
  idempotencyKeysTable,
  magicLinkTokensTable,
  otpAttemptsTable,
  otpTokensTable,
  platformSettingsTable,
  refreshTokensTable,
  riderProfilesTable,
  ridesTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { canonicalizePhone } from "@workspace/phone-utils";
import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import { hashOtpCode } from "../../../modules/otp/otp.generate.js";
import { saveOtpToken } from "../../../modules/otp/otp.store.js";
import type { OtpIdentifierType, OtpType } from "../../../modules/otp/otp.types.js";

// ─── ID / AJK-ID generators ────────────────────────────────────────────────────

export function generateTestId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateTestAjkId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "AJK-";
  for (let i = 0; i < 6; i++) id += chars.charAt(randomInt(0, chars.length));
  return id;
}

/**
 * Generate a unique Pakistani phone in raw `03XXXXXXXXX` format (11 digits total).
 * PHONE_REGEX = /^0?3\d{9}$/ — needs `03` + exactly 9 digits.
 */
export function generateTestPhone(): string {
  // 9-digit suffix: 100_000_000 – 999_999_999
  const suffix = String(randomInt(100000000, 999999999));
  return `03${suffix}`;
}

/**
 * Convert a raw Pakistani phone (`03XXXXXXXXX`) to canonical bare-digit form (`3XXXXXXXXX`).
 * `canonicalizePhone('03001234567')` → `'3001234567'`
 * Routes store users.phone and otp_tokens.identifier in this bare form.
 */
export function toCanonicalPhone(phone: string): string {
  return canonicalizePhone(phone);
}

/** Generate a unique test email for each test. */
export function generateTestEmail(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@ajkmart-test.invalid`;
}

// ─── User Helpers ──────────────────────────────────────────────────────────────

export interface CreateUserOpts {
  id?: string;
  phone?: string;
  email?: string;
  name?: string;
  roles?: string;
  passwordHash?: string;
  isActive?: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  phoneVerified?: boolean;
  emailVerified?: boolean;
  ajkId?: string;
  walletBalance?: string;
  blockedServices?: string;
}

export async function createTestUser(opts: CreateUserOpts = {}): Promise<string> {
  const id = opts.id ?? generateTestId();
  await db.insert(usersTable).values({
    id,
    phone: opts.phone ?? null,
    name: opts.name ?? "Test User",
    email: opts.email ?? null,
    roles: opts.roles ?? "customer",
    passwordHash: opts.passwordHash ?? "dummy_hash:dummy_salt",
    walletBalance: opts.walletBalance ?? "0",
    isActive: opts.isActive ?? true,
    approvalStatus: opts.approvalStatus ?? "approved",
    phoneVerified: opts.phoneVerified ?? true,
    emailVerified: opts.emailVerified ?? false,
    ajkId: opts.ajkId ?? generateTestAjkId(),
    blockedServices: opts.blockedServices ?? "",
  });
  return id;
}

export async function deleteTestUser(userId: string): Promise<void> {
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

export async function deleteTestUserByPhone(phone: string): Promise<void> {
  await db.delete(usersTable).where(eq(usersTable.phone, phone));
}

// ─── OTP Token Helpers ─────────────────────────────────────────────────────────

/** Seed a known OTP token directly into the DB, bypassing the delivery flow. */
export async function seedOtpToken(options: {
  identifier: string;
  identifierType: OtpIdentifierType;
  otpType: OtpType;
  code?: string;
  userId?: string;
  ttlMs?: number;
  expiredMs?: number;
}): Promise<{ tokenId: string; code: string }> {
  const {
    identifier,
    identifierType,
    otpType,
    code = "123456",
    userId,
    ttlMs,
    expiredMs,
  } = options;

  const otpHash = hashOtpCode(code);

  const overrideTtl = expiredMs !== undefined ? -expiredMs : ttlMs;

  const tokenId = await saveOtpToken({
    identifier,
    identifierType,
    otpType,
    otpHash,
    channel: identifierType === "phone" ? "sms" : "email",
    userId,
    ttlMs: overrideTtl ?? 5 * 60 * 1000,
  });

  return { tokenId, code };
}

/** Mark an OTP token as used (for replay-attack tests). */
export async function markOtpTokenUsed(tokenId: string): Promise<void> {
  await db.update(otpTokensTable).set({ usedAt: new Date() }).where(eq(otpTokensTable.id, tokenId));
}

/** Immediately expire an OTP token (for expiry tests). */
export async function expireOtpToken(tokenId: string): Promise<void> {
  await db
    .update(otpTokensTable)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(otpTokensTable.id, tokenId));
}

/** Clean up all OTP tokens for an identifier. */
export async function cleanupOtpTokens(identifier: string): Promise<void> {
  await db.delete(otpTokensTable).where(eq(otpTokensTable.identifier, identifier));
}

/** Clean up all OTP attempt records for an identifier. */
export async function cleanupOtpAttempts(identifier: string): Promise<void> {
  await db.delete(otpAttemptsTable).where(eq(otpAttemptsTable.key, identifier));
}

// ─── Magic Link Helpers ────────────────────────────────────────────────────────

export async function cleanupMagicLinkTokens(userId: string): Promise<void> {
  await db.delete(magicLinkTokensTable).where(eq(magicLinkTokensTable.userId, userId));
}

// ─── Platform Settings Helpers ─────────────────────────────────────────────────

export async function seedPlatformSetting(
  key: string,
  value: string,
  label = "Test Setting",
  category = "auth"
): Promise<void> {
  await db
    .insert(platformSettingsTable)
    .values({ key, value, label, category })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function deletePlatformSetting(key: string): Promise<void> {
  await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, key));
}

// ─── Refresh Token Helpers ─────────────────────────────────────────────────────

export async function cleanupRefreshTokens(userId: string): Promise<void> {
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, userId));
}

// ─── Wallet Helpers ────────────────────────────────────────────────────────────

/** Set a user's wallet balance directly in the DB. */
export async function setWalletBalance(userId: string, amount: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ walletBalance: amount.toFixed(2) })
    .where(eq(usersTable.id, userId));
}

/** Freeze a user's wallet by adding "wallet" to their blockedServices. */
export async function freezeWallet(userId: string): Promise<void> {
  await db.update(usersTable).set({ blockedServices: "wallet" }).where(eq(usersTable.id, userId));
}

/** Get a user's current wallet balance from the DB. */
export async function getWalletBalance(userId: string): Promise<number> {
  const [user] = await db
    .select({ walletBalance: usersTable.walletBalance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return parseFloat(user?.walletBalance ?? "0");
}

/** Clean up all wallet transactions for a user. */
export async function cleanupWalletTransactions(userId: string): Promise<void> {
  await db.delete(walletTransactionsTable).where(eq(walletTransactionsTable.userId, userId));
}

/** Clean up idempotency keys for a user. */
export async function cleanupIdempotencyKeys(userId: string): Promise<void> {
  await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.userId, userId));
}

// ─── Ride Helpers ─────────────────────────────────────────────────────────────

export interface CreateTestRideOpts {
  id?: string;
  userId: string;
  riderId?: string;
  type?: string;
  status?: string;
  tripOtp?: string;
  otpVerified?: boolean;
  paymentMethod?: string;
  pickupAddress?: string;
  dropAddress?: string;
  fare?: string;
  distance?: string;
}

/** Create a ride row directly in the DB for integration tests. */
export async function createTestRide(opts: CreateTestRideOpts): Promise<string> {
  const id = opts.id ?? generateTestId();
  await db.insert(ridesTable).values({
    id,
    userId: opts.userId,
    riderId: opts.riderId ?? null,
    type: opts.type ?? "bike",
    status: opts.status ?? "searching",
    pickupAddress: opts.pickupAddress ?? "Test Pickup",
    dropAddress: opts.dropAddress ?? "Test Drop",
    pickupLat: "33.7215",
    pickupLng: "73.0433",
    dropLat: "33.7300",
    dropLng: "73.0500",
    fare: opts.fare ?? "150.00",
    distance: opts.distance ?? "3.5",
    paymentMethod: opts.paymentMethod ?? "cash",
    tripOtp: opts.tripOtp ?? null,
    otpVerified: opts.otpVerified ?? false,
  });
  return id;
}

/** Set the tripOtp on a ride row. */
export async function setRideOtp(rideId: string, otp: string): Promise<void> {
  await db
    .update(ridesTable)
    .set({ tripOtp: otp, updatedAt: new Date() })
    .where(eq(ridesTable.id, rideId));
}

/** Create a rider profile for a user. */
export async function createRiderProfile(
  userId: string,
  opts: {
    vehicleType?: string;
    vehiclePlate?: string;
  } = {}
): Promise<void> {
  await db
    .insert(riderProfilesTable)
    .values({
      userId,
      vehicleType: opts.vehicleType ?? "bike",
      vehiclePlate: opts.vehiclePlate ?? "ABC-123",
    })
    .onConflictDoNothing();
}

/** Clean up all rides for a user (as customer or rider). */
export async function cleanupRides(userId: string): Promise<void> {
  await db.delete(ridesTable).where(eq(ridesTable.userId, userId));
}

/** Clean up a specific ride by ID. */
export async function deleteRide(rideId: string): Promise<void> {
  await db.delete(ridesTable).where(eq(ridesTable.id, rideId));
}

/** Clean up ride OTP attempts for a ride. */
export async function cleanupRideOtpAttempts(rideId: string): Promise<void> {
  await db.delete(otpAttemptsTable).where(eq(otpAttemptsTable.key, rideId));
}
