import { OtpInput } from "@workspace/auth-react";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { Eye, EyeOff, Fingerprint, Shield, Smartphone } from "lucide-react";
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
  const theme = useTheme();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const auth = useRiderAuthConfig();
  const { login } = useRiderAuth();
  const { sendOtp, verifyOtp, loginWithPassword, biometricLogin } = useAuthOps();
  const [, navigate] = useLocation();

  const [mode, setMode] = useState<"otp" | "password">("otp");
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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

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

  const handleLoginSuccess = async (token: string, profile: Record<string, unknown>) => {
    const roles = normalizeRoles(profile);
    if (roles.length > 0 && !roles.includes("rider")) {
      setError("This app is for riders only");
      return;
    }
    login(token, profile as never, api.getRefreshToken() ?? undefined);
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
    await handleLoginSuccess(result.data.token, { id: "", phone, roles: ["rider"] });
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
    await handleLoginSuccess(result.data.token, {
      id: "",
      phone: identifier.trim(),
      roles: ["rider"],
    });
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
      await handleLoginSuccess(token, { id: "", phone: twoFactor.identifier, roles: ["rider"] });
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
    await handleLoginSuccess(result.data.token, { id: "", phone: "", roles: ["rider"] });
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
          {(["otp", "password"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
                setOtpSent(false);
                setOtp("");
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
              }}
            >
              {m === "otp" ? "Phone" : "Password"}
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
                  onChange={(e) => setPhone(e.target.value)}
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

        {(auth.googleEnabled || biometricAvailable) && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
              <div style={{ flex: 1, height: 1, background: theme.border }} />
              <span style={{ color: theme.textMuted, fontSize: 11, fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: theme.border }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {auth.googleEnabled && (
                <button
                  onClick={() => {}}
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
                  }}
                >
                  Continue with Google
                </button>
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
