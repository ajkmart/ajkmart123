import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useRef, useEffect } from "react";
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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { useCart } from "@/context/CartContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { withServiceGuard } from "@/components/ServiceGuard";
import { useGetProducts, useGetCategories } from "@workspace/api-client-react";
import { WishlistHeart } from "@/components/WishlistHeart";
import { CartSwitchModal } from "@/components/CartSwitchModal";

const C = Colors.light;
const { width } = Dimensions.get("window");
const FLASH_CARD_W = (width - 16 * 2 - 12) / 2;
const PRODUCT_CARD_W = (width - 16 * 2 - 12) / 2;

function QuantityStepper({ quantity, onIncrement, onDecrement }: { quantity: number; onIncrement: () => void; onDecrement: () => void }) {
  return (
    <View style={styles.stepperRow}>
      <Pressable onPress={(e) => { e?.stopPropagation?.(); onDecrement(); }} style={styles.stepperBtn}>
        <Ionicons name={quantity <= 1 ? "trash-outline" : "remove"} size={14} color={C.danger} />
      </Pressable>
      <Text style={styles.stepperQty}>{quantity}</Text>
      <Pressable onPress={(e) => { e?.stopPropagation?.(); onIncrement(); }} style={[styles.stepperBtn, { backgroundColor: C.primarySoft }]}>
        <Ionicons name="add" size={14} color={C.primary} />
      </Pressable>
    </View>
  );
}

function AddToCartButton({ onPress, added }: { onPress: () => void; added: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = (e: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={handlePress} style={[styles.addBtn, added && styles.addBtnDone]}>
        <Ionicons name={added ? "checkmark" : "add"} size={16} color={C.textInverse} />
      </Pressable>
    </Animated.View>
  );
}

function FlashCard({ product }: { product: any }) {
  const { addItem, cartType, itemCount, clearCart } = useCart();
  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origPrice = Number(product.originalPrice) || 0;
  const discount = origPrice > 0
    ? Math.round(((origPrice - product.price) / origPrice) * 100)
    : 0;

  useEffect(() => () => { if (addedTimerRef.current) clearTimeout(addedTimerRef.current); }, []);

  const doAdd = () => {
    addItem({ productId: product.id, name: product.name, price: product.price, quantity: 1, image: product.image, type: "mart" });
    setAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => { setAdded(false); addedTimerRef.current = null; }, 1500);
  };

  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const handleAdd = () => {
    if (itemCount > 0 && cartType !== "mart" && cartType !== "none") {
      setShowSwitchModal(true);
      return;
    }
    doAdd();
  };

  return (
    <Pressable onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })} style={[styles.flashCard, { width: FLASH_CARD_W }]}>
      <CartSwitchModal
        visible={showSwitchModal}
        targetService="Mart"
        currentService={cartType === "pharmacy" ? "Pharmacy" : cartType === "food" ? "Food" : "Another service"}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCart(); doAdd(); }}
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
        <Text style={styles.flashName} numberOfLines={2}>{product.name}</Text>
        {product.unit && <Text style={styles.flashUnit}>{product.unit}</Text>}
        <View style={styles.flashFooter}>
          <View>
            <Text style={styles.flashOrigPrice}>Rs. {product.originalPrice}</Text>
            <Text style={styles.flashPrice}>Rs. {product.price}</Text>
          </View>
          <AddToCartButton onPress={handleAdd} added={added} />
        </View>
      </View>
    </Pressable>
  );
}

