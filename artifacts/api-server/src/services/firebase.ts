/**
 * Firebase Admin Service — optional, gracefully disabled when env vars are absent.
 *
 * ACTIVATION: Set FIREBASE_SERVICE_ACCOUNT_JSON (full JSON string) in environment.
 * Without it every function is a no-op / returns null so the existing OTP/JWT auth
 * continues to work unchanged.
 */

import { logger } from "../lib/logger.js";

let _admin: typeof import("firebase-admin") | null = null;
let _initialized = false;

async function getAdmin() {
  if (_initialized) return _admin;
  _initialized = true;

  const raw = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!raw) {
    logger.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON not set — Firebase layer disabled");
    return null;
  }

  try {
    const { default: admin } = await import("firebase-admin");
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      logger.info("[Firebase] Admin SDK initialized");
    }
    _admin = admin;
    return admin;
  } catch (err: any) {
    logger.error({ err: err.message }, "[Firebase] Failed to initialize Admin SDK");
    return null;
  }
}

/**
 * Verify a Firebase ID token and return the decoded payload.
 * Returns null if Firebase is disabled or the token is invalid.
 */
export async function verifyFirebaseToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  phone?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
} | null> {
  const admin = await getAdmin();
  if (!admin) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      phone: decoded.phone_number,
      name: decoded.name,
      picture: decoded.picture,
      email_verified: decoded.email_verified,
    };
  } catch (err: any) {
    logger.warn({ err: err.message }, "[Firebase] Token verification failed");
    return null;
  }
}

/**
 * Set custom claims on a Firebase user so their role is embedded in the idToken.
 * No-op if Firebase is disabled.
 */
export async function setFirebaseCustomClaims(
  uid: string,
  claims: { role: string; roles: string; userId: string }
): Promise<boolean> {
  const admin = await getAdmin();
  if (!admin) return false;
  try {
    await admin.auth().setCustomUserClaims(uid, claims);
    logger.info({ uid, claims }, "[Firebase] Custom claims set");
    return true;
  } catch (err: any) {
    logger.error({ err: err.message, uid }, "[Firebase] Failed to set custom claims");
    return false;
  }
}

/**
 * Revoke all Firebase refresh tokens for a user (remote logout).
 * No-op if Firebase is disabled.
 */
export async function revokeFirebaseTokens(uid: string): Promise<boolean> {
  const admin = await getAdmin();
  if (!admin) return false;
  try {
    await admin.auth().revokeRefreshTokens(uid);
    logger.info({ uid }, "[Firebase] Refresh tokens revoked");
    return true;
  } catch (err: any) {
    logger.error({ err: err.message, uid }, "[Firebase] Failed to revoke tokens");
    return false;
  }
}

/**
 * Look up a Firebase user by phone number.
 * Returns null if Firebase is disabled or user not found.
 */
export async function getFirebaseUserByPhone(phone: string): Promise<{ uid: string } | null> {
  const admin = await getAdmin();
  if (!admin) return null;
  try {
    const user = await admin.auth().getUserByPhoneNumber(phone);
    return { uid: user.uid };
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return null;
  }
}

export function isFirebaseEnabled(): boolean {
  return !!process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
}

/**
 * Return the initialized Firebase Admin SDK instance.
 * Calls the lazy initializer so callers don't need to duplicate that logic.
 * Returns null when Firebase is not configured.
 */
export async function getFirebaseAdmin(): Promise<typeof import("firebase-admin") | null> {
  return getAdmin();
}
