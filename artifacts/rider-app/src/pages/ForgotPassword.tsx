import { TwoFactorVerify, executeCaptcha, formatPhoneForApi } from "@workspace/auth-utils";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound, Mail, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import { useTheme } from "../lib/auth/ThemeContext";
import { getRiderAuthConfig, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STEPS = [
  "choose-method",
  "send-otp",
  "enter-otp",
  "new-password",
  "totp-verify",
  "success",
] as const;
type Step = (typeof STEPS)[number];

function getPasswordStrength(pw: string): { label: TranslationKey; color: string; pct: number } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: "passwordWeak", color: "#ef4444", pct: 25 };
  if (score <= 2) return { label: "passwordFair", color: "#f97316", pct: 50 };
  if (score <= 3) return { label: "passwordGood", color: "#f59e0b", pct: 75 };
  return { label: "passwordStrong", color: "#10b981", pct: 100 };
}

export default function ForgotPassword() {
  const theme = useTheme();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const auth = getRiderAuthConfig(config);
  const captchaSiteKey = config.auth?.captchaSiteKey;
  const hasPhoneOtp = auth.phoneOtp;
  const hasEmailOtp = auth.emailOtp;

  const [step, setStep] = useState<Step>("choose-method");
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const sendOtp = async () => {
    if (method === "phone" && !/^0?3\d{9}$/.test(phone.replace(/[^0-9]/g, "")))
      return setError("Enter a valid Pakistani mobile number");
    if (method === "email" && !email.includes("@")) return setError(T("enterValidEmail") as string);
    setLoading(true);
    setError(null);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        captchaToken = await executeCaptcha("forgot_password", captchaSiteKey);
      }
      const res = await api.forgotPassword({
        method,
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        captchaToken,
      });
      if ((res as { otp?: string }).otp) setDevOtp((res as { otp: string }).otp);
      setOtp("");
      setStep("enter-otp");
      setResendCooldown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : (T("sendOtpFailed") as string));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (totpCode?: string) => {
    if (otp.length !== 6) return setError(T("enterOtpDigits") as string);
    if (newPassword.length < 8) return setError(T("passwordMinLength") as string);
    if (newPassword !== confirmPw) return setError(T("passwordsDoNotMatch") as string);
    setLoading(true);
    setError(null);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        captchaToken = await executeCaptcha("reset_password", captchaSiteKey);
      }
      await api.resetPassword({
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        otp,
        newPassword,
        totpCode,
        captchaToken,
      });
      setStep("success");
    } catch (e) {
      const err = e as { responseData?: { requires2FA?: boolean } };
      if (err.responseData?.requires2FA) {
        setStep("totp-verify");
      } else {
        setError(e instanceof Error ? e.message : (T("verificationFailed") as string));
      }
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength(newPassword);
  const card = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 20,
    padding: "24px 22px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
  };

  if (step === "success") {
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
        <div style={{ ...card, textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: `${theme.primary}15`,
              border: `1px solid ${theme.primary}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <CheckCircle size={36} color={theme.primary} />
          </div>
          <h2 style={{ color: theme.text, fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
            {T("passwordResetSuccess")}
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
            {T("passwordResetSuccessMsg")}
          </p>
          <Link
            href="/login"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              height: 48,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={15} /> {T("goToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  if (step === "totp-verify") {
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
        <div style={card}>
          <button
            onClick={() => setStep("new-password")}
            style={{
              background: "none",
              border: "none",
              color: theme.textMuted,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 16,
            }}
          >
            <ArrowLeft size={14} /> {T("back")}
          </button>
          <TwoFactorVerify
            onVerify={async (code) => {
              setTwoFaLoading(true);
              setTwoFaError("");
              try {
                await resetPassword(code);
              } catch (e) {
                setTwoFaError(e instanceof Error ? e.message : String(T("verificationFailed")));
              } finally {
                setTwoFaLoading(false);
              }
            }}
            onBackupCode={async (code) => {
              await resetPassword(code);
            }}
            verifyLoading={twoFaLoading}
            verifyError={twoFaError}
            showTrustDevice={false}
          />
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
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 18,
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <KeyRound size={26} color="#fff" />
          </div>
          <h1 style={{ color: theme.text, fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
            {T("forgotPassword")}
          </h1>
          <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
            {T("forgotPasswordDesc")}
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
        {step === "choose-method" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ color: theme.text, fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
              {T("chooseResetMethod")}
            </h3>
            {hasPhoneOtp && (
              <button
                onClick={() => {
                  setMethod("phone");
                  setStep("send-otp");
                }}
                style={{
                  height: 56,
                  border: `1.5px solid ${theme.border}`,
                  borderRadius: 14,
                  background: theme.background,
                  color: theme.text,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "0 16px",
                }}
              >
                <Phone size={20} color={theme.primary} />{" "}
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700 }}>Reset via Phone</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>OTP via SMS</div>
                </div>
              </button>
            )}
            {hasEmailOtp && (
              <button
                onClick={() => {
                  setMethod("email");
                  setStep("send-otp");
                }}
                style={{
                  height: 56,
                  border: `1.5px solid ${theme.border}`,
                  borderRadius: 14,
                  background: theme.background,
                  color: theme.text,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "0 16px",
                }}
              >
                <Mail size={20} color={theme.primary} />{" "}
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700 }}>Reset via Email</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>OTP via Email</div>
                </div>
              </button>
            )}
          </div>
        )}
        {step === "send-otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {method === "phone" ? (
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
                      color: theme.textMuted,
                    }}
                  >
                    +92
                  </div>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="03XXXXXXXXX"
                    style={{
                      flex: 1,
                      height: 48,
                      padding: "0 16px",
                      borderRadius: 12,
                      background: theme.background,
                      border: `1.5px solid ${theme.border}`,
                      color: theme.text,
                    }}
                  />
                </div>
              </div>
            ) : (
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: "100%",
                    height: 48,
                    padding: "0 16px",
                    borderRadius: 12,
                    background: theme.background,
                    border: `1.5px solid ${theme.border}`,
                    color: theme.text,
                  }}
                />
              </div>
            )}
            <button
              onClick={() => void sendOtp()}
              disabled={loading}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "none",
                background: loading
                  ? `${theme.primary}60`
                  : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Sending\u2026" : "Send Reset OTP"}
            </button>
            <button
              onClick={() => setStep("choose-method")}
              style={{
                background: "none",
                border: "none",
                color: theme.textMuted,
                cursor: "pointer",
              }}
            >
              Back
            </button>
          </div>
        )}
        {step === "enter-otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <h3 style={{ color: theme.text, fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
                {T("enterResetOtp")}
              </h3>
              <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
                {method === "phone" ? phone : email}
              </p>
            </div>
            {devOtp && (
              <div
                style={{
                  background: "#1a2035",
                  border: "1px solid #2d3a55",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#94a3b8",
                }}
              >
                Dev OTP: <strong style={{ color: theme.primary }}>{devOtp}</strong>
              </div>
            )}
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit OTP"
              style={{
                width: "100%",
                height: 48,
                padding: "0 16px",
                borderRadius: 12,
                background: theme.background,
                border: `1.5px solid ${theme.border}`,
                color: theme.text,
              }}
            />
            <button
              onClick={() => setStep("new-password")}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "none",
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Next
            </button>
            <button
              onClick={() => void sendOtp()}
              style={{
                background: "none",
                border: "none",
                color: theme.primary,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Resend OTP
            </button>
          </div>
        )}
        {step === "new-password" && (
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
                New Password *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  style={{
                    width: "100%",
                    height: 48,
                    padding: "0 16px",
                    paddingRight: 44,
                    borderRadius: 12,
                    background: theme.background,
                    border: `1.5px solid ${theme.border}`,
                    color: theme.text,
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
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{ flex: 1, height: 4, borderRadius: 999, background: theme.border }}
                    >
                      <div
                        style={{
                          width: `${strength.pct}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: strength.color,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: strength.color }}>
                      {T(strength.label)}
                    </span>
                  </div>
                </div>
              )}
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
                Confirm Password *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Re-enter password"
                  style={{
                    width: "100%",
                    height: 48,
                    padding: "0 16px",
                    paddingRight: 44,
                    borderRadius: 12,
                    background: theme.background,
                    border: `1.5px solid ${theme.border}`,
                    color: theme.text,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
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
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              onClick={() => void resetPassword()}
              disabled={loading}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "none",
                background: loading
                  ? `${theme.primary}60`
                  : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Resetting\u2026" : "Reset Password"}
            </button>
          </div>
        )}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link
            href="/login"
            style={{ fontSize: 13, color: theme.primary, fontWeight: 600, textDecoration: "none" }}
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
