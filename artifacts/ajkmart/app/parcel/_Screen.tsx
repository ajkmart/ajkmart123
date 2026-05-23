import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { createLogger } from "@/utils/logger";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useMapsAutocomplete, resolveLocation } from "@/hooks/useMaps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { PermissionGuide } from "@/components/PermissionGuide";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
const T = (key: TranslationKey) => tDual(key, "en");
import { estimateParcel, createParcelBooking } from "@workspace/api-client-react";
import type { CreateParcelBookingRequest } from "@workspace/api-client-react";
import { normalizePhone, isValidPakistaniPhone, buildPhoneValidator } from "@/utils/phone";
import { AuthGateSheet, useAuthGate } from "@/components/AuthGateSheet";
const log = createLogger("[Parcel]");


interface ParcelType {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  baseFare: number;
}


const PARCEL_TYPE_DEFS: Omit<ParcelType, "baseFare">[] = [
  { id: "document",    label: "Document",    emoji: "📄", desc: "Papers, certificates, files" },
  { id: "clothes",     label: "Clothes",     emoji: "👕", desc: "Garments, accessories" },
  { id: "electronics", label: "Electronics", emoji: "📱", desc: "Phones, gadgets, devices" },
  { id: "food",        label: "Food/Gift",   emoji: "🎁", desc: "Packed food, gift items" },
  { id: "other",       label: T("other"),       emoji: "📦", desc: "Any other parcel" },
];

const steps = ["Sender", "Receiver", T("parcel"), T("payment")];

