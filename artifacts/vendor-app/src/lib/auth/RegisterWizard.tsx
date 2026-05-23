/**
 * RegisterWizard.tsx — vendor-app
 *
 * Multi-step registration wizard for vendors:
 *   Store Info → Documents → Bank/Wallet → OTP + Password → Done
 *
 * Wraps @workspace/auth-react RegisterScreen with vendor-specific
 * step configuration, API wiring, and dark orange theme tokens.
 *
 * Passwords are excluded from the draft to avoid plain-text storage.
 */
import type { StepComponentProps, StepConfig } from "@workspace/auth-react";
import { RegisterScreen, captureDeviceMeta } from "@workspace/auth-react";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { isValidCnic, isValidPhone } from "@workspace/phone-utils";
import { PAKISTAN_CITIES } from "@workspace/service-constants";
import { CheckCircle2, Clock, Eye, EyeOff, Lock, Shield } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { api } from "../api";
import { usePlatformConfig } from "../useConfig";
import { useLanguage } from "../useLanguage";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./useAuth";

const DRAFT_KEY = "vendor_reg_draft";
const DRAFT_TTL_KEY = "vendor_reg_draft_ts";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const STORE_CATS = [
  "Grocery",
  "Restaurant",
  "Bakery",
  "Pharmacy",
  "Electronics",
  "Clothing",
  "General Store",
  "Fast Food",
  "Fruits & Vegetables",
  "Dairy",
  "Meat & Poultry",
  "Other",
];

/* ── Inline styles for dark-theme inputs ── */
function darkInput(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%",
    height: 48,
    padding: "0 14px",
    borderRadius: 12,
    background: "#0F1117",
    border: "1.5px solid #252D3A",
    color: "#E2E8F0",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
    ...extra,
  };
}

function darkSelect(): React.CSSProperties {
  return {
    ...darkInput(),
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: 36,
  };
}

function labelStyle(primary: string): React.CSSProperties {
  return {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: primary,
    marginBottom: 6,
  };
}

/* ── Step 1: Store Info ──────────────────────────────────────────────── */
function StoreInfoStep({ data, onChange, onError }: StepComponentProps) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const theme = useTheme();
  const pr = theme.primary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p style={{ color: "#E2E8F0", fontWeight: 800, fontSize: 17, margin: "0 0 2px" }}>
          {T("storeDetails")}
        </p>
        <p style={{ color: "#6B7280", fontSize: 13, margin: "0 0 12px" }}>
          {T("tellUsAboutYourBusiness")}
        </p>
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("storeName")} *</label>
        <input
          style={darkInput()}
          value={(data.storeName as string) ?? ""}
          onChange={(e) => {
            onChange("storeName", e.target.value);
            onError("");
          }}
          placeholder="Ali's Grocery"
        />
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("category")} *</label>
        <select
          style={darkSelect()}
          value={(data.storeCategory as string) ?? ""}
          onChange={(e) => {
            onChange("storeCategory", e.target.value);
            onError("");
          }}
        >
          <option value="">{T("selectCategory")}</option>
          {STORE_CATS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("ownerName")} *</label>
        <input
          style={darkInput()}
          value={(data.ownerName as string) ?? ""}
          onChange={(e) => {
            onChange("ownerName", e.target.value);
            onError("");
          }}
          placeholder="Full name"
        />
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("city")} *</label>
        <select
          style={darkSelect()}
          value={(data.city as string) ?? ""}
          onChange={(e) => {
            onChange("city", e.target.value);
            onError("");
          }}
        >
          <option value="">{T("selectCity")}</option>
          {PAKISTAN_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ── Step 2: Documents ────────────────────────────────────────────── */
function DocumentsStep({ data, onChange, onError }: StepComponentProps) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const theme = useTheme();
  const pr = theme.primary;

  const formatCnic = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p style={{ color: "#E2E8F0", fontWeight: 800, fontSize: 17, margin: "0 0 2px" }}>
          Contact Details
        </p>
        <p style={{ color: "#6B7280", fontSize: 13, margin: "0 0 12px" }}>
          Your mobile number for OTP verification
        </p>
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("cnicNumber")}</label>
        <input
          style={darkInput()}
          value={(data.cnic as string) ?? ""}
          onChange={(e) => {
            onChange("cnic", formatCnic(e.target.value));
            onError("");
          }}
          placeholder="XXXXX-XXXXXXX-X (optional)"
          maxLength={15}
          inputMode="numeric"
        />
        {(data.cnic as string)?.length > 0 && !isValidCnic((data.cnic as string) ?? "") && (
          <p style={{ color: "#6B7280", fontSize: 11, margin: "4px 0 0" }}>
            Format: XXXXX-XXXXXXX-X
          </p>
        )}
        <p style={{ color: "#6B7280", fontSize: 11, margin: "4px 0 0" }}>
          Optional — complete this in your profile after approval.
        </p>
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("phoneNumber")} *</label>
        <input
          style={darkInput()}
          value={(data.phone as string) ?? ""}
          onChange={(e) => {
            onChange("phone", e.target.value);
            onError("");
          }}
          placeholder="03XXXXXXXXX or +92XXXXXXXXXX"
          inputMode="tel"
          maxLength={15}
        />
      </div>
      <div
        style={{
          background: `${pr}0d`,
          border: `1px solid ${pr}25`,
          borderRadius: 12,
          padding: "12px 14px",
        }}
      >
        <p style={{ color: pr, fontSize: 11, fontWeight: 700, margin: "0 0 4px" }}>
          📋 KYC Verification (After Approval)
        </p>
        <p style={{ color: "#6B7280", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
          Once your vendor account is approved, you can complete full KYC identity verification from
          your Profile to unlock wallet withdrawals and advanced features.
        </p>
      </div>
    </div>
  );
}

