import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { createLogger } from "@/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Animated,
  FlatList,
  Image,
  Platform,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { T as Typ, Font } from "@/constants/typography";
import { useCollapsibleHeader } from "@/hooks/useCollapsibleHeader";
import { useCart } from "@/context/CartContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
const T = (key: TranslationKey) => tDual(key, "en");
import { useGetProducts, useGetCategories, getFlashDeals, type FlashDealProduct } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { WishlistHeart } from "@/components/WishlistHeart";
import { CartSwitchModal } from "@/components/CartSwitchModal";
import { AuthGateSheet, useAuthGate, useRoleGate, RoleBlockSheet } from "@/components/AuthGateSheet";
const log = createLogger("[Mart]");

const FLASH_CARD_W = (375 - 16 * 2 - 12) / 2;
const PRODUCT_CARD_W = (375 - 16 * 2 - 12) / 2;
const RECENTLY_VIEWED_KEY = "recently_viewed_products";

interface RecentItem { id: string; name: string; image: string | null; price: number; }

interface MartProduct {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  unit?: string;
  originalPrice?: number | string;
  discountPercent?: number;
  dealStock?: number | null;
  soldCount?: number;
  vendorId?: string;
  categoryId?: string;
  inStock?: boolean;
  description?: string;
  rating?: number | null;
}

function toMartProduct(p: { id: string; name: string; price: string | number; image?: string | null; unit?: string; originalPrice?: number | string; discountPercent?: number; dealStock?: number | null; soldCount?: number; vendorId?: string; categoryId?: string; inStock?: boolean; description?: string; rating?: number | null; [key: string]: unknown }): MartProduct {
  return {
    id: p.id,
    name: p.name,
    price: typeof p.price === "string" ? parseFloat(p.price) : p.price,
    image: p.image,
    unit: p.unit,
    originalPrice: p.originalPrice,
    discountPercent: p.discountPercent,
    dealStock: p.dealStock,
    soldCount: p.soldCount,
    vendorId: p.vendorId,
    categoryId: p.categoryId,
    inStock: p.inStock,
    description: p.description,
    rating: p.rating,
  };
}

