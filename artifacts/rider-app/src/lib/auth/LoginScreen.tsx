import { OtpInput } from "@workspace/auth-react";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { Eye, EyeOff, Fingerprint, Link2, Mail, Shield, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { api } from "../api";
import { useRiderAuthConfig } from "../AuthConfigContext";
import { normalizeRoles, useAuth as useRiderAuth } from "../rider-auth";
import { useLanguage } from "../useLanguage";
import { useTheme } from "./ThemeContext";
import { useAuthOps } from "./useAuth";

export interface LoginScreenProps {
  onSuccess?: (token: string, profile: unknown) => void;
}

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  useEffect(() => {
    const prev = document.title;
    document.title = "AJKMart Rider — Sign In";
    return () => { document.title = prev; };
  }, []);

  const theme = useTheme();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const auth = useRiderAuthConfig();
  const { login } = useRiderAuth();
  const { sendOtp, verifyOtp, loginWithPassword, biometricLogin } = useAuthOps();
  const [, navigate] = useLocation();

  const [mode, setMode] = useState<"otp" | "password" | "email">("otp");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [twoFactor, setTwoFactor] = useState<{ tempToken: string; identifier: string } | null>(
    null
  );
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricEnrollPrompt, setBiometricEnrollPrompt] = useState<{
    token: string;
    refreshToken: string;
    profile: Record<string, unknown>;
  } | null>(null);
  const [biometricEnrolling, setBiometricEnrolling] = useState(false);

  /* ── Email OTP ── */
  const [emailAddress, setEmailAddress] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);

  /* ── Magic Link ── */
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicSending, setMagicSending] = useState(false);

  /* ── Social ── */
  const [socialLoading, setSocialLoading] = useState<"google" | "facebook" | null>(null);

  /* ── Dev OTP display (only when DEV + VITE_ALLOW_DEV_OTP=true) ── */
  const [devOtp, setDevOtp] = useState("");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (emailResendCooldown <= 0) return;
    const timer = setTimeout(() => setEmailResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailResendCooldown]);

  useEffect(() => {
    void (async () => {
      try {
        const { isBiometricEnabled } = await import("../biometric");
        setBiometricAvailable(await isBiometricEnabled());
      } catch {
        setBiometricAvailable(false);
      }
    })();
  }, []);

  const handleLoginSuccess = async (
    token: string,
    profile: Record<string, unknown>,
    refreshToken?: string
  ) => {
    const roles = normalizeRoles(profile);
    if (roles.length > 0 && !roles.includes("rider")) {
      const actualRole = roles[0] ?? "unknown";
      setError(`Your account is registered as a ${actualRole}. This app is for riders only.`);
      return;
    }
    /* Persist both tokens before handing off to auth context so that the
       silent-refresh path always has a valid refresh token available. */
    if (refreshToken) {
      api.storeTokens(token, refreshToken);
    }
    login(token, profile as never, refreshToken ?? api.getRefreshToken() ?? undefined);
    onSuccess?.(token, profile);
    navigate("/");
  };

  const sendPhoneOtp = async () => {
    const cleaned = phone.replace(/[^0-9]/g, "");
    if (!/^0?3\d{9}$/.test(cleaned)) {
      setError("Enter a valid Pakistani mobile number");
      return;
    }
    setError(null);
    setSending(true);
    const result = await sendOtp(cleaned);
    setSending(false);
    if (!result.success) {
      setError(result.error ?? (T("sendOtpFailed") as string));
      return;
    }
    const resData = result.data as Record<string, unknown> | undefined;
    setDevOtp(
      resData?.otp &&
      import.meta.env.DEV &&
      import.meta.env.VITE_ALLOW_DEV_OTP === "true"
        ? String(resData.otp)
        : ""
    );
    setOtp("");
    setOtpSent(true);
    setResendCooldown(60);
  };

  const verifyPhoneOtp = async (otpValue?: string) => {
    const code = otpValue ?? otp;
    if (code.length !== 6) {
      setError("Enter the complete 6-digit OTP");
      return;
    }
    setError(null);
    setVerifying(true);
    const result = await verifyOtp(phone, code);
    setVerifying(false);
    if (!result.success || !result.data) {
      setError(result.error ?? (T("loginFailed") as string));
      setOtp("");
      return;
    }
    await handleLoginSuccess(
      result.data.token,
      { id: "", phone, roles: ["rider"] },
      result.data.refreshToken
    );
  };

  const passwordLogin = async () => {
    if (!identifier.trim() || !password) {
      setError("Enter your phone number or username and password");
      return;
    }
    setError(null);
    setSigningIn(true);
    const result = await loginWithPassword(identifier.trim(), password);
    setSigningIn(false);
    if (!result.success || !result.data) {
      setError(result.error ?? (T("loginFailed") as string));
      return;
    }
    if (result.data.requires2FA && result.data.tempToken) {
      setTwoFactor({ tempToken: result.data.tempToken, identifier: identifier.trim() });
      return;
    }
    const token = result.data.token;
    const refreshToken = result.data.refreshToken ?? api.getRefreshToken() ?? "";
    const profile: Record<string, unknown> = { id: "", phone: identifier.trim(), roles: ["rider"] };
    /* Check if native biometrics are available and not yet enrolled — offer
       enrolment immediately after the first successful password login so the
       rider can use fingerprint/face on the next cold start. */
    try {
      const { isBiometricAvailable, isBiometricEnabled } = await import("../biometric");
      const [available, alreadyEnabled] = await Promise.all([
        isBiometricAvailable(),
        isBiometricEnabled(),
      ]);
      if (available && !alreadyEnabled && refreshToken) {
        setBiometricEnrollPrompt({ token, refreshToken, profile });
        return;
      }
    } catch (_e) {
      /* biometric module unavailable — proceed normally */
    }
    await handleLoginSuccess(token, profile, refreshToken || undefined);
  };

  const confirmBiometricEnroll = async () => {
    if (!biometricEnrollPrompt) return;
    /* Capture before clearing state */
    const { token, refreshToken: rt, profile } = biometricEnrollPrompt;
    setBiometricEnrolling(true);
    try {
      const { storeBiometricToken, setBiometricEnabled } = await import("../biometric");
      await storeBiometricToken(rt);
      await setBiometricEnabled(true);
    } catch (_e) {
      /* non-fatal — proceed with normal login even if enrolment fails */
    }
    setBiometricEnrolling(false);
    setBiometricEnrollPrompt(null);
    await handleLoginSuccess(token, profile, rt);
  };

  const skipBiometricEnroll = async () => {
    if (!biometricEnrollPrompt) return;
    const { token, refreshToken: rt, profile } = biometricEnrollPrompt;
    setBiometricEnrollPrompt(null);
    await handleLoginSuccess(token, profile, rt);
  };

  const verifyTwoFactor = async () => {
    if (twoFactorCode.length !== 6 || !twoFactor) {
      setError("Enter the 6-digit authenticator code");
      return;
    }
    setError(null);
    setTwoFactorLoading(true);
    try {
      const res = (await api.twoFactorVerify({
        code: twoFactorCode,
        tempToken: twoFactor.tempToken,
      })) as Record<string, unknown>;
      const token = (res.accessToken ?? res.token) as string;
      const rt2fa = (res.refreshToken ?? res.refresh_token) as string | undefined;
      await handleLoginSuccess(
        token,
        { id: "", phone: twoFactor.identifier, roles: ["rider"] },
        rt2fa
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : (T("loginFailed") as string));
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const biometricSignIn = async () => {
    setBiometricLoading(true);
    const result = await biometricLogin();
    setBiometricLoading(false);
    if (!result.success || !result.data) {
      setError(result.error ?? "Biometric sign-in failed");
      return;
    }
    await handleLoginSuccess(
      result.data.token,
      { id: "", phone: "", roles: ["rider"] },
      result.data.refreshToken
    );
  };

  /* ── Email OTP handlers ── */
  const sendEmailOtpHandler = async () => {
    if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(emailAddress)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    setEmailSending(true);
    try {
      await api.sendEmailOtp(emailAddress);
      setEmailOtp("");
      setEmailOtpSent(true);
      setEmailResendCooldown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send email OTP");
    } finally {
      setEmailSending(false);
    }
  };

  const verifyEmailOtpHandler = async (otpValue?: string) => {
    const code = otpValue ?? emailOtp;
    if (code.length !== 6) {
      setError("Enter the complete 6-digit OTP");
      return;
    }
    setError(null);
    setEmailVerifying(true);
    try {
      const res = (await api.verifyEmailOtp(emailAddress, code)) as Record<string, unknown>;
      const token = (res.accessToken ?? res.token) as string;
      const refreshToken = (res.refreshToken ?? res.refresh_token) as string | undefined;
      await handleLoginSuccess(
        token,
        { id: "", email: emailAddress, roles: ["rider"] },
        refreshToken
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP verification failed");
      setEmailOtp("");
    } finally {
      setEmailVerifying(false);
    }
  };

  /* ── Magic Link handler ── */
  const sendMagicLinkHandler = async () => {
    if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(magicEmail)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    setMagicSending(true);
    try {
      await api.sendMagicLink(magicEmail);
      setMagicSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send magic link");
    } finally {
      setMagicSending(false);
    }
  };

  /* ── Google OAuth (Google Identity Services) ── */
  const googleLogin = async () => {
    const clientId = auth.googleClientId;
    if (!clientId) {
      setError("Google sign-in is not configured");
      return;
    }
    setSocialLoading("google");
    setError(null);
    try {
      await new Promise<void>((resolve, reject) => {
        if ((window as unknown as Record<string, unknown>).google) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google SDK"));
        document.head.appendChild(script);
      });
      await new Promise<void>((resolve, reject) => {
        type GsiWindow = {
          google: {
            accounts: {
              id: {
                initialize: (cfg: {
                  client_id: string;
                  callback: (r: { credential: string }) => void;
                  auto_select: boolean;
                  cancel_on_tap_outside: boolean;
                }) => void;
                prompt: (
                  notification?: (n: {
                    isNotDisplayed: () => boolean;
                    isSkippedMoment: () => boolean;
                  }) => void
                ) => void;
              };
            };
          };
        };
        (window as unknown as GsiWindow).google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            setSocialLoading(null);
            api
              .socialGoogle({ idToken: response.credential })
              .then((res) => {
                const r = res as Record<string, unknown>;
                const token = (r.accessToken ?? r.token) as string;
                const rt = (r.refreshToken ?? r.refresh_token) as string | undefined;
                return handleLoginSuccess(token, { id: "", roles: ["rider"] }, rt);
              })
              .then(resolve)
              .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : "Google sign-in failed");
                reject(e as Error);
              });
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        (window as unknown as GsiWindow).google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setSocialLoading(null);
            reject(new Error("Google prompt was dismissed"));
          }
        });
      });
    } catch (e) {
      setSocialLoading(null);
      if (e instanceof Error && e.message !== "Google prompt was dismissed") {
        setError(e.message);
      }
    }
  };

  /* ── Facebook OAuth ── */
  const facebookLogin = async () => {
    const appId = auth.facebookAppId;
    if (!appId) {
      setError("Facebook sign-in is not configured");
      return;
    }
    setSocialLoading("facebook");
    setError(null);
    try {
      type FbWindow = {
        FB: {
          init: (cfg: { appId: string; version: string; xfbml: boolean; cookie: boolean }) => void;
          login: (
            callback: (r: { authResponse?: { accessToken: string } }) => void,
            opts: { scope: string }
          ) => void;
        };
        fbAsyncInit?: () => void;
      };
      await new Promise<void>((resolve, reject) => {
        if ((window as unknown as FbWindow).FB) {
          resolve();
          return;
        }
        (window as unknown as FbWindow).fbAsyncInit = () => {
          (window as unknown as FbWindow).FB.init({
            appId,
            version: "v18.0",
            xfbml: false,
            cookie: true,
          });
          resolve();
        };
        const script = document.createElement("script");
        script.src = "https://connect.facebook.net/en_US/sdk.js";
        script.onerror = () => reject(new Error("Failed to load Facebook SDK"));
        document.head.appendChild(script);
      });
      await new Promise<void>((resolve, reject) => {
        (window as unknown as FbWindow).FB.login(
          (response) => {
            if (response.authResponse?.accessToken) {
              api
                .socialFacebook({ accessToken: response.authResponse.accessToken })
                .then((res) => {
                  const r = res as Record<string, unknown>;
                  const token = (r.accessToken ?? r.token) as string;
                  const rt = (r.refreshToken ?? r.refresh_token) as string | undefined;
                  return handleLoginSuccess(token, { id: "", roles: ["rider"] }, rt);
                })
                .then(resolve)
                .catch((e: unknown) => {
                  setError(e instanceof Error ? e.message : "Facebook sign-in failed");
                  reject(e as Error);
                });
            } else {
              reject(new Error("Facebook login cancelled"));
            }
          },
          { scope: "public_profile,email" }
        );
      });
    } catch (e) {
      if (e instanceof Error && e.message !== "Facebook login cancelled") {
        setError(e.message);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const cardStyle = useMemo<React.CSSProperties>(
    () => ({
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 20,
      padding: "24px 22px",
      width: "100%",
      maxWidth: 420,
      boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
    }),
    [theme]
  );

  if (biometricEnrollPrompt) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: theme.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div style={cardStyle}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                margin: "0 auto 14px",
                background: `${theme.primary}18`,
                border: `1px solid ${theme.primary}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Fingerprint size={34} color={theme.primary} />
            </div>
            <h2 style={{ color: theme.text, fontSize: 20, fontWeight: 800, margin: 0 }}>
              Enable Biometric Login
            </h2>
            <p style={{ color: theme.textMuted, fontSize: 13, margin: "8px 0 0", lineHeight: 1.6 }}>
              Sign in faster next time using your fingerprint or face ID — no password needed.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => void confirmBiometricEnroll()}
              disabled={biometricEnrolling}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "none",
                background: biometricEnrolling
                  ? `${theme.primary}60`
                  : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: biometricEnrolling ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Fingerprint size={18} />
              {biometricEnrolling ? "Enabling…" : "Enable Biometric Login"}
            </button>
            <button
              onClick={() => void skipBiometricEnroll()}
              disabled={biometricEnrolling}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: "transparent",
                color: theme.textMuted,
                fontSize: 14,
                fontWeight: 600,
                cursor: biometricEnrolling ? "not-allowed" : "pointer",
              }}
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (twoFactor) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: theme.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div style={cardStyle}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                margin: "0 auto 12px",
                background: `${theme.primary}18`,
                border: `1px solid ${theme.primary}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={28} color={theme.primary} />
            </div>
            <h2 style={{ color: theme.text, fontSize: 20, fontWeight: 800, margin: 0 }}>
              Two-Factor Authentication
            </h2>
            <p style={{ color: theme.textMuted, fontSize: 13, margin: "6px 0 0" }}>
              Enter the 6-digit code from your authenticator app
            </p>
          </div>
          {error && (
            <div
              role="alert"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 16,
                color: "#fca5a5",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <OtpInput
            onComplete={(v) => {
              setTwoFactorCode(v);
              setError(null);
            }}
            length={6}
            label="2FA code"
          />
          <button
            onClick={() => void verifyTwoFactor()}
            disabled={twoFactorLoading || twoFactorCode.length < 6}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 12,
              border: "none",
              marginTop: 18,
              background:
                twoFactorLoading || twoFactorCode.length < 6
                  ? `${theme.primary}60`
                  : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: twoFactorLoading || twoFactorCode.length < 6 ? "not-allowed" : "pointer",
            }}
          >
            {twoFactorLoading ? "Verifying…" : "Verify"}
          </button>
          <button
            onClick={() => setTwoFactor(null)}
            style={{
              width: "100%",
              marginTop: 12,
              background: "none",
              border: "none",
              color: theme.textMuted,
              cursor: "pointer",
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              margin: "0 auto 14px",
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 8px 28px ${theme.primary}40`,
            }}
          >
            <Smartphone size={34} color="#fff" />
          </div>
          <h1 style={{ color: theme.text, fontSize: 26, fontWeight: 800, margin: 0 }}>
            Deliver with AJKMart
          </h1>
          <p style={{ color: theme.textMuted, fontSize: 13, margin: "6px 0 0" }}>
            Sign in to your rider account
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 16,
              color: "#fca5a5",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 4,
            background: theme.background,
            borderRadius: 12,
            padding: 4,
            marginBottom: 18,
          }}
        >
          {(
            [
              auth.phoneEnabled !== false ? "otp" : null,
              auth.emailEnabled ? "email" : null,
              auth.usernamePassword ? "password" : null,
            ].filter(Boolean) as ("otp" | "email" | "password")[]
          ).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
                setOtpSent(false);
                setOtp("");
                setEmailOtpSent(false);
                setEmailOtp("");
                setShowMagicLink(false);
                setMagicSent(false);
              }}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 9,
                border: "none",
                background: mode === m ? theme.surface : "transparent",
                color: mode === m ? theme.primary : theme.textMuted,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {m === "otp" ? "Phone" : m === "email" ? "Email" : "Password"}
            </button>
          ))}
        </div>

        {mode === "otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: theme.primary,
                  marginBottom: 6,
                }}
              >
                Phone Number *
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <div
                  style={{
                    height: 48,
                    padding: "0 12px",
                    background: theme.background,
                    border: `1.5px solid ${theme.border}`,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textMuted,
                  }}
                >
                  +92
                </div>
                <input
                  value={phone}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, "");
                    if (v.startsWith("92")) v = v.slice(2);
                    if (v.startsWith("0") && v.length > 1) v = v;
                    setPhone(v.slice(0, 11));
                    setError(null);
                  }}
                  placeholder="03XXXXXXXXX"
                  maxLength={11}
                  style={{
                    flex: 1,
                    height: 48,
                    padding: "0 16px",
                    borderRadius: 12,
                    background: theme.background,
                    border: `1.5px solid ${theme.border}`,
                    color: theme.text,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                Format: 03XX-XXXXXXX or +923XX-XXXXXXX
              </div>
            </div>
            <button
              onClick={() => void sendPhoneOtp()}
              disabled={sending}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "none",
                background: sending
                  ? `${theme.primary}60`
                  : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: sending ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "Sending OTP…" : "Send OTP"}
            </button>
            <div style={{ textAlign: "right", marginTop: -4 }}>
              <Link
                href="/forgot-password"
                style={{
                  fontSize: 12,
                  color: theme.primary,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Forgot Password?
              </Link>
            </div>
          </div>
        )}

        {mode === "otp" && otpSent && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>OTP sent to</p>
              <p style={{ color: theme.text, fontSize: 15, fontWeight: 700, margin: "4px 0 0" }}>
                {phone}
              </p>
            </div>
            {devOtp && import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEV_OTP === "true" && (
              <div
                style={{
                  background: "#1a2035",
                  border: "1px solid #2d3a55",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#94a3b8",
                  textAlign: "center",
                }}
              >
                🔧 Dev Mode — OTP:{" "}
                <strong style={{ color: theme.primary, fontSize: 14 }}>{devOtp}</strong>
              </div>
            )}
            <OtpInput
              onComplete={(v) => {
                setOtp(v);
                setError(null);
                void verifyPhoneOtp(v);
              }}
              length={6}
              label="OTP"
            />
            <button
              onClick={() => void verifyPhoneOtp()}
              disabled={verifying || otp.length < 6}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "none",
                background:
                  verifying || otp.length < 6
                    ? `${theme.primary}60`
                    : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: verifying || otp.length < 6 ? "not-allowed" : "pointer",
              }}
            >
              {verifying ? "Verifying…" : "Verify & Sign In"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {resendCooldown > 0 ? (
                <span style={{ color: theme.textMuted, fontSize: 12 }}>
                  Resend in {resendCooldown}s
                </span>
              ) : (
                <button
                  onClick={() => void sendPhoneOtp()}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.primary,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Resend OTP
                </button>
              )}
              <button
                onClick={() => {
                  setOtp("");
                  setDevOtp("");
                  setOtpSent(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: theme.textMuted,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Change Number
              </button>
            </div>
            <div style={{ textAlign: "center" }}>
              <Link
                href="/forgot-password"
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Forgot Password?
              </Link>
            </div>
          </div>
        )}

        {mode === "email" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!emailOtpSent ? (
              <>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: theme.primary,
                      marginBottom: 6,
                    }}
                  >
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void sendEmailOtpHandler()}
                    placeholder="you@example.com"
                    style={{
                      width: "100%",
                      height: 48,
                      padding: "0 16px",
                      borderRadius: 12,
                      background: theme.background,
                      border: `1.5px solid ${theme.border}`,
                      color: theme.text,
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>
                <button
                  onClick={() => void sendEmailOtpHandler()}
                  disabled={emailSending}
                  style={{
                    width: "100%",
                    height: 48,
                    borderRadius: 12,
                    border: "none",
                    background: emailSending
                      ? `${theme.primary}60`
                      : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: emailSending ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Mail size={17} />
                  {emailSending ? "Sending…" : "Send OTP"}
                </button>
                <div style={{ textAlign: "right", marginTop: -4 }}>
                  <Link
                    href="/forgot-password"
                    style={{
                      fontSize: 12,
                      color: theme.primary,
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    Forgot Password?
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
                  Enter the 6-digit OTP sent to{" "}
                  <strong style={{ color: theme.text }}>{emailAddress}</strong>
                </p>
                <OtpInput
                  onComplete={(v) => {
                    setEmailOtp(v);
                    setError(null);
                    void verifyEmailOtpHandler(v);
                  }}
                  length={6}
                  label="OTP"
                />
                <button
                  onClick={() => void verifyEmailOtpHandler()}
                  disabled={emailVerifying || emailOtp.length < 6}
                  style={{
                    width: "100%",
                    height: 48,
                    borderRadius: 12,
                    border: "none",
                    background:
                      emailVerifying || emailOtp.length < 6
                        ? `${theme.primary}60`
                        : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: emailVerifying || emailOtp.length < 6 ? "not-allowed" : "pointer",
                  }}
                >
                  {emailVerifying ? "Verifying…" : "Verify & Sign In"}
                </button>
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  {emailResendCooldown > 0 ? (
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
                      Resend in {emailResendCooldown}s
                    </span>
                  ) : (
                    <button
                      onClick={() => void sendEmailOtpHandler()}
                      style={{
                        background: "none",
                        border: "none",
                        color: theme.primary,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Resend OTP
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEmailOtp("");
                      setEmailOtpSent(false);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: theme.textMuted,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Change Email
                  </button>
                </div>
                <div style={{ textAlign: "center" }}>
                  <Link
                    href="/forgot-password"
                    style={{
                      fontSize: 12,
                      color: theme.textMuted,
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    Forgot Password?
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {mode === "password" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: theme.primary,
                  marginBottom: 6,
                }}
              >
                Phone / Username *
              </label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="03XXXXXXXXX or username"
                style={{
                  width: "100%",
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: theme.background,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: theme.primary,
                  marginBottom: 6,
                }}
              >
                Password *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: "100%",
                    height: 48,
                    padding: "0 16px",
                    paddingRight: 44,
                    borderRadius: 12,
                    background: theme.background,
                    border: `1.5px solid ${theme.border}`,
                    color: theme.text,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: theme.textMuted,
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div style={{ textAlign: "right", marginTop: -8 }}>
              <Link
                href="/forgot-password"
                style={{
                  fontSize: 12,
                  color: theme.primary,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Forgot Password?
              </Link>
            </div>
            <button
              onClick={() => void passwordLogin()}
              disabled={signingIn}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "none",
                background: signingIn
                  ? `${theme.primary}60`
                  : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: signingIn ? "not-allowed" : "pointer",
              }}
            >
              {signingIn ? "Signing In…" : "Sign In"}
            </button>
          </div>
        )}

        {(auth.googleEnabled ||
          auth.facebookEnabled ||
          auth.magicLinkEnabled ||
          biometricAvailable) && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
              <div style={{ flex: 1, height: 1, background: theme.border }} />
              <span style={{ color: theme.textMuted, fontSize: 11, fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: theme.border }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {auth.googleEnabled && (
                <button
                  onClick={() => void googleLogin()}
                  disabled={socialLoading === "google"}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: theme.background,
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: socialLoading === "google" ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    opacity: socialLoading === "google" ? 0.7 : 1,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  {socialLoading === "google" ? "Connecting…" : "Continue with Google"}
                </button>
              )}
              {auth.facebookEnabled && (
                <button
                  onClick={() => void facebookLogin()}
                  disabled={socialLoading === "facebook"}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: theme.background,
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: socialLoading === "facebook" ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    opacity: socialLoading === "facebook" ? 0.7 : 1,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.885v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
                  </svg>
                  {socialLoading === "facebook" ? "Connecting…" : "Continue with Facebook"}
                </button>
              )}
              {auth.magicLinkEnabled && !showMagicLink && (
                <button
                  onClick={() => setShowMagicLink(true)}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: theme.background,
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <Link2 size={16} />
                  Sign in with Magic Link
                </button>
              )}
              {auth.magicLinkEnabled && showMagicLink && (
                <div
                  style={{
                    background: theme.background,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {magicSent ? (
                    <p
                      style={{
                        color: theme.textMuted,
                        fontSize: 13,
                        margin: 0,
                        textAlign: "center",
                      }}
                    >
                      ✉️ Magic link sent! Check your inbox and click the link to sign in.
                    </p>
                  ) : (
                    <>
                      <input
                        type="email"
                        value={magicEmail}
                        onChange={(e) => setMagicEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void sendMagicLinkHandler()}
                        placeholder="Enter your email"
                        style={{
                          width: "100%",
                          height: 44,
                          padding: "0 14px",
                          borderRadius: 10,
                          background: theme.surface,
                          border: `1.5px solid ${theme.border}`,
                          color: theme.text,
                          fontSize: 14,
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => void sendMagicLinkHandler()}
                        disabled={magicSending}
                        style={{
                          width: "100%",
                          height: 40,
                          borderRadius: 10,
                          border: "none",
                          background: magicSending
                            ? `${theme.primary}60`
                            : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: magicSending ? "not-allowed" : "pointer",
                        }}
                      >
                        {magicSending ? "Sending…" : "Send Magic Link"}
                      </button>
                    </>
                  )}
                </div>
              )}
              {biometricAvailable && (
                <button
                  onClick={() => void biometricSignIn()}
                  disabled={biometricLoading}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: theme.background,
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: biometricLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <Fingerprint size={18} /> {biometricLoading ? "Opening…" : "Biometric Login"}
                </button>
              )}
            </div>
          </>
        )}

        <p
          style={{
            textAlign: "center",
            marginTop: 18,
            marginBottom: 0,
            fontSize: 13,
            color: theme.textMuted,
          }}
        >
          New rider?{" "}
          <Link
            href="/register"
            style={{ color: theme.primary, fontWeight: 700, textDecoration: "none" }}
          >
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
}
