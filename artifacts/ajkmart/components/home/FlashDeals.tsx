import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, FlatList, StyleSheet, Platform } from "react-native";
import { AdaptiveImage } from "@/components/AdaptiveImage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import Colors, { spacing, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useTheme } from "@/context/ThemeContext";
import { SkeletonBlock } from "@/components/user-shared";
import { WishlistHeart } from "@/components/WishlistHeart";
import { getFlashDeals } from "@workspace/api-client-react";
import { tDual } from "@workspace/i18n";

const H_PAD = spacing.lg;

function FlashCountdownTimer({ targetTime }: { targetTime: Date }) {
  const [timeLeft, setTimeLeft] = React.useState({ d: 0, h: 0, m: 0, s: 0 });

  React.useEffect(() => {
    if (!targetTime || !(targetTime instanceof Date) || isNaN(targetTime.getTime())) return;
    const update = () => {
      const diff = Math.max(0, targetTime.getTime() - Date.now());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft({ d, h, m, s });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const totalHours = timeLeft.d * 24 + timeLeft.h;
  const isUrgent = totalHours < 2;
  const boxBg = isUrgent ? "#DC2626" : "#1F2937";

  return (
    <View style={fct.wrap}>
      {timeLeft.d > 0 && (
        <>
          <View style={[fct.box, { backgroundColor: boxBg }]}>
            <Text style={fct.digit}>{pad(timeLeft.d)}</Text>
            <Text style={fct.unit}>DAY</Text>
          </View>
          <Text style={[fct.sep, isUrgent && { color: "#DC2626" }]}>:</Text>
        </>
      )}
      <View style={[fct.box, { backgroundColor: boxBg }]}>
        <Text style={fct.digit}>{pad(timeLeft.h)}</Text>
        <Text style={fct.unit}>HR</Text>
      </View>
      <Text style={[fct.sep, isUrgent && { color: "#DC2626" }]}>:</Text>
      <View style={[fct.box, { backgroundColor: boxBg }]}>
        <Text style={fct.digit}>{pad(timeLeft.m)}</Text>
        <Text style={fct.unit}>MIN</Text>
      </View>
      <Text style={[fct.sep, isUrgent && { color: "#DC2626" }]}>:</Text>
      <View style={[fct.box, { backgroundColor: boxBg }]}>
        <Text style={fct.digit}>{pad(timeLeft.s)}</Text>
        <Text style={fct.unit}>SEC</Text>
      </View>
    </View>
  );
}

const fct = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  box: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, alignItems: "center", minWidth: 28 },
  digit: { fontFamily: Font.bold, fontSize: 12, color: "#fff", lineHeight: 16 },
  unit: { fontFamily: Font.bold, fontSize: 6, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 },
  sep: { fontFamily: Font.bold, fontSize: 12, color: "#1F2937", marginTop: -4 },
});

function makeFdStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    section: { marginHorizontal: H_PAD, marginTop: 16, backgroundColor: C.surface, borderRadius: 16, overflow: "hidden", ...shadows.sm },
    headerGrad: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerInner: { flexDirection: "row", alignItems: "center", gap: 6 },
    headerTitle: { fontFamily: Font.bold, fontSize: 15, color: "#fff" },
    timerWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
    endsLabel: { fontFamily: Font.medium, fontSize: 10, color: "rgba(255,255,255,0.8)" },
    row: { gap: 8, paddingHorizontal: 10, paddingVertical: 12 },
    card: { width: 120, backgroundColor: C.background, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: C.borderLight, position: "relative" as const },
    discBadgeCorner: { position: "absolute" as const, top: 4, left: 4, zIndex: 5, backgroundColor: "#FF4444", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, alignItems: "center" },
    discBadgeText: { fontFamily: Font.bold, fontSize: 11, color: "#fff", lineHeight: 14 },
    discBadgeOff: { fontFamily: Font.bold, fontSize: 7, color: "rgba(255,255,255,0.85)", letterSpacing: 0.5 },
    imgWrap: { width: 120, height: 100, backgroundColor: "#FAFAFA" },
    productImg: { width: 120, height: 100 },
    cardInfo: { padding: 8, gap: 4 },
    name: { fontFamily: Font.medium, fontSize: 11, color: C.text, lineHeight: 15 },
    priceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    dealPrice: { fontFamily: Font.bold, fontSize: 13, color: "#FF4444" },
    origPrice: { fontFamily: Font.regular, fontSize: 10, color: C.textMuted, textDecorationLine: "line-through" },
    progressWrap: { marginTop: 2 },
    progressBg: { height: 14, backgroundColor: "#FFE4E1", borderRadius: 7, overflow: "hidden", position: "relative" as const, justifyContent: "center" },
    progressFill: { position: "absolute" as const, left: 0, top: 0, bottom: 0, borderRadius: 7 },
    progressText: { fontFamily: Font.bold, fontSize: 8, color: "#fff", textAlign: "center", zIndex: 1 },
    errorRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 20 },
    errorTxt: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  });
}