function MartRecentlyViewed() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeRecentlyViewedStyles(C), [C]);
  const [items, setItems] = React.useState<RecentItem[]>([]);
  React.useEffect(() => {
    AsyncStorage.getItem(RECENTLY_VIEWED_KEY)
      .then(raw => { if (raw) { try { setItems(JSON.parse(raw)); } catch (parseErr) { log.warn("Failed to parse recently viewed:", parseErr instanceof Error ? parseErr.message : String(parseErr)); } } })
      .catch((err) => { log.warn("Failed to load recently viewed:", err instanceof Error ? err.message : String(err)); });
  }, []);
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 10 }}>
        <Text style={{ flex: 1, fontFamily: Font.bold, fontSize: 14, color: C.text }}>Recently Viewed</Text>
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => { AsyncStorage.removeItem(RECENTLY_VIEWED_KEY).catch((err) => { log.warn("Failed to clear recently viewed:", err); }); setItems([]); }}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Ionicons name="close-circle-outline" size={13} color={C.textMuted} />
          <Text style={{ fontFamily: Font.regular, fontSize: 11, color: C.textMuted }}>Clear</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={items}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
            style={{ width: 100, backgroundColor: C.surface, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: C.border }}
          >
            {item.image
              ? <Image source={{ uri: item.image }} style={{ width: 100, height: 80 }} resizeMode="cover" />
              : <View style={{ width: 100, height: 80, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" }}><Ionicons name="cube-outline" size={20} color={C.textMuted} /></View>
            }
            <View style={{ padding: 6, gap: 2 }}>
              <Text style={{ fontFamily: Font.medium, fontSize: 10, color: C.text, lineHeight: 14 }} numberOfLines={2}>{item.name}</Text>
              <Text style={{ fontFamily: Font.bold, fontSize: 11, color: C.primary }}>Rs. {Number(item.price).toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function QuantityStepper({ quantity, onIncrement, onDecrement }: { quantity: number; onIncrement: () => void; onDecrement: () => void }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.stepperRow}>
      <TouchableOpacity activeOpacity={0.7} onPress={(e) => { e?.stopPropagation?.(); onDecrement(); }} style={styles.stepperBtn}>
        <Ionicons name={quantity <= 1 ? "trash-outline" : "remove"} size={14} color={C.danger} />
      </TouchableOpacity>
      <Text style={styles.stepperQty}>{quantity}</Text>
      <TouchableOpacity activeOpacity={0.7} onPress={(e) => { e?.stopPropagation?.(); onIncrement(); }} style={[styles.stepperBtn, { backgroundColor: C.primarySoft }]}>
        <Ionicons name="add" size={14} color={C.primary} />
      </TouchableOpacity>
    </View>
  );
}

function AddToCartButton({ onPress, added, disabled }: { onPress: () => void; added: boolean; disabled?: boolean }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = (e: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (disabled) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.4 : 1 }}>
      <TouchableOpacity activeOpacity={disabled ? 1 : 0.7} onPress={handlePress} style={[styles.addBtn, added && styles.addBtnDone, disabled && { backgroundColor: C.textMuted }]}>
        <Ionicons name={added ? "checkmark" : "add"} size={16} color={C.textInverse} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const FlashCard = React.memo(function FlashCard({ product }: { product: FlashDealProduct }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { addItem, cartType, itemCount, clearCartAndAdd } = useCart();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origPrice = Number(product.originalPrice) || 0;
  const productPrice = Number(product.price);
  const discount = origPrice > 0 && origPrice > productPrice
    ? Math.round(((origPrice - productPrice) / origPrice) * 100)
    : product.discountPercent || 0;
  const dealStock = product.dealStock ?? null;
  const soldCount = product.soldCount ?? 0;
  const remaining = dealStock != null ? Math.max(0, dealStock - soldCount) : null;

  useEffect(() => () => { if (addedTimerRef.current) clearTimeout(addedTimerRef.current); }, []);

  const { requireAuth, sheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();

  const doAdd = () => {
    addItem({ productId: product.id, name: product.name, price: productPrice, quantity: 1, image: product.image ?? undefined, type: "mart" });
    setAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => { setAdded(false); addedTimerRef.current = null; }, 1500);
  };

  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const handleAdd = () => {
    requireAuth(() => {
      requireCustomerRole(() => {
        if (itemCount > 0 && cartType !== "mart" && cartType !== "none") {
          setShowSwitchModal(true);
          return;
        }
        doAdd();
      });
    }, { message: "Sign in to add items to your cart", returnTo: "/mart" });
  };

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })} style={[styles.flashCard, { width: FLASH_CARD_W }]}>
      <AuthGateSheet {...sheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <CartSwitchModal
        visible={showSwitchModal}
        targetService={T("martTitle")}
        currentService={cartType === "pharmacy" ? T("navPharmacy") : cartType === "food" ? T("food") : "Another service"}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCartAndAdd({ productId: product.id, name: product.name, price: productPrice, quantity: 1, image: product.image ?? undefined, type: "mart" }); }}
      />
      <View style={styles.flashImg}>
        {product.image
          ? <Image source={{ uri: product.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <LinearGradient colors={[C.orangeBg, C.orangeSoft]} style={StyleSheet.absoluteFill} />}
        {!product.image && <Ionicons name="flash" size={28} color={C.gold} />}
        {discount > 0 && (
          <View style={styles.flashBadge}>
            <Text style={styles.flashBadgeTxt}>{discount}%</Text>
            <Text style={styles.flashBadgeSub}>OFF</Text>
          </View>
        )}
        <WishlistHeart productId={product.id} size={14} style={{ position: "absolute", top: 6, right: 6 }} />
      </View>
      <View style={styles.flashBody}>
        <Text style={styles.flashName} numberOfLines={2}>{product?.name ?? "—"}</Text>
        {product?.unit && <Text style={styles.flashUnit}>{product.unit}</Text>}
        {remaining != null && (
          <Text style={styles.flashStockTxt}>
            {remaining > 0 ? `${remaining} left · ${soldCount} sold` : T("soldOutLabel")}
          </Text>
        )}
        <View style={styles.flashFooter}>
          <View>
            {discount > 0 && Number(product?.originalPrice ?? 0) > 0 && (
              <Text style={styles.flashOrigPrice}>Rs. {product.originalPrice}</Text>
            )}
            <Text style={styles.flashPrice}>Rs. {product?.price ?? 0}</Text>
          </View>
          <AddToCartButton onPress={handleAdd} added={added} disabled={remaining === 0} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

const ProductCard = React.memo(function ProductCard({ product }: { product: MartProduct }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { addItem, cartType, itemCount, clearCartAndAdd, items, updateQuantity, removeItem } = useCart();
  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origPrice = Number(product.originalPrice) || 0;
  const discount = origPrice > 0
    ? Math.round(((origPrice - product.price) / origPrice) * 100)
    : 0;

  const cartItem = items.find(i => i.productId === product.id);
  const qtyInCart = cartItem?.quantity ?? 0;

  useEffect(() => () => { if (addedTimerRef.current) clearTimeout(addedTimerRef.current); }, []);

  const { requireAuth, sheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();

  const doAdd = () => {
    addItem({ productId: product.id, name: product.name ?? "—", price: product.price ?? 0, quantity: 1, image: product.image ?? undefined, type: "mart" });
    setAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => { setAdded(false); addedTimerRef.current = null; }, 1500);
  };

  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const handleAdd = () => {
    requireAuth(() => {
      requireCustomerRole(() => {
        if (itemCount > 0 && cartType !== "mart" && cartType !== "none") {
          setShowSwitchModal(true);
          return;
        }
        doAdd();
      });
    }, { message: "Sign in to add items to your cart", returnTo: "/mart" });
  };

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })} style={[styles.productCard, { width: PRODUCT_CARD_W }]}>
      <AuthGateSheet {...sheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <CartSwitchModal
        visible={showSwitchModal}
        targetService={T("martTitle")}
        currentService={cartType === "pharmacy" ? T("navPharmacy") : cartType === "food" ? T("food") : "Another service"}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCartAndAdd({ productId: product.id, name: product.name ?? "—", price: product.price ?? 0, quantity: 1, image: product.image ?? undefined, type: "mart" }); }}
      />
      <View style={styles.productImg}>
        {product.image
          ? <Image source={{ uri: product.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Ionicons name="leaf-outline" size={32} color={C.textMuted} />}
        {discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountTxt}>{discount}% OFF</Text>
          </View>
        )}
        {product.rating != null && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color={C.gold} />
            <Text style={styles.ratingTxt}>{product.rating}</Text>
          </View>
        )}
        <WishlistHeart productId={product.id} size={14} style={{ position: "absolute", top: 6, right: 6 }} />
      </View>
      <View style={styles.productBody}>
        <Text style={styles.productName} numberOfLines={2}>{product?.name ?? "—"}</Text>
        {product?.unit && <Text style={styles.productUnit}>{product.unit}</Text>}
        {product.vendorId && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation?.();
              router.push({ pathname: "/mart/store/[id]", params: { id: product.vendorId! } });
            }}
            style={styles.visitStoreLink}
          >
            <Ionicons name="storefront-outline" size={11} color={C.primary} />
            <Text style={styles.visitStoreTxt}>Visit Store</Text>
          </TouchableOpacity>
        )}
        <View style={styles.productFooter}>
          <View>
            <Text style={styles.productPrice}>Rs. {product?.price ?? 0}</Text>
            {product.originalPrice && (
              <Text style={styles.productOrigPrice}>Rs. {product.originalPrice}</Text>
            )}
          </View>
          {qtyInCart > 0 ? (
            <QuantityStepper
              quantity={qtyInCart}
              onIncrement={() => updateQuantity(product.id, qtyInCart + 1)}
              onDecrement={() => qtyInCart <= 1 ? removeItem(product.id) : updateQuantity(product.id, qtyInCart - 1)}
            />
          ) : (
            <AddToCartButton onPress={handleAdd} added={added} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

function MartScreenInner() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { width } = useWindowDimensions();
  const FLASH_CARD_W = (width - 16 * 2 - 12) / 2;
  const PRODUCT_CARD_W = (width - 16 * 2 - 12) / 2;
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const { itemCount, cartType, clearCart } = useCart();
  const showCartBanner = itemCount > 0 && cartType !== "mart" && cartType !== "none";
  const [clearBannerConfirm, setClearBannerConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topPad = Math.max(insets.top, 12);
  const { searchOpacity, searchTranslateY, searchMaxHeight, subtitleOpacity, subtitleMaxHeight, scrollHandler, scrollEventThrottle } = useCollapsibleHeader({ expandedHeight: 130, collapsedHeight: 56, scrollThreshold: 80, searchBarHeight: 48 });
  const { focus, category: routeCategory } = useLocalSearchParams<{ focus?: string; category?: string }>();
  const [selectedCat, setSelectedCat] = useState<string | undefined>(routeCategory || undefined);
  const [sortBy, setSortBy] = useState<string>("default");
  const searchInputRef = useRef<TextInput>(null);

  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  useEffect(() => {
    setSelectedCat(routeCategory || undefined);
  }, [routeCategory]);

  useEffect(() => {
    if (focus === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 300);
    }
  }, [focus]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [search]);

  const { config: platformConfig } = usePlatformConfig();
  const appName = platformConfig.platform.appName;

  const { data: catData } = useGetCategories({ type: "mart" });
  const { data, isLoading, isError, refetch, isRefetching } = useGetProducts({ type: "mart", search: debouncedSearch || undefined, category: selectedCat, ...(sortBy !== "default" ? { sort: sortBy } : {}) });
  const flashDealsLimit = platformConfig.pagination?.flashDealsLimit ?? 20;
  const { data: flashDealsData, refetch: refetchFlashDeals } = useQuery({
    queryKey: ["flash-deals", flashDealsLimit],
    queryFn: () => getFlashDeals({ limit: flashDealsLimit }),
    staleTime: 2 * 60 * 1000,
    enabled: !debouncedSearch && !selectedCat,
  });

  const categories = useMemo(() => catData?.categories || [], [catData]);
  const products   = useMemo(() => data?.products   || [], [data]);
  const flashDeals = useMemo(() => flashDealsData || [], [flashDealsData]);
  const allProducts = products;

  const handleRefetchAll = useCallback(() => {
    refetch();
    refetchFlashDeals();
  }, [refetch, refetchFlashDeals]);

  const handleSelectCat = useCallback((id: string) => {
    setSelectedCat(prev => prev === id ? undefined : id);
  }, []);

  const handleClearSearch = useCallback(() => setSearch(""), []);
  const handleRefetch = useCallback(() => handleRefetchAll(), [handleRefetchAll]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[C.brandBlueDark, C.brandBlue, C.brandBlueMid]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad + 12 }]}
      >
        <View style={styles.hdrRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={C.textInverse} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.hdrTitle}>{appName} {T("martTitle")}</Text>
            <Animated.Text style={[styles.hdrSub, { opacity: subtitleOpacity, maxHeight: subtitleMaxHeight }]}>{T("freshGroceriesDelivered")}</Animated.Text>
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
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={17} color={C.textMuted} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={T("searchGroceries")}
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
        <View style={{ backgroundColor: C.amberSoft, flexDirection: "row", alignItems: "center", padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: C.amberBorder }}>
          <Ionicons name="warning-outline" size={18} color={C.amber} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.amberDark }}>{cartType === "pharmacy" ? T("pharmacyCartActive") : cartType === "food" ? T("foodCartActive") : T("anotherCartActive")}</Text>
            <Text style={{ ...Typ.caption, color: C.amberDark }}>{T("addingMartClearCart")}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => setClearBannerConfirm(true)}
            style={{ backgroundColor: C.amber, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text style={{ ...Typ.captionBold, color: C.textInverse }}>{T("clearCart")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <CartSwitchModal
        visible={clearBannerConfirm}
        currentService={cartType === "food" ? T("food") : cartType === "pharmacy" ? T("navPharmacy") : "Current"}
        targetService={T("martTitle")}
        onConfirm={() => { clearCart(); setClearBannerConfirm(false); }}
        onCancel={() => setClearBannerConfirm(false)}
      />

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefetchAll} tintColor={C.primary} />} onScroll={scrollHandler} scrollEventThrottle={scrollEventThrottle}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingTop: 14 }} contentContainerStyle={styles.catRow}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => setSelectedCat(undefined)}
            style={[styles.catChip, !selectedCat && styles.catChipActive]}
          >
            <Ionicons name="grid-outline" size={14} color={!selectedCat ? C.textInverse : C.primary} />
            <Text style={[styles.catChipTxt, !selectedCat && styles.catChipTxtActive]}>{T("all")}</Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity activeOpacity={0.7}
              key={cat.id}
              onPress={() => handleSelectCat(cat.id)}
              style={[styles.catChip, selectedCat === cat.id && styles.catChipActive]}
            >
              <Ionicons name={((cat as unknown as { icon?: string }).icon ?? "apps-outline") as keyof typeof Ionicons.glyphMap} size={14} color={selectedCat === cat.id ? C.textInverse : C.primary} />
              <Text style={[styles.catChipTxt, selectedCat === cat.id && styles.catChipTxtActive]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/categories", params: { type: "mart" } })}
            style={[styles.catChip, { borderStyle: "dashed" as any }]}
          >
            <Ionicons name="apps-outline" size={14} color={C.primary} />
            <Text style={styles.catChipTxt}>{T("browseAllCategories")}</Text>
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
              style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: sortBy === opt.key ? C.primary : C.surface, borderWidth: 1, borderColor: sortBy === opt.key ? C.primary : C.border }}
            >
              <Ionicons name={opt.icon} size={13} color={sortBy === opt.key ? C.textInverse : C.textMuted} />
              <Text style={{ fontFamily: Font.semiBold, fontSize: 11, color: sortBy === opt.key ? C.textInverse : C.textSecondary }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16, paddingTop: 8 }}>
            {[0,1,2,3,4,5].map(i => (
              <View key={i} style={{ width: PRODUCT_CARD_W, backgroundColor: C.surface, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.border }}>
                <View style={{ width: "100%", height: 130, backgroundColor: C.surfaceSecondary }} />
                <View style={{ padding: 10, gap: 6 }}>
                  <View style={{ height: 12, width: "70%", backgroundColor: C.surfaceSecondary, borderRadius: 6 }} />
                  <View style={{ height: 10, width: "45%", backgroundColor: C.surfaceSecondary, borderRadius: 5 }} />
                  <View style={{ height: 28, width: "55%", backgroundColor: C.surfaceSecondary, borderRadius: 8, marginTop: 4 }} />
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
        ) : (
          <>
            {!search && !selectedCat && flashDeals.length > 0 && (
              <>
                <View style={styles.secRow}>
                  <View style={styles.flashLabel}>
                    <View style={styles.flashIconWrap}>
                      <Ionicons name="flash" size={14} color={C.gold} />
                    </View>
                    <Text style={styles.secTitle}>{T("flashDeals")}</Text>
                  </View>
                  <View style={styles.timerBadge}>
                    <Ionicons name="time-outline" size={11} color={C.red} />
                    <Text style={styles.timerTxt}>{T("todayOnly")}</Text>
                  </View>
                </View>

                <View style={styles.flashGrid}>
                  {flashDeals.map(p => (
                    <FlashCard key={p.id} product={p} />
                  ))}
                </View>
              </>
            )}

            {!search && !selectedCat && <MartRecentlyViewed />}

            <View style={styles.secRow}>
              <Text style={styles.secTitle}>
                {search ? `${T("resultsFor")} "${search}"` : selectedCat ? T("categoryItemsLabel") : T("allProductsLabel")}
              </Text>
              <View style={styles.itemCountBadge}>
                <Text style={styles.itemCountTxt}>{products.length}</Text>
              </View>
            </View>

            {products.length === 0 ? (
              <View style={styles.center}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="storefront-outline" size={48} color={C.border} />
                </View>
                <Text style={styles.emptyTitle}>{T("noProductsFound")}</Text>
                <Text style={styles.emptyTxt}>{T("tryDifferentSearch")}</Text>
              </View>
            ) : (
              <View style={styles.productsGrid}>
                {allProducts.map(p => <ProductCard key={p.id} product={toMartProduct(p as unknown as Parameters<typeof toMartProduct>[0])} />)}
              </View>
            )}
          </>
        )}

        <View style={{ height: Math.max(insets.bottom, Platform.OS === "web" ? 34 : 20) }} />
      </ScrollView>
    </View>
  );
}

function makeRecentlyViewedStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  recentItem: { width: 90, gap: 6 },
  recentImgWrap: { width: 90, height: 90, borderRadius: 18, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: C.borderLight },
  recentImg: { width: "100%", height: "100%" },
  recentName: { ...Typ.tiny, fontFamily: Font.semiBold, color: C.text, textAlign: "center" },
  recentPrice: { ...Typ.tiny, color: C.primary, textAlign: "center", fontFamily: Font.bold },
  });
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: 16, paddingBottom: 10 },
  hdrRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight15, alignItems: "center", justifyContent: "center" },
  hdrTitle: { ...Typ.title, color: C.textInverse },
  hdrSub: { ...Typ.caption, color: C.overlayLight75, marginTop: 2 },
  cartBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.overlayLight15, alignItems: "center", justifyContent: "center" },
  cartBadge: { position: "absolute", top: -4, right: -4, backgroundColor: C.gold, borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: C.brandBlue },
  cartBadgeTxt: { ...Typ.tiny, color: C.textInverse },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(15,23,42,0.08)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 } }) },
  searchInput: { flex: 1, ...Typ.body, color: C.text, padding: 0 },

  catRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, backgroundColor: C.blueSoft, borderWidth: 1.5, borderColor: C.brandBlueSoft },
  catChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  catChipTxt: { ...Typ.buttonSmall, color: C.primary },
  catChipTxtActive: { color: C.textInverse },

  secRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 20, marginBottom: 12 },
  flashLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  flashIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.amberSoft, alignItems: "center", justifyContent: "center" },
  secTitle: { ...Typ.price, color: C.text },
  itemCountBadge: { backgroundColor: C.primary, borderRadius: 10, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  itemCountTxt: { ...Typ.smallBold, color: C.textInverse },
  timerBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.redSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  timerTxt: { ...Typ.smallBold, color: C.red },

  flashGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  flashCard: { backgroundColor: C.surface, borderRadius: 18, overflow: "hidden", borderWidth: 1.5, borderColor: C.orangeBorder, ...Platform.select({ web: { boxShadow: "0 3px 8px rgba(245,158,11,0.12)" }, default: { shadowColor: C.gold, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 } }) },
  flashImg: { height: 100, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  flashBadge: { position: "absolute", top: 8, left: 8, backgroundColor: C.red, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, alignItems: "center" },
  flashBadgeTxt: { ...Typ.smallBold, color: C.textInverse },
  flashBadgeSub: { ...Typ.tiny, fontSize: 8, color: C.textInverse, marginTop: -1 },
  flashBody: { padding: 12 },
  flashName: { ...Typ.buttonSmall, color: C.text, marginBottom: 2, minHeight: 36 },
  flashUnit: { ...Typ.small, color: C.textMuted, marginBottom: 4 },
  flashStockTxt: { ...Typ.tiny, color: C.red, fontFamily: Font.bold, marginBottom: 6 },
  flashFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  flashOrigPrice: { ...Typ.small, color: C.textMuted, textDecorationLine: "line-through" },
  flashPrice: { ...Typ.h3, fontSize: 16, color: C.red },

  productsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  productCard: { backgroundColor: C.surface, borderRadius: 18, overflow: "hidden", ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(15,23,42,0.06)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 } }) },
  productImg: { height: 110, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  discountBadge: { position: "absolute", top: 8, left: 8, backgroundColor: C.danger, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  discountTxt: { ...Typ.tiny, color: C.textInverse },
  productBody: { padding: 12 },
  productName: { ...Typ.buttonSmall, color: C.text, marginBottom: 3, minHeight: 34 },
  productUnit: { ...Typ.small, color: C.textMuted, marginBottom: 4 },
  visitStoreLink: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  visitStoreTxt: { ...Typ.tiny, color: C.primary, fontFamily: Font.semiBold },
  productFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  productPrice: { ...Typ.h3, fontSize: 16, color: C.text },
  productOrigPrice: { ...Typ.small, color: C.textMuted, textDecorationLine: "line-through" },
  addBtn: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", ...Platform.select({ web: { boxShadow: "0 2px 4px rgba(0,102,255,0.3)" }, default: { shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 } }) },
  addBtnDone: { backgroundColor: C.success },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center" },
  stepperQty: { ...Typ.body, fontFamily: Font.bold, color: C.text, minWidth: 18, textAlign: "center" },
  ratingBadge: { position: "absolute", bottom: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.overlayDark60, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  ratingTxt: { ...Typ.tiny, color: C.textInverse },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  errorIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  errorTitle: { ...Typ.h3, color: C.text },
  errorSub: { ...Typ.body, fontSize: 13, color: C.textMuted },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  retryBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { ...Typ.h3, color: C.text },
  emptyTxt: { ...Typ.body, color: C.textSecondary },
  });
}

export default MartScreenInner;
