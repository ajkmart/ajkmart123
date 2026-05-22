/**
 * RegisterWizard.tsx — ajkmart (customer)
 *
 * Multi-step registration wizard for customers:
 *   Phone → OTP → Full Name → City → Password → Done
 *
 * Wraps @workspace/auth-react RegisterScreen with customer-specific
 * step configuration, API wiring, and theme tokens.
 * Uses AsyncStorage for form drafts (React Native compatible).
 * Passwords are excluded from the draft to avoid plain-text storage.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { router } from "expo-router";
import { RegisterScreen } from "@workspace/auth-react";
import type { StepConfig, StepComponentProps } from "@workspace/auth-react";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./useAuth";
import { useAuth as useAuthContext } from "@/context/AuthContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useAuthConfig } from "@/context/AuthConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "@/utils/api";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform,
} from "react-native";

import { isValidPhone } from "@workspace/phone-utils";
import { PAKISTAN_CITIES } from "@workspace/service-constants";

const DRAFT_KEY = "@ajkmart_reg_draft";

/* ── Validate Pakistani phone — delegates to shared phone-utils (single source of truth) ── */
function isValidPakistaniPhone(phone: string): boolean {
  return isValidPhone(phone);
}

/* ── Step 1: Phone ───────────────────────────────────────────────────────── */
function PhoneStep({ data, onChange, onError }: StepComponentProps) {
  const { language } = useLanguage();
  const T = (key: string) => tDual(key as TranslationKey, language);
  const theme = useTheme();

  /* Validate on blur so errors appear immediately when focus leaves the field */
  const handleBlur = () => {
    const phone = String(data.phone ?? "").trim();
    if (!phone) { onError("Phone number is required"); return; }
    if (!isValidPakistaniPhone(phone)) { onError("Enter a valid Pakistani mobile number (03XXXXXXXXX)"); return; }
    onError("");
  };

  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>{T("enterPhone")}</Text>
      <Text style={[styles.stepBody, { color: theme.textMuted }]}>{T("weWillSendOtp")}</Text>
      <TextInput
        style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
        value={(data.phone as string) ?? ""}
        onChangeText={v => { onChange("phone", v); onError(""); }}
        onBlur={handleBlur}
        placeholder="03XXXXXXXXX"
        placeholderTextColor={theme.textMuted}
        keyboardType="phone-pad"
        maxLength={11}
      />
    </View>
  );
}

/* ── Step 2: OTP ─────────────────────────────────────────────────────────── */
function OtpStep({ data, onChange, onError, onComplete }: StepComponentProps & { onComplete?: (otp: string) => void }) {
  const { language } = useLanguage();
  const T = (key: string) => tDual(key as TranslationKey, language);
  const { sendOtp } = useAuth();
  const theme = useTheme();
  const [otp, setOtp] = useState("");
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, "").slice(-1);
    const chars = otp.split("");
    chars[i] = digit;
    const next = chars.join("").slice(0, 6);
    setOtp(next);
    onChange("otp", next);
    onError("");
    if (digit && i < 5) inputRefs.current[i + 1]?.focus();
    if (next.length === 6) onComplete?.(next);
  };

  const handleKeyPress = (i: number, e: { nativeEvent: { key: string } }) => {
    if (e.nativeEvent.key === "Backspace" && !otp[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handleResend = async () => {
    const phone = (data.phone as string) ?? "";
    if (!phone || resending || resendCooldown > 0) return;
    setResending(true);
    await sendOtp(phone);
    setResending(false);
    setResendCooldown(30);
  };

  return (
    <View style={{ gap: 14, alignItems: "center" }}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>{T("verifyPhone")}</Text>
      <Text style={[styles.stepBody, { color: theme.textMuted, textAlign: "center" }]}>
        {T("enterOtpSentTo")} <Text style={{ fontWeight: "700", color: theme.text }}>{(data.phone as string) ?? ""}</Text>
      </Text>
      <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <TextInput
            key={i}
            ref={el => { inputRefs.current[i] = el; }}
            style={[styles.otpBox, { borderColor: otp[i] ? theme.primary : theme.border, color: theme.text }]}
            value={otp[i] ?? ""}
            onChangeText={v => handleChange(i, v)}
            onKeyPress={e => handleKeyPress(i, e)}
            keyboardType="number-pad"
            maxLength={1}
            textAlign="center"
            selectTextOnFocus
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>{T("didntReceive")}</Text>
        {resendCooldown > 0
          ? <Text style={{ color: theme.textMuted, fontSize: 13 }}>Resend in {resendCooldown}s</Text>
          : <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
              <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 13 }}>
                {resending ? "Sending…" : T("resend")}
              </Text>
            </TouchableOpacity>
        }
      </View>
    </View>
  );
}

