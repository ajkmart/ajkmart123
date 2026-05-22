import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLogger } from "@/utils/logger";
const log = createLogger("[useOTPBypass]");

export interface AuthConfig {
  auth_mode: string;
  firebase_enabled: string;
  auth_otp_enabled: string;
  auth_email_enabled: string;
  auth_google_enabled: string;
  auth_facebook_enabled: string;
  otpBypassActive?: boolean;
  otpBypassExpiresAt?: string | null;
  bypassReason?: "global_disable" | "maintenance" | null;
  bypassMessage?: string | null;
}

const CACHE_KEY = "authConfigCache";
const CACHE_TIME_KEY = "authConfigCacheTime";
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minute cache
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minute poll (was 30s causing 429)

/**
 * useOTPBypass hook for Customer App (AJKMart)
 *
 * Fetches OTP bypass status from the auth config endpoint.
 * Caches config in AsyncStorage for 5 minutes to reduce API calls.
 * Polls every 5 minutes (was 30s causing rate limit 429 errors).
 * Skips fetch if cache is fresh to avoid unnecessary requests.
 *
 * Uses AsyncStorage (not localStorage) so it works correctly on device.
 */
export const useOTPBypass = () => {
  const [bypassActive, setBypassActive] = useState(false);
  const [bypassExpiresAt, setBypassExpiresAt] = useState<Date | null>(null);
  const [bypassMessage, setBypassMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let abortController = new AbortController();

    const fetchAuthConfig = async () => {
      if (abortController.signal.aborted) return;
      
      try {
        // Skip fetch if cache is fresh (less than 5 minutes old)
        const cacheTime = await AsyncStorage.getItem(CACHE_TIME_KEY);
        if (cacheTime && Date.now() - parseInt(cacheTime, 10) < CACHE_TTL_MS) {
          const cached = await AsyncStorage.getItem(CACHE_KEY);
          if (cached) {
            const config: AuthConfig = JSON.parse(cached);
            setBypassActive(!!config.otpBypassActive);
            if (config.otpBypassExpiresAt) {
              setBypassExpiresAt(new Date(config.otpBypassExpiresAt));
            } else {
              setBypassExpiresAt(null);
            }
            setBypassMessage(config.bypassMessage || null);
            setLoading(false);
            return;
          }
        }

        setLoading(true);
        const response = await fetch("/api/auth/config", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          log.error(`Auth config HTTP error: ${response.status} ${response.statusText}`);
          throw new Error(`Failed to fetch auth config: HTTP ${response.status}`);
        }

        const config: AuthConfig = await response.json();

        setBypassActive(!!config.otpBypassActive);
        if (config.otpBypassExpiresAt) {
          setBypassExpiresAt(new Date(config.otpBypassExpiresAt));
        } else {
          setBypassExpiresAt(null);
        }
        setBypassMessage(config.bypassMessage || null);

        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(config));
        await AsyncStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      } catch (error) {
        log.error("Failed to fetch config:", error);

        try {
          const cacheTime = await AsyncStorage.getItem(CACHE_TIME_KEY);
          if (cacheTime && Date.now() - parseInt(cacheTime, 10) < CACHE_TTL_MS) {
            const cached = await AsyncStorage.getItem(CACHE_KEY);
            if (cached) {
              const config: AuthConfig = JSON.parse(cached);
              setBypassActive(!!config.otpBypassActive);
              if (config.otpBypassExpiresAt) {
                setBypassExpiresAt(new Date(config.otpBypassExpiresAt));
              }
              setBypassMessage(config.bypassMessage || null);
            }
          }
        } catch (cacheError) {
          log.error("Failed to read cache:", cacheError);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAuthConfig();

    const interval = setInterval(fetchAuthConfig, POLL_INTERVAL_MS);
    return () => {
      abortController.abort();
      clearInterval(interval);
    };
  }, []);

  const remainingSeconds = bypassExpiresAt
    ? Math.max(0, Math.ceil((bypassExpiresAt.getTime() - Date.now()) / 1000))
    : 0;

  const isExpired = remainingSeconds === 0 && bypassActive;

  return {
    bypassActive: bypassActive && !isExpired,
    bypassExpiresAt: isExpired ? null : bypassExpiresAt,
    bypassMessage,
    remainingSeconds,
    loading,
  };
};