function ProductCard({ product }: { product: any }) {
  const { addItem, cartType, itemCount, clearCart, items, updateQuantity, removeItem } = useCart();
  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origPrice = Number(product.originalPrice) || 0;
  const discount = origPrice > 0
    ? Math.round(((origPrice - product.price) / origPrice) * 100)
    : 0;

  const cartItem = items.find(i => i.productId === product.id);
  const qtyInCart = cartItem?.quantity ?? 0;

  useEffect(() => () => { if (addedTimerRef.current) clearTimeout(addedTimerRef.current); }, []);

  const doAdd = () => {
    addItem({ productId: product.id, name: product.name, price: product.price, quantity: 1, image: product.image, type: "mart" });
    setAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => { setAdded(false); addedTimerRef.current = null; }, 1500);
  };

  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const handleAdd = () => {
    if (itemCount > 0 && cartType !== "mart" && cartType !== "none") {
      setShowSwitchModal(true);
      return;
    }
    doAdd();
  };

  return (
    <Pressable onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })} style={[styles.productCard, { width: PRODUCT_CARD_W }]}>
      <CartSwitchModal
        visible={showSwitchModal}
        targetService="Mart"
        currentService={cartType === "pharmacy" ? "Pharmacy" : cartType === "food" ? "Food" : "Another service"}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCart(); doAdd(); }}
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
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        {product.unit && <Text style={styles.productUnit}>{product.unit}</Text>}
        <View style={styles.productFooter}>
          <View>
            <Text style={styles.productPrice}>Rs. {product.price}</Text>
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
    </Pressable>
  );
}

function MartScreenInner() {
  const insets = useSafeAreaInsets();
  const { itemCount, cartType, clearCart } = useCart();
  const showCartBanner = itemCount > 0 && cartType !== "mart" && cartType !== "none";
  const [clearBannerConfirm, setClearBannerConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const topPad = Math.max(insets.top, 12);
  const { focus, category: routeCategory } = useLocalSearchParams<{ focus?: string; category?: string }>();
  const [selectedCat, setSelectedCat] = useState<string | undefined>(routeCategory || undefined);
  const searchInputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (focus === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 300);
    }
  }, [focus]);

  const { config: platformConfig } = usePlatformConfig();
  const appName = platformConfig.platform.appName;

  const { data: catData } = useGetCategories({ type: "mart" });
  const { data, isLoading, isError, refetch, isRefetching } = useGetProducts({ type: "mart", search: search || undefined, category: selectedCat });

  const categories = catData?.categories || [];
  const products   = data?.products   || [];
  const flashDeals = products.filter(p => Number(p.originalPrice) > Number(p.price));
  const allProducts = products;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[C.brandBlueDark, C.brandBlue, C.brandBlueMid]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad + 12 }]}
      >
        <View style={styles.hdrRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={C.textInverse} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.hdrTitle}>{appName} Mart</Text>
            <Text style={styles.hdrSub}>Fresh groceries delivered fast</Text>
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

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={17} color={C.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search groceries..."
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
        <View style={{ backgroundColor: C.amberSoft, flexDirection: "row", alignItems: "center", padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: C.amberBorder }}>
          <Ionicons name="warning-outline" size={18} color={C.amber} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.amberDark }}>{cartType === "pharmacy" ? "Pharmacy cart active" : cartType === "food" ? "Food cart active" : "Another cart active"}</Text>
            <Text style={{ ...Typ.caption, color: C.amberDark }}>Adding Mart items will clear your existing cart</Text>
          </View>
          <Pressable
            onPress={() => setClearBannerConfirm(true)}
            style={{ backgroundColor: C.amber, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text style={{ ...Typ.captionBold, color: C.textInverse }}>Clear Cart</Text>
          </Pressable>
        </View>
      )}

      <CartSwitchModal
        visible={clearBannerConfirm}
        currentService={cartType === "food" ? "Food" : cartType === "pharmacy" ? "Pharmacy" : "Current"}
        targetService="Mart"
        onConfirm={() => { clearCart(); setClearBannerConfirm(false); }}
        onCancel={() => setClearBannerConfirm(false)}
      />

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={C.primary} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingTop: 14 }} contentContainerStyle={styles.catRow}>
          <Pressable
            onPress={() => setSelectedCat(undefined)}
            style={[styles.catChip, !selectedCat && styles.catChipActive]}
          >
            <Ionicons name="grid-outline" size={14} color={!selectedCat ? C.textInverse : C.primary} />
            <Text style={[styles.catChipTxt, !selectedCat && styles.catChipTxtActive]}>All</Text>
          </Pressable>
          {categories.map(cat => (
            <Pressable
              key={cat.id}
              onPress={() => setSelectedCat(selectedCat === cat.id ? undefined : cat.id)}
              style={[styles.catChip, selectedCat === cat.id && styles.catChipActive]}
            >
              <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={14} color={selectedCat === cat.id ? C.textInverse : C.primary} />
              <Text style={[styles.catChipTxt, selectedCat === cat.id && styles.catChipTxtActive]}>{cat.name}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: "/categories" as any, params: { type: "mart" } })}
            style={[styles.catChip, { borderStyle: "dashed" as any }]}
          >
            <Ionicons name="apps-outline" size={14} color={C.primary} />
            <Text style={styles.catChipTxt}>Browse All</Text>
          </Pressable>
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
            <Text style={styles.errorTitle}>Could not load</Text>
            <Text style={styles.errorSub}>Check your internet and retry</Text>
            <Pressable onPress={() => refetch()} style={styles.retryBtn}>
              <Ionicons name="refresh-outline" size={16} color={C.textInverse} />
              <Text style={styles.retryBtnTxt}>Retry</Text>
            </Pressable>
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
                    <Text style={styles.secTitle}>Flash Deals</Text>
                  </View>
                  <View style={styles.timerBadge}>
                    <Ionicons name="time-outline" size={11} color={C.red} />
                    <Text style={styles.timerTxt}>Today only</Text>
                  </View>
                </View>

                <View style={styles.flashGrid}>
                  {flashDeals.map(p => (
                    <FlashCard key={p.id} product={p} />
                  ))}
                </View>
              </>
            )}

            <View style={styles.secRow}>
              <Text style={styles.secTitle}>
                {search ? `Results for "${search}"` : selectedCat ? "Category Items" : "All Products"}
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
                <Text style={styles.emptyTitle}>No products found</Text>
                <Text style={styles.emptyTxt}>Try a different search or category</Text>
              </View>
            ) : (
              <View style={styles.productsGrid}>
                {allProducts.map(p => <ProductCard key={p.id} product={p} />)}
              </View>
            )}
          </>
        )}

        <View style={{ height: Math.max(insets.bottom, Platform.OS === "web" ? 34 : 20) }} />
      </ScrollView>
    </View>
  );
}

