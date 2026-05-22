import { createLogger } from "@/lib/logger";
import { useEffect, useState } from "react";
import { useRiderAuthConfig } from "../lib/AuthConfigContext";
const log = createLogger("[useOTPBypass]");

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * useOTPBypass hook for Rider App
 *
 * When `phone` is provided, queries /api/auth/otp-status?phone= for per-user,
 * global, timed-disable, and whitelist bypass state.
 *
 * When no phone is provided, bypass state is read directly from the shared
 * RiderAuthConfigContext (zero extra network calls — auth config is fetched
 * once at boot and cached via React Query with staleTime: Infinity).
 */
export const useOTPBypass = (phone?: string) => {
  const authCtx = useRiderAuthConfig();

  /* Per-phone state — populated only when a phone is supplied */
  const [bypassActive, setBypassActive] = useState(false);
  const [bypassExpiresAt, setBypassExpiresAt] = useState<Date | null>(null);
  const [bypassMessage, setBypassMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!phone);

  useEffect(() => {
    if (!phone) {
      /* No phone — nothing to fetch; global state comes from context */
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    const cacheKey = `otpBypassCache_${phone}`;
    const cacheTimeKey = `otpBypassCacheTime_${phone}`;

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
        const cacheTime = sessionStorage.getItem(cacheTimeKey);
        if (cacheTime && Date.now() - parseInt(cacheTime, 10) < CACHE_TTL_MS) {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            try {
              applyData(JSON.parse(cached));
            } catch (err) {
              log.warn("OTP bypass cache parse failed:", err);
            }
            setLoading(false);
            return;
          }
        }

        setLoading(true);
        const response = await fetch(`/api/auth/otp-status?phone=${encodeURIComponent(phone)}`, {
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        applyData(data);
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
        sessionStorage.setItem(cacheTimeKey, Date.now().toString());
      } catch (error) {
        log.error("Failed to fetch otp-status:", error);
        const cacheTime = sessionStorage.getItem(cacheTimeKey);
        if (cacheTime && Date.now() - parseInt(cacheTime, 10) < CACHE_TTL_MS) {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            try {
              applyData(JSON.parse(cached));
            } catch (err) {
              log.warn("OTP bypass cache parse failed:", err);
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

  /* Merge per-phone state (when phone provided) with global context state */
  const effectiveBypassActive = phone ? bypassActive : authCtx.otpBypassActive;
  const effectiveMessage = phone ? bypassMessage : null;
  const effectiveExpiresAt = phone ? bypassExpiresAt : null;

  const remainingSeconds = effectiveExpiresAt
    ? Math.max(0, Math.ceil((effectiveExpiresAt.getTime() - Date.now()) / 1000))
    : 0;
  const isExpired = remainingSeconds === 0 && effectiveBypassActive && effectiveExpiresAt != null;

  return {
    bypassActive: effectiveBypassActive && !isExpired,
    bypassExpiresAt: isExpired ? null : effectiveExpiresAt,
    bypassMessage: effectiveMessage,
    remainingSeconds,
    loading: phone ? loading : false,
  };
};
