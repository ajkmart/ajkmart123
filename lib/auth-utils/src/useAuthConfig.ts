/**
 * useAuthConfig — shared hook for config-driven auth UI.
 *
 * Fetches auth configuration from platform_settings (via the public
 * /api/auth/config endpoint) and returns flags that drive which login
 * UI panels are shown.
 *
 * Auth modes:
 *   OTP      — phone + SMS OTP (default)
 *   EMAIL    — email + password only (hide phone/OTP inputs)
 *   FIREBASE — Firebase phone auth or Google Sign-In (show Firebase UI)
 *   HYBRID   — OTP primary + Firebase optional
 */

import { useEffect, useState } from "react";

export interface AuthConfig {
  authMode: "OTP" | "EMAIL" | "FIREBASE" | "HYBRID";
  firebaseEnabled: boolean;
  otpEnabled: boolean;
  emailLoginEnabled: boolean;
  googleEnabled: boolean;
  facebookEnabled: boolean;
  loaded: boolean;
}

/* Raw API response shape — snake_case, matches /api/auth/config */
interface AuthConfigApiResponse {
  auth_mode?: string;
  firebase_enabled?: string;
  auth_otp_enabled?: string;
  auth_email_enabled?: string;
  auth_google_enabled?: string;
  auth_facebook_enabled?: string;
  otpBypassActive?: boolean;
  otpBypassExpiresAt?: string | null;
  bypassMessage?: string | null;
}

const DEFAULT_CONFIG: AuthConfig = {
  authMode: "OTP",
  firebaseEnabled: false,
  otpEnabled: true,
  emailLoginEnabled: true,
  googleEnabled: true,
  facebookEnabled: false,
  loaded: false,
};

/* In-memory cache so multiple consumers don't re-fetch */
let _cache: AuthConfig | null = null;
let _fetchPromise: Promise<AuthConfig> | null = null;

async function fetchAuthConfig(apiBase: string): Promise<AuthConfig> {
  if (_cache) return _cache;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const res = await fetch(`${apiBase}/auth/config`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return DEFAULT_CONFIG;
      const data = (await res.json()) as AuthConfigApiResponse;

      const config: AuthConfig = {
        authMode: (data.auth_mode as AuthConfig["authMode"]) ?? "OTP",
        firebaseEnabled: data.firebase_enabled === "on",
        otpEnabled: data.auth_otp_enabled !== "off",
        emailLoginEnabled: data.auth_email_enabled !== "off",
        googleEnabled: data.auth_google_enabled !== "off",
        facebookEnabled: data.auth_facebook_enabled === "on",
        loaded: true,
      };
      _cache = config;
      return config;
    } catch {
      return { ...DEFAULT_CONFIG, loaded: true };
    }
  })();

  return _fetchPromise;
}

/**
 * Hook — returns the auth config and a loading state.
 * @param apiBase  Base API URL e.g. "/api" or "https://myapp.com/api"
 */
export function useAuthConfig(apiBase = "/api"): AuthConfig {
  const [config, setConfig] = useState<AuthConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetchAuthConfig(apiBase)
      .then(setConfig)
      .catch(() => setConfig({ ...DEFAULT_CONFIG, loaded: true }));
  }, [apiBase]);

  return config;
}

/** Invalidate cache (call after admin changes auth settings) */
export function invalidateAuthConfigCache() {
  _cache = null;
  _fetchPromise = null;
}
