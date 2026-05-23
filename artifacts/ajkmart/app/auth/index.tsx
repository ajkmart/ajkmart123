import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Linking from "expo-linking";

import Colors, { spacing, radii, shadows, typography } from "@/constants/colors";
import { useAuth, type AppUser } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { usePlatformConfig, isMethodEnabled } from "@/context/PlatformConfigContext";
import { useToast } from "@/context/ToastContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { normalizePhone, isValidPakistaniPhone } from "@/utils/phone";

import {
  OtpDigitInput,
  AuthButton,
  AlertBox,
  PhoneInput,
  InputField,
  ChannelBadge,
  FallbackChannelButtons,
  DevOtpBanner,
  Divider,
  SocialButton,
  authColors as C,
} from "@/components/auth-shared";

const API = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;

if (typeof __DEV__ === "undefined") {
  throw new Error("__DEV__ is not defined — Metro bundler misconfiguration");
}

type LoginMethod = "phone" | "email" | "username" | "magic" | "google" | "facebook";
type Step = "continue" | "method" | "otp" | "totp" | "pending" | "complete-profile";

async function authPost(path: string, body: object) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

interface AuthLoginResponse {
  requires2FA?: boolean;
  tempToken?: string;
  userId?: string;
  pendingApproval?: boolean;
  token?: string;
  refreshToken?: string;
  user?: Partial<AppUser>;
  otpRequired?: boolean;
  otp?: string;
  channel?: string;
  fallbackChannels?: string[];
  action?: string;
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const {
    login, setTwoFactorPending, twoFactorPending,
    completeTwoFactorLogin, biometricEnabled, attemptBiometricLogin,
  } = useAuth();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config: platformCfg } = usePlatformConfig();
  const { showToast } = useToast();
  const authCfg = platformCfg.auth;
  const appName = platformCfg.platform.appName;
  const appTagline = platformCfg.platform.appTagline;
  const topPad = Math.max(insets.top, 12);

  const [method, setMethod] = useState<LoginMethod>("phone");
  const [step, setStep] = useState<Step>("continue");
  const [identifier, setIdentifier] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [biometricLoading, setBiometricLoading] = useState(false);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [otpChannel, setOtpChannel] = useState("");
  const [fallbackChannels, setFallbackChannels] = useState<string[]>([]);

  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailDevOtp, setEmailDevOtp] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicCooldown, setMagicCooldown] = useState(0);

  const [pendingToken, setPendingToken] = useState("");
  const [pendingRefreshToken, setPendingRefreshToken] = useState<string | undefined>(undefined);
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [showProfilePwd, setShowProfilePwd] = useState(false);

  const [totpTempToken, setTotpTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpUserId, setTotpUserId] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);

  useEffect(() => {
    if (twoFactorPending) {
      setTotpTempToken(twoFactorPending.tempToken);
      setTotpUserId(twoFactorPending.userId);
      setStep("totp");
      setTwoFactorPending(null);
    }
  }, [twoFactorPending]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (emailResendCooldown <= 0) return;
    const t = setTimeout(() => setEmailResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [emailResendCooldown]);

  useEffect(() => {
    if (magicCooldown <= 0) return;
    const t = setTimeout(() => setMagicCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [magicCooldown]);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideXAnim = useRef(new Animated.Value(0)).current;
  const animateTransition = useCallback((cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      cb();
      slideXAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideXAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const clearError = () => setError("");

  const getDeviceFingerprint = useCallback(async (): Promise<string> => {
    try {
      const SecureStore = await import("expo-secure-store");
      const existing = await SecureStore.getItemAsync("device_fingerprint");
      if (existing) return existing;
      const Device = await import("expo-device");
      const parts = [
        Platform.OS,
        Device.osName ?? Platform.OS,
        Device.osVersion ?? "",
        Device.modelName ?? Device.modelId ?? "",
        Device.deviceName ?? "",
      ];
      const fp = parts.filter(Boolean).join("_").replace(/\s+/g, "-").slice(0, 128);
      await SecureStore.setItemAsync("device_fingerprint", fp);
      return fp;
    } catch {
      return `${Platform.OS}_${Platform.Version}_unknown`;
    }
  }, []);

  const handleLoginResult = useCallback(async (res: AuthLoginResponse) => {
    if (res.requires2FA) {
      setTotpTempToken(res.tempToken ?? "");
      setTotpUserId(res.userId ?? "");
      setStep("totp");
      return;
    }
    if (res.pendingApproval) {
      setPendingToken(res.token ?? "");
      setPendingRefreshToken(res.refreshToken);
      setPendingUser((res.user as AppUser) ?? null);
      if (res.token) {
        import("expo-secure-store").then(SS => SS.setItemAsync("ajkmart_pending_token", res.token!)).catch(() => {});
      }
      setStep("pending");
      return;
    }
    if (res.user && !res.user.name) {
      setPendingToken(res.token ?? "");
      setPendingRefreshToken(res.refreshToken);
      setPendingUser((res.user as AppUser) ?? null);
      if (res.token) {
        import("expo-secure-store").then(SS => SS.setItemAsync("ajkmart_pending_token", res.token!)).catch(() => {});
      }
      setStep("complete-profile");
      return;
    }
    if (res.user && res.token) {
      await login(res.user as AppUser, res.token, res.refreshToken);
      router.replace("/(tabs)");
    }
  }, [login]);
  /* FIX 2: Magic link is handled centrally in _layout.tsx MagicLinkHandler.
     Duplicate listener removed to prevent double API calls and race conditions. */

  const checkIdentifier = async () => {
    const id = identifier.trim();
    if (!id) { setError("Enter your phone, email, or username"); return; }
    setLoading(true);
    clearError();
    try {
      const deviceId = await getDeviceFingerprint();
      const res = await authPost("/auth/check-identifier", { identifier: id, role: "customer", deviceId });

      if (res.action === "blocked" || res.isBanned) {
        setError("This account has been suspended. Please contact support.");
        return;
      }
      if (res.action === "locked") {
        setError(`Account locked. Try again in ${res.lockedMinutes} minute(s).`);
        return;
      }
      if (res.action === "registration_closed") {
        setError("New registrations are currently closed.");
        return;
      }
      if (res.action === "no_method") {
        setError("No login methods are currently available. Please contact support.");
        return;
      }
      if (res.action === "register") {
        router.push("/auth/register");
        return;
      }
      if (res.action === "force_google") {
        if (isMethodEnabled(authCfg.googleEnabled)) {
          setMethod("google");
          setStep("method");
        } else {
          setError("This account is linked to Google. Please sign in with Google.");
        }
        return;
      }
      if (res.action === "force_facebook") {
        if (isMethodEnabled(authCfg.facebookEnabled)) {
          setMethod("facebook");
          setStep("method");
        } else {
          setError("This account is linked to Facebook. Please sign in with Facebook.");
        }
        return;
      }
      if (res.action === "send_phone_otp") {
        const normalized = normalizePhone(id);
        setPhone(normalized);
        setMethod("phone");
        setLoading(false); // unblock UI before secondary async send-otp
        const r = await authPost("/auth/send-otp", { phone: `0${normalized}` }).catch((e: unknown) => {
          setError(e instanceof Error ? e.message : T("sendOtpFailed"));
          return null;
        });
        if (r) {
          if (r.otpRequired === false && r.token) {
            await handleLoginResult(r);
            return;
          }
          if (r.otp) setDevOtp(r.otp);
          setOtpChannel(r.channel || "sms");
          setFallbackChannels(r.fallbackChannels || []);
          setResendCooldown(60);
          animateTransition(() => setStep("otp"));
        }
        return;
      }
      if (res.action === "send_email_otp") {
        setEmail(id);
        setMethod("email");
        setLoading(false); // unblock UI before secondary async send-email-otp
        const r = await authPost("/auth/send-email-otp", { email: id }).catch((e: unknown) => {
          setError(e instanceof Error ? e.message : T("sendOtpFailed"));
          return null;
        });
        if (r) {
          if (r.otp) setEmailDevOtp(r.otp);
          setOtpChannel("email");
          setFallbackChannels([]);
          setEmailResendCooldown(60);
          animateTransition(() => setStep("otp"));
        }
        return;
      }
      if (res.action === "send_magic_link" || res.action === "login_password") {
        setUsername(id);
        setMethod(res.action === "send_magic_link" ? "magic" : "username");
        setStep("method");
        return;
      }
      setUsername(id);
      setMethod("username");
      setStep("method");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Check failed. Please try again.";
      setError(msg);
      const match = msg.match(/wait (\d+) (second|minute)/i);
      if (match) {
        const secs = parseInt(match[1]!, 10) * (match[2]!.toLowerCase().startsWith("m") ? 60 : 1);
        setResendCooldown(secs);
      }
    } finally {
      setLoading(false);
    }
  };

  const enabledMethods: { key: LoginMethod; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [];
  if (isMethodEnabled(authCfg.phoneOtpEnabled)) enabledMethods.push({ key: "phone", icon: "call-outline", label: T("phone") });
  if (isMethodEnabled(authCfg.emailOtpEnabled)) enabledMethods.push({ key: "email", icon: "mail-outline", label: T("email") });
  if (isMethodEnabled(authCfg.usernamePasswordEnabled)) enabledMethods.push({ key: "username", icon: "person-outline", label: T("username") });

  const socialMethods: { key: LoginMethod; icon: keyof typeof Ionicons.glyphMap; label: string; color: string }[] = [];
  if (isMethodEnabled(authCfg.googleEnabled)) socialMethods.push({ key: "google", icon: "logo-google", label: "Google", color: "#EA4335" });
  if (isMethodEnabled(authCfg.facebookEnabled)) socialMethods.push({ key: "facebook", icon: "logo-facebook", label: "Facebook", color: "#1877F2" });
  const showMagicLink = isMethodEnabled(authCfg.magicLinkEnabled);
  const showBiometric = isMethodEnabled(authCfg.biometricEnabled) && biometricEnabled;

  const handleSendPhoneOtp = async (preferredChannel?: string) => {
    clearError();
    if (!isValidPakistaniPhone(phone)) { setError("Please enter a valid Pakistani phone number"); return; }
    const normalizedPhone = normalizePhone(phone);
    if (resendCooldown > 0) { setError(`Please wait ${resendCooldown}s before resending.`); return; }
    setLoading(true);
    try {
      const body: Record<string, string> = { phone: normalizedPhone };
      if (preferredChannel) body.preferredChannel = preferredChannel;
      const res = await authPost("/auth/send-otp", body);
      if (res.otpRequired === false && res.token) {
        await handleLoginResult(res);
        setLoading(false);
        return;
      }
      if (res.otp) setDevOtp(res.otp);
      setOtpChannel(res.channel || "sms");
      setFallbackChannels(res.fallbackChannels || []);
      setResendCooldown(60);
      animateTransition(() => setStep("otp"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not send OTP.";
      setError(msg);
      const match = msg.match(/wait (\d+) second/);
      if (match) setResendCooldown(parseInt(match[1]!, 10));
    }
    setLoading(false);
  };

  const handleVerifyPhoneOtp = async () => {
    clearError();
    if (!otp || otp.length < 6) { setError("Please enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const res = await authPost("/auth/verify-otp", { phone: normalizePhone(phone), otp, deviceFingerprint: fingerprint });
      await handleLoginResult(res);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Invalid OTP."); }
    setLoading(false);
  };

  const handleSendEmailOtp = async () => {
    clearError();
    /* FIX 15: Proper email regex validation */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Please enter a valid email address"); return; }
    if (emailResendCooldown > 0) {
      const msg = `Please wait ${emailResendCooldown}s before requesting another OTP`;
      setError(msg);
      showToast(msg, "error");
      return;
    }
    setLoading(true);
    try {
      const res = await authPost("/auth/send-email-otp", { email });
      if (res.otp) setEmailDevOtp(res.otp);
      setOtpChannel("email");
      setFallbackChannels([]);
      setEmailResendCooldown(60);
      animateTransition(() => setStep("otp"));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not send OTP."); }
    setLoading(false);
  };

  const handleVerifyEmailOtp = async () => {
    clearError();
    if (!emailOtp || emailOtp.length < 6) { setError("Please enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const res = await authPost("/auth/verify-email-otp", { email, otp: emailOtp, deviceFingerprint: fingerprint });
      await handleLoginResult(res);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Invalid OTP."); }
    setLoading(false);
  };

  const handleUsernameLogin = async () => {
    clearError();
    if (!username || username.length < 3) { setError("Enter your phone, email, or username"); return; }
    if (!password || password.length < 6) { setError("Please enter your password"); return; }
    setLoading(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const res = await authPost("/auth/login", { identifier: username, password, deviceFingerprint: fingerprint });
      await handleLoginResult(res);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Invalid credentials."); }
    setLoading(false);
  };

  const handleSocialLogin = async (provider: "google" | "facebook") => {
    clearError();
    setLoading(true);
    try {
      const redirectUri = Linking.createURL("auth/callback");
      const WebBrowser = await import("expo-web-browser");
      const googleClientId = authCfg.googleClientId || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      const fbAppId = authCfg.facebookAppId || process.env.EXPO_PUBLIC_FB_APP_ID;

      if (provider === "google") {
        if (!googleClientId) {
          setError("Social login is not configured. Please try another login method.");
          setLoading(false);
          return;
        }
        let nonceBytes: Uint8Array;
        if (typeof crypto !== "undefined" && crypto.getRandomValues) {
          nonceBytes = new Uint8Array(16);
          crypto.getRandomValues(nonceBytes);
        } else {
          const ExpoCrypto = await import("expo-crypto");
          nonceBytes = ExpoCrypto.getRandomBytes(16);
        }
        const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, "0")).join("");
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId)}&response_type=id_token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid%20email%20profile&nonce=${nonce}`;
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
        if (result.type === "success" && result.url) {
          const params = new URL(result.url).hash.slice(1).split("&").reduce<Record<string, string>>((a, p) => {
            const [k, v] = p.split("=");
            a[k!] = decodeURIComponent(v!);
            return a;
          }, {});
          if (params.id_token) {
            const data = await authPost("/auth/social/google", { idToken: params.id_token });
            await handleLoginResult(data);
            setLoading(false);
            return;
          }
        }
      } else {
        if (!fbAppId) {
          setError("Social login is not configured. Please try another login method.");
          setLoading(false);
          return;
        }
        const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${encodeURIComponent(fbAppId)}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=public_profile,email`;
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
        if (result.type === "success" && result.url) {
          const params = new URL(result.url).hash.slice(1).split("&").reduce<Record<string, string>>((a, p) => {
            const [k, v] = p.split("=");
            a[k!] = decodeURIComponent(v!);
            return a;
          }, {});
          if (params.access_token) {
            const data = await authPost("/auth/social/facebook", { accessToken: params.access_token });
            await handleLoginResult(data);
            setLoading(false);
            return;
          }
        }
      }
      setError(`${provider} login cancelled or not configured.`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : `${provider} login failed.`); }
    setLoading(false);
  };

  const handleMagicLink = async () => {
    clearError();
    /* FIX 15: Proper email regex validation */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(magicEmail.trim())) { setError("Please enter a valid email"); return; }
    if (magicCooldown > 0) return;
    setLoading(true);
    try {
      await authPost("/auth/magic-link/send", { email: magicEmail });
      setMagicSent(true);
      setMagicCooldown(60);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not send magic link."); }
    setLoading(false);
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    try {
      const success = await attemptBiometricLogin();
      if (success) {
        router.replace("/(tabs)");
      } else {
        setError("Biometric login failed. Please use another login method.");
      }
    } catch {
      setError("Biometric not available.");
    }
    setBiometricLoading(false);
  };

  const handleTotpVerify = async () => {
    clearError();
    if (!totpCode || totpCode.length < 6) { setError("Please enter the 6-digit code"); return; }
    setLoading(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const res = await authPost("/auth/2fa/verify", {
        tempToken: totpTempToken,
        code: totpCode,
        deviceFingerprint: fingerprint,
      });
      if (trustDevice) {
        try {
          await fetch(`${API}/auth/2fa/trust-device`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${res.token}` },
            body: JSON.stringify({ deviceFingerprint: fingerprint }),
          });
        } catch {}
      }
      await completeTwoFactorLogin(res.user as AppUser, res.token, res.refreshToken);
      router.replace("/(tabs)");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Invalid 2FA code."); }
    setLoading(false);
  };

  const handleTotpBackup = async (code: string) => {
    clearError();
    setLoading(true);
    try {
      const res = await authPost("/auth/2fa/recovery", { tempToken: totpTempToken, backupCode: code });
      await completeTwoFactorLogin(res.user as AppUser, res.token, res.refreshToken);
      router.replace("/(tabs)");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Invalid backup code."); }
    setLoading(false);
  };

  const handleCompleteProfile = async () => {
    clearError();
    if (!profileName || profileName.trim().length < 2) { setError("Please enter your name"); return; }
    setLoading(true);
    try {
      let activeToken = pendingToken;
      if (!activeToken) {
        try {
          const SecureStore = await import("expo-secure-store");
          activeToken = await SecureStore.getItemAsync("ajkmart_pending_token") ?? "";
        } catch {}
      }
      if (!activeToken) {
        setError("Session expired. Please log in again.");
        setLoading(false);
        return;
      }
      /* FIX 11: Split fetch + json so we can inspect status and always show errors */
      const rawRes = await fetch(`${API}/auth/complete-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({
          name: profileName.trim(),
          ...(profileEmail && { email: profileEmail }),
          ...(profileUsername && { username: profileUsername }),
          ...(profilePassword && profilePassword.length >= 8 && { password: profilePassword }),
        }),
      });
      const res = await rawRes.json();
      if (!rawRes.ok || !res.user) {
        setError(res.error || res.message || "Could not save profile. Please try again.");
        setLoading(false);
        return;
      }
      const completeUser: AppUser = {
        walletBalance: 0, isActive: true, createdAt: new Date().toISOString(), ...res.user,
      };
      await login(completeUser, res.token ?? pendingToken, res.refreshToken ?? pendingRefreshToken);
      router.replace("/(tabs)");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not save profile."); }
    setLoading(false);
  };

  const selectMethod = (m: LoginMethod) => {
    if (m === method) return;
    animateTransition(() => {
      setMethod(m);
      clearError();
      setOtp(""); setEmailOtp(""); setDevOtp(""); setEmailDevOtp("");
      setMagicSent(false);
      setMagicEmail("");
    });
  };

  if (step === "totp") {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollGrow} keyboardShouldPersistTaps="handled">
            <View style={[styles.topSection, { paddingTop: topPad + 32 }]}>
              <View style={styles.heroIcon}>
                <Ionicons name="shield-checkmark" size={36} color={C.primary} />
              </View>
              <Text style={styles.heroTitle}>Two-Factor Auth</Text>
              <Text style={styles.heroSubtitle}>
                {useBackup ? "Enter one of your backup codes" : "Enter code from your authenticator app"}
              </Text>
            </View>

            <View style={styles.card}>
              {!useBackup ? (
                <OtpDigitInput
                  value={totpCode}
                  onChangeText={v => { setTotpCode(v); clearError(); }}
                  hasError={!!error}
                  onComplete={() => handleTotpVerify()}
                />
              ) : (
                <InputField
                  value={backupCode}
                  onChangeText={v => { setBackupCode(v); clearError(); }}
                  placeholder="Enter backup code"
                  autoCapitalize="none"
                  autoFocus
                />
              )}

              <Pressable
                onPress={() => setTrustDevice(!trustDevice)}
                style={styles.trustRow}
                accessibilityLabel="Trust this device for 30 days"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: trustDevice }}
              >
                <View style={[styles.checkbox, trustDevice && styles.checkboxChecked]}>
                  {trustDevice && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
                <Text style={styles.trustText}>Trust this device for 30 days</Text>
              </Pressable>

              {error ? <AlertBox type="error" message={error} /> : null}

              <AuthButton
                label="Verify"
                onPress={useBackup ? () => handleTotpBackup(backupCode) : handleTotpVerify}
                loading={loading}
              />

              <Pressable
                onPress={() => { setUseBackup(!useBackup); setBackupCode(""); setTotpCode(""); clearError(); }}
                style={styles.linkBtn}
                accessibilityRole="button"
              >
                <Text style={styles.linkBtnText}>
                  {useBackup ? "Use authenticator app instead" : "Lost your device? Use backup code"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => { setStep("continue"); setTotpCode(""); clearError(); }}
                style={styles.backRow}
                accessibilityRole="button"
              >
                <Ionicons name="arrow-back" size={16} color={C.primary} />
                <Text style={styles.backRowText}>{T("backToLogin")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
    );
  }

  if (step === "pending") {
    return (
      <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} style={styles.flex}>
        <View style={[styles.centeredContainer, { paddingTop: topPad + 40 }]}>
          <View style={styles.pendingCard}>
            <View style={styles.pendingIconWrap}>
              <Ionicons name="time-outline" size={48} color={C.accent} />
            </View>
            <Text style={styles.pendingTitle}>{T("approvalWaiting")}</Text>
            <Text style={styles.pendingSubtitle}>{T("approvalMsg")}</Text>
            <View style={styles.pendingInfoRow}>
              <Ionicons name="information-circle-outline" size={16} color={C.textMuted} />
              <Text style={styles.pendingInfoText}>{T("approvalTimeframe")}</Text>
            </View>
            <Pressable
              style={styles.backRow}
              onPress={() => { setStep("continue"); setOtp(""); setEmailOtp(""); }}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={16} color={C.primary} />
              <Text style={styles.backRowText}>{T("backToLogin")}</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    );
  }

  if (step === "complete-profile") {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollGrow} keyboardShouldPersistTaps="handled">
            <View style={[styles.topSection, { paddingTop: topPad + 32 }]}>
              <View style={styles.heroIcon}>
                <Ionicons name="person" size={36} color={C.primary} />
              </View>
              <Text style={styles.heroTitle}>{T("completeProfileLabel")}</Text>
              <Text style={styles.heroSubtitle}>{T("almostDone")}</Text>
            </View>

            <View style={styles.card}>
              <InputField
                label={T("yourNameRequired")}
                value={profileName}
                onChangeText={v => { setProfileName(v); clearError(); }}
                placeholder={T("enterFullName")}
                autoFocus
                error={!!error && profileName.trim().length < 2}
              />
              <InputField
                label={T("emailOptional")}
                value={profileEmail}
                onChangeText={v => { setProfileEmail(v); clearError(); }}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <InputField
                label={T("usernameOptional")}
                value={profileUsername}
                onChangeText={v => { setProfileUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, "")); clearError(); }}
                placeholder="e.g. ali_ahmed123"
                autoCapitalize="none"
              />
              <InputField
                label={T("passwordOptional")}
                value={profilePassword}
                onChangeText={v => { setProfilePassword(v); clearError(); }}
                placeholder={T("minChars")}
                secureTextEntry={!showProfilePwd}
                rightIcon={showProfilePwd ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowProfilePwd(v => !v)}
              />

              {error ? <AlertBox type="error" message={error} /> : null}

              <AuthButton label={T("saveAndContinue")} onPress={handleCompleteProfile} loading={loading} />

              <Pressable
                onPress={async () => {
                  if (pendingToken && pendingUser) {
                    await login(pendingUser, pendingToken, pendingRefreshToken || undefined);
                    router.replace("/(tabs)");
                  } else { setStep("continue"); setPendingToken(""); }
                }}
                style={styles.linkBtn}
                accessibilityRole="button"
              >
                <Text style={styles.linkBtnText}>{T("doLater")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
      <LinearGradient
        colors={[C.primaryDark, C.primary, C.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.flex}
      >
        {router.canGoBack() && (
          <Pressable
            onPress={() => router.back()}
            style={[styles.backToHome, { top: topPad + 12 }]}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
          >
            <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.9)" />
            <Text style={styles.backToHomeTxt}>Back</Text>
          </Pressable>
        )}

        <View style={[styles.topSection, { paddingTop: topPad + 32 }]}>
          <View style={styles.logoWrap}>
            <View style={styles.logoRing} />
            <View style={styles.logo}>
              <Ionicons name="cart" size={38} color={C.primary} />
            </View>
          </View>
          <Text style={styles.heroTitle}>{appName}</Text>
          <Text style={styles.heroSubtitle}>{appTagline}</Text>
          <View style={styles.secureBadge}>
            <Ionicons name="shield-checkmark" size={12} color="rgba(255,255,255,0.9)" />
            <Text style={styles.secureBadgeText}>Secure Login</Text>
          </View>
        </View>

        <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardContent} keyboardShouldPersistTaps="handled">
          {step === "continue" && (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">Welcome</Text>
              <Text style={styles.sectionSubtitle}>Enter your phone, email, or username to continue</Text>

              {showBiometric && (
                <>
                  <Pressable
                    onPress={handleBiometricLogin}
                    style={styles.biometricQuickBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Login with fingerprint"
                  >
                    {biometricLoading ? (
                      <Text style={styles.biometricQuickTxt}>Authenticating…</Text>
                    ) : (
                      <>
                        <View style={styles.biometricIconWrap}>
                          <Ionicons name="finger-print" size={28} color={C.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.biometricQuickTitle}>Quick Login</Text>
                          <Text style={styles.biometricQuickSub}>Use fingerprint / face ID</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={C.primary} />
                      </>
                    )}
                  </Pressable>

                  <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Text style={styles.orTxt}>or sign in with identifier</Text>
                    <View style={styles.orLine} />
                  </View>
                </>
              )}

              <InputField
                value={identifier}
                onChangeText={v => { setIdentifier(v); clearError(); }}
                placeholder="+923001234567, email, or username"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={checkIdentifier}
                autoFocus={!showBiometric}
              />

              {error ? <AlertBox type="error" message={error} /> : null}

              <AuthButton label="Continue" onPress={checkIdentifier} loading={loading} icon="arrow-forward" />

              {(socialMethods.length > 0 || showMagicLink) && (
                <>
                  <Divider />

                  {socialMethods.map(sm => {
                    const isConfigured = sm.key === "google"
                      ? !!(authCfg.googleClientId || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID)
                      : !!(authCfg.facebookAppId || process.env.EXPO_PUBLIC_FB_APP_ID);
                    return (
                      <SocialButton
                        key={sm.key}
                        provider={sm.label}
                        label={isConfigured ? `Continue with ${sm.label}` : `${sm.label} (Not Available)`}
                        icon={sm.icon}
                        color={sm.color}
                        onPress={() => handleSocialLogin(sm.key as "google" | "facebook")}
                        disabled={!isConfigured}
                      />
                    );
                  })}

                  {showMagicLink && (
                    <>
                      {!magicSent ? (
                        <View style={{ marginTop: 4 }}>
                          <InputField
                            value={magicEmail}
                            onChangeText={setMagicEmail}
                            placeholder="Email for magic link"
                            keyboardType="email-address"
                            autoCapitalize="none"
                          />
                          <SocialButton
                            provider={T("magicLinkLogin")}
                            label="Send Magic Link"
                            icon="link"
                            color={C.info}
                            onPress={handleMagicLink}
                          />
                        </View>
                      ) : (
                        <AlertBox
                          type="success"
                          message={`Magic link sent! Check your email.${magicCooldown > 0 ? ` Resend in ${magicCooldown}s` : ""}`}
                          icon="checkmark-circle"
                        />
                      )}
                    </>
                  )}
                </>
              )}

              <Pressable
                onPress={() => router.push("/auth/register")}
                style={styles.linkBtn}
                accessibilityLabel="Create a new account"
                accessibilityRole="link"
              >
                <Text style={styles.linkBtnText}>
                  New user? <Text style={{ fontFamily: "Inter_700Bold" }}>Create account</Text>
                </Text>
              </Pressable>
            </>
          )}

          {step === "method" && enabledMethods.length > 0 && (
            <>
              {/* Identifier chip — shows who is logging in */}
              <Pressable
                onPress={() => { setStep("continue"); clearError(); }}
                style={styles.identifierChip}
                accessibilityRole="button"
                accessibilityLabel="Change identifier"
              >
                <View style={styles.identifierChipIcon}>
                  <Ionicons name="person-circle" size={18} color={C.primary} />
                </View>
                <Text style={styles.identifierChipTxt} numberOfLines={1}>
                  {identifier || phone || email || username || "You"}
                </Text>
                <View style={styles.identifierChipChange}>
                  <Text style={styles.identifierChipChangeTxt}>Change</Text>
                  <Ionicons name="pencil" size={11} color={C.primary} />
                </View>
              </Pressable>

              {/* Method tabs — clearly separated with active indicator */}
              <Text style={styles.methodLabel}>Choose sign-in method</Text>
              <View style={styles.tabs} accessibilityRole="tablist">
                {enabledMethods.map(m => (
                  <Pressable
                    key={m.key}
                    onPress={() => selectMethod(m.key)}
                    style={[styles.tab, method === m.key && styles.tabActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: method === m.key }}
                    accessibilityLabel={m.label}
                  >
                    <Ionicons name={m.icon} size={15} color={method === m.key ? "#0066FF" : C.textMuted} />
                    <Text style={[styles.tabText, method === m.key && styles.tabTextActive]}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideXAnim }] }}>
            {method === "phone" && step === "method" && (
              <>
                <Text style={styles.sectionTitle}>{T("phoneNumber")}</Text>
                <Text style={styles.sectionSubtitle}>{T("verificationCodeSent")}</Text>
                <PhoneInput
                  value={phone}
                  onChangeText={v => { setPhone(v); clearError(); }}
                />
              </>
            )}

            {method === "phone" && step === "otp" && (
              <>
                <Pressable
                  onPress={() => { setStep("continue"); clearError(); setDevOtp(""); setOtp(""); }}
                  style={styles.backRow}
                  accessibilityRole="button"
                >
                  <Ionicons name="arrow-back" size={16} color={C.primary} />
                  <Text style={styles.backRowText}>{T("changeNumber")}</Text>
                </Pressable>
                <Text style={styles.sectionTitle}>{T("enterOtp")}</Text>
                <Text style={styles.sectionSubtitle}>{T("otpSentToPhone")} +92 {phone}</Text>

                {otpChannel ? <ChannelBadge channel={otpChannel} /> : null}
                <FallbackChannelButtons
                  channels={fallbackChannels}
                  disabled={resendCooldown > 0}
                  onSelect={ch => handleSendPhoneOtp(ch)}
                />

                <OtpDigitInput
                  value={otp}
                  onChangeText={v => { setOtp(v); clearError(); }}
                  hasError={!!error}
                  onComplete={() => handleVerifyPhoneOtp()}
                />

                <DevOtpBanner otp={devOtp} />

                <Pressable
                  onPress={() => handleSendPhoneOtp()}
                  style={[styles.resendBtn, resendCooldown > 0 && styles.resendDisabled]}
                  disabled={resendCooldown > 0}
                  accessibilityLabel={resendCooldown > 0 ? `Resend in ${resendCooldown} seconds` : T("otpResend")}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh-outline" size={16} color={resendCooldown > 0 ? C.textMuted : C.primary} />
                  <Text style={[styles.resendText, resendCooldown > 0 && { color: C.textMuted }]}>
                    {resendCooldown > 0 ? `${T("otpResendIn")} (${resendCooldown}s)` : T("otpResend")}
                  </Text>
                </Pressable>
              </>
            )}

            {method === "email" && step === "method" && (
              <>
                <Text style={styles.sectionTitle}>{T("emailAddress")}</Text>
                <Text style={styles.sectionSubtitle}>{T("enterRegisteredEmail")}</Text>
                <InputField
                  value={email}
                  onChangeText={v => { setEmail(v); clearError(); }}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </>
            )}

            {method === "email" && step === "otp" && (
              <>
                <Pressable
                  onPress={() => { setStep("continue"); clearError(); setEmailDevOtp(""); setEmailOtp(""); }}
                  style={styles.backRow}
                  accessibilityRole="button"
                >
                  <Ionicons name="arrow-back" size={16} color={C.primary} />
                  <Text style={styles.backRowText}>{T("changeEmail")}</Text>
                </Pressable>
                <Text style={styles.sectionTitle}>{T("enterEmailOtp")}</Text>
                <Text style={styles.sectionSubtitle}>{T("otpSentToEmail")} {email}</Text>

                {otpChannel === "email" ? <ChannelBadge channel="email" /> : null}

                <OtpDigitInput
                  value={emailOtp}
                  onChangeText={v => { setEmailOtp(v); clearError(); }}
                  hasError={!!error}
                  onComplete={() => handleVerifyEmailOtp()}
                />

                <DevOtpBanner otp={emailDevOtp} />

                <Pressable
                  onPress={handleSendEmailOtp}
                  style={[styles.resendBtn, emailResendCooldown > 0 && styles.resendDisabled]}
                  disabled={emailResendCooldown > 0}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh-outline" size={16} color={emailResendCooldown > 0 ? C.textMuted : C.primary} />
                  <Text style={[styles.resendText, emailResendCooldown > 0 && { color: C.textMuted }]}>
                    {emailResendCooldown > 0 ? `${T("otpResendIn")} (${emailResendCooldown}s)` : T("otpResend")}
                  </Text>
                </Pressable>
              </>
            )}

            {method === "username" && step === "method" && (
              <>
                <Text style={styles.sectionTitle}>{T("loginViaUsername")}</Text>
                <Text style={styles.sectionSubtitle}>Phone, email, or username</Text>
                <InputField
                  value={username}
                  onChangeText={v => { setUsername(v.trim()); clearError(); }}
                  placeholder="Phone, email, or username"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <InputField
                  value={password}
                  onChangeText={v => { setPassword(v); clearError(); }}
                  placeholder={T("passwordLabel")}
                  secureTextEntry={!showPwd}
                  rightIcon={showPwd ? "eye-off-outline" : "eye-outline"}
                  onRightIconPress={() => setShowPwd(v => !v)}
                />
                <Pressable
                  onPress={() => router.push("/auth/forgot-password")}
                  style={styles.forgotBtn}
                  accessibilityLabel={T("forgotPassword")}
                  accessibilityRole="link"
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </Pressable>
              </>
            )}

            {error && step !== "continue" ? <AlertBox type="error" message={error} /> : null}

            {step === "method" && (
              <>
                <AuthButton
                  label={method === "phone" || method === "email" ? T("sendOtpBtn") : T("loginBtn")}
                  onPress={
                    method === "phone" ? () => handleSendPhoneOtp()
                      : method === "email" ? handleSendEmailOtp
                      : handleUsernameLogin
                  }
                  loading={loading}
                />

                {(socialMethods.length > 0 || showMagicLink || showBiometric) && (
                  <>
                    <Divider />

                    {showBiometric && (
                      <SocialButton
                        provider="Biometrics"
                        label="Login with Biometrics"
                        icon="finger-print"
                        color={C.primary}
                        onPress={handleBiometricLogin}
                        loading={biometricLoading}
                      />
                    )}

                    {socialMethods.map(sm => {
                      const isConfigured = sm.key === "google"
                        ? !!(authCfg.googleClientId || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID)
                        : !!(authCfg.facebookAppId || process.env.EXPO_PUBLIC_FB_APP_ID);
                      return (
                        <SocialButton
                          key={sm.key}
                          provider={sm.label}
                          label={isConfigured ? `Continue with ${sm.label}` : `${sm.label} (Not Available)`}
                          icon={sm.icon}
                          color={sm.color}
                          onPress={() => handleSocialLogin(sm.key as "google" | "facebook")}
                          disabled={!isConfigured}
                        />
                      );
                    })}

                    {showMagicLink && (
                      <>
                        {!magicSent ? (
                          <View style={{ marginTop: 4 }}>
                            <InputField
                              value={magicEmail}
                              onChangeText={setMagicEmail}
                              placeholder="Email for magic link"
                              keyboardType="email-address"
                              autoCapitalize="none"
                            />
                            <SocialButton
                              provider={T("magicLinkLogin")}
                              label="Send Magic Link"
                              icon="link"
                              color={C.info}
                              onPress={handleMagicLink}
                            />
                          </View>
                        ) : (
                          <AlertBox
                            type="success"
                            message={`Magic link sent! Check your email.${magicCooldown > 0 ? ` Resend in ${magicCooldown}s` : ""}`}
                            icon="checkmark-circle"
                          />
                        )}
                      </>
                    )}
                  </>
                )}

                <Pressable
                  onPress={() => router.push("/auth/register")}
                  style={[styles.linkBtn, { marginTop: spacing.xl }]}
                  accessibilityLabel="Create a new account"
                  accessibilityRole="link"
                >
                  <Text style={styles.linkBtnText}>
                    Don't have an account? <Text style={{ fontFamily: "Inter_700Bold" }}>Register</Text>
                  </Text>
                </Pressable>
              </>
            )}

            {step === "otp" && (
              <AuthButton
                label={T("verifyAndContinueBtn")}
                onPress={method === "phone" ? handleVerifyPhoneOtp : handleVerifyEmailOtp}
                loading={loading}
              />
            )}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.footerText}>{T("termsAgreement")}</Text>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollGrow: { flexGrow: 1 },

  topSection: { alignItems: "center", paddingBottom: spacing.xxxl },
  logoWrap: { marginBottom: spacing.lg, position: "relative" },
  logoRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    top: -12,
    left: -12,
  },
  logo: {
    width: 76, height: 76, borderRadius: radii.xxl,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    ...shadows.lg,
  },
  secureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.full,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secureBadgeText: { ...typography.small, color: "rgba(255,255,255,0.9)" },
  heroIcon: {
    width: 76, height: 76, borderRadius: radii.xxl,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    ...shadows.lg, marginBottom: 14,
  },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 30, color: "#fff", marginBottom: 6, textAlign: "center" },
  heroSubtitle: { ...typography.body, color: "rgba(255,255,255,0.85)", textAlign: "center", paddingHorizontal: spacing.xl },

  cardScroll: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, flex: 1 },
  cardContent: { padding: spacing.xxl, paddingBottom: 40, flexGrow: 1 },
  card: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xxl, paddingBottom: 40, flex: 1 },

  centeredContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  pendingCard: { backgroundColor: C.surface, borderRadius: radii.xxl, padding: 28, alignItems: "center", width: "100%", ...shadows.lg },
  pendingIconWrap: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  pendingTitle: { ...typography.h2, color: C.text, marginBottom: 12, textAlign: "center" },
  pendingSubtitle: { ...typography.body, color: C.textMuted, textAlign: "center", marginBottom: 20, lineHeight: 22 },
  pendingInfoRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceSecondary, borderRadius: radii.md, padding: 12, marginBottom: 24, width: "100%" },
  pendingInfoText: { ...typography.caption, color: C.textMuted, flex: 1 },

  sectionTitle: { ...typography.h3, color: C.text, marginBottom: 6 },
  sectionSubtitle: { ...typography.caption, color: C.textMuted, marginBottom: spacing.xl, lineHeight: 18 },

  tabs: { flexDirection: "row", backgroundColor: C.surfaceSecondary, borderRadius: radii.lg, padding: 3, marginBottom: spacing.xl },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radii.md },
  tabActive: { backgroundColor: C.surface, ...shadows.sm, borderBottomWidth: 2, borderBottomColor: "#0066FF" },
  tabText: { ...typography.captionMedium, color: C.textMuted },
  tabTextActive: { color: "#0066FF", fontFamily: "Inter_600SemiBold" },

  identifierChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: radii.full,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  identifierChipIcon: { flexShrink: 0 },
  identifierChipTxt: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#1E40AF" },
  identifierChipChange: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 },
  identifierChipChangeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#0066FF" },
  methodLabel: { ...typography.captionMedium, color: C.textMuted, marginBottom: spacing.sm, marginLeft: 2 },

  trustRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: C.surfaceSecondary, borderRadius: radii.md, marginBottom: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: C.primary, borderColor: C.primary },
  trustText: { ...typography.caption, color: C.textSecondary, flex: 1 },

  resendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginBottom: spacing.md },
  resendDisabled: { opacity: 0.5 },
  resendText: { ...typography.bodyMedium, color: C.primary },

  forgotBtn: { alignSelf: "flex-end", marginBottom: spacing.md, marginTop: -4 },
  forgotText: { ...typography.captionMedium, color: C.primary },

  linkBtn: { alignItems: "center", marginTop: spacing.md },
  linkBtnText: { ...typography.bodyMedium, color: C.primary },
  backRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.lg },
  biometricQuickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: `${C.primary}12`,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: `${C.primary}30`,
  },
  biometricIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: `${C.primary}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  biometricQuickTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: C.text },
  biometricQuickSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary, marginTop: 2 },
  biometricQuickTxt: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.primary, textAlign: "center" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: spacing.sm },
  orLine: { flex: 1, height: 1, backgroundColor: C.border },
  orTxt: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted },

  backToHome: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  backToHomeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.9)" },
  backRowText: { ...typography.bodyMedium, color: C.primary },

  footer: { backgroundColor: C.surface, paddingHorizontal: spacing.xxl, paddingTop: 10, alignItems: "center" },
  footerText: { ...typography.caption, color: C.textMuted, textAlign: "center" },
});
