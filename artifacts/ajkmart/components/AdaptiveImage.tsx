import React, { useMemo, useState } from "react";
import { Image } from "expo-image";
import { View, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import { usePerformance } from "@/context/PerformanceContext";

interface AdaptiveImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none";
  placeholderColor?: string;
  blurhash?: string;
  children?: React.ReactNode;
}

function adaptUri(uri: string, maxWidth: number, quality: number): string {
  try {
    const url = new URL(uri);
    if (!url.searchParams.has("w")) url.searchParams.set("w", String(maxWidth));
    if (!url.searchParams.has("q")) url.searchParams.set("q", String(quality));
    return url.toString();
  } catch {
    return uri;
  }
}

const SKELETON_BLURHASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

export function AdaptiveImage({
  uri,
  style,
  contentFit = "cover",
  placeholderColor = "#F3F4F6",
  blurhash,
  children,
}: AdaptiveImageProps) {
  const { imageMaxWidth, imageQuality, network } = usePerformance();
  const [error, setError] = useState(false);

  const adaptedUri = useMemo(
    () => (uri ? adaptUri(uri, imageMaxWidth, imageQuality) : null),
    [uri, imageMaxWidth, imageQuality],
  );

  const priority = network.tier === "slow" ? "low" : "normal";

  if (!adaptedUri || error) {
    return (
      <View style={[styles.placeholder, { backgroundColor: placeholderColor }, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[style]}>
      <Image
        source={{ uri: adaptedUri }}
        placeholder={{ blurhash: blurhash || SKELETON_BLURHASH }}
        style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
        contentFit={contentFit}
        transition={200}
        cachePolicy="memory-disk"
        priority={priority}
        onError={() => setError(true)}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
});
