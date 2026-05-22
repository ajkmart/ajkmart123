import { getAdminTiming } from "@/lib/adminTiming";
import { createLogger } from "@/lib/logger";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
const log = createLogger("[PullToRefresh]");

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  accentColor?: string;
  className?: string;
  /** Caller can opt in to receive refresh failures (e.g. show a toast). */
  onRefreshError?: (err: unknown) => void;
}

function formatAgo(d: Date | null): string {
  if (!d) return "";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isAtTop(): boolean {
  return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
}

export function PullToRefresh({
  onRefresh,
  children,
  accentColor = "#1A56DB",
  className = "",
  onRefreshError,
}: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [agoText, setAgoText] = useState("");
  const [lastRefreshFailed, setLastRefreshFailed] = useState(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const pulling = useRef(false);
  const intentLocked = useRef(false);
  const isVertical = useRef(false);
  // Read the pull threshold from the centralised admin timing config so
  // it stays in sync with `pullToRefreshIntervalMs` and any backend
  // override published via `admin_timing_pull_to_refresh_threshold_px`.
  const threshold = getAdminTiming().pullToRefreshThresholdPx;

  useEffect(() => {
    const id = setInterval(
      () => setAgoText(formatAgo(lastUpdated)),
      getAdminTiming().pullToRefreshIntervalMs
    );
    return () => clearInterval(id);
  }, [lastUpdated]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      const now = new Date();
      setLastUpdated(now);
      setAgoText(formatAgo(now));
      setLastRefreshFailed(false);
    } catch (err) {
      setLastRefreshFailed(true);
      if (onRefreshError) {
        try {
          onRefreshError(err);
        } catch (cbErr) {
          log.warn("onRefreshError callback threw:", cbErr);
        }
      } else {
        log.warn("onRefresh failed:", err);
      }
    } finally {
      setRefreshing(false);
      setPullY(0);
    }
  }, [onRefresh, onRefreshError]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      if (isAtTop()) {
        startY.current = e.touches[0]!.clientY;
        startX.current = e.touches[0]!.clientX;
        pulling.current = true;
        intentLocked.current = false;
        isVertical.current = false;
      }
    },
    [refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const currentY = e.touches[0]!.clientY;
      const currentX = e.touches[0]!.clientX;
      const dy = currentY - startY.current;
      const dx = currentX - startX.current;

      if (!intentLocked.current && (Math.abs(dy) > 10 || Math.abs(dx) > 10)) {
        intentLocked.current = true;
        isVertical.current = Math.abs(dy) > Math.abs(dx);
        if (!isVertical.current || dy < 0) {
          pulling.current = false;
          return;
        }
      }

      if (!isVertical.current) return;

      const clampedDy = Math.max(0, dy);
      const dampened = Math.min(clampedDy * 0.5, 120);

      if (dampened > 0) {
        e.preventDefault();
      }
      setPullY(dampened);
    },
    [refreshing]
  );

  const onTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    intentLocked.current = false;
    if (pullY >= threshold) {
      void handleRefresh();
    } else {
      setPullY(0);
    }
  }, [pullY, handleRefresh, threshold]);

  const progress = Math.min(pullY / threshold, 1);
  const showIndicator = pullY > 10 || refreshing;

  return (
    <div
      className={`relative ${className}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex flex-col items-center justify-end overflow-hidden transition-all duration-200"
        style={{
          height: showIndicator ? Math.max(pullY, refreshing ? 56 : 0) : 0,
          opacity: showIndicator ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2 pb-2">
          <div
            className="transition-transform duration-200"
            style={{
              transform: refreshing ? "rotate(0deg)" : `rotate(${progress * 360}deg)`,
            }}
          >
            <RefreshCw
              size={20}
              style={{ color: accentColor }}
              className={refreshing ? "animate-spin" : ""}
            />
          </div>
          <span className="text-xs font-medium text-gray-400">
            {refreshing ? "Updating..." : progress >= 1 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      </div>

      {lastUpdated && agoText && !refreshing && (
        <div className="flex items-center justify-center py-1">
          <span
            className={`text-[10px] font-medium ${lastRefreshFailed ? "text-amber-500" : "text-gray-300"}`}
          >
            {lastRefreshFailed ? `Stale — last updated ${agoText}` : `Updated ${agoText}`}
          </span>
        </div>
      )}

      <div
        style={{
          transform: pullY > 0 && !refreshing ? `translateY(${pullY * 0.15}px)` : undefined,
          transition: pulling.current ? "none" : "transform 0.2s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
