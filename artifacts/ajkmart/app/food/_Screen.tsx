import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors, { typography } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { T as Typ, Font } from "@/constants/typography";
import { useCollapsibleHeader } from "@/hooks/useCollapsibleHeader";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useGetProducts, useGetCategories } from "@workspace/api-client-react";
import type { Product } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, unwrapApiResponse } from "@/utils/api";
import { CartSwitchModal } from "@/components/CartSwitchModal";
import { AuthGateSheet, useAuthGate, useRoleGate, RoleBlockSheet } from "@/components/AuthGateSheet";

interface FoodProduct {
  id: string;
  name: string;
  price: number;
  image?: string;
  description?: string;
  category?: string;
  vendorId?: string;
  vendorName?: string;
  deliveryTime?: string;
  rating?: number;
  reviewCount?: number;
}

function toFoodProduct(i: { id: string; name: string; price: string | number; image?: string; description?: string; category?: string; vendorId?: string; vendorName?: string; deliveryTime?: string; rating?: number; reviewCount?: number }): FoodProduct {
  return {
    id: i.id,
    name: i.name,
    price: typeof i.price === 'string' ? parseFloat(i.price) : i.price,
    image: i.image,
    description: i.description,
    category: i.category,
    vendorId: i.vendorId,
    vendorName: i.vendorName,
    deliveryTime: i.deliveryTime,
    rating: i.rating,
    reviewCount: i.reviewCount,
  };
}

interface RawVendorData {
  id?: string;
  _id?: string;
  vendorId?: string;
  name?: string;
  storeName?: string;
  storeCategory?: string;
  category?: string;
  productCount?: number;
  avgRating?: number;
  rating?: number;
  storeDeliveryTime?: string;
  deliveryTime?: string;
  storeBanner?: string;
  avatar?: string;
  image?: string;
  storeIsOpen?: boolean;
  storeMinOrder?: number;
  city?: string;
}

