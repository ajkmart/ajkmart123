import { useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ConnectionState = "online" | "offline" | "restoring";

/**
 * OnlineStatusBanner — explicit "you are offline" indicator that watches
 * `navigator.onLine` and the `online` / `offline` window events.
 *
 * States:
 * - offline: Red/amber banner — "You are offline"
 * - restoring: Transitional 2-second banner — "Restoring connection…"
 *   (fires invalidateQueries so stale data refreshes once the network returns)
 * - online: Renders nothing — zero layout impact in the happy path.
 */
export function OnlineStatusBanner() {
  const queryClient = useQueryClient();
  const [connState, setConnState] = useState<ConnectionState>(() =>
    typeof navigator === "undefined" || navigator.onLine ? "online" : "offline"
  );
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const goOnline = () => {
      // Show "restoring" briefly, then invalidate queries and hide
      setConnState("restoring");
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = setTimeout(() => {
        void queryClient.invalidateQueries();
        setConnState("online");
        restoreTimerRef.current = null;
      }, 2000);
    };

    const goOffline = () => {
      if (restoreTimerRef.current) {
        clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      setConnState("offline");
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    };
  }, [queryClient]);

  if (connState === "online") return null;

  if (connState === "restoring") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="online-status-banner"
        className="fixed inset-x-0 top-0 z-[var(--z-toast,90)] flex items-center justify-center gap-2 border-b border-blue-300 bg-blue-100 px-3 py-2 text-sm font-medium text-blue-900 shadow-sm"
      >
        <Wifi className="h-4 w-4 animate-pulse" aria-hidden="true" />
        <span>Restoring connection…</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="online-status-banner"
      className="fixed inset-x-0 top-0 z-[var(--z-toast,90)] flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 shadow-sm"
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>
        You are offline. Admin actions need a live connection — your changes will fail until the
        network is restored.
      </span>
    </div>
  );
}