export function FlashDealsSection({ T, limit = 10 }: { T: (key: Parameters<typeof tDual>[0]) => string; limit?: number }) {
  const { colors: C } = useTheme();
  const fd = useMemo(() => makeFdStyles(C), [C]);

  const { data: deals, isLoading, isError, refetch } = useQuery({
    queryKey: ["flash-deals", limit],
    queryFn: () => getFlashDeals({ limit }),
    staleTime: 3 * 60 * 1000,
  });

  const items = deals ?? [];
  const earliestExpiry = useMemo(() => {
    if (items.length === 0) return null;
    const times = items.map((d: { dealExpiresAt: string }) => new Date(d.dealExpiresAt).getTime()).filter((t: number) => !isNaN(t));
    if (times.length === 0) return null;
    return new Date(Math.min(...times));
  }, [items]);

  if (isLoading) {
    return (
      <View style={fd.section}>
        <LinearGradient colors={["#FF4444", "#FF6B35"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={fd.headerGrad}>
          <View style={fd.headerInner}>
            <Ionicons name="flash" size={16} color="#FFD700" />
            <Text style={fd.headerTitle}>{T("todaysDeals")}</Text>
          </View>
        </LinearGradient>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fd.row}>
          {[0,1,2,3].map(i => (
            <View key={i} style={fd.card}>
              <SkeletonBlock w={100} h={100} r={8} />
              <SkeletonBlock w={80} h={12} r={4} />
              <SkeletonBlock w={60} h={14} r={4} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={fd.section}>
        <LinearGradient colors={["#FF4444", "#FF6B35"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={fd.headerGrad}>
          <View style={fd.headerInner}>
            <Ionicons name="flash" size={16} color="#FFD700" />
            <Text style={fd.headerTitle}>{T("todaysDeals")}</Text>
          </View>
        </LinearGradient>
        <TouchableOpacity activeOpacity={0.7} onPress={() => refetch()} style={fd.errorRow} accessibilityRole="button" accessibilityLabel="Retry flash deals">
          <Ionicons name="refresh-outline" size={16} color={C.textMuted} />
          <Text style={fd.errorTxt}>Couldn't load deals. Tap to retry.</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={fd.section}>
      <LinearGradient colors={["#FF4444", "#FF6B35"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={fd.headerGrad}>
        <View style={fd.headerInner}>
          <Ionicons name="flash" size={16} color="#FFD700" />
          <Text style={fd.headerTitle}>{T("todaysDeals")}</Text>
          <Ionicons name="flash" size={12} color="#FFD700" style={{ opacity: 0.6 }} />
        </View>
        {earliestExpiry !== null && (
          <View style={fd.timerWrap}>
            <Text style={fd.endsLabel}>Ends in</Text>
            <FlashCountdownTimer targetTime={earliestExpiry} />
          </View>
        )}
      </LinearGradient>
      <FlatList
        horizontal
        data={items}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={fd.row}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const soldPct = item.dealStock && item.dealStock > 0
            ? Math.min(Math.round((item.soldCount / item.dealStock) * 100), 99)
            : 0;
          return (
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
              style={fd.card}
              accessibilityLabel={`${item.name} ${item.discountPercent}% OFF`}
              accessibilityHint="Tap to view this flash deal product"
            >
              <View style={fd.discBadgeCorner}>
                <Text style={fd.discBadgeText}>{item.discountPercent}%</Text>
                <Text style={fd.discBadgeOff}>OFF</Text>
              </View>
              <View style={fd.imgWrap}>
                {item.image ? (
                  <AdaptiveImage uri={item.image} style={fd.productImg} contentFit="cover" />
                ) : (
                  <View style={[fd.productImg, { backgroundColor: "#FFF5F5", alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="flash" size={28} color="#FF4444" />
                  </View>
                )}
              </View>
              <View style={fd.cardInfo}>
                <Text style={fd.name} numberOfLines={2}>{item.name}</Text>
                <View style={fd.priceRow}>
                  <Text style={fd.dealPrice}>Rs.{Math.round(Number(item.price)).toLocaleString()}</Text>
                  {Number(item.originalPrice) > Number(item.price) && (
                    <Text style={fd.origPrice}>Rs.{Math.round(Number(item.originalPrice)).toLocaleString()}</Text>
                  )}
                </View>
                {soldPct > 0 && (
                <View style={fd.progressWrap}>
                  <View style={fd.progressBg}>
                    <LinearGradient
                      colors={soldPct >= 70 ? ["#FF4444", "#FF6B35"] : ["#FF8C00", "#FFB347"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[fd.progressFill, { width: `${soldPct}%` }]}
                    />
                    <Text style={fd.progressText}>
                      {soldPct >= 70 ? "Almost Gone!" : `${soldPct}% claimed`}
                    </Text>
                  </View>
                </View>
                )}
                <WishlistHeart productId={item.id} size={14} style={{ position: "absolute", top: 4, right: 4, zIndex: 10 }} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
