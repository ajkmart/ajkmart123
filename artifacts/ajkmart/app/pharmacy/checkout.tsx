import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { createLogger } from "@/utils/logger";
import { buildPhoneValidator } from "@/utils/phone";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { createPharmacyOrder } from "@workspace/api-client-react";
import type { CreatePharmacyOrderRequest } from "@workspace/api-client-react";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

const log = createLogger("[PharmacyCheckout]");

type Step = "review" | "address" | "payment" | "done";

const PAYMENT_OPTIONS = [
  { key: "cash", label: T("cashOnDelivery"), icon: "cash-outline" as const },
  { key: "wallet", label: T("walletBalanceLabel"), icon: "wallet-outline" as const },
];

export default function PharmacyCheckoutScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { vendorId, rxPhotoUri } = useLocalSearchParams<{ vendorId?: string; rxPhotoUri?: string }>();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { items, clearCart } = useCart();
  const { showToast } = useToast();
  const { config } = usePlatformConfig();
  const validatePhone = buildPhoneValidator(config.regional?.phoneFormat);

  const [step, setStep] = useState<Step>("review");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [contactPhone, setContactPhone] = useState(user?.phone ?? "");
  const [prescriptionNote, setPrescriptionNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "wallet">("cash");
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const pharmacyItems = useMemo(() => items.filter(i => i.type === "pharmacy"), [items]);
  const subtotal = pharmacyItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = config.deliveryFee.pharmacy ?? config.deliveryFee.food ?? 50;
  const grandTotal = subtotal + deliveryFee;

  const STEP_LABELS: Record<Step, string> = {
    review: "Review Cart",
    address: T("deliveryDetails"),
    payment: T("payment"),
    done: "Order Placed",
  };

  const goBack = () => {
    if (step === "review") { router.back(); return; }
    if (step === "address") { setStep("review"); return; }
    if (step === "payment") { setStep("address"); return; }
  };

  const handlePlaceOrder = async () => {
    if (!deliveryAddress.trim() || deliveryAddress.trim().length < 8) {
      showToast("Please enter a valid delivery address (at least 8 characters)", "error");
      return;
    }
    if (!validatePhone(contactPhone)) {
      showToast("Please enter a valid Pakistani phone number", "error");
      return;
    }
    if (pharmacyItems.length === 0) {
      showToast(T("cartEmpty"), "error");
      return;
    }
    setLoading(true);
    try {
      const result = await createPharmacyOrder({
        items: pharmacyItems.map(i => ({ name: i.name, quantity: i.quantity, productId: i.productId, price: i.price })),
        deliveryAddress: deliveryAddress.trim(),
        paymentMethod: paymentMethod as "cash" | "wallet",
        contactPhone,
        ...(prescriptionNote.trim() ? { prescriptionNote: prescriptionNote.trim() } : {}),
        ...(rxPhotoUri ? { prescriptionPhotoUri: rxPhotoUri } : {}),
      } as CreatePharmacyOrderRequest & { contactPhone?: string; prescriptionNote?: string; prescriptionPhotoUri?: string },
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      setOrderId(result.id ?? null);
      clearCart();
      setStep("done");
    } catch (e: unknown) {
      log.error("Pharmacy order failed:", e instanceof Error ? e.message : String(e));
      showToast(e instanceof Error ? e.message : "Order failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (step === "done") {
    return (
      <View style={[s.doneContainer, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
        <View style={s.doneCircle}>
          <Ionicons name="checkmark" size={48} color="#fff" />
        </View>
        <Text style={s.doneTitle}>Order Placed!</Text>
        <Text style={s.doneSub}>Your pharmacy order has been received. You'll receive updates on your order status.</Text>
        {orderId && <Text style={s.doneOrderId}>Order #{orderId.slice(-8).toUpperCase()}</Text>}
        <TouchableOpacity activeOpacity={0.8} style={s.doneBtn} onPress={() => router.replace("/(tabs)/orders")}>
          <Text style={s.doneBtnTxt}>View My Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} style={s.doneBtnSecondary} onPress={() => router.replace("/pharmacy")}>
          <Text style={s.doneBtnSecondaryTxt}>Continue Shopping</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <TouchableOpacity activeOpacity={0.8} onPress={goBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={s.topTitle}>{STEP_LABELS[step]}</Text>
        </View>

        <View style={s.stepBar}>
          {(["review", "address", "payment"] as Step[]).map((st, i) => (
            <View key={st} style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={[s.stepDot, (step === st || (step === "payment" && i < 2) || (step === "address" && i < 1)) && s.stepDotActive]}>
                <Text style={[s.stepDotTxt, (step === st || (step === "payment" && i < 2) || (step === "address" && i < 1)) && s.stepDotTxtActive]}>{i + 1}</Text>
              </View>
              {i < 2 && <View style={[s.stepLine, (step === "address" && i < 1) || step === "payment" ? s.stepLineActive : null]} />}
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {step === "review" && (
            <View>
              <Text style={s.sectionTitle}>Items in Cart</Text>
              {pharmacyItems.length === 0 ? (
                <View style={s.emptyCart}>
                  <Ionicons name="cart-outline" size={40} color={C.border} />
                  <Text style={s.emptyCartTxt}>No pharmacy items in cart</Text>
                  <TouchableOpacity style={s.emptyCartBtn} onPress={() => router.back()}>
                    <Text style={s.emptyCartBtnTxt}>Go Back</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                pharmacyItems.map(item => (
                  <View key={item.productId} style={s.cartRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.cartItemQty}>Qty: {item.quantity}</Text>
                    </View>
                    <Text style={s.cartItemPrice}>Rs. {(item.price * item.quantity).toLocaleString()}</Text>
                  </View>
                ))
              )}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12, marginTop: 12 }}>
                <Ionicons name="information-circle-outline" size={18} color="#92400E" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 }}>
                  {"Some items may require a valid prescription. Please have it ready for the delivery rider."}
                  {rxPhotoUri ? " Your prescription has been attached." : " You can upload a prescription on the next step."}
                </Text>
              </View>
              <View style={s.divider} />
              <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalVal}>Rs. {subtotal.toLocaleString()}</Text></View>
              <View style={s.totalRow}><Text style={s.totalLabel}>Delivery Fee</Text><Text style={s.totalVal}>Rs. {deliveryFee}</Text></View>
              <View style={[s.totalRow, s.grandTotalRow]}><Text style={s.grandTotalLabel}>Grand Total</Text><Text style={s.grandTotalVal}>Rs. {grandTotal.toLocaleString()}</Text></View>
            </View>
          )}

          {step === "address" && (
            <View>
              <Text style={s.sectionTitle}>{T("deliveryDetails")}</Text>
              <Text style={s.fieldLabel}>Delivery Address *</Text>
              <TextInput
                style={s.input}
                value={deliveryAddress}
                onChangeText={setDeliveryAddress}
                placeholder="Enter your complete delivery address"
                placeholderTextColor={C.textSecondary}
                multiline
                numberOfLines={3}
                accessibilityLabel="Delivery address"
              />
              <Text style={s.fieldLabel}>Contact Phone *</Text>
              <TextInput
                style={s.input}
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="03001234567"
                placeholderTextColor={C.textSecondary}
                keyboardType="phone-pad"
                accessibilityLabel="Contact phone number"
              />
              <Text style={s.fieldLabel}>Prescription Note (optional)</Text>
              <TextInput
                style={s.input}
                value={prescriptionNote}
                onChangeText={setPrescriptionNote}
                placeholder="Any notes about your prescription or medicines..."
                placeholderTextColor={C.textSecondary}
                multiline
                numberOfLines={3}
                accessibilityLabel="Prescription note"
              />
              {rxPhotoUri && (
                <View style={s.rxConfirm}>
                  <Ionicons name="document-attach-outline" size={16} color={C.purple} />
                  <Text style={s.rxConfirmTxt}>Prescription uploaded</Text>
                </View>
              )}
            </View>
          )}

          {step === "payment" && (
            <View>
              <Text style={s.sectionTitle}>Select Payment Method</Text>
              {PAYMENT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  activeOpacity={0.8}
                  style={[s.payOption, paymentMethod === opt.key && s.payOptionActive]}
                  onPress={() => setPaymentMethod(opt.key as "cash" | "wallet")}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: paymentMethod === opt.key }}
                >
                  <Ionicons name={opt.icon} size={22} color={paymentMethod === opt.key ? C.purple : C.textSecondary} />
                  <Text style={[s.payOptionLabel, paymentMethod === opt.key && s.payOptionLabelActive]}>{opt.label}</Text>
                  {paymentMethod === opt.key && <Ionicons name="checkmark-circle" size={20} color={C.purple} />}
                </TouchableOpacity>
              ))}
              <View style={s.divider} />
              <View style={s.summaryBox}>
                <Text style={s.summaryTitle}>Order Summary</Text>
                <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalVal}>Rs. {subtotal.toLocaleString()}</Text></View>
                <View style={s.totalRow}><Text style={s.totalLabel}>Delivery</Text><Text style={s.totalVal}>Rs. {deliveryFee}</Text></View>
                <View style={[s.totalRow, s.grandTotalRow]}><Text style={s.grandTotalLabel}>Total</Text><Text style={s.grandTotalVal}>Rs. {grandTotal.toLocaleString()}</Text></View>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[s.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
          {step === "review" && (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[s.primaryBtn, pharmacyItems.length === 0 && s.primaryBtnDisabled]}
              onPress={() => { if (pharmacyItems.length > 0) setStep("address"); }}
              disabled={pharmacyItems.length === 0}
            >
              <Text style={s.primaryBtnTxt}>Continue to Delivery</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          {step === "address" && (
            <TouchableOpacity
              activeOpacity={0.8}
              style={s.primaryBtn}
              onPress={() => {
                if (!deliveryAddress.trim() || deliveryAddress.trim().length < 8) {
                  showToast("Please enter a complete delivery address", "error");
                  return;
                }
                if (!validatePhone(contactPhone)) {
                  showToast("Please enter a valid phone number", "error");
                  return;
                }
                setStep("payment");
              }}
            >
              <Text style={s.primaryBtnTxt}>Continue to Payment</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          {step === "payment" && (
            <TouchableOpacity activeOpacity={0.8} style={[s.primaryBtn, loading && s.primaryBtnDisabled]} onPress={handlePlaceOrder} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Text style={s.primaryBtnTxt}>Place Order • Rs. {grandTotal.toLocaleString()}</Text>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" },
    topTitle: { fontSize: 17, fontWeight: "700", color: C.text },
    stepBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, backgroundColor: C.surface, paddingHorizontal: 24 },
    stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.border, alignItems: "center", justifyContent: "center" },
    stepDotActive: { backgroundColor: C.purple },
    stepDotTxt: { fontSize: 13, fontWeight: "700", color: C.textSecondary },
    stepDotTxtActive: { color: "#fff" },
    stepLine: { width: 48, height: 2, backgroundColor: C.border },
    stepLineActive: { backgroundColor: C.purple },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 14 },
    cartRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    cartItemName: { fontSize: 14, fontWeight: "600", color: C.text },
    cartItemQty: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    cartItemPrice: { fontSize: 14, fontWeight: "700", color: C.purple },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    totalLabel: { fontSize: 14, color: C.textSecondary },
    totalVal: { fontSize: 14, color: C.text, fontWeight: "600" },
    grandTotalRow: { marginTop: 4 },
    grandTotalLabel: { fontSize: 16, fontWeight: "700", color: C.text },
    grandTotalVal: { fontSize: 16, fontWeight: "700", color: C.purple },
    fieldLabel: { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 6, marginTop: 14 },
    input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.text, textAlignVertical: "top" },
    rxConfirm: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EDE9FE", padding: 10, borderRadius: 8, marginTop: 12 },
    rxConfirmTxt: { fontSize: 13, color: C.purple, fontWeight: "600" },
    payOption: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, marginBottom: 10 },
    payOptionActive: { borderColor: C.purple, backgroundColor: "#F5F3FF" },
    payOptionLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: C.textSecondary },
    payOptionLabelActive: { color: C.purple },
    summaryBox: { backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
    summaryTitle: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 10 },
    emptyCart: { alignItems: "center", padding: 32, gap: 12 },
    emptyCartTxt: { fontSize: 15, color: C.textSecondary },
    emptyCartBtn: { backgroundColor: C.purple, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
    emptyCartBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
    bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.purple, paddingVertical: 14, borderRadius: 12 },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },
    doneContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: C.background, gap: 16 },
    doneCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.purple, alignItems: "center", justifyContent: "center" },
    doneTitle: { fontSize: 26, fontWeight: "800", color: C.text },
    doneSub: { fontSize: 15, color: C.textSecondary, textAlign: "center", lineHeight: 22 },
    doneOrderId: { fontSize: 13, fontWeight: "700", color: C.purple, backgroundColor: "#EDE9FE", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
    doneBtn: { backgroundColor: C.purple, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, width: "100%", alignItems: "center" },
    doneBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
    doneBtnSecondary: { borderWidth: 1, borderColor: C.border, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, width: "100%", alignItems: "center" },
    doneBtnSecondaryTxt: { color: C.text, fontSize: 15, fontWeight: "600" },
  });
}