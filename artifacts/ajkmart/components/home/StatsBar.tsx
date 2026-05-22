import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import Colors, { spacing, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useTheme } from "@/context/ThemeContext";
import { API_BASE } from "@/utils/api";

const H_PAD = spacing.lg;

function makeStStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: H_PAD,
      marginTop: 8,
      backgroundColor: C.surface,
      borderRadius: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: C.borderLight,
      ...shadows.sm,
    },
    item: { flex: 1, alignItems: "center", gap: 3 },
    iconBox: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    value: { fontFamily: Font.bold, fontSize: 13, color: C.text },
    label: { fontFamily: Font.regular, fontSize: 10, color: C.textMuted },
    divider: { width: 1, height: 36, backgroundColor: C.borderLight },
  });
}

export function ServiceStatsStrip({
  rideCfg,
  features,
}: {
  rideCfg: { bikeMinFare: number };
  features: { mart: boolean; food: boolean; rides: boolean };
}) {
  const { colors: C } = useTheme();
  const st = useMemo(() => makeStStyles(C), [C]);

  const { data, isLoading } = useQuery<{
    productCount?: number;
    restaurantCount?: number;
  }>({
    queryKey: ["home-service-stats"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/stats/public`);
      if (!r.ok) throw new Error("stats fetch failed");
      return r
        .json()
        .then(
          (j: { data?: { productCount?: number; restaurantCount?: number } }) =>
            (j?.data ?? j) as {
              productCount?: number;
              restaurantCount?: number;
            },
        );
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const stats: {
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  }[] = [];

  if (features.mart) {
    const productCount: number = data?.productCount ?? 0;
    stats.push({
      label: "Products",
      value: isLoading
        ? "…"
        : productCount > 0
          ? `${productCount.toLocaleString()}+`
          : "—",
      icon: "cube-outline",
      color: C.primary,
    });
  }

  if (features.food) {
    const restaurantCount: number = data?.restaurantCount ?? 0;
    stats.push({
      label: "Restaurants",
      value: isLoading
        ? "…"
        : restaurantCount > 0
          ? `${restaurantCount}+`
          : "—",
      icon: "restaurant-outline",
      color: C.food,
    });
  }

  if (features.rides) {
    stats.push({
      label: "Min Ride",
      value: `Rs.${rideCfg.bikeMinFare}`,
      icon: "bicycle-outline",
      color: C.ride,
    });
  }

  if (stats.length === 0) return null;

  return (
    <View style={st.wrap}>
      {stats.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <View style={st.divider} />}
          <View style={st.item}>
            <View style={[st.iconBox, { backgroundColor: `${s.color}18` }]}>
              <Ionicons name={s.icon} size={16} color={s.color} />
            </View>
            <Text style={st.value}>{s.value}</Text>
            <Text style={st.label}>{s.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
