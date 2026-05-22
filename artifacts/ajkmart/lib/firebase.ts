/**
 * Firebase Client SDK — AJKMart Customer App (Expo)
 *
 * Gracefully disabled when EXPO_PUBLIC_FIREBASE_API_KEY is not set.
 * Supports Google Sign-In and phone number auth in FIREBASE / HYBRID modes.
 *
 * NOTE: Env vars are accessed via static `process.env.EXPO_PUBLIC_*` dot
 * notation so Expo's babel plugin can inline them at build time. The
 * `expo/no-dynamic-env-var` rule forbids dynamic / bracket access here.
 */

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import { createLogger } from "@/utils/logger";
const log = createLogger("[firebase]");

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _initialized = false;

function getFirebaseConfig() {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN         ?? "",
    projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID          ?? "",
    storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET      ?? "",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID              ?? "",
  };
}

export async function getFirebaseAuth(): Promise<Auth | null> {
  if (_initialized) {
    if (!_auth) {
      log.debug("Firebase not available (previously failed or not configured)");
    }
    return _auth;
  }
  _initialized = true;

  const config = getFirebaseConfig();
  if (!config) {
    log.warn("Firebase not configured — EXPO_PUBLIC_FIREBASE_API_KEY not set. Sign-in options will be limited.");
    return null;
  }

  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getAuth } = await import("firebase/auth");
    _app = getApps().length === 0 ? initializeApp(config) : getApps()[0]!;
    _auth = getAuth(_app);
    log.debug("Firebase initialized successfully");
    return _auth;
  } catch (err) {
    log.error("Failed to initialize Firebase:", err);
    return null;
  }
}

export function isFirebaseConfigured(): boolean {
  const configured = !!process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!configured) {
    log.warn("Firebase not configured — app will work without Google/phone sign-in options");
  }
  return configured;
}

/**
 * Check if Firebase is available (configured AND successfully initialized).
 * Use this before attempting Firebase operations.
 */
export async function isFirebaseAvailable(): Promise<boolean> {
  const auth = await getFirebaseAuth();
  const available = auth !== null;
  if (!available) {
    log?.warn("Firebase features unavailable — falling back to phone OTP only");
  }
  return available;
}
