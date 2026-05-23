import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  useWindowDimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  FlatList,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import Colors, { spacing, radii, shadows, typography, getFontFamily } from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { SmartRefresh } from "@/components/ui/SmartRefresh";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  SERVICE_REGISTRY,
  getActiveServices,
  type ServiceDefinition,
} from "@/constants/serviceRegistry";
import {
  AnimatedPressable,
  SectionHeader,
  SkeletonBlock,
  EmptyState,
  CountdownTimer,
} from "@/components/user-shared";
import { WishlistHeart } from "@/components/WishlistHeart";
import { getBanners, getTrending, getFlashDeals, type Banner as ApiBanner } from "@workspace/api-client-react";

type Banner = ApiBanner & {
  linkType?: string;
  linkValue?: string;
  gradient1?: string;
  gradient2?: string;
  subtitle?: string;
  icon?: string;
};

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

const C = Colors.light;
const W = Dimensions.get("window").width;
const H_PAD = spacing.lg;

function safeNavigate(route: string) {
  const knownRoutes = new Set<string>([
    ...Object.values(SERVICE_REGISTRY).map(s => String(s.route)),
    "/(tabs)", "/(tabs)/orders", "/(tabs)/wallet", "/cart", "/search",
  ]);
  if (!route || (!knownRoutes.has(route) && !route.startsWith("/(tabs)"))) {
    router.push("/(tabs)" as Href);
    return;
  }
  router.push(route as Href);
}

