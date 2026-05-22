import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors, { typography } from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useCart } from "@/context/CartContext";
import { withServiceGuard } from "@/components/ServiceGuard";
import { useGetProducts, useGetCategories } from "@workspace/api-client-react";
import { CartSwitchModal } from "@/components/CartSwitchModal";

const C = Colors.light;

function FoodCard({ item }: { item: any }) {
  const { addItem, cartType, itemCount, clearCart, items, updateQuantity, removeItem } = useCart();
  const [added, setAdded] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cartItem = items.find(i => i.productId === item.id);
  const qtyInCart = cartItem?.quantity ?? 0;

  useEffect(() => () => { if (addedTimerRef.current) clearTimeout(addedTimerRef.current); }, []);

  const doAdd = () => {
    addItem({ productId: item.id, name: item.name, price: item.price, quantity: 1, image: item.image, type: "food" });
    setAdded(true);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => { setAdded(false); addedTimerRef.current = null; }, 1500);
  };

  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const handleAdd = (e?: any) => {
    e?.stopPropagation?.();
    if (itemCount > 0 && cartType !== "food" && cartType !== "none") {
      setShowSwitchModal(true);
      return;
    }
    doAdd();
  };

  return (
    <Pressable onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })} style={styles.foodCard}>
      <CartSwitchModal
        visible={showSwitchModal}
        targetService="Food"
        currentService={cartType === "pharmacy" ? "Pharmacy" : cartType === "mart" ? "Mart" : "Another service"}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCart(); doAdd(); }}
      />
      <View style={styles.foodImageBox}>
        {item.image
          ? <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Ionicons name="restaurant-outline" size={32} color={C.amber} />}
        {item.deliveryTime && (
          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={10} color={C.textInverse} />
            <Text style={styles.timeText}>{item.deliveryTime}</Text>
          </View>
        )}
      </View>
      <View style={styles.foodInfo}>
        <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.foodVendor} numberOfLines={1}>{item.vendorName || "Restaurant"}</Text>
        {item.rating != null && (
          <View style={styles.ratingRow}>
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={11} color={C.gold} />
              <Text style={styles.ratingText}>{item.rating}</Text>
            </View>
            {item.reviewCount != null && (
              <Text style={styles.reviewCount}>({item.reviewCount} reviews)</Text>
            )}
          </View>
        )}
        <View style={styles.foodFooter}>
          <Text style={styles.foodPrice}>Rs. {item.price}</Text>
          {qtyInCart > 0 ? (
            <View style={styles.stepperRow}>
              <Pressable onPress={(e) => { e?.stopPropagation?.(); qtyInCart <= 1 ? removeItem(item.id) : updateQuantity(item.id, qtyInCart - 1); }} style={styles.stepperBtn}>
                <Ionicons name={qtyInCart <= 1 ? "trash-outline" : "remove"} size={14} color={C.red} />
              </Pressable>
              <Text style={styles.stepperQty}>{qtyInCart}</Text>
              <Pressable onPress={(e) => { e?.stopPropagation?.(); updateQuantity(item.id, qtyInCart + 1); }} style={[styles.stepperBtn, { backgroundColor: C.accentSoft }]}>
                <Ionicons name="add" size={14} color={C.amber} />
              </Pressable>
            </View>
          ) : (
            <Animated.View style={{ transform: [{ scale }] }}>
              <Pressable onPress={(e) => handleAdd(e)} style={[styles.addBtn, added && styles.addBtnAdded]}>
                <Ionicons name={added ? "checkmark" : "add"} size={16} color={C.textInverse} />
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function FoodScreenInner() {
  const insets = useSafeAreaInsets();
  const { itemCount, cartType, clearCart } = useCart();
  const showCartBanner = itemCount > 0 && cartType !== "food" && cartType !== "none";
  const [clearBannerConfirm, setClearBannerConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const { category: routeCategory } = useLocalSearchParams<{ category?: string }>();
  const [selectedCat, setSelectedCat] = useState<string | undefined>(routeCategory || undefined);
  const topPad = Math.max(insets.top, 12);

  const { data: catData } = useGetCategories({ type: "food" });
  const { data, isLoading, isError, refetch, isRefetching } = useGetProducts({ type: "food", search: search || undefined, category: selectedCat });

  const categories = catData?.categories || [];
  const items = data?.products || [];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[C.amberDark, C.amber, C.gold]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={C.textInverse} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Food Delivery</Text>
            <Text style={styles.headerSub}>Order from nearby restaurants</Text>
          </View>
          <Pressable onPress={() => router.push("/cart")} style={styles.cartBtn}>
            <Ionicons name="bag-outline" size={22} color={C.textInverse} />
            {itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeTxt}>{itemCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={17} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search food, restaurants..."
            placeholderTextColor={C.textMuted}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {showCartBanner && (
        <View style={{ backgroundColor: C.indigoSoft, flexDirection: "row", alignItems: "center", padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: C.indigoBorder }}>
          <Ionicons name="warning-outline" size={18} color={C.indigoDark} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.indigoDarkest }}>{cartType === "pharmacy" ? "Pharmacy cart active" : cartType === "mart" ? "Mart cart active" : "Another cart active"}</Text>
            <Text style={{ ...Typ.caption, color: C.indigoDarkest }}>Adding Food items will clear your existing cart</Text>
          </View>
          <Pressable
            onPress={() => setClearBannerConfirm(true)}
            style={{ backgroundColor: C.indigoDark, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text style={{ ...Typ.captionBold, color: C.textInverse }}>Clear Cart</Text>
          </Pressable>
        </View>
      )}

      <CartSwitchModal
        visible={clearBannerConfirm}
        currentService={cartType === "mart" ? "Mart" : cartType === "pharmacy" ? "Pharmacy" : "Current"}
        targetService="Food"
        onConfirm={() => { clearCart(); setClearBannerConfirm(false); }}
        onCancel={() => setClearBannerConfirm(false)}
      />

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={C.food} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
          <Pressable onPress={() => setSelectedCat(undefined)} style={[styles.catChip, !selectedCat && styles.catChipActive]}>
            <Ionicons name="fast-food-outline" size={14} color={!selectedCat ? C.textInverse : C.food} />
            <Text style={[styles.catChipText, !selectedCat && styles.catChipTextActive]}>All</Text>
          </Pressable>
          {categories.map(c => (
            <Pressable key={c.id} onPress={() => setSelectedCat(selectedCat === c.id ? undefined : c.id)} style={[styles.catChip, selectedCat === c.id && styles.catChipActive]}>
              <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={14} color={selectedCat === c.id ? C.textInverse : C.food} />
              <Text style={[styles.catChipText, selectedCat === c.id && styles.catChipTextActive]}>{c.name}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: "/categories" as any, params: { type: "food" } })}
            style={[styles.catChip, { borderStyle: "dashed" as any }]}
          >
            <Ionicons name="apps-outline" size={14} color={C.food} />
            <Text style={styles.catChipText}>Browse All</Text>
          </Pressable>
        </ScrollView>

        {isLoading ? (
          <View style={styles.skeletonList}>
            {[0,1,2,3,4].map(i => (
              <View key={i} style={styles.skeletonCard}>
                <SkeletonBlock w={110} h={110} r={0} />
                <View style={{ flex: 1, padding: 14, gap: 8 }}>
                  <SkeletonBlock w="70%" h={14} r={6} />
                  <SkeletonBlock w="45%" h={10} r={5} />
                  <SkeletonBlock w="35%" h={12} r={6} />
                </View>
              </View>
            ))}
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <View style={styles.errorIcon}>
              <Ionicons name="cloud-offline-outline" size={48} color={C.textMuted} />
            </View>
            <Text style={styles.errorTitle}>Could not load</Text>
            <Text style={styles.errorSub}>Check your internet and retry</Text>
            <Pressable onPress={() => refetch()} style={styles.retryBtn}>
              <Ionicons name="refresh-outline" size={16} color={C.textInverse} />
              <Text style={styles.retryBtnTxt}>Retry</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="restaurant-outline" size={48} color={C.border} />
            </View>
            <Text style={styles.emptyTitle}>No food items yet</Text>
            <Text style={styles.emptyText}>Vendors are adding menu items soon</Text>
          </View>
        ) : (
          <>
            <View style={styles.secRow}>
              <Text style={styles.secTitle}>
                {search ? `Results for "${search}"` : selectedCat ? "Category Items" : "Popular Near You"}
              </Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeTxt}>{items.length}</Text>
              </View>
            </View>
            <View style={styles.foodList}>
              {items.map(i => <FoodCard key={i.id} item={i} />)}
            </View>
          </>
        )}
        <View style={{ height: Math.max(insets.bottom, Platform.OS === "web" ? 34 : 20) }} />
      </ScrollView>
    </View>
  );
}

export default withServiceGuard("food", FoodScreenInner);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight20, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.h3, fontSize: 20, color: C.textInverse },
  headerSub: { ...typography.caption, color: C.overlayLight80, marginTop: 2 },
  cartBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.overlayLight20, alignItems: "center", justifyContent: "center" },
  cartBadge: { position: "absolute", top: -4, right: -4, backgroundColor: C.red, borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: C.amber },
  cartBadgeTxt: { ...typography.small, fontFamily: Font.bold, color: C.textInverse },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  searchInput: { flex: 1, ...typography.body, color: C.text, padding: 0 },

  catScroll: { marginTop: 12 },
  catContent: { paddingHorizontal: 16, gap: 8, flexDirection: "row" },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, backgroundColor: C.amberSoft, borderWidth: 1.5, borderColor: C.amberBorder },
  catChipActive: { backgroundColor: C.food, borderColor: C.food },
  catChipText: { ...typography.buttonSmall, color: C.food },
  catChipTextActive: { color: C.textInverse },

  secRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 18, marginBottom: 12 },
  secTitle: { ...typography.h3, fontSize: 17, color: C.text },
  countBadge: { backgroundColor: C.food, borderRadius: 10, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  countBadgeTxt: { ...typography.small, fontFamily: Font.bold, color: C.textInverse },

  foodList: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  foodCard: { backgroundColor: C.surface, borderRadius: 18, flexDirection: "row", overflow: "hidden", shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  foodImageBox: { width: 110, backgroundColor: C.amberSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  timeBadge: { position: "absolute", bottom: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.overlayDark60, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  timeText: { ...Typ.smallMedium, fontSize: 10, color: C.textInverse },
  foodInfo: { flex: 1, padding: 14, justifyContent: "center" },
  foodName: { ...typography.button, fontFamily: Font.bold, color: C.text, marginBottom: 3 },
  foodVendor: { ...typography.caption, color: C.textSecondary, marginBottom: 8 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.amberSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  ratingText: { ...typography.caption, fontFamily: Font.bold, color: C.amberDark },
  reviewCount: { ...typography.small, color: C.textMuted },
  foodFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  foodPrice: { ...typography.h3, fontSize: 17, color: C.text },
  addBtn: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.food, alignItems: "center", justifyContent: "center", shadowColor: C.food, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  addBtnAdded: { backgroundColor: C.success },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center" },
  stepperQty: { ...typography.body, fontFamily: Font.bold, color: C.text, minWidth: 18, textAlign: "center" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  errorIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  errorTitle: { ...typography.h3, color: C.text },
  errorSub: { ...typography.body, fontSize: 13, color: C.textMuted },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.food, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  retryBtnTxt: { ...typography.body, fontFamily: Font.bold, color: C.textInverse },
  loadingText: { ...typography.body, fontSize: 13, color: C.textMuted, marginTop: 10 },
  skeletonList: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  skeletonCard: { flexDirection: "row", backgroundColor: C.surface, borderRadius: 18, overflow: "hidden", height: 110 },
  skeletonImg: { width: 110, backgroundColor: C.orangeBg },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { ...typography.h3, color: C.text },
  emptyText: { ...typography.body, color: C.textSecondary },
});
