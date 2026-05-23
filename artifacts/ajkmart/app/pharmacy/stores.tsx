import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors, { spacing, radii, shadows } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Font } from "@/constants/typography";
import { API_BASE, unwrapApiResponse } from "@/utils/api";
import { useSmartBack } from "@/hooks/useSmartBack";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
const T = (key: TranslationKey) => tDual(key, "en");

interface PharmacyStore {
  id: string;
  name: string;
  storeName?: string;
  storeCategory?: string;
  storeBanner?: string;
  storeDeliveryTime?: string;
  storeMinOrder?: number;
  storeIsOpen?: boolean;
  city?: string;
  productCount?: number;
  avgRating?: number;
}

function StoreCard({ store, styles, C }: { store: PharmacyStore, styles: any, C: any }) {
  const name = store.storeName || store.name;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: "/pharmacy/store/[id]", params: { id: store.id } })}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${name} pharmacy`}
    >
      <View style={styles.cardImgWrap}>
        {store.storeBanner
          ? <Image source={{ uri: store.storeBanner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : (
            <LinearGradient colors={["#7C3AED", "#4F46E5"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="medical-outline" size={42} color="rgba(255,255,255,0.7)" />
              </View>
            </LinearGradient>
          )
        }
        <View style={styles.openBadge}>
          <View style={[styles.openDot, { backgroundColor: store.storeIsOpen === false ? C.danger : C.emerald }]} />
          <Text style={styles.openTxt}>{store.storeIsOpen === false ? T("closedLabel") : T("openLabel")}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.storeName} numberOfLines={1}>{name}</Text>
        {store.city && <Text style={styles.storeCity} numberOfLines={1}>{store.city}</Text>}
        <View style={styles.metaRow}>
          {store.avgRating ? (
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={10} color={C.gold} />
              <Text style={styles.ratingTxt}>{Number(store.avgRating).toFixed(1)}</Text>
            </View>
          ) : null}
          {store.storeDeliveryTime && (
            <View style={styles.metaPill}>
              <Ionicons name="time-outline" size={10} color={C.textMuted} />
              <Text style={styles.metaTxt}>{store.storeDeliveryTime}</Text>
            </View>
          )}
          {store.storeMinOrder ? (
            <View style={styles.metaPill}>
              <Ionicons name="cart-outline" size={10} color={C.textMuted} />
              <Text style={styles.metaTxt}>Min Rs. {store.storeMinOrder}</Text>
            </View>
          ) : null}
          {store.productCount ? (
            <View style={styles.metaPill}>
              <Ionicons name="medical-outline" size={10} color={C.textMuted} />
              <Text style={styles.metaTxt}>{store.productCount} items</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function PharmacyStoresScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack("/pharmacy");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["pharmacy-stores"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/vendors?category=pharmacy&slim=true`);
      if (!r.ok) throw new Error("Failed to load pharmacies");
      const json = await r.json();
      return unwrapApiResponse(json);
    },
    staleTime: 60000,
    retry: 1,
  });

  const stores: PharmacyStore[] = useMemo(() => {
    const raw = (data as any)?.vendors || (data as any)?.users || data || [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(s => {
      const name = (s.storeName || s.name || "").toLowerCase();
      const city = (s.city || "").toLowerCase();
      return name.includes(q) || city.includes(q);
    });
  }, [stores, search]);

  const open = filtered.filter(s => s.storeIsOpen !== false);
  const closed = filtered.filter(s => s.storeIsOpen === false);
  const sorted = [...open, ...closed];

  const onRefresh = useCallback(async () => { await refetch(); }, [refetch]);

  const renderEmpty = () => {
    if (isLoading) return null;
    if (isError) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={52} color={C.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't load stores</Text>
          <Text style={styles.emptySub}>Check your connection and pull to refresh</Text>
        </View>
      );
    }
    if (filtered.length === 0 && search) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={48} color={C.textMuted} />
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptySub}>No pharmacies match "{search}"</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="medical-outline" size={52} color={C.textMuted} />
        <Text style={styles.emptyTitle}>No pharmacies listed</Text>
        <Text style={styles.emptySub}>Pharmacy stores will appear here once they are registered</Text>
      </View>
    );
  };

  const renderSkeleton = () => (
    <View style={{ padding: spacing.md, gap: spacing.md }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.card, { overflow: "hidden" }]}>
          <SkeletonBlock w="100%" h={140} r={0} />
          <View style={{ padding: spacing.md, gap: 8 }}>
            <SkeletonBlock w="60%" h={14} r={6} />
            <SkeletonBlock w="40%" h={11} r={6} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SkeletonBlock w={48} h={20} r={10} />
              <SkeletonBlock w={72} h={20} r={10} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <LinearGradient
        colors={["#7C3AED", "#4F46E5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          {showSearch ? (
            <TextInput
              autoFocus
              value={search}
              onChangeText={setSearch}
              placeholder="Search pharmacies..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.searchInput}
              returnKeyType="search"
              onBlur={() => { if (!search) setShowSearch(false); }}
            />
          ) : (
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Pharmacy Stores</Text>
              <Text style={styles.headerSub}>
                {isLoading ? "Loading…" : `${stores.length} pharmacies near you`}
              </Text>
            </View>
          )}
          <TouchableOpacity activeOpacity={0.7} onPress={() => { setShowSearch(v => !v); setSearch(""); }} style={styles.searchBtn} accessibilityRole="button" accessibilityLabel="Toggle search">
            <Ionicons name={showSearch ? "close" : "search-outline"} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {isLoading ? renderSkeleton() : (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={onRefresh} tintColor={C.purple} />}
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => <StoreCard store={item} styles={styles} C={C} />}
        />
      )}
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  searchBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  searchInput: { flex: 1, color: "#fff", fontFamily: Font.regular, fontSize: 15, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  headerTitle: { fontFamily: Font.bold, fontSize: 20, color: "#fff" },
  headerSub: { fontFamily: Font.regular, fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  card: { backgroundColor: C.surface, borderRadius: radii.md, ...shadows.sm, overflow: "hidden" },
  cardImgWrap: { height: 140, position: "relative" },
  openBadge: { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openTxt: { fontFamily: Font.medium, fontSize: 10, color: "#fff" },
  cardBody: { padding: spacing.md, gap: 6 },
  storeName: { fontFamily: Font.bold, fontSize: 15, color: C.text },
  storeCity: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.amberSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  ratingTxt: { fontFamily: Font.medium, fontSize: 10, color: C.amberDark },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.surfaceSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  metaTxt: { fontFamily: Font.regular, fontSize: 10, color: C.textSecondary },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 12, marginTop: 60 },
  emptyTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text, textAlign: "center" },
  emptySub: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 20 },
  });
}