/* ── Step 3: Bank / Wallet ──────────────────────────────────────────── */
function BankStep({ data, onChange, onError }: StepComponentProps) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const theme = useTheme();
  const pr = theme.primary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p style={{ color: "#E2E8F0", fontWeight: 800, fontSize: 17, margin: "0 0 2px" }}>
          {T("bankDetails")}
        </p>
        <p style={{ color: "#6B7280", fontSize: 13, margin: "0 0 12px" }}>
          {T("addPaymentDetails")}
        </p>
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("bankName")}</label>
        <input
          style={darkInput()}
          value={(data.bankName as string) ?? ""}
          onChange={(e) => {
            onChange("bankName", e.target.value);
            onError("");
          }}
          placeholder="e.g. HBL"
        />
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("accountTitle")}</label>
        <input
          style={darkInput()}
          value={(data.bankAccountTitle as string) ?? ""}
          onChange={(e) => {
            onChange("bankAccountTitle", e.target.value);
            onError("");
          }}
          placeholder="Account holder name"
        />
      </div>
      <div>
        <label style={labelStyle(pr)}>{T("accountNumber")}</label>
        <input
          style={darkInput()}
          value={(data.bankAccount as string) ?? ""}
          onChange={(e) => {
            onChange("bankAccount", e.target.value);
            onError("");
          }}
          placeholder="IBAN / Account number"
        />
      </div>
    </div>
  );
}

/* ── Password strength helper ── */
function getPasswordStrength(pw: string): {
  level: number;
  label: string;
  color: string;
  width: string;
} {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "Weak", color: "#ef4444", width: "25%" };
  if (score <= 2) return { level: 2, label: "Fair", color: "#f97316", width: "50%" };
  if (score <= 3) return { level: 3, label: "Good", color: "#F0B90B", width: "75%" };
  return { level: 4, label: "Strong", color: "#10b981", width: "100%" };
}

