/**
 * ForgotPassword.tsx — rider-app
 *
 * Multi-step password reset flow for rider accounts.
 * Green theme matching the AJKMart Rider brand.
 *
 * Steps:
 *   1. choose-method  — Phone OTP or Email OTP (based on platform config)
 *   2. send-otp       — Collect phone/email, send the OTP
 *   3. enter-otp      — Enter the 6-digit OTP (styled box inputs)
 *   4. new-password   — Set and confirm new password with strength meter
 *   5. totp-verify    — TOTP 2FA gate (only if account has 2FA enabled)
 *   6. success        — Done
 */
import { TwoFactorVerify, executeCaptcha, formatPhoneForApi } from "@workspace/auth-utils";
import { createLogger } from "@/lib/logger";
import { useRateLimitCountdown } from "@workspace/auth-react";

import { tDual, type TranslationKey } from "@workspace/i18n";
import { ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound, Mail, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import { useTheme } from "../lib/auth/ThemeContext";
import { getRiderAuthConfig, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

const log = createLogger("ForgotPassword");

type ForgotStep =
  | "choose-method"
  | "send-otp"
  | "enter-otp"
  | "new-password"
  | "totp-verify"
  | "success";

/* ── Password strength ── */
function getPasswordStrength(pw: string): {
  label: TranslationKey;
  color: string;
  pct: number;
} {
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

/* ── Spinner ── */
function Spin() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

/* ── OTP box inputs — 6 individual boxes with paste/backspace support ── */
function OtpBoxes({
  value,
  onChange,
  primaryColor,
  borderColor,
  bgColor,
  textColor,
}: {
  value: string;
  onChange: (v: string) => void;
  primaryColor: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 1);
    const chars = value.split("");
    chars[i] = v;
    const next = chars.join("").slice(0, 6);
    onChange(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }} onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          style={{
            width: 44,
            height: 52,
            borderRadius: 12,
            textAlign: "center",
            fontSize: 22,
            fontWeight: 700,
            outline: "none",
            background: value[i] ? `${primaryColor}18` : bgColor,
            border: `1.5px solid ${value[i] ? primaryColor : borderColor}`,
            color: textColor,
            transition: "all 0.15s",
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}

export default function ForgotPassword() {
  useEffect(() => {
    const prev = document.title;
    document.title = "AJKMart Rider — Reset Password";
    return () => {
      document.title = prev;
    };
  }, []);

  const theme = useTheme();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = useCallback((key: TranslationKey) => tDual(key, language), [language]);
  const auth = getRiderAuthConfig(config);
  const captchaSiteKey = config.auth?.captchaSiteKey;
  const phoneHint = config.regional?.phoneHint ?? "03XXXXXXXXX";

  const hasPhoneOtp = auth.phoneOtp;
  const hasEmailOtp = auth.emailOtp;

  /* ── Rate limiting ── */
  const { isRateLimited, secondsLeft, triggerRateLimit } = useRateLimitCountdown();

  /* ── Resend cooldown (separate from rate limit) ── */
  const [resendCooldown, setResendCooldown] = useState(0);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  /* ── Form state ── */
  const [step, setStep] = useState<ForgotStep>("choose-method");
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [resetToken, setResetToken] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState("");

  const clearError = () => setError("");

  /* ── Phone validation (matches backend expectation) ── */
  const isValidPhone = (p: string) => {
    try {
      if (config.regional?.phoneFormat) {
        return new RegExp(config.regional.phoneFormat).test(p);
      }
    } catch (_e) {
      log.debug({ err: _e }, "[ForgotPassword] phone-format regex invalid — using default pattern");
    }
    return /^0?3\d{9}$/.test(p.replace(/[\s\-()+]/g, ""));
  };

  /* ── Send OTP ── */
  const sendOtp = async () => {
    clearError();
    if (isRateLimited) return;
    if (method === "phone" && !isValidPhone(phone)) {
      setError(`${String(T("enterValidPhone"))} (e.g. ${phoneHint})`);
      return;
    }
    if (method === "email" && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) {
      setError(String(T("enterValidEmail")));
      return;
    }
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try {
          captchaToken = await executeCaptcha("forgot_password", captchaSiteKey);
        } catch (_e) {
          log.debug(
            { err: _e },
            "[ForgotPassword] captcha failed (send-otp) — proceeding without token"
          );
        }
        if (!captchaToken) {
          setError(String(T("captchaRequired")));
          setLoading(false);
          return;
        }
      }
      const res = await api.forgotPassword({
        method,
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        ...(captchaToken ? { captchaToken } : {}),
      } as Parameters<typeof api.forgotPassword>[0]);
      const resData = res as Record<string, unknown>;
      if (resData.otp && import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEV_OTP === "true") {
        setDevOtp(resData.otp as string);
      }
      setOtp("");
      setStep("enter-otp");
      setResendCooldown(60);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(T("sendOtpFailed"));
      const status = (e as Record<string, unknown>)?.status as number | undefined;
      const retryAfter = (
        (e as Record<string, unknown>)?.responseData as Record<string, unknown> | undefined
      )?.retryAfter;
      if (status === 429 || /too many|rate limit|lockout/i.test(errMsg)) {
        triggerRateLimit(typeof retryAfter === "number" ? retryAfter : 60);
      }
      setError(errMsg);
    }
    setLoading(false);
  };

  /* ── Verify OTP and get reset token ── */
  const verifyOtp = async () => {
    clearError();
    if (otp.length !== 6) {
      setError(String(T("enterOtpDigits")));
      return;
    }
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try {
          captchaToken = await executeCaptcha("verify_reset_otp", captchaSiteKey);
        } catch (_e) {
          log.debug(
            { err: _e },
            "[ForgotPassword] captcha failed (verify-otp) — proceeding without token"
          );
        }
      }
      const res = (await api.verifyResetOtp({
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        otp,
        ...(captchaToken ? { captchaToken } : {}),
      })) as Record<string, unknown>;
      const token = res.resetToken as string | undefined;
      if (!token) throw new Error("No reset token received");
      setResetToken(token);
      setStep("new-password");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(T("verificationFailed")));
    }
    setLoading(false);
  };

  /* ── Reset password ── */
  const resetPassword = async (totpCode?: string) => {
    clearError();
    if (!resetToken) {
      setError("Session expired. Please try again.");
      return;
    }
    if (newPassword.length < 8) {
      setError(String(T("passwordMinLength")));
      return;
    }
    if (newPassword !== confirmPw) {
      setError(String(T("passwordsDoNotMatch")));
      return;
    }
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try {
          captchaToken = await executeCaptcha("reset_password", captchaSiteKey);
        } catch (_e) {
          log.debug(
            { err: _e },
            "[ForgotPassword] captcha failed (reset-password) — proceeding without token"
          );
        }
      }
      await api.resetPassword({
        resetToken,
        newPassword,
        ...(totpCode ? { totpCode } : {}),
        ...(captchaToken ? { captchaToken } : {}),
      } as Parameters<typeof api.resetPassword>[0]);
      setStep("success");
    } catch (e: unknown) {
      const errObj = e as { responseData?: { requires2FA?: boolean } };
      if (errObj?.responseData?.requires2FA) {
        setStep("totp-verify");
        setLoading(false);
        return;
      }
      setError(e instanceof Error ? e.message : String(T("verificationFailed")));
    }
    setLoading(false);
  };

  /* ── 2FA handlers ── */
  const handle2faVerify = useCallback(
    async (code: string) => {
      setTwoFaLoading(true);
      setTwoFaError("");
      try {
        let captchaToken: string | undefined;
        if (auth.captchaEnabled) {
          try {
            captchaToken = await executeCaptcha("reset_password_2fa", captchaSiteKey);
          } catch (_e) {
            log.debug(
              { err: _e },
              "[ForgotPassword] captcha failed (reset-2fa) — proceeding without token"
            );
          }
        }
        await api.resetPassword({
          resetToken,
          newPassword,
          totpCode: code,
          ...(captchaToken ? { captchaToken } : {}),
        } as Parameters<typeof api.resetPassword>[0]);
        setStep("success");
      } catch (e: unknown) {
        setTwoFaError(e instanceof Error ? e.message : String(T("verificationFailed")));
      }
      setTwoFaLoading(false);
    },
    [resetToken, newPassword, auth.captchaEnabled, captchaSiteKey, T]
  );

  const handle2faBackup = useCallback(
    async (code: string) => {
      await handle2faVerify(code);
    },
    [handle2faVerify]
  );

  /* ── Back navigation ── */
  const goBack = () => {
    clearError();
    if (step === "send-otp") setStep("choose-method");
    else if (step === "enter-otp") setStep("send-otp");
    else if (step === "new-password") setStep("enter-otp");
  };

  const strength = getPasswordStrength(newPassword);

  /* ── Shared styles ── */
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: theme.background,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
  };

  const cardStyle: React.CSSProperties = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 20,
    padding: "24px 22px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 48,
    padding: "0 16px",
    borderRadius: 12,
    background: theme.background,
    border: `1.5px solid ${theme.border}`,
    color: theme.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: theme.primary,
    marginBottom: 6,
  };

  const btnPrimary = (disabled = false): React.CSSProperties => ({
    width: "100%",
    height: 48,
    borderRadius: 12,
    border: "none",
    background: disabled
      ? `${theme.primary}60`
      : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    opacity: disabled ? 0.7 : 1,
  });

  const backBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: "0 0 16px",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  /* ── Step: success ── */
  if (step === "success") {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: `${theme.primary}15`,
              border: `2px solid ${theme.primary}40`,
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

  /* ── Step: totp-verify ── */
  if (step === "totp-verify") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <button onClick={() => setStep("new-password")} style={backBtnStyle}>
            <ArrowLeft size={14} /> {T("back")}
          </button>
          <TwoFactorVerify
            onVerify={handle2faVerify}
            onBackupCode={handle2faBackup}
            verifyLoading={twoFaLoading}
            verifyError={twoFaError}
            showTrustDevice={false}
          />
        </div>
      </div>
    );
  }

  /* ── Main flow ── */
  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 20,
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
            boxShadow: `0 8px 28px ${theme.primary}45`,
          }}
        >
          <KeyRound size={30} color="#fff" />
        </div>
        <h1 style={{ color: theme.text, fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>
          {T("forgotPassword")}
        </h1>
        <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>{T("forgotPasswordDesc")}</p>
      </div>

      <div style={cardStyle}>
        {/* Back button */}
        {step !== "choose-method" && (
          <button onClick={goBack} style={backBtnStyle}>
            <ArrowLeft size={14} /> {T("back")}
          </button>
        )}

        {/* Error / rate-limit banner */}
        {(error || isRateLimited) && (
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
              fontWeight: 500,
            }}
          >
            {isRateLimited ? `⏳ Too many attempts. Try again in ${secondsLeft}s` : error}
          </div>
        )}

        {/* ── Step: choose-method ── */}
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
                  width: "100%",
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
                  gap: 14,
                  padding: "0 16px",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.primary)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.border)}
              >
                <Phone size={20} color={theme.primary} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{T("resetViaPhone")}</div>
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
                  width: "100%",
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
                  gap: 14,
                  padding: "0 16px",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.primary)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.border)}
              >
                <Mail size={20} color={theme.primary} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{T("resetViaEmail")}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>OTP via Email</div>
                </div>
              </button>
            )}
            {/* Fallback: if neither is enabled show phone by default */}
            {!hasPhoneOtp && !hasEmailOtp && (
              <button
                onClick={() => {
                  setMethod("phone");
                  setStep("send-otp");
                }}
                style={{
                  width: "100%",
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
                  gap: 14,
                  padding: "0 16px",
                }}
              >
                <Phone size={20} color={theme.primary} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{T("resetViaPhone")}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>OTP via SMS</div>
                </div>
              </button>
            )}
          </div>
        )}

        {/* ── Step: send-otp ── */}
        {step === "send-otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {method === "phone" ? (
              <>
                <h3 style={{ color: theme.text, fontSize: 17, fontWeight: 700, margin: 0 }}>
                  {T("resetViaPhone")}
                </h3>
                <label style={labelStyle}>Phone Number *</label>
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
                      whiteSpace: "nowrap",
                    }}
                  >
                    +92
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, "");
                      if (v.startsWith("92")) v = v.slice(2);
                      if (v.startsWith("0")) v = v.slice(1);
                      setPhone(v.slice(0, 10));
                      clearError();
                    }}
                    placeholder={phoneHint}
                    onKeyDown={(e) => e.key === "Enter" && void sendOtp()}
                    style={{ ...inputStyle, flex: 1 }}
                    autoFocus
                  />
                </div>
                <p style={{ fontSize: 11, color: theme.textMuted, margin: "0" }}>
                  Format: 03XX-XXXXXXX or +923XX-XXXXXXX
                </p>
              </>
            ) : (
              <>
                <h3 style={{ color: theme.text, fontSize: 17, fontWeight: 700, margin: 0 }}>
                  {T("resetViaEmail")}
                </h3>
                <label style={labelStyle}>Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  placeholder="your@email.com"
                  onKeyDown={(e) => e.key === "Enter" && void sendOtp()}
                  style={inputStyle}
                  autoFocus
                />
              </>
            )}
            <button
              onClick={() => void sendOtp()}
              disabled={loading || isRateLimited}
              style={btnPrimary(loading || isRateLimited)}
            >
              {loading ? (
                <>
                  <Spin /> Sending…
                </>
              ) : (
                "Send Reset OTP"
              )}
            </button>
          </div>
        )}

        {/* ── Step: enter-otp ── */}
        {step === "enter-otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <h3 style={{ color: theme.text, fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
                {T("enterResetOtp")}
              </h3>
              <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
                Sent to:{" "}
                <strong style={{ color: theme.text }}>
                  {method === "phone" ? `+92${phone}` : email}
                </strong>
              </p>
            </div>

            {/* Dev OTP display — only when explicitly enabled */}
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

            <OtpBoxes
              value={otp}
              onChange={(v) => {
                setOtp(v);
                clearError();
              }}
              primaryColor={theme.primary}
              borderColor={theme.border}
              bgColor={theme.background}
              textColor={theme.text}
            />

            <button
              onClick={() => void verifyOtp()}
              disabled={otp.length !== 6 || loading}
              style={btnPrimary(otp.length !== 6 || loading)}
            >
              {loading ? "Verifying..." : "Continue"}
            </button>

            {/* Resend button with countdown */}
            <div style={{ textAlign: "center" }}>
              {resendCooldown > 0 ? (
                <span style={{ fontSize: 13, color: theme.textMuted }}>
                  Resend OTP in <strong style={{ color: theme.primary }}>{resendCooldown}s</strong>
                </span>
              ) : (
                <button
                  onClick={() => void sendOtp()}
                  disabled={loading || isRateLimited}
                  style={{
                    background: "none",
                    border: "none",
                    color: loading || isRateLimited ? theme.textMuted : theme.primary,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: loading || isRateLimited ? "not-allowed" : "pointer",
                    padding: 0,
                  }}
                >
                  {loading ? "Sending…" : "Resend OTP"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step: new-password ── */}
        {step === "new-password" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ color: theme.text, fontSize: 17, fontWeight: 700, margin: 0 }}>
              Set New Password
            </h3>

            {/* New password field */}
            <div>
              <label style={labelStyle}>New Password *</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    clearError();
                  }}
                  placeholder="Min. 8 characters"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: theme.textMuted,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Strength bar */}
              {newPassword && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ height: 4, borderRadius: 999, background: theme.border }}>
                    <div
                      style={{
                        width: `${strength.pct}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: strength.color,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: strength.color }}>
                    {T(strength.label)}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm password field */}
            <div>
              <label style={labelStyle}>Confirm Password *</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => {
                    setConfirmPw(e.target.value);
                    clearError();
                  }}
                  placeholder="Re-enter password"
                  style={{ ...inputStyle, paddingRight: 44 }}
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
                    padding: 0,
                  }}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Real-time match feedback */}
              {confirmPw && (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    marginTop: 4,
                    color: newPassword === confirmPw ? "#10b981" : "#f87171",
                  }}
                >
                  {newPassword === confirmPw ? "✓ Passwords match" : "✗ Passwords do not match"}
                </div>
              )}
            </div>

            <button
              onClick={() => void resetPassword()}
              disabled={loading}
              style={btnPrimary(loading)}
            >
              {loading ? (
                <>
                  <Spin /> Resetting…
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </div>
        )}

        {/* Back to login link */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link
            href="/login"
            style={{
              fontSize: 13,
              color: theme.primary,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
