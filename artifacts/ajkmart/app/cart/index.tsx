import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { LinearGradient } from "expo-linear-gradient";

import Colors from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { createOrder } from "@workspace/api-client-react";
import { API_BASE } from "@/utils/api";

const C = Colors.light;
type PayMethod = "cash" | "wallet" | "jazzcash" | "easypaisa";

interface PaymentMethod {
  id: PayMethod;
  label: string;
  logo: string;
  available: boolean;
  description: string;
  mode?: string;
}

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  city: string;
  icon: string;
  isDefault: boolean;
}

function AddressPickerModal({
  visible, addresses, selected, onSelect, onClose, onAddressCreated, token,
}: {
  visible: boolean;
  addresses: SavedAddress[];
  selected: string;
  onSelect: (a: SavedAddress) => void;
  onClose: () => void;
  onAddressCreated: (a: SavedAddress) => void;
  token: string | null | undefined;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("Home");
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("Muzaffarabad");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setShowForm(false);
    setNewLabel("Home");
    setNewAddress("");
    setNewCity("Muzaffarabad");
    setFormError(null);
  };

  const handleSave = async () => {
    if (!newAddress.trim()) { setFormError("Address is required"); return; }
    if (!newCity.trim()) { setFormError("City is required"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_BASE}/addresses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          label: newLabel.trim() || "Home",
          address: newAddress.trim(),
          city: newCity.trim(),
          icon: newLabel.toLowerCase().includes("work") ? "briefcase-outline" : newLabel.toLowerCase().includes("office") ? "business-outline" : "home-outline",
          isDefault: addresses.length === 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save address");
      }
      const d = await res.json();
      const created: SavedAddress = d.address || d;
      onAddressCreated(created);
      resetForm();
      onClose();
    } catch (e: any) {
      setFormError(e.message || "Could not save address");
    }
    setSaving(false);
  };

  const LABEL_PRESETS = ["Home", "Work", "Office", "Other"];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!saving) { resetForm(); onClose(); } }}>
      <Pressable style={styles.overlay} onPress={() => { if (!saving) { resetForm(); onClose(); } }}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{showForm ? "Add New Address" : "Choose Delivery Address"}</Text>

          {showForm ? (
            <View style={{ gap: 14 }}>
              <View>
                <Text style={{ ...Typ.captionMedium, color: C.textSecondary, marginBottom: 6 }}>Label</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {LABEL_PRESETS.map(l => (
                    <Pressable
                      key={l}
                      onPress={() => setNewLabel(l)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: newLabel === l ? C.primary : C.surfaceSecondary,
                        borderWidth: 1, borderColor: newLabel === l ? C.primary : C.border,
                      }}
                    >
                      <Text style={{ ...Typ.captionMedium, color: newLabel === l ? C.textInverse : C.text }}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ ...Typ.captionMedium, color: C.textSecondary, marginBottom: 6 }}>Street Address</Text>
                <TextInput
                  value={newAddress}
                  onChangeText={setNewAddress}
                  placeholder="e.g. CMH Road, Near GPO"
                  placeholderTextColor={C.textMuted}
                  multiline
                  style={{
                    borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
                    paddingHorizontal: 14, paddingVertical: 12, minHeight: 60,
                    ...Typ.body, color: C.text, backgroundColor: C.surfaceSecondary,
                    textAlignVertical: "top",
                  }}
                />
              </View>
              <View>
                <Text style={{ ...Typ.captionMedium, color: C.textSecondary, marginBottom: 6 }}>City</Text>
                <TextInput
                  value={newCity}
                  onChangeText={setNewCity}
                  placeholder="e.g. Muzaffarabad"
                  placeholderTextColor={C.textMuted}
                  style={{
                    borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
                    paddingHorizontal: 14, paddingVertical: 12,
                    ...Typ.body, color: C.text, backgroundColor: C.surfaceSecondary,
                  }}
                />
              </View>
              {formError && <Text style={{ ...Typ.caption, color: C.red }}>{formError}</Text>}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={() => resetForm()}
                  disabled={saving}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border }}
                >
                  <Text style={{ ...Typ.buttonSmall, color: C.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={{ flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: C.primary, opacity: saving ? 0.7 : 1 }}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={C.textInverse} />
                    : <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.textInverse }}>Save & Select</Text>
                  }
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {addresses.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 28, gap: 10 }}>
                  <Ionicons name="location-outline" size={40} color={C.textMuted} />
                  <Text style={{ ...Typ.button, color: C.text }}>No saved addresses</Text>
                  <Text style={{ ...Typ.body, fontSize: 13, color: C.textSecondary, textAlign: "center" }}>
                    Add a delivery address to continue
                  </Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
                  {addresses.map(addr => {
                    const isSel = selected === addr.id;
                    return (
                      <Pressable
                        key={addr.id}
                        onPress={() => { onSelect(addr); onClose(); }}
                        style={[styles.addrOpt, isSel && styles.addrOptSel]}
                      >
                        <View style={[styles.addrOptIcon, { backgroundColor: isSel ? C.brandBlueSoft : C.surfaceSecondary }]}>
                          <Ionicons name={(addr.icon as keyof typeof Ionicons.glyphMap) || "location-outline"} size={20} color={isSel ? C.primary : C.textSecondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={[styles.addrOptLabel, isSel && { color: C.primary }]}>{addr.label}</Text>
                            {addr.isDefault && (
                              <View style={styles.defaultTag}>
                                <Text style={styles.defaultTagText}>Default</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.addrOptAddress} numberOfLines={1}>{addr.address}</Text>
                          <Text style={styles.addrOptCity}>{addr.city}</Text>
                        </View>
                        {isSel && <Ionicons name="checkmark-circle" size={22} color={C.primary} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              <Pressable onPress={() => setShowForm(true)} style={[styles.addrOpt, { borderColor: C.primary, borderStyle: "dashed", marginTop: 8 }]}>
                <View style={[styles.addrOptIcon, { backgroundColor: C.brandBlueSoft }]}>
                  <Ionicons name="add-outline" size={20} color={C.primary} />
                </View>
                <Text style={[styles.addrOptLabel, { color: C.primary }]}>Add New Address</Text>
              </Pressable>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser, token, socket } = useAuth();
  const {
    items, total, cartType, updateQuantity, clearCart, clearCartOnAck, restoreCart, addItem, validateCart, isValidating,
    pendingAck, setPendingAck,
    ackStuck,
    dismissAck,
    orderSuccess, clearOrderSuccess,
    setPendingOrderId, startAckStuckTimer, cancelAckStuckTimer,
  } = useCart();
  const { showToast } = useToast();
  const { config: platformConfig } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const appName    = platformConfig.platform.appName;
  const orderRules = platformConfig.orderRules;
  const finance    = platformConfig.finance;
  const customer   = platformConfig.customer;

  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<typeof items | null>(null);
  const [showUndoClear, setShowUndoClear] = useState(false);
  const undoClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string>("");
  const [showAddrPicker, setShowAddrPicker] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);

  const [allPayMethods, setAllPayMethods] = useState<PaymentMethod[]>([
    { id: "cash",   label: "Cash on Delivery",    logo: "💵", available: true,  description: "Pay on delivery" },
    { id: "wallet", label: `${appName} Wallet`,   logo: "💰", available: true,  description: "Instant pay from wallet" },
  ]);

  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);

  const [showGwModal, setShowGwModal] = useState(false);
  const [gwMobile, setGwMobile] = useState("");
  const [gwPaying, setGwPaying] = useState(false);
  const [gwStep, setGwStep] = useState<"input" | "waiting" | "done">("input");

  const [gwBackgrounded, setGwBackgrounded] = useState(false);

  const mountedRef = useRef(true);
  const gwPollRef = useRef<{ active: boolean; intervalId?: ReturnType<typeof setInterval> }>({ active: false });
  const gwTxnRef  = useRef<string | null>(null);
  const gwOrderId = useRef<string | null>(null);
  const promoRevalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      gwPollRef.current.active = false;
      if (gwPollRef.current.intervalId) clearInterval(gwPollRef.current.intervalId);
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", nextState => {
      if (gwStep !== "waiting") return;
      if (nextState === "background" || nextState === "inactive") {
        gwPollRef.current.active = false;
        if (gwPollRef.current.intervalId) {
          clearInterval(gwPollRef.current.intervalId);
          gwPollRef.current.intervalId = undefined;
        }
        if (mountedRef.current) setGwBackgrounded(true);
      } else if (nextState === "active" && gwBackgrounded) {
        setGwBackgrounded(false);
        const oid = gwOrderId.current;
        if (!oid) return;
        (async () => {
          try {
            const r = await fetch(`${API_BASE}/payments/${encodeURIComponent(oid)}/status`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const d = await r.json() as any;
            if (!mountedRef.current) return;
            if (d.status === "completed" || d.status === "success") {
              const successData = { id: oid.slice(-6).toUpperCase(), time: "30-45 min", payMethod };
              setPendingOrderId(oid, successData);
              setPendingAck(true);
              startAckStuckTimer(60000);
              setGwStep("done");
              setShowGwModal(false);
            } else if (d.status === "failed" || d.status === "expired") {
              setGwStep("input");
              await cancelPendingOrder(oid);
              showToast(d.message || T("paymentNotSuccessful"), "error");
            } else {
              showToast(T("paymentPending") || "Payment still processing — approve in your JazzCash/EasyPaisa app, then return here", "info");
            }
          } catch {
            showToast(T("paymentServerError") || "Could not check payment status", "error");
          }
        })();
      }
    });
    return () => sub.remove();
  }, [gwStep, gwBackgrounded, payMethod, showToast]);

  const topPad = Math.max(insets.top, 12);
  const deliveryFeeConfig = platformConfig.deliveryFee;
  const freeDeliveryAbove = platformConfig.deliveryFee.freeDeliveryAbove;
  const freeDeliveryEnabled = platformConfig.deliveryFee.freeEnabled;

  useEffect(() => {
    fetch(`${API_BASE}/platform-config`)
      .then(r => r.json())
      .then(d => {
        if (d.payment?.methods) {
          const methods: PaymentMethod[] = d.payment.methods.map((m: any) => ({
            id: m.id, label: m.label, logo: m.logo,
            available: m.available, description: m.description, mode: m.mode,
          }));
          setAllPayMethods(methods);
        }
      })
      .catch((err) => {
        console.warn("[Cart] Failed to refresh platform config:", err instanceof Error ? err.message : String(err));
      });
  }, []);

  const deliveryFeeByType: Record<string, number> = {
    mart:     deliveryFeeConfig.mart,
    food:     deliveryFeeConfig.food,
    pharmacy: deliveryFeeConfig.pharmacy,
    parcel:   deliveryFeeConfig.parcel,
  };
  const rawDeliveryFee = deliveryFeeByType[cartType] ?? deliveryFeeConfig.mart;
  const deliveryFee = (freeDeliveryEnabled && total >= freeDeliveryAbove) ? 0 : rawDeliveryFee;
  const gstAmount   = finance.gstEnabled ? Math.round(total * finance.gstPct / 100) : 0;
  const cashbackAmt = finance.cashbackEnabled ? Math.min(Math.round(total * finance.cashbackPct / 100), finance.cashbackMaxRs) : 0;
  const grandTotal  = Math.max(0, total + deliveryFee + gstAmount - promoDiscount);
  const walletCashbackApplies = payMethod === "wallet" && customer.walletCashbackPct > 0 && customer.walletCashbackOrders;
  const walletCashbackAmt = walletCashbackApplies ? Math.round(grandTotal * customer.walletCashbackPct / 100) : 0;

  const availablePayMethods = allPayMethods.map(m => {
    if (m.id === "cash" && grandTotal > orderRules.maxCodAmount) {
      return { ...m, available: false, description: `COD limit: Rs.${orderRules.maxCodAmount.toLocaleString()}` };
    }
    return m;
  });

  useEffect(() => {
    if (payMethod === "cash" && grandTotal > orderRules.maxCodAmount) {
      const fallback = availablePayMethods.find(m => m.id !== "cash" && m.available);
      if (fallback) setPayMethod(fallback.id as PayMethod);
    }
  }, [grandTotal, orderRules.maxCodAmount, payMethod]);

  const selectedAddr = addresses.find(a => a.id === selectedAddrId);
  const deliveryLine = selectedAddr
    ? `${selectedAddr.label} — ${selectedAddr.address}, ${selectedAddr.city}`
    : "";

  useEffect(() => {
    if (!user?.id) return;
    setAddrLoading(true);
    fetch(`${API_BASE}/addresses`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(d => {
        const addrs: SavedAddress[] = d.addresses || [];
        setAddresses(addrs);
        const def = addrs.find(a => a.isDefault) || addrs[0];
        if (def) setSelectedAddrId(def.id);
      })
      .catch((err) => {
        console.warn("[Cart] Failed to load addresses:", err instanceof Error ? err.message : String(err));
        showToast("Could not load saved addresses. Please add one manually.", "error");
      })
      .finally(() => setAddrLoading(false));
  }, [user?.id]);

  const cartFingerprint = items.map(i => `${i.productId}:${i.quantity}:${i.price}`).join("|") + "|" + cartType;
  useEffect(() => {
    if (promoApplied && promoCode) {
      if (promoRevalidateTimer.current) clearTimeout(promoRevalidateTimer.current);
      promoRevalidateTimer.current = setTimeout(() => {
        revalidatePromo(promoCode);
      }, 800);
    }
    return () => {
      if (promoRevalidateTimer.current) clearTimeout(promoRevalidateTimer.current);
    };
  }, [cartFingerprint]);

  const revalidatePromo = async (code: string) => {
    setPromoLoading(true);
    try {
      const orderType = (cartType === "mixed" || cartType === "pharmacy" || cartType === "none") ? "mart" : cartType;
      const res = await fetch(`${API_BASE}/orders/validate-promo?code=${encodeURIComponent(code)}&total=${total}&type=${orderType}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.valid) {
        setPromoDiscount(data.discount);
      } else {
        setPromoCode(null);
        setPromoDiscount(0);
        setPromoApplied(false);
        showToast(T("promoInvalidRemoved"), "error");
      }
    } catch {
      showToast(T("promoNetworkError"), "error");
      setPromoCode(null);
      setPromoDiscount(0);
      setPromoApplied(false);
    } finally {
      setPromoLoading(false);
    }
  };

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const orderType = (cartType === "mixed" || cartType === "pharmacy" || cartType === "none") ? "mart" : cartType;
      const res = await fetch(`${API_BASE}/orders/validate-promo?code=${encodeURIComponent(code)}&total=${total}&type=${orderType}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.valid) {
        setPromoCode(code);
        setPromoDiscount(data.discount);
        setPromoApplied(true);
        setPromoError(null);
        showToast(`${T("promoApplied")} Rs. ${data.discount} discount received`, "success");
      } else {
        setPromoCode(null);
        setPromoDiscount(0);
        setPromoApplied(false);
        setPromoError(data.error || T("promoInvalid"));
      }
    } catch {
      setPromoError(T("promoNetworkErrRetry"));
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setPromoCode(null);
    setPromoDiscount(0);
    setPromoApplied(false);
    setPromoInput("");
    setPromoError(null);
  };

  const placeOrder = async (finalPayMethod: PayMethod) => {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    let order: any = null;
    const idemKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setPendingAck(true);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        order = await createOrder({
          type: cartType === "mixed" ? "mart" : cartType,
          items: items.map(i => ({
            productId: i.productId, name: i.name,
            price: i.price, quantity: i.quantity, image: i.image,
          })),
          deliveryAddress: deliveryLine,
          paymentMethod: finalPayMethod,
          idempotencyKey: idemKey,
          ...(promoCode ? { promoCode } : {}),
        } as any);
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        const status = err?.status ?? err?.statusCode ?? 0;
        if (status >= 400 && status < 500) {
          setPendingAck(false);
          throw err;
        }
        if (attempt < MAX_RETRIES - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    if (lastError || !order) {
      setPendingAck(false);
      throw lastError ?? new Error("Order failed after retries");
    }

    if (finalPayMethod === "wallet") {
      const serverDeducted = parseFloat((order as any).total ?? grandTotal);
      updateUser({ walletBalance: (user!.walletBalance ?? 0) - serverDeducted });
    }

    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await fetch(`${API_BASE}/locations/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            latitude: pos.coords.latitude, longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null, role: "customer", action: "order_placed",
          }),
        });
      } catch (locErr) {
        if (__DEV__) console.warn("[location] order placement update failed:", locErr);
      }
    })();

    const orderId = (order as any).id as string | undefined;
    const successData = {
      id: (orderId ?? "------").slice(-6).toUpperCase(),
      time: (order as any).estimatedTime || "30-45 min",
      payMethod: finalPayMethod,
    };

    if (orderId) {
      setPendingOrderId(orderId, successData);
      startAckStuckTimer(socket ? 60000 : 20000);
    } else {
      clearCartOnAck();
    }
  };

  const handleCheckout = async () => {
    if (loading || isValidating) return;
    if (!user) { showToast(T("pleaseLogin"), "error"); return; }
    if (items.length === 0) { showToast(T("cartEmpty"), "error"); return; }
    if (cartType === "pharmacy") { router.push("/pharmacy"); return; }
    if (!deliveryLine) {
      showToast(T("selectDeliveryAddress"), "error");
      setShowAddrPicker(true);
      return;
    }
    if (selectedAddr && !selectedAddr.city?.trim()) {
      Alert.alert(
        T("cityMissingTitle"),
        T("cityMissingError"),
        [
          { text: T("cancel"), style: "cancel" },
          {
            text: T("editAddress"),
            onPress: () => router.push({ pathname: "/(tabs)/profile", params: { section: "addresses" } }),
          },
        ]
      );
      return;
    }
    const serviceableCities = orderRules.serviceableCities;
    if (
      selectedAddr &&
      selectedAddr.city?.trim() &&
      serviceableCities.length > 0
    ) {
      const normalizeCity = (s: string) =>
        s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const userCity = normalizeCity(selectedAddr.city);
      const cityAliases: Record<string, string[]> = {
        "muzaffarabad": ["mzd", "muzafarabad", "muzaffarabd"],
        "mirpur": ["mirpur ajk", "mirpurajk"],
        "rawalakot": ["rawala kot", "rawalakot ajk"],
        "abbottabad": ["abbotabad", "abottabad"],
        "islamabad": ["isb"],
        "rawalpindi": ["pindi", "rwp"],
      };
      const isServicable = serviceableCities.some(c => {
        const normC = normalizeCity(c);
        if (normC === userCity) return true;
        const aliases = cityAliases[normC] || [];
        return aliases.some(alias => normalizeCity(alias) === userCity);
      });
      if (!isServicable) {
        showToast(
          `Delivery is currently only available in: ${serviceableCities.join(", ")}. Your address is in ${selectedAddr.city}.`,
          "error",
        );
        return;
      }
    }
    if (total < orderRules.minOrderAmount) {
      showToast(`Minimum order Rs.${orderRules.minOrderAmount} — add Rs.${orderRules.minOrderAmount - total} more`, "error");
      return;
    }
    if (total > orderRules.maxCartValue) {
      showToast(`Cart value cannot exceed Rs.${orderRules.maxCartValue.toLocaleString()}`, "error");
      return;
    }

    const cartResult = await validateCart();
    if (!cartResult.valid) {
      return;
    }

    if (payMethod === "wallet") {
      if ((user.walletBalance ?? 0) < grandTotal) {
        showToast(`Wallet has Rs. ${user.walletBalance} — Rs. ${grandTotal} required`, "error");
        return;
      }
      setLoading(true);
      try { await placeOrder("wallet"); }
      catch (e: any) { showToast(e.message || T("couldNotPlaceOrder"), "error"); }
      setLoading(false);
      return;
    }

    if (payMethod === "jazzcash" || payMethod === "easypaisa") {
      setGwStep("input");
      setGwMobile("");
      setShowGwModal(true);
      return;
    }

    setLoading(true);
    try { await placeOrder("cash"); }
    catch (e: any) { showToast(e.message || T("couldNotPlaceOrderRetry"), "error"); }
    setLoading(false);
  };

  const handleGwPay = async () => {
    if (!gwMobile || gwMobile.replace(/\D/g, "").length < 10) {
      showToast(T("validMobileRequired"), "error");
      return;
    }
    setGwPaying(true);
    setGwStep("waiting");
    setGwBackgrounded(false);
    try {
      const GW_MAX_RETRIES = 3;
      let gwLastError: Error | null = null;
      let order: any = null;
      const gwIdemKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      for (let attempt = 0; attempt < GW_MAX_RETRIES; attempt++) {
        try {
          order = await createOrder({
            type: cartType === "mixed" ? "mart" : cartType,
            items: items.map(i => ({
              productId: i.productId, name: i.name,
              price: i.price, quantity: i.quantity, image: i.image,
            })),
            deliveryAddress: deliveryLine,
            paymentMethod: payMethod,
            idempotencyKey: gwIdemKey,
            ...(promoCode ? { promoCode } : {}),
          } as any);
          gwLastError = null;
          break;
        } catch (err: any) {
          gwLastError = err;
          const status = err?.status ?? err?.statusCode ?? 0;
          if (status >= 400 && status < 500) throw err;
          if (attempt < GW_MAX_RETRIES - 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      if (gwLastError || !order) {
        throw gwLastError ?? new Error("Order creation failed after retries");
      }
      const realOrderId = (order as any).id;
      if (!realOrderId) { throw new Error("Could not create order"); }

      const r = await fetch(`${API_BASE}/payments/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          gateway: payMethod, amount: grandTotal,
          orderId: realOrderId, mobileNumber: gwMobile.replace(/\D/g, ""),
        }),
      });
      const data = await r.json() as any;
      if (!r.ok) {
        await cancelPendingOrder(realOrderId);
        throw new Error(data.error || "Could not initiate payment");
      }

      gwOrderId.current = realOrderId;
      gwTxnRef.current = data.txnRef || data.transactionRef || realOrderId;
    } catch (e: any) {
      showToast(e.message || T("paymentFailed"), "error");
      setGwStep("input");
    }
    setGwPaying(false);
  };

  const cancelPendingOrder = async (orderId: string) => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: "payment_failed" }),
      });
      if (res.status === 404) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (__DEV__) console.warn("[cancelPendingOrder] failed:", data.error);
      }
    } catch (err: any) {
      if (__DEV__) console.warn("[cancelPendingOrder] network error:", err.message);
    }
  };

  const gwName = payMethod === "jazzcash" ? "JazzCash" : "EasyPaisa";
  const gwLogo = payMethod === "jazzcash" ? "🔴" : "🟢";
  const gwColor = payMethod === "jazzcash" ? C.red : C.greenBright;

  type NumPadBtn = { label: string; action: () => void; isOk?: boolean };
  const numPadRows: NumPadBtn[][] = [
    [
      { label: "1", action: () => gwMobile.length < 11 && setGwMobile(p => p + "1") },
      { label: "2", action: () => gwMobile.length < 11 && setGwMobile(p => p + "2") },
      { label: "3", action: () => gwMobile.length < 11 && setGwMobile(p => p + "3") },
    ],
    [
      { label: "4", action: () => gwMobile.length < 11 && setGwMobile(p => p + "4") },
      { label: "5", action: () => gwMobile.length < 11 && setGwMobile(p => p + "5") },
      { label: "6", action: () => gwMobile.length < 11 && setGwMobile(p => p + "6") },
    ],
    [
      { label: "7", action: () => gwMobile.length < 11 && setGwMobile(p => p + "7") },
      { label: "8", action: () => gwMobile.length < 11 && setGwMobile(p => p + "8") },
      { label: "9", action: () => gwMobile.length < 11 && setGwMobile(p => p + "9") },
    ],
    [
      { label: "⌫", action: () => setGwMobile(p => p.slice(0, -1)) },
      { label: "0", action: () => gwMobile.length < 11 && setGwMobile(p => p + "0") },
      { label: "✓", action: handleGwPay, isOk: true },
    ],
  ];

  const GatewayModal = () => (
    <Modal visible={showGwModal} transparent animationType="slide" onRequestClose={() => { if (!gwPaying) setShowGwModal(false); }}>
      <Pressable style={styles.overlay} onPress={() => { if (!gwPaying) setShowGwModal(false); }}>
        <Pressable style={[styles.sheet, { paddingBottom: 32 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>{gwLogo}</Text>
            <Text style={{ ...Typ.h3, color: C.text }}>Pay with {gwName}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Text style={{ ...Typ.bodyMedium, fontSize: 13, color: C.textSecondary }}>Rs. {grandTotal.toLocaleString()}</Text>
            </View>
          </View>

          {gwStep === "input" && (
            <>
              <Text style={{ ...Typ.buttonSmall, color: C.text, marginBottom: 8 }}>
                {gwName} Mobile Number
              </Text>
              <View style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 14, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, marginBottom: 16, backgroundColor: C.surfaceSecondary }}>
                <Text style={{ fontSize: 16, color: C.textSecondary, marginRight: 8 }}>{gwLogo}</Text>
                <Text style={{ ...Typ.body, color: C.textSecondary, marginRight: 4 }}>+92</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...Typ.bodyMedium, fontSize: 15, color: gwMobile ? C.text : C.textSecondary, paddingVertical: 14 }}>
                    {gwMobile || "03XX-XXXXXXX"}
                  </Text>
                </View>
              </View>
              <View style={{ gap: 8, marginBottom: 16 }}>
                {numPadRows.map((row, ri) => (
                  <View key={ri} style={{ flexDirection: "row", gap: 8 }}>
                    {row.map((btn, ci) => (
                      <Pressable
                        key={ci}
                        onPress={btn.action}
                        style={{
                          flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center",
                          backgroundColor: btn.isOk ? gwColor : C.surfaceSecondary,
                          borderWidth: 1, borderColor: btn.isOk ? "transparent" : C.border,
                        }}
                      >
                        <Text style={{ ...Typ.title, color: btn.isOk ? C.textInverse : C.text }}>{btn.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
              <Pressable onPress={() => { if (!gwPaying) setShowGwModal(false); }} style={{ marginTop: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ ...Typ.bodyMedium, color: C.textSecondary }}>Cancel</Text>
              </Pressable>
            </>
          )}

          {gwStep === "waiting" && (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator size="large" color={gwColor} />
              <Text style={{ ...Typ.h3, fontSize: 16, color: C.text, marginTop: 20 }}>Payment Processing...</Text>
              <Text style={{ ...Typ.body, fontSize: 13, color: C.textSecondary, marginTop: 8, textAlign: "center" }}>
                {`A ${gwName} notification will be sent to ${gwMobile} — please approve`}
              </Text>
            </View>
          )}

          {gwStep === "done" && (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <Text style={{ fontSize: 48 }}>✅</Text>
              <Text style={{ ...Typ.h3, fontSize: 16, color: C.greenBright, marginTop: 12 }}>Payment Successful!</Text>
              <Text style={{ ...Typ.body, fontSize: 13, color: C.textSecondary, marginTop: 6 }}>Placing your order...</Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  useEffect(() => {
    if (!pendingAck || !ackStuck || orderSuccess) return;
    dismissAck();
    router.replace("/(tabs)/orders");
  }, [pendingAck, ackStuck, orderSuccess]);

  if (pendingAck && !orderSuccess && !ackStuck) {
    return (
      <View style={[styles.container, { backgroundColor: C.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ ...Typ.subtitle, color: C.text, marginTop: 16 }}>Confirming your order…</Text>
        <Text style={{ ...Typ.body, fontSize: 13, color: C.textMuted, marginTop: 6, textAlign: "center", maxWidth: 260 }}>
          Waiting for server confirmation. Please wait.
        </Text>
      </View>
    );
  }

  if (orderSuccess) {
    const methodLabel: Record<string, string> = {
      cash: "Cash on Delivery", wallet: `${appName} Wallet`,
      jazzcash: "JazzCash ✅", easypaisa: "EasyPaisa ✅",
    };
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={styles.successWrap}>
          <LinearGradient colors={[C.emeraldDeep, C.emerald]} style={styles.successCircle}>
            <Ionicons name="checkmark" size={44} color={C.textInverse} />
          </LinearGradient>
          <Text style={styles.successTitle}>Order Placed Successfully!</Text>
          <Text style={styles.successId}>Order #{orderSuccess.id}</Text>
          <Text style={styles.successAddr} numberOfLines={2}>{deliveryLine}</Text>
          <Text style={styles.successEta}>ETA: {orderSuccess.time}</Text>
          <View style={{ backgroundColor: C.greenBg, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 6, borderWidth: 1, borderColor: C.greenBorder }}>
            <Text style={{ ...Typ.buttonSmall, color: C.greenDeep, textAlign: "center" }}>
              Payment: {methodLabel[orderSuccess.payMethod || "cash"] || orderSuccess.payMethod}
            </Text>
          </View>
          <View style={styles.successBtns}>
            <Pressable onPress={() => { clearOrderSuccess(); router.push("/(tabs)/orders"); }} style={styles.trackBtn}>
              <Ionicons name="navigate-outline" size={16} color={C.textInverse} />
              <Text style={styles.trackBtnTxt}>Track Order</Text>
            </Pressable>
            <Pressable onPress={() => { clearOrderSuccess(); router.replace("/(tabs)"); }} style={styles.homeBtn}>
              <Ionicons name="home-outline" size={16} color={C.primary} />
              <Text style={styles.homeBtnTxt}>Home</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }]}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: C.text }]}>Cart</Text>
            <View style={{ width: 34 }} />
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="bag-outline" size={48} color={C.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your Cart is Empty</Text>
          <Text style={styles.emptyText}>Add items from Mart or Food section</Text>
          <View style={styles.emptyBtns}>
            <Pressable onPress={() => router.push("/mart")} style={styles.emptyBtn}>
              <Ionicons name="storefront-outline" size={16} color={C.textInverse} />
              <Text style={styles.emptyBtnText}>Browse Mart</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/food")} style={[styles.emptyBtn, { backgroundColor: C.food }]}>
              <Ionicons name="restaurant-outline" size={16} color={C.textInverse} />
              <Text style={styles.emptyBtnText}>Order Food</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <LinearGradient
        colors={[C.brandBlueDark, C.brandBlue, C.brandBlueMid]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.textInverse} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{cartType === "food" ? "Food Order" : "Mart Order"}</Text>
            <Text style={styles.headerSub}>{items.length} item{items.length !== 1 ? "s" : ""} in cart</Text>
          </View>
          <Pressable onPress={() => setShowClearConfirm(true)} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={14} color={C.textInverse} />
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        </View>

        {showClearConfirm && (
          <View style={styles.clearConfirm}>
            <Text style={styles.clearConfirmTxt}>Remove all items?</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setShowClearConfirm(false)} style={styles.clearNo}>
                <Text style={styles.clearNoTxt}>No</Text>
              </Pressable>
              <Pressable onPress={() => {
                const snapshot = [...items];
                clearCart();
                setShowClearConfirm(false);
                setUndoSnapshot(snapshot);
                setShowUndoClear(true);
                if (undoClearTimerRef.current) clearTimeout(undoClearTimerRef.current);
                undoClearTimerRef.current = setTimeout(() => {
                  setShowUndoClear(false);
                  setUndoSnapshot(null);
                }, 5000);
              }} style={styles.clearYes}>
                <Text style={styles.clearYesTxt}>Yes</Text>
              </Pressable>
            </View>
          </View>
        )}
      </LinearGradient>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Items</Text>
          {items.map(item => (
            <Pressable key={item.productId} onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.productId } })} style={styles.cartItem}>
              <View style={[styles.itemThumb, { backgroundColor: item.type === "food" ? C.amberSoft : C.blueSoft }]}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <Ionicons
                    name={item.type === "food" ? "restaurant-outline" : "basket-outline"}
                    size={20}
                    color={item.type === "food" ? C.amber : C.brandBlue}
                  />
                )}
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.itemUnit}>Rs. {item.price} each</Text>
              </View>
              <View style={styles.qtyControl}>
                <Pressable onPress={(e) => { e?.stopPropagation?.(); updateQuantity(item.productId, item.quantity - 1); }} style={styles.qtyBtn}>
                  <Ionicons name={item.quantity === 1 ? "trash-outline" : "remove"} size={14} color={item.quantity === 1 ? C.danger : C.primary} />
                </Pressable>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <Pressable onPress={(e) => { e?.stopPropagation?.(); updateQuantity(item.productId, item.quantity + 1); }} style={styles.qtyBtn}>
                  <Ionicons name="add" size={14} color={C.primary} />
                </Pressable>
              </View>
              <Text style={styles.itemTotal}>Rs. {item.price * item.quantity}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Pressable
            onPress={() => setShowAddrPicker(true)}
            style={styles.addrCard}
          >
            <View style={styles.addrCardIcon}>
              <Ionicons name="location-outline" size={20} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              {addrLoading ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <>
                  <Text style={styles.addrCardLabel}>
                    {selectedAddr ? selectedAddr.label : T("deliveryAddress")}
                  </Text>
                  <Text style={styles.addrCardValue} numberOfLines={2}>
                    {selectedAddr ? `${selectedAddr.address}, ${selectedAddr.city}` : T("selectAnAddress")}
                  </Text>
                </>
              )}
            </View>
            {addresses.length > 0 && (
              <View style={styles.changeBtn}>
                <Text style={styles.changeBtnText}>Change</Text>
                <Ionicons name="chevron-forward" size={14} color={C.primary} />
              </View>
            )}
          </Pressable>
        </View>

        <View style={[styles.section, styles.etaRow]}>
          <View style={styles.etaIconWrap}>
            <Ionicons name="time-outline" size={16} color={C.success} />
          </View>
          <Text style={styles.etaText}>
            Estimated delivery: {cartType === "food" ? "25–40 min" : "30–50 min"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          {availablePayMethods.filter(m => m.available).map(method => {
            const sel = payMethod === method.id;
            const iconMap: Record<string, any> = {
              cash: "cash-outline", wallet: "wallet-outline",
              jazzcash: "card-outline", easypaisa: "phone-portrait-outline",
            };
            const colorMap: Record<string, { bg: string; tint: string }> = {
              cash: { bg: C.emeraldSoft, tint: C.success },
              wallet: { bg: C.brandBlueSoft, tint: C.primary },
              jazzcash: { bg: C.redSoft, tint: C.red },
              easypaisa: { bg: C.greenLightBg, tint: C.greenBright },
            };
            const clr = colorMap[method.id] || { bg: C.surfaceSecondary, tint: C.textSecondary };
            const isGateway = method.id === "jazzcash" || method.id === "easypaisa";
            return (
              <Pressable
                key={method.id}
                onPress={() => setPayMethod(method.id as PayMethod)}
                style={[styles.payOption, sel && { borderColor: clr.tint, backgroundColor: clr.bg + "33" }]}
              >
                <View style={[styles.payIcon, { backgroundColor: sel ? clr.bg : C.surfaceSecondary }]}>
                  {isGateway
                    ? <Text style={{ fontSize: 18 }}>{method.logo}</Text>
                    : <Ionicons name={iconMap[method.id]} size={20} color={sel ? clr.tint : C.textSecondary} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.payLabel, sel && { color: C.text }]}>{method.label}</Text>
                  </View>
                  {method.id === "wallet" ? (
                    <Text style={[styles.paySub, user && user.walletBalance < grandTotal && { color: C.danger }]}>
                      Balance: Rs. {user?.walletBalance?.toLocaleString() || 0}
                      {user && user.walletBalance < grandTotal ? " (insufficient)" : ""}
                    </Text>
                  ) : (
                    <Text style={styles.paySub}>{method.description}</Text>
                  )}
                </View>
                {isGateway && sel && (
                  <View style={{ backgroundColor: clr.tint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ ...Typ.smallBold, color: C.textInverse }}>Enter No. →</Text>
                  </View>
                )}
                {!isGateway && (
                  <View style={[styles.radio, sel && { borderColor: clr.tint }]}>
                    {sel && <View style={[styles.radioDot, { backgroundColor: clr.tint }]} />}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promo Code</Text>
          <View style={[styles.summaryCard, { padding: 14 }]}>
            {promoApplied ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, backgroundColor: C.emeraldBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 18 }}>🏷️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.emeraldDeep }}>{promoCode}</Text>
                    <Text style={{ ...Typ.caption, color: C.emerald }}>Rs. {promoDiscount.toLocaleString()} discount applied!</Text>
                  </View>
                </View>
                <Pressable onPress={removePromo} style={{ padding: 8 }}>
                  <Ionicons name="close-circle" size={24} color={C.red} />
                </Pressable>
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    value={promoInput}
                    onChangeText={t => { setPromoInput(t.toUpperCase()); setPromoError(null); }}
                    placeholder="Enter promo code"
                    placeholderTextColor={C.textSecondary}
                    autoCapitalize="characters"
                    style={{
                      flex: 1, borderWidth: 1.5, borderColor: promoError ? C.red : C.border,
                      borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
                      fontSize: 14, color: C.text, backgroundColor: C.surfaceSecondary,
                      fontFamily: Font.medium, letterSpacing: 1,
                    }}
                  />
                  <Pressable
                    onPress={applyPromo}
                    disabled={promoLoading || !promoInput.trim()}
                    style={{
                      backgroundColor: promoInput.trim() ? C.primary : C.border,
                      borderRadius: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", minWidth: 72,
                    }}
                  >
                    {promoLoading
                      ? <ActivityIndicator size="small" color={C.textInverse} />
                      : <Text style={{ color: C.textInverse, ...Typ.buttonSmall, fontFamily: Font.bold }}>Apply</Text>
                    }
                  </Pressable>
                </View>
                {promoError && (
                  <Text style={{ ...Typ.caption, color: C.red, marginTop: 6, marginLeft: 2 }}>{promoError}</Text>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</Text>
              <Text style={styles.summaryValue}>Rs. {total.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery Fee</Text>
              <Text style={[styles.summaryValue, deliveryFee === 0 && { color: C.success }]}>
                {deliveryFee === 0 ? "FREE 🎉" : `Rs. ${deliveryFee}`}
              </Text>
            </View>
            {finance.gstEnabled && gstAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>GST ({finance.gstPct}%)</Text>
                <Text style={[styles.summaryValue, { color: C.amber }]}>Rs. {gstAmount.toLocaleString()}</Text>
              </View>
            )}
            {promoDiscount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: C.emerald }]}>🏷️ Promo ({promoCode})</Text>
                <Text style={[styles.summaryValue, { color: C.emerald }]}>- Rs. {promoDiscount.toLocaleString()}</Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.summaryDivider]}>
              <Text style={styles.grandLabel}>Grand Total</Text>
              <Text style={styles.grandValue}>Rs. {grandTotal.toLocaleString()}</Text>
            </View>
            {finance.cashbackEnabled && cashbackAmt > 0 && (
              <View style={{ marginTop: 10, backgroundColor: C.emeraldBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 16 }}>🎁</Text>
                <Text style={{ ...Typ.captionMedium, color: C.emeraldDeep, flex: 1 }}>
                  Earn <Text style={{ fontFamily: Font.bold }}>Rs. {cashbackAmt}</Text> wallet cashback on this order!
                </Text>
              </View>
            )}
            {walletCashbackAmt > 0 && (
              <View style={{ marginTop: 6, backgroundColor: C.blueSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 16 }}>💰</Text>
                <Text style={{ ...Typ.captionMedium, color: C.navyDeep, flex: 1 }}>
                  Wallet bonus: Earn <Text style={{ fontFamily: Font.bold }}>Rs. {walletCashbackAmt}</Text> ({customer.walletCashbackPct}%) back!
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.checkoutBar, { paddingBottom: insets.bottom + 12 }]}>
        <View>
          <Text style={styles.checkoutTotal}>Rs. {grandTotal.toLocaleString()}</Text>
          <Text style={styles.checkoutItems}>{items.reduce((s, i) => s + i.quantity, 0)} items</Text>
        </View>
        {total < orderRules.minOrderAmount ? (
          <View style={styles.minOrderWrap}>
            <Text style={styles.minOrderTxt}>
              Min. Rs.{orderRules.minOrderAmount} — add Rs.{orderRules.minOrderAmount - total} more
            </Text>
            <View style={[styles.minOrderBar]}>
              <View style={[styles.minOrderFill, { width: `${Math.min(100, (total / orderRules.minOrderAmount) * 100)}%` }]} />
            </View>
          </View>
        ) : (
          <Pressable style={[styles.checkoutBtn, (loading || addrLoading || promoLoading) && { opacity: 0.7 }]} onPress={handleCheckout} disabled={loading || addrLoading || promoLoading}>
            {loading ? <ActivityIndicator color={C.textInverse} size="small" /> : promoLoading ? (
              <>
                <ActivityIndicator color={C.textInverse} size="small" />
                <Text style={styles.checkoutBtnTxt}>Validating promo...</Text>
              </>
            ) : (
              <>
                <Text style={styles.checkoutBtnTxt}>Place Order</Text>
                <Ionicons name="arrow-forward" size={18} color={C.textInverse} />
              </>
            )}
          </Pressable>
        )}
      </View>

      <AddressPickerModal
        visible={showAddrPicker}
        addresses={addresses}
        selected={selectedAddrId}
        onSelect={(a) => setSelectedAddrId(a.id)}
        onClose={() => setShowAddrPicker(false)}
        token={token}
        onAddressCreated={(a) => {
          setAddresses(prev => [...prev, a]);
          setSelectedAddrId(a.id);
        }}
      />

      <GatewayModal />

      {showUndoClear && (
        <View style={{ position: "absolute", bottom: 90, left: 16, right: 16, backgroundColor: C.slateDeep, borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, gap: 10, shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 10 }}>
          <Ionicons name="trash-outline" size={18} color={C.textMuted} />
          <Text style={{ flex: 1, ...Typ.bodyMedium, fontSize: 13, color: C.surfaceSecondary }}>Cart cleared</Text>
          <Pressable onPress={() => {
            if (undoSnapshot) {
              restoreCart(undoSnapshot);
            }
            setShowUndoClear(false);
            setUndoSnapshot(null);
            if (undoClearTimerRef.current) clearTimeout(undoClearTimerRef.current);
          }}>
            <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.primary }}>Undo</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight15, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...Typ.title, color: C.textInverse },
  headerSub: { ...Typ.caption, color: C.overlayLight75, marginTop: 2 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.overlayLight15, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  clearText: { ...Typ.captionMedium, color: C.overlayLight90 },
  clearConfirm: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.overlayLight15, borderRadius: 14, padding: 12, marginTop: 10 },
  clearConfirmTxt: { ...Typ.bodyMedium, fontSize: 13, color: C.textInverse },
  clearNo: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: C.overlayLight20 },
  clearNoTxt: { ...Typ.captionMedium, color: C.textInverse },
  clearYes: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: C.red },
  clearYesTxt: { ...Typ.captionBold, color: C.textInverse },

  scroll: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 18 },
  sectionTitle: { ...Typ.h3, fontSize: 16, color: C.text, marginBottom: 12 },

  cartItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: C.surface, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: C.borderLight, shadowColor: C.text, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  itemThumb: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  itemInfo: { flex: 1 },
  itemName: { ...Typ.bodySemiBold, color: C.text, marginBottom: 3 },
  itemUnit: { ...Typ.caption, color: C.textMuted },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceSecondary, borderRadius: 12, paddingHorizontal: 4, paddingVertical: 4 },
  qtyBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  qtyText: { ...Typ.button, fontFamily: Font.bold, color: C.text, minWidth: 20, textAlign: "center" },
  itemTotal: { ...Typ.button, fontFamily: Font.bold, color: C.text, minWidth: 60, textAlign: "right" },

  addrCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, borderColor: C.border },
  addrCardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.blueSoft, alignItems: "center", justifyContent: "center" },
  addrCardLabel: { ...Typ.bodySemiBold, color: C.text },
  addrCardValue: { ...Typ.caption, color: C.textMuted, marginTop: 2 },
  changeBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  changeBtnText: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.primary },

  etaRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.greenBg, marginHorizontal: 16, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.greenBorder },
  etaIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.emeraldSoft, alignItems: "center", justifyContent: "center" },
  etaText: { ...Typ.bodyMedium, fontSize: 13, color: C.emeraldDeep, flex: 1 },

  payOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: C.surface, borderRadius: 16, marginBottom: 8, borderWidth: 1.5, borderColor: C.border },
  payIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  payLabel: { ...Typ.bodySemiBold, color: C.textSecondary },
  paySub: { ...Typ.caption, color: C.textMuted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6 },

  summaryCard: { backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  summaryLabel: { ...Typ.body, fontSize: 13, color: C.textSecondary },
  summaryValue: { ...Typ.buttonSmall, color: C.text },
  summaryDivider: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 4 },
  grandLabel: { ...Typ.h3, fontSize: 16, color: C.text },
  grandValue: { ...Typ.h3, color: C.primary },

  checkoutBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, shadowColor: C.text, shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  checkoutTotal: { ...Typ.title, color: C.text },
  checkoutItems: { ...Typ.caption, color: C.textMuted },
  checkoutBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 15, borderRadius: 16, shadowColor: C.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  checkoutBtnTxt: { ...Typ.button, fontFamily: Font.bold, color: C.textInverse },
  minOrderWrap: { flex: 1, marginLeft: 16, gap: 6 },
  minOrderTxt: { ...Typ.captionMedium, color: C.amber },
  minOrderBar: { height: 6, backgroundColor: C.amberSoft, borderRadius: 3, overflow: "hidden" as const },
  minOrderFill: { height: 6, backgroundColor: C.gold, borderRadius: 3 },

  overlay: { flex: 1, backgroundColor: C.overlayDark50, justifyContent: "flex-end" },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
  handle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginBottom: 18 },
  sheetTitle: { ...Typ.h3, color: C.text, marginBottom: 16 },

  addrOpt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, marginBottom: 8 },
  addrOptSel: { borderColor: C.primary, backgroundColor: C.blueSoft },
  addrOptIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  addrOptLabel: { ...Typ.bodySemiBold, color: C.text },
  addrOptAddress: { ...Typ.caption, color: C.textMuted, marginTop: 2 },
  addrOptCity: { ...Typ.small, color: C.textMuted },
  defaultTag: { backgroundColor: C.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  defaultTagText: { ...Typ.tiny, fontSize: 9, color: C.textInverse },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  cancelBtnText: { ...Typ.bodyMedium, color: C.textSecondary },

  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  successCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { ...Typ.h2, color: C.text, marginBottom: 8, textAlign: "center" },
  successId: { ...Typ.subtitle, color: C.primary, marginBottom: 4 },
  successAddr: { ...Typ.body, fontSize: 13, color: C.textMuted, textAlign: "center", marginBottom: 4 },
  successEta: { ...Typ.bodySemiBold, color: C.success, marginBottom: 6 },
  successBtns: { flexDirection: "row", gap: 12, marginTop: 20, width: "100%" },
  trackBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.primary, borderRadius: 16, paddingVertical: 15, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  trackBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },
  homeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.blueSoft, borderRadius: 16, paddingVertical: 15 },
  homeBtnTxt: { ...Typ.bodySemiBold, color: C.primary },

  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyIconBox: { width: 88, height: 88, borderRadius: 28, backgroundColor: C.blueSoft, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle: { ...Typ.title, color: C.text, marginBottom: 8 },
  emptyText: { ...Typ.body, color: C.textSecondary, marginBottom: 20 },
  emptyBtns: { flexDirection: "row", gap: 12 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  emptyBtnText: { ...Typ.buttonSmall, color: C.textInverse },
});
