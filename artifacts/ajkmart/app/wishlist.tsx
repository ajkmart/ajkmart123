import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import React, { useCallback, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { getWishlist, removeFromWishlist, type WishlistItem } from "@workspace/api-client-react";

const C = Colors.light;
const { width } = Dimensions.get("window");
const CARD_W = (width - 16 * 2 - 12) / 2;

function WishlistCard({ item, onRemove }: { item: WishlistItem; onRemove: (productId: string) => void }) {
  const p = item.product;
  const origPrice = Number(p.originalPrice) || 0;
  const numPrice = Number(p.price) || 0;
  const discount = origPrice > numPrice ? Math.round(((origPrice - numPrice) / origPrice) * 100) : 0;
  const removeScale = useRef(new Animated.Value(1)).current;

  const handleRemove = () => {
    Animated.timing(removeScale, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onRemove(p.id);
    });
  };

  return (
    <Animated.View style={{ transform: [{ scale: removeScale }] }}>
      <Pressable
        onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })}
        style={styles.card}
      >
        <View style={styles.cardImg}>
          {p.image ? (
            <Image source={{ uri: p.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Ionicons name="basket-outline" size={28} color={C.textMuted} />
          )}
          {discount > 0 && (
            <View style={styles.discBadge}>
              <Text style={styles.discTxt}>{discount}% OFF</Text>
            </View>
          )}
          <Pressable
            onPress={(e) => { e?.stopPropagation?.(); handleRemove(); }}
            style={styles.removeBtn}
          >
            <Ionicons name="heart" size={18} color={C.danger} />
          </Pressable>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>{p.name}</Text>
          {(p as any).unit && <Text style={styles.cardUnit}>{(p as any).unit}</Text>}
          <View style={styles.cardFooter}>
            <View>
              <Text style={styles.cardPrice}>Rs. {p.price.toLocaleString()}</Text>
              {origPrice > numPrice && (
                <Text style={styles.cardOrigPrice}>Rs. {origPrice.toLocaleString()}</Text>
              )}
            </View>
            {p.rating != null && (
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={10} color={C.gold} />
                <Text style={styles.ratingTxt}>{p.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
          {(p as any).inStock === false && (
            <View style={styles.oosBadge}>
              <Text style={styles.oosTxt}>Out of Stock</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function WishlistScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Math.max(insets.bottom, Platform.OS === "web" ? 20 : 16);
  const { user, token } = useAuth();
  const isLoggedIn = !!user && !!token;
  const queryClient = useQueryClient();

  const { data: items, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => getWishlist(),
    enabled: isLoggedIn,
    staleTime: 60 * 1000,
  });

  const handleRemove = useCallback(async (productId: string) => {
    try {
      await removeFromWishlist(productId);
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    } catch {}
  }, [queryClient]);

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </Pressable>
          <Text style={styles.headerTitle}>My Wishlist</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyCenter}>
          <View style={styles.emptyIcon}>
            <Ionicons name="heart-outline" size={48} color={C.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Sign in to view your wishlist</Text>
          <Text style={styles.emptySub}>Save your favorite products for later</Text>
          <Pressable onPress={() => router.push("/auth" as Href)} style={styles.signInBtn}>
            <Text style={styles.signInBtnTxt}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Wishlist</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countTxt}>{items?.length || 0}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={C.primary} />}
        contentContainerStyle={{ paddingBottom: bottomPad + 20 }}
      >
        {isLoading ? (
          <View style={styles.grid}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={{ width: CARD_W }}>
                <SkeletonBlock w="100%" h={120} r={16} />
                <View style={{ padding: 10, gap: 6 }}>
                  <SkeletonBlock w="70%" h={12} r={6} />
                  <SkeletonBlock w="50%" h={16} r={8} />
                </View>
              </View>
            ))}
          </View>
        ) : isError ? (
          <View style={styles.emptyCenter}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={48} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Could not load wishlist</Text>
            <Pressable onPress={() => refetch()} style={styles.retryBtn}>
              <Ionicons name="refresh-outline" size={16} color={C.textInverse} />
              <Text style={styles.retryBtnTxt}>Retry</Text>
            </Pressable>
          </View>
        ) : items && items.length === 0 ? (
          <View style={styles.emptyCenter}>
            <View style={styles.emptyIcon}>
              <Ionicons name="heart-outline" size={48} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
            <Text style={styles.emptySub}>Tap the heart icon on products to save them here</Text>
            <Pressable onPress={() => router.push("/(tabs)" as Href)} style={styles.browseBtn}>
              <Ionicons name="basket-outline" size={16} color={C.textInverse} />
              <Text style={styles.browseBtnTxt}>Browse Products</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {(items || []).map(item => (
              <WishlistCard key={item.id} item={item} onRemove={handleRemove} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: Font.bold, fontSize: 18, color: C.text },
  countBadge: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  countTxt: { fontFamily: Font.bold, fontSize: 12, color: C.textInverse },

  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  card: { width: CARD_W, backgroundColor: C.surface, borderRadius: 18, overflow: "hidden", shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardImg: { height: 120, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  discBadge: { position: "absolute", top: 8, left: 8, backgroundColor: C.danger, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  discTxt: { fontFamily: Font.bold, fontSize: 9, color: C.textInverse },
  removeBtn: { position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  cardBody: { padding: 12 },
  cardName: { fontFamily: Font.semiBold, fontSize: 13, color: C.text, marginBottom: 3, minHeight: 34 },
  cardUnit: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted, marginBottom: 6 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  cardPrice: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  cardOrigPrice: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted, textDecorationLine: "line-through" },
  ratingBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.surfaceSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  ratingTxt: { fontFamily: Font.semiBold, fontSize: 10, color: C.text },
  oosBadge: { marginTop: 6, backgroundColor: C.dangerSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" },
  oosTxt: { fontFamily: Font.semiBold, fontSize: 10, color: C.danger },

  emptyCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 100, gap: 10 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontFamily: Font.bold, fontSize: 17, color: C.text },
  emptySub: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted, textAlign: "center", paddingHorizontal: 40 },
  signInBtn: { marginTop: 12, backgroundColor: C.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  signInBtnTxt: { fontFamily: Font.bold, fontSize: 14, color: C.textInverse },
  browseBtn: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  browseBtnTxt: { fontFamily: Font.bold, fontSize: 14, color: C.textInverse },
  retryBtn: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  retryBtnTxt: { fontFamily: Font.bold, fontSize: 14, color: C.textInverse },
});
