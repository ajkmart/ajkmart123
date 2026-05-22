import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type { AuthTheme } from "../context/ThemeContext";
import { useAuthTheme } from "../context/ThemeContext";
import { OtpInput } from "./OtpInput.native";

export type AppRole = "customer" | "vendor" | "rider" | "admin";

export interface SocialMethod {
  key: string;
  label: string;
  color?: string;
}

export interface LoginScreenProps {
  role?: AppRole;
  baseURL?: string;
  onSuccess?: (result: Record<string, unknown>) => void | Promise<void>;
  onRegisterPress?: () => void;
  enableBiometric?: boolean;
  onBiometricPress?: () => void;
  biometricLoading?: boolean;
  renderTopBanner?: () => React.ReactNode;
  title?: string;
  subtitle?: string;
  tncUrl?: string;
  privacyUrl?: string;
  onTncPress?: () => void;
  onPrivacyPress?: () => void;
  footerText?: string;
  enabledMethods?: string[];
  /** Social providers to show as buttons (Google, Facebook). Handler lives in host app. */
  socialMethods?: SocialMethod[];
  /** Called when user taps a social provider button or check-identifier forces one. */
  onSocialPress?: (provider: "google" | "facebook") => void | Promise<void>;
  /** Show magic link section below social buttons. */
  showMagicLink?: boolean;
  /** Called when magic link section requests send. If not provided, LoginScreen handles internally. */
  onMagicLinkRequest?: (email: string) => Promise<void>;
  onForgotPasswordPress?: () => void;
}

type InternalStep =
  | "identifier"
  | "phone-send"
  | "phone-otp"
  | "email-send"
  | "email-otp"
  | "password"
  | "magic";

async function apiPost(
  baseURL: string,
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.message as string) ?? (json.error as string) ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (json.data as Record<string, unknown>) ?? json;
}

function makeStyles(theme: AuthTheme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingBottom: 32 },
    header: {
      alignItems: "center",
      paddingTop: 32,
      paddingBottom: 24,
      paddingHorizontal: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: "700",
      color: theme.onPrimary,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      color: theme.onPrimary,
      opacity: 0.85,
      marginTop: 6,
      textAlign: "center",
    },
    card: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      flex: 1,
      padding: 24,
      paddingBottom: 40,
    },
    label: { fontSize: 13, fontWeight: "500", color: theme.textMuted, marginBottom: 8 },
    input: {
      borderWidth: 1.5,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: theme.text,
      backgroundColor: theme.background,
      marginBottom: 12,
    },
    pwdRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 0 },
    eyeBtn: { padding: 10 },
    eyeText: { fontSize: 18 },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
      marginBottom: 12,
    },
    primaryBtnDisabled: { opacity: 0.7 },
    primaryBtnText: { color: theme.onPrimary, fontSize: 16, fontWeight: "600" },
    biometricBtn: {
      borderWidth: 1.5,
      borderColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 12,
      backgroundColor: theme.primaryLight,
    },
    biometricBtnText: { color: theme.primary, fontSize: 15, fontWeight: "600" },
    socialBtn: {
      borderWidth: 1.5,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 10,
      backgroundColor: theme.surface,
    },
    socialBtnText: { fontSize: 15, fontWeight: "600" },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 12,
      gap: 8,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: theme.border },
    dividerText: { fontSize: 12, color: theme.textMuted, fontWeight: "500" },
    linkBtn: { alignItems: "center", marginTop: 12, paddingVertical: 6 },
    linkBtnText: { fontSize: 14, color: theme.textMuted },
    linkBtnBold: { fontWeight: "700", color: theme.primary },
    errorBox: {
      backgroundColor: theme.errorBackground,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.errorBorder,
    },
    errorText: { color: theme.error, fontSize: 13, fontWeight: "500" },
    successBox: {
      backgroundColor: theme.primaryLight,
      borderRadius: 8,
      padding: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border,
    },
    successText: { color: theme.primary, fontSize: 14, fontWeight: "600" },
    backRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
    backText: { fontSize: 14, fontWeight: "600", color: theme.primary },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.text,
      marginBottom: 4,
    },
    sectionSub: { fontSize: 13, color: theme.textMuted, marginBottom: 16 },
    centerCol: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 40,
      gap: 16,
    },
    sendingText: { fontSize: 14, color: theme.textMuted },
    forgotBtn: { alignSelf: "flex-end", marginTop: 4, marginBottom: 8 },
    forgotText: { fontSize: 13, fontWeight: "600", color: theme.primary },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingTop: 16,
      flexWrap: "wrap",
      gap: 4,
    },
    footerLink: {
      fontSize: 12,
      color: theme.primary,
      textDecorationLine: "underline",
    },
    footerSep: { fontSize: 12, color: theme.textMuted },
    footerText: { fontSize: 12, color: theme.textMuted, textAlign: "center" },
  });
}