/* ── Spinner SVG ── */
function Spinner({ color = "#E2E8F0" }: { color?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
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

/* ── Step 4: OTP + Password ──────────────────────────────────────────────── */
function OtpPasswordStep({ data, onChange, onError }: StepComponentProps) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const theme = useTheme();
  const pr = theme.primary;
  const { sendOtp, verifyOtp } = useAuth();
  const [otp, setOtp] = useState((data.otp as string) ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [otpStatus, setOtpStatus] = useState<"idle" | "verifying" | "verified" | "failed">(
    data.otpVerified === true ? "verified" : "idle"
  );
  const [otpErrorMsg, setOtpErrorMsg] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  /* Auto-send OTP when the step first mounts (if not already verified) */
  useEffect(() => {
    if (data.otpVerified === true) return;
    const phone = (data.phone as string) ?? "";
    if (!phone) return;
    void sendOtp(phone).then((result) => {
      if (!result.success) onError(result.error ?? "Failed to send OTP. Use Resend to try again.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Auto-verify OTP the moment all 6 digits are entered */
  const autoVerifyOtp = useCallback(
    async (code: string) => {
      const phone = (data.phone as string) ?? "";
      if (!phone || code.length !== 6) return;
      setOtpStatus("verifying");
      setOtpErrorMsg("");
      onError("");
      const result = await verifyOtp(phone, code);
      if (result.success && result.data) {
        api.storeTokens(result.data.token, result.data.refreshToken);
        onChange("otpVerified", true);
        setOtpStatus("verified");
      } else {
        setOtpStatus("failed");
        const msg = result.error ?? "Invalid code. Please try again.";
        setOtpErrorMsg(msg);
        onError(msg);
        onChange("otpVerified", false);
      }
    },
    [data.phone, verifyOtp, onChange, onError]
  );

  const handleOtpChange = (i: number, raw: string) => {
    if (otpStatus === "verifying") return;
    const v = raw.replace(/\D/g, "").slice(0, 1);
    const chars = otp.split("");
    chars[i] = v;
    const next = chars.join("").slice(0, 6);
    setOtp(next);
    onChange("otp", next);
    onError("");
    setOtpErrorMsg("");
    if (otpStatus !== "idle") {
      setOtpStatus("idle");
      onChange("otpVerified", false);
    }
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
    if (next.length === 6) void autoVerifyOtp(next);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) inputRefs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    setOtp(pasted);
    onChange("otp", pasted);
    onError("");
    setOtpErrorMsg("");
    if (otpStatus !== "idle") {
      setOtpStatus("idle");
      onChange("otpVerified", false);
    }
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) void autoVerifyOtp(pasted);
  };

  const handleResend = async () => {
    const phone = (data.phone as string) ?? "";
    if (!phone || resending || resendCooldown > 0) return;
    setResending(true);
    setOtp("");
    setOtpStatus("idle");
    onChange("otp", "");
    onChange("otpVerified", false);
    onError("");
    const result = await sendOtp(phone);
    setResending(false);
    if (!result.success) {
      onError(result.error ?? "Failed to resend OTP. Please try again.");
      return;
    }
    setResendCooldown(30);
  };

  const pw = (data.password as string) ?? "";
  const confirmPw = (data.confirmPassword as string) ?? "";
  const strength = pw ? getPasswordStrength(pw) : null;
  const passwordsMatch = confirmPw.length > 0 && pw === confirmPw;
  const passwordsMismatch = confirmPw.length > 0 && pw !== confirmPw;
  const isVerifying = otpStatus === "verifying";
  const isVerified = otpStatus === "verified";
  const isFailed = otpStatus === "failed";

  /* OTP box border colour based on state */
  const otpBoxBorder = (i: number) => {
    if (isVerified) return "1.5px solid #10b981";
    if (isFailed && otp[i]) return "1.5px solid #ef4444";
    return `1.5px solid ${otp[i] ? pr : "#252D3A"}`;
  };
  const otpBoxBg = (i: number) => {
    if (isVerified) return "#10b98118";
    if (isFailed && otp[i]) return "#ef444418";
    return otp[i] ? `${pr}18` : "#0F1117";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p style={{ color: "#E2E8F0", fontWeight: 800, fontSize: 17, margin: "0 0 2px" }}>
          {T("verifyAndSecure")}
        </p>
        <p style={{ color: "#6B7280", fontSize: 13, margin: "0 0 12px" }}>
          A verification code was sent to{" "}
          <strong style={{ color: "#E2E8F0" }}>{(data.phone as string) ?? "your phone"}</strong>
        </p>
      </div>

      {/* OTP input */}
      <div>
        <label style={labelStyle(pr)}>{T("otpCode")} *</label>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }} onPaste={handlePaste}>
          {Array.from({ length: 6 }).map((_, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={otp[i] ?? ""}
              disabled={isVerifying || isVerified}
              onChange={(e) => handleOtpChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={{
                width: 44,
                height: 52,
                borderRadius: 12,
                textAlign: "center",
                fontSize: 22,
                fontWeight: 700,
                outline: "none",
                background: otpBoxBg(i),
                border: otpBoxBorder(i),
                color: "#E2E8F0",
                transition: "all 0.15s",
                boxSizing: "border-box",
                opacity: isVerifying ? 0.7 : 1,
              }}
            />
          ))}
        </div>

        {/* Real-time OTP status feedback */}
        {isVerifying && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 10,
            }}
          >
            <Spinner color="#6B7280" />
            <span style={{ color: "#6B7280", fontSize: 12 }}>Verifying code…</span>
          </div>
        )}
        {isVerified && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 10,
              background: "#10b98115",
              border: "1px solid #10b98140",
              borderRadius: 10,
              padding: "8px 14px",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>
              Phone number verified
            </span>
          </div>
        )}
        {isFailed && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 10,
              background: "#ef444415",
              border: "1px solid #ef444440",
              borderRadius: 10,
              padding: "8px 14px",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span style={{ color: "#ef4444", fontSize: 13 }}>
              {otpErrorMsg || "Invalid code. Clear and try again."}
            </span>
          </div>
        )}

        <p style={{ textAlign: "center", color: "#6B7280", fontSize: 12, marginTop: 10 }}>
          {T("didntReceiveOtp")}{" "}
          {resendCooldown > 0 ? (
            <span style={{ color: "#3D4452" }}>Resend in {resendCooldown}s</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              style={{
                background: "none",
                border: "none",
                color: pr,
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
                opacity: resending ? 0.5 : 1,
              }}
            >
              {resending ? "Sending…" : T("resend")}
            </button>
          )}
        </p>
      </div>

      {/* Only show password fields after OTP is verified */}
      {isVerified && (
        <>
          <div style={{ height: 1, background: "#252D3A", margin: "2px 0" }} />
          <div>
            <label style={labelStyle(pr)}>{T("password")} *</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                style={darkInput({ paddingRight: 44 })}
                value={pw}
                onChange={(e) => {
                  onChange("password", e.target.value);
                  onError("");
                }}
                placeholder="Min 8 characters"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#6B7280",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {strength && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 4,
                      background: "#252D3A",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: strength.width,
                        background: strength.color,
                        borderRadius: 4,
                        transition: "all 0.3s",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: strength.color,
                      minWidth: 42,
                      textAlign: "right",
                    }}
                  >
                    {strength.label}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>
                  {strength.level < 3
                    ? "Add uppercase, numbers, or special characters to strengthen"
                    : "Great password!"}
                </p>
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle(pr)}>{T("confirmPassword")} *</label>
            <div style={{ position: "relative" }}>
              <input
                type={showConfirm ? "text" : "password"}
                style={darkInput({
                  paddingRight: 44,
                  border: `1.5px solid ${passwordsMismatch ? "#ef4444" : passwordsMatch ? "#10b981" : "#252D3A"}`,
                })}
                value={confirmPw}
                onChange={(e) => {
                  onChange("confirmPassword", e.target.value);
                  onError("");
                }}
                placeholder="Re-enter password"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#6B7280",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordsMismatch && (
              <p style={{ fontSize: 10, color: "#ef4444", marginTop: 4 }}>Passwords do not match</p>
            )}
            {passwordsMatch && (
              <p style={{ fontSize: 10, color: "#10b981", marginTop: 4 }}>✓ Passwords match</p>
            )}
          </div>
        </>
      )}

      {/* Prompt when OTP not yet verified */}
      {!isVerified && !isVerifying && (
        <div
          style={{
            background: "#161B22",
            border: "1px solid #252D3A",
            borderRadius: 12,
            padding: "10px 14px",
          }}
        >
          <p style={{ color: "#6B7280", fontSize: 12, margin: 0 }}>
            Enter the 6-digit code above to verify your number, then set your password.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Success screen (rendered outside RegisterScreen after submission) ── */
function SuccessView({
  theme,
  onGoToLogin,
}: {
  theme: ReturnType<typeof useTheme>;
  onGoToLogin: () => void;
}) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `${theme.primary}15`,
          border: `2px solid ${theme.primary}40`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}
      >
        <Shield size={36} style={{ color: theme.primary }} />
      </div>
      <h3 style={{ color: "#E2E8F0", fontWeight: 800, fontSize: 22, margin: "0 0 10px" }}>
        {T("registrationComplete")}
      </h3>
      <p style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
        {T("vendorApprovalMsg")}
      </p>

      <div
        style={{
          background: "#161B22",
          border: "1px solid #252D3A",
          borderRadius: 14,
          padding: "14px 16px",
          textAlign: "left",
          marginBottom: 20,
        }}
      >
        <p
          style={{
            color: theme.primary,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: "0 0 10px",
          }}
        >
          {T("nextSteps")}
        </p>
        {[
          { label: "Registration submitted", done: true },
          { label: "Under admin review", done: false, pulse: true },
          { label: "Get approved & start selling", done: false, locked: true },
        ].map((item, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < 2 ? 8 : 0 }}
          >
            {item.done ? (
              <CheckCircle2 size={15} style={{ color: "#10b981", flexShrink: 0 }} />
            ) : item.locked ? (
              <Lock size={15} style={{ color: "#6B7280", flexShrink: 0 }} />
            ) : (
              <Clock
                size={15}
                style={{
                  color: theme.primary,
                  flexShrink: 0,
                  animation: item.pulse ? "pulse 2s infinite" : undefined,
                }}
              />
            )}
            <span
              style={{
                fontSize: 13,
                color: item.done ? "#10b981" : item.locked ? "#6B7280" : "#E2E8F0",
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <p style={{ color: "#6B7280", fontSize: 13, margin: "0 0 20px", lineHeight: 1.5 }}>
        {T("vendorReviewMsg")}
      </p>

      <button
        type="button"
        onClick={onGoToLogin}
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
        Go to Login →
      </button>
    </div>
  );
}

/* ── Steps (no SuccessStep — handled outside RegisterScreen) ── */
/* Adding a display-only last step (no component, no fields) makes RegisterScreen
   trigger submission when clicking "Submit Registration" on the verify step. */
const STEPS: StepConfig[] = [
  {
    id: "store",
    title: "Store",
    component: StoreInfoStep,
    validate: (data) => {
      if (!String(data.storeName ?? "").trim()) return "Store name is required";
      if (!String(data.storeCategory ?? "").trim()) return "Please select a category";
      if (!String(data.ownerName ?? "").trim()) return "Owner name is required";
      if (!String(data.city ?? "").trim()) return "Please select a city";
      return null;
    },
  },
  {
    id: "documents",
    title: "Contact",
    component: DocumentsStep,
    validate: (data) => {
      const cnic = String(data.cnic ?? "").trim();
      if (cnic && !isValidCnic(cnic)) return "CNIC must be in format XXXXX-XXXXXXX-X";
      const phone = String(data.phone ?? "").trim();
      if (!phone) return "Phone number is required";
      if (!isValidPhone(phone)) return "Enter a valid Pakistani mobile number (03XXXXXXXXX)";
      return null;
    },
  },
  { id: "bank", title: "Bank", component: BankStep },
  {
    id: "verify",
    title: "Verify",
    component: OtpPasswordStep,
    validate: (data) => {
      if (data.otpVerified !== true) return "Please verify your phone number first";
      const pw = String(data.password ?? "");
      if (!pw) return "Password is required";
      if (pw.length < 8) return "Password must be at least 8 characters";
      if (pw !== String(data.confirmPassword ?? "")) return "Passwords do not match";
      return null;
    },
  },
  /* Display-only sentinel — triggers submission at the "verify" step */
  { id: "_done", title: "Done" },
];

export interface RegisterWizardProps {
  onDone?: () => void;
}

export function RegisterWizard({ onDone }: RegisterWizardProps) {
  const theme = useTheme();
  const { sendOtp } = useAuth();
  const [, navigate] = useLocation();
  const { config: _config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const [isRegistered, setIsRegistered] = useState(false);

  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const ts = parseInt(localStorage.getItem(DRAFT_TTL_KEY) ?? "0", 10);
      if (raw && Date.now() - ts > DRAFT_TTL_MS) {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_TTL_KEY);
        return {};
      }
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const handleDataChange = useCallback((key: string, value: unknown) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      const SAFE_FIELDS = new Set([
        "storeName",
        "storeCategory",
        "ownerName",
        "city",
        "phone",
        "bankName",
        "bankAccount",
        "bankAccountTitle",
      ]);
      const safe = Object.fromEntries(Object.entries(next).filter(([k]) => SAFE_FIELDS.has(k)));
      localStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
      localStorage.setItem(DRAFT_TTL_KEY, Date.now().toString());
      return next;
    });
  }, []);

  const handleOtpRequest = async (phone: string): Promise<{ success: boolean; error?: string }> => {
    const result = await sendOtp(phone);
    return { success: result.success, error: result.error };
  };

  const isSubmittingRef = useRef(false);

  const handleSubmit = async (data: Record<string, unknown>) => {
    if (isSubmittingRef.current) return { success: false, error: "Submission already in progress" };
    isSubmittingRef.current = true;
    try {
      const deviceMeta = await Promise.race([
        captureDeviceMeta(),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 2000)),
      ]);
      const res = (await api.vendorRegister({
        phone: data.phone as string,
        storeName: data.storeName as string,
        storeCategory: data.storeCategory as string,
        name: data.ownerName as string,
        cnic: data.cnic as string,
        city: data.city as string,
        bankName: data.bankName as string | undefined,
        bankAccount: data.bankAccount as string | undefined,
        bankAccountTitle: data.bankAccountTitle as string | undefined,
        ...(data.otp ? { otp: data.otp as string } : {}),
        ...(data.password ? { password: data.password as string } : {}),
        ...(deviceMeta ? { deviceMeta } : {}),
      })) as { token?: string; user?: unknown };
      localStorage.removeItem(DRAFT_KEY);
      setIsRegistered(true);
      return { success: true, data: res };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : T("registrationFailed"),
      };
    } finally {
      isSubmittingRef.current = false;
    }
  };

  /* Show the custom success screen after registration completes */
  if (isRegistered) {
    return (
      <div style={{ minHeight: "100vh", background: theme.background }}>
        <div
          style={{
            textAlign: "center",
            paddingTop: 32,
            paddingBottom: 8,
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
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
              boxShadow: `0 6px 20px ${theme.primary}45`,
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h1
            style={{
              color: theme.text,
              fontSize: 22,
              fontWeight: 800,
              margin: "0 0 2px",
              letterSpacing: "-0.3px",
            }}
          >
            {T("vendorRegistration") as string}
          </h1>
        </div>
        <div style={{ maxWidth: 448, margin: "0 auto", padding: "0 16px 40px" }}>
          <div
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 20,
              padding: "28px 24px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            <SuccessView
              theme={theme}
              onGoToLogin={() => {
                onDone?.();
                navigate("/login");
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.background }}>
      {/* ── Branded header ── */}
      <div
        style={{
          textAlign: "center",
          paddingTop: 32,
          paddingBottom: 8,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
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
            boxShadow: `0 6px 20px ${theme.primary}45`,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <h1
          style={{
            color: theme.text,
            fontSize: 22,
            fontWeight: 800,
            margin: "0 0 2px",
            letterSpacing: "-0.3px",
          }}
        >
          {T("vendorRegistration") as string}
        </h1>
        <p style={{ color: theme.textMuted, fontSize: 12, margin: 0 }}>
          Create your AJKMart vendor account
        </p>
      </div>

      <div style={{ maxWidth: 448, margin: "0 auto", padding: "0 16px 40px" }}>
        <RegisterScreen
          bare
          role="vendor"
          steps={STEPS}
          initialData={draft}
          onDataChange={handleDataChange}
          onOtpRequest={handleOtpRequest}
          onSubmit={handleSubmit}
          onDone={() => {
            onDone?.();
            navigate("/login");
          }}
          title={T("vendorRegistration") as string}
        />
      </div>
    </div>
  );
}
