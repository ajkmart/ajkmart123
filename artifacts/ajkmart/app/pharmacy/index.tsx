import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { PermissionGuide } from "@/components/PermissionGuide";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { getProducts, createPharmacyOrder } from "@workspace/api-client-react";
import type { GetProductsType } from "@workspace/api-client-react";
import { API_BASE } from "@/utils/api";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { withServiceGuard } from "@/components/ServiceGuard";

const C = Colors.light;
const W = Dimensions.get("window").width;

interface PharmacyProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  vendorName?: string;
  unit?: string;
  description?: string;
  requires_prescription?: boolean;
}

interface Med {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  unit: string;
  emoji: string;
  requires_prescription?: boolean;
}

interface CartItem extends Med { qty: number }

function MedCard({ med, qty, onAdd, onRemove }: {
  med: Med; qty: number; onAdd: () => void; onRemove: () => void;
}) {
  return (
    <View style={s.medCard}>
      <View style={s.medEmoji}><Text style={{ fontSize: 26 }}>{med.emoji || "💊"}</Text></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={s.medName} numberOfLines={1}>{med.name}</Text>
          {med.requires_prescription && (
            <View style={s.rxBadge}><Text style={s.rxTxt}>Rx</Text></View>
          )}
        </View>
        <Text style={s.medBrand}>{med.brand}</Text>
        <Text style={s.medUnit}>{med.unit}</Text>
        <Text style={s.medPrice}>Rs. {med.price}</Text>
      </View>
      <View style={s.qtyCtrl}>
        {qty > 0 ? (
          <>
            <Pressable onPress={onRemove} style={s.qtyBtn}>
              <Ionicons name="remove" size={16} color={C.purple} />
            </Pressable>
            <Text style={s.qtyTxt}>{qty}</Text>
            <Pressable onPress={onAdd} style={s.qtyBtn}>
              <Ionicons name="add" size={16} color={C.purple} />
            </Pressable>
          </>
        ) : (
          <Pressable onPress={onAdd} style={s.addBtn}>
            <Ionicons name="add" size={16} color={C.textInverse} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PharmacyScreenInner() {
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 12);
  const { category: routeCategory } = useLocalSearchParams<{ category?: string }>();
  const { user, updateUser, token } = useAuth();
  const { items: globalCartItems, addItem: addToGlobalCart, removeItem: removeFromGlobalCart, updateQuantity, clearCart, setPharmacyPendingOrderId } = useCart();
  const { showToast } = useToast();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const inMaintenance = config.appStatus === "maintenance";
  const pharmacyEnabled = config.features.pharmacy;

  const [medicines, setMedicines] = useState<Med[]>([]);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [loadingMeds, setLoadingMeds] = useState(true);
  const [medsError, setMedsError] = useState(false);
  const [activeTab, setActiveTab] = useState(routeCategory || "All");
  const [search, setSearch] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState("");

  const pharmacyCartItems = globalCartItems.filter(i => i.type === "pharmacy");

  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [prescription, setPrescription] = useState("");
  const [prescriptionPhotoUri, setPrescriptionPhotoUri] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"wallet" | "cash">("cash");

  const [showPhotoSourceModal, setShowPhotoSourceModal] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [permGuideType, setPermGuideType] = useState<"camera" | "gallery" | "location" | "notification" | "microphone">("camera");
  const [permGuideVisible, setPermGuideVisible] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/addresses`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.addresses) setSavedAddresses(data.addresses); })
      .catch((err) => console.warn("[Pharmacy] Saved addresses fetch failed:", err instanceof Error ? err.message : String(err)));
  }, [token]);

  const pickPrescriptionPhoto = () => {
    setShowPhotoSourceModal(true);
  };

  const pickFromGallery = async () => {
    setShowPhotoSourceModal(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPermGuideType("gallery"); setPermGuideVisible(true);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setPrescriptionPhotoUri(result.assets[0].uri);
    } catch {
      showToast("Could not pick image", "error");
    }
  };

  const takePhoto = async () => {
    setShowPhotoSourceModal(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setPermGuideType("camera"); setPermGuideVisible(true);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setPrescriptionPhotoUri(result.assets[0].uri);
    } catch {
      showToast("Could not open camera", "error");
    }
  };

  const loadMeds = () => {
    if (!pharmacyEnabled) return;
    setLoadingMeds(true);
    setMedsError(false);
    getProducts({ type: "pharmacy" as GetProductsType })
      .then(data => {
        if (data?.products?.length) {
          const meds: Med[] = (data.products as unknown as PharmacyProduct[]).map(p => ({
            id: p.id,
            name: p.name,
            brand: p.vendorName ?? "Various",
            category: p.category,
            price: p.price,
            unit: p.unit ?? p.description ?? "1 unit",
            emoji: "💊",
            requires_prescription: !!p.requires_prescription,
          }));
          setMedicines(meds);
          setCategories(["All", ...new Set(meds.map(m => m.category))]);
        }
      })
      .catch(() => setMedsError(true))
      .finally(() => setLoadingMeds(false));
  };

  useEffect(() => { loadMeds(); }, [pharmacyEnabled]);

  const filtered = medicines.filter(m => {
    const matchCat = activeTab === "All" || m.category === activeTab;
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const cartItems: CartItem[] = medicines
    .filter(m => pharmacyCartItems.some(ci => ci.productId === m.id))
    .map(m => {
      const ci = pharmacyCartItems.find(ci => ci.productId === m.id)!;
      return { ...m, qty: ci.quantity };
    });

  const cartTotal = cartItems.reduce((sum, m) => sum + m.price * m.qty, 0);
  const cartCount = pharmacyCartItems.reduce((sum, i) => sum + i.quantity, 0);

  useEffect(() => {
    if (payMethod === "cash" && cartTotal > config.orderRules.maxCodAmount) {
      const walletBalance = user?.walletBalance ?? 0;
      if (config.features.wallet && walletBalance >= cartTotal) {
        setPayMethod("wallet");
      } else {
        showToast(
          `Order total exceeds COD limit (Rs. ${config.orderRules.maxCodAmount.toLocaleString()}) and wallet balance is insufficient. Please reduce your order.`,
          "error"
        );
      }
    }
  }, [cartTotal, config.orderRules.maxCodAmount, payMethod]);

  const addToCart = (med: Med) => {
    addToGlobalCart({ productId: med.id, name: med.name, price: med.price, quantity: 1, type: "pharmacy" });
  };

  const removeFromCart = (med: Med) => {
    const existing = pharmacyCartItems.find(ci => ci.productId === med.id);
    if (!existing) return;
    if (existing.quantity <= 1) {
      removeFromGlobalCart(med.id);
    } else {
      updateQuantity(med.id, existing.quantity - 1);
    }
  };

  const uploadPrescription = async (photoUri: string, refId: string): Promise<void> => {
    const compressed = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    const base64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: "base64" as const });
    const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/uploads/prescription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ file: `data:image/jpeg;base64,${base64}`, mimeType: "image/jpeg", refId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (__DEV__) console.warn("[prescription upload] failed:", res.status, err);
      throw new Error(`Upload failed: ${res.status}`);
    }
  };

  const placeOrder = async () => {
    if (!address.trim() || !phone.trim()) {
      showToast(T("deliveryAddress"), "error");
      return;
    }
    if (cartItems.length === 0) {
      showToast(T("addToCart"), "error");
      return;
    }
    const needsRx = cartItems.some(m => (m as any).requires_prescription);
    if (needsRx && !prescription.trim() && !prescriptionPhotoUri) {
      showToast("One or more items require a prescription. Please add a prescription note or attach a photo.", "error");
      return;
    }
    if (payMethod === "cash" && cartTotal > config.orderRules.maxCodAmount) {
      showToast(
        `Order total exceeds COD limit (Rs. ${config.orderRules.maxCodAmount.toLocaleString()}). Please use wallet or reduce your order.`,
        "error"
      );
      return;
    }
    setLoading(true);
    try {
      const prescriptionRefId = prescriptionPhotoUri
        ? `rx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        : undefined;

      if (prescriptionPhotoUri && prescriptionRefId) {
        setIsUploading(true);
        const MAX_UPLOAD_RETRIES = 3;
        let uploadSuccess = false;
        for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
          try {
            await uploadPrescription(prescriptionPhotoUri, prescriptionRefId);
            uploadSuccess = true;
            break;
          } catch {
            if (attempt < MAX_UPLOAD_RETRIES) {
              await new Promise<void>(r => setTimeout(r, 1000 * attempt));
            }
          }
        }
        setIsUploading(false);
        if (!uploadSuccess) {
          setUploadFailed(true);
          showToast("Could not upload prescription photo. Tap 'Retry Upload' to try again.", "error");
          setLoading(false);
          return;
        }
        setUploadFailed(false);
      }

      const data = await createPharmacyOrder({
        items: cartItems.map(m => ({ id: m.id, name: m.name, price: m.price, quantity: m.qty, requires_prescription: (m as any).requires_prescription ?? false })),
        prescriptionNote: prescription || null,
        deliveryAddress: address,
        contactPhone: phone,
        paymentMethod: payMethod as "cash" | "wallet",
        ...(prescriptionRefId ? { prescriptionPhotoUri: prescriptionRefId } : {}),
      } as Parameters<typeof createPharmacyOrder>[0] & { prescriptionPhotoUri?: string });
      if (payMethod === "wallet" && user) {
        updateUser({ walletBalance: (user.walletBalance ?? 0) - cartTotal });
      }
      setConfirmedOrderId(data.id);
      setConfirmed(true);
      if (data.id) {
        setPharmacyPendingOrderId(data.id);
      } else {
        clearCart();
      }
    } catch {
      showToast(T("networkError"), "error");
    } finally {
      setLoading(false);
    }
  };

  if (!pharmacyEnabled) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <Pressable onPress={() => router.back()} style={{ position: "absolute", top: topPad + 12, left: 16 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </Pressable>
        <View style={[s.successCard, { borderColor: C.redSoft }]}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>🚫</Text>
          <Text style={[s.successTitle, { color: C.redBright }]}>{T("serviceUnavailable")}</Text>
          <Text style={[s.successSub, { marginBottom: 20 }]}>{T("maintenanceApology")}</Text>
          <Pressable style={[s.successBtn, { backgroundColor: C.redBg }]} onPress={() => router.back()}>
            <Text style={[s.successBtnTxt, { color: C.redBright }]}>{T("backToHome")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (inMaintenance) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <View style={[s.successCard, { borderColor: C.amberSoft }]}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>🔧</Text>
          <Text style={[s.successTitle, { color: C.amber }]}>{T("underMaintenance")}</Text>
          <Text style={[s.successSub, { marginBottom: 20 }]}>{config.content.maintenanceMsg}</Text>
          <Text style={{ ...Typ.caption, color: C.textMuted, textAlign: "center" }}>
            {T("maintenanceApology")}
          </Text>
        </View>
      </View>
    );
  }

  if (confirmed) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }]}>
        <View style={s.successCard}>
          <View style={s.successIconWrap}>
            <LinearGradient colors={[C.purple, C.purpleMid]} style={s.successIconCircle}>
              <Ionicons name="checkmark" size={36} color={C.textInverse} />
            </LinearGradient>
          </View>
          <Text style={s.successTitle}>{T("orderPlaced")}</Text>
          <Text style={s.successSub}>
            Order #{confirmedOrderId.slice(-6).toUpperCase()}{"\n"}
            {T("eta")}: 25-40 min
          </Text>
          <View style={s.successMeta}>
            <Ionicons name="location-outline" size={14} color={C.textMuted} />
            <Text style={s.successMetaTxt} numberOfLines={2}>{address}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, width: "100%", marginTop: 8 }}>
            <Pressable style={[s.successBtn, { flex: 1, backgroundColor: C.purpleBg }]} onPress={() => { setConfirmed(false); router.push("/(tabs)"); }}>
              <Text style={[s.successBtnTxt, { color: C.purple }]}>{T("backToHome")}</Text>
            </Pressable>
            <Pressable style={[s.successBtn, { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }]} onPress={() => { setConfirmed(false); router.push({ pathname: "/order", params: { orderId: confirmedOrderId, type: "pharmacy" } }); }}>
              <Ionicons name="navigate-outline" size={15} color={C.textInverse} />
              <Text style={s.successBtnTxt}>Track Order</Text>
            </Pressable>
          </View>
          <Pressable style={[s.successBtn, { backgroundColor: C.purpleBg, marginTop: 8, width: "100%" }]} onPress={() => { setConfirmed(false); }}>
            <Text style={[s.successBtnTxt, { color: C.purple }]}>{T("orderMore")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[C.purpleVivid, C.purple, C.purpleMid]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: topPad + 14 }]}>
        <View style={s.hdrRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={C.textInverse} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.hdrTitle}>💊 {T("pharmacy")}</Text>
            <Text style={s.hdrSub}>{T("medicinesDeliveredTo")}</Text>
          </View>
          {cartCount > 0 && (
            <Pressable onPress={() => setShowCheckout(true)} style={s.cartPill}>
              <Ionicons name="cart" size={16} color={C.textInverse} />
              <Text style={s.cartPillTxt}>{cartCount} {T("itemsLabel")}</Text>
            </Pressable>
          )}
        </View>
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={16} color={C.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={T("searchMedicines")}
            placeholderTextColor={C.textMuted}
            style={s.searchInput}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.tabsRow}>
        {categories.map(cat => (
          <Pressable key={cat} onPress={() => setActiveTab(cat)} style={[s.tab, activeTab === cat && s.tabActive]}>
            <Text style={[s.tabTxt, activeTab === cat && s.tabTxtActive]}>{cat}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={s.rxNotice}>
        <Ionicons name="information-circle-outline" size={14} color={C.purple} />
        <Text style={s.rxNoticeTxt}><Text style={{ fontFamily: Font.semiBold }}>Rx</Text> {T("rxNotice")}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.grid}>
        {loadingMeds ? (
          <>
            {[0,1,2,3,4,5,6].map(i => (
              <View key={i} style={[s.medCard, { opacity: 1 - i * 0.08 }]}>
                <View style={[s.medEmoji, { backgroundColor: C.purpleSoft }]} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 13, width: "65%", backgroundColor: C.purpleSoft, borderRadius: 6 }} />
                  <View style={{ height: 10, width: "45%", backgroundColor: C.purpleBg, borderRadius: 5 }} />
                  <View style={{ height: 10, width: "30%", backgroundColor: C.purpleBg, borderRadius: 5 }} />
                  <View style={{ height: 12, width: "40%", backgroundColor: C.purpleSoft, borderRadius: 6 }} />
                </View>
                <View style={{ width: 80, height: 32, backgroundColor: C.purpleSoft, borderRadius: 10 }} />
              </View>
            ))}
          </>
        ) : medsError ? (
          <View style={s.centerState}>
            <View style={s.errorIconWrap}>
              <Ionicons name="cloud-offline-outline" size={48} color={C.grayMid} />
            </View>
            <Text style={s.errorTitle}>{T("cannotLoad")}</Text>
            <Text style={s.errorSub}>{T("checkInternet")}</Text>
            <Pressable onPress={loadMeds} style={s.retryBtn}>
              <Ionicons name="refresh-outline" size={16} color={C.textInverse} />
              <Text style={s.retryBtnTxt}>{T("retry")}</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.centerState}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
            <Text style={s.emptyTxt}>{T("noMedicineFound")}</Text>
          </View>
        ) : (
          filtered.map(med => (
            <MedCard
              key={med.id}
              med={med}
              qty={pharmacyCartItems.find(ci => ci.productId === med.id)?.quantity ?? 0}
              onAdd={() => addToCart(med)}
              onRemove={() => removeFromCart(med)}
            />
          ))
        )}
        <View style={{ height: cartCount > 0 ? Math.max(insets.bottom + 80, 100) : Math.max(insets.bottom, 24) }} />
      </ScrollView>

      {cartCount > 0 && (
        <View style={[s.cartBar, { paddingBottom: insets.bottom + 12 }]}>
          <View>
            <Text style={s.cartBarCount}>{cartCount} {T("medicines")}</Text>
            <Text style={s.cartBarTotal}>Rs. {cartTotal.toLocaleString()}</Text>
          </View>
          <Pressable style={s.checkoutBtn} onPress={() => setShowCheckout(true)}>
            <Text style={s.checkoutBtnTxt}>{T("placeOrder")}</Text>
            <Ionicons name="arrow-forward" size={16} color={C.textInverse} />
          </Pressable>
        </View>
      )}

      <Modal visible={showCheckout} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCheckout(false)}>
        <ScrollView style={s.modal} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{T("orderSummary")}</Text>
            <Pressable onPress={() => setShowCheckout(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={20} color={C.text} />
            </Pressable>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>{T("medicines")} ({cartCount})</Text>
            {cartItems.map(item => (
              <View key={item.id} style={s.orderItem}>
                <Text style={s.orderItemName}>{item.emoji || "💊"} {item.name}</Text>
                <Text style={s.orderItemQty}>×{item.qty}</Text>
                <Text style={s.orderItemPrice}>Rs. {(item.price * item.qty).toLocaleString()}</Text>
              </View>
            ))}
            <View style={s.divider} />
            <View style={[s.orderItem, { marginTop: 4 }]}>
              <Text style={[s.orderItemName, { fontFamily: Font.bold }]}>{T("deliveryFee")}</Text>
              <Text style={[s.orderItemPrice, { color: C.success }]}>{T("freeLabel")}</Text>
            </View>
            <View style={s.orderItem}>
              <Text style={[s.orderItemName, { ...Typ.button, fontFamily: Font.bold }]}>{T("totalLabel")}</Text>
              <Text style={[s.orderItemPrice, { ...Typ.button, fontFamily: Font.bold, color: C.purple }]}>Rs. {cartTotal.toLocaleString()}</Text>
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>{T("deliveryDetails")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={s.label}>{T("deliveryAddress")} *</Text>
              {savedAddresses.length > 0 && (
                <Pressable onPress={() => setShowAddressPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.purpleSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Ionicons name="bookmark-outline" size={12} color={C.purple} />
                  <Text style={{ ...Typ.smallMedium, fontFamily: Font.semiBold, color: C.purple }}>Saved</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder={T("enterFullName")}
              placeholderTextColor={C.textMuted}
              style={s.input}
              multiline
              numberOfLines={2}
            />
            <Text style={s.label}>{T("contactNumber")} *</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="03XX XXXXXXX"
              placeholderTextColor={C.textMuted}
              style={s.input}
              keyboardType="phone-pad"
            />
            <Text style={s.label}>{T("prescriptionNote")}</Text>
            <TextInput
              value={prescription}
              onChangeText={setPrescription}
              placeholder={T("rxNotice")}
              placeholderTextColor={C.textMuted}
              style={[s.input, { minHeight: 72 }]}
              multiline
              numberOfLines={3}
            />
            <Pressable onPress={pickPrescriptionPhoto} style={s.photoPickerBtn}>
              <Ionicons name="camera-outline" size={18} color={C.purple} />
              <Text style={s.photoPickerTxt}>
                {prescriptionPhotoUri ? "Change Prescription Photo" : "Attach Prescription Photo"}
              </Text>
            </Pressable>
            {prescriptionPhotoUri && (
              <View style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: C.purpleBorder }}>
                <Image source={{ uri: prescriptionPhotoUri }} style={{ width: "100%", height: 140 }} resizeMode="cover" />
                <Pressable
                  onPress={() => setPrescriptionPhotoUri(null)}
                  style={{ position: "absolute", top: 8, right: 8, backgroundColor: C.overlayDark50, borderRadius: 12, padding: 4 }}
                >
                  <Ionicons name="close" size={16} color={C.textInverse} />
                </Pressable>
                <Pressable
                  onPress={pickPrescriptionPhoto}
                  style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: C.overlayPurple85, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Ionicons name="refresh-outline" size={12} color={C.textInverse} />
                  <Text style={{ ...Typ.smallMedium, fontFamily: Font.semiBold, color: C.textInverse }}>Retry</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>{T("paymentMethods")}</Text>
            <View style={s.payRow}>
              {cartTotal <= config.orderRules.maxCodAmount ? (
                <Pressable onPress={() => setPayMethod("cash")} style={[s.payOpt, payMethod === "cash" && s.payOptActive]}>
                  <View style={[s.payOptIconWrap, { backgroundColor: payMethod === "cash" ? C.emeraldSoft : C.surfaceSecondary }]}>
                    <Ionicons name="cash-outline" size={20} color={payMethod === "cash" ? C.emerald : C.textMuted} />
                  </View>
                  <Text style={[s.payOptTxt, payMethod === "cash" && { color: C.emerald }]}>{T("cashOnDelivery")}</Text>
                </Pressable>
              ) : (
                <View style={[s.payOpt, { opacity: 0.4 }]}>
                  <View style={[s.payOptIconWrap, { backgroundColor: C.surfaceSecondary }]}>
                    <Ionicons name="cash-outline" size={20} color={C.textMuted} />
                  </View>
                  <Text style={s.payOptTxt}>{T("codLimit")}: Rs. {config.orderRules.maxCodAmount.toLocaleString()}</Text>
                </View>
              )}
              {config.features.wallet && (
                <Pressable onPress={() => setPayMethod("wallet")} style={[s.payOpt, payMethod === "wallet" && s.payOptActive]}>
                  <View style={[s.payOptIconWrap, { backgroundColor: payMethod === "wallet" ? C.blueSoft : C.surfaceSecondary }]}>
                    <Ionicons name="wallet-outline" size={20} color={payMethod === "wallet" ? C.primary : C.textMuted} />
                  </View>
                  <View>
                    <Text style={[s.payOptTxt, payMethod === "wallet" && { color: C.primary }]}>{T("wallet")}</Text>
                    <Text style={s.walletBal}>Rs. {(user?.walletBalance ?? 0).toLocaleString()} {T("availableBalance")}</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          {uploadFailed && (
            <View style={{ backgroundColor: C.redBg, borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.redBorder }}>
              <Ionicons name="cloud-offline-outline" size={18} color={C.red} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...Typ.buttonSmall, color: C.redDeepest }}>Prescription upload failed</Text>
                <Text style={{ ...Typ.caption, color: C.redDark, marginTop: 2 }}>Check your connection and tap below to retry</Text>
              </View>
            </View>
          )}

          <Pressable style={[s.placeBtn, loading && { opacity: 0.7 }]} onPress={placeOrder} disabled={loading}>
            {loading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={C.textInverse} />
                <Text style={[s.placeBtnTxt, { marginLeft: 8 }]}>
                  {isUploading ? "Uploading Prescription…" : "Placing Order…"}
                </Text>
              </View>
            ) : (
              <>
                <Text style={s.placeBtnTxt}>{uploadFailed ? "Retry Upload & Place Order" : `${T("placeOrder")} • Rs. ${cartTotal.toLocaleString()}`}</Text>
                <Ionicons name={uploadFailed ? "refresh-outline" : "checkmark-circle"} size={18} color={C.textInverse} />
              </>
            )}
          </Pressable>
        </ScrollView>
      </Modal>

      <Modal visible={showAddressPicker} transparent animationType="fade" onRequestClose={() => setShowAddressPicker(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlayDark40, justifyContent: "flex-end" }} onPress={() => setShowAddressPicker(false)}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
            <Text style={{ ...Typ.h3, fontSize: 16, color: C.text, marginBottom: 16 }}>Saved Addresses</Text>
            {savedAddresses.map((sa: any) => (
              <Pressable
                key={sa.id}
                onPress={() => { setAddress(sa.address); setShowAddressPicker(false); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.purpleBg, borderRadius: 12, marginBottom: 8 }}
              >
                <Ionicons name={(sa.icon || "location-outline") as any} size={20} color={C.purple} />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...Typ.buttonSmall, color: C.text }}>{sa.label}</Text>
                  <Text style={{ ...Typ.caption, color: C.textMuted }} numberOfLines={1}>{sa.address}</Text>
                </View>
                {sa.isDefault && <View style={{ backgroundColor: C.purple, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ ...Typ.smallMedium, fontSize: 10, color: C.textInverse }}>Default</Text></View>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showPhotoSourceModal} transparent animationType="fade" onRequestClose={() => setShowPhotoSourceModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlayDark40, justifyContent: "flex-end" }} onPress={() => setShowPhotoSourceModal(false)}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
            <Text style={{ ...Typ.h3, fontSize: 16, color: C.text, marginBottom: 16, textAlign: "center" }}>
              Attach Prescription
            </Text>
            <Pressable
              onPress={takePhoto}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.purpleBg, borderRadius: 14, marginBottom: 10 }}
            >
              <Ionicons name="camera-outline" size={22} color={C.purple} />
              <Text style={{ ...Typ.bodySemiBold, color: C.purple }}>Take Photo</Text>
            </Pressable>
            <Pressable
              onPress={pickFromGallery}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.purpleBg, borderRadius: 14, marginBottom: 10 }}
            >
              <Ionicons name="image-outline" size={22} color={C.purple} />
              <Text style={{ ...Typ.bodySemiBold, color: C.purple }}>Choose from Gallery</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowPhotoSourceModal(false)}
              style={{ paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ ...Typ.bodyMedium, color: C.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      <PermissionGuide
        visible={permGuideVisible}
        type={permGuideType}
        onClose={() => setPermGuideVisible(false)}
      />
    </View>
  );
}

