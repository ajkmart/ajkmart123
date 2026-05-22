import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePerformance } from "@/context/PerformanceContext";

export function OfflineBar() {
  const { network } = usePerformance();
  const insets = useSafeAreaInsets();

  if (!network.isOffline) return null;

  return (
    <View style={[styles.bar, { paddingTop: Platform.OS === "web" ? 4 : Math.max(insets.top, 4) }]}>
      <View style={styles.dot} />
      <Text style={styles.text}>You're offline — showing cached data</Text>
    </View>
  );
}

export function SlowConnectionBar() {
  const { network } = usePerformance();

  if (network.isOffline || network.tier !== "slow") return null;

  return (
    <View style={styles.slowBar}>
      <Text style={styles.slowText}>Slow connection detected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 4,
    paddingHorizontal: 16,
    gap: 6,
    zIndex: 9999,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  text: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#fff",
  },
  slowBar: {
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    paddingHorizontal: 16,
    zIndex: 9998,
  },
  slowText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#fff",
  },
});
