import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { API_BASE } from "@/utils/api";
import { createLogger } from "@/utils/logger";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

const log = createLogger("[PharmacyStore]");

interface PharmacyProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  unit?: string;
  image?: string;
  inStock: boolean;
  requires_prescription?: boolean;
  type?: string;
}

interface PharmacyVendor {
  id: string;
  name: string;
  logo?: string;
  address?: string;
  licenceNumber?: string;
  rating?: number;
  reviewCount?: number;
}

type Tab = "otc" | "rx";

function ProductCard({ product, qty, onAdd, onRemove, s, C }: {
  product: PharmacyProduct;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
  s: any;
  C: any;
}) {
  return (
    <View style={s.productCard}>
      {product.image ? (
        <Image source={{ uri: product.image }} style={s.productImg} resizeMode="cover" />
      ) : (
        <View style={[s.productImg, s.productImgPlaceholder]}>
          <Text style={{ fontSize: 28 }}>💊</Text>
        </View>
      )}
      <View style={{ flex: 1, paddingHorizontal: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 2 }}>
          <Text style={s.productName} numberOfLines={2}>{product.name}</Text>
          {product.requires_prescription && (
            <View style={s.rxBadge}><Text style={s.rxTxt}>Rx</Text></View>
          )}
          {!product.inStock && (
            <View style={s.oosBadge}><Text style={s.oosTxt}>Out of stock</Text></View>
          )}
        </View>
        {product.unit ? <Text style={s.productUnit}>{product.unit}</Text> : null}
        {product.description ? <Text style={s.productDesc} numberOfLines={2}>{product.description}</Text> : null}
        <Text style={s.productPrice}>Rs. {product.price}</Text>
      </View>
      {product.inStock && (
        <View style={s.qtyCtrl}>
          {qty > 0 ? (
            <>
              <TouchableOpacity activeOpacity={0.8} onPress={onRemove} style={s.qtyBtn} accessibilityLabel="Remove one">
                <Ionicons name="remove" size={16} color={C.purple} />
              </TouchableOpacity>
              <Text style={s.qtyTxt}>{qty}</Text>
              <TouchableOpacity activeOpacity={0.8} onPress={onAdd} style={s.qtyBtn} accessibilityLabel="Add one">
                <Ionicons name="add" size={16} color={C.purple} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity activeOpacity={0.8} onPress={onAdd} style={s.addBtn} accessibilityLabel="Add to cart">
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function PharmacyStoreScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { id: vendorId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { addItem, removeItem, items: cartItems } = useCart();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("otc");
  const [rxPhotoUri, setRxPhotoUri] = useState<string | null>(null);
  const [rxUploading, setRxUploading] = useState(false);

  const authHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  interface StoreResponse {
    vendor: PharmacyVendor;
    products: PharmacyProduct[];
  }

  const { data: storeData, isLoading: storeLoading } = useQuery({
    queryKey: ["pharmacy-store", vendorId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/vendors/${vendorId}/store`);
      if (!res.ok) throw new Error("Could not load pharmacy store");
      const json = await res.json() as { data?: StoreResponse };
      const d = json?.data ?? (json as unknown as StoreResponse);
      const allProducts: PharmacyProduct[] = Array.isArray(d.products) ? d.products : [];
      return { vendor: d.vendor, products: allProducts.filter(p => !p.type || p.type === "pharmacy") } as StoreResponse;
    },
    enabled: !!vendorId,
    staleTime: 3 * 60_000,
  });

  const vendorLoading = storeLoading;
  const productsLoading = storeLoading;
  const vendorData = storeData?.vendor;
  const productsData = storeData?.products ?? [];

  const otcProducts = useMemo(() => productsData.filter(p => !p.requires_prescription), [productsData]);
  const rxProducts = useMemo(() => productsData.filter(p => p.requires_prescription), [productsData]);
  const shownProducts = tab === "otc" ? otcProducts : rxProducts;

  const getQty = useCallback((productId: string) => {
    return cartItems.find(i => i.productId === productId)?.quantity ?? 0;
  }, [cartItems]);

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  const handleUploadRx = async () => {
    if (rxUploading) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showToast("Camera roll permission is required to upload a prescription", "error"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setRxUploading(true);
      const mime = asset.mimeType ?? "image/jpeg";
      const uploadRes = await fetch(`${API_BASE}/pharmacy/prescription`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ file: `data:${mime};base64,${asset.base64}`, mimeType: mime }),
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({} as { error?: string }));
        throw new Error((err as { error?: string }).error ?? "Upload failed");
      }
      const uploadData = await uploadRes.json() as { data?: { refId?: string }; refId?: string };
      const refId = uploadData?.data?.refId ?? (uploadData as { refId?: string })?.refId;
      if (!refId) throw new Error("No reference returned from upload");
      setRxPhotoUri(refId);
      showToast("Prescription uploaded — add Rx items to your cart", "success");
    } catch (e: unknown) {
      log.error("Rx upload failed:", e instanceof Error ? e.message : String(e));
      showToast(e instanceof Error ? e.message : "Prescription upload failed", "error");
    } finally {
      setRxUploading(false);
    }
  };

  const handleCheckout = () => {
    if (cartCount === 0) { showToast("Add at least one item first", "info"); return; }
    router.push({ pathname: "/pharmacy/checkout", params: { vendorId: vendorId ?? "", rxPhotoUri: rxPhotoUri ?? "" } });
  };

  const vendor = vendorData;
  const isLoading = vendorLoading || productsLoading;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={[C.purple, "#8B5CF6"]} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            {vendorLoading ? (
              <SkeletonBlock w={140} h={18} r={6} />
            ) : (
              <Text style={s.headerTitle} numberOfLines={1}>{vendor?.name ?? T("navPharmacy")}</Text>
            )}
          </View>
          {cartCount > 0 && (
            <TouchableOpacity activeOpacity={0.8} onPress={handleCheckout} style={s.cartBtn} accessibilityRole="button">
              <Ionicons name="cart-outline" size={22} color="#fff" />
              <View style={s.cartBadge}><Text style={s.cartBadgeTxt}>{cartCount}</Text></View>
            </TouchableOpacity>
          )}
        </View>

        {!vendorLoading && vendor && (
          <View style={s.vendorInfo}>
            {vendor.licenceNumber && (
              <View style={s.licencePill}>
                <Ionicons name="shield-checkmark-outline" size={12} color={C.purple} />
                <Text style={s.licenceTxt}>Licence: {vendor.licenceNumber}</Text>
              </View>
            )}
            {vendor.address && <Text style={s.vendorAddr} numberOfLines={1}>{vendor.address}</Text>}
            {vendor.rating != null && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="star" size={13} color="#FCD34D" />
                <Text style={s.vendorRating}>{vendor.rating.toFixed(1)}</Text>
                {vendor.reviewCount ? <Text style={s.vendorReviewCount}>({vendor.reviewCount})</Text> : null}
              </View>
            )}
          </View>
        )}

        <View style={s.tabs}>
          <TouchableOpacity activeOpacity={0.8} style={[s.tab, tab === "otc" && s.tabActive]} onPress={() => setTab("otc")}>
            <Text style={[s.tabTxt, tab === "otc" && s.tabTxtActive]}>OTC ({otcProducts.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} style={[s.tab, tab === "rx" && s.tabActive]} onPress={() => setTab("rx")}>
            <Text style={[s.tabTxt, tab === "rx" && s.tabTxtActive]}>Prescription Rx ({rxProducts.length})</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {tab === "rx" && (
        <View style={s.rxBanner}>
          <Ionicons name="document-attach-outline" size={18} color={C.purple} />
          <Text style={s.rxBannerTxt}>
            {rxPhotoUri ? "Prescription uploaded" : "Upload a valid prescription to add Rx items"}
          </Text>
          <TouchableOpacity activeOpacity={0.8} onPress={handleUploadRx} disabled={rxUploading} style={s.rxUploadBtn}>
            {rxUploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.rxUploadTxt}>{rxPhotoUri ? T("changePhoto") : "Upload"}</Text>}
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {[1, 2, 3, 4].map(i => <SkeletonBlock key={i} w="100%" h={90} r={12} style={{ marginBottom: 10 }} />)}
        </ScrollView>
      ) : shownProducts.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="medical-outline" size={48} color={C.border} />
          <Text style={s.emptyTxt}>{tab === "rx" ? "No prescription items available" : "No OTC items available"}</Text>
        </View>
      ) : (
        <FlatList
          data={shownProducts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              qty={getQty(item.id)}
              onAdd={() => {
                if (item.requires_prescription && !rxPhotoUri) {
                  showToast("Please upload a prescription before adding Rx items", "error");
                  return;
                }
                addItem({ productId: item.id, name: item.name, price: item.price, image: item.image ?? "", type: "pharmacy", quantity: 1 });
              }}
              onRemove={() => removeItem(item.id)}
              s={s}
              C={C}
            />
          )}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {cartCount > 0 && (
        <View style={[s.checkoutBar, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={s.checkoutBarTxt}>{cartCount} item{cartCount !== 1 ? "s" : ""} in cart</Text>
          <TouchableOpacity activeOpacity={0.8} onPress={handleCheckout} style={s.checkoutBarBtn}>
            <Text style={s.checkoutBarBtnTxt}>Checkout</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 16, paddingBottom: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  cartBtn: { position: "relative", padding: 4 },
  cartBadge: { position: "absolute", top: -2, right: -2, backgroundColor: "#EF4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  cartBadgeTxt: { fontSize: 10, fontWeight: "700", color: "#fff" },
  vendorInfo: { paddingBottom: 10, gap: 4 },
  licencePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  licenceTxt: { fontSize: 11, color: "#fff", fontWeight: "500" },
  vendorAddr: { fontSize: 12, color: "rgba(255,255,255,0.8)" },
  vendorRating: { fontSize: 12, color: "#FCD34D", fontWeight: "700" },
  vendorReviewCount: { fontSize: 11, color: "rgba(255,255,255,0.7)" },
  tabs: { flexDirection: "row", marginTop: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: "#fff" },
  tabTxt: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.7)" },
  tabTxtActive: { color: "#fff" },
  rxBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EDE9FE", paddingHorizontal: 14, paddingVertical: 10, margin: 12, borderRadius: 10 },
  rxBannerTxt: { flex: 1, fontSize: 12, color: C.purple, fontWeight: "500" },
  rxUploadBtn: { backgroundColor: C.purple, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  rxUploadTxt: { fontSize: 12, fontWeight: "700", color: "#fff" },
  productCard: { flexDirection: "row", backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  productImg: { width: 68, height: 68, borderRadius: 10 },
  productImgPlaceholder: { backgroundColor: "#F3E8FF", alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 14, fontWeight: "600", color: C.text, flex: 1 },
  productUnit: { fontSize: 11, color: C.textSecondary, marginTop: 1 },
  productDesc: { fontSize: 11, color: C.textSecondary, marginTop: 2 },
  productPrice: { fontSize: 14, fontWeight: "700", color: C.purple, marginTop: 4 },
  rxBadge: { backgroundColor: "#FEE2E2", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  rxTxt: { fontSize: 10, fontWeight: "700", color: "#EF4444" },
  oosBadge: { backgroundColor: "#F3F4F6", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  oosTxt: { fontSize: 10, color: C.textSecondary },
  qtyCtrl: { alignItems: "center", justifyContent: "center", gap: 4, minWidth: 70 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: C.purple, alignItems: "center", justifyContent: "center" },
  qtyTxt: { fontSize: 15, fontWeight: "700", color: C.text, minWidth: 24, textAlign: "center" },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.purple, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTxt: { fontSize: 14, color: C.textSecondary, textAlign: "center" },
  checkoutBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, elevation: 8 },
  checkoutBarTxt: { fontSize: 14, fontWeight: "600", color: C.text },
  checkoutBarBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.purple, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  checkoutBarBtnTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
  });
}
