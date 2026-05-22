import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
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
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import { useCart } from "@/context/CartContext";
import { useSmartBack } from "@/hooks/useSmartBack";
import {
  AuthGateSheet,
  useAuthGate,
  useRoleGate,
  RoleBlockSheet,
} from "@/components/AuthGateSheet";
import { CartSwitchModal } from "@/components/CartSwitchModal";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image?: string;
  category: string;
  rating?: number | null;
  reviewCount?: number;
  inStock: boolean;
  unit?: string;
  type: string;
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
}

function ProductCard({ product }: { product: Product }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const {
    addItem,
    cartType,
    itemCount,
    clearCartAndAdd,
    items,
    updateQuantity,
    removeItem,
  } = useCart();
  const { requireAuth, sheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();
  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const cartItem = items.find((i) => i.productId === product.id);
  const qtyInCart = cartItem?.quantity ?? 0;

  const type =
    product.type === "food"
      ? "food"
      : product.type === "pharmacy"
        ? "pharmacy"
        : "mart";

  const doAdd = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: product.image,
      type,
    });
  };

  const handleAdd = (e?: any) => {
    e?.stopPropagation?.();
    requireAuth(
      () => {
        requireCustomerRole(() => {
          if (itemCount > 0 && cartType !== type && cartType !== "none") {
            setShowSwitchModal(true);
            return;
          }
          doAdd();
        });
      },
      { message: "Sign in to add items to your cart" },
    );
  };

  const origPrice = Number(product.originalPrice) || 0;
  const price = Number(product.price) || 0;
  const discount =
    origPrice > 0 && origPrice > price
      ? Math.round(((origPrice - price) / origPrice) * 100)
      : 0;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() =>
        router.push({ pathname: "/product/[id]", params: { id: product.id } })
      }
      style={styles.productCard}
    >
      <AuthGateSheet {...sheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <CartSwitchModal
        visible={showSwitchModal}
        targetService={
          type === "food" ? "Food" : type === "pharmacy" ? "Pharmacy" : "Mart"
        }
        currentService={
          cartType === "food"
            ? "Food"
            : cartType === "pharmacy"
              ? "Pharmacy"
              : "Mart"
        }
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => {
          setShowSwitchModal(false);
          clearCartAndAdd({
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            image: product.image,
            type,
          });
        }}
      />
      <View style={styles.productImgBox}>
        {product.image ? (
          <Image
            source={{ uri: product.image }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="cube-outline" size={32} color={C.textMuted} />
        )}
        {discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountTxt}>{discount}% OFF</Text>
          </View>
        )}
        {!product.inStock && (
          <View style={styles.outOfStock}>
            <Text style={styles.outOfStockTxt}>Out of Stock</Text>
          </View>
        )}
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {product.name}
        </Text>
        {product.unit && <Text style={styles.productUnit}>{product.unit}</Text>}
        <View style={styles.productFooter}>
          <View>
            <Text style={styles.productPrice}>
              Rs. {price.toLocaleString()}
            </Text>
            {origPrice > 0 && origPrice > price && (
              <Text style={styles.productOrigPrice}>
                Rs. {origPrice.toLocaleString()}
              </Text>
            )}
          </View>
          {qtyInCart > 0 ? (
            <View style={styles.stepperRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={(e) => {
                  e.stopPropagation();
                  if (qtyInCart <= 1) {
                    removeItem(product.id);
                  } else {
                    updateQuantity(product.id, qtyInCart - 1);
                  }
                }}
                style={styles.stepperBtn}
              >
                <Ionicons
                  name={qtyInCart <= 1 ? "trash-outline" : "remove"}
                  size={13}
                  color={C.danger}
                />
              </TouchableOpacity>
              <Text style={styles.stepperQty}>{qtyInCart}</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={(e) => {
                  e.stopPropagation();
                  updateQuantity(product.id, qtyInCart + 1);
                }}
                style={[styles.stepperBtn, { backgroundColor: C.primarySoft }]}
              >
                <Ionicons name="add" size={13} color={C.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleAdd}
              disabled={!product.inStock}
              style={[styles.addBtn, !product.inStock && { opacity: 0.4 }]}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default withErrorBoundary(VendorStoreScreenInner);

function VendorStoreScreenInner() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { width: W } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["vendor-store", id],
    queryFn: async () => {
      const resp = await fetch(`${API_BASE}/vendors/${id}/store`);
      const json = await resp.json();
      return unwrapApiResponse<{ vendor: Vendor; products: Product[] }>(json);
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const vendor = data?.vendor;
  const products: Product[] = data?.products || [];

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))),
    [products],
  );

  const filtered = useMemo(() => {
    let result = products;
    if (selectedCat) result = result.filter((p) => p.category === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [products, selectedCat, search]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={goBack}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Store</Text>
          <View style={{ width: 38 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <SkeletonBlock w="100%" h={180} r={16} />
          <SkeletonBlock w="60%" h={22} r={8} />
          <SkeletonBlock w="90%" h={14} r={6} />
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 16,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} w={(W - 48) / 2} h={200} r={12} />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (isError || !vendor) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={goBack}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Store</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="storefront-outline" size={48} color={C.textMuted} />
          <Text style={styles.emptyTitle}>Store not found</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => refetch()}
            style={styles.retryBtn}
          >
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {vendor.storeName || vendor.name}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={C.primary}
          />
        }
        ListHeaderComponent={
          <>
            {vendor.storeBanner ? (
              <Image
                source={{ uri: vendor.storeBanner }}
                style={styles.banner}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.banner,
                  {
                    backgroundColor: C.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <Ionicons
                  name="storefront-outline"
                  size={52}
                  color={C.primary}
                />
              </View>
            )}

            <View style={styles.vendorInfo}>
              <View style={styles.vendorTitleRow}>
                <Text style={styles.vendorName}>
                  {vendor.storeName || vendor.name}
                </Text>
                <View
                  style={[
                    styles.openBadge,
                    {
                      backgroundColor: vendor.storeIsOpen
                        ? C.successSoft
                        : C.dangerSoft,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.openDot,
                      {
                        backgroundColor: vendor.storeIsOpen
                          ? C.success
                          : C.danger,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.openTxt,
                      { color: vendor.storeIsOpen ? C.success : C.danger },
                    ]}
                  >
                    {vendor.storeIsOpen ? "Open" : "Closed"}
                  </Text>
                </View>
              </View>

              {vendor.storeCategory && (
                <View style={styles.catPill}>
                  <Ionicons name="grid-outline" size={13} color={C.textMuted} />
                  <Text style={styles.catPillTxt}>{vendor.storeCategory}</Text>
                </View>
              )}

              {vendor.storeDescription && (
                <Text style={styles.storeDesc}>{vendor.storeDescription}</Text>
              )}

              <View style={styles.metaRow}>
                {vendor.storeDeliveryTime && (
                  <View style={styles.metaChip}>
                    <Ionicons name="time-outline" size={13} color={C.emerald} />
                    <Text style={styles.metaChipTxt}>
                      {vendor.storeDeliveryTime}
                    </Text>
                  </View>
                )}
                {vendor.storeMinOrder > 0 && (
                  <View style={styles.metaChip}>
                    <Ionicons name="cart-outline" size={13} color={C.info} />
                    <Text style={styles.metaChipTxt}>
                      Min Rs. {vendor.storeMinOrder}
                    </Text>
                  </View>
                )}
                {vendor.city && (
                  <View style={styles.metaChip}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={C.textMuted}
                    />
                    <Text style={styles.metaChipTxt}>{vendor.city}</Text>
                  </View>
                )}
              </View>

              {vendor.storeAnnouncement ? (
                <View style={styles.announcement}>
                  <Ionicons
                    name="megaphone-outline"
                    size={14}
                    color={C.amber}
                  />
                  <Text style={styles.announcementTxt}>
                    {vendor.storeAnnouncement}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color={C.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search products..."
                placeholderTextColor={C.textMuted}
              />
              {search.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSearch("")}
                >
                  <Ionicons name="close-circle" size={18} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRow}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedCat(null)}
                  style={[styles.catChip, !selectedCat && styles.catChipActive]}
                >
                  <Text
                    style={[
                      styles.catChipTxt,
                      !selectedCat && styles.catChipTxtActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.7}
                    onPress={() =>
                      setSelectedCat((prev) => (prev === c ? null : c))
                    }
                    style={[
                      styles.catChip,
                      selectedCat === c && styles.catChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.catChipTxt,
                        selectedCat === c && styles.catChipTxtActive,
                      ]}
                    >
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {filtered.length === 0 && (
              <View style={styles.centerEmpty}>
                <Ionicons name="cube-outline" size={40} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No products found</Text>
                {(search || selectedCat) && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setSearch("");
                      setSelectedCat(null);
                    }}
                  >
                    <Text style={styles.clearFilters}>Clear filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        }
        renderItem={({ item }) => <ProductCard product={item} />}
      />
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  const W = 375;
  const CARD_W = (W - 32 - 10) / 2;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
      ...shadows.sm,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.surfaceSecondary,
    },
    headerTitle: {
      flex: 1,
      fontFamily: Font.bold,
      fontSize: 17,
      color: C.text,
    },
    banner: { width: "100%", height: 180 },
    vendorInfo: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    vendorTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    vendorName: { fontFamily: Font.bold, fontSize: 20, color: C.text, flex: 1 },
    openBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.full,
    },
    openDot: { width: 6, height: 6, borderRadius: 3 },
    openTxt: { fontFamily: Font.semiBold, fontSize: 11 },
    catPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginBottom: 8,
    },
    catPillTxt: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
    storeDesc: {
      fontFamily: Font.regular,
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 19,
      marginBottom: 10,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
    },
    metaChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: C.surfaceSecondary,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    metaChipTxt: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: C.textSecondary,
    },
    announcement: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: C.amberSoft,
      borderRadius: radii.lg,
      padding: 10,
      marginTop: 6,
    },
    announcementTxt: {
      flex: 1,
      fontFamily: Font.regular,
      fontSize: 12,
      color: C.amberDark,
      lineHeight: 18,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      backgroundColor: C.surface,
      borderRadius: radii.xl,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: C.border,
      ...shadows.sm,
    },
    searchInput: {
      flex: 1,
      fontFamily: Font.regular,
      fontSize: 14,
      color: C.text,
      paddingVertical: 0,
    },
    catRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
    catChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: radii.full,
      backgroundColor: C.surfaceSecondary,
      borderWidth: 1,
      borderColor: C.border,
    },
    catChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    catChipTxt: {
      fontFamily: Font.medium,
      fontSize: 12,
      color: C.textSecondary,
    },
    catChipTxtActive: { color: "#fff" },
    listContent: { paddingHorizontal: 16, paddingBottom: 32 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
    },
    retryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: C.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radii.md,
      marginTop: 12,
    },
    retryTxt: { fontFamily: Font.bold, fontSize: 14, color: "#fff" },
    emptyTitle: {
      fontFamily: Font.bold,
      fontSize: 16,
      color: C.textSecondary,
      marginTop: 12,
    },
    clearFilters: {
      fontFamily: Font.medium,
      fontSize: 14,
      color: C.primary,
      marginTop: 8,
    },
    productCard: {
      width: CARD_W,
      backgroundColor: C.surface,
      borderRadius: radii.xl,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: C.borderLight,
      marginBottom: 10,
      ...shadows.sm,
    },
    productImgBox: {
      width: CARD_W,
      height: CARD_W,
      backgroundColor: C.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    discountBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      backgroundColor: C.danger,
      borderRadius: radii.full,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    discountTxt: { fontFamily: Font.bold, fontSize: 10, color: "#fff" },
    outOfStock: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    outOfStockTxt: { fontFamily: Font.bold, fontSize: 13, color: "#fff" },
    productInfo: { padding: 10 },
    productName: {
      fontFamily: Font.semiBold,
      fontSize: 13,
      color: C.text,
      lineHeight: 18,
      marginBottom: 3,
    },
    productUnit: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: C.textMuted,
      marginBottom: 6,
    },
    productFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    productPrice: { fontFamily: Font.bold, fontSize: 14, color: C.primary },
    productOrigPrice: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: C.textMuted,
      textDecorationLine: "line-through",
    },
    addBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    stepperRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surfaceAlt,
      borderRadius: radii.md,
      padding: 2,
      borderWidth: 1,
      borderColor: C.border,
    },
    stepperBtn: {
      width: 24,
      height: 24,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    stepperQty: {
      fontFamily: Font.bold,
      fontSize: 13,
      color: C.text,
      paddingHorizontal: 8,
    },
    centerEmpty: {
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      gap: 12,
      minHeight: 200,
    },
  });
}