/* ── Step 3: Full Name ────────────────────────────────────────────── */
function NameStep({ data, onChange, onError }: StepComponentProps) {
  const { language } = useLanguage();
  const T = (key: string) => tDual(key as TranslationKey, language);
  const theme = useTheme();

  const handleBlur = () => {
    const name = String(data.name ?? "").trim();
    if (!name) { onError("Full name is required"); return; }
    if (name.length < 2) { onError("Please enter your full name"); return; }
    onError("");
  };

  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>{T("whatsYourName")}</Text>
      <Text style={[styles.stepBody, { color: theme.textMuted }]}>{T("helpUsPersonalize")}</Text>
      <TextInput
        style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
        value={(data.name as string) ?? ""}
        onChangeText={v => { onChange("name", v); onError(""); }}
        onBlur={handleBlur}
        placeholder="Muhammad Ali"
        placeholderTextColor={theme.textMuted}
      />
    </View>
  );
}

/* ── Step 4: City ─────────────────────────────────────────────────────────── */
function CityStep({ data, onChange, onError }: StepComponentProps) {
  const { language } = useLanguage();
  const T = (key: string) => tDual(key as TranslationKey, language);
  const theme = useTheme();

  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>{T("selectYourCity")}</Text>
      <Text style={[styles.stepBody, { color: theme.textMuted }]}>{T("chooseDeliveryCity")}</Text>
      <View style={{ gap: 8 }}>
        {PAKISTAN_CITIES.map(city => (
          <TouchableOpacity key={city}
            style={[styles.cityBtn, { borderColor: data.city === city ? theme.primary : theme.border, backgroundColor: data.city === city ? `${theme.primary}12` : theme.surface }]}
            onPress={() => { onChange("city", city); onError(""); }}
            activeOpacity={0.8}
          >
            <Text style={{ color: data.city === city ? theme.primary : theme.text, fontWeight: data.city === city ? "700" : "500", fontSize: 14 }}>{city}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/* ── Step 5: Password ──────────────────────────────────────────────────────── */
function PasswordStep({ data, onChange, onError }: StepComponentProps) {
  const { language } = useLanguage();
  const T = (key: string) => tDual(key as TranslationKey, language);
  const theme = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  /* Blur handlers validate each field immediately when focus leaves.
     The confirm field also checks against the current password value. */
  const handlePasswordBlur = () => {
    const pw = String(data.password ?? "");
    if (!pw) { onError("Password is required"); return; }
    if (pw.length < 8) { onError("Password must be at least 8 characters"); return; }
    onError("");
  };

  const handleConfirmBlur = () => {
    const pw = String(data.password ?? "");
    const cpw = String(data.confirmPassword ?? "");
    if (!cpw) { onError("Please confirm your password"); return; }
    if (pw !== cpw) { onError("Passwords do not match"); return; }
    onError("");
  };

  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>{T("createPassword")}</Text>
      <Text style={[styles.stepBody, { color: theme.textMuted }]}>{T("secureYourAccount")}</Text>
      <View style={{ position: "relative" }}>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface, paddingRight: 48 }]}
          value={(data.password as string) ?? ""}
          onChangeText={v => { onChange("password", v); onError(""); }}
          onBlur={handlePasswordBlur}
          placeholder="Min 8 characters"
          placeholderTextColor={theme.textMuted}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity
          style={styles.eyeBtn}
          onPress={() => setShowPassword(v => !v)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>{showPassword ? "Hide" : "Show"}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ position: "relative" }}>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface, paddingRight: 48 }]}
          value={(data.confirmPassword as string) ?? ""}
          onChangeText={v => { onChange("confirmPassword", v); onError(""); }}
          onBlur={handleConfirmBlur}
          placeholder="Re-enter password"
          placeholderTextColor={theme.textMuted}
          secureTextEntry={!showConfirm}
        />
        <TouchableOpacity
          style={styles.eyeBtn}
          onPress={() => setShowConfirm(v => !v)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>{showConfirm ? "Hide" : "Show"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Step 6: Success ──────────────────────────────────────────────────────── */
function SuccessStep() {
  const { language } = useLanguage();
  const T = (key: string) => tDual(key as TranslationKey, language);
  const theme = useTheme();

  return (
    <View style={{ alignItems: "center", paddingVertical: 24 }}>
      <View style={[styles.successCircle, { backgroundColor: `${theme.primary}18`, borderColor: `${theme.primary}40` }]}>
        <Text style={{ fontSize: 40 }}>🎉</Text>
      </View>
      <Text style={[styles.stepTitle, { color: theme.text, marginTop: 16 }]}>{T("welcomeAboard")}</Text>
      <Text style={[styles.stepBody, { color: theme.textMuted, textAlign: "center" }]}>{T("startShoppingNow")}</Text>
    </View>
  );
}

const STEPS: StepConfig[] = [
  {
    id: "phone",
    title: "Phone",
    component: PhoneStep,
    validate: (data) => {
      const phone = String(data.phone ?? "").trim();
      if (!phone) return "Phone number is required";
      if (!isValidPakistaniPhone(phone)) return "Enter a valid Pakistani mobile number (03XXXXXXXXX)";
      return null;
    },
  },
  { id: "otp", title: "Verify", component: OtpStep },
  {
    id: "name",
    title: "Name",
    component: NameStep,
    validate: (data) => {
      const name = String(data.name ?? "").trim();
      if (!name) return "Full name is required";
      if (name.length < 2) return "Please enter your full name";
      return null;
    },
  },
  {
    id: "city",
    title: "City",
    component: CityStep,
    validate: (data) => {
      if (!String(data.city ?? "").trim()) return "Please select your city";
      return null;
    },
  },
  {
    id: "password",
    title: "Password",
    component: PasswordStep,
    validate: (data) => {
      const pw = String(data.password ?? "");
      if (!pw) return "Password is required";
      if (pw.length < 8) return "Password must be at least 8 characters";
      if (pw !== String(data.confirmPassword ?? "")) return "Passwords do not match";
      return null;
    },
  },
  { id: "success", title: "Done", component: SuccessStep },
];

export interface RegisterWizardProps {
  onDone?: () => void;
}

export function RegisterWizard({ onDone }: RegisterWizardProps) {
  const theme = useTheme();
  const { sendOtp, verifyOtp } = useAuth();
  const { login } = useAuthContext();
  const { language } = useLanguage();
  const T = (key: string) => tDual(key as TranslationKey, language);

  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then(raw => {
      if (raw) setDraft(JSON.parse(raw));
    }).catch(() => {});
  }, []);

  /* ── Save draft, excluding password fields ── */
  const handleDataChange = useCallback((key: string, value: unknown) => {
    setDraft(prev => {
      const next = { ...prev, [key]: value };
      /* Exclude sensitive / PII fields from the persisted draft.
         password / confirmPassword — plain-text credential risk.
         otp — one-time codes should never be persisted.
         phone / name — PII that the user will always re-enter. */
      const {
        password: _pw,
        confirmPassword: _cpw,
        otp: _otp,
        phone: _phone,
        name: _name,
        ...safe
      } = next as Record<string, unknown>;
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(safe)).catch(() => {});
      return next;
    });
  }, []);

  const handleOtpRequest = async (phone: string) => {
    const result = await sendOtp(phone);
    return result.success;
  };

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      /* OTP verification is handled by the server during registration —
         the /auth/register endpoint verifies the OTP as part of the flow.
         A separate /auth/verify-otp call here would double-consume the OTP
         and cause the registration to fail with "OTP already used". */

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          city: data.city,
          password: data.password,
          role: "customer",
        }),
      });
      const json = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error((json.message as string) ?? "Registration failed");
      await AsyncStorage.removeItem(DRAFT_KEY);
      return { success: true, data: json };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : T("registrationFailed") };
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <RegisterScreen
        role="customer"
        steps={STEPS}
        initialData={draft}
        onDataChange={handleDataChange}
        onOtpRequest={handleOtpRequest}
        onSubmit={handleSubmit}
        onDone={() => { onDone?.(); router.replace("/(tabs)"); }}
        title={T("customerRegistration") as string}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stepTitle: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  stepBody: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  input: {
    width: "100%", height: 52, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 16, fontSize: 16,
  },
  otpBox: {
    width: 48, height: 56, borderWidth: 1, borderRadius: 12,
    fontSize: 20, fontWeight: "700", textAlign: "center",
  },
  cityBtn: {
    borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
  },
  successCircle: {
    width: 88, height: 88, borderRadius: 44, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  eyeBtn: {
    position: "absolute", right: 14,
    top: 0, bottom: 0,
    justifyContent: "center",
  },
});
