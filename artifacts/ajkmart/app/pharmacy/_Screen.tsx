import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { createLogger } from "@/utils/logger";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import { PermissionGuide } from "@/components/PermissionGuide";
import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  RefreshControl,
  TouchableOpacity,
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
import { useAuth, hasRole } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { getProducts, createPharmacyOrder } from "@workspace/api-client-react";
import type { GetProductsType } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { API_BASE, unwrapApiResponse } from "@/utils/api";
import { isValidPakistaniPhone, buildPhoneValidator } from "@/utils/phone";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { AuthGateSheet, useAuthGate, useRoleGate, RoleBlockSheet } from "@/components/AuthGateSheet";
const log = createLogger("[Pharmacy]");


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

interface PharmacyStore {
  id: string;
  name: string;
  storeName?: string;
  storeIsOpen?: boolean;
  storeBanner?: string;
  storeCategory?: string;
  storeDeliveryTime?: string;
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

const MedCard = React.memo(function MedCard({ med, qty, onAdd, onRemove }: {
  med: Med; qty: number; onAdd: () => void; onRemove: () => void;
}) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.medCard}>
      <View style={s.medEmoji}><Text style={{ fontSize: 26 }}>{med?.emoji ?? "💊"}</Text></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={s.medName} numberOfLines={1}>{med?.name ?? "—"}</Text>
          {med?.requires_prescription && (
            <View style={s.rxBadge}><Text style={s.rxTxt}>Rx</Text></View>
          )}
        </View>
        <Text style={s.medBrand}>{med?.brand ?? ""}</Text>
        <Text style={s.medUnit}>{med?.unit ?? ""}</Text>
        <Text style={s.medPrice}>Rs. {med?.price ?? 0}</Text>
      </View>
      <View style={s.qtyCtrl}>
        {qty > 0 ? (
          <>
            <TouchableOpacity activeOpacity={0.7} onPress={onRemove} style={s.qtyBtn}>
              <Ionicons name="remove" size={16} color={C.purple} />
            </TouchableOpacity>
            <Text style={s.qtyTxt}>{qty}</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onAdd} style={s.qtyBtn}>
              <Ionicons name="add" size={16} color={C.purple} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity activeOpacity={0.7} onPress={onAdd} style={s.addBtn}>
            <Ionicons name="add" size={16} color={C.textInverse} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

function PharmacyScreenInner() {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const topPad = Math.max(insets.top, 12);
  const { searchOpacity, searchTranslateY, searchMaxHeight, subtitleOpacity, subtitleMaxHeight, scrollHandler, scrollEventThrottle } = useCollapsibleHeader({ expandedHeight: 130, collapsedHeight: 56, scrollThreshold: 80, searchBarHeight: 46 });
  const { category: routeCategory, cartItems: cartItemsParam, checkout: openCheckout } = useLocalSearchParams<{ category?: string; cartItems?: string; checkout?: string }>();
  const { user, updateUser, token } = useAuth();
  const { items: globalCartItems, addItem: addToGlobalCart, removeItem: removeFromGlobalCart, updateQuantity, clearCart, setPharmacyPendingOrderId } = useCart();
  const { showToast } = useToast();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const validatePhone = buildPhoneValidator(config.regional?.phoneFormat);

  const inMaintenance = config.appStatus === "maintenance";
  const pharmacyEnabled = config.features.pharmacy;

  const [medicines, setMedicines] = useState<Med[]>([]);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [loadingMeds, setLoadingMeds] = useState(true);
  const [medsError, setMedsError] = useState(false);
  const [activeTab, setActiveTab] = useState(routeCategory || "All");
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("default");
  const [search, setSearch] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState("");

  const checkoutOpenedRef = React.useRef(false);
  useEffect(() => {
    if (openCheckout === "1" && !checkoutOpenedRef.current) {
      checkoutOpenedRef.current = true;
      setShowCheckout(true);
    }
  }, [openCheckout]);
  const restoredFromCartRef = React.useRef(false);
  useEffect(() => {
    if (restoredFromCartRef.current || !cartItemsParam) return;
    restoredFromCartRef.current = true;
    try {
      const parsed = JSON.parse(cartItemsParam);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any) => {
          if (item?.productId && item?.name && item?.price != null) {
            addToGlobalCart({
              productId: item.productId,
              name: item.name,
              price: item.price,
              quantity: item.quantity ?? 1,
              image: item.image,
              type: "pharmacy",
            });
          }
        });
      }
    } catch {
      log.warn("Could not parse cartItems param");
    }
  }, [cartItemsParam]);

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
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [showPrescriptionPreview, setShowPrescriptionPreview] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/addresses`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(j => { const data = unwrapApiResponse<{ addresses?: any[] }>(j); if (data?.addresses) setSavedAddresses(data.addresses); })
      .catch((err) => { log.warn("Saved addresses fetch failed:", err instanceof Error ? err.message : String(err)); });
  }, [token]);

  const pickPrescriptionPhoto = () => {
    setShowPhotoSourceModal(true);
  };

  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
  const MAX_PRESCRIPTION_SIZE = 2097152;

  const checkPhotoFormatAndSize = async (uri: string, mimeType?: string | null): Promise<"ok" | "bad_format" | "too_large"> => {
    const mime = mimeType ?? "";
    const ext = uri.split("?")[0]!.split(".").pop()?.toLowerCase() ?? "";
    if (mime && !ALLOWED_MIME_TYPES.includes(mime)) return "bad_format";
    if (!mime && ext && !ALLOWED_EXTENSIONS.includes(ext)) return "bad_format";
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && "size" in info && typeof (info as { size?: number }).size === "number") {
        if ((info as { size: number }).size > MAX_PRESCRIPTION_SIZE) return "too_large";
      }
    } catch {
      log.warn("Could not check file size — proceeding anyway");
    }
    return "ok";
  };

  const validateAndPreviewPhoto = async (uri: string, mimeType?: string | null): Promise<void> => {
    const result = await checkPhotoFormatAndSize(uri, mimeType);
    if (result === "bad_format") {
      showToast("Unsupported file format. Please attach a JPEG, PNG, or WebP image.", "error");
      return;
    }
    if (result === "too_large") {
      showToast("Image is too large (max 2 MB). Please choose a smaller file or retake the photo.", "error");
      return;
    }
    setPendingPhotoUri(uri);
    setShowPrescriptionPreview(true);
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
      const asset = result.assets[0];
      await validateAndPreviewPhoto(asset.uri, asset.mimeType);
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
      const asset = result.assets[0];
      await validateAndPreviewPhoto(asset.uri, asset.mimeType);
    } catch {
      showToast("Could not open camera", "error");
    }
  };

  const loadMeds = () => {
    if (!pharmacyEnabled) return;
    setLoadingMeds(true);
    setMedsError(false);
    getProducts({ type: "pharmacy" as GetProductsType })
      .then((data: { products?: unknown[] } | null) => {
        const products = data?.products ?? [];
        const meds: Med[] = (products as unknown as PharmacyProduct[]).map(p => ({
          id: p.id,
          name: p.name,
          brand: p.vendorName ?? "Various",
          category: p.category,
          price: parseFloat(String(p.price)),
          unit: p.unit ?? p.description ?? "1 unit",
          emoji: "💊",
          requires_prescription: !!p.requires_prescription,
        }));
        setMedicines(meds);
        setCategories(meds.length ? ["All", ...new Set(meds.map(m => m.category))] : ["All"]);
      })
      .catch(() => setMedsError(true))
      .finally(() => setLoadingMeds(false));
  };

  useEffect(() => { loadMeds(); }, [pharmacyEnabled]);

  const { data: pharmacyVendorData, isLoading: vendorsLoading } = useQuery({
    queryKey: ["pharmacy-stores-preview"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/vendors?category=pharmacy&slim=true`);
      const json = await r.json();
      return unwrapApiResponse<{ vendors?: PharmacyStore[]; users?: PharmacyStore[] }>(json);
    },
    staleTime: 5 * 60 * 1000,
  });
  const pharmacyStores = useMemo(() => {
    const raw = pharmacyVendorData?.vendors || pharmacyVendorData?.users || [];
    return Array.isArray(raw) ? raw.slice(0, 8) : [];
  }, [pharmacyVendorData]);

  const filtered = useMemo(() => {
    const list = medicines.filter(m => {
      const matchCat = activeTab === "All" || m.category === activeTab;
      const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
      const matchStore = !selectedStore || m.brand === selectedStore;
      return matchCat && matchSearch && matchStore;
    });
    if (sortBy === "price_asc") list.sort((a, b) => a.price - b.price);
    else if (sortBy === "price_desc") list.sort((a, b) => b.price - a.price);
    return list;
  }, [medicines, activeTab, search, sortBy, selectedStore]);

  const cartItems: CartItem[] = medicines
    .filter(m => pharmacyCartItems.some(ci => ci.productId === m.id))
    .map(m => {
      const ci = pharmacyCartItems.find(ci => ci.productId === m.id);
      return { ...m, qty: ci?.quantity ?? 1 };
    });

  const cartTotal = cartItems.reduce((sum, m) => sum + m.price * m.qty, 0);
  const cartCount = pharmacyCartItems.reduce((sum, i) => sum + i.quantity, 0);

  const codSwitchingRef = useRef(false);
  useEffect(() => {
    if (codSwitchingRef.current) { codSwitchingRef.current = false; return; }
    if (payMethod === "cash" && cartTotal > config.orderRules.maxCodAmount) {
      const walletBalance = Number(user?.walletBalance ?? 0);
      if (config.features.wallet && walletBalance >= cartTotal) {
        codSwitchingRef.current = true;
        setPayMethod("wallet");
      } else {
        showToast(
          `Order total exceeds COD limit (Rs. ${config.orderRules.maxCodAmount.toLocaleString()}) and wallet balance is insufficient. Please reduce your order.`,
          "error"
        );
      }
    }
  }, [cartTotal, config.orderRules.maxCodAmount, payMethod]);

  const { requireAuth, sheetProps: authSheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();

  const addToCart = useCallback((med: Med) => {
    requireAuth(() => {
      requireCustomerRole(() => {
        addToGlobalCart({ productId: med.id, name: med?.name ?? "—", price: med?.price ?? 0, quantity: 1, type: "pharmacy" });
      });
    }, { message: "Sign in to add items to your cart", returnTo: "/pharmacy" });
  }, [requireAuth, requireCustomerRole, addToGlobalCart]);

  const removeFromCart = useCallback((med: Med) => {
    const existing = pharmacyCartItems.find(ci => ci.productId === med.id);
    if (!existing) return;
    if (existing.quantity <= 1) {
      removeFromGlobalCart(med.id);
    } else {
      updateQuantity(med.id, existing.quantity - 1);
    }
  }, [pharmacyCartItems, removeFromGlobalCart, updateQuantity]);

  const uploadPrescription = async (photoUri: string, refId: string): Promise<void> => {
    const compressed = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    const base64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: "base64" as const });
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) {
      log.error("EXPO_PUBLIC_DOMAIN is not set — prescription upload will fail. Check your environment configuration.");
      throw new Error("EXPO_PUBLIC_DOMAIN is not configured — cannot upload prescription.");
    }
    const res = await fetch(`https://${domain}/api/uploads/prescription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ file: `data:image/jpeg;base64,${base64}`, mimeType: "image/jpeg", refId }),
    });
    if (!res.ok) {
      // eslint-disable-next-line ajk-local/no-silent-catch -- error body parse failure falls back to status-code message (logged below)
      const err = await res.json().catch(() => ({}));
      log.warn("prescription upload failed:", res.status, err);
      throw new Error(`Upload failed: ${res.status}`);
    }
  };

  const submittingRef = useRef(false);
  const placeOrder = async () => {
    if (submittingRef.current) return;
    if (!user) {
      requireAuth(() => {}, { message: "Sign in to place your order", returnTo: "/pharmacy" });
      return;
    }
    if (!hasRole(user ?? null, "customer")) {
      requireCustomerRole(() => {});
      return;
    }
    if (!address.trim() || !phone.trim()) {
      showToast(T("deliveryAddress"), "error");
      return;
    }
    if (!validatePhone(phone.trim())) {
      showToast(`Please enter a valid phone number (e.g. ${(config.regional as any)?.phoneHint ?? config.regional?.phoneFormat ?? "03XXXXXXXXX"})`, "error");
      return;
    }
    if (cartItems.length === 0) {
      showToast(T("addToCart"), "error");
      return;
    }
    const invalidItem = cartItems.find(m => !Number.isFinite(m.price) || m.price <= 0 || !Number.isFinite(m.qty) || m.qty <= 0);
    if (invalidItem) {
      showToast("Each item must have a valid positive price and quantity.", "error");
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
    submittingRef.current = true;
    setLoading(true);
    try {
      const prescriptionRefId = prescriptionPhotoUri
        ? `rx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        : undefined;

      if (prescriptionPhotoUri && prescriptionRefId) {
        const preCheck = await checkPhotoFormatAndSize(prescriptionPhotoUri);
        if (preCheck === "bad_format") {
          showToast("Unsupported file format. Please attach a JPEG, PNG, or WebP image.", "error");
          setLoading(false);
          submittingRef.current = false;
          return;
        }
        if (preCheck === "too_large") {
          showToast("Prescription photo is too large (max 2 MB). Please retake or choose a smaller image.", "error");
          setLoading(false);
          submittingRef.current = false;
          return;
        }
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
        const dataAny = data as typeof data & { total?: number | string };
        const serverTotal = typeof dataAny.total === "number" ? dataAny.total : parseFloat(String(dataAny.total ?? ""));
        updateUser({ walletBalance: Number(user?.walletBalance ?? 0) - (Number.isFinite(serverTotal) ? serverTotal : cartTotal) });
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
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (!pharmacyEnabled) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={{ position: "absolute", top: topPad + 12, left: 16 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={[s.successCard, { borderColor: C.redSoft }]}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>🚫</Text>
          <Text style={[s.successTitle, { color: C.redBright }]}>{T("serviceUnavailable")}</Text>
          <Text style={[s.successSub, { marginBottom: 20 }]}>{T("maintenanceApology")}</Text>
          <TouchableOpacity activeOpacity={0.7} style={[s.successBtn, { backgroundColor: C.redBg }]} onPress={goBack}>
            <Text style={[s.successBtnTxt, { color: C.redBright }]}>{T("backToHome")}</Text>
          </TouchableOpacity>
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
            <TouchableOpacity activeOpacity={0.7} style={[s.successBtn, { flex: 1, backgroundColor: C.purpleBg }]} onPress={() => { setConfirmed(false); router.push("/(tabs)"); }}>
              <Text style={[s.successBtnTxt, { color: C.purple }]}>{T("backToHome")}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} style={[s.successBtn, { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }]} onPress={() => { setConfirmed(false); router.push({ pathname: "/orders/[id]", params: { id: confirmedOrderId, type: "pharmacy" } }); }}>
              <Ionicons name="navigate-outline" size={15} color={C.textInverse} />
              <Text style={s.successBtnTxt}>Track Order</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity activeOpacity={0.7} style={[s.successBtn, { backgroundColor: C.purpleBg, marginTop: 8, width: "100%" }]} onPress={() => { setConfirmed(false); }}>
            <Text style={[s.successBtnTxt, { color: C.purple }]}>{T("orderMore")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <AuthGateSheet {...authSheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <LinearGradient colors={[C.purpleVivid, C.purple, C.purpleMid]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: topPad + 10 }]}>
        <View style={s.hdrRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={C.textInverse} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.hdrTitle}>💊 {T("pharmacy")}</Text>
            <Animated.Text style={[s.hdrSub, { opacity: subtitleOpacity, maxHeight: subtitleMaxHeight }]}>{T("medicinesDeliveredTo")}</Animated.Text>
          </View>
          {cartCount > 0 && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowCheckout(true)} style={s.cartPill}>
              <Ionicons name="cart" size={16} color={C.textInverse} />
              <Text style={s.cartPillTxt}>{cartCount} {T("itemsLabel")}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Animated.View style={{ opacity: searchOpacity, maxHeight: searchMaxHeight, transform: [{ translateY: searchTranslateY }], overflow: "hidden" }}>
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={16} color={C.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={T("searchMedicines")}
              placeholderTextColor={C.textMuted}
              style={s.searchInput}
              maxLength={200}
            />
            {search.length > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </LinearGradient>

      {/* ── Pharmacy Stores section (primary entry point) ── */}
      <View style={{ marginTop: 14, marginBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 }}>
          <View>
            <Text style={{ fontFamily: Font.bold, fontSize: 17, color: C.text }}>Pharmacy Stores</Text>
            <Text style={{ fontFamily: Font.regular, fontSize: 11, color: C.textMuted }}>Order from registered pharmacies</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/pharmacy/stores")}
            style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.purpleBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.purpleBorder }}
            accessibilityRole="button" accessibilityLabel="See all pharmacy stores"
          >
            <Text style={{ fontFamily: Font.semiBold, fontSize: 12, color: C.purple }}>See All</Text>
            <Ionicons name="chevron-forward" size={13} color={C.purple} />
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
        ) : pharmacyStores.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {pharmacyStores.map((store: PharmacyStore) => {
              const name = store.storeName || store.name || "Pharmacy";
              const isOpen = store.storeIsOpen !== false;
              return (
                <TouchableOpacity key={store.id} activeOpacity={0.75}
                  onPress={() => router.push({ pathname: "/pharmacy/store/[id]", params: { id: store.id } })}
                  style={{ width: 150, borderRadius: 14, backgroundColor: C.surface, overflow: "hidden", ...Platform.select({ web: { boxShadow: "0 2px 6px rgba(15,23,42,0.07)" }, default: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 } }) }}
                  accessibilityRole="button" accessibilityLabel={name}
                >
                  <View style={{ height: 80, backgroundColor: C.purpleBg, alignItems: "center", justifyContent: "center" }}>
                    {store.storeBanner
                      ? <Image source={{ uri: store.storeBanner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      : <Ionicons name="medical-outline" size={32} color={C.purple} />
                    }
                    {!isOpen && (
                      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: Font.bold, fontSize: 11, color: "#fff" }}>Closed</Text>
                      </View>
                    )}
                    <View style={{ position: "absolute", bottom: 6, right: 6, backgroundColor: isOpen ? C.emerald : C.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: Font.bold, fontSize: 9, color: "#fff" }}>{isOpen ? "Open" : "Closed"}</Text>
                    </View>
                  </View>
                  <View style={{ padding: 9 }}>
                    <Text style={{ fontFamily: Font.bold, fontSize: 12, color: C.text }} numberOfLines={1}>{name}</Text>
                    {store.storeDeliveryTime && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 }}>
                        <Ionicons name="time-outline" size={10} color={C.textMuted} />
                        <Text style={{ fontFamily: Font.regular, fontSize: 10, color: C.textMuted }}>{store.storeDeliveryTime}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity activeOpacity={0.75}
              onPress={() => router.push("/pharmacy/stores")}
              style={{ width: 100, borderRadius: 14, backgroundColor: C.purpleBg, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.purpleBorder, borderStyle: "dashed" as any, gap: 6 }}
              accessibilityRole="button" accessibilityLabel="See all pharmacy stores"
            >
              <Ionicons name="medical-outline" size={22} color={C.purple} />
              <Text style={{ fontFamily: Font.semiBold, fontSize: 11, color: C.purple, textAlign: "center" }}>See All{"\n"}Pharmacies</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/pharmacy/stores")}
            style={{ marginHorizontal: 16, flexDirection: "row", alignItems: "center", backgroundColor: C.purpleBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: C.purpleBorder }}
            accessibilityRole="button" accessibilityLabel="Browse pharmacy stores"
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.purple, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="storefront-outline" size={18} color={C.textInverse} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Font.bold, fontSize: 14, color: C.text }}>Browse Pharmacy Stores</Text>
              <Text style={{ fontFamily: Font.regular, fontSize: 11, color: C.textMuted }}>Explore registered pharmacies and their products</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 1, backgroundColor: C.borderLight, marginHorizontal: 16, marginTop: 14, marginBottom: 4 }} />
      <Text style={{ fontFamily: Font.bold, fontSize: 17, color: C.text, paddingHorizontal: 16, marginTop: 12, marginBottom: 4 }}>Medicines</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.tabsRow}>
        {categories.map(cat => (
          <TouchableOpacity activeOpacity={0.7} key={cat} onPress={() => setActiveTab(cat)} style={[s.tab, activeTab === cat && s.tabActive]}>
            <Text style={[s.tabTxt, activeTab === cat && s.tabTxtActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}>
        {([
          { key: "default", label: T("defaultLabel" as TranslationKey), icon: "swap-vertical-outline" as const },
          { key: "price_asc", label: T("priceLowHigh" as TranslationKey), icon: "arrow-up-outline" as const },
          { key: "price_desc", label: T("priceHighLow" as TranslationKey), icon: "arrow-down-outline" as const },
        ] as const).map(opt => (
          <TouchableOpacity activeOpacity={0.7} key={opt.key} onPress={() => setSortBy(opt.key)}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: sortBy === opt.key ? C.purple : C.surface, borderWidth: 1, borderColor: sortBy === opt.key ? C.purple : C.border }}
          >
            <Ionicons name={opt.icon} size={13} color={sortBy === opt.key ? C.textInverse : C.textMuted} />
            <Text style={{ fontFamily: Font.semiBold, fontSize: 11, color: sortBy === opt.key ? C.textInverse : C.textSecondary }}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.rxNotice}>
        <Ionicons name="information-circle-outline" size={14} color={C.purple} />
        <Text style={s.rxNoticeTxt}><Text style={{ fontFamily: Font.semiBold }}>Rx</Text> {T("rxNotice")}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.grid}
        refreshControl={<RefreshControl refreshing={loadingMeds} onRefresh={loadMeds} tintColor={C.purple} colors={[C.purple]} />}
        onScroll={scrollHandler} scrollEventThrottle={scrollEventThrottle}
      >
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
            <TouchableOpacity activeOpacity={0.7} onPress={loadMeds} style={s.retryBtn}>
              <Ionicons name="refresh-outline" size={16} color={C.textInverse} />
              <Text style={s.retryBtnTxt}>{T("retry")}</Text>
            </TouchableOpacity>
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
          <TouchableOpacity activeOpacity={0.7} style={s.checkoutBtn} onPress={() => setShowCheckout(true)}>
            <Text style={s.checkoutBtnTxt}>{T("placeOrder")}</Text>
            <Ionicons name="arrow-forward" size={16} color={C.textInverse} />
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showCheckout} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCheckout(false)}>
        <ScrollView style={s.modal} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{T("orderSummary")}</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowCheckout(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          <ErrorBoundary>
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
          </ErrorBoundary>

          <ErrorBoundary>
            <View style={s.section}>
              <Text style={s.sectionTitle}>{T("deliveryDetails")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={s.label}>{T("deliveryAddress")} *</Text>
              {savedAddresses.length > 0 && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => setShowAddressPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.purpleSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Ionicons name="bookmark-outline" size={12} color={C.purple} />
                  <Text style={{ ...Typ.smallMedium, fontFamily: Font.semiBold, color: C.purple }}>Saved</Text>
                </TouchableOpacity>
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
              maxLength={500}
            />
            <Text style={s.label}>{T("contactNumber")} *</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="03XX XXXXXXX"
              placeholderTextColor={C.textMuted}
              style={s.input}
              keyboardType="phone-pad"
              maxLength={20}
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
              maxLength={500}
            />
            <TouchableOpacity activeOpacity={0.7} onPress={pickPrescriptionPhoto} style={s.photoPickerBtn}>
              <Ionicons name="camera-outline" size={18} color={C.purple} />
              <Text style={s.photoPickerTxt}>
                {prescriptionPhotoUri ? "Change Prescription Photo" : "Attach Prescription Photo"}
              </Text>
            </TouchableOpacity>
            {prescriptionPhotoUri && (
              <View style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: C.purpleBorder }}>
                <Image source={{ uri: prescriptionPhotoUri }} style={{ width: "100%", height: 140 }} resizeMode="cover" />
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => setPrescriptionPhotoUri(null)}
                  style={{ position: "absolute", top: 8, right: 8, backgroundColor: C.overlayDark50, borderRadius: 12, padding: 4 }}
                >
                  <Ionicons name="close" size={16} color={C.textInverse} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={pickPrescriptionPhoto}
                  style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: C.overlayPurple85, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Ionicons name="refresh-outline" size={12} color={C.textInverse} />
                  <Text style={{ ...Typ.smallMedium, fontFamily: Font.semiBold, color: C.textInverse }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            </View>
          </ErrorBoundary>

          <ErrorBoundary>
            <View style={s.section}>
              <Text style={s.sectionTitle}>{T("paymentMethods")}</Text>
              <View style={s.payRow}>
                {cartTotal <= config.orderRules.maxCodAmount ? (
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setPayMethod("cash")} style={[s.payOpt, payMethod === "cash" && s.payOptActive]}>
                    <View style={[s.payOptIconWrap, { backgroundColor: payMethod === "cash" ? C.emeraldSoft : C.surfaceSecondary }]}>
                      <Ionicons name="cash-outline" size={20} color={payMethod === "cash" ? C.emerald : C.textMuted} />
                    </View>
                    <Text style={[s.payOptTxt, payMethod === "cash" && { color: C.emerald }]}>{T("cashOnDelivery")}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[s.payOpt, { opacity: 0.4 }]}>
                    <View style={[s.payOptIconWrap, { backgroundColor: C.surfaceSecondary }]}>
                      <Ionicons name="cash-outline" size={20} color={C.textMuted} />
                    </View>
                    <Text style={s.payOptTxt}>{T("codLimit")}: Rs. {config.orderRules.maxCodAmount.toLocaleString()}</Text>
                  </View>
                )}
                {config.features.wallet && (
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setPayMethod("wallet")} style={[s.payOpt, payMethod === "wallet" && s.payOptActive]}>
                    <View style={[s.payOptIconWrap, { backgroundColor: payMethod === "wallet" ? C.blueSoft : C.surfaceSecondary }]}>
                      <Ionicons name="wallet-outline" size={20} color={payMethod === "wallet" ? C.primary : C.textMuted} />
                    </View>
                    <View>
                      <Text style={[s.payOptTxt, payMethod === "wallet" && { color: C.primary }]}>{T("wallet")}</Text>
                      <Text style={s.walletBal}>Rs. {(user?.walletBalance ?? 0).toLocaleString()} {T("availableBalance")}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ErrorBoundary>

          {uploadFailed && (
            <View style={{ backgroundColor: C.redBg, borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.redBorder }}>
              <Ionicons name="cloud-offline-outline" size={18} color={C.red} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...Typ.buttonSmall, color: C.redDeepest }}>Prescription upload failed</Text>
                <Text style={{ ...Typ.caption, color: C.redDark, marginTop: 2 }}>Check your connection and tap below to retry</Text>
              </View>
            </View>
          )}

          <TouchableOpacity activeOpacity={0.7} style={[s.placeBtn, loading && { opacity: 0.7 }]} onPress={placeOrder} disabled={loading}>
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
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal visible={showPrescriptionPreview} animationType="fade" onRequestClose={() => { setShowPrescriptionPreview(false); setPendingPhotoUri(null); }}>
        <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "flex-end" }}>
          {pendingPhotoUri && (
            <Image
              source={{ uri: pendingPhotoUri }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              resizeMode="contain"
            />
          )}
          <View style={{ backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 20, paddingVertical: 28, paddingBottom: Math.max(insets.bottom + 12, 32), gap: 12 }}>
            <Text style={{ color: "#fff", fontSize: 16, fontFamily: Font.bold, textAlign: "center", marginBottom: 4 }}>
              Use this prescription photo?
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              style={{ backgroundColor: C.purple, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
              onPress={() => {
                if (pendingPhotoUri) {
                  setPrescriptionPhotoUri(pendingPhotoUri);
                  if (uploadFailed) setUploadFailed(false);
                }
                setPendingPhotoUri(null);
                setShowPrescriptionPreview(false);
              }}
            >
              <Text style={{ color: "#fff", fontFamily: Font.bold, fontSize: 16 }}>Use This Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
              onPress={() => {
                setPendingPhotoUri(null);
                setShowPrescriptionPreview(false);
                setShowPhotoSourceModal(true);
              }}
            >
              <Text style={{ color: "#fff", fontFamily: Font.semiBold, fontSize: 16 }}>Retake / Choose Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              style={{ alignItems: "center", paddingVertical: 10 }}
              onPress={() => { setPendingPhotoUri(null); setShowPrescriptionPreview(false); }}
            >
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: Font.regular, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddressPicker} transparent animationType="fade" onRequestClose={() => setShowAddressPicker(false)}>
        <TouchableOpacity activeOpacity={0.7} style={{ flex: 1, backgroundColor: C.overlayDark40, justifyContent: "flex-end" }} onPress={() => setShowAddressPicker(false)}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
            <Text style={{ ...Typ.h3, fontSize: 16, color: C.text, marginBottom: 16 }}>Saved Addresses</Text>
            {savedAddresses.map((sa: any) => (
              <TouchableOpacity activeOpacity={0.7}
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
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showPhotoSourceModal} transparent animationType="fade" onRequestClose={() => setShowPhotoSourceModal(false)}>
        <TouchableOpacity activeOpacity={0.7} style={{ flex: 1, backgroundColor: C.overlayDark40, justifyContent: "flex-end" }} onPress={() => setShowPhotoSourceModal(false)}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
            <Text style={{ ...Typ.h3, fontSize: 16, color: C.text, marginBottom: 16, textAlign: "center" }}>
              Attach Prescription
            </Text>
            <TouchableOpacity activeOpacity={0.7}
              onPress={takePhoto}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.purpleBg, borderRadius: 14, marginBottom: 10 }}
            >
              <Ionicons name="camera-outline" size={22} color={C.purple} />
              <Text style={{ ...Typ.bodySemiBold, color: C.purple }}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}
              onPress={pickFromGallery}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.purpleBg, borderRadius: 14, marginBottom: 10 }}
            >
              <Ionicons name="image-outline" size={22} color={C.purple} />
              <Text style={{ ...Typ.bodySemiBold, color: C.purple }}>Choose from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => setShowPhotoSourceModal(false)}
              style={{ paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ ...Typ.bodyMedium, color: C.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      <PermissionGuide
        visible={permGuideVisible}
        type={permGuideType}
        onClose={() => setPermGuideVisible(false)}
      />
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: 16, paddingBottom: 10 },
  hdrRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight20, alignItems: "center", justifyContent: "center" },
  hdrTitle: { ...Typ.title, color: C.textInverse },
  hdrSub: { ...Typ.caption, color: C.overlayLight80, marginTop: 2 },
  cartPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.overlayLight25, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22 },
  cartPillTxt: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.textInverse },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(15,23,42,0.08)" }, default: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 } }) },
  searchInput: { flex: 1, ...Typ.body, fontSize: 13, color: C.text, padding: 0 },

  tabsScroll: { backgroundColor: C.surface },
  tabsRow: { paddingHorizontal: 12, gap: 8, alignItems: "center", paddingVertical: 10 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22, backgroundColor: C.purpleBg },
  tabActive: { backgroundColor: C.purple },
  tabTxt: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.purple },
  tabTxtActive: { color: C.textInverse },

  rxNotice: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.purpleBg, paddingHorizontal: 16, paddingVertical: 10, marginTop: 0, borderBottomWidth: 1, borderBottomColor: C.purpleSoft },
  rxNoticeTxt: { ...Typ.small, color: C.purple, flex: 1 },

  grid: { paddingHorizontal: 12, paddingTop: 12, gap: 10 },
  centerState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTxt: { ...Typ.bodyMedium, color: C.textMuted },
  errorIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  errorTitle: { ...Typ.h3, fontSize: 16, color: C.grayDark },
  errorSub: { ...Typ.body, fontSize: 13, color: C.gray },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.purple, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  retryBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },

  medCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: C.border, ...Platform.select({ web: { boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }, default: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 } }) },
  medEmoji: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.purpleBg, alignItems: "center", justifyContent: "center" },
  medName: { ...Typ.bodySemiBold, color: C.text, flex: 1 },
  medBrand: { ...Typ.small, color: C.textMuted, marginTop: 2 },
  medUnit: { ...Typ.small, fontSize: 10, color: C.textMuted },
  medPrice: { ...Typ.button, fontFamily: Font.bold, color: C.purple, marginTop: 4 },
  rxBadge: { backgroundColor: C.redSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  rxTxt: { ...Typ.tiny, fontSize: 9, color: C.redBright },

  storeSecRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  storeSecTitle: { ...Typ.h3, fontSize: 16, color: C.text, flex: 1 },
  storeCountBadge: { backgroundColor: C.purple, borderRadius: 10, minWidth: 22, height: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  storeCountTxt: { ...Typ.small, fontFamily: Font.bold, color: C.textInverse },
  storeCard: { width: 100, alignItems: "center", backgroundColor: C.surface, borderRadius: 16, padding: 10, borderWidth: 1.5, borderColor: C.border, ...Platform.select({ web: { boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }, default: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 } }) },
  storeCardActive: { borderColor: C.purple, backgroundColor: C.purpleBg },
  storeEmoji: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.purpleBg, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  storeEmojiActive: { backgroundColor: C.purple },
  storeName: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.text, textAlign: "center", marginBottom: 2 },
  storeNameActive: { color: C.purple },
  storeItems: { ...Typ.tiny, fontSize: 10, color: C.textMuted },

  qtyCtrl: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: C.purple, alignItems: "center", justifyContent: "center" },
  qtyTxt: { ...Typ.button, fontFamily: Font.bold, color: C.text, minWidth: 20, textAlign: "center" },
  addBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.purple, alignItems: "center", justifyContent: "center", ...Platform.select({ web: { boxShadow: "0 2px 4px rgba(139,92,246,0.30)" }, default: { shadowColor: "#8B5CF6", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 } }) },

  cartBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, ...Platform.select({ web: { boxShadow: "0 -2px 8px rgba(15,23,42,0.06)" }, default: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 5 } }) },
  cartBarCount: { ...Typ.caption, color: C.textMuted },
  cartBarTotal: { ...Typ.title, color: C.text },
  checkoutBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.purple, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14, ...Platform.select({ web: { boxShadow: "0 2px 4px rgba(139,92,246,0.30)" }, default: { shadowColor: "#8B5CF6", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 } }) },
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

  placeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 16, backgroundColor: C.purple, borderRadius: 16, paddingVertical: 16, ...Platform.select({ web: { boxShadow: "0 3px 8px rgba(139,92,246,0.30)" }, default: { shadowColor: "#8B5CF6", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 } }) },
  placeBtnTxt: { ...Typ.button, fontFamily: Font.bold, color: C.textInverse },

  successCard: { backgroundColor: C.surface, borderRadius: 24, padding: 28, alignItems: "center", width: "100%", borderWidth: 1, borderColor: C.border, ...Platform.select({ web: { boxShadow: "0 4px 16px rgba(15,23,42,0.08)" }, default: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 5 } }) },
  successIconWrap: { marginBottom: 16 },
  successIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  successTitle: { ...Typ.h2, fontSize: 24, color: C.text, marginBottom: 8 },
  successSub: { ...Typ.body, color: C.textMuted, textAlign: "center", lineHeight: 20, marginBottom: 16 },
  successMeta: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 20, width: "100%" },
  successMetaTxt: { ...Typ.body, fontSize: 13, color: C.textMuted, flex: 1 },
  successBtn: { width: "100%", alignItems: "center", backgroundColor: C.purple, borderRadius: 16, paddingVertical: 15 },
  successBtnTxt: { ...Typ.button, fontFamily: Font.bold, color: C.textInverse },
  });
}

export default PharmacyScreenInner;
