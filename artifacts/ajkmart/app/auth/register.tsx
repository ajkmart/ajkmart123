import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii, shadows, typography } from "@/constants/colors";
import { useAuth, type AppUser } from "@/context/AuthContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { normalizePhone, isValidPakistaniPhone } from "@/utils/phone";

import {
  OtpDigitInput,
  AuthButton,
  AlertBox,
  PhoneInput,
  InputField,
  PasswordStrengthBar,
  StepProgress,
  DevOtpBanner,
  authColors as C,
} from "@/components/auth-shared";

const API = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;

type RegStep = 1 | 2 | 3 | 4 | 5;

const PAKISTAN_CITIES = [
  "Muzaffarabad", "Mirpur", "Rawalakot", "Kotli", "Bagh", "Bhimber",
  "Islamabad", "Rawalpindi", "Lahore", "Karachi", "Peshawar", "Quetta",
  "Faisalabad", "Multan", "Sialkot", "Gujranwala", "Hyderabad",
  "Abbottabad", "Bahawalpur", "Sargodha", "Sukkur", "Mardan",
  "Mansehra", "Gilgit", "Skardu",
];

function formatCnic(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

const LEVEL_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string; desc: string }> = {
  bronze: { color: "#CD7F32", bg: "#FFF3E0", icon: "shield-outline", label: "Bronze", desc: "Complete your profile to unlock more features" },
  silver: { color: "#C0C0C0", bg: "#F5F5F5", icon: "shield-half-outline", label: "Silver", desc: "Add CNIC to upgrade to Gold" },
  gold:   { color: "#FFD700", bg: "#FFFDE7", icon: "shield-checkmark-outline", label: "Gold", desc: "Full access to all features" },
};

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { config } = usePlatformConfig();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [step, setStep] = useState<RegStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [authToken, setAuthToken] = useState("");
  const [authRefreshToken, setAuthRefreshToken] = useState("");
  const [authUser, setAuthUser] = useState<AppUser | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"" | "checking" | "available" | "taken">("");
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [city, setCity] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("");

  const [cnic, setCnic] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const signupBonus = config.customer.signupBonus;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    return () => {
      if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    };
  }, []);

  const clearError = () => setError("");

  const normalizedPhone = normalizePhone(phone);

  const handleUsernameChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    setUsername(clean);
    clearError();
    setUsernameStatus("");
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    if (clean.length >= 3) {
      usernameTimerRef.current = setTimeout(async () => {
        setUsernameStatus("checking");
        try {
          const res = await fetch(`${API}/auth/check-available`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: clean }),
          });
          const data = await res.json();
          if (data?.username?.available) {
            setUsernameStatus("available");
          } else {
            setUsernameStatus("taken");
          }
        } catch {
          setUsernameStatus("");
        }
      }, 500);
    }
  };

  const cityList: string[] = React.useMemo(() => {
    if (config.cities && config.cities.length > 0) return config.cities;
    return PAKISTAN_CITIES;
  }, [config]);

  const filteredCities = cityList.filter(c =>
    c.toLowerCase().includes(citySearch.toLowerCase())
  );

  const handleGetLocation = async () => {
    setGpsLoading(true);
    setGpsStatus("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsStatus("Location permission denied");
        setGpsLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(loc.coords.latitude.toFixed(6));
      setLongitude(loc.coords.longitude.toFixed(6));

      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geo) {
          if (geo.city) {
            const matchedCity = cityList.find(
              c => c.toLowerCase() === geo.city!.toLowerCase()
            );
            if (matchedCity) setCity(matchedCity);
          }
          if (geo.district || geo.subregion) setArea(geo.district || geo.subregion || "");
          const parts = [geo.streetNumber, geo.street, geo.name].filter(Boolean);
          if (parts.length > 0) setAddress(parts.join(", "));
          setGpsStatus("Location captured successfully");
        }
      } catch {
        setGpsStatus("Coordinates captured (address lookup unavailable)");
      }
    } catch (e: unknown) {
      setGpsStatus(e instanceof Error ? e.message : "Could not get location");
    }
    setGpsLoading(false);
  };

  const handleSendOtp = async () => {
    clearError();
    if (!isValidPakistaniPhone(phone)) { setError("Please enter a valid Pakistani phone number (e.g. 03XX-XXXXXXX)"); return; }
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      let checkData: Record<string, unknown>;
      try {
        const checkRes = await fetch(`${API}/auth/check-identifier`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: `0${normalizedPhone}`, role: "customer" }),
        });
        checkData = await checkRes.json();
        if (!checkRes.ok) {
          setError((checkData?.error as string) || "Could not verify phone number. Please try again.");
          setLoading(false);
          return;
        }
      } catch {
        setError("Network error. Please check your connection and try again.");
        setLoading(false);
        return;
      }
      const action = checkData?.action;
      if (action === "registration_closed") {
        setError("New registrations are currently closed. Please try again later.");
        setLoading(false);
        return;
      }
      if (action === "blocked") {
        setError("This phone number has been suspended. Please contact support.");
        setLoading(false);
        return;
      }
      if (action === "locked") {
        const mins = (checkData?.lockedMinutes as string | number) ?? "";
        setError(`Too many attempts. Please try again${mins ? ` in ${mins} minute(s)` : " later"}.`);
        setLoading(false);
        return;
      }
      const sendOtpRes = await fetch(`${API}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, role: "customer" }),
      });
      const sendOtpData = await sendOtpRes.json();
      if (!sendOtpRes.ok) {
        const msg: string = sendOtpData.error || "Could not send OTP.";
        setError(msg);
        const match = msg.match(/wait (\d+) second/);
        if (match) setResendCooldown(parseInt(match[1]!, 10));
        setLoading(false);
        return;
      }
      if (sendOtpData.otpRequired === false && sendOtpData.accessToken) {
        setAuthToken(sendOtpData.accessToken);
        if (sendOtpData.refreshToken) setAuthRefreshToken(sendOtpData.refreshToken);
        if (sendOtpData.user) setAuthUser(sendOtpData.user);
        try {
          const SecureStore = await import("expo-secure-store");
          await SecureStore.setItemAsync("ajkmart_reg_token", sendOtpData.accessToken);
        } catch {}
        setStep(2);
        setLoading(false);
        return;
      }
      if (sendOtpData.otp) setDevOtp(sendOtpData.otp);
      setResendCooldown(60);
      setOtpSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not send OTP.");
    }
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    clearError();
    if (!otp || otp.length < 6) { setError("Please enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Invalid OTP."); setLoading(false); return; }
      if (data.accessToken) {
        setAuthToken(data.accessToken);
        try {
          const SecureStore = await import("expo-secure-store");
          await SecureStore.setItemAsync("ajkmart_reg_token", data.accessToken);
        } catch {}
      }
      if (data.refreshToken) setAuthRefreshToken(data.refreshToken);
      if (data.user) {
        const rawUser = data.user as Record<string, unknown>;
        const rolesStr = typeof rawUser.roles === "string" ? rawUser.roles : "";
        const derivedRole = (rolesStr.split(",")[0]?.trim() || rawUser.role || "customer") as AppUser["role"];
        setAuthUser({ ...rawUser, role: derivedRole } as AppUser);
      }
      setStep(2);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Verification failed."); }
    setLoading(false);
  };

  const handleStep2 = () => {
    clearError();
    if (!name.trim() || name.trim().length < 2) { setError("Please enter your name (at least 2 characters)"); return; }
    if (!username || username.length < 3) { setError("Please choose a username (at least 3 characters)"); return; }
    if (usernameStatus === "taken") { setError("This username is already taken. Please choose another."); return; }
    if (usernameStatus === "checking") { setError("Please wait — checking username availability…"); return; }
    if (usernameStatus === "") { setError("Please wait a moment for the username check to complete."); return; }
    if (usernameStatus !== "available") { setError("Username is not available. Please choose another."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    setStep(3);
  };

  const handleStep3 = () => {
    clearError();
    if (!city) { setError("Please select your city"); return; }
    setStep(4);
  };

  const handleStep4 = async () => {
    clearError();
    if (!password || password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(password)) { setError("Password must contain at least 1 uppercase letter"); return; }
    if (!/[0-9]/.test(password)) { setError("Password must contain at least 1 number"); return; }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) { setError("Password must contain at least 1 special character (e.g. !@#$%)"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    if (!termsAccepted) { setError("Please accept the Terms & Conditions"); return; }

    setLoading(true);
    try {
      let activeToken = authToken;
      if (!activeToken) {
        try {
          const SecureStore = await import("expo-secure-store");
          activeToken = await SecureStore.getItemAsync("ajkmart_reg_token") || "";
        } catch {}
      }
      if (!activeToken) {
        setError("Session expired. Please go back and verify OTP again.");
        setLoading(false);
        return;
      }

      const profileRes = await fetch(`${API}/auth/complete-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          ...(email && { email: email.trim().toLowerCase() }),
          ...(cnic && { cnic: cnic.trim() }),
          ...(city && { city }),
          ...(area && { area: area.trim() }),
          ...(address && { address: address.trim() }),
          ...(latitude && { latitude }),
          ...(longitude && { longitude }),
          password,
        }),
      });
      const profileData = await profileRes.json();

      if (!profileRes.ok) {
        setError(profileData.error || "Could not save profile. Please try again.");
        setLoading(false);
        return;
      }

      if (profileData.token) setAuthToken(profileData.token);
      if (profileData.refreshToken) setAuthRefreshToken(profileData.refreshToken);
      if (profileData.user) setAuthUser(profileData.user);

      setStep(5);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not save profile."); }
    setLoading(false);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      let finalToken = authToken;
      if (!finalToken) {
        try {
          const SecureStore = await import("expo-secure-store");
          finalToken = await SecureStore.getItemAsync("ajkmart_reg_token") || "";
        } catch {}
      }
      if (finalToken && authUser) {
        const userData = {
          ...authUser,
          walletBalance: authUser.walletBalance ?? 0,
          isActive: authUser.isActive ?? true,
          createdAt: authUser.createdAt ?? new Date().toISOString(),
        };
        await login(userData, finalToken, authRefreshToken || undefined);
        try {
          const SecureStore = await import("expo-secure-store");
          await SecureStore.deleteItemAsync("ajkmart_reg_token");
        } catch {}
        router.replace("/(tabs)");
      } else {
        router.replace("/auth");
      }
    } catch (e: unknown) {
      if (__DEV__) console.warn("Login after registration failed:", e instanceof Error ? e.message : e);
      router.replace("/auth");
    }
    setLoading(false);
  };

  const stepLabels = ["Verify", "Details", "Address", "Security", "Done"];

  const handleBack = () => {
    clearError();
    if (step <= 2) {
      import("expo-secure-store").then(SS => SS.deleteItemAsync("ajkmart_reg_token")).catch(() => {});
      router.back();
    } else {
      setStep((step - 1) as RegStep);
    }
  };

  const accountLevel = authUser?.accountLevel || "bronze";
  const levelInfo = LEVEL_CONFIG[accountLevel] || LEVEL_CONFIG.bronze;

  if (step === 5) {
    return (
      <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} style={s.gradient}>
        <ScrollView contentContainerStyle={s.successScroll}>
          <View style={s.successCard}>
            <View style={s.successIconWrap}>
              <View style={s.successIconCircle}>
                <Ionicons name="checkmark" size={40} color="#fff" />
              </View>
            </View>
            <Text style={s.successTitle}>Registration Successful!</Text>
            <Text style={s.successSub}>
              Welcome to {config.platform.appName}! Your account is ready.
            </Text>

            <View style={[s.levelBadge, { backgroundColor: levelInfo.bg, borderColor: levelInfo.color }]}>
              <Ionicons name={levelInfo.icon as any} size={28} color={levelInfo.color} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[s.levelTitle, { color: levelInfo.color }]}>{levelInfo.label} Account</Text>
                <Text style={s.levelDesc}>{levelInfo.desc}</Text>
              </View>
            </View>

            {signupBonus > 0 && (
              <View style={s.bonusBanner}>
                <View style={s.bonusIconWrap}>
                  <Ionicons name="gift" size={22} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.bonusTitle}>Welcome Bonus!</Text>
                  <Text style={s.bonusSub}>Rs. {signupBonus} has been added to your wallet</Text>
                </View>
              </View>
            )}

            {accountLevel !== "gold" && (
              <View style={s.kycPrompt}>
                <Ionicons name="document-text-outline" size={20} color={C.primary} />
                <Text style={s.kycText}>
                  Complete KYC verification to unlock Gold benefits and higher limits
                </Text>
              </View>
            )}

            <AuthButton label="Start Shopping" onPress={handleFinish} loading={loading} icon="cart-outline" />
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  const stepSubtitles: Record<number, string> = {
    1: "Verify your phone number",
    2: "Tell us about yourself",
    3: "Where should we deliver?",
    4: "Secure your account",
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} style={s.gradient}>
        <View style={[s.topSection, { paddingTop: topPad + 16 }]}>
          <Pressable
            onPress={handleBack}
            style={s.backBtn}
            accessibilityLabel={step <= 2 ? "Go back" : "Previous step"}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <View style={s.headerLogoRow}>
            <View style={s.headerLogo}>
              <Ionicons name="person-add" size={24} color={C.primary} />
            </View>
          </View>
          <Text style={s.headerTitle}>Create Account</Text>
          <Text style={s.headerSub}>{stepSubtitles[step]}</Text>

          <View style={s.progressRow}>
            <StepProgress total={5} current={step} />
          </View>
          <View style={s.stepLabels}>
            {stepLabels.map((label, i) => (
              <Text key={label} style={[s.stepLabel, step >= i + 1 && s.stepLabelActive]}>{label}</Text>
            ))}
          </View>
        </View>

        <ScrollView style={s.card} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <>
              <View style={s.stepHeader}>
                <View style={[s.stepHeaderIcon, { backgroundColor: "#EFF6FF" }]}>
                  <Ionicons name="call-outline" size={20} color="#0066FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepHeaderTitle}>Verify Phone</Text>
                  <Text style={s.stepHeaderSub}>We'll send a one-time code to confirm your number</Text>
                </View>
              </View>

              {!otpSent ? (
                <>
                  <Text style={s.fieldLabel}>Phone Number</Text>
                  <PhoneInput
                    value={phone}
                    onChangeText={v => { setPhone(v); clearError(); }}
                    autoFocus
                  />
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => { setOtpSent(false); setOtp(""); clearError(); }}
                    style={s.changeBtn}
                    accessibilityRole="button"
                  >
                    <Ionicons name="arrow-back" size={14} color={C.primary} />
                    <Text style={s.changeBtnText}>Change Number</Text>
                  </Pressable>

                  <Text style={s.fieldLabel}>Enter Verification Code</Text>
                  <Text style={s.fieldSub}>Code sent to +92 {phone}</Text>

                  <OtpDigitInput
                    value={otp}
                    onChangeText={v => { setOtp(v); clearError(); }}
                    hasError={!!error}
                    onComplete={() => handleVerifyOtp()}
                  />

                  <DevOtpBanner otp={devOtp} />

                  <Pressable
                    onPress={handleSendOtp}
                    style={[s.resendBtn, resendCooldown > 0 && s.resendDisabled]}
                    disabled={resendCooldown > 0}
                    accessibilityRole="button"
                  >
                    <Ionicons name="refresh-outline" size={16} color={resendCooldown > 0 ? C.textMuted : C.primary} />
                    <Text style={[s.resendText, resendCooldown > 0 && { color: C.textMuted }]}>
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <View style={s.stepHeader}>
                <View style={[s.stepHeaderIcon, { backgroundColor: "#ECFDF5" }]}>
                  <Ionicons name="person-outline" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepHeaderTitle}>Personal Details</Text>
                  <Text style={s.stepHeaderSub}>Tell us your name and how to reach you</Text>
                </View>
              </View>

              <InputField
                label="Full Name *"
                value={name}
                onChangeText={v => { setName(v); clearError(); }}
                placeholder="Enter your full name"
                autoCapitalize="words"
                autoFocus
                error={!!error && !name.trim()}
              />
              <View>
                <InputField
                  label="Username *"
                  value={username}
                  onChangeText={handleUsernameChange}
                  placeholder="e.g. ahmed_khan92"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  error={usernameStatus === "taken" || (!!error && username.length < 3)}
                  rightIcon={
                    usernameStatus === "available" ? "checkmark-circle" :
                    usernameStatus === "taken" ? "close-circle" :
                    undefined
                  }
                  rightIconColor={usernameStatus === "available" ? C.success : C.danger}
                />
                {usernameStatus === "checking" && (
                  <View style={s.usernameCheckRow}>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={s.usernameCheckText}>Checking availability...</Text>
                  </View>
                )}
                {usernameStatus === "available" && (
                  <Text style={[s.usernameHint, { color: C.success }]}>Username is available!</Text>
                )}
                {usernameStatus === "taken" && (
                  <Text style={[s.usernameHint, { color: C.danger }]}>Username already taken</Text>
                )}
                {!usernameStatus && (
                  <Text style={s.fieldHint}>Letters, numbers, underscore only. Min 3 characters.</Text>
                )}
              </View>
              <InputField
                label="Email (optional)"
                value={email}
                onChangeText={v => { setEmail(v); clearError(); }}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                error={!!error && !!email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
              />
            </>
          )}

          {step === 3 && (
            <>
              <View style={s.stepHeader}>
                <View style={[s.stepHeaderIcon, { backgroundColor: "#FFF7ED" }]}>
                  <Ionicons name="location-outline" size={20} color="#EA580C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepHeaderTitle}>Delivery Address</Text>
                  <Text style={s.stepHeaderSub}>Where should we deliver your orders?</Text>
                </View>
              </View>

              <Pressable
                onPress={handleGetLocation}
                disabled={gpsLoading}
                style={s.gpsButton}
                accessibilityRole="button"
                accessibilityLabel="Use GPS to fill address"
              >
                {gpsLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="navigate" size={20} color="#fff" />
                )}
                <Text style={s.gpsButtonText}>
                  {gpsLoading ? "Getting Location..." : "Use My Current Location"}
                </Text>
              </Pressable>
              {!!gpsStatus && (
                <Text style={[s.gpsStatusText, gpsStatus.includes("denied") && { color: C.danger }]}>
                  {gpsStatus}
                </Text>
              )}
              {!!(latitude && longitude) && (
                <View style={s.coordsRow}>
                  <Ionicons name="location" size={14} color={C.success} />
                  <Text style={s.coordsText}>{latitude}, {longitude}</Text>
                </View>
              )}

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or enter manually</Text>
                <View style={s.dividerLine} />
              </View>

              <Text style={s.fieldLabel}>City *</Text>
              <Pressable
                onPress={() => setShowCityPicker(!showCityPicker)}
                style={[s.pickerButton, !city && !!error && s.pickerError]}
              >
                <Text style={[s.pickerButtonText, !city && { color: C.textMuted }]}>
                  {city || "Select your city"}
                </Text>
                <Ionicons name={showCityPicker ? "chevron-up" : "chevron-down"} size={20} color={C.textMuted} />
              </Pressable>
              {showCityPicker && (
                <View style={s.cityDropdown}>
                  <View style={s.citySearchWrap}>
                    <Ionicons name="search" size={16} color={C.textMuted} />
                    <InputField
                      value={citySearch}
                      onChangeText={setCitySearch}
                      placeholder="Search city..."
                    />
                  </View>
                  <ScrollView style={s.cityList} nestedScrollEnabled>
                    {filteredCities.map(c => (
                      <Pressable
                        key={c}
                        onPress={() => { setCity(c); setShowCityPicker(false); setCitySearch(""); clearError(); }}
                        style={[s.cityItem, city === c && s.cityItemSelected]}
                      >
                        <Text style={[s.cityItemText, city === c && s.cityItemTextSelected]}>{c}</Text>
                        {city === c && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
                      </Pressable>
                    ))}
                    {filteredCities.length === 0 && (
                      <Text style={s.noCityText}>No cities found</Text>
                    )}
                  </ScrollView>
                </View>
              )}

              <InputField
                label="Area / Locality"
                value={area}
                onChangeText={v => { setArea(v); clearError(); }}
                placeholder="e.g. Satellite Town, Block B"
                autoCapitalize="words"
              />
              <InputField
                label="Full Address"
                value={address}
                onChangeText={v => { setAddress(v); clearError(); }}
                placeholder="House/flat no, street, landmark"
                autoCapitalize="sentences"
                multiline
              />
            </>
          )}

          {step === 4 && (
            <>
              <View style={s.stepHeader}>
                <View style={[s.stepHeaderIcon, { backgroundColor: "#EFF6FF" }]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#0066FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepHeaderTitle}>Secure Your Account</Text>
                  <Text style={s.stepHeaderSub}>Create a strong password to protect your account</Text>
                </View>
              </View>

              <View>
                <Text style={s.fieldLabel}>CNIC / National ID</Text>
                <InputField
                  value={cnic}
                  onChangeText={v => { setCnic(formatCnic(v)); clearError(); }}
                  placeholder="XXXXX-XXXXXXX-X"
                  keyboardType="numeric"
                  maxLength={15}
                  error={!!error && !!cnic && !/^\d{5}-\d{7}-\d{1}$/.test(cnic)}
                />
                <Text style={s.fieldHint}>Optional — for KYC verification and Gold account</Text>
              </View>

              <InputField
                label="Password *"
                value={password}
                onChangeText={v => { setPassword(v); clearError(); }}
                placeholder="Minimum 8 characters"
                secureTextEntry={!showPwd}
                rightIcon={showPwd ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowPwd(v => !v)}
              />
              <PasswordStrengthBar password={password} />

              <InputField
                label="Confirm Password *"
                value={confirmPassword}
                onChangeText={v => { setConfirmPassword(v); clearError(); }}
                placeholder="Re-enter your password"
                secureTextEntry={!showConfirmPwd}
                rightIcon={showConfirmPwd ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowConfirmPwd(v => !v)}
                error={!!confirmPassword && password !== confirmPassword}
              />
              {!!confirmPassword && password !== confirmPassword && (
                <Text style={s.mismatchText}>Passwords do not match</Text>
              )}

              <Pressable
                onPress={() => setTermsAccepted(!termsAccepted)}
                style={s.termsRow}
                accessibilityLabel="Accept Terms and Conditions"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAccepted }}
              >
                <View style={[s.checkbox, termsAccepted && s.checkboxChecked]}>
                  {termsAccepted && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={s.termsText}>
                  I agree to the <Text style={{ color: C.primary }}>Terms & Conditions</Text> and{" "}
                  <Text style={{ color: C.primary }}>Privacy Policy</Text>
                </Text>
              </Pressable>
            </>
          )}

          {error ? <AlertBox type="error" message={error} /> : null}

          <AuthButton
            label={
              step === 1
                ? otpSent ? "Verify OTP" : "Send OTP"
                : step === 2 ? "Continue"
                : step === 3 ? "Continue"
                : "Create Account"
            }
            onPress={
              step === 1
                ? otpSent ? handleVerifyOtp : handleSendOtp
                : step === 2 ? handleStep2
                : step === 3 ? handleStep3
                : handleStep4
            }
            loading={loading}
            icon={step === 4 ? "shield-checkmark-outline" : step === 1 && !otpSent ? "send-outline" : step === 3 ? "location-outline" : undefined}
          />

          {step === 1 && (
            <Pressable
              onPress={() => router.replace("/auth")}
              style={s.loginLink}
              accessibilityLabel="Go to login"
              accessibilityRole="link"
            >
              <Text style={s.loginLinkText}>
                Already have an account? <Text style={{ fontFamily: "Inter_700Bold" }}>Login</Text>
              </Text>
            </Pressable>
          )}

          {step === 3 && (
            <Pressable onPress={() => setStep(4)} style={s.skipLink} accessibilityRole="link">
              <Text style={s.skipLinkText}>Skip address (optional)</Text>
            </Pressable>
          )}
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  gradient: { flex: 1 },
  topSection: { alignItems: "center", paddingBottom: spacing.lg, paddingHorizontal: spacing.xl },
  backBtn: {
    position: "absolute", left: spacing.lg,
    top: Platform.OS === "web" ? 67 : 50,
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerLogoRow: { marginBottom: spacing.md },
  headerLogo: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    ...shadows.md,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: "#fff", marginBottom: 4 },
  headerSub: { ...typography.body, color: "rgba(255,255,255,0.85)", marginBottom: spacing.lg },
  progressRow: { marginBottom: 8 },
  stepLabels: { flexDirection: "row", justifyContent: "center", gap: 16 },
  stepLabel: { ...typography.small, color: "rgba(255,255,255,0.4)" },
  stepLabelActive: { color: "rgba(255,255,255,0.9)" },

  card: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xxl, flex: 1 },

  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surfaceSecondary,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  stepHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepHeaderTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: C.text, marginBottom: 2 },
  stepHeaderSub: { ...typography.caption, color: C.textMuted, lineHeight: 16 },

  fieldLabel: { ...typography.captionMedium, color: C.textSecondary, marginBottom: spacing.sm },
  fieldSub: { ...typography.caption, color: C.textMuted, marginBottom: spacing.md },
  fieldHint: { ...typography.small, color: C.textMuted, marginTop: -8, marginBottom: spacing.md, paddingLeft: 2 },

  changeBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.md },
  changeBtnText: { ...typography.bodyMedium, color: C.primary },

  resendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginBottom: spacing.md },
  resendDisabled: { opacity: 0.5 },
  resendText: { ...typography.bodyMedium, color: C.primary },

  gpsButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: C.primary, borderRadius: radii.lg, paddingVertical: 14,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  gpsButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  gpsStatusText: { ...typography.caption, color: C.success, textAlign: "center", marginBottom: spacing.sm },
  coordsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: spacing.md },
  coordsText: { ...typography.small, color: C.textMuted },

  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { ...typography.small, color: C.textMuted },

  pickerButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    backgroundColor: C.surfaceSecondary,
    marginBottom: spacing.md,
  },
  pickerError: { borderColor: C.danger },
  pickerButtonText: { ...typography.body, color: C.text },

  cityDropdown: {
    borderWidth: 1, borderColor: C.border, borderRadius: radii.lg,
    backgroundColor: C.surface, marginTop: -8, marginBottom: spacing.md,
    maxHeight: 220, overflow: "hidden",
    ...shadows.sm,
  },
  citySearchWrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  cityList: { maxHeight: 170 },
  cityItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  cityItemSelected: { backgroundColor: `${C.primary}10` },
  cityItemText: { ...typography.body, color: C.text },
  cityItemTextSelected: { color: C.primary, fontFamily: "Inter_600SemiBold" },
  noCityText: { ...typography.caption, color: C.textMuted, textAlign: "center", paddingVertical: 16 },

  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: spacing.sm, marginBottom: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxChecked: { backgroundColor: C.primary, borderColor: C.primary },
  termsText: { flex: 1, ...typography.caption, color: C.textSecondary, lineHeight: 19 },

  mismatchText: { ...typography.caption, color: C.danger, marginTop: -8, marginBottom: spacing.md, paddingLeft: 4 },
  loginLink: { alignItems: "center", marginTop: spacing.xl },
  loginLinkText: { ...typography.bodyMedium, color: C.primary },
  skipLink: { alignItems: "center", marginTop: spacing.md },
  skipLinkText: { ...typography.bodyMedium, color: C.textMuted, textDecorationLine: "underline" },

  usernameCheckRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -8, marginBottom: spacing.md, paddingLeft: 2 },
  usernameCheckText: { ...typography.small, color: C.primary },
  usernameHint: { ...typography.small, marginTop: -8, marginBottom: spacing.md, paddingLeft: 2 },

  successScroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl },
  successCard: { backgroundColor: C.surface, borderRadius: radii.xxl, padding: spacing.xxxl, alignItems: "center", width: "100%", ...shadows.lg },
  successIconWrap: { marginBottom: spacing.xl },
  successIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.success, alignItems: "center", justifyContent: "center" },
  successTitle: { ...typography.h2, color: C.text, marginBottom: spacing.sm, textAlign: "center" },
  successSub: { ...typography.body, color: C.textMuted, textAlign: "center", marginBottom: spacing.xl, lineHeight: 22 },

  levelBadge: {
    flexDirection: "row", alignItems: "center",
    borderRadius: radii.lg, padding: spacing.lg,
    borderWidth: 1.5, marginBottom: spacing.lg, width: "100%",
  },
  levelTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 2 },
  levelDesc: { ...typography.caption, color: C.textSecondary },

  bonusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: C.accentSoft, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: "#FFD580", width: "100%" },
  bonusIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF4E5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  bonusTitle: { ...typography.subtitle, color: C.text, marginBottom: 2 },
  bonusSub: { ...typography.caption, color: C.textSecondary },

  kycPrompt: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: `${C.primary}08`, borderRadius: radii.md,
    padding: spacing.md, marginBottom: spacing.xl, width: "100%",
    borderWidth: 1, borderColor: `${C.primary}20`,
  },
  kycText: { flex: 1, ...typography.caption, color: C.primary, lineHeight: 18 },
});
