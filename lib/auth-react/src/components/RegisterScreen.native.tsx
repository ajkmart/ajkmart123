import React, { useState } from "react";
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
import { OtpInput } from "./OtpInput.native";
import { PhoneInput } from "./PhoneInput.native";

export type RegisterRole = "rider" | "vendor" | "customer";

export interface FieldConfig {
  id: string;
  type:
    | "text"
    | "email"
    | "phone"
    | "password"
    | "confirm-password"
    | "otp"
    | "select"
    | "checkbox";
  label?: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  validate?: (value: unknown, allData: Record<string, unknown>) => string | null;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}

export interface StepComponentProps {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onError: (msg: string) => void;
  onNext: () => void;
  role: RegisterRole;
}

export interface StepConfig {
  id: string;
  title: string;
  subtitle?: string;
  fields: FieldConfig[];
  component?: React.ComponentType<StepComponentProps>;
  validate?: (data: Record<string, unknown>) => string | null;
}

export interface RegisterScreenProps {
  role: RegisterRole;
  steps: StepConfig[];
  onComplete: (data: Record<string, unknown>) => void | Promise<void>;
  baseURL?: string;
  title?: string;
}

const ROLE_ACCENT: Record<RegisterRole, string> = {
  customer: "#f59e0b",
  rider: "#3b82f6",
  vendor: "#8b5cf6",
};

function isOtpStep(step: StepConfig): boolean {
  return step.fields.some((f) => f.type === "otp");
}

function getOtpPhone(data: Record<string, unknown>): string {
  return (data["phone"] as string) ?? (data["phoneE164"] as string) ?? "";
}

function getOtpEmail(data: Record<string, unknown>): string {
  return (data["email"] as string) ?? "";
}

