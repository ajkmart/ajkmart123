import React, { useEffect, useRef, useState, useMemo } from "react";
import { createLogger } from "@/utils/logger";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { AdaptiveImage } from "@/components/AdaptiveImage";
import { Ionicons } from "@expo/vector-icons";
import { router, type RelativePathString } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import Colors, { spacing, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useTheme } from "@/context/ThemeContext";
import { SkeletonBlock } from "@/components/user-shared";
import { getBanners, type Banner as _Banner } from "@workspace/api-client-react";
import { SERVICE_REGISTRY } from "@/constants/serviceRegistry";
const log = createLogger("[BannerCarousel]");
type Banner = _Banner & { linkType?: string; linkValue?: string; gradient1?: string; gradient2?: string; subtitle?: string; icon?: string };

const H_PAD = spacing.lg;

function safeNavigate(route: string) {
  const knownRoutes = new Set<string>([
    ...Object.values(SERVICE_REGISTRY).map(s => String(s.route)),
    "/(tabs)", "/(tabs)/orders", "/(tabs)/wallet", "/(tabs)/profile",
    "/cart", "/search", "/categories", "/wishlist",
    "/order", "/ride",
    "/van", "/van/bookings",
    "/mart", "/food", "/pharmacy", "/parcel",
    "/my-reviews",
    "/auth",
    "/recently-viewed",
  ]);
  if (!route || (!knownRoutes.has(route) && !route.startsWith("/(tabs)") && !route.startsWith("/product/"))) {
    log.warn("safeNavigate: unknown route blocked:", route);
    router.push("/(tabs)" as RelativePathString);
    return;
  }
  router.push(route as RelativePathString);
}

function makeBanStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    headerRow: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: H_PAD, marginBottom: 10 },
    headerTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text },
    headerSub: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
    card: { borderRadius: 16, minHeight: 140, overflow: "hidden", position: "relative" as const },
    bgImage: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", borderRadius: 16 },
    overlay: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16 },
    contentWrap: { flexDirection: "row" as const, alignItems: "center" as const, padding: 18, zIndex: 2 },
    blob: { position: "absolute" as const, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)" },
    title: { fontFamily: Font.bold, fontSize: 17, color: "#fff", marginBottom: 4, ...Platform.select({ native: { textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }, web: { textShadow: "0px 1px 3px rgba(0,0,0,0.3)" } }) },
    desc: { fontFamily: Font.regular, fontSize: 12, color: "rgba(255,255,255,0.9)", lineHeight: 17, marginBottom: 10, ...Platform.select({ native: { textShadowColor: "rgba(0,0,0,0.2)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }, web: { textShadow: "0px 1px 2px rgba(0,0,0,0.2)" } }) },
    cta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "flex-start" as const, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
    ctaTxt: { fontFamily: Font.semiBold, fontSize: 12, color: "#fff" },
    iconWrap: { marginLeft: 10 },
    dotsRow: { flexDirection: "row" as const, justifyContent: "center" as const, gap: 6, marginTop: 10 },
    dot: { height: 5, borderRadius: 3 },
    errorCard: { height: 80, borderRadius: 16, backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.borderLight, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    errorTxt: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  });
}

export function DynamicBannerCarousel() {
  const { colors: C } = useTheme();
  const ban = useMemo(() => makeBanStyles(C), [C]);

  const { data: banners, isLoading: bannersLoading, isError: bannersError, refetch: refetchBanners } = useQuery({
    queryKey: ["dynamic-banners", "home"],
    queryFn: () => getBanners({ placement: "home" }),
    staleTime: 5 * 60 * 1000,
  });
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const BANNER_W = windowWidth - H_PAD * 2;
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const items = banners ?? [];

  useEffect(() => {
    if (items.length <= 1) return;
    autoScrollTimer.current = setInterval(() => {
      setActive(prev => {
        const next = (prev + 1) % items.length;
        scrollRef.current?.scrollTo({ x: next * BANNER_W, animated: true });
        return next;
      });
    }, 4000);
    return () => { if (autoScrollTimer.current) clearInterval(autoScrollTimer.current); };
  }, [items.length, BANNER_W]);

  const bannerThrottleRef = useRef<number | null>(null);

  const getBannerCtaText = (b: Banner): string => {
    if (b.linkType === "service" && b.linkValue) {
      const svc = SERVICE_REGISTRY[b.linkValue as keyof typeof SERVICE_REGISTRY];
      return svc?.heroConfig?.cta ?? "Book Now";
    }
    if (b.linkType === "url") return "Learn More";
    if (b.linkType === "route") return "View Details";
    return "Shop Now";
  };

  const handleBannerPress = (b: Banner) => {
    const now = Date.now();
    if (bannerThrottleRef.current !== null && now - bannerThrottleRef.current < 300) return;
    bannerThrottleRef.current = now;

    if (b.linkType === "product" && b.linkValue) {
      router.push({ pathname: "/product/[id]", params: { id: b.linkValue } });
    } else if (b.linkType === "category" && b.linkValue) {
      router.push({ pathname: "/search", params: { category: b.linkValue } });
    } else if (b.linkType === "service" && b.linkValue) {
      const svc = Object.values(SERVICE_REGISTRY).find((s) => s.key === b.linkValue);
      if (svc) safeNavigate(String(svc.route));
    } else if (b.linkType === "route" && b.linkValue) {
      safeNavigate(b.linkValue);
    } else if (b.linkType === "url" && b.linkValue) {
      if (b.linkValue.startsWith("https://")) {
        void import("react-native").then(({ Linking }) => Linking.openURL(b.linkValue!));
      } else if (b.linkValue.startsWith("/") || b.linkValue.startsWith("/(")) {
        safeNavigate(b.linkValue);
      }
    }
  };

  if (bannersLoading) {
    return (
      <View style={{ marginTop: 16 }}>
        <View style={ban.headerRow}>
          <Text style={ban.headerTitle}>Featured</Text>
          <Text style={ban.headerSub}>Promotions & offers</Text>
        </View>
        <View style={{ paddingHorizontal: H_PAD }}>
          <SkeletonBlock w="100%" h={140} r={16} />
        </View>
      </View>
    );
  }

  if (bannersError) {
    return (
      <View style={{ marginTop: 16 }}>
        <View style={ban.headerRow}>
          <Text style={ban.headerTitle}>Featured</Text>
          <Text style={ban.headerSub}>Promotions & offers</Text>
        </View>
        <View style={{ paddingHorizontal: H_PAD }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => refetchBanners()} style={ban.errorCard}>
            <Ionicons name="refresh-outline" size={18} color={C.textMuted} />
            <Text style={ban.errorTxt}>Couldn't load banners. Tap to retry.</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: 16 }}>
      <View style={ban.headerRow}>
        <Text style={ban.headerTitle}>Featured</Text>
        <Text style={ban.headerSub}>Promotions & offers</Text>
      </View>
      <View style={{ paddingHorizontal: H_PAD }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={BANNER_W}
          snapToAlignment="start"
          style={{ width: BANNER_W }}
          onScrollBeginDrag={() => {
            if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
          }}
          onScrollEndDrag={() => {
            if (items.length <= 1) return;
            autoScrollTimer.current = setInterval(() => {
              setActive(prev => {
                const next = (prev + 1) % items.length;
                scrollRef.current?.scrollTo({ x: next * BANNER_W, animated: true });
                return next;
              });
            }, 4000);
          }}
          onScroll={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / BANNER_W))}
          scrollEventThrottle={16}
        >
          {items.map((_b) => {
            const b = _b as Banner;
            return (
            <TouchableOpacity activeOpacity={0.7}
              key={b.id}
              onPress={() => handleBannerPress(b)}
              style={{ width: BANNER_W }}
              accessibilityLabel={b.title}
              accessibilityHint="Tap to view this promotion"
            >
              {b.imageUrl ? (
                <View style={ban.card}>
                  <AdaptiveImage uri={b.imageUrl} style={ban.bgImage} />
                  <LinearGradient
                    colors={[`${b.gradient1 || C.primary}cc`, `${b.gradient2 || C.primaryDark}bb`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={ban.overlay}
                  />
                  <View style={ban.contentWrap}>
                    <View style={{ flex: 1 }}>
                      <Text style={ban.title}>{b.title}</Text>
                      {b.subtitle ? <Text style={ban.desc}>{b.subtitle}</Text> : null}
                      <View style={ban.cta}>
                        <Text style={ban.ctaTxt}>{getBannerCtaText(b)}</Text>
                        <Ionicons name="arrow-forward" size={13} color="#fff" />
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <LinearGradient
                  colors={[b.gradient1 || C.primary, b.gradient2 || C.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={ban.card}
                >
                  <View style={[ban.blob, { width: 130, height: 130, top: -30, right: 60 }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={ban.title}>{b.title}</Text>
                    {b.subtitle ? <Text style={ban.desc}>{b.subtitle}</Text> : null}
                    <View style={ban.cta}>
                      <Text style={ban.ctaTxt}>{getBannerCtaText(b)}</Text>
                      <Ionicons name="arrow-forward" size={13} color="#fff" />
                    </View>
                  </View>
                  <View style={ban.iconWrap}>
                    <Ionicons name={(b.icon || "pricetag") as keyof typeof Ionicons.glyphMap} size={48} color="rgba(255,255,255,0.15)" />
                  </View>
                </LinearGradient>
              )}
            </TouchableOpacity>
          );})}
        </ScrollView>
        {items.length > 1 && (
          <View style={ban.dotsRow}>
            {items.map((_: unknown, i: number) => (
              <View key={i} style={[ban.dot, { width: active === i ? 24 : 6, backgroundColor: active === i ? C.primary : C.border }]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
