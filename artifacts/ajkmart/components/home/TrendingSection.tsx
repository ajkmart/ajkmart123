import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { AdaptiveImage } from "@/components/AdaptiveImage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import Colors, { spacing, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useTheme } from "@/context/ThemeContext";
import { WishlistHeart } from "@/components/WishlistHeart";
import { getTrending } from "@workspace/api-client-react";

const H_PAD = spacing.lg;

function makeTr2Styles(C: typeof Colors.light) {
  return StyleSheet.create({
    headerRow: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: H_PAD, marginBottom: 10 },
    title: { fontFamily: Font.bold, fontSize: 16, color: C.text },
    sub: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
    card: { width: 130, backgroundColor: C.surface, borderRadius: 14, overflow: "hidden", ...shadows.sm },
    img: { width: 130, height: 100 },
    info: { padding: 8, gap: 3 },
    name: { fontFamily: Font.medium, fontSize: 11, color: C.text, lineHeight: 15 },
    price: { fontFamily: Font.bold, fontSize: 12, color: C.primary },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    ratingTxt: { fontFamily: Font.regular, fontSize: 10, color: C.textSecondary },
    errorRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: H_PAD, paddingVertical: 12 },
    errorTxt: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  });
}

export function TrendingSection({ limit = 8 }: { limit?: number }) {
  const { colors: C } = useTheme();
  const tr2 = useMemo(() => makeTr2Styles(C), [C]);

  const { data: trending, isError, refetch } = useQuery({
    queryKey: ["trending-products", limit],
    queryFn: () => getTrending({ limit }),
    staleTime: 5 * 60 * 1000,
  });

  const items = trending ?? [];

  if (isError) {
    return (
      <View style={{ marginTop: 16 }}>
        <View style={tr2.headerRow}>
          <Text style={tr2.title}>Trending Now</Text>
          <Text style={tr2.sub}>Popular products</Text>
        </View>
        <TouchableOpacity activeOpacity={0.7} onPress={() => refetch()} style={tr2.errorRow} accessibilityRole="button" accessibilityLabel="Retry trending">
          <Ionicons name="refresh-outline" size={16} color={C.textMuted} />
          <Text style={tr2.errorTxt}>Couldn't load trending. Tap to retry.</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: 16 }}>
      <View style={tr2.headerRow}>
        <Text style={tr2.title}>Trending Now</Text>
        <Text style={tr2.sub}>Popular products</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: H_PAD, gap: 10 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
            style={tr2.card}
            accessibilityLabel={item.name}
          >
            <View style={{ position: "relative" }}>
              {item.image ? (
                <AdaptiveImage uri={item.image} style={tr2.img} contentFit="cover" />
              ) : (
                <View style={[tr2.img, { backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="cube-outline" size={24} color={C.textMuted} />
                </View>
              )}
              <WishlistHeart productId={item.id} size={14} style={{ position: "absolute", top: 6, right: 6 }} />
            </View>
            <View style={tr2.info}>
              <Text style={tr2.name} numberOfLines={2}>{item.name}</Text>
              <Text style={tr2.price}>Rs. {Number(item.price).toLocaleString()}</Text>
              {item.rating ? (
                <View style={tr2.ratingRow}>
                  <Ionicons name="star" size={10} color={C.gold} />
                  <Text style={tr2.ratingTxt}>{Number(item.rating).toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