export default withServiceGuard("pharmacy", PharmacyScreenInner);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: 16, paddingBottom: 16 },
  hdrRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight20, alignItems: "center", justifyContent: "center" },
  hdrTitle: { ...Typ.title, color: C.textInverse },
  hdrSub: { ...Typ.caption, color: C.overlayLight80, marginTop: 2 },
  cartPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.overlayLight25, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22 },
  cartPillTxt: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.textInverse },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  searchInput: { flex: 1, ...Typ.body, fontSize: 13, color: C.text, padding: 0 },

  tabsScroll: { maxHeight: 52, backgroundColor: C.surface },
  tabsRow: { paddingHorizontal: 12, gap: 8, alignItems: "center", paddingVertical: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 22, backgroundColor: C.purpleBg },
  tabActive: { backgroundColor: C.purple },
  tabTxt: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.purple },
  tabTxtActive: { color: C.textInverse },

  rxNotice: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.purpleBg, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.purpleSoft },
  rxNoticeTxt: { ...Typ.small, color: C.purple, flex: 1 },

  grid: { paddingHorizontal: 12, paddingTop: 12, gap: 10 },
  centerState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTxt: { ...Typ.bodyMedium, color: C.textMuted },
  errorIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  errorTitle: { ...Typ.h3, fontSize: 16, color: C.grayDark },
  errorSub: { ...Typ.body, fontSize: 13, color: C.gray },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.purple, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  retryBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },

  medCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: C.border, shadowColor: C.text, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  medEmoji: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.purpleBg, alignItems: "center", justifyContent: "center" },
  medName: { ...Typ.bodySemiBold, color: C.text, flex: 1 },
  medBrand: { ...Typ.small, color: C.textMuted, marginTop: 2 },
  medUnit: { ...Typ.small, fontSize: 10, color: C.textMuted },
  medPrice: { ...Typ.button, fontFamily: Font.bold, color: C.purple, marginTop: 4 },
  rxBadge: { backgroundColor: C.redSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  rxTxt: { ...Typ.tiny, fontSize: 9, color: C.redBright },

  qtyCtrl: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: C.purple, alignItems: "center", justifyContent: "center" },
  qtyTxt: { ...Typ.button, fontFamily: Font.bold, color: C.text, minWidth: 20, textAlign: "center" },
  addBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.purple, alignItems: "center", justifyContent: "center", shadowColor: C.purple, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },

  cartBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, shadowColor: C.text, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 5 },
  cartBarCount: { ...Typ.caption, color: C.textMuted },
  cartBarTotal: { ...Typ.title, color: C.text },
  checkoutBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.purple, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14, shadowColor: C.purple, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  checkoutBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },

  modal: { backgroundColor: C.surface, flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { ...Typ.h3, color: C.text },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" },

  section: { paddingHorizontal: 16, paddingTop: 18 },
  sectionTitle: { ...Typ.h3, fontSize: 16, color: C.text, marginBottom: 12 },

  orderItem: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  orderItemName: { flex: 1, ...Typ.body, fontSize: 13, color: C.text },
  orderItemQty: { ...Typ.captionMedium, color: C.textMuted, width: 28 },
  orderItemPrice: { ...Typ.buttonSmall, color: C.text },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },

  label: { ...Typ.bodyMedium, fontSize: 13, color: C.text, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, ...Typ.body, fontSize: 13, color: C.text, backgroundColor: C.surfaceSecondary },
  photoPickerBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.purpleBorder, backgroundColor: C.purpleBg },
  photoPickerTxt: { ...Typ.bodyMedium, fontSize: 13, color: C.purple },

  payRow: { gap: 10 },
  payOpt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.border },
  payOptActive: { borderColor: C.purple, backgroundColor: C.purpleBg },
  payOptIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  payOptTxt: { ...Typ.buttonSmall, color: C.textMuted },
  walletBal: { ...Typ.small, color: C.textMuted, marginTop: 2 },

  placeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 16, backgroundColor: C.purple, borderRadius: 16, paddingVertical: 16, shadowColor: C.purple, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  placeBtnTxt: { ...Typ.button, fontFamily: Font.bold, color: C.textInverse },

  successCard: { backgroundColor: C.surface, borderRadius: 24, padding: 28, alignItems: "center", width: "100%", borderWidth: 1, borderColor: C.border, shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 5 },
  successIconWrap: { marginBottom: 16 },
  successIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  successTitle: { ...Typ.h2, fontSize: 24, color: C.text, marginBottom: 8 },
  successSub: { ...Typ.body, color: C.textMuted, textAlign: "center", lineHeight: 20, marginBottom: 16 },
  successMeta: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 20, width: "100%" },
  successMetaTxt: { ...Typ.body, fontSize: 13, color: C.textMuted, flex: 1 },
  successBtn: { width: "100%", alignItems: "center", backgroundColor: C.purple, borderRadius: 16, paddingVertical: 15 },
  successBtnTxt: { ...Typ.button, fontFamily: Font.bold, color: C.textInverse },
});
