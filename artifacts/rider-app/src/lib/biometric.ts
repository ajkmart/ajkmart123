/**
 * Biometric authentication helpers for the Rider PWA.
 *
 * On native Capacitor builds (iOS / Android) this wraps
 * @aparajita/capacitor-biometric-auth to show the OS-level biometric prompt.
 * On web / browser the helpers are no-ops so the Login page never shows
 * the biometric button in a plain browser context.
 *
 * Token storage uses @capacitor/preferences (secure on native, falls back
 * to localStorage on web so tests and dev flows work without Capacitor).
 */

import { createLogger } from "@/lib/logger";
const log = createLogger("[biometric]");

const BIOMETRIC_ENABLED_KEY = "ajkmart_rider_biometric_enabled";
const BIOMETRIC_TOKEN_KEY = "ajkmart_rider_biometric_token";

/* ── Preferences helpers (independent of api.ts to avoid circular deps) ── */

async function prefSet(key: string, value: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  } catch (err) {
    log.warn("biometric prefSet failed:", err);
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn("[artifacts/rider-app/src/lib/biometric.ts]", err);
    } // eslint-disable-line no-console
  }
}

async function prefGet(key: string): Promise<string> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value ?? "";
  } catch (err) {
    log.warn("biometric prefGet failed:", err);
    try {
      return localStorage.getItem(key) ?? "";
    } catch (err) {
      console.warn("[artifacts/rider-app/src/lib/biometric.ts]", err);
      return "";
    } // eslint-disable-line no-console
  }
}

async function prefRemove(key: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
  } catch (err) {
    log.warn("biometric prefRemove failed:", err);
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn("[artifacts/rider-app/src/lib/biometric.ts]", err);
    } // eslint-disable-line no-console
  }
}

/* ── Native platform detection ── */

function isNative(): boolean {
  try {
    // Capacitor injects window.Capacitor on native platforms at runtime.
    // Using the global avoids require() which is not available in browser ESM.
    const cap =
      typeof window !== "undefined"
        ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
        : undefined;
    return cap?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

/* ── Public API ── */

/**
 * Check whether biometric authentication is available on this device.
 * Always returns false on web.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable;
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/biometric.ts]", err);
    return false;
  } // eslint-disable-line no-console
}

/**
 * Return true if the user has previously opted in to biometric login on
 * this device.
 */
export async function isBiometricEnabled(): Promise<boolean> {
  return (await prefGet(BIOMETRIC_ENABLED_KEY)) === "true";
}

/**
 * Persist the user's biometric-login preference.
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await prefSet(BIOMETRIC_ENABLED_KEY, "true");
  } else {
    await prefRemove(BIOMETRIC_ENABLED_KEY);
    await prefRemove(BIOMETRIC_TOKEN_KEY);
  }
}

/**
 * Store the refresh token so it can be retrieved after biometric verification.
 */
export async function storeBiometricToken(refreshToken: string): Promise<void> {
  await prefSet(BIOMETRIC_TOKEN_KEY, refreshToken);
}

/**
 * Retrieve the stored refresh token (after a successful biometric check).
 */
export async function getBiometricToken(): Promise<string> {
  return prefGet(BIOMETRIC_TOKEN_KEY);
}

/**
 * Trigger the OS biometric prompt.  Returns true on success, false if the
 * user cancels or biometrics are not available.
 */
export async function verifyBiometric(reason = "Sign in to AJKMart Rider"): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({ reason, cancelTitle: "Cancel" });
    return true;
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/biometric.ts]", err);
    return false;
  } // eslint-disable-line no-console
}

/**
 * Clear all stored biometric data (on logout or when the user disables it).
 */
export async function clearBiometric(): Promise<void> {
  await prefRemove(BIOMETRIC_ENABLED_KEY);
  await prefRemove(BIOMETRIC_TOKEN_KEY);
}