export function LoginScreen({
  role = "customer",
  baseURL = "",
  onSuccess,
  onRegisterPress,
  enableBiometric = false,
  onBiometricPress,
  biometricLoading = false,
  renderTopBanner,
  title = "Sign In",
  subtitle,
  onTncPress,
  onPrivacyPress,
  footerText,
  socialMethods = [],
  onSocialPress,
  showMagicLink = false,
  onMagicLinkRequest,
  onForgotPasswordPress,
}: LoginScreenProps) {
  const theme = useAuthTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [step, setStep] = useState<InternalStep>("identifier");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [socialLoading, setSocialLoading] = useState("");

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCooldown(secs = 60) {
    setResendCooldown(secs);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function clearError() {
    setError("");
  }

  function goBack() {
    fadeAnim.setValue(0);
    setStep("identifier");
    setOtp("");
    setError("");
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }

  const checkIdentifier = useCallback(async () => {
    const id = identifier.trim();
    if (!id) {
      setError("Enter your phone, email, or username");
      return;
    }
    setLoading(true);
    clearError();
    try {
      const res = await apiPost(baseURL, "/api/auth/check-identifier", {
        identifier: id,
        role,
      });

      if (res.action === "blocked" || res.isBanned) {
        setError("This account has been suspended. Please contact support.");
        setLoading(false);
        return;
      }
      if (res.action === "locked") {
        setError(`Account locked. Try again in ${res.lockedMinutes as number} minute(s).`);
        setLoading(false);
        return;
      }
      if (res.action === "registration_closed") {
        setError("New registrations are currently closed.");
        setLoading(false);
        return;
      }
      if (res.action === "no_method") {
        setError("No login methods are currently available. Please contact support.");
        setLoading(false);
        return;
      }
      if (res.action === "register") {
        onRegisterPress?.();
        setLoading(false);
        return;
      }
      if (res.action === "force_google") {
        setLoading(false);
        await onSocialPress?.("google");
        return;
      }
      if (res.action === "force_facebook") {
        setLoading(false);
        await onSocialPress?.("facebook");
        return;
      }
      if (res.action === "send_phone_otp") {
        setPhone(id);
        setLoading(false);
        await sendPhoneOtp(id);
        return;
      }
      if (res.action === "send_email_otp") {
        setEmail(id);
        setLoading(false);
        await sendEmailOtp(id);
        return;
      }
      if (res.action === "send_magic_link") {
        setUsername(id);
        setLoading(false);
        setStep("magic");
        return;
      }
      if (res.action === "login_password") {
        setUsername(id);
        setLoading(false);
        setStep("password");
        return;
      }
      setUsername(id);
      setLoading(false);
      setStep("password");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed. Try again.");
      setLoading(false);
    }
  }, [identifier, baseURL, role, onRegisterPress, onSocialPress]);

  async function sendPhoneOtp(phoneVal: string) {
    setLoading(true);
    clearError();
    try {
      const res = await apiPost(baseURL, "/api/auth/send-otp", {
        phone: phoneVal,
      });
      if (res.otpRequired === false && res.token) {
        await onSuccess?.(res);
        return;
      }
      startCooldown(60);
      setStep("phone-otp");
      setOtp("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send OTP.");
      setStep("identifier");
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailOtp(emailVal: string) {
    setLoading(true);
    clearError();
    try {
      const res = await apiPost(baseURL, "/api/auth/send-email-otp", {
        email: emailVal,
      });
      if (res.otpRequired === false && res.token) {
        await onSuccess?.(res);
        return;
      }
      startCooldown(60);
      setStep("email-otp");
      setOtp("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send OTP.");
      setStep("identifier");
    } finally {
      setLoading(false);
    }
  }

  async function verifyPhoneOtp() {
    if (!otp || otp.length < 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    clearError();
    try {
      const res = await apiPost(
        baseURL,
        "/api/auth/verify-otp",
        { phone, otp },
        { "X-App-Id": role }
      );
      await onSuccess?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmailOtp() {
    if (!otp || otp.length < 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    clearError();
    try {
      const res = await apiPost(
        baseURL,
        "/api/auth/verify-email-otp",
        { email, otp },
        { "X-App-Id": role }
      );
      await onSuccess?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin() {
    if (!password || password.length < 6) {
      setError("Enter your password");
      return;
    }
    setLoading(true);
    clearError();
    try {
      const res = await apiPost(baseURL, "/api/auth/login", {
        identifier: username,
        password,
      });
      await onSuccess?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    const addr = magicEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    clearError();
    try {
      if (onMagicLinkRequest) {
        await onMagicLinkRequest(addr);
      } else {
        await apiPost(baseURL, "/api/auth/magic-link/send", { email: addr });
      }
      setMagicSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send magic link.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: "google" | "facebook") {
    if (!onSocialPress) return;
    setSocialLoading(provider);
    try {
      await onSocialPress(provider);
    } finally {
      setSocialLoading("");
    }
  }

  const isOtpStep = step === "phone-otp" || step === "email-otp";
  const otpOnResend = step === "phone-otp" ? () => sendPhoneOtp(phone) : () => sendEmailOtp(email);
  const otpOnVerify = step === "phone-otp" ? verifyPhoneOtp : verifyEmailOtp;
  const otpSubtitle = step === "phone-otp" ? `Code sent to ${phone}` : `Code sent to ${email}`;

  const hasSocial = socialMethods.length > 0 && !!onSocialPress;

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
        {title ? (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}

        {renderTopBanner ? renderTopBanner() : null}

        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ── Identifier step ─────────────────────────────────────── */}
          {step === "identifier" && (
            <Animated.View style={{ opacity: fadeAnim }}>
              <Text style={styles.label}>Phone, email, or username</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={(v) => {
                  setIdentifier(v);
                  clearError();
                }}
                placeholder="+923001234567, email, or username"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={!enableBiometric}
                returnKeyType="go"
                onSubmitEditing={checkIdentifier}
                editable={!loading}
              />

              <Btn label="Continue" onPress={checkIdentifier} loading={loading} styles={styles} />

              {enableBiometric && onBiometricPress ? (
                <>
                  <DividerRow text="or" styles={styles} />
                  <TouchableOpacity
                    style={styles.biometricBtn}
                    onPress={onBiometricPress}
                    disabled={biometricLoading}
                    accessibilityLabel="Login with Biometrics"
                    accessibilityRole="button"
                  >
                    {biometricLoading ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <Text style={styles.biometricBtnText}>Login with Biometrics</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : null}

              {/* Social login buttons */}
              {hasSocial ? (
                <>
                  <DividerRow text="or continue with" styles={styles} />
                  {socialMethods.map((sm) => (
                    <TouchableOpacity
                      key={sm.key}
                      style={[styles.socialBtn, { borderColor: sm.color ?? theme.border }]}
                      onPress={() => handleSocialLogin(sm.key as "google" | "facebook")}
                      disabled={!!loading || !!socialLoading}
                      accessibilityRole="button"
                      accessibilityLabel={`Continue with ${sm.label}`}
                    >
                      {socialLoading === sm.key ? (
                        <ActivityIndicator size="small" color={sm.color ?? theme.text} />
                      ) : (
                        <Text style={[styles.socialBtnText, { color: sm.color ?? theme.text }]}>
                          Continue with {sm.label}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}

              {/* Magic link section */}
              {showMagicLink ? (
                <>
                  <DividerRow text="or magic link" styles={styles} />
                  {!magicSent ? (
                    <>
                      <TextInput
                        style={styles.input}
                        value={magicEmail}
                        onChangeText={setMagicEmail}
                        placeholder="Email for magic link"
                        placeholderTextColor={theme.textMuted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={!loading}
                      />
                      <Btn
                        label="Send Magic Link"
                        onPress={handleMagicLink}
                        loading={loading}
                        style={{ backgroundColor: theme.textMuted }}
                        styles={styles}
                      />
                    </>
                  ) : (
                    <View style={styles.successBox}>
                      <Text style={styles.successText}>Magic link sent! Check your email.</Text>
                    </View>
                  )}
                </>
              ) : null}

              {onRegisterPress ? (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={onRegisterPress}
                  accessibilityRole="link"
                >
                  <Text style={styles.linkBtnText}>New user?</Text>
                  <Text style={styles.linkBtnBold}>Create account</Text>
                </TouchableOpacity>
              ) : null}
            </Animated.View>
          )}

          {/* ── Sending OTP spinner ──────────────────────────────────── */}
          {(step === "phone-send" || step === "email-send") && (
            <View style={styles.centerCol}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.sendingText}>Sending OTP…</Text>
            </View>
          )}

          {/* ── OTP verification step ────────────────────────────────── */}
          {isOtpStep && (
            <Animated.View style={{ opacity: fadeAnim }}>
              <TouchableOpacity style={styles.backRow} onPress={goBack} accessibilityRole="button">
                <Text style={styles.backText}>← Change identifier</Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Enter verification code</Text>
              <Text style={styles.sectionSub}>{otpSubtitle}</Text>
              <OtpInput
                value={otp}
                onChangeText={(v: string) => {
                  setOtp(v);
                  clearError();
                }}
                hasError={!!error}
                onComplete={otpOnVerify}
                onResend={resendCooldown === 0 ? otpOnResend : undefined}
                resendCooldownSeconds={60}
              />
              <Btn label="Verify" onPress={otpOnVerify} loading={loading} styles={styles} />
            </Animated.View>
          )}

          {/* ── Password step ────────────────────────────────────────── */}
          {step === "password" && (
            <Animated.View style={{ opacity: fadeAnim }}>
              <TouchableOpacity style={styles.backRow} onPress={goBack} accessibilityRole="button">
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Enter password</Text>
              <Text style={styles.sectionSub}>{username}</Text>
              <View style={styles.pwdRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    clearError();
                  }}
                  placeholder="Password"
                  placeholderTextColor={theme.textMuted}
                  secureTextEntry={!showPwd}
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={handlePasswordLogin}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPwd((v) => !v)}
                  accessibilityLabel={showPwd ? "Hide password" : "Show password"}
                >
                  <Text style={styles.eyeText}>{showPwd ? "🙈" : "👁"}</Text>
                </TouchableOpacity>
              </View>
              {onForgotPasswordPress ? (
                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={onForgotPasswordPress}
                  accessibilityRole="link"
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              ) : null}
              <Btn
                label="Sign In"
                onPress={handlePasswordLogin}
                loading={loading}
                style={{ marginTop: 12 }}
                styles={styles}
              />
            </Animated.View>
          )}

          {/* ── Magic link step (accessed from identifier nav) ───────── */}
          {step === "magic" && (
            <Animated.View style={{ opacity: fadeAnim }}>
              <TouchableOpacity style={styles.backRow} onPress={goBack} accessibilityRole="button">
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Magic Link</Text>
              <Text style={styles.sectionSub}>We'll send a sign-in link to your email.</Text>
              {!magicSent ? (
                <>
                  <TextInput
                    style={styles.input}
                    value={magicEmail}
                    onChangeText={setMagicEmail}
                    placeholder="your@email.com"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                    editable={!loading}
                  />
                  <Btn
                    label="Send Magic Link"
                    onPress={handleMagicLink}
                    loading={loading}
                    styles={styles}
                  />
                </>
              ) : (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>Magic link sent! Check your email.</Text>
                </View>
              )}
            </Animated.View>
          )}
        </View>

        {onTncPress || onPrivacyPress || footerText ? (
          <View style={styles.footer}>
            {onTncPress && (
              <TouchableOpacity onPress={onTncPress} accessibilityRole="link">
                <Text style={styles.footerLink}>Terms &amp; Conditions</Text>
              </TouchableOpacity>
            )}
            {onTncPress && onPrivacyPress ? <Text style={styles.footerSep}> · </Text> : null}
            {onPrivacyPress && (
              <TouchableOpacity onPress={onPrivacyPress} accessibilityRole="link">
                <Text style={styles.footerLink}>Privacy Policy</Text>
              </TouchableOpacity>
            )}
            {footerText && !onTncPress && !onPrivacyPress ? (
              <Text style={styles.footerText}>{footerText}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type StylesType = ReturnType<typeof makeStyles>;

function Btn({
  label,
  onPress,
  loading,
  style,
  styles,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  style?: object;
  styles: StylesType;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, loading && styles.primaryBtnDisabled, style]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function DividerRow({ text, styles }: { text: string; styles: StylesType }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{text}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}
