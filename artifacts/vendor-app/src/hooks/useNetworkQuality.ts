import { useEffect, useRef, useState } from "react";

export type NetworkTier = "slow" | "medium" | "fast";

type NetConn = {
  effectiveType?: string;
  addEventListener?: (event: string, cb: () => void) => void;
  removeEventListener?: (event: string, cb: () => void) => void;
};

interface NavigatorWithConnection {
  connection?: NetConn;
  mozConnection?: NetConn;
  webkitConnection?: NetConn;
  onLine?: boolean;
}

const WEB_NAV: NavigatorWithConnection | null =
  typeof navigator !== "undefined" ? (navigator as NavigatorWithConnection) : null;

function getWebNetworkInfo(): { effectiveType: string; isOffline: boolean } {
  if (!WEB_NAV) return { effectiveType: "medium-fallback", isOffline: false };
  const conn = WEB_NAV.connection || WEB_NAV.mozConnection || WEB_NAV.webkitConnection;
  const isOffline = WEB_NAV.onLine === false;
  if (!conn || conn.effectiveType === undefined) {
    return { effectiveType: "medium-fallback", isOffline };
  }
  return { effectiveType: conn.effectiveType, isOffline };
}

function effectiveTypeToTier(effectiveType: string): NetworkTier {
  switch (effectiveType) {
    case "slow-2g":
    case "2g":
      return "slow";
    case "3g":
    case "medium-fallback":
      return "medium";
    case "4g":
      return "fast";
    default:
      return "medium";
  }
}

export function useNetworkQuality(): {
  tier: NetworkTier;
  isSlowNetwork: boolean;
  isOffline: boolean;
} {
  const [quality, setQuality] = useState<{ tier: NetworkTier; isOffline: boolean }>({
    tier: "medium",
    isOffline: false,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const update = () => {
      if (!mountedRef.current) return;
      const info = getWebNetworkInfo();
      setQuality({
        tier: info.isOffline ? "slow" : effectiveTypeToTier(info.effectiveType),
        isOffline: info.isOffline,
      });
    };

    update();

    const conn = WEB_NAV?.connection || WEB_NAV?.mozConnection || WEB_NAV?.webkitConnection;
    conn?.addEventListener?.("change", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      mountedRef.current = false;
      conn?.removeEventListener?.("change", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return {
    tier: quality.tier,
    isSlowNetwork: quality.tier === "slow",
    isOffline: quality.isOffline,
  };
}

export function getPollingIntervalForTier(tier: NetworkTier): number {
  switch (tier) {
    case "slow":
      return 10_000;
    case "medium":
      return 7_500;
    case "fast":
    default:
      return 5_000;
  }
}
