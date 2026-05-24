/**
 * ForgotPassword.tsx — vendor-app
 *
 * Multi-step password reset flow for vendor accounts.
 * Dark orange theme matching the AJKMart Vendor brand (#F97316 on #0F1117).
 *
 * Steps:
 *   1. choose-method  — Phone OTP or Email OTP (based on platform config)
 *   2. send-otp       — Collect phone/email, send the OTP
 *   3. enter-otp      — Enter the 6-digit OTP (box inputs)
 *   4. new-password   — Set and confirm new password
 *   5. totp-verify    — TOTP 2FA gate (only if account has 2FA enabled)
 *   6. success        — Done
 */
import { createLogger } from "@/lib/logger";
import { useRateLimitCountdown } from "@workspace/auth-react";
import { TwoFactorVerify, executeCaptcha, formatPhoneForApi } from "@workspace/auth-utils";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound, Mail, Phone } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import { getVendorAuthConfig, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
const log = createLogger("[VendorForgotPassword]");

/* ── Brand tokens ─────────────────────────────────── */
const T_ = {
  bg: "#0F1117",
  surface: "#161B22",
  border: "#252D3A",
  text: "#E2E8F0",
  muted: "#6B7280",
  primary: "#F97316",
  primaryD: "#EA580C",
};

type ForgotStep =
  | "choose-method"
  | "send-otp"
  | "enter-otp"
  | "new-password"
  | "totp-verify"
  | "success";

function getPasswordStrength(pw: string): {
  level: number;
  label: TranslationKey;
  color: string;
  pct: string;
} {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "passwordWeak", color: "#ef4444", pct: "25%" };
  if (score <= 2) return { level: 2, label: "passwordFair", color: "#f97316", pct: "50%" };
  if (score <= 3) return { level: 3, label: "passwordGood", color: "#eab308", pct: "75%" };
  return { level: 4, label: "passwordStrong", color: "#22c55e", pct: "100%" };
}

/* ── Shared input style ── */
const inputCss: React.CSSProperties = {
  width: "100%",
  height: 48,
  padding: "0 16px",
  borderRadius: 12,
  background: T_.bg,
  border: `1.5px solid ${T_.border}`,
  color: T_.text,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

/* ── Primary button style ── */
function BtnPrimary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        height: 48,
        borderRadius: 12,
        border: "none",
        background: disabled
          ? `${T_.primary}60`
          : `linear-gradient(135deg, ${T_.primary}, ${T_.primaryD})`,
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );
}

/* ── Spinner ── */
function Spin() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="2.5"
      strokeLinecap="round"
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

/* ── OTP box inputs ── */
function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
            background: value[i] ? `${T_.primary}18` : T_.bg,
            border: `1.5px solid ${value[i] ? T_.primary : T_.border}`,
            color: T_.text,
            transition: "all 0.15s",
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}

