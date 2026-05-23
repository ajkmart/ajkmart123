import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useMemo, useCallback } from "react";
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
import { useCart } from "@/context/CartContext";
import { useSmartBack } from "@/hooks/useSmartBack";
import { AuthGateSheet, useAuthGate, useRoleGate, RoleBlockSheet } from "@/components/AuthGateSheet";
import { CartSwitchModal } from "@/components/CartSwitchModal";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

interface MenuItem {
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
  description?: string;
  isVeg?: boolean;
  isSpicy?: boolean;
}

interface Restaurant {
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
  cuisineType?: string;
  deliveryFee?: number;
  avgRating?: number;
  reviewCount?: number;
}

function MenuItemCard({ item, styles, C }: { item: MenuItem, styles: any, C: any }) {
  const { addItem, cartType, itemCount, clearCartAndAdd, items, updateQuantity, removeItem } = useCart();
  const { requireAuth, sheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();
  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const cartItem = items.find(i => i.productId === item.id);
  const qtyInCart = cartItem?.quantity ?? 0;

  const doAdd = () => {
    addItem({ productId: item.id, name: item.name, price: item.price, quantity: 1, image: item.image, type: "food" });
  };

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
    }, { message: "Sign in to order food" });
  };

  const discount = item.originalPrice && item.originalPrice > item.price
    ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)
    : 0;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
      style={styles.itemCard}
    >
      <AuthGateSheet {...sheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <CartSwitchModal
        visible={showSwitchModal}
        targetService={T("food")}
        currentService={cartType === "mart" ? T("martTitle") : cartType === "pharmacy" ? T("navPharmacy") : "Another service"}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCartAndAdd({ productId: item.id, name: item.name, price: item.price, quantity: 1, image: item.image, type: "food" }); }}
      />

      <View style={styles.itemInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          {item.isVeg != null && (
            <View style={[styles.vegBadge, { borderColor: item.isVeg ? C.emerald : C.red }]}>
              <View style={[styles.vegDot, { backgroundColor: item.isVeg ? C.emerald : C.red }]} />
            </View>
          )}
          {item.isSpicy && (
            <Text style={{ fontSize: 12 }}>🌶️</Text>
          )}
        </View>
        <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemPrice}>Rs. {item.price.toLocaleString()}</Text>
          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>{discount}% off</Text>
            </View>
          )}
        </View>
      </View>

      <View style={{ alignItems: "center" }}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.itemImage} resizeMode="cover" />
        ) : (
          <View style={[styles.itemImage, { backgroundColor: C.amberSoft, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="restaurant-outline" size={28} color={C.amber} />
          </View>
        )}
        {!item.inStock ? (
          <View style={styles.outOfStockBadge}>
            <Text style={styles.outOfStockText}>Unavailable</Text>
          </View>
        ) : qtyInCart > 0 ? (
          <View style={styles.qtyRow}>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); if (qtyInCart === 1) removeItem(item.id); else updateQuantity(item.id, qtyInCart - 1); }}
              style={styles.qtyBtn}
              activeOpacity={0.7}
            >
              <Ionicons name={qtyInCart === 1 ? "trash-outline" : "remove"} size={14} color={C.red} />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{qtyInCart}</Text>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); handleAdd(e); }}
              style={[styles.qtyBtn, { backgroundColor: C.primarySoft }]}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={14} color={C.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleAdd}
            style={[styles.addBtn, !item.inStock && { opacity: 0.4 }]}
            disabled={!item.inStock}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={18} color={C.textInverse} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function FoodRestaurantScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(T("allTypes"));

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/vendors/${id}/store`, {
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      return unwrapApiResponse(json) as { vendor: Restaurant; products: MenuItem[] };
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const restaurant = data?.vendor;
  const menuItems = data?.products ?? [];

  const categories = useMemo(() => {
    const cats = [T("allTypes"), ...Array.from(new Set(menuItems.map(i => i.category).filter(Boolean)))];
    return cats;
  }, [menuItems]);

  const filtered = useMemo(() => {
    let list = menuItems;
    if (activeCategory !== T("allTypes")) list = list.filter(i => i.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [menuItems, activeCategory, search]);

  const topPad = Math.max(insets.top, 12);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Restaurant</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <SkeletonBlock w="100%" h={180} r={16} />
          <SkeletonBlock w="60%" h={24} r={8} />
          <SkeletonBlock w="40%" h={16} r={8} />
          {[1, 2, 3, 4].map(i => <SkeletonBlock key={i} w="100%" h={88} r={12} />)}
        </ScrollView>
      </View>
    );
  }

  if (isError || !restaurant) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Restaurant</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
          <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
          <Text style={{ fontFamily: Font.semiBold, fontSize: 16, color: C.text }}>Restaurant not found</Text>
          <Text style={{ fontFamily: Font.regular, fontSize: 13, color: C.textMuted, textAlign: "center" }}>
            We could not load this restaurant. Please check your connection and try again.
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.addBtn, { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 }]} activeOpacity={0.7}>
            <Text style={{ fontFamily: Font.semiBold, color: C.textInverse }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isOpen = restaurant.storeIsOpen;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {restaurant.storeName ?? restaurant.name}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} colors={[C.primary]} />}
      >
        {restaurant.storeBanner ? (
          <Image source={{ uri: restaurant.storeBanner }} style={styles.banner} resizeMode="cover" />
        ) : (
          <View style={[styles.banner, { backgroundColor: C.amberSoft, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="restaurant" size={48} color={C.amber} />
          </View>
        )}

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.restaurantName}>{restaurant.storeName ?? restaurant.name}</Text>
              {restaurant.storeCategory && (
                <Text style={styles.cuisine}>{restaurant.storeCategory}</Text>
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
            {restaurant.storeDeliveryTime && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={C.textMuted} />
                <Text style={styles.metaText}>{restaurant.storeDeliveryTime}</Text>
              </View>
            )}
            {restaurant.storeMinOrder > 0 && (
              <View style={styles.metaItem}>
                <Ionicons name="bag-outline" size={14} color={C.textMuted} />
                <Text style={styles.metaText}>Min Rs. {restaurant.storeMinOrder}</Text>
              </View>
            )}
            {restaurant.city && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={C.textMuted} />
                <Text style={styles.metaText}>{restaurant.city}</Text>
              </View>
            )}
          </View>

          {restaurant.storeAnnouncement ? (
            <View style={styles.announcementBox}>
              <Ionicons name="megaphone-outline" size={14} color={C.amber} />
              <Text style={styles.announcementText}>{restaurant.storeAnnouncement}</Text>
            </View>
          ) : null}

          {restaurant.storeDescription ? (
            <Text style={styles.description}>{restaurant.storeDescription}</Text>
          ) : null}
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search menu..."
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
            <Ionicons name="restaurant-outline" size={40} color={C.textMuted} />
            <Text style={{ fontFamily: Font.regular, color: C.textMuted, fontSize: 14 }}>
              {search ? "No items match your search" : "No items in this category"}
            </Text>
          </View>
        ) : (
          <View style={styles.menuList}>
            {filtered.map(item => (
              <MenuItemCard key={item.id} item={item} styles={styles} C={C} />
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
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontFamily: Font.bold,
    fontSize: 16,
    color: C.text,
    textAlign: "center",
    marginHorizontal: 8,
  },
  banner: {
    width: "100%",
    height: 180,
  },
  infoSection: {
    padding: 16,
    backgroundColor: C.surface,
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  restaurantName: {
    fontFamily: Font.bold,
    fontSize: 20,
    color: C.text,
  },
  cuisine: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 2,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: Font.semiBold,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: Font.regular,
    fontSize: 12,
    color: C.textMuted,
  },
  announcementBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: C.amberSoft,
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  announcementText: {
    flex: 1,
    fontFamily: Font.regular,
    fontSize: 12,
    color: C.amberDark,
    lineHeight: 18,
  },
  description: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Font.regular,
    fontSize: 14,
    color: C.text,
  },
  catRow: {
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 8,
  },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surfaceSecondary,
    borderWidth: 1,
    borderColor: C.border,
  },
  catChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  catChipText: {
    fontFamily: Font.medium,
    fontSize: 13,
    color: C.textSecondary,
  },
  catChipTextActive: {
    color: C.textInverse,
  },
  menuList: {
    paddingHorizontal: 12,
    gap: 10,
    marginTop: 8,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  itemDesc: {
    fontFamily: Font.regular,
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
  },
  itemPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  itemPrice: {
    fontFamily: Font.bold,
    fontSize: 15,
    color: C.primary,
  },
  discountBadge: {
    backgroundColor: C.emeraldBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountText: {
    fontFamily: Font.semiBold,
    fontSize: 10,
    color: C.emeraldDeep,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: "hidden",
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    backgroundColor: C.surfaceSecondary,
    borderRadius: 10,
    padding: 3,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontFamily: Font.bold,
    fontSize: 13,
    color: C.text,
    minWidth: 18,
    textAlign: "center",
  },
  outOfStockBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: C.redBg,
  },
  outOfStockText: {
    fontFamily: Font.semiBold,
    fontSize: 10,
    color: C.redBright,
  },
  vegBadge: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  vegDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  });
}
