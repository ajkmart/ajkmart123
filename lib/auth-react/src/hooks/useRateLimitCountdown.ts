/**
 * useRateLimitCountdown — shared (@workspace/auth-react)
 *
 * Manages the UI state for rate-limited auth operations.
 * When a 429 response is received with a `retryAfter` value, this hook:
 *   1. Starts a countdown timer (in seconds)
 *   2. Returns `isRateLimited = true` so callers can disable submit buttons
 *   3. Returns `secondsLeft` for display ("Try again in 42s")
 *   4. Auto-clears when the countdown reaches zero
 *
 * Usage:
 *   const { isRateLimited, secondsLeft, triggerRateLimit } = useRateLimitCountdown();
 *   // On 429: triggerRateLimit(retryAfterSeconds);
 *   // In JSX: disabled={isRateLimited} — "Try again in {secondsLeft}s"
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface RateLimitCountdown {
  isRateLimited: boolean;
  secondsLeft: number;
  triggerRateLimit: (seconds: number) => void;
  clear: () => void;
}

export function useRateLimitCountdown(): RateLimitCountdown {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSecondsLeft(0);
  }, []);

  const triggerRateLimit = useCallback((seconds: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSecondsLeft(seconds);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    []
  );

  return {
    isRateLimited: secondsLeft > 0,
    secondsLeft,
    triggerRateLimit,
    clear,
  };
}
