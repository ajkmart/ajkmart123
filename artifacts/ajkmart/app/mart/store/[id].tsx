import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Animated,
  Image,
  RefreshControl,
  ScrollView,
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
import { useCart } from "@/context/CartContext";
import { useSmartBack } from "@/hooks/useSmartBack";
import { AuthGateSheet, useAuthGate, useRoleGate, RoleBlockSheet } from "@/components/AuthGateSheet";
import { CartSwitchModal } from "@/components/CartSwitchModal";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { WishlistHeart } from "@/components/WishlistHeart";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

const CARD_W_CONST = (375 - 16 * 2 - 12) / 2;

interface MartProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image?: string | null;
  category: string;
  rating?: number | null;
  reviewCount?: number;
  inStock: boolean;
  unit?: string;
  type: string;
  description?: string;
}

interface Vendor {
  id: string;
  name: string;
  storeName?: string;
  storeCategory?: string;
  storeBanner?: string;
  storeDescription?: string;
  storeDeliveryTime?: string;
  storeIsOpen: boolean;
  storeMinOrder: number;
  storeAnnouncement?: string;
  avatar?: string;
  city?: string;
  avgRating?: number;
  reviewCount?: number;
}

function ProductGridCard({ product, styles, C }: { product: MartProduct, styles: any, C: any }) {
  const { addItem, cartType, itemCount, clearCartAndAdd, items, updateQuantity, removeItem } = useCart();
  const { requireAuth, sheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

  const cartItem = items.find(i => i.productId === product.id);
  const qtyInCart = cartItem?.quantity ?? 0;

  const origPrice = Number(product.originalPrice) || 0;
  const price = Number(product.price) || 0;
  const discount = origPrice > 0 && origPrice > price
    ? Math.round(((origPrice - price) / origPrice) * 100)
    : 0;

  useEffect(() => () => { if (addedTimerRef.current) clearTimeout(addedTimerRef.current); }, []);

  const doAdd = () => {
    addItem({ productId: product.id, name: product.name, price: product.price, quantity: 1, image: product.image ?? undefined, type: "mart" });
    setAdded(true);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => { setAdded(false); addedTimerRef.current = null; }, 1500);
  };

  const handleAdd = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    requireAuth(() => {
      requireCustomerRole(() => {
        if (itemCount > 0 && cartType !== "mart" && cartType !== "none") {
          setShowSwitchModal(true);
          return;
        }
        doAdd();
      });
    }, { message: "Sign in to add items to your cart" });
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
      style={[styles.productCard, { width: (useWindowDimensions().width - 16 * 2 - 12) / 2 }]}
    >
      <AuthGateSheet {...sheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <CartSwitchModal
        visible={showSwitchModal}
        targetService={T("martTitle")}
        currentService={cartType === "pharmacy" ? T("navPharmacy") : cartType === "food" ? T("food") : "Another service"}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCartAndAdd({ productId: product.id, name: product.name, price: product.price, quantity: 1, image: product.image ?? undefined, type: "mart" }); }}
      />
      <View style={styles.productImg}>
        {product.image
          ? <Image source={{ uri: product.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Ionicons name="cube-outline" size={32} color={C.textMuted} />}
        {discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountTxt}>{discount}% OFF</Text>
          </View>
        )}
        <WishlistHeart productId={product.id} size={14} style={{ position: "absolute", top: 6, right: 6 }} />
      </View>
      <View style={styles.productBody}>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        {product.unit && <Text style={styles.productUnit}>{product.unit}</Text>}
        <View style={styles.productFooter}>
          <View>
            <Text style={styles.productPrice}>Rs. {price.toLocaleString()}</Text>
            {origPrice > price && (
              <Text style={styles.productOrigPrice}>Rs. {origPrice.toLocaleString()}</Text>
            )}
          </View>
          {!product.inStock ? (
            <View style={styles.outOfStockChip}>
              <Text style={styles.outOfStockTxt}>Out</Text>
            </View>
          ) : qtyInCart > 0 ? (
            <View style={styles.stepperRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={(e) => { e.stopPropagation(); if (qtyInCart <= 1) { removeItem(product.id); } else { updateQuantity(product.id, qtyInCart - 1); } }}
                style={styles.stepperBtn}
              >
                <Ionicons name={qtyInCart <= 1 ? "trash-outline" : "remove"} size={14} color={C.danger} />
              </TouchableOpacity>
              <Text style={styles.stepperQty}>{qtyInCart}</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={(e) => { e.stopPropagation(); handleAdd(e); }}
                style={[styles.stepperBtn, { backgroundColor: C.primarySoft }]}
              >
                <Ionicons name="add" size={14} color={C.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <Animated.View style={{ transform: [{ scale }] }}>
              <TouchableOpacity activeOpacity={0.7} onPress={handleAdd} style={[styles.addBtn, added && styles.addBtnDone]}>
                <Ionicons name={added ? "checkmark" : "add"} size={16} color={C.textInverse} />
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MartStorePage() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { width: W } = useWindowDimensions();
  const CARD_W = (W - 16 * 2 - 12) / 2;
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(T("allTypes"));

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["mart-store", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/vendors/${id}/store`, {
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      return unwrapApiResponse(json) as { vendor: Vendor; products: MartProduct[] };
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const vendor = data?.vendor;
  const products = data?.products ?? [];

  const categories = useMemo(() => {
    const cats = [T("allTypes"), ...Array.from(new Set(products.map(i => i.category).filter(Boolean)))];
    return cats;
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory !== T("allTypes")) list = list.filter(i => i.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCategory, search]);

  const topPad = Math.max(insets.top, 12);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Store</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <SkeletonBlock w="100%" h={180} r={16} />
          <SkeletonBlock w="60%" h={24} r={8} />
          <SkeletonBlock w="40%" h={16} r={8} />
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            {[1, 2, 3, 4].map(i => <SkeletonBlock key={i} w={CARD_W} h={200} r={12} />)}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (isError || !vendor) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Store</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
          <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
          <Text style={{ fontFamily: Font.semiBold, fontSize: 16, color: C.text }}>Store not found</Text>
          <Text style={{ fontFamily: Font.regular, fontSize: 13, color: C.textMuted, textAlign: "center" }}>
            We could not load this store. Please check your connection and try again.
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn} activeOpacity={0.7}>
            <Text style={{ fontFamily: Font.semiBold, color: C.textInverse }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isOpen = vendor.storeIsOpen;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {vendor.storeName ?? vendor.name}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} colors={[C.primary]} />}
      >
        {vendor.storeBanner ? (
          <Image source={{ uri: vendor.storeBanner }} style={styles.banner} resizeMode="cover" />
        ) : (
          <View style={[styles.banner, { backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="storefront" size={48} color={C.primary} />
          </View>
        )}

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.storeName}>{vendor.storeName ?? vendor.name}</Text>
              {vendor.storeCategory && (
                <Text style={styles.storeCategory}>{vendor.storeCategory}</Text>
              )}
            </View>
            <View style={[styles.statusChip, { backgroundColor: isOpen ? C.emeraldBg : C.redBg }]}>
              <View style={[styles.statusDot, { backgroundColor: isOpen ? C.emerald : C.red }]} />
              <Text style={[styles.statusText, { color: isOpen ? C.emeraldDeep : C.redBright }]}>
                {isOpen ? T("openLabel") : T("closedLabel")}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            {vendor.avgRating != null && vendor.avgRating > 0 && (
              <View style={styles.metaItem}>
                <Ionicons name="star" size={14} color={C.gold} />
                <Text style={[styles.metaText, { fontFamily: Font.bold, color: C.text }]}>{vendor.avgRating.toFixed(1)}</Text>
              </View>
            )}
            {vendor.storeDeliveryTime && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={C.textMuted} />
                <Text style={styles.metaText}>{vendor.storeDeliveryTime}</Text>
              </View>
            )}
            {vendor.storeMinOrder > 0 && (
              <View style={styles.metaItem}>
                <Ionicons name="bag-outline" size={14} color={C.textMuted} />
                <Text style={styles.metaText}>Min Rs. {vendor.storeMinOrder}</Text>
              </View>
            )}
            {vendor.city && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={C.textMuted} />
                <Text style={styles.metaText}>{vendor.city}</Text>
              </View>
            )}
          </View>

          {vendor.storeAnnouncement ? (
            <View style={styles.announcementBox}>
              <Ionicons name="megaphone-outline" size={14} color={C.primary} />
              <Text style={styles.announcementText}>{vendor.storeAnnouncement}</Text>
            </View>
          ) : null}

          {vendor.storeDescription ? (
            <Text style={styles.description}>{vendor.storeDescription}</Text>
          ) : null}
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={T("searchProducts")}
            placeholderTextColor={C.textMuted}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {categories.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.catChipText, activeCategory === cat && styles.catChipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {filtered.length === 0 ? (
          <View style={{ alignItems: "center", padding: 40, gap: 8 }}>
            <Ionicons name="cube-outline" size={40} color={C.textMuted} />
            <Text style={{ fontFamily: Font.regular, color: C.textMuted, fontSize: 14 }}>
              {search ? "No products match your search" : "No products in this category"}
            </Text>
          </View>
        ) : (
          <View style={styles.productGrid}>
            {filtered.map(item => (
              <ProductGridCard key={item.id} product={item} styles={styles} C={C} />
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  headerBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, fontFamily: Font.bold, fontSize: 16, color: C.text, textAlign: "center", marginHorizontal: 8,
  },
  banner: { width: "100%", height: 180 },
  infoSection: { padding: 16, backgroundColor: C.surface, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  storeName: { fontFamily: Font.bold, fontSize: 20, color: C.text },
  storeCategory: { fontFamily: Font.regular, fontSize: 13, color: C.textSecondary, marginTop: 2 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: Font.semiBold, fontSize: 12 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  announcementBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: C.primarySoft, padding: 10, borderRadius: 10, marginTop: 4,
  },
  announcementText: { flex: 1, fontFamily: Font.regular, fontSize: 12, color: C.primary, lineHeight: 18 },
  description: { fontFamily: Font.regular, fontSize: 13, color: C.textSecondary, lineHeight: 20, marginTop: 4 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: C.surfaceSecondary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontFamily: Font.regular, fontSize: 14, color: C.text, paddingVertical: 0 },
  catRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border,
  },
  catChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  catChipText: { fontFamily: Font.semiBold, fontSize: 12, color: C.textSecondary },
  catChipTextActive: { color: C.textInverse },
  productGrid: {
    flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12, paddingTop: 4,
  },
  productCard: {
    backgroundColor: C.surface, borderRadius: radii.xl, overflow: "hidden",
    borderWidth: 1, borderColor: C.borderLight, ...shadows.sm,
  },
  productImg: {
    height: 130, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  discountBadge: {
    position: "absolute", top: 6, left: 6, backgroundColor: C.danger,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  discountTxt: { fontFamily: Font.bold, fontSize: 10, color: "#fff" },
  productBody: { padding: 10, gap: 2 },
  productName: { fontFamily: Font.semiBold, fontSize: 13, color: C.text, lineHeight: 18 },
  productUnit: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted },
  productPrice: { fontFamily: Font.bold, fontSize: 14, color: C.primary },
  productOrigPrice: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted, textDecorationLine: "line-through" },
  productFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  addBtn: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: C.primary,
    alignItems: "center", justifyContent: "center",
  },
  addBtnDone: { backgroundColor: C.emerald },
  outOfStockChip: {
    paddingHorizontal: 8, paddingVertical: 3, backgroundColor: C.dangerSoft, borderRadius: 8,
  },
  outOfStockTxt: { fontFamily: Font.semiBold, fontSize: 10, color: C.danger },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepperBtn: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: C.dangerSoft,
    alignItems: "center", justifyContent: "center",
  },
  stepperQty: { fontFamily: Font.bold, fontSize: 13, color: C.text, minWidth: 20, textAlign: "center" },
  retryBtn: {
    backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12,
  },
  });
}
