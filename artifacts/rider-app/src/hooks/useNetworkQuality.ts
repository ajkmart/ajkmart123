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
  if (!WEB_NAV) return { effectiveType: "4g", isOffline: false };
  const conn = WEB_NAV.connection || WEB_NAV.mozConnection || WEB_NAV.webkitConnection;
  return {
    effectiveType: conn?.effectiveType ?? "4g",
    isOffline: WEB_NAV.onLine === false,
  };
}

function effectiveTypeToTier(effectiveType: string): NetworkTier {
  switch (effectiveType) {
    case "slow-2g":
    case "2g":
      return "slow";
    case "3g":
      return "medium";
    case "4g":
    default:
      return "fast";
  }
}

export function useNetworkQuality(): { tier: NetworkTier; isOffline: boolean } {
  const [quality, setQuality] = useState<{ tier: NetworkTier; isOffline: boolean }>({
    tier: "fast",
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

  return quality;
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
