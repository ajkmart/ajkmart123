/**
 * Firebase Client SDK — Vendor App
 *
 * Gracefully disabled when VITE_FIREBASE_API_KEY is not set.
 * When Firebase is enabled, used for Google Sign-In
 * in FIREBASE / HYBRID auth modes.
 *
 * All env values are sourced from the validated vendorEnv singleton;
 * no raw import.meta.env access.
 */

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import { vendorEnv } from "./envValidation";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _initialized = false;

function getFirebaseConfig() {
  const fb = vendorEnv.firebase;
  if (!fb.apiKey) return null;
  return {
    apiKey: fb.apiKey,
    authDomain: fb.authDomain ?? "",
    projectId: fb.projectId ?? "",
    storageBucket: fb.storageBucket ?? "",
    messagingSenderId: fb.messagingSenderId ?? "",
    appId: fb.appId ?? "",
  };
}

export async function getFirebaseAuth(): Promise<Auth | null> {
  if (_initialized) return _auth;
  _initialized = true;

  const config = getFirebaseConfig();
  if (!config) return null;

  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getAuth } = await import("firebase/auth");
    _app = getApps().length === 0 ? initializeApp(config) : getApps()[0]!;
    _auth = getAuth(_app);
    return _auth;
  } catch {
    return null;
  }
}

export function isFirebaseConfigured(): boolean {
  return vendorEnv.firebase.enabled;
}