function Steps({ current, labels }: { current: number; labels: string[] }) {
  const { colors: C } = useTheme();
  const ss = useMemo(() => makeStepsStyles(C), [C]);
  return (
    <View style={ss.steps}>
      {labels.map((lbl, i) => (
        <React.Fragment key={lbl}>
          <View style={ss.stepItem}>
            <View style={[ss.stepDot, i <= current && ss.stepDotActive]}>
              {i < current ? (
                <Ionicons name="checkmark" size={12} color={C.textInverse} />
              ) : (
                <Text style={[ss.stepNum, i === current && { color: C.textInverse }]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[ss.stepLbl, i === current && { color: C.goldSoft }]}>{lbl}</Text>
          </View>
          {i < steps.length - 1 && <View style={[ss.stepLine, i < current && ss.stepLineActive]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const PARCEL_DRAFT_KEY = "parcel_wizard_draft";

function ParcelScreenInner() {
  const { colors: C } = useTheme();
  const ss = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const topPad = Math.max(insets.top, 12);
  const { prefillPickup: pPickup, prefillDrop: pDrop, prefillType: pType } = useLocalSearchParams<{ prefillPickup?: string; prefillDrop?: string; prefillType?: string }>();
  const { user, updateUser, token } = useAuth();
  const { requireAuth, sheetProps: authSheetProps } = useAuthGate();
  const { showToast } = useToast();
  const { config: platformConfig } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const validatePhone = buildPhoneValidator(platformConfig.regional?.phoneFormat);
  const appName = platformConfig.platform.appName;
  const inMaintenance = platformConfig.appStatus === "maintenance";
  const parcelEnabled = platformConfig.features.parcel;

  const PARCEL_TYPES: Omit<ParcelType, "baseFare">[] = PARCEL_TYPE_DEFS;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedId, setConfirmedId] = useState("");
  const [confirmedFare, setConfirmedFare] = useState(0);
  const [showLocPicker, setShowLocPicker] = useState<"pickup" | "drop" | null>(null);
  const [locSearch,     setLocSearch]     = useState("");
  const { predictions, loading: locLoading } = useMapsAutocomplete(locSearch);

  const [senderName, setSenderName] = useState(user?.name || "");
  const [senderPhone, setSenderPhone] = useState(user?.phone || "");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState<number | undefined>(undefined);
  const [pickupLng, setPickupLng] = useState<number | undefined>(undefined);

  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [dropAddress, setDropAddress] = useState("");
  const [dropLat, setDropLat] = useState<number | undefined>(undefined);
  const [dropLng, setDropLng] = useState<number | undefined>(undefined);
  const [geoError, setGeoError] = useState<"pickup" | "drop" | null>(null);

  const [parcelType, setParcelType] = useState<string>("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [description, setDescription] = useState("");

  const VOLUMETRIC_DIVISOR = 5000;
  const volumetricWeight = (parseFloat(length) || 0) * (parseFloat(width) || 0) * (parseFloat(height) || 0) / VOLUMETRIC_DIVISOR;
  const actualWeight = parseFloat(weight) || 0;
  const chargeableWeight = Math.max(actualWeight, volumetricWeight);

  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payMethods, setPayMethods] = useState<{ id: string; label: string; logo: string; description: string }[]>([
    { id: "cash", label: "Cash on Pickup", logo: "💵", description: "" },
  ]);
  const [payMethodsError, setPayMethodsError] = useState(false);

  const [estimatedFare, setEstimatedFare] = useState<number | null>(null);
  const [fareError, setFareError] = useState(false);
  const [permGuideType, setPermGuideType] = useState<"camera" | "gallery" | "location" | "notification" | "microphone">("location");
  const [permGuideVisible, setPermGuideVisible] = useState(false);
  const [fareLoading, setFareLoading] = useState(false);

  const selectedType = PARCEL_TYPES.find(t => t.id === parcelType);

  const hasPrefill = !!(pPickup || pDrop || pType);

  useEffect(() => {
    if (!hasPrefill) return;
    AsyncStorage.removeItem(PARCEL_DRAFT_KEY).catch((err: unknown) => { log.error("removeItem failed:", err); });
    if (pPickup) setPickupAddress(pPickup);
    if (pDrop) setDropAddress(pDrop);
    if (pType) setParcelType(pType);
  }, []);

  useEffect(() => {
    if (hasPrefill) return;
    let cancelled = false;
    AsyncStorage.getItem(PARCEL_DRAFT_KEY)
      .then(async raw => {
        if (cancelled) return;
        if (raw) {
          let d: any;
          try {
            d = JSON.parse(raw);
          } catch {
            // eslint-disable-next-line ajk-local/no-silent-catch -- clearing corrupt parcel draft is non-critical
            AsyncStorage.removeItem(PARCEL_DRAFT_KEY).catch(() => {});
            d = null;
          }
          if (d) {
          if (d.senderName)    setSenderName(d.senderName);
          if (d.senderPhone)   setSenderPhone(d.senderPhone);
          if (d.pickupAddress) setPickupAddress(d.pickupAddress);
          if (d.receiverName)  setReceiverName(d.receiverName);
          if (d.receiverPhone) setReceiverPhone(d.receiverPhone);
          if (d.dropAddress)   setDropAddress(d.dropAddress);
          if (d.parcelType)    setParcelType(d.parcelType);
          if (d.weight)        setWeight(d.weight);
          if (d.description)   setDescription(d.description);
          if (d.step !== undefined) setStep(d.step);
          if (d.pickupAddress) return;
          }
        }
        /* Auto-fill pickup from current GPS */
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            setPermGuideType("location"); setPermGuideVisible(true);
            return;
          }
          if (cancelled) return;
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (cancelled) return;
          const { latitude: lat, longitude: lng } = pos.coords;
          let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          try {
            const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
            const geoRes = await fetch(`${API_BASE}/maps/geocode?address=${lat},${lng}`);
            if (geoRes.ok) {
              const geoData = await geoRes.json() as { formattedAddress?: string };
              if (geoData?.formattedAddress) address = geoData.formattedAddress;
            }
          } catch (geoErr) {
            log.warn("Reverse geocode failed:", geoErr instanceof Error ? geoErr.message : String(geoErr));
          }
          if (cancelled) return;
          setPickupAddress(address);
        } catch (locErr) {
          log.error("GPS auto-fill failed:", locErr instanceof Error ? locErr.message : String(locErr));
          showToast("Could not detect your location. Please enter pickup address manually.", "error");
        }
      })
      .catch((err: unknown) => {
        log.error("Location init effect error:", err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, []);

  // Persist wizard draft to AsyncStorage whenever key fields change
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (confirmed) {
      AsyncStorage.removeItem(PARCEL_DRAFT_KEY).catch((err) => { log.warn("Failed to clear draft:", err instanceof Error ? err.message : String(err)); });
      return;
    }
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(PARCEL_DRAFT_KEY, JSON.stringify({
        senderName, senderPhone, pickupAddress,
        receiverName, receiverPhone, dropAddress,
        parcelType, weight, description, step,
      })).catch((err) => { log.warn("Failed to save draft:", err instanceof Error ? err.message : String(err)); });
    }, 500);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [senderName, senderPhone, pickupAddress, receiverName, receiverPhone, dropAddress, parcelType, weight, description, step, confirmed]);

  useEffect(() => {
    /* Fetch payment methods filtered to parcel service */
    const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
    fetch(`${API_BASE}/payments/methods?serviceType=parcel`)
      .then(r => r.json())
      .then((json: any) => {
        const methods: { id: string; label: string; logo?: string; description?: string }[] =
          json?.data?.methods ?? json?.methods ?? [];
        if (methods.length) {
          setPayMethodsError(false);
          setPayMethods(methods.map(m => ({ id: m.id, label: m.label, logo: m.logo ?? "", description: m.description ?? "" })));
          setPayMethod(methods[0]?.id ?? "cash");
        }
      })
      .catch((err) => {
        log.warn("Payment methods fetch failed:", err instanceof Error ? err.message : String(err));
        setPayMethodsError(true);
      });
  }, []);

  const retryFareEstimate = () => {
    if (!parcelType) return;
    setFareLoading(true);
    setFareError(false);
    estimateParcel({ parcelType, weight: chargeableWeight > 0 ? chargeableWeight : undefined })
      .then(data => {
        if (data.fare != null) { setEstimatedFare(Number(data.fare)); setFareError(false); }
        else { setFareError(true); setEstimatedFare(null); }
      })
      .catch(() => { setFareError(true); setEstimatedFare(null); })
      .finally(() => setFareLoading(false));
  };

  useEffect(() => {
    if (!parcelType) { setEstimatedFare(null); setFareError(false); return; }
    setFareLoading(true);
    setFareError(false);
    estimateParcel({ parcelType, weight: chargeableWeight > 0 ? chargeableWeight : undefined })
      .then(data => {
        if (data.fare != null) { setEstimatedFare(Number(data.fare)); setFareError(false); }
        else { setFareError(true); setEstimatedFare(null); }
      })
      .catch(() => { setFareError(true); setEstimatedFare(null); })
      .finally(() => setFareLoading(false));
  }, [parcelType, chargeableWeight]);

  const validateStep = (s: number): boolean => {
    if (s === 0) {
      if (!senderName.trim()) { showToast(T("enterFullName"), "error"); return false; }
      if (!senderPhone.trim()) { showToast(T("enterPhoneNumber"), "error"); return false; }
      if (!validatePhone(senderPhone)) { showToast(T("invalidPhoneNumber"), "error"); return false; }
      if (!pickupAddress.trim()) { showToast(T("pickupAddress"), "error"); return false; }
    }
    if (s === 1) {
      if (!receiverName.trim()) { showToast(T("enterFullName"), "error"); return false; }
      if (!receiverPhone.trim()) { showToast(T("enterPhoneNumber"), "error"); return false; }
      if (!validatePhone(receiverPhone)) { showToast(T("invalidPhoneNumber"), "error"); return false; }
      if (!dropAddress.trim()) { showToast(T("dropAddress"), "error"); return false; }
    }
    if (s === 2) {
      if (!parcelType) { showToast(T("parcelType"), "error"); return false; }
    }
    return true;
  };

  const next = () => {
    if (validateStep(step)) setStep(s => s + 1);
  };
  const prev = () => setStep(s => s - 1);

  const bookParcel = () => {
    requireAuth(
      () => doBookParcel(),
      { message: "Sign in to book a parcel delivery", returnTo: "/parcel" },
    );
  };

  const parcelSubmittingRef = useRef(false);
  const doBookParcel = async () => {
    if (parcelSubmittingRef.current) return;
    parcelSubmittingRef.current = true;
    setLoading(true);
    try {
      // Geocode any manually-typed addresses that don't have coordinates yet
      let finalPickupLat = pickupLat;
      let finalPickupLng = pickupLng;
      let finalDropLat   = dropLat;
      let finalDropLng   = dropLng;

      const GEOCODE_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
      /* Try to resolve coordinates — best-effort, NOT a hard block.
         Coordinates are optional on the backend (only used for geofencing). */
      let pickupGeoFailed = false;
      let dropGeoFailed = false;
      if (finalPickupLat === undefined || finalPickupLng === undefined) {
        try {
          const geoRes = await fetch(`${GEOCODE_BASE}/maps/geocode?address=${encodeURIComponent(pickupAddress)}`);
          const geo = await geoRes.json();
          if (geo?.lat && geo?.lng) { finalPickupLat = geo.lat; finalPickupLng = geo.lng; }
          else { pickupGeoFailed = true; log.warn("Pickup geocode returned no coords"); }
        } catch (err) {
          pickupGeoFailed = true;
          log.warn("Pickup geocode failed:", err instanceof Error ? err.message : String(err));
        }
      }
      if (finalDropLat === undefined || finalDropLng === undefined) {
        try {
          const geoRes = await fetch(`${GEOCODE_BASE}/maps/geocode?address=${encodeURIComponent(dropAddress)}`);
          const geo = await geoRes.json();
          if (geo?.lat && geo?.lng) { finalDropLat = geo.lat; finalDropLng = geo.lng; }
          else { dropGeoFailed = true; log.warn("Drop geocode returned no coords"); }
        } catch (err) {
          dropGeoFailed = true;
          log.warn("Drop geocode failed:", err instanceof Error ? err.message : String(err));
        }
      }
      /* If geocoding failed and we still have no coordinates, show a specific error
         so the user knows the address could not be located — they should try selecting
         from the map/autocomplete picker instead of typing manually. */
      if (pickupGeoFailed && finalPickupLat === undefined) {
        showToast("Could not locate your pickup address. Please select it from the map or use a more specific address.", "error");
        setLoading(false);
        parcelSubmittingRef.current = false;
        return;
      }
      if (dropGeoFailed && finalDropLat === undefined) {
        showToast("Could not locate the drop-off address. Please select it from the map or use a more specific address.", "error");
        setLoading(false);
        parcelSubmittingRef.current = false;
        return;
      }
      setGeoError(null);

      if (
        finalPickupLat !== undefined && finalPickupLng !== undefined &&
        finalDropLat   !== undefined && finalDropLng   !== undefined &&
        Math.abs(finalPickupLat - finalDropLat) < 0.0001 &&
        Math.abs(finalPickupLng - finalDropLng) < 0.0001
      ) {
        showToast(T("sameLocationError"), "error");
        setLoading(false);
        return;
      }
      if (
        (finalPickupLat === undefined || finalDropLat === undefined) &&
        pickupAddress.trim().toLowerCase() === dropAddress.trim().toLowerCase()
      ) {
        showToast(T("sameLocationError"), "error");
        setLoading(false);
        return;
      }

      const w = chargeableWeight > 0 ? chargeableWeight : (parseFloat(weight) || undefined);
      if (!parcelType) {
        showToast("Please select a parcel type", "error");
        setLoading(false);
        return;
      }
      const payload: CreateParcelBookingRequest = {
        senderName, senderPhone: normalizePhone(senderPhone), pickupAddress,
        receiverName, receiverPhone: normalizePhone(receiverPhone), dropAddress,
        parcelType: parcelType ?? "", weight: w,
        description: description || undefined,
        paymentMethod: payMethod as CreateParcelBookingRequest["paymentMethod"],
        ...(finalPickupLat !== undefined && finalPickupLng !== undefined ? { pickupLat: finalPickupLat, pickupLng: finalPickupLng } : {}),
        ...(finalDropLat !== undefined && finalDropLng !== undefined ? { dropLat: finalDropLat, dropLng: finalDropLng } : {}),
      };
      const data = await createParcelBooking(payload);
      if (payMethod === "wallet" && user) {
        updateUser({ walletBalance: Number(user.walletBalance ?? 0) - Number(data.fare) });
      }
      setConfirmedId(data.id);
      setConfirmedFare(Number(data.fare));
      setConfirmed(true);
    } catch (err: unknown) {
      const errMsg = (err as { message?: string })?.message;
      showToast(errMsg || T("couldNotBookParcel"), "error");
    } finally {
      parcelSubmittingRef.current = false;
      setLoading(false);
    }
  };

  if (!parcelEnabled) {
    return (
      <View style={[ss.root, { justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={{ position: "absolute", top: topPad + 12, left: 16 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={[ss.confirmCard, { borderColor: C.redSoft }]}>
          <Text style={{ fontSize: 52 }}>🚫</Text>
          <Text style={[ss.confirmTitle, { color: C.redBright }]}>{T("serviceUnavailable")}</Text>
          <Text style={ss.confirmSub}>{T("maintenanceApology")}</Text>
          <TouchableOpacity activeOpacity={0.7} style={[ss.doneBtn, { backgroundColor: C.redBg, width: "100%" }]} onPress={goBack}>
            <Text style={[ss.doneBtnTxt, { color: C.redBright }]}>{T("backToHome")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (inMaintenance) {
    return (
      <View style={[ss.root, { justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <View style={[ss.confirmCard, { borderColor: C.amberSoft }]}>
          <Text style={{ fontSize: 52 }}>🔧</Text>
          <Text style={[ss.confirmTitle, { color: C.amber }]}>{T("underMaintenance")}</Text>
          <Text style={ss.confirmSub}>{platformConfig.content.maintenanceMsg}</Text>
          <Text style={{ ...Typ.caption, color: C.textMuted, textAlign: "center", marginTop: 8 }}>
            {T("maintenanceApology")}
          </Text>
        </View>
      </View>
    );
  }

  if (confirmed) {
    return (
      <View style={[ss.root, { justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }]}>
        <View style={ss.confirmCard}>
          <LinearGradient colors={[C.amber, C.gold]} style={ss.confirmIconCircle}>
            <Ionicons name="checkmark" size={36} color={C.textInverse} />
          </LinearGradient>
          <Text style={ss.confirmTitle}>{T("parcelBooked")}</Text>
          <Text style={ss.confirmSub}>
            Booking #{confirmedId.slice(-6).toUpperCase()}{"\n"}
            {T("estimatedDeliveryTime")}
          </Text>
          <View style={ss.confirmRow}>
            <View style={ss.confirmInfoBox}>
              <Text style={ss.confirmInfoLbl}>{T("pickup")}</Text>
              <Text style={ss.confirmInfoVal} numberOfLines={2}>{pickupAddress}</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={C.textMuted} />
            <View style={ss.confirmInfoBox}>
              <Text style={ss.confirmInfoLbl}>{T("dropOff")}</Text>
              <Text style={ss.confirmInfoVal} numberOfLines={2}>{dropAddress}</Text>
            </View>
          </View>
          <View style={ss.fareBox}>
            <Text style={ss.fareLbl}>{T("totalFare")}</Text>
            <Text style={ss.fareVal}>Rs. {confirmedFare.toLocaleString()}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
            <TouchableOpacity activeOpacity={0.7} style={[ss.doneBtn, { flex: 1, backgroundColor: C.greenBg }]} onPress={() => { setConfirmed(false); router.push("/(tabs)"); }}>
              <Text style={[ss.doneBtnTxt, { color: C.emerald }]}>{T("home")}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} style={[ss.doneBtn, { flex: 2 }]} onPress={() => { setConfirmed(false); router.push("/(tabs)/orders"); }}>
              <Ionicons name="cube-outline" size={16} color={C.textInverse} style={{ marginRight: 4 }} />
              <Text style={ss.doneBtnTxt}>{T("trackParcel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={ss.root}>
      <LinearGradient colors={[C.amberDark, C.amberBrown, C.amber]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[ss.header, { paddingTop: topPad + 14 }]}>
        <View style={ss.hdrRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={ss.backBtn}>
            <Ionicons name="arrow-back" size={20} color={C.textInverse} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={ss.hdrTitle}>📦 {T("parcel")}</Text>
            <Text style={ss.hdrSub}>{T("parcelsAnywhere")}</Text>
          </View>
        </View>
        <Steps current={step} labels={[T("senderDetails"), T("receiverDetails"), T("parcelDetails"), T("paymentMethods")]} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={ss.scroll}>
        {step === 0 && (
          <ErrorBoundary>
          <View style={ss.card}>
            <Text style={ss.cardTitle}>📍 {T("senderDetails")}</Text>
            <Text style={ss.label}>{T("yourName")} *</Text>
            <TextInput value={senderName} onChangeText={setSenderName} placeholder={T("fullName")} placeholderTextColor={C.textMuted} style={ss.input} maxLength={100} />
            <Text style={ss.label}>{T("yourPhone")} *</Text>
            <TextInput value={senderPhone} onChangeText={setSenderPhone} placeholder="03XX XXXXXXX" placeholderTextColor={C.textMuted} style={ss.input} keyboardType="phone-pad" maxLength={20} />
            <Text style={ss.label}>{T("pickupAddress")} *</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowLocPicker("pickup")} style={ss.locInput}>
              <Ionicons name="location-outline" size={16} color={pickupAddress ? C.text : C.textMuted} />
              <Text style={[ss.locInputTxt, !pickupAddress && { color: C.textMuted }]}>
                {pickupAddress || T("selectPickupLocation")}
              </Text>
              <Ionicons name="chevron-down" size={14} color={C.textMuted} />
            </TouchableOpacity>
            <Text style={ss.label}>{T("orTypeManually")}</Text>
            <TextInput
              value={pickupAddress}
              onChangeText={v => { setPickupAddress(v); setPickupLat(undefined); setPickupLng(undefined); if (geoError === "pickup") setGeoError(null); }}
              onBlur={async () => {
                if (!pickupAddress.trim() || pickupLat !== undefined) return;
                try {
                  const GEOCODE_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
                  const geoRes = await fetch(`${GEOCODE_BASE}/maps/geocode?address=${encodeURIComponent(pickupAddress)}`);
                  const geo = await geoRes.json();
                  if (geo?.lat && geo?.lng) { setPickupLat(geo.lat); setPickupLng(geo.lng); setGeoError(null); }
                  else setGeoError("pickup");
                } catch { setGeoError("pickup"); }
              }}
              placeholder="e.g. Chowk Adalat, Muzaffarabad"
              placeholderTextColor={C.textMuted}
              style={[ss.input, geoError === "pickup" && { borderColor: C.danger, borderWidth: 1.5 }]}
              multiline
              maxLength={500}
            />
            {geoError === "pickup" && (
              <Text style={{ ...Typ.captionMedium, color: C.danger, marginTop: 4 }}>
                {T("addressNotFound")}
              </Text>
            )}
          </View>
          </ErrorBoundary>
        )}

        {step === 1 && (
          <ErrorBoundary>
          <View style={ss.card}>
            <Text style={ss.cardTitle}>📬 {T("receiverDetails")}</Text>
            <Text style={ss.label}>{T("receiverName")} *</Text>
            <TextInput value={receiverName} onChangeText={setReceiverName} placeholder={T("fullName")} placeholderTextColor={C.textMuted} style={ss.input} maxLength={100} />
            <Text style={ss.label}>{T("receiverPhone")} *</Text>
            <TextInput value={receiverPhone} onChangeText={setReceiverPhone} placeholder="03XX XXXXXXX" placeholderTextColor={C.textMuted} style={ss.input} keyboardType="phone-pad" maxLength={20} />
            <Text style={ss.label}>{T("dropAddress")} *</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowLocPicker("drop")} style={ss.locInput}>
              <Ionicons name="location-outline" size={16} color={dropAddress ? C.text : C.textMuted} />
              <Text style={[ss.locInputTxt, !dropAddress && { color: C.textMuted }]}>
                {dropAddress || T("selectDropLocation")}
              </Text>
              <Ionicons name="chevron-down" size={14} color={C.textMuted} />
            </TouchableOpacity>
            <Text style={ss.label}>{T("orTypeManually")}</Text>
            <TextInput
              value={dropAddress}
              onChangeText={v => { setDropAddress(v); setDropLat(undefined); setDropLng(undefined); if (geoError === "drop") setGeoError(null); }}
              onBlur={async () => {
                if (!dropAddress.trim() || dropLat !== undefined) return;
                try {
                  const GEOCODE_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
                  const geoRes = await fetch(`${GEOCODE_BASE}/maps/geocode?address=${encodeURIComponent(dropAddress)}`);
                  const geo = await geoRes.json();
                  if (geo?.lat && geo?.lng) { setDropLat(geo.lat); setDropLng(geo.lng); setGeoError(null); }
                  else setGeoError("drop");
                } catch { setGeoError("drop"); }
              }}
              placeholder="e.g. Commercial Area, Mirpur"
              placeholderTextColor={C.textMuted}
              style={[ss.input, geoError === "drop" && { borderColor: C.danger, borderWidth: 1.5 }]}
              multiline
              maxLength={500}
            />
            {geoError === "drop" && (
              <Text style={{ ...Typ.captionMedium, color: C.danger, marginTop: 4 }}>
                {T("addressNotFound")}
              </Text>
            )}
          </View>
          </ErrorBoundary>
        )}

        {step === 2 && (
          <ErrorBoundary>
          <View>
            <View style={ss.card}>
              <Text style={ss.cardTitle}>📦 {T("parcelDetails")}</Text>
              <Text style={ss.label}>{T("parcelType")} *</Text>
              <View style={ss.typeGrid}>
                {PARCEL_TYPES.map(pt => {
                  const isActive = parcelType === pt.id;
                  return (
                    <TouchableOpacity activeOpacity={0.7} key={pt.id} onPress={() => setParcelType(pt.id)} style={[ss.typeCard, isActive && ss.typeCardActive]}>
                      <Text style={{ fontSize: 24 }}>{pt.emoji}</Text>
                      <Text style={[ss.typeLabel, isActive && { color: C.amber }]}>{pt.label}</Text>
                      <Text style={ss.typeDesc}>{pt.desc}</Text>
                      {isActive && (
                        fareLoading
                          ? <ActivityIndicator color={C.amber} size="small" style={{ marginTop: 4 }} />
                          : fareError
                            ? (
                              <TouchableOpacity activeOpacity={0.75} onPress={retryFareEstimate} hitSlop={8}>
                                <Text style={{ fontSize: 10, color: C.danger, textAlign: "center", marginTop: 2 }}>Unavailable · Retry</Text>
                              </TouchableOpacity>
                            )
                            : estimatedFare !== null
                              ? <Text style={{ fontSize: 11, color: C.amber, fontFamily: Font.semiBold, textAlign: "center", marginTop: 2 }}>Rs. {estimatedFare}</Text>
                              : <Text style={{ fontSize: 10, color: C.textMuted, textAlign: "center", marginTop: 2 }}>Calculating…</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={ss.card}>
              <Text style={ss.label}>{T("weightOptional")} (kg)</Text>
              <TextInput
                value={weight}
                onChangeText={(v) => { const n = parseFloat(v); if (v === "" || (Number.isFinite(n) && n >= 0 && n <= 500)) setWeight(v); }}
                placeholder="e.g. 1.5"
                placeholderTextColor={C.textMuted}
                style={ss.input}
                keyboardType="decimal-pad"
              />
              <Text style={ss.label}>{T("dimensionsLabel")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.label, { fontSize: 11, marginBottom: 4 }]}>{T("lengthLabel")}</Text>
                  <TextInput value={length} onChangeText={(v) => { const n = parseFloat(v); if (v === "" || (Number.isFinite(n) && n >= 0 && n <= 999)) setLength(v); }} placeholder="L" placeholderTextColor={C.textMuted} style={[ss.input, { textAlign: "center" }]} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.label, { fontSize: 11, marginBottom: 4 }]}>{T("widthLabel")}</Text>
                  <TextInput value={width} onChangeText={(v) => { const n = parseFloat(v); if (v === "" || (Number.isFinite(n) && n >= 0 && n <= 999)) setWidth(v); }} placeholder="W" placeholderTextColor={C.textMuted} style={[ss.input, { textAlign: "center" }]} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.label, { fontSize: 11, marginBottom: 4 }]}>{T("heightLabel")}</Text>
                  <TextInput value={height} onChangeText={(v) => { const n = parseFloat(v); if (v === "" || (Number.isFinite(n) && n >= 0 && n <= 999)) setHeight(v); }} placeholder="H" placeholderTextColor={C.textMuted} style={[ss.input, { textAlign: "center" }]} keyboardType="decimal-pad" />
                </View>
              </View>
              {volumetricWeight > 0 && (
                <View style={{ backgroundColor: C.amberSoft, borderRadius: 10, padding: 10, marginTop: 4, gap: 4 }}>
                  <Text style={{ ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.amberDark }}>{T("weightBreakdown")}</Text>
                  <Text style={{ ...Typ.small, color: C.amberDark }}>{T("actualWeight")}: {actualWeight.toFixed(1)} kg  •  {T("volumetricWeight")}: {volumetricWeight.toFixed(2)} kg</Text>
                  <Text style={{ ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.amber }}>{T("chargeableWeight")}: {chargeableWeight.toFixed(2)} kg</Text>
                </View>
              )}
              <Text style={ss.label}>{T("descriptionOptional")}</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={T("whatsInParcel")}
                placeholderTextColor={C.textMuted}
                style={[ss.input, { minHeight: 60 }]}
                multiline
                maxLength={500}
              />
            </View>
            {parcelType && (
              <View style={ss.fareCard}>
                <View style={{ flex: 1 }}>
                  <Text style={ss.fareLbl2}>{T("estimatedFareLabel")}</Text>
                  <Text style={ss.fareNote}>{T("eta")}</Text>
                </View>
                {fareLoading
                  ? <ActivityIndicator color={C.amber} size="small" />
                  : fareError
                    ? (
                      <TouchableOpacity activeOpacity={0.75} onPress={retryFareEstimate} style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontFamily: Font.semiBold, fontSize: 12, color: C.danger }}>Fare unavailable</Text>
                        <Text style={{ fontFamily: Font.regular, fontSize: 11, color: C.amber }}>Tap to retry</Text>
                      </TouchableOpacity>
                    )
                  : estimatedFare !== null
                    ? <Text style={ss.fareAmt}>Rs. {estimatedFare}</Text>
                    : <Text style={{ fontFamily: Font.regular, fontSize: 13, color: C.textMuted }}>Calculating...</Text>
                }
              </View>
            )}
          </View>
          </ErrorBoundary>
        )}

        {step === 3 && (
          <ErrorBoundary>
          <View>
            <View style={ss.card}>
              <Text style={ss.cardTitle}>💳 {T("paymentMethods")}</Text>
              {payMethodsError && (
                <View style={{ backgroundColor: C.redSoft, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <Text style={{ color: C.danger, fontFamily: Font.medium, fontSize: 13 }}>
                    Could not load payment methods. Please check your connection and try again.
                  </Text>
                </View>
              )}
              {payMethods.map(pm => {
                const active = payMethod === pm.id;
                const isWallet = pm.id === "wallet";
                const iconName: any = pm.id === "cash" ? "cash-outline"
                  : pm.id === "wallet" ? "wallet-outline"
                  : pm.id === "jazzcash" ? "phone-portrait-outline"
                  : pm.id === "easypaisa" ? "phone-portrait-outline"
                  : "card-outline";
                const iconBg = pm.id === "cash" ? C.emeraldSoft
                  : pm.id === "wallet" ? C.blueSoft
                  : pm.id === "jazzcash" ? C.roseBg
                  : C.skyBg;
                const iconColor = pm.id === "cash" ? C.emerald
                  : pm.id === "wallet" ? C.primary
                  : pm.id === "jazzcash" ? C.roseDeep
                  : C.skyDark;
                const subLabel = isWallet
                  ? `${T("availableBalance")}: Rs. ${(user?.walletBalance ?? 0).toLocaleString()}`
                  : (pm as any).description || pm.label;
                return (
                  <TouchableOpacity activeOpacity={0.7} key={pm.id} onPress={() => setPayMethod(pm.id)} style={[ss.payOpt, active && ss.payOptActive]}>
                    <View style={[ss.payIcon, { backgroundColor: iconBg }]}>
                      <Ionicons name={iconName} size={22} color={iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[ss.payLabel, active && { color: C.amber }]}>
                        {isWallet ? `${appName} ${T("wallet")}` : pm.label}
                      </Text>
                      <Text style={ss.paySub}>{subLabel}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color={C.amber} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={ss.summaryCard}>
              <Text style={ss.summaryTitle}>{T("bookingSummary")}</Text>
              <View style={ss.summaryRow}>
                <View style={[ss.summaryDot, { backgroundColor: C.emeraldDot }]} />
                <Text style={ss.summaryTxt}><Text style={{ fontFamily: Font.semiBold }}>{T("pickup")}:</Text> {pickupAddress}</Text>
              </View>
              <View style={ss.summaryRow}>
                <View style={[ss.summaryDot, { backgroundColor: C.redBright }]} />
                <Text style={ss.summaryTxt}><Text style={{ fontFamily: Font.semiBold }}>{T("dropOff")}:</Text> {dropAddress}</Text>
              </View>
              <View style={ss.summaryRow}>
                <Ionicons name="person-outline" size={14} color={C.textMuted} />
                <Text style={ss.summaryTxt}>{receiverName} • {receiverPhone}</Text>
              </View>
              <View style={ss.summaryRow}>
                <Ionicons name="cube-outline" size={14} color={C.textMuted} />
                <Text style={ss.summaryTxt}>{selectedType?.emoji} {selectedType?.label}{chargeableWeight > 0 ? ` • ${chargeableWeight.toFixed(2)} kg${volumetricWeight > actualWeight ? " (vol.)" : ""}` : weight ? ` • ${weight} kg` : ""}</Text>
              </View>
              <View style={[{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }]}>
                {estimatedFare != null && estimatedFare > 0 && confirmedFare > 0 && confirmedFare !== estimatedFare && (
                  <View style={ss.summaryRow}>
                    <Text style={[ss.summaryTotal, { color: C.textMuted, fontSize: 12 }]}>{T("estimatedFareLabel")}</Text>
                    <Text style={[ss.summaryFare, { color: C.textMuted, fontSize: 12, textDecorationLine: "line-through" }]}>Rs. {estimatedFare.toLocaleString()}</Text>
                  </View>
                )}
                <View style={ss.summaryRow}>
                  <Text style={ss.summaryTotal}>{confirmedFare > 0 ? T("confirmedFareLabel") : T("totalFare")}</Text>
                  <Text style={ss.summaryFare}>Rs. {(confirmedFare || estimatedFare || 0).toLocaleString()}</Text>
                </View>
              </View>
            </View>
          </View>
          </ErrorBoundary>
        )}

        <View style={{ height: Math.max(insets.bottom + 80, 120) }} />
      </ScrollView>
      </KeyboardAvoidingView>

      <View style={[ss.navBar, { paddingBottom: insets.bottom + 12 }]}>
        {step > 0 && (
          <TouchableOpacity activeOpacity={0.7} style={ss.prevBtn} onPress={prev}>
            <Ionicons name="arrow-back" size={18} color={C.text} />
            <Text style={ss.prevBtnTxt}>{T("back")}</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity activeOpacity={0.7} style={[ss.nextBtn, step === 0 && { marginLeft: "auto" }]} onPress={next}>
            <Text style={ss.nextBtnTxt}>{T("confirmLabel")}</Text>
            <Ionicons name="arrow-forward" size={18} color={C.textInverse} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity activeOpacity={0.7} style={[ss.nextBtn, loading && { opacity: 0.7 }]} onPress={bookParcel} disabled={loading}>
            {loading ? <ActivityIndicator color={C.textInverse} /> : (
              <>
                <Text style={ss.nextBtnTxt}>{T("parcel")}{estimatedFare != null ? ` • Rs. ${estimatedFare}` : ""}</Text>
                <Ionicons name="checkmark-circle" size={18} color={C.textInverse} />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={!!showLocPicker} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => { setShowLocPicker(null); setLocSearch(""); }}>
        <View style={ss.locModal}>
          <View style={ss.locModalHeader}>
            <Text style={ss.locModalTitle}>
              {showLocPicker === "pickup" ? `📍 ${T("pickup")}` : `🏁 ${T("dropOff")}`} {T("location")}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { setShowLocPicker(null); setLocSearch(""); }} style={ss.locCloseBtn}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          <View style={ss.locSearchRow}>
            <Ionicons name="search-outline" size={16} color={C.textMuted} />
            <TextInput
              value={locSearch}
              onChangeText={setLocSearch}
              placeholder="Search location or area..."
              placeholderTextColor={C.textMuted}
              autoFocus
              style={ss.locSearchInput}
            />
            {locLoading && <ActivityIndicator size="small" color={C.primary} />}
            {locSearch.length > 0 && !locLoading && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => setLocSearch("")}>
                <Ionicons name="close-circle" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView keyboardShouldPersistTaps="always">
            {predictions.map(pred => (
              <TouchableOpacity activeOpacity={0.7}
                key={pred.placeId}
                style={ss.locOption}
                onPress={async () => {
                  try {
                    const loc = await resolveLocation(pred);
                    if (!loc) throw new Error("location null");
                    const address = loc.address || pred.description;
                    if (showLocPicker === "pickup") {
                      setPickupAddress(address);
                      setPickupLat(loc.lat);
                      setPickupLng(loc.lng);
                    } else {
                      setDropAddress(address);
                      setDropLat(loc.lat);
                      setDropLng(loc.lng);
                    }
                    setShowLocPicker(null);
                    setLocSearch("");
                  } catch {
                    showToast(T("addressNotFound"), "error");
                  }
                }}
              >
                <View style={ss.locIconWrap}>
                  <Ionicons name="location-outline" size={18} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ss.locOptionTxt}>{pred.mainText}</Text>
                  {pred.secondaryText ? (
                    <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }} numberOfLines={1}>{pred.secondaryText}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
              </TouchableOpacity>
            ))}
            {predictions.length === 0 && !locLoading && locSearch.length > 2 && (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: C.textMuted, fontSize: 13 }}>{T("noResults")}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
      <PermissionGuide
        visible={permGuideVisible}
        type={permGuideType}
        onClose={() => setPermGuideVisible(false)}
      />
      <AuthGateSheet {...authSheetProps} />
    </View>
  );
}

function makeStepsStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  steps: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  stepItem: { alignItems: "center", gap: 4 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.overlayLight30, alignItems: "center", justifyContent: "center" },
  stepDotActive: { backgroundColor: C.amber },
  stepNum: { ...Typ.smallBold, color: C.overlayLight70 },
  stepLbl: { ...Typ.smallMedium, fontSize: 9, color: C.overlayLight80 },
  stepLine: { flex: 1, height: 2, backgroundColor: C.overlayLight30, marginBottom: 16 },
  stepLineActive: { backgroundColor: C.amber },
  });
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: 16, paddingBottom: 16 },
  hdrRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight20, alignItems: "center", justifyContent: "center" },
  hdrTitle: { ...Typ.title, color: C.textInverse },
  hdrSub: { ...Typ.caption, color: C.overlayLight85, marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 24 },
  card: { backgroundColor: C.surface, borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: C.border, ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(15,23,42,0.05)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 } }) },
  cardTitle: { ...Typ.price, color: C.text, marginBottom: 14 },

  label: { ...Typ.bodyMedium, fontSize: 13, color: C.text, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, ...Typ.body, fontSize: 13, color: C.text, backgroundColor: C.surfaceSecondary },
  locInput: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.surfaceSecondary },
  locInputTxt: { flex: 1, ...Typ.body, fontSize: 13, color: C.text },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  typeCard: { width: "46%", padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: "center", gap: 6, backgroundColor: C.surfaceSecondary },
  typeCardActive: { borderColor: C.amber, backgroundColor: C.amberBg },
  typeLabel: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.text },
  typeDesc: { ...Typ.small, fontSize: 10, color: C.textMuted, textAlign: "center" },
  typeFare: { ...Typ.captionBold, color: C.primary },
  weightNote: { ...Typ.small, color: C.amber, marginTop: 6 },

  fareCard: { backgroundColor: C.amberBg, borderRadius: 16, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: C.amberBorder, marginHorizontal: 0, marginBottom: 12 },
  fareLbl2: { ...Typ.bodySemiBold, color: C.amberDark },
  fareNote: { ...Typ.small, color: C.amberBrown, marginTop: 2 },
  fareAmt: { ...Typ.h2, fontSize: 24, color: C.amber },

  payOpt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, marginBottom: 10 },
  payOptActive: { borderColor: C.amber, backgroundColor: C.amberBg },
  payIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  payLabel: { ...Typ.bodySemiBold, color: C.text },
  paySub: { ...Typ.small, color: C.textMuted, marginTop: 2 },

  summaryCard: { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(15,23,42,0.05)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 } }) },
  summaryTitle: { ...Typ.h3, fontSize: 16, color: C.text, marginBottom: 14 },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  summaryDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  summaryTxt: { flex: 1, ...Typ.body, fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  summaryTotal: { flex: 1, ...Typ.h3, fontSize: 16, color: C.text },
  summaryFare: { ...Typ.title, color: C.amber },

  navBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, ...Platform.select({ web: { boxShadow: "0 -2px 8px rgba(15,23,42,0.06)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 5 } }) },
  prevBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, backgroundColor: C.surfaceSecondary },
  prevBtnTxt: { ...Typ.bodySemiBold, color: C.text },
  nextBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 16, backgroundColor: C.amber, ...Platform.select({ web: { boxShadow: "0 2px 4px rgba(215,119,6,0.3)" }, default: { shadowColor: C.amber, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 } }) },
  nextBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },

  locModal: { flex: 1, backgroundColor: C.surface },
  locModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  locModalTitle: { ...Typ.price, color: C.text },
  locCloseBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  locSearchRow: { flexDirection: "row", alignItems: "center", gap: 10, margin: 12, backgroundColor: C.surfaceSecondary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: C.borderLight },
  locSearchInput: { flex: 1, ...Typ.body, color: C.text, paddingVertical: 0 },
  locOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  locOptionTxt: { ...Typ.bodyMedium, color: C.text },
  locIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.blueSoft, alignItems: "center", justifyContent: "center" },

  confirmCard: { backgroundColor: C.surface, borderRadius: 24, padding: 28, alignItems: "center", width: "100%", borderWidth: 1, borderColor: C.border, gap: 12, ...Platform.select({ web: { boxShadow: "0 4px 16px rgba(15,23,42,0.08)" }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 5 } }) },
  confirmIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  confirmTitle: { ...Typ.h2, fontSize: 24, color: C.text },
  confirmSub: { ...Typ.body, color: C.textMuted, textAlign: "center", lineHeight: 21 },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" },
  confirmInfoBox: { flex: 1, backgroundColor: C.surfaceSecondary, borderRadius: 14, padding: 12 },
  confirmInfoLbl: { ...Typ.smallMedium, fontSize: 10, color: C.textMuted, marginBottom: 4 },
  confirmInfoVal: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.text },
  fareBox: { width: "100%", backgroundColor: C.amberBg, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fareLbl: { ...Typ.bodyMedium, fontSize: 13, color: C.amberDark },
  fareVal: { ...Typ.h2, color: C.amber },
  doneBtn: { backgroundColor: C.amber, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  doneBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },
  });
}

export default ParcelScreenInner;
