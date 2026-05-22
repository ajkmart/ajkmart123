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
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import Colors, { spacing, radii, shadows } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Font } from "@/constants/typography";
import { API_BASE, unwrapApiResponse } from "@/utils/api";
import { useSmartBack } from "@/hooks/useSmartBack";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";

interface Restaurant {
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

function RestaurantCard({ restaurant, styles, C }: { restaurant: Restaurant, styles: any, C: any }) {
  const name = restaurant.storeName || restaurant.name;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() =>
        router.push({
          pathname: "/food/store/[id]",
          params: { id: restaurant.id },
        })
      }
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${name} restaurant`}
    >
      <View style={styles.cardImgWrap}>
        {restaurant.storeBanner ? (
          <Image
            source={{ uri: restaurant.storeBanner }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={[C.amberDark, C.amber]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="restaurant-outline"
                size={42}
                color="rgba(255,255,255,0.7)"
              />
            </View>
          </LinearGradient>
        )}
        {restaurant.storeIsOpen === false && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedTxt}>Closed</Text>
          </View>
        )}
        <View style={styles.deliveryBadge}>
          <Ionicons name="time-outline" size={10} color={C.textInverse} />
          <Text style={styles.deliveryBadgeTxt}>
            {restaurant.storeDeliveryTime || "25-40 min"}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.restaurantName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.metaRow}>
          {restaurant.storeCategory && (
            <Text style={styles.category}>{restaurant.storeCategory}</Text>
          )}
          {restaurant.storeCategory && restaurant.city && (
            <Text style={styles.dot}>·</Text>
          )}
          {restaurant.city && (
            <Text style={styles.city}>{restaurant.city}</Text>
          )}
        </View>
        <View style={styles.ratingRow}>
          {restaurant.avgRating != null && restaurant.avgRating > 0 ? (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={11} color="#D97706" />
              <Text style={styles.ratingTxt}>
                {restaurant.avgRating.toFixed(1)}
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {restaurant.storeMinOrder != null && restaurant.storeMinOrder > 0 && (
            <Text style={styles.minOrder}>
              Min Rs. {restaurant.storeMinOrder}
            </Text>
          )}
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  restaurant.storeIsOpen !== false ? C.success : C.danger,
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default withErrorBoundary(RestaurantsScreenInner);

function RestaurantsScreenInner() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["food-vendors"],
    queryFn: async () => {
      const resp = await fetch(`${API_BASE}/vendors?category=food&slim=true`);
      const json = await resp.json();
      return unwrapApiResponse<{
        vendors?: Restaurant[];
        users?: Restaurant[];
      }>(json);
    },
    staleTime: 2 * 60 * 1000,
  });

  const restaurants: Restaurant[] = useMemo(() => {
    const raw = (data as any)?.vendors || (data as any)?.users || [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return restaurants;
    const q = search.toLowerCase();
    return restaurants.filter((r) => {
      const name = (r.storeName || r.name || "").toLowerCase();
      return (
        name.includes(q) || (r.storeCategory || "").toLowerCase().includes(q)
      );
    });
  }, [restaurants, search]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[C.amberDark, C.amber]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={goBack}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Restaurants</Text>
            <Text style={styles.headerSub}>
              Order from your favorite restaurants
            </Text>
          </View>
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search restaurants..."
            placeholderTextColor={C.textMuted}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {isLoading ? (
        <FlatList
          data={[0, 1, 2, 3, 4]}
          keyExtractor={(i) => String(i)}
          contentContainerStyle={styles.list}
          renderItem={() => (
            <View style={styles.card}>
              <SkeletonBlock w="100%" h={160} r={0} />
              <View style={{ padding: 12, gap: 8 }}>
                <SkeletonBlock w="60%" h={16} r={6} />
                <SkeletonBlock w="40%" h={12} r={5} />
              </View>
            </View>
          )}
        />
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons
            name="cloud-offline-outline"
            size={48}
            color={C.textMuted}
          />
          <Text style={styles.emptyTitle}>Could not load restaurants</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => refetch()}
            style={styles.retryBtn}
          >
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="restaurant-outline" size={48} color={C.textMuted} />
          <Text style={styles.emptyTitle}>
            {search ? "No restaurants found" : "No restaurants available"}
          </Text>
          <Text style={styles.emptySub}>
            {search
              ? "Try a different search term"
              : "Check back soon for new restaurants!"}
          </Text>
          {!search && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/food")}
              style={styles.browseBtn}
            >
              <Ionicons name="fast-food-outline" size={16} color="#fff" />
              <Text style={styles.browseBtnTxt}>Browse Food Items Instead</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={C.amber}
            />
          }
          renderItem={({ item }) => <RestaurantCard restaurant={item} styles={styles} C={C} />}
          ListFooterComponent={<View style={{ height: insets.bottom + 24 }} />}
        />
      )}
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: spacing.lg, paddingBottom: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: Font.bold, fontSize: 20, color: "#fff" },
  headerSub: {
    fontFamily: Font.regular,
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Font.regular,
    fontSize: 14,
    color: C.text,
    paddingVertical: 0,
  },
  list: { padding: 16, gap: 14 },
  card: {
    backgroundColor: C.surface,
    borderRadius: radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.borderLight,
    ...shadows.sm,
  },
  cardImgWrap: {
    height: 160,
    backgroundColor: C.surfaceSecondary,
    overflow: "hidden",
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedTxt: { fontFamily: Font.bold, fontSize: 18, color: "#fff" },
  deliveryBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  deliveryBadgeTxt: { fontFamily: Font.semiBold, fontSize: 11, color: "#fff" },
  cardBody: { padding: 14 },
  restaurantName: {
    fontFamily: Font.bold,
    fontSize: 17,
    color: C.text,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  category: { fontFamily: Font.regular, fontSize: 13, color: C.textSecondary },
  dot: { color: C.textMuted, fontSize: 13 },
  city: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ratingTxt: { fontFamily: Font.bold, fontSize: 12, color: "#D97706" },
  minOrder: { fontFamily: Font.semiBold, fontSize: 12, color: C.textSecondary },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: Font.bold,
    fontSize: 18,
    color: C.text,
    textAlign: "center",
  },
  emptySub: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.amber,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.xl,
    marginTop: 8,
  },
  browseBtnTxt: { fontFamily: Font.semiBold, fontSize: 14, color: "#fff" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.amber,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.xl,
    marginTop: 8,
  },
  retryTxt: { fontFamily: Font.semiBold, fontSize: 14, color: "#fff" },
  });
}
