import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform, PixelRatio } from "react-native";
import { useNetworkQuality, type NetworkQuality, type NetworkTier } from "@/hooks/useNetworkQuality";

export type DeviceTier = "low" | "mid" | "high";

export interface PerformanceConfig {
  deviceTier: DeviceTier;
  network: NetworkQuality;
  useGradients: boolean;
  maxConcurrentImages: number;
  enableAnimations: boolean;
  enableParallax: boolean;
  imageQuality: number;
  imageMaxWidth: number;
}

const PerformanceContext = createContext<PerformanceConfig>({
  deviceTier: "high",
  network: { tier: "fast", isOffline: false, connectionType: "unknown", effectiveType: "4g" },
  useGradients: true,
  maxConcurrentImages: 6,
  enableAnimations: true,
  enableParallax: true,
  imageQuality: 90,
  imageMaxWidth: 800,
});

function detectDeviceTier(): DeviceTier {
  if (Platform.OS === "web") {
    const nav: { deviceMemory?: number; hardwareConcurrency?: number } | null =
      typeof navigator !== "undefined" ? navigator : null;
    const ram = nav?.deviceMemory;
    const cores = nav?.hardwareConcurrency;

    if (ram && ram <= 2) return "low";
    if (ram && ram <= 4) return "mid";
    if (cores && cores <= 2) return "low";
    if (cores && cores <= 4) return "mid";
    return "high";
  }

  let score = 0;

  const maxFontScale = PixelRatio.getFontScale();
  const density = PixelRatio.get();

  if (Platform.OS === "android") {
    const version = typeof Platform.Version === "number" ? Platform.Version : 0;
    if (version > 0 && version < 26) score += 2;
    else if (version >= 26 && version < 30) score += 1;
  }

  if (density <= 1.5) score += 2;
  else if (density <= 2) score += 1;

  const jsStart = ((globalThis as any).__BUNDLE_START_TIME__) as number | undefined;
  const now = (globalThis as any).performance?.now?.() ?? 0;
  if (jsStart && now > 0) {
    const startupMs = now - jsStart;
    if (startupMs > 4000) score += 2;
    else if (startupMs > 2000) score += 1;
  }

  if (score >= 4) return "low";
  if (score >= 2) return "mid";
  return "high";
}

function buildConfig(deviceTier: DeviceTier, network: NetworkQuality): PerformanceConfig {
  const isLowDevice = deviceTier === "low";
  const isSlowNetwork = network.tier === "slow";

  return {
    deviceTier,
    network,
    useGradients: !isLowDevice,
    maxConcurrentImages: isLowDevice ? 2 : isSlowNetwork ? 3 : 6,
    enableAnimations: !isLowDevice && !isSlowNetwork,
    enableParallax: !isLowDevice && network.tier === "fast",
    imageQuality: isSlowNetwork ? 40 : isLowDevice ? 60 : 90,
    imageMaxWidth: isSlowNetwork ? 200 : isLowDevice ? 300 : 800,
  };
}

export function PerformanceProvider({ children }: { children: React.ReactNode }) {
  const [deviceTier] = useState<DeviceTier>(() => detectDeviceTier());
  const network = useNetworkQuality();
  const config = useMemo(() => buildConfig(deviceTier, network), [deviceTier, network]);

  return (
    <PerformanceContext.Provider value={config}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformance(): PerformanceConfig {
  return useContext(PerformanceContext);
}
