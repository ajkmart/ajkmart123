import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type RelativePathString } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import { spacing } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { usePerformance } from "@/context/PerformanceContext";
import { getPollingIntervalForTier } from "@/hooks/useNetworkQuality";
import { unwrapApiResponse, API_BASE } from "@/utils/api";

const H_PAD = spacing.lg;

export function ActiveTrackerStrip({ userId }: { userId: string }) {
  const { token } = useAuth();
  const { config: pCfg } = usePlatformConfig();
  const { network } = usePerformance();
  const authHdrs: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const pollInterval = getPollingIntervalForTier(network.tier, 30000);

  const {
    data: ordersData,
    isLoading: ordersLoading,
    isError: ordersError,
  } = useQuery({
    queryKey: ["home-active-orders", userId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/orders?status=active`, {
        headers: authHdrs,
      });
      if (!r.ok) throw new Error("orders fetch failed");
      return r.json().then(unwrapApiResponse);
    },
    enabled: !!userId && !!token,
    refetchInterval: pollInterval,
    staleTime: Math.max(pollInterval - 5000, 5000),
  });

  const {
    data: ridesData,
    isLoading: ridesLoading,
    isError: ridesError,
  } = useQuery({
    queryKey: ["home-active-rides", userId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/rides?status=active`, {
        headers: authHdrs,
      });
      if (!r.ok) throw new Error("rides fetch failed");
      return r.json().then(unwrapApiResponse);
    },
    enabled: !!userId && !!token,
    refetchInterval: pollInterval,
    staleTime: Math.max(pollInterval - 5000, 5000),
  });

  if (!pCfg.content.trackerBannerEnabled) return null;
  if (ordersLoading || ridesLoading) return null;
  if (ordersError || ridesError) return null;

  type StatusItem = { id?: string; status: string };
  const ordersList: StatusItem[] = Array.isArray(ordersData)
    ? (ordersData as StatusItem[])
    : ((ordersData as { orders?: StatusItem[] })?.orders ?? []);
  const ridesList: StatusItem[] = Array.isArray(ridesData)
    ? (ridesData as StatusItem[])
    : ((ridesData as { rides?: StatusItem[] })?.rides ?? []);
  const activeOrders = ordersList.filter(
    (o) => !["delivered", "cancelled"].includes(o.status),
  );
  const activeRides = ridesList.filter(
    (r) => !["completed", "cancelled"].includes(r.status),
  );
  const total = activeOrders.length + activeRides.length;
  if (total === 0) return null;

  const items: {
    label: string;
    sublabel: string;
    route: string;
    c1: string;
    c2: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [];
  if (activeOrders.length > 0) {
    items.push({
      label: `${activeOrders.length} Active Order${activeOrders.length > 1 ? "s" : ""}`,
      sublabel: "Tap to track",
      route: activeOrders[0]?.id
        ? `/orders/${activeOrders[0].id}`
        : "/(tabs)/orders",
      c1: "#F59E0B",
      c2: "#D97706",
      icon: "bag-outline",
    });
  }
  if (activeRides.length > 0) {
    items.push({
      label: `${activeRides.length} Active Ride${activeRides.length > 1 ? "s" : ""}`,
      sublabel: "Tap to track",
      route: activeRides[0]?.id
        ? `/ride?rideId=${activeRides[0].id}`
        : "/(tabs)/orders",
      c1: "#10B981",
      c2: "#059669",
      icon: "car-outline",
    });
  }

  return (
    <View style={tr.wrap}>
      {items.map((item, i) => (
        <TouchableOpacity
          activeOpacity={0.7}
          key={i}
          onPress={() => router.push(item.route as RelativePathString)}
          accessibilityRole="button"
          accessibilityLabel={`${item.label}. Tap to track`}
        >
          <LinearGradient
            colors={[item.c1, item.c2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={tr.card}
          >
            <View style={tr.iconWrap}>
              <Ionicons name={item.icon} size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={tr.label}>{item.label}</Text>
              <Text style={tr.sub}>{item.sublabel}</Text>
            </View>
            <View style={tr.ctaWrap}>
              <Text style={tr.ctaTxt}>Track</Text>
              <Ionicons name="arrow-forward" size={12} color={item.c1} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tr = StyleSheet.create({
  wrap: { marginHorizontal: H_PAD, marginTop: 10, gap: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontFamily: Font.bold, fontSize: 14, color: "#fff" },
  sub: {
    fontFamily: Font.regular,
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    marginTop: 1,
  },
  ctaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  ctaTxt: { fontFamily: Font.semiBold, fontSize: 12, color: "#000" },
});