const FoodCard = React.memo(function FoodCard({ item }: { item: FoodProduct }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeCardStyles(C), [C]);
  const { addItem, cartType, itemCount, clearCartAndAdd, items, updateQuantity, removeItem } = useCart();
  const [added, setAdded] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { requireAuth, sheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();

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

  const handleAdd = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    requireAuth(() => {
      requireCustomerRole(() => {
        if (itemCount > 0 && cartType !== "food" && cartType !== "none") {
          setShowSwitchModal(true);
          return;
        }
        doAdd();
      });
    }, { message: "Sign in to add items to your cart", returnTo: "/food" });
  };

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })} style={styles.foodCard}>
      <AuthGateSheet {...sheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <CartSwitchModal
        visible={showSwitchModal}
        targetService={T("food")}
        currentService={cartType === "pharmacy" ? T("navPharmacy") : cartType === "mart" ? T("martTitle") : "Another service"}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCartAndAdd({ productId: item.id, name: item.name, price: item.price, quantity: 1, image: item.image, type: "food" }); }}
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
        <Text style={styles.foodName} numberOfLines={1}>{item?.name ?? "—"}</Text>
        <Text style={styles.foodVendor} numberOfLines={1}>{item?.vendorName ?? "Restaurant"}</Text>
        {item?.rating != null && (
          <View style={styles.ratingRow}>
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={11} color={C.gold} />
              <Text style={styles.ratingText}>{item.rating}</Text>
            </View>
            {item?.reviewCount != null && (
              <Text style={styles.reviewCount}>({item.reviewCount} reviews)</Text>
            )}
          </View>
        )}
        <View style={styles.foodFooter}>
          <Text style={styles.foodPrice}>Rs. {item?.price ?? 0}</Text>
          {qtyInCart > 0 ? (
            <View style={styles.stepperRow}>
              <TouchableOpacity activeOpacity={0.7} onPress={(e) => { e?.stopPropagation?.(); if (qtyInCart <= 1) { removeItem(item.id); } else { updateQuantity(item.id, qtyInCart - 1); } }} style={styles.stepperBtn}>
                <Ionicons name={qtyInCart <= 1 ? "trash-outline" : "remove"} size={14} color={C.red} />
              </TouchableOpacity>
              <Text style={styles.stepperQty}>{qtyInCart}</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={(e) => { e?.stopPropagation?.(); updateQuantity(item.id, qtyInCart + 1); }} style={[styles.stepperBtn, { backgroundColor: C.accentSoft }]}>
                <Ionicons name="add" size={14} color={C.amber} />
              </TouchableOpacity>
            </View>
          ) : (
            <Animated.View style={{ transform: [{ scale }] }}>
              <TouchableOpacity activeOpacity={0.7} onPress={(e) => handleAdd(e)} style={[styles.addBtn, added && styles.addBtnAdded]}>
                <Ionicons name={added ? "checkmark" : "add"} size={16} color={C.textInverse} />
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

interface RestaurantCard {
  id: string;
  name: string;
  category: string;
  itemCount: number;
  rating?: number;
  deliveryTime?: string;
  image?: string;
}

function FoodScreenInner() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const { itemCount, cartType, clearCart } = useCart();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const showCartBanner = itemCount > 0 && cartType !== "food" && cartType !== "none";
  const [clearBannerConfirm, setClearBannerConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { category: routeCategory } = useLocalSearchParams<{ category?: string }>();
  const [selectedCat, setSelectedCat] = useState<string | undefined>(routeCategory || undefined);
  const [sortBy, setSortBy] = useState<string>("default");
  const topPad = Math.max(insets.top, 12);
  const { searchOpacity, searchTranslateY, searchMaxHeight, subtitleOpacity, subtitleMaxHeight, scrollHandler, scrollEventThrottle } = useCollapsibleHeader({ expandedHeight: 130, collapsedHeight: 56, scrollThreshold: 80, searchBarHeight: 48 });

  useEffect(() => {
    setSelectedCat(routeCategory || undefined);
  }, [routeCategory]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [search]);

  const { data: catData } = useGetCategories({ type: "food" });
  const { data: allFoodData } = useGetProducts({ type: "food" });
  const { data, isLoading, isError, refetch, isRefetching } = useGetProducts({ type: "food", search: debouncedSearch || undefined, category: selectedCat, ...(sortBy !== "default" ? { sort: sortBy } : {}) });

  const { data: vendorData, isLoading: vendorsLoading } = useQuery({
    queryKey: ["food-vendors-preview"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/vendors?category=food&slim=true`);
      const json = await r.json();
      return unwrapApiResponse<{ vendors?: RawVendorData[]; users?: RawVendorData[] }>(json);
    },
    staleTime: 5 * 60 * 1000,
  });
  const categories = useMemo(() => catData?.categories || [], [catData]);
  const items = useMemo(() => data?.products || [], [data]);

  const restaurants = useMemo<RestaurantCard[]>(() => {
    const vendors: RawVendorData[] = vendorData?.vendors || vendorData?.users || [];
    if (vendors.length > 0) {
      return vendors
        .map(v => {
          const id: string = v._id || v.id || String(v.vendorId || "");
          return {
            ...v,
            id,
            name: v.storeName || v.name || "Restaurant",
            category: v.storeCategory || v.category || "food",
            itemCount: v.productCount ?? 0,
            rating: v.avgRating ?? v.rating,
            deliveryTime: v.storeDeliveryTime || v.deliveryTime,
            image: v.storeBanner || v.avatar || v.image,
          };
        })
        .filter(r => !!r.id) as RestaurantCard[];
    }
    const allProducts: Product[] = allFoodData?.products || [];
    const map = new Map<string, RestaurantCard>();
    for (const p of allProducts) {
      const name = p.vendorName || "Restaurant";
      const vendorId: string = p.vendorId || "";
      if (!map.has(name)) {
        map.set(name, {
          id: vendorId,
          name,
          category: p.category || "food",
          itemCount: 1,
          rating: p.rating,
          deliveryTime: p.deliveryTime,
          image: p.image,
        });
      } else {
        const entry = map.get(name)!;
        entry.itemCount += 1;
        if (!entry.id && vendorId) entry.id = vendorId;
        if (!entry.image && p.image) entry.image = p.image;
        if (!entry.deliveryTime && p.deliveryTime) entry.deliveryTime = p.deliveryTime;
      }
    }
    return Array.from(map.values()).filter(r => r.id);
  }, [allFoodData, vendorData]);

  const handleSelectCat = useCallback((id: string) => {
    setSelectedCat(prev => prev === id ? undefined : id);
  }, []);

  const handleClearSearch = useCallback(() => setSearch(""), []);
  const handleRefetch = useCallback(() => refetch(), [refetch]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[C.amberDark, C.amber, C.gold]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad + 12 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={C.textInverse} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{T("foodDelivery")}</Text>
            <Animated.Text style={[styles.headerSub, { opacity: subtitleOpacity, maxHeight: subtitleMaxHeight }]}>{T("orderFromRestaurants")}</Animated.Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/cart")} style={styles.cartBtn}>
            <Ionicons name="bag-outline" size={22} color={C.textInverse} />
            {itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeTxt}>{itemCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Animated.View style={{ opacity: searchOpacity, maxHeight: searchMaxHeight, transform: [{ translateY: searchTranslateY }], overflow: "hidden" }}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={17} color={C.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={T("searchFoodPlaceholder")}
              placeholderTextColor={C.textMuted}
              maxLength={200}
            />
            {search.length > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={handleClearSearch}>
                <Ionicons name="close-circle" size={18} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </LinearGradient>

      {showCartBanner && (
        <View style={{ backgroundColor: C.indigoSoft, flexDirection: "row", alignItems: "center", padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: C.indigoBorder }}>
          <Ionicons name="warning-outline" size={18} color={C.indigoDark} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.indigoDarkest }}>{cartType === "pharmacy" ? `${T("pharmacy")} cart active` : cartType === "mart" ? `${T("mart")} cart active` : T("anotherCartActive")}</Text>
            <Text style={{ ...Typ.caption, color: C.indigoDarkest }}>{T("cartClearWarning").replace("{service}", T("food"))}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => setClearBannerConfirm(true)}
            style={{ backgroundColor: C.indigoDark, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text style={{ ...Typ.captionBold, color: C.textInverse }}>{T("clearCart")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <CartSwitchModal
        visible={clearBannerConfirm}
        currentService={cartType === "mart" ? T("martTitle") : cartType === "pharmacy" ? T("navPharmacy") : "Current"}
        targetService={T("food")}
        onConfirm={() => { clearCart(); setClearBannerConfirm(false); }}
        onCancel={() => setClearBannerConfirm(false)}
      />

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={C.food} />} onScroll={scrollHandler} scrollEventThrottle={scrollEventThrottle}>

        {/* ── Restaurants section (primary entry point) ── */}
        <View style={{ marginTop: 14, marginBottom: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 }}>
            <View>
              <Text style={{ fontFamily: Font.bold, fontSize: 17, color: C.text }}>Restaurants</Text>
              <Text style={{ fontFamily: Font.regular, fontSize: 11, color: C.textMuted }}>Order from nearby restaurants</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/restaurants")}
              style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.amberSoft, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.amberBorder ?? C.border }}
              accessibilityRole="button" accessibilityLabel="See all restaurants"
            >
              <Text style={{ fontFamily: Font.semiBold, fontSize: 12, color: C.food }}>See All</Text>
              <Ionicons name="chevron-forward" size={13} color={C.food} />
            </TouchableOpacity>
          </View>

          {vendorsLoading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {[0,1,2].map(i => (
                <View key={i} style={{ width: 150, height: 130, borderRadius: 14, backgroundColor: C.surfaceSecondary, overflow: "hidden" }}>
                  <SkeletonBlock w="100%" h={130} r={14} />
                </View>
              ))}
            </ScrollView>
          ) : restaurants.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {restaurants.map((r: any) => {
                const name = r.storeName || r.name || "Restaurant";
                const isOpen = r.storeIsOpen !== false;
                return (
                  <TouchableOpacity key={r.id} activeOpacity={0.75}
                    onPress={() => router.push({ pathname: "/food/store/[id]", params: { id: r.id } })}
                    style={{ width: 150, borderRadius: 14, backgroundColor: C.surface, overflow: "hidden", ...Platform.select({ web: { boxShadow: "0 2px 6px rgba(15,23,42,0.07)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 } }) }}
                    accessibilityRole="button" accessibilityLabel={name}
                  >
                    <View style={{ height: 80, backgroundColor: C.amberSoft, alignItems: "center", justifyContent: "center" }}>
                      {r.storeBanner
                        ? <Image source={{ uri: r.storeBanner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        : <Ionicons name="restaurant-outline" size={32} color={C.food} />
                      }
                      {!isOpen && (
                        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontFamily: Font.bold, fontSize: 11, color: "#fff" }}>{T("closedLabel")}</Text>
                        </View>
                      )}
                      <View style={{ position: "absolute", bottom: 6, right: 6, backgroundColor: isOpen ? C.emerald : C.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: Font.bold, fontSize: 9, color: "#fff" }}>{isOpen ? T("openLabel") : T("closedLabel")}</Text>
                      </View>
                    </View>
                    <View style={{ padding: 9 }}>
                      <Text style={{ fontFamily: Font.bold, fontSize: 12, color: C.text }} numberOfLines={1}>{name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                        {r.avgRating != null && r.avgRating > 0 && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#FFF7ED", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Ionicons name="star" size={9} color={C.amberDark ?? "#D97706"} />
                            <Text style={{ fontFamily: Font.bold, fontSize: 10, color: C.amberDark ?? "#D97706" }}>{r.avgRating.toFixed(1)}</Text>
                          </View>
                        )}
                        {r.storeDeliveryTime && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                            <Ionicons name="time-outline" size={9} color={C.textMuted} />
                            <Text style={{ fontFamily: Font.regular, fontSize: 10, color: C.textMuted }}>{r.storeDeliveryTime}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity activeOpacity={0.75}
                onPress={() => router.push("/restaurants")}
                style={{ width: 100, borderRadius: 14, backgroundColor: C.amberSoft, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.amberBorder ?? C.border, borderStyle: "dashed" as any, gap: 6 }}
                accessibilityRole="button" accessibilityLabel="See all restaurants"
              >
                <Ionicons name="storefront-outline" size={22} color={C.food} />
                <Text style={{ fontFamily: Font.semiBold, fontSize: 11, color: C.food, textAlign: "center" }}>See All{"\n"}Restaurants</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/restaurants")}
              style={{ marginHorizontal: 16, flexDirection: "row", alignItems: "center", backgroundColor: C.amberSoft, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: C.amberBorder ?? C.border }}
              accessibilityRole="button" accessibilityLabel="Browse restaurants"
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.food, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="storefront-outline" size={18} color={C.textInverse} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Font.bold, fontSize: 14, color: C.text }}>Browse Restaurants</Text>
                <Text style={{ fontFamily: Font.regular, fontSize: 11, color: C.textMuted }}>Explore nearby restaurants and their full menus</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: C.borderLight, marginHorizontal: 16, marginTop: 16, marginBottom: 4 }} />
        <Text style={{ fontFamily: Font.bold, fontSize: 17, color: C.text, paddingHorizontal: 16, marginTop: 12, marginBottom: 4 }}>Menu Items</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedCat(undefined)} style={[styles.catChip, !selectedCat && styles.catChipActive]}>
            <Ionicons name="fast-food-outline" size={14} color={!selectedCat ? C.textInverse : C.food} />
            <Text style={[styles.catChipText, !selectedCat && styles.catChipTextActive]}>All</Text>
          </TouchableOpacity>
          {(categories as { id: string; name: string; icon?: string }[]).map(c => (
            <TouchableOpacity activeOpacity={0.7} key={c.id} onPress={() => handleSelectCat(c.id)} style={[styles.catChip, selectedCat === c.id && styles.catChipActive]}>
              <Ionicons name={((c as unknown as { icon?: string }).icon ?? "apps-outline") as keyof typeof Ionicons.glyphMap} size={14} color={selectedCat === c.id ? C.textInverse : C.food} />
              <Text style={[styles.catChipText, selectedCat === c.id && styles.catChipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/categories", params: { type: "food" } })}
            style={[styles.catChip, { borderStyle: "dashed" as any }]}
          >
            <Ionicons name="apps-outline" size={14} color={C.food} />
            <Text style={styles.catChipText}>Browse All</Text>
          </TouchableOpacity>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}>
          {([
            { key: "default", label: T("defaultLabel" as TranslationKey), icon: "swap-vertical-outline" as const },
            { key: "price_asc", label: T("priceLowHigh" as TranslationKey), icon: "arrow-up-outline" as const },
            { key: "price_desc", label: T("priceHighLow" as TranslationKey), icon: "arrow-down-outline" as const },
            { key: "popular", label: T("popular" as TranslationKey), icon: "flame-outline" as const },
            { key: T("ratingLabel"), label: T("topRated" as TranslationKey), icon: "star-outline" as const },
            { key: "newest", label: T("newest" as TranslationKey), icon: "time-outline" as const },
          ] as const).map(opt => (
            <TouchableOpacity activeOpacity={0.7} key={opt.key} onPress={() => setSortBy(opt.key)}
              style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: sortBy === opt.key ? C.food : C.surface, borderWidth: 1, borderColor: sortBy === opt.key ? C.food : C.border }}
            >
              <Ionicons name={opt.icon} size={13} color={sortBy === opt.key ? C.textInverse : C.textMuted} />
              <Text style={{ fontFamily: Font.semiBold, fontSize: 11, color: sortBy === opt.key ? C.textInverse : C.textSecondary }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
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
            <Text style={styles.errorTitle}>{T("couldNotLoad")}</Text>
            <Text style={styles.errorSub}>{T("checkInternetRetry")}</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={handleRefetch} style={styles.retryBtn}>
              <Ionicons name="refresh-outline" size={16} color={C.textInverse} />
              <Text style={styles.retryBtnTxt}>{T("retry")}</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="restaurant-outline" size={48} color={C.border} />
            </View>
            <Text style={styles.emptyTitle}>{T("noFoodItemsYet")}</Text>
            <Text style={styles.emptyText}>{T("vendorsAddingSoon")}</Text>
          </View>
        ) : (
          <>
            <View style={styles.secRow}>
              <Text style={styles.secTitle}>
                {search ? `Results for "${search}"` : selectedCat ? T("categoryItemsLabel") : "Popular Near You"}
              </Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeTxt}>{items.length}</Text>
              </View>
            </View>
            <View style={styles.foodList}>
              {items.map(i => <FoodCard key={i.id} item={toFoodProduct(i)} />)}
            </View>
          </>
        )}
        <View style={{ height: Math.max(insets.bottom, Platform.OS === "web" ? 34 : 20) }} />
      </ScrollView>
    </View>
  );
}

function makeCardStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  foodCard: { backgroundColor: C.surface, borderRadius: 18, flexDirection: "row", overflow: "hidden", ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(15,23,42,0.07)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 } }) },
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
  addBtn: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.food, alignItems: "center", justifyContent: "center", ...Platform.select({ web: { boxShadow: "0 2px 4px rgba(255,149,0,0.3)" }, default: { shadowColor: C.food, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 } }) },
  addBtnAdded: { backgroundColor: C.success },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center" },
  stepperQty: { ...typography.body, fontFamily: Font.bold, color: C.text, minWidth: 18, textAlign: "center" },
  });
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight20, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.h3, fontSize: 20, color: C.textInverse },
  headerSub: { ...typography.caption, color: C.overlayLight80, marginTop: 2 },
  cartBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.overlayLight20, alignItems: "center", justifyContent: "center" },
  cartBadge: { position: "absolute", top: -4, right: -4, backgroundColor: C.red, borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: C.amber },
  cartBadgeTxt: { ...typography.small, fontFamily: Font.bold, color: C.textInverse },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(15,23,42,0.08)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 } }) },
  searchInput: { flex: 1, ...typography.body, color: C.text, padding: 0 },

  catScroll: { marginTop: 12 },
  catContent: { paddingHorizontal: 16, gap: 8, flexDirection: "row" },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, backgroundColor: C.amberSoft, borderWidth: 1.5, borderColor: C.amberBorder },
  catChipActive: { backgroundColor: C.food, borderColor: C.food },
  catChipText: { ...typography.buttonSmall, color: C.food },
  catChipTextActive: { color: C.textInverse },

  restaurantCard: { width: 140, backgroundColor: C.surface, borderRadius: 16, overflow: "hidden", ...Platform.select({ web: { boxShadow: "0 2px 6px rgba(15,23,42,0.08)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 } }) },
  restaurantImgBox: { width: 140, height: 90, backgroundColor: C.amberSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  restaurantOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.08)" },
  restaurantInfo: { padding: 10 },
  restaurantName: { ...typography.buttonSmall, fontFamily: Font.bold, color: C.text, marginBottom: 2 },
  restaurantMeta: { ...typography.small, color: C.textMuted },

  secRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 14, marginBottom: 10 },
  secTitle: { ...typography.h3, fontSize: 17, color: C.text },
  countBadge: { backgroundColor: C.food, borderRadius: 10, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  countBadgeTxt: { ...typography.small, fontFamily: Font.bold, color: C.textInverse },

  foodList: { paddingHorizontal: 16, gap: 12 },

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
}

export default FoodScreenInner;
