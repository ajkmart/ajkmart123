import { createLogger } from "@/lib/logger";
import { useEffect, useState } from "react";
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

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minute poll (was 30s causing 429 errors)

/**
 * useOTPBypass hook for Vendor App
 *
 * When `phone` is provided, queries /auth/otp-status?phone= for per-user,
 * global, timed-disable, and whitelist bypass state (in priority order).
 * Without a phone, falls back to /auth/config for global-only state.
 * Polls every 5 minutes (was 30s causing rate limit 429 errors).
 * Skips fetch if cache is fresh to avoid unnecessary requests.
 */
export const useOTPBypass = (phone?: string) => {
  const [bypassActive, setBypassActive] = useState(false);
  const [bypassExpiresAt, setBypassExpiresAt] = useState<Date | null>(null);
  const [bypassMessage, setBypassMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();
    const cacheKey = phone ? `otpBypassCache_${phone}` : "authConfigCache";
    const cacheTimeKey = phone ? `otpBypassCacheTime_${phone}` : "authConfigCacheTime";

    const applyData = (data: {
      bypassActive?: boolean;
      otpBypassActive?: boolean;
      bypassExpiresAt?: string | null;
      otpBypassExpiresAt?: string | null;
      message?: string | null;
      bypassMessage?: string | null;
    }) => {
      setBypassActive(!!(data.bypassActive ?? data.otpBypassActive));
      const expiresStr = data.bypassExpiresAt ?? data.otpBypassExpiresAt ?? null;
      setBypassExpiresAt(expiresStr ? new Date(expiresStr) : null);
      setBypassMessage(data.message ?? data.bypassMessage ?? null);
    };

    const fetchStatus = async () => {
      if (abortController.signal.aborted) return;

      try {
        // Skip fetch if cache is fresh
        const cacheTime = localStorage.getItem(cacheTimeKey);
        if (cacheTime && Date.now() - parseInt(cacheTime, 10) < CACHE_TTL_MS) {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              applyData(JSON.parse(cached));
            } catch (err) {
              console.warn("[artifacts/vendor-app/src/hooks/useOTPBypass.ts]", err);
            } // eslint-disable-line no-console
            setLoading(false);
            return;
          }
        }

        setLoading(true);
        const url = phone
          ? `/api/auth/otp-status?phone=${encodeURIComponent(phone)}`
          : "/api/auth/config";
        const response = await fetch(url, {
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        applyData(data);
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
          localStorage.setItem(cacheKey, JSON.stringify(data));
          localStorage.setItem(cacheTimeKey, Date.now().toString());
        }
      } catch (error) {
        log.error("Failed to fetch:", error);
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
          const cacheTime = localStorage.getItem(cacheTimeKey);
          if (cacheTime && Date.now() - parseInt(cacheTime, 10) < 5 * 60 * 1000) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
              try {
                applyData(JSON.parse(cached));
              } catch (err) {
                console.warn("[artifacts/vendor-app/src/hooks/useOTPBypass.ts]", err);
              } // eslint-disable-line no-console
            }
          }
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      abortController.abort();
      clearInterval(interval);
    };
  }, [phone]);

  const remainingSeconds = bypassExpiresAt
    ? Math.max(0, Math.ceil((bypassExpiresAt.getTime() - Date.now()) / 1000))
    : 0;

  const isExpired = remainingSeconds === 0 && bypassActive && bypassExpiresAt != null;

  return {
    bypassActive: bypassActive && !isExpired,
    bypassExpiresAt: isExpired ? null : bypassExpiresAt,
    bypassMessage,
    remainingSeconds,
    loading,
  };
};