export default withServiceGuard("mart", MartScreenInner);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: 16, paddingBottom: 16 },
  hdrRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight15, alignItems: "center", justifyContent: "center" },
  hdrTitle: { ...Typ.title, color: C.textInverse },
  hdrSub: { ...Typ.caption, color: C.overlayLight75, marginTop: 2 },
  cartBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.overlayLight15, alignItems: "center", justifyContent: "center" },
  cartBadge: { position: "absolute", top: -4, right: -4, backgroundColor: C.gold, borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: C.brandBlue },
  cartBadgeTxt: { ...Typ.tiny, color: C.textInverse },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
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
  flashCard: { backgroundColor: C.surface, borderRadius: 18, overflow: "hidden", borderWidth: 1.5, borderColor: C.orangeBorder, shadowColor: C.gold, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  flashImg: { height: 100, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  flashBadge: { position: "absolute", top: 8, left: 8, backgroundColor: C.red, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, alignItems: "center" },
  flashBadgeTxt: { ...Typ.smallBold, color: C.textInverse },
  flashBadgeSub: { ...Typ.tiny, fontSize: 8, color: C.textInverse, marginTop: -1 },
  flashBody: { padding: 12 },
  flashName: { ...Typ.buttonSmall, color: C.text, marginBottom: 2, minHeight: 36 },
  flashUnit: { ...Typ.small, color: C.textMuted, marginBottom: 8 },
  flashFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  flashOrigPrice: { ...Typ.small, color: C.textMuted, textDecorationLine: "line-through" },
  flashPrice: { ...Typ.h3, fontSize: 16, color: C.red },

  productsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  productCard: { backgroundColor: C.surface, borderRadius: 18, overflow: "hidden", shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  productImg: { height: 110, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  discountBadge: { position: "absolute", top: 8, left: 8, backgroundColor: C.danger, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  discountTxt: { ...Typ.tiny, color: C.textInverse },
  productBody: { padding: 12 },
  productName: { ...Typ.buttonSmall, color: C.text, marginBottom: 3, minHeight: 34 },
  productUnit: { ...Typ.small, color: C.textMuted, marginBottom: 8 },
  productFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  productPrice: { ...Typ.h3, fontSize: 16, color: C.text },
  productOrigPrice: { ...Typ.small, color: C.textMuted, textDecorationLine: "line-through" },
  addBtn: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
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