export default function ForgotPassword() {
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language); // eslint-disable-line react-hooks/exhaustive-deps
  const auth = getVendorAuthConfig(config);
  const captchaSiteKey = config.auth?.captchaSiteKey;
  const phoneHint = config.regional?.phoneHint ?? "03XXXXXXXXX";

  const isValidPhone = (() => {
    try {
      if (config.regional?.phoneFormat) {
        const re = new RegExp(config.regional.phoneFormat);
        return (p: string) => re.test(p);
      }
    } catch (err) {
      log.warn("phoneFormat regex compilation failed, using default:", err);
    }
    return (p: string) => /^0?3\d{9}$/.test(p.replace(/[\s\-()+]/g, ""));
  })();

  const { isRateLimited, secondsLeft, triggerRateLimit } = useRateLimitCountdown();

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

  const [twoFaError, setTwoFaError] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  const clearError = () => setError("");

  const hasPhoneOtp = auth.phoneOtp;
  const hasEmailOtp = auth.emailOtp;

  const sendOtp = async () => {
    clearError();
    if (isRateLimited) return;
    if (method === "phone" && (!phone || !isValidPhone(phone))) {
      setError(`${T("enterValidPhone")} (e.g. ${phoneHint})`);
      return;
    }
    if (method === "email" && (!email || !email.includes("@"))) {
      setError(T("enterValidEmail"));
      return;
    }
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try {
          captchaToken = await executeCaptcha("forgot_password", captchaSiteKey);
        } catch (err) {
          log.warn("captcha failed:", err);
        }
        if (!captchaToken) {
          setError(T("captchaRequired"));
          setLoading(false);
          return;
        }
      }
      const forgotPayload = {
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        ...(captchaToken ? { captchaToken } : {}),
      } as unknown as Parameters<typeof api.forgotPassword>[0];
      const res = await api.forgotPassword(forgotPayload);
      if ((res as Record<string, unknown>).otp)
        setDevOtp((res as Record<string, unknown>).otp as string);
      setStep("enter-otp");
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : T("sendOtpFailed");
      const status = (e as Record<string, unknown>)?.status as number | undefined;
      const retryAfter = (
        (e as Record<string, unknown>)?.responseData as Record<string, unknown> | undefined
      )?.retryAfter;
      if (status === 429 || /too many|rate limit|lockout/.test(errMsg.toLowerCase())) {
        triggerRateLimit(typeof retryAfter === "number" ? retryAfter : 60);
      }
      setError(errMsg);
    }
    setLoading(false);
  };

  /* Step 1: Verify OTP and get reset token */
  const verifyOtp = async () => {
    clearError();
    if (!otp || otp.length < 6) {
      setError(T("enterOtpDigits"));
      return;
    }
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try {
          captchaToken = await executeCaptcha("verify_reset_otp", captchaSiteKey);
        } catch (err) {
          log.warn("captcha failed:", err);
        }
      }
      const verifyPayload = {
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        otp,
        ...(captchaToken ? { captchaToken } : {}),
      } as Parameters<typeof api.verifyResetOtp>[0];
      const res = (await api.verifyResetOtp(verifyPayload)) as Record<string, unknown>;
      const token = res.resetToken as string | undefined;
      if (!token) throw new Error("No reset token received");
      setResetToken(token);
      setStep("new-password");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : T("verificationFailed"));
    }
    setLoading(false);
  };

  /* Step 2: Reset password with reset token */
  const resetPassword = async (totpCode?: string) => {
    clearError();
    if (!resetToken) {
      setError("Session expired. Please try again.");
      return;
    }
    if (newPassword.length < 8) {
      setError(T("passwordMinLength"));
      return;
    }
    if (newPassword !== confirmPw) {
      setError(T("passwordsDoNotMatch"));
      return;
    }
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try {
          captchaToken = await executeCaptcha("reset_password", captchaSiteKey);
        } catch (err) {
          log.warn("captcha failed:", err);
        }
      }
      const resetPayload = {
        resetToken,
        newPassword,
        ...(totpCode ? { totpCode } : {}),
        ...(captchaToken ? { captchaToken } : {}),
      } as Parameters<typeof api.resetPassword>[0];
      await api.resetPassword(resetPayload);
      setStep("success");
    } catch (e: unknown) {
      const errObj = e as { responseData?: { requires2FA?: boolean } };
      if (errObj?.responseData?.requires2FA) {
        setStep("totp-verify");
        setLoading(false);
        return;
      }
      setError(e instanceof Error ? e.message : T("verificationFailed"));
    }
    setLoading(false);
  };

  const handle2faVerify = useCallback(
    async (code: string) => {
      setTwoFaLoading(true);
      setTwoFaError("");
      try {
        let captchaToken: string | undefined;
        if (auth.captchaEnabled) {
          try {
            captchaToken = await executeCaptcha("reset_password_2fa", captchaSiteKey);
          } catch (err) {
            log.warn("captcha failed:", err);
          }
        }
        const r2Payload = {
          resetToken,
          newPassword,
          totpCode: code,
          ...(captchaToken ? { captchaToken } : {}),
        } as Parameters<typeof api.resetPassword>[0];
        await api.resetPassword(r2Payload);
        setStep("success");
      } catch (e: unknown) {
        setTwoFaError(e instanceof Error ? e.message : T("verificationFailed"));
      }
      setTwoFaLoading(false);
    },
    [resetToken, newPassword, auth.captchaEnabled, captchaSiteKey, T]
  );

  const handle2faBackup = useCallback(
    async (code: string) => {
      void handle2faVerify(code);
    },
    [handle2faVerify]
  );

  /* ── Shared wrapper ── */
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: T_.bg,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
  };

  const cardStyle: React.CSSProperties = {
    background: T_.surface,
    border: `1px solid ${T_.border}`,
    borderRadius: 20,
    padding: "24px 22px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  };

  /* ── Success screen ── */
  if (step === "success") {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: `${T_.primary}15`,
              border: `2px solid ${T_.primary}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <CheckCircle size={36} color={T_.primary} />
          </div>
          <h2 style={{ color: T_.text, fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
            {T("passwordResetSuccess")}
          </h2>
          <p style={{ color: T_.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
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
              background: `linear-gradient(135deg, ${T_.primary}, ${T_.primaryD})`,
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

  /* ── TOTP screen ── */
  if (step === "totp-verify") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <button
            onClick={() => setStep("new-password")}
            style={{
              background: "none",
              border: "none",
              color: T_.muted,
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

  /* ── Main form ── */
  const goBack = () => {
    if (step === "send-otp") setStep("choose-method");
    else if (step === "enter-otp") setStep("send-otp");
    else if (step === "new-password") setStep("enter-otp");
    clearError();
  };

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 20,
            background: `linear-gradient(135deg, ${T_.primary}, ${T_.primaryD})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
            boxShadow: `0 8px 28px ${T_.primary}45`,
          }}
        >
          <KeyRound size={32} color="#fff" />
        </div>
        <h1 style={{ color: T_.text, fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>
          {T("forgotPassword")}
        </h1>
        <p style={{ color: T_.muted, fontSize: 13, margin: 0 }}>{T("forgotPasswordDesc")}</p>
      </div>

      <div style={cardStyle}>
        {/* Back button */}
        {step !== "choose-method" && (
          <button
            onClick={goBack}
            style={{
              background: "none",
              border: "none",
              color: T_.muted,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: "0 0 16px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ArrowLeft size={14} /> {T("back")}
          </button>
        )}

        {/* Error banner */}
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
            <h3 style={{ color: T_.text, fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
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
                  border: `1.5px solid ${T_.border}`,
                  borderRadius: 14,
                  background: T_.bg,
                  color: T_.text,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "0 16px",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T_.primary)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T_.border)}
              >
                <Phone size={20} color={T_.primary} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{T("resetViaPhone")}</div>
                  <div style={{ fontSize: 11, color: T_.muted }}>OTP via SMS</div>
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
                  border: `1.5px solid ${T_.border}`,
                  borderRadius: 14,
                  background: T_.bg,
                  color: T_.text,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "0 16px",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T_.primary)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T_.border)}
              >
                <Mail size={20} color={T_.primary} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{T("resetViaEmail")}</div>
                  <div style={{ fontSize: 11, color: T_.muted }}>OTP via Email</div>
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
                <h3 style={{ color: T_.text, fontSize: 17, fontWeight: 700, margin: 0 }}>
                  {T("resetViaPhone")}
                </h3>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: T_.primary,
                  }}
                >
                  Phone Number *
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div
                    style={{
                      height: 48,
                      padding: "0 12px",
                      background: T_.bg,
                      border: `1.5px solid ${T_.border}`,
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      fontSize: 13,
                      fontWeight: 600,
                      color: T_.muted,
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
                    onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                    style={{ ...inputCss, flex: 1 }}
                    autoFocus
                  />
                </div>
              </>
            ) : (
              <>
                <h3 style={{ color: T_.text, fontSize: 17, fontWeight: 700, margin: 0 }}>
                  {T("resetViaEmail")}
                </h3>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: T_.primary,
                  }}
                >
                  Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  placeholder="your@email.com"
                  onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                  style={inputCss}
                  autoFocus
                />
              </>
            )}
            <BtnPrimary onClick={sendOtp} disabled={loading || isRateLimited}>
              {loading ? (
                <>
                  <Spin /> {T("pleaseWait")}
                </>
              ) : isRateLimited ? (
                `Try again in ${secondsLeft}s`
              ) : (
                T("sendResetOtp")
              )}
            </BtnPrimary>
          </div>
        )}

        {/* ── Step: enter-otp ── */}
        {step === "enter-otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <h3 style={{ color: T_.text, fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
                {T("enterResetOtp")}
              </h3>
              <p style={{ color: T_.muted, fontSize: 13, margin: 0 }}>
                {method === "phone" ? `+92 ${phone}` : email}
              </p>
            </div>
            {import.meta.env.DEV && devOtp && (
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
                Dev OTP: <strong style={{ color: T_.primary }}>{devOtp}</strong>
              </div>
            )}
            <OtpBoxes
              value={otp}
              onChange={(v) => {
                setOtp(v);
                clearError();
              }}
            />
            <BtnPrimary onClick={verifyOtp} disabled={loading || otp.length < 6}>
              {loading ? (
                <>
                  <Spin /> {T("pleaseWait")}
                </>
              ) : (
                T("nextStep")
              )}
            </BtnPrimary>
            <button
              onClick={sendOtp}
              style={{
                background: "none",
                border: "none",
                color: T_.muted,
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
                textAlign: "center",
              }}
            >
              {T("resendOtp")}
            </button>
          </div>
        )}

        {/* ── Step: new-password ── */}
        {step === "new-password" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ color: T_.text, fontSize: 17, fontWeight: 700, margin: 0 }}>
              {T("newPassword")}
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: T_.primary,
                  marginBottom: 6,
                }}
              >
                New Password *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    clearError();
                  }}
                  placeholder="Min 8 characters"
                  style={{ ...inputCss, paddingRight: 44 }}
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
                    color: T_.muted,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      background: "#252D3A",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: getPasswordStrength(newPassword).pct,
                        background: getPasswordStrength(newPassword).color,
                        borderRadius: 4,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T_.muted }}>
                    {T(getPasswordStrength(newPassword).label)}
                  </span>
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
                  color: T_.primary,
                  marginBottom: 6,
                }}
              >
                Confirm Password *
              </label>
              <input
                type={showPwd ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => {
                  setConfirmPw(e.target.value);
                  clearError();
                }}
                placeholder="Re-enter password"
                style={inputCss}
              />
              {confirmPw && newPassword !== confirmPw && (
                <p style={{ color: "#ef4444", fontSize: 11, margin: "4px 0 0" }}>
                  {T("passwordsDoNotMatch")}
                </p>
              )}
            </div>
            <BtnPrimary onClick={() => resetPassword()} disabled={loading}>
              {loading ? (
                <>
                  <Spin /> {T("pleaseWait")}
                </>
              ) : (
                T("resetPassword")
              )}
            </BtnPrimary>
          </div>
        )}

        {/* Back to login */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link
            href="/login"
            style={{ fontSize: 13, color: T_.primary, fontWeight: 600, textDecoration: "none" }}
          >
            {T("backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
