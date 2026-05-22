import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export type NetworkTier = "slow" | "medium" | "fast";

export interface NetworkQuality {
  tier: NetworkTier;
  isOffline: boolean;
  connectionType: string;
  effectiveType: string;
}

type NetConn = {
  type?: string;
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

function getWebNetworkInfo(): { type: string; effectiveType: string; isOffline: boolean } {
  if (!WEB_NAV) return { type: "unknown", effectiveType: "4g", isOffline: false };
  const conn = WEB_NAV.connection || WEB_NAV.mozConnection || WEB_NAV.webkitConnection;
  return {
    type: conn?.type ?? "unknown",
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

function connectionTypeToTier(type: string, effectiveType?: string): NetworkTier {
  if (effectiveType) return effectiveTypeToTier(effectiveType);
  switch (type) {
    case "cellular":
      return "medium";
    case "wifi":
    case "ethernet":
      return "fast";
    case "none":
    case "unknown":
    default:
      return "medium";
  }
}

export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState<NetworkQuality>({
    tier: "fast",
    isOffline: false,
    connectionType: "unknown",
    effectiveType: "4g",
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (Platform.OS === "web") {
      const update = () => {
        if (!mountedRef.current) return;
        const info = getWebNetworkInfo();
        setQuality({
          tier: info.isOffline ? "slow" : effectiveTypeToTier(info.effectiveType),
          isOffline: info.isOffline,
          connectionType: info.type,
          effectiveType: info.effectiveType,
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
    }

    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const NetInfo = await import("@react-native-community/netinfo");
        unsubscribe = NetInfo.default.addEventListener((state) => {
          if (!mountedRef.current) return;
          const isConnected = state.isConnected ?? true;
          const type = state.type ?? "unknown";
          const details = state.details as { cellularGeneration?: string } | null;
          const cellGen = details?.cellularGeneration;

          let effectiveType = "4g";
          if (cellGen === "2g") effectiveType = "2g";
          else if (cellGen === "3g") effectiveType = "3g";
          else if (cellGen === "4g" || cellGen === "5g") effectiveType = "4g";
          else if (type === "wifi" || type === "ethernet") effectiveType = "4g";

          setQuality({
            tier: !isConnected ? "slow" : connectionTypeToTier(type, effectiveType),
            isOffline: !isConnected,
            connectionType: type,
            effectiveType,
          });
        });
      } catch {
        if (mountedRef.current) {
          setQuality({ tier: "fast", isOffline: false, connectionType: "unknown", effectiveType: "4g" });
        }
      }
    })();

    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, []);

  return quality;
}

export function getImageQualityForTier(tier: NetworkTier): { maxWidth: number; quality: number } {
  switch (tier) {
    case "slow":
      return { maxWidth: 200, quality: 40 };
    case "medium":
      return { maxWidth: 400, quality: 70 };
    case "fast":
    default:
      return { maxWidth: 800, quality: 90 };
  }
}

export function getPollingIntervalForTier(tier: NetworkTier, baseInterval: number): number {
  switch (tier) {
    case "slow":
      return baseInterval * 2;
    case "medium":
      return Math.round(baseInterval * 1.5);
    case "fast":
    default:
      return baseInterval;
  }
}
