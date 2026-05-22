import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { getHierarchicalCategories, type HierarchicalCategory } from "@workspace/api-client-react";
import { useGetProducts } from "@workspace/api-client-react";

const C = Colors.light;
const { width } = Dimensions.get("window");
const SIDEBAR_W = 90;
const RIGHT_W = width - SIDEBAR_W;

export default function CategoriesBrowseScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { type: initialType } = useLocalSearchParams<{ type?: string }>();
  const serviceType = initialType || "mart";

  const { data: categories, isLoading } = useQuery({
    queryKey: ["hierarchical-categories", serviceType],
    queryFn: () => getHierarchicalCategories({ type: serviceType }),
    staleTime: 5 * 60 * 1000,
  });

  const cats = categories ?? [];
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (cats.length > 0 && !selectedId) {
      setSelectedId(cats[0]!.id);
    }
  }, [cats]);

  const selectedCat = cats.find(c => c.id === selectedId);
  const subCategories = selectedCat?.children ?? [];

  const { data: productsData, isLoading: productsLoading } = useGetProducts({
    type: serviceType as import("@workspace/api-client-react").GetProductsType,
    category: selectedId || undefined,
  });

  const products = productsData?.products ?? [];

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={s.headerTitle}>
          {serviceType === "food" ? "Food Categories" : serviceType === "pharmacy" ? "Pharmacy" : "Categories"}
        </Text>
        <Pressable onPress={() => router.push("/search")} style={s.searchBtn}>
          <Ionicons name="search-outline" size={20} color={C.text} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : cats.length === 0 ? (
        <View style={s.emptyWrap}>
          <Ionicons name="folder-open-outline" size={48} color={C.textMuted} />
          <Text style={s.emptyText}>No categories available</Text>
        </View>
      ) : (
        <View style={s.body}>
          <ScrollView
            style={s.sidebar}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          >
            {cats.map(cat => {
              const isActive = cat.id === selectedId;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setSelectedId(cat.id)}
                  style={[s.sidebarItem, isActive && s.sidebarItemActive]}
                >
                  {isActive && <View style={s.activeIndicator} />}
                  <View style={[s.sidebarIcon, isActive && s.sidebarIconActive]}>
                    <Ionicons
                      name={(cat.icon || "grid-outline") as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={isActive ? C.primary : C.textMuted}
                    />
                  </View>
                  <Text
                    style={[s.sidebarLabel, isActive && s.sidebarLabelActive]}
                    numberOfLines={2}
                  >
                    {cat.name}
                  </Text>
                  {cat.productCount > 0 && (
                    <Text style={[s.sidebarCount, isActive && s.sidebarCountActive]}>
                      {cat.productCount}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            style={s.rightPanel}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          >
            {selectedCat && (
              <View style={s.catHeader}>
                <Text style={s.catTitle}>{selectedCat.name}</Text>
                {selectedCat.productCount > 0 && (
                  <Text style={s.catCount}>{selectedCat.productCount} items</Text>
                )}
              </View>
            )}

            {subCategories.length > 0 && (
              <View style={s.subGrid}>
                {subCategories.map(sub => (
                  <Pressable
                    key={sub.id}
                    onPress={() => {
                      const route = serviceType === "food" ? "/food" : serviceType === "pharmacy" ? "/pharmacy" : "/mart";
                      router.push({ pathname: route as any, params: { category: sub.id } });
                    }}
                    style={s.subCard}
                  >
                    <View style={s.subIcon}>
                      <Ionicons
                        name={(sub.icon || "grid-outline") as keyof typeof Ionicons.glyphMap}
                        size={22}
                        color={C.primary}
                      />
                    </View>
                    <Text style={s.subName} numberOfLines={2}>{sub.name}</Text>
                    {sub.productCount > 0 && (
                      <Text style={s.subCount}>{sub.productCount}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {subCategories.length > 0 && (
              <View style={s.divider} />
            )}

            <View style={s.productsHeader}>
              <Text style={s.productsTitle}>
                {subCategories.length > 0 ? "All Products" : "Products"}
              </Text>
              <Text style={s.productsCount}>{products.length}</Text>
            </View>

            {productsLoading ? (
              <View style={s.productsLoadingWrap}>
                <ActivityIndicator color={C.primary} size="small" />
              </View>
            ) : products.length === 0 ? (
              <View style={s.productsEmptyWrap}>
                <Ionicons name="cube-outline" size={36} color={C.border} />
                <Text style={s.productsEmptyText}>No products in this category</Text>
              </View>
            ) : (
              <View style={s.productsList}>
                {products.map(product => (
                  <Pressable
                    key={product.id}
                    onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
                    style={s.productCard}
                  >
                    <View style={s.productImg}>
                      {product.image ? (
                        <Image source={{ uri: product.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <Ionicons name="cube-outline" size={24} color={C.textMuted} />
                      )}
                    </View>
                    <View style={s.productInfo}>
                      <Text style={s.productName} numberOfLines={2}>{product.name}</Text>
                      {product.unit && <Text style={s.productUnit}>{product.unit}</Text>}
                      <View style={s.productFooter}>
                        <Text style={s.productPrice}>Rs. {product.price}</Text>
                        {product.rating != null && (
                          <View style={s.ratingBadge}>
                            <Ionicons name="star" size={10} color="#F59E0B" />
                            <Text style={s.ratingText}>{product.rating}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, fontFamily: Font.bold, fontSize: 18, color: C.text,
  },
  searchBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontFamily: Font.medium, fontSize: 14, color: C.textMuted },

  body: { flex: 1, flexDirection: "row" },

  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: C.surfaceSecondary,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  sidebarItem: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    position: "relative",
  },
  sidebarItemActive: {
    backgroundColor: C.surface,
  },
  activeIndicator: {
    position: "absolute",
    left: 0, top: 8, bottom: 8,
    width: 3,
    backgroundColor: C.primary,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  sidebarIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.background,
    alignItems: "center", justifyContent: "center",
    marginBottom: 6,
  },
  sidebarIconActive: {
    backgroundColor: C.primarySoft || "#EEF2FF",
  },
  sidebarLabel: {
    fontFamily: Font.medium, fontSize: 10,
    color: C.textMuted, textAlign: "center",
    lineHeight: 13,
  },
  sidebarLabelActive: {
    fontFamily: Font.bold, color: C.primary,
  },
  sidebarCount: {
    fontFamily: Font.regular, fontSize: 9,
    color: C.textMuted, marginTop: 2,
  },
  sidebarCountActive: { color: C.primary },

  rightPanel: { flex: 1, backgroundColor: C.surface },

  catHeader: {
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  catTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  catCount: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },

  subGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 10, gap: 8,
    paddingBottom: 4,
  },
  subCard: {
    width: (RIGHT_W - 20 - 16) / 3,
    alignItems: "center", paddingVertical: 12, paddingHorizontal: 4,
    backgroundColor: C.background, borderRadius: 14,
    borderWidth: 1, borderColor: C.borderLight || C.border,
  },
  subIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: C.primarySoft || "#EEF2FF",
    alignItems: "center", justifyContent: "center",
    marginBottom: 6,
  },
  subName: {
    fontFamily: Font.medium, fontSize: 10,
    color: C.text, textAlign: "center", lineHeight: 13,
  },
  subCount: {
    fontFamily: Font.regular, fontSize: 9,
    color: C.textMuted, marginTop: 2,
  },

  divider: {
    height: 1, backgroundColor: C.border,
    marginHorizontal: 14, marginVertical: 10,
  },

  productsHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 8,
  },
  productsTitle: { fontFamily: Font.bold, fontSize: 14, color: C.text },
  productsCount: {
    fontFamily: Font.bold, fontSize: 11, color: C.textInverse,
    backgroundColor: C.primary,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, overflow: "hidden",
  },

  productsLoadingWrap: { paddingVertical: 40, alignItems: "center" },
  productsEmptyWrap: { paddingVertical: 40, alignItems: "center", gap: 8 },
  productsEmptyText: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted },

  productsList: { paddingHorizontal: 10, gap: 8, paddingBottom: 10 },
  productCard: {
    flexDirection: "row", backgroundColor: C.background,
    borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: C.borderLight || C.border,
  },
  productImg: {
    width: 80, height: 80,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  productInfo: { flex: 1, padding: 10, justifyContent: "center" },
  productName: { fontFamily: Font.semiBold, fontSize: 13, color: C.text, marginBottom: 2 },
  productUnit: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted, marginBottom: 4 },
  productFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  productPrice: { fontFamily: Font.bold, fontSize: 14, color: C.primary },
  ratingBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8,
  },
  ratingText: { fontFamily: Font.semiBold, fontSize: 10, color: "#D97706" },
});