export function RegisterScreen({
  role,
  steps,
  onComplete,
  baseURL = "",
  title,
}: RegisterScreenProps) {
  const accent = ROLE_ACCENT[role];
  const displayTitle = title ?? "Create Account";

  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [completed, setCompleted] = useState(false);

  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  function updateField(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  function validateStep(): string | null {
    if (currentStep.validate) {
      return currentStep.validate(formData);
    }
    for (const field of currentStep.fields) {
      if (field.type === "otp") continue;
      const val = formData[field.id];
      if (field.required && !val) {
        return `${field.label ?? field.id} is required`;
      }
      if (field.validate) {
        const msg = field.validate(val, formData);
        if (msg) return msg;
      }
      if (field.type === "confirm-password") {
        if (val !== formData["password"]) return "Passwords do not match";
      }
    }
    return null;
  }

  async function sendOtp() {
    const phone = getOtpPhone(formData);
    const email = getOtpEmail(formData);
    setLoading(true);
    try {
      if (phone) {
        const res = await fetch(`${baseURL}/api/auth/send-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const json = (await res.json()) as Record<string, unknown>;
        if (!res.ok)
          throw new Error(
            (json.message as string) ?? (json.error as string) ?? "Failed to send OTP"
          );
        if (json.otp) setDevOtp(json.otp as string);
      } else if (email) {
        const res = await fetch(`${baseURL}/api/auth/send-email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const json = (await res.json()) as Record<string, unknown>;
        if (!res.ok)
          throw new Error(
            (json.message as string) ?? (json.error as string) ?? "Failed to send OTP"
          );
        if (json.otp) setDevOtp(json.otp as string);
      }
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send OTP");
    }
    setLoading(false);
  }

  async function verifyOtp(otp: string) {
    const phone = getOtpPhone(formData);
    const email = getOtpEmail(formData);
    setLoading(true);
    try {
      const endpoint = phone ? "/api/auth/verify-otp" : "/api/auth/verify-email-otp";
      const body = phone ? { phone, otp } : { email, otp };
      const res = await fetch(`${baseURL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok)
        throw new Error((json.message as string) ?? (json.error as string) ?? "Invalid OTP");
      const merged = {
        ...formData,
        ...(typeof json.data === "object" ? (json.data as Record<string, unknown>) : json),
      };
      setFormData(merged);
      if (isLastStep) {
        setCompleted(true);
        await onComplete(merged);
      } else {
        setStepIndex((i) => i + 1);
        setOtpSent(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP verification failed");
    }
    setLoading(false);
  }

  async function handleNext() {
    setError("");

    if (isOtpStep(currentStep)) {
      if (!otpSent) {
        await sendOtp();
      }
      return;
    }

    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isLastStep) {
      setLoading(true);
      try {
        await onComplete(formData);
        setCompleted(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Registration failed");
      }
      setLoading(false);
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleBack() {
    setError("");
    if (isOtpStep(currentStep) && otpSent) {
      setOtpSent(false);
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
  }

  if (completed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.completedEmoji}>✅</Text>
        <Text style={[styles.cardTitle, { textAlign: "center" }]}>Registration Complete</Text>
        <Text style={styles.subtitle}>Your application has been submitted successfully.</Text>
      </View>
    );
  }

  const StepComponent = currentStep.component;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.subtitle}>{currentStep.subtitle ?? currentStep.title}</Text>

          <View style={styles.progressRow}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i === stepIndex && styles.progressDotActive,
                  i < stepIndex && { backgroundColor: accent },
                  i === stepIndex && { backgroundColor: accent },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {__DEV__ && devOtp ? (
            <View style={styles.devOtpBox}>
              <Text style={styles.devOtpLabel}>Dev OTP</Text>
              <Text style={styles.devOtpCode}>{devOtp}</Text>
            </View>
          ) : null}

          {StepComponent ? (
            <StepComponent
              data={formData}
              onChange={updateField}
              onError={setError}
              onNext={() => void handleNext()}
              role={role}
            />
          ) : isOtpStep(currentStep) && otpSent ? (
            <OtpInput onComplete={(otp) => void verifyOtp(otp)} onResend={() => void sendOtp()} />
          ) : (
            currentStep.fields
              .filter((f) => f.type !== "otp")
              .map((field) => (
                <View key={field.id} style={styles.fieldWrap}>
                  {field.label ? <Text style={styles.label}>{field.label}</Text> : null}

                  {field.type === "phone" ? (
                    <PhoneInput
                      value={(formData[field.id] as string) ?? ""}
                      onChange={(e164) => {
                        updateField(field.id, e164);
                      }}
                      disabled={loading}
                    />
                  ) : field.type === "select" ? (
                    <View style={styles.selectContainer}>
                      {field.options?.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.selectOption,
                            (formData[field.id] as string) === opt.value && {
                              borderColor: accent,
                              backgroundColor: `${accent}15`,
                            },
                          ]}
                          onPress={() => {
                            updateField(field.id, opt.value);
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{
                            selected: (formData[field.id] as string) === opt.value,
                          }}
                        >
                          <Text
                            style={[
                              styles.selectOptionText,
                              (formData[field.id] as string) === opt.value && {
                                color: accent,
                                fontWeight: "700",
                              },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : field.type === "checkbox" ? (
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => {
                        updateField(field.id, !formData[field.id]);
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!formData[field.id] }}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          !!formData[field.id] && { borderColor: accent, backgroundColor: accent },
                        ]}
                      >
                        {!!formData[field.id] && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.checkboxLabel}>{field.label}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TextInput
                      style={styles.input}
                      value={(formData[field.id] as string) ?? ""}
                      onChangeText={(v) => {
                        updateField(field.id, v);
                      }}
                      placeholder={field.placeholder}
                      placeholderTextColor="#9ca3af"
                      secureTextEntry={
                        field.type === "password" ||
                        field.type === "confirm-password" ||
                        field.secureTextEntry
                      }
                      keyboardType={
                        field.keyboardType ?? (field.type === "email" ? "email-address" : "default")
                      }
                      autoCapitalize={
                        field.autoCapitalize ?? (field.type === "email" ? "none" : "sentences")
                      }
                      autoCorrect={false}
                      editable={!loading}
                    />
                  )}
                </View>
              ))
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: accent }, loading && styles.btnDisabled]}
            onPress={() => void handleNext()}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {isOtpStep(currentStep) && !otpSent
                  ? "Send Code"
                  : isOtpStep(currentStep) && otpSent
                    ? "Resend Code"
                    : isLastStep
                      ? "Complete Registration"
                      : "Next →"}
              </Text>
            )}
          </TouchableOpacity>

          {stepIndex > 0 && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={handleBack}
              accessibilityRole="button"
            >
              <Text style={[styles.backBtnText, { color: accent }]}>← Back</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f9fafb" },
  scrollContent: { flexGrow: 1, padding: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  completedEmoji: { fontSize: 48, marginBottom: 16, textAlign: "center" },
  header: { marginBottom: 20, alignItems: "center" },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 12 },
  cardTitle: { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 4 },
  progressRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 8 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#e5e7eb" },
  progressDotActive: { width: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  errorText: { color: "#b91c1c", fontSize: 13 },
  devOtpBox: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  devOtpLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#92400e",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  devOtpCode: { fontSize: 22, fontWeight: "800", color: "#78350f", letterSpacing: 6 },
  fieldWrap: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  selectContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selectOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
  },
  selectOptionText: { fontSize: 14, color: "#374151" },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: { color: "#fff", fontSize: 12, fontWeight: "700" },
  checkboxLabel: { flex: 1, fontSize: 13, color: "#6b7280", lineHeight: 18 },
  btn: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  backBtn: { alignItems: "center", paddingVertical: 12 },
  backBtnText: { fontSize: 13, fontWeight: "600" },
});