function ServiceGrid({ services, isGuest, T }: {
  services: ServiceDefinition[];
  isGuest: boolean;
  T: (key: Parameters<typeof tDual>[0]) => string;
}) {
  const shortLabel: Record<string, string> = {
    mart: T("martTitle"), food: T("food"), rides: T("ride"), pharmacy: "Pharma", parcel: T("parcel"),
  };

  return (
    <View style={sg.wrap}>
      <View style={sg.grid}>
        {services.map((svc) => {
          const label = shortLabel[svc.key] ?? svc.label;
          return (
            <Pressable
              key={svc.key}
              onPress={() => {
                if (isGuest) { router.push("/auth" as Href); return; }
                safeNavigate(String(svc.route));
              }}
              style={sg.item}
              accessibilityRole="button"
              accessibilityLabel={`${label}${isGuest ? ", sign in required" : ""}`}
            >
              <LinearGradient colors={svc.iconGradient} style={sg.circle}>
                <Ionicons name={svc.iconFocused} size={22} color="#fff" />
                {isGuest && (
                  <View style={sg.lockBadge}>
                    <Ionicons name="lock-closed" size={7} color="#fff" />
                  </View>
                )}
              </LinearGradient>
              <Text style={sg.label} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const sg = StyleSheet.create({
  wrap: { paddingHorizontal: H_PAD, paddingTop: 14, paddingBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 0 },
  item: {
    alignItems: "center", gap: 6,
    width: (W - H_PAD * 2) / 5,
    paddingVertical: 8,
  },
  circle: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    ...shadows.sm,
  },
  lockBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.textMuted,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: C.surface,
  },
  label: { fontFamily: Font.semiBold, color: C.text, fontSize: 11, textAlign: "center" },
});

function GuestSignInStrip() {
  return (
    <Pressable onPress={() => router.push("/auth" as Href)} style={gi.wrap} accessibilityRole="button">
      <LinearGradient colors={["#0047B3", "#0066FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gi.card}>
        <View style={gi.iconWrap}>
          <Ionicons name="person-circle-outline" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={gi.title}>Sign In / Register</Text>
          <Text style={gi.sub}>Sign in to place orders & track deliveries</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
      </LinearGradient>
    </Pressable>
  );
}

const gi = StyleSheet.create({
  wrap: { marginHorizontal: H_PAD, marginTop: 6, borderRadius: 14, overflow: "hidden" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: Font.bold, fontSize: 14, color: "#fff" },
  sub: { fontFamily: Font.regular, fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 },
});

function ActiveTrackerStrip({ userId, tabBarHeight = 0 }: { userId: string; tabBarHeight?: number }) {
  const { token } = useAuth();
  const { config: pCfg } = usePlatformConfig();
  const authHdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const { data: ordersData, isLoading: ordersLoading, isError: ordersError } = useQuery({
    queryKey: ["home-active-orders", userId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/orders?status=active`, { headers: authHdrs });
      if (!r.ok) throw new Error("orders fetch failed");
      return r.json();
    },
    enabled: !!userId && !!token,
    refetchInterval: 8000,
    staleTime: 6000,
  });

  const { data: ridesData, isLoading: ridesLoading, isError: ridesError } = useQuery({
    queryKey: ["home-active-rides", userId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/rides?status=active`, { headers: authHdrs });
      if (!r.ok) throw new Error("rides fetch failed");
      return r.json();
    },
    enabled: !!userId && !!token,
    refetchInterval: 8000,
    staleTime: 6000,
  });

  if (!pCfg.content.trackerBannerEnabled) return null;
  if (ordersLoading || ridesLoading) return null;
  if (ordersError || ridesError) return null;

  const activeOrders = Array.isArray(ordersData) ? ordersData.filter((o: any) => !["delivered", "cancelled"].includes(o.status)) : [];
  const activeRides = Array.isArray(ridesData) ? ridesData.filter((r: any) => ![T("completedLabel"), "cancelled"].includes(r.status)) : [];
  const total = activeOrders.length + activeRides.length;
  if (total === 0) return null;

  const items: { label: string; sublabel: string; route: string; c1: string; c2: string; icon: keyof typeof Ionicons.glyphMap }[] = [];
  if (activeOrders.length > 0) {
    items.push({
      label: `${activeOrders.length} Active Order${activeOrders.length > 1 ? "s" : ""}`,
      sublabel: T("tapToTrack"),
      route: activeOrders[0]?.id ? `/order?orderId=${activeOrders[0].id}` : "/(tabs)/orders",
      c1: "#F59E0B", c2: "#D97706",
      icon: "bag-outline",
    });
  }
  if (activeRides.length > 0) {
    items.push({
      label: `${activeRides.length} Active Ride${activeRides.length > 1 ? "s" : ""}`,
      sublabel: T("tapToTrack"),
      route: activeRides[0]?.id ? `/ride?rideId=${activeRides[0].id}` : "/(tabs)/orders",
      c1: "#10B981", c2: "#059669",
      icon: "car-outline",
    });
  }

  return (
    <View style={tr.wrap}>
      {items.map((item, i) => (
        <Pressable key={i} onPress={() => router.push(item.route as Href)} accessibilityRole="button" accessibilityLabel={`${item.label}. Tap to track`}>
          <LinearGradient colors={[item.c1, item.c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={tr.card}>
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
        </Pressable>
      ))}
    </View>
  );
}

const tr = StyleSheet.create({
  wrap: { marginHorizontal: H_PAD, marginTop: 10, gap: 8 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  label: { fontFamily: Font.bold, fontSize: 14, color: "#fff" },
  sub: { fontFamily: Font.regular, fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 1 },
  ctaWrap: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  ctaTxt: { fontFamily: Font.semiBold, fontSize: 12, color: "#000" },
});

function WalletStrip({ balance, onPress, appName = T("appName") }: { balance: number; onPress: () => void; appName?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${appName} Wallet, Rs. ${balance.toLocaleString()}, tap to open`} style={ws.wrap}>
      <LinearGradient colors={["#0047B3", "#0066FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ws.card}>
        <View style={ws.left}>
          <View style={ws.iconBox}>
            <Ionicons name="wallet" size={16} color="#fff" />
          </View>
          <View>
            <Text style={ws.lbl}>{appName} Wallet</Text>
            <Text style={ws.bal}>Rs. {balance.toLocaleString()}</Text>
          </View>
        </View>
        <View style={ws.topupBtn}>
          <Ionicons name="add" size={14} color={C.primary} />
          <Text style={ws.topupTxt}>Top Up</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const ws = StyleSheet.create({
  wrap: { marginHorizontal: H_PAD, borderRadius: 14, overflow: "hidden" },
  card: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
  left: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  lbl: { fontFamily: Font.regular, fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 1 },
  bal: { fontFamily: Font.bold, fontSize: 17, color: "#fff" },
  topupBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  topupTxt: { fontFamily: Font.semiBold, fontSize: 12, color: C.primary },
});

function DynamicBannerCarousel() {
  const { data: banners } = useQuery({
    queryKey: ["dynamic-banners", "home"],
    queryFn: () => getBanners({ placement: "home" }),
    staleTime: 5 * 60 * 1000,
  });
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const BANNER_W = windowWidth - H_PAD * 2;
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const items: Banner[] = (banners ?? []) as Banner[];

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

  const handleBannerPress = (b: Banner) => {
    if (b.linkType === "product" && b.linkValue) {
      router.push({ pathname: "/product/[id]", params: { id: b.linkValue } } as Href);
    } else if (b.linkType === "category" && b.linkValue) {
      router.push({ pathname: "/search", params: { category: b.linkValue } } as Href);
    } else if (b.linkType === "url" && b.linkValue) {
      if (b.linkValue.startsWith("http://") || b.linkValue.startsWith("https://")) {
        Linking.openURL(b.linkValue);
      } else {
        router.push(b.linkValue as Href);
      }
    }
  };

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
          {items.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => handleBannerPress(b)}
              style={{ width: BANNER_W }}
            >
              {b.imageUrl ? (
                <View style={ban.card}>
                  <Image source={{ uri: b.imageUrl }} style={ban.bgImage} />
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
                        <Text style={ban.ctaTxt}>Shop Now</Text>
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
                      <Text style={ban.ctaTxt}>Shop Now</Text>
                      <Ionicons name="arrow-forward" size={13} color="#fff" />
                    </View>
                  </View>
                  <View style={ban.iconWrap}>
                    <Ionicons name={(b.icon as any) || "pricetag"} size={48} color="rgba(255,255,255,0.15)" />
                  </View>
                </LinearGradient>
              )}
            </Pressable>
          ))}
        </ScrollView>
        {items.length > 1 && (
          <View style={ban.dotsRow}>
            {items.map((_, i) => (
              <View key={i} style={[ban.dot, { width: active === i ? 24 : 6, backgroundColor: active === i ? C.primary : C.border }]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const ban = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: H_PAD, marginBottom: 10 },
  headerTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  headerSub: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  card: { borderRadius: 16, minHeight: 140, overflow: "hidden", position: "relative" as const },
  bgImage: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", borderRadius: 16 },
  overlay: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16 },
  contentWrap: { flexDirection: "row" as const, alignItems: "center" as const, padding: 18, zIndex: 2 },
  blob: { position: "absolute" as const, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)" },
  title: { fontFamily: Font.bold, fontSize: 17, color: "#fff", marginBottom: 4, textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  desc: { fontFamily: Font.regular, fontSize: 12, color: "rgba(255,255,255,0.9)", lineHeight: 17, marginBottom: 10, textShadowColor: "rgba(0,0,0,0.2)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  cta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "flex-start" as const, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  ctaTxt: { fontFamily: Font.semiBold, fontSize: 12, color: "#fff" },
  iconWrap: { marginLeft: 10 },
  dotsRow: { flexDirection: "row" as const, justifyContent: "center" as const, gap: 6, marginTop: 10 },
  dot: { height: 5, borderRadius: 3 },
});

function FlashCountdownTimer({ targetTime }: { targetTime: Date }) {
  const [timeLeft, setTimeLeft] = React.useState({ d: 0, h: 0, m: 0, s: 0 });

  React.useEffect(() => {
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

function FlashDealsSection({ T }: { T: (key: Parameters<typeof tDual>[0]) => string }) {
  const { data: deals, isLoading } = useQuery({
    queryKey: ["flash-deals"],
    queryFn: () => getFlashDeals({ limit: 10 }),
    staleTime: 3 * 60 * 1000,
  });

  const items = deals ?? [];
  const earliestExpiry = useMemo(() => {
    if (items.length === 0) return null;
    const times = items.map(d => new Date(d.dealExpiresAt).getTime()).filter(t => !isNaN(t));
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

  if (items.length === 0) return null;

  return (
    <View style={fd.section}>
      <LinearGradient colors={["#FF4444", "#FF6B35"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={fd.headerGrad}>
        <View style={fd.headerInner}>
          <Ionicons name="flash" size={16} color="#FFD700" />
          <Text style={fd.headerTitle}>{T("todaysDeals")}</Text>
          <Ionicons name="flash" size={12} color="#FFD700" style={{ opacity: 0.6 }} />
        </View>
        {earliestExpiry && (
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
            <Pressable
              onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
              style={fd.card}
              accessibilityLabel={`${item.name} ${item.discountPercent}% OFF`}
            >
              <View style={fd.discBadgeCorner}>
                <Text style={fd.discBadgeText}>{item.discountPercent}%</Text>
                <Text style={fd.discBadgeOff}>OFF</Text>
              </View>
              <View style={fd.imgWrap}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={fd.productImg} resizeMode="cover" />
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
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const fd = StyleSheet.create({
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
  progressText: { fontFamily: Font.bold, fontSize: 8, color: "#fff", textAlign: "center", zIndex: 1, textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 0.5 }, textShadowRadius: 1 },
});

function TrendingSection() {
  const { data: trending } = useQuery({
    queryKey: ["trending-products"],
    queryFn: () => getTrending({ limit: 8 }),
    staleTime: 5 * 60 * 1000,
  });

  const items = trending ?? [];
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
          <Pressable
            onPress={() => router.push(`/product/${item.id}` as Href)}
            style={tr2.card}
          >
            <View style={{ position: "relative" }}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={tr2.img} />
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
          </Pressable>
        )}
      />
    </View>
  );
}

const tr2 = StyleSheet.create({
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
});

function HomeSkeleton() {
  return (
    <View style={{ paddingHorizontal: H_PAD, gap: spacing.sm, marginTop: spacing.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 0 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={{ alignItems: "center", gap: 6, width: (W - H_PAD * 2) / 5, paddingVertical: 8 }}>
            <SkeletonBlock w={48} h={48} r={16} />
            <SkeletonBlock w={40} h={10} r={4} />
          </View>
        ))}
      </View>
      <SkeletonBlock w="100%" h={52} r={14} />
      <SkeletonBlock w="100%" h={120} r={16} />
      <SkeletonBlock w="100%" h={100} r={16} />
    </View>
  );
}

export default function HomeScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { itemCount } = useCart();
  const topPad = Math.max(insets.top, 12);
  const TAB_H = Platform.OS === "web" ? 72 : 49;
  const hdOp = useRef(new Animated.Value(0)).current;
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const { config: platformConfig, loading: configLoading, refresh: refreshConfig } = usePlatformConfig();

  const handleHomeRefresh = useCallback(async () => {
    try { await refreshConfig(); } catch (err) { console.warn("[Home] Config refresh failed:", err instanceof Error ? err.message : String(err)); }
    setLastRefreshed(new Date());
  }, [refreshConfig]);

  const features = platformConfig.features;
  const appName = platformConfig.platform.appName;
  const contentBanner = platformConfig.content.banner;
  const announcement = platformConfig.content.announcement;
  const [announceDismissed, setAnnounceDismissed] = useState(false);

  const announceKey = React.useMemo(() => {
    if (!announcement) return "";
    const hash = Array.from(announcement).reduce((h, c) => (((h * 31) | 0) + c.charCodeAt(0)) >>> 0, 0).toString(36);
    return `announce_dismissed_${hash}`;
  }, [announcement]);

  useEffect(() => {
    if (!announcement) { setAnnounceDismissed(false); return; }
    AsyncStorage.getItem(announceKey).then(val => { setAnnounceDismissed(val === "1"); }).catch(() => { setAnnounceDismissed(false); });
  }, [announcement, announceKey]);

  useEffect(() => {
    Animated.timing(hdOp, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const activeServices = getActiveServices(features);
  const noServicesActive = activeServices.length === 0;
  const isGuest = !user?.id;
  const walletBalance = (user as any)?.walletBalance ?? 0;

  return (
    <View style={s.root}>
      {announcement && !announceDismissed && (
        <View style={[s.announceBar, { paddingTop: topPad }]} accessibilityRole="alert">
          <View style={s.announceIcon}>
            <Ionicons name="megaphone" size={11} color="#fff" />
          </View>
          <Text style={s.announceTxt} numberOfLines={1}>{announcement}</Text>
          <Pressable
            onPress={() => {
              setAnnounceDismissed(true);
              if (announceKey) AsyncStorage.setItem(announceKey, "1").catch(() => {});
            }}
            style={s.announceClose}
            accessibilityRole="button"
            accessibilityLabel={T("dismissAnnouncement")}
          >
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      )}

      <Animated.View style={{ opacity: hdOp }}>
        <LinearGradient
          colors={["#0047B3", "#0066FF", "#2E80FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.header, { paddingTop: (announcement && !announceDismissed) ? 8 : topPad + 8 }]}
        >
          <View style={s.hdrRow}>
            <Pressable style={s.locBtn} onPress={() => {}}>
              <Ionicons name="location" size={14} color="#fff" />
              <Text style={s.locTxt} numberOfLines={1}>{platformConfig.platform.businessAddress || "AJK, Pakistan"}</Text>
              <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.6)" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => router.push("/cart" as Href)}
                style={s.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={`Cart${itemCount > 0 ? `, ${itemCount} items` : ""}`}
              >
                <Ionicons name="cart-outline" size={20} color="#fff" />
                {itemCount > 0 && (
                  <View style={s.cartBadge}>
                    <Text style={s.cartBadgeTxt}>{itemCount > 99 ? "99+" : itemCount}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={() => router.push("/search")}
            style={s.searchBar}
            accessibilityRole="search"
            accessibilityLabel={T("search")}
          >
            <Ionicons name="search" size={16} color={C.textMuted} />
            <Text style={s.searchText}>{T("search")}</Text>
            <View style={s.searchDivider} />
            <Ionicons name="camera-outline" size={16} color={C.textMuted} />
          </Pressable>
        </LinearGradient>
      </Animated.View>

      <SmartRefresh
        onRefresh={handleHomeRefresh}
        lastUpdated={lastRefreshed}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {contentBanner ? (
          <View style={s.promoBanner}>
            <Ionicons name="gift-outline" size={14} color={C.primary} />
            <Text style={s.promoBannerTxt} numberOfLines={1}>{contentBanner}</Text>
          </View>
        ) : null}

        {configLoading ? (
          <HomeSkeleton />
        ) : noServicesActive ? (
          <EmptyState
            icon="storefront-outline"
            title="No Services Available"
            subtitle={"No services are currently available.\nPlease check back later!"}
            actionLabel={T("refresh")}
            onAction={refreshConfig}
          />
        ) : (
          <>
            <ServiceGrid services={activeServices} isGuest={isGuest} T={T} />

            {isGuest && <GuestSignInStrip />}

            {!isGuest && user?.id && (
              <ActiveTrackerStrip userId={user.id} />
            )}

            {!isGuest && walletBalance >= 0 && (
              <View style={{ marginTop: 10 }}>
                <WalletStrip
                  balance={walletBalance}
                  onPress={() => router.push("/(tabs)/wallet" as Href)}
                  appName={appName}
                />
              </View>
            )}

            {platformConfig.content.showBanner && <DynamicBannerCarousel />}

            <FlashDealsSection T={T} />

            <TrendingSection />

            <View style={{ height: 12 }} />
          </>
        )}

        <View style={{ height: TAB_H + insets.bottom + 20 }} />
      </SmartRefresh>

      {user?.id && itemCount > 0 && (
        <Pressable
          onPress={() => router.push("/cart" as Href)}
          style={[s.cartFab, { bottom: TAB_H + insets.bottom + 16 }]}
          accessibilityRole="button"
          accessibilityLabel={`Cart — ${itemCount} item${itemCount > 1 ? "s" : ""}`}
        >
          <LinearGradient colors={["#0047B3", "#0066FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.cartFabGrad}>
            <Ionicons name="bag" size={18} color="#fff" />
            <Text style={s.cartFabTxt}>Cart</Text>
            <View style={s.cartFabBadge}>
              <Text style={s.cartFabBadgeTxt}>{itemCount > 9 ? "9+" : itemCount}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: H_PAD, paddingBottom: 12 },
  hdrRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  locBtn: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, marginRight: 12 },
  locTxt: { fontFamily: Font.semiBold, fontSize: 13, color: "#fff", flex: 1 },

  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  cartBadge: {
    position: "absolute", top: -4, right: -4,
    backgroundColor: "#FF3B30", borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: "#0066FF",
  },
  cartBadgeTxt: { fontFamily: Font.bold, fontSize: 9, color: "#fff" },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchText: { flex: 1, fontFamily: Font.regular, fontSize: 13, color: C.textMuted },
  searchDivider: { width: 1, height: 18, backgroundColor: C.borderLight },

  cartFab: { position: "absolute", right: H_PAD, borderRadius: 99, overflow: "hidden", ...shadows.xl },
  cartFabGrad: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 99 },
  cartFabTxt: { fontFamily: Font.bold, fontSize: 13, color: "#fff" },
  cartFabBadge: { backgroundColor: "#FF3B30", borderRadius: 11, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: C.primary },
  cartFabBadgeTxt: { fontFamily: Font.bold, fontSize: 10, color: "#fff" },

  announceBar: {
    backgroundColor: C.primary, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingBottom: 6, gap: 8,
  },
  announceIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  announceTxt: { flex: 1, fontFamily: Font.medium, fontSize: 12, color: "#fff" },
  announceClose: { padding: 4 },

  promoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: H_PAD, marginTop: 10, marginBottom: 2,
    backgroundColor: C.primarySoft, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: C.blueLightBorder,
  },
  promoBannerTxt: { flex: 1, fontFamily: Font.medium, fontSize: 12, color: C.primary },

  scroll: { paddingBottom: 0 },
});
