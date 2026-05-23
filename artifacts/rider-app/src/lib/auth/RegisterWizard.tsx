import { OtpInput } from "@workspace/auth-react";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { isValidPhone } from "@workspace/phone-utils";
import { ArrowLeft, CheckCircle, Eye, EyeOff, Shield, Smartphone, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { api } from "../api";
import { useRiderAuthConfig } from "../AuthConfigContext";
import { useLanguage } from "../useLanguage";
import { useTheme } from "./ThemeContext";
import { useAuthOps } from "./useAuth";

const DRAFT_KEY = "rider_reg_draft";
const VEHICLES = ["Bike", "Car", "Rickshaw", "Van", "Truck"] as const;

type Step = 1 | 2 | 3 | 4 | 5;

type Draft = {
  name?: string;
  phone?: string;
  username?: string;
  otp?: string;
  cnic?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  drivingLicense?: string;
  vehicleRegistration?: string;
  vehiclePhoto?: string;
  licensePhoto?: string;
  cnicFrontPhoto?: string;
  cnicBackPhoto?: string;
  password?: string;
  confirmPassword?: string;
  terms?: boolean;
};

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { pct: 25, label: "Weak", color: "#ef4444" };
  if (score <= 2) return { pct: 50, label: "Fair", color: "#f97316" };
  if (score <= 3) return { pct: 75, label: "Good", color: "#f59e0b" };
  return { pct: 100, label: "Strong", color: "#10b981" };
}

export interface RegisterWizardProps {
  onDone?: () => void;
}

export function RegisterWizard({ onDone }: RegisterWizardProps) {
  useEffect(() => {
    const prev = document.title;
    document.title = "AJKMart Rider — Create Account";
    return () => { document.title = prev; };
  }, []);

  const theme = useTheme();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const _auth = useRiderAuthConfig();
  const { sendOtp } = useAuthOps();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Draft;
    } catch {
      return {};
    }
  });

  /* Step 1 — OTP send/verify within the same step */
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  /* Step 2 — password visibility */
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  /* Step 4 — document upload state */
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  /* Username availability */
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "available" | "taken">(
    "idle"
  );
  const usernameAbortRef = useRef<AbortController | null>(null);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => setOtpCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const total = 5;
  const progress = Math.round((step / total) * 100);

  const update = (key: keyof Draft, value: string | boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const checkUsername = async () => {
    const username = (draft.username ?? "").trim();
    if (!username || username.length < 3) {
      setUsernameState("idle");
      return;
    }
    usernameAbortRef.current?.abort();
    const controller = new AbortController();
    usernameAbortRef.current = controller;
    setUsernameState("checking");
    try {
      const res = await api.checkAvailable({ username });
      if (!controller.signal.aborted) {
        setUsernameState(res.username && !res.username.available ? "taken" : "available");
      }
    } catch {
      if (!controller.signal.aborted) setUsernameState("idle");
    }
  };

  /* ── Step 1: send OTP ── */
  const sendPhoneOtp = async () => {
    const phone = (draft.phone ?? "").replace(/[^0-9]/g, "");
    if (!draft.name?.trim()) return setError("Full name is required");
    if (!isValidPhone(phone)) return setError("Enter a valid Pakistani mobile number");
    setOtpSending(true);
    const res = await sendOtp(phone);
    setOtpSending(false);
    if (!res.success) return setError(res.error ?? "Failed to send OTP");
    update("phone", phone);
    setPhoneOtpSent(true);
    setOtpCooldown(60);
    setError(null);
  };

  /* ── Step 1: verify OTP → advance to step 2 ── */
  const verifyPhoneOtp = async () => {
    const otp = draft.otp ?? "";
    if (otp.length !== 6) {
      setError("Enter the complete 6-digit OTP");
      return;
    }
    setOtpVerifying(true);
    setError(null);
    try {
      const res = (await api.verifyOtp(draft.phone ?? "", otp)) as Record<string, unknown>;
      const token = (res.accessToken ?? res.token) as string | undefined;
      const refreshToken = res.refreshToken as string | undefined;
      if (token) api.storeTokens(token, refreshToken);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid OTP. Please try again.");
    } finally {
      setOtpVerifying(false);
    }
  };

  /* ── Step 4: upload a document ── */
  const uploadFile = async (field: keyof Draft, file?: File) => {
    if (!file) return;
    const fieldKey = String(field);
    setUploading(fieldKey);
    setUploadPct((prev) => ({ ...prev, [fieldKey]: 0 }));
    setUploadError((prev) => ({ ...prev, [fieldKey]: "" }));
    try {
      const uploadToken = await api.getRegistrationUploadToken();
      const result = await api.uploadRegistrationDocWithProgress(file, uploadToken, (pct) =>
        setUploadPct((prev) => ({ ...prev, [fieldKey]: pct }))
      );
      const stored = result.url ?? "";
      if (!stored) throw new Error("Server returned no URL for uploaded file");
      update(field, stored);
      setUploadError((prev) => ({ ...prev, [fieldKey]: "" }));
      setUploadPct((prev) => ({ ...prev, [fieldKey]: 100 }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError((prev) => ({ ...prev, [fieldKey]: msg }));
      setUploadPct((prev) => ({ ...prev, [fieldKey]: 0 }));
    } finally {
      setUploading(null);
    }
  };

  /* ── Step 4: submit application → advance to step 5 ── */
  const CNIC_REGEX = /^\d{5}-\d{7}-\d{1}$/;
  const submit = async () => {
    if (!draft.vehiclePhoto || !draft.licensePhoto || !draft.cnicFrontPhoto || !draft.cnicBackPhoto)
      return setError("Please upload all required documents");

    const cnicValue = draft.cnic?.trim() ?? "";
    if (cnicValue && !CNIC_REGEX.test(cnicValue))
      return setError("CNIC must be in format XXXXX-XXXXXXX-X (e.g. 12345-1234567-1)");

    const usernameValue = draft.username?.trim() || undefined;
    if (usernameValue && usernameValue.length < 3)
      return setError("Username must be at least 3 characters");

    setError(null);
    setSubmitting(true);
    try {
      const documents = JSON.stringify({
        licensePhoto: draft.licensePhoto,
        cnicFrontPhoto: draft.cnicFrontPhoto,
        cnicBackPhoto: draft.cnicBackPhoto,
      });
      await api.registerRider({
        name: draft.name?.trim() ?? "",
        phone: draft.phone?.trim() ?? "",
        username: usernameValue,
        cnic: cnicValue,
        vehicleType: draft.vehicleType?.trim() ?? "",
        vehiclePlate: draft.vehiclePlate?.trim() ?? "",
        drivingLicense: draft.drivingLicense?.trim() ?? "",
        vehicleRegistration: draft.vehicleRegistration?.trim() ?? "",
        vehiclePhoto: draft.vehiclePhoto,
        documents,
        password: draft.password,
      });
      localStorage.removeItem(DRAFT_KEY);
      onDone?.();
      setStep(5);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const pwStrength = draft.password ? strength(draft.password) : null;

  const card = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 20,
    padding: "24px 22px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
  };

  const inputStyle: React.CSSProperties = {
    height: 48,
    padding: "0 16px",
    borderRadius: 12,
    background: theme.background,
    border: `1.5px solid ${theme.border}`,
    color: theme.text,
    width: "100%",
    outline: "none",
    fontSize: 14,
  };

  const backBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: theme.textMuted,
    cursor: "pointer",
    fontSize: 13,
  };

  const nextBtnStyle = (enabled = true): React.CSSProperties => ({
    height: 44,
    borderRadius: 12,
    border: "none",
    background: enabled
      ? `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`
      : `${theme.primary}60`,
    color: "#fff",
    fontWeight: 800,
    cursor: enabled ? "pointer" : "not-allowed",
    padding: "0 20px",
  });

  return (
    <div style={{ minHeight: "100vh", background: theme.background, padding: 16 }}>
      <div style={{ maxWidth: 430, margin: "0 auto" }}>
        <button
          onClick={() => navigate("/login")}
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
            marginBottom: 14,
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        {/* Progress bar — always visible including step 5 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span
              style={{
                color: theme.primary,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {step === 5
                ? "Complete"
                : `Step ${step} of ${total - 1} — ${["Phone OTP", "Personal Details", "Vehicle Info", "Documents"][step - 1]}`}
            </span>
            <span style={{ color: theme.textMuted, fontSize: 11 }}>{progress}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: theme.border }}>
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryDark})`,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        <div style={card}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                background:
                  step === 5
                    ? `${theme.primary}18`
                    : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                border: step === 5 ? `1px solid ${theme.primary}40` : undefined,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              {step === 5 ? (
                <Shield size={30} color={theme.primary} />
              ) : (
                <Smartphone size={30} color="#fff" />
              )}
            </div>
            <h1 style={{ color: theme.text, fontSize: 22, fontWeight: 800, margin: 0 }}>
              {step === 5 ? "Application Submitted" : T("riderRegistration")}
            </h1>
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

          {/* ── Step 1: Phone OTP ── */}
          {step === 1 && !phoneOtpSent && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                value={draft.name ?? ""}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Full name *"
                style={inputStyle}
              />
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
                    flexShrink: 0,
                  }}
                >
                  +92
                </div>
                <input
                  value={draft.phone ?? ""}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, "");
                    if (v.startsWith("92")) v = v.slice(2);
                    update("phone", v.slice(0, 11));
                  }}
                  placeholder="03XXXXXXXXX *"
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                Format: 03XX-XXXXXXX or +923XX-XXXXXXX
              </div>
              <input
                value={draft.username ?? ""}
                onChange={(e) => {
                  update("username", e.target.value);
                  if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
                  usernameDebounceRef.current = setTimeout(() => void checkUsername(), 500);
                }}
                onBlur={() => void checkUsername()}
                placeholder="Username (optional)"
                style={inputStyle}
              />
              {usernameState === "checking" && (
                <div style={{ color: theme.textMuted, fontSize: 12 }}>Checking availability…</div>
              )}
              {usernameState === "available" && (
                <div style={{ color: "#10b981", fontSize: 12 }}>✓ Username available</div>
              )}
              {usernameState === "taken" && (
                <div style={{ color: "#f87171", fontSize: 12 }}>Username already taken</div>
              )}
              <button
                onClick={() => void sendPhoneOtp()}
                disabled={otpSending}
                style={{
                  ...nextBtnStyle(!otpSending),
                  width: "100%",
                  height: 48,
                  fontSize: 15,
                }}
              >
                {otpSending ? "Sending OTP…" : "Send OTP"}
              </button>
            </div>
          )}

          {step === 1 && phoneOtpSent && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
                  Enter the 6-digit OTP sent to
                </p>
                <p style={{ color: theme.text, fontSize: 15, fontWeight: 700, margin: "4px 0 0" }}>
                  {draft.phone}
                </p>
              </div>
              <OtpInput
                onComplete={(v) => {
                  update("otp", v);
                  setError(null);
                }}
                length={6}
                label="OTP"
                disabled={otpVerifying}
              />
              <button
                onClick={() => void verifyPhoneOtp()}
                disabled={otpVerifying || (draft.otp ?? "").length !== 6}
                style={{
                  ...nextBtnStyle((draft.otp ?? "").length === 6 && !otpVerifying),
                  width: "100%",
                  height: 48,
                  fontSize: 15,
                }}
              >
                Verify & Continue
              </button>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => setPhoneOtpSent(false)} style={backBtnStyle}>
                  Change Number
                </button>
                {otpCooldown > 0 ? (
                  <span style={{ color: theme.textMuted, fontSize: 12 }}>
                    Resend in {otpCooldown}s
                  </span>
                ) : (
                  <button
                    onClick={() => void sendPhoneOtp()}
                    style={{
                      background: "none",
                      border: "none",
                      color: theme.primary,
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Personal Details ── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <input
                  value={draft.cnic ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d-]/g, "");
                    const digits = raw.replace(/-/g, "");
                    let formatted = digits;
                    if (digits.length > 5 && digits.length <= 12) {
                      formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
                    } else if (digits.length > 12) {
                      formatted = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
                    }
                    update("cnic", formatted);
                  }}
                  onBlur={() => {
                    const v = (draft.cnic ?? "").trim();
                    if (v && !/^\d{5}-\d{7}-\d{1}$/.test(v)) {
                      setError("CNIC must be in format XXXXX-XXXXXXX-X (e.g. 12345-1234567-1)");
                    }
                  }}
                  placeholder="CNIC XXXXX-XXXXXXX-X *"
                  style={inputStyle}
                  maxLength={15}
                  inputMode="numeric"
                />
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                  Format: 12345-1234567-1 (auto-formatted)
                </div>
                {(draft.cnic ?? "").length === 15 && !/^\d{5}-\d{7}-\d{1}$/.test(draft.cnic ?? "") && (
                  <div style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>✗ Invalid CNIC format</div>
                )}
                {(draft.cnic ?? "").length === 15 && /^\d{5}-\d{7}-\d{1}$/.test(draft.cnic ?? "") && (
                  <div style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}>✓ Valid CNIC</div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={draft.password ?? ""}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Password *"
                  style={{ ...inputStyle, paddingRight: 44 }}
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
              {pwStrength && (
                <div>
                  <div style={{ height: 4, borderRadius: 999, background: theme.border }}>
                    <div
                      style={{
                        width: `${pwStrength.pct}%`,
                        height: "100%",
                        background: pwStrength.color,
                        borderRadius: 999,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: pwStrength.color, display: "block", marginTop: 4 }}>
                    {pwStrength.label}
                  </span>
                </div>
              )}
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirm ? "text" : "password"}
                  value={draft.confirmPassword ?? ""}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Confirm password *"
                  style={{
                    ...inputStyle,
                    paddingRight: 44,
                    borderColor:
                      draft.confirmPassword && draft.password
                        ? draft.password === draft.confirmPassword
                          ? "#10b981"
                          : "#ef4444"
                        : undefined,
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
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {draft.confirmPassword && draft.password && draft.password !== draft.confirmPassword && (
                <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>✗ Passwords do not match</div>
              )}
              {draft.confirmPassword && draft.password && draft.password === draft.confirmPassword && (
                <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>✓ Passwords match</div>
              )}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: theme.textMuted,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!draft.terms}
                  onChange={(e) => update("terms", e.target.checked)}
                />
                I agree to the terms &amp; conditions
              </label>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => setStep(1)} style={backBtnStyle}>
                  Back
                </button>
                <button
                  onClick={() => {
                    if (!draft.cnic?.trim()) return setError("CNIC is required");
                    if (!draft.password || draft.password.length < 8)
                      return setError("Password must be at least 8 characters");
                    if (draft.password !== draft.confirmPassword)
                      return setError("Passwords do not match");
                    if (!draft.terms) return setError("You must accept the terms");
                    setError(null);
                    setStep(3);
                  }}
                  style={nextBtnStyle()}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Vehicle Info ── */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <select
                value={draft.vehicleType ?? ""}
                onChange={(e) => update("vehicleType", e.target.value)}
                style={{ ...inputStyle, appearance: "none" }}
              >
                <option value="">Vehicle type *</option>
                {VEHICLES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                value={draft.vehiclePlate ?? ""}
                onChange={(e) => update("vehiclePlate", e.target.value)}
                placeholder="Vehicle plate number *"
                style={inputStyle}
              />
              <input
                value={draft.drivingLicense ?? ""}
                onChange={(e) => update("drivingLicense", e.target.value)}
                placeholder="Driving license number *"
                style={inputStyle}
              />
              <input
                value={draft.vehicleRegistration ?? ""}
                onChange={(e) => update("vehicleRegistration", e.target.value)}
                placeholder="Vehicle registration number"
                style={inputStyle}
              />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => setStep(2)} style={backBtnStyle}>
                  Back
                </button>
                <button
                  onClick={() => {
                    if (!draft.vehicleType) return setError("Vehicle type is required");
                    if (!draft.vehiclePlate?.trim()) return setError("Vehicle plate is required");
                    if (!draft.drivingLicense?.trim())
                      return setError("Driving license number is required");
                    setError(null);
                    setStep(4);
                  }}
                  style={nextBtnStyle()}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Document Upload ── */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ color: theme.textMuted, fontSize: 13, margin: "0 0 4px" }}>
                Upload clear photos of each document. All 4 are required.
              </p>
              {(["vehiclePhoto", "licensePhoto", "cnicFrontPhoto", "cnicBackPhoto"] as const).map(
                (field) => {
                  const isUploading = uploading === field;
                  const pct = uploadPct[field] ?? 0;
                  const hasFile = !!(draft[field] as string);
                  const errMsg = uploadError[field];
                  const labels: Record<string, string> = {
                    vehiclePhoto: "Vehicle Photo",
                    licensePhoto: "Driving License Photo",
                    cnicFrontPhoto: "CNIC Front",
                    cnicBackPhoto: "CNIC Back",
                  };
                  return (
                    <label
                      key={field}
                      style={{
                        border: `1px solid ${errMsg ? "#f87171" : hasFile ? "#10b981" : theme.border}`,
                        borderRadius: 14,
                        padding: 14,
                        background: theme.background,
                        color: theme.text,
                        cursor: isUploading ? "not-allowed" : "pointer",
                        opacity: isUploading ? 0.8 : 1,
                        display: "block",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{labels[field]}</div>
                          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                            {isUploading
                              ? `Uploading… ${pct}%`
                              : hasFile
                                ? "✓ Uploaded"
                                : "Tap to upload image"}
                          </div>
                        </div>
                        {hasFile ? (
                          <CheckCircle size={18} color="#10b981" />
                        ) : (
                          <Upload size={18} color={theme.primary} />
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploading}
                        onChange={(e) => void uploadFile(field, e.target.files?.[0])}
                        style={{ display: "none" }}
                      />
                      {isUploading && (
                        <div
                          style={{
                            marginTop: 10,
                            height: 4,
                            borderRadius: 999,
                            background: theme.border,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryDark})`,
                              borderRadius: 999,
                              transition: "width 0.15s ease",
                            }}
                          />
                        </div>
                      )}
                      {errMsg && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "#f87171" }}>{errMsg}</div>
                      )}
                    </label>
                  );
                }
              )}
              <button
                onClick={() => void submit()}
                disabled={submitting || !!uploading}
                style={{
                  ...nextBtnStyle(!submitting && !uploading),
                  width: "100%",
                  height: 48,
                  fontSize: 15,
                  marginTop: 4,
                }}
              >
                {submitting ? "Submitting…" : "Submit Application"}
              </button>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => setStep(3)} style={backBtnStyle}>
                  Back
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem(DRAFT_KEY);
                    setDraft({});
                    setPhoneOtpSent(false);
                    setStep(1);
                  }}
                  style={backBtnStyle}
                >
                  Clear draft
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Success / Pending KYC ── */}
          {step === 5 && (
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
            >
              <p
                style={{
                  color: theme.textMuted,
                  fontSize: 14,
                  lineHeight: 1.6,
                  textAlign: "center",
                  margin: 0,
                }}
              >
                Your rider account is pending KYC review. You&apos;ll be notified once an admin
                approves your application.
              </p>
              <button
                onClick={() => navigate("/login")}
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
                Back to Login
              </button>
            </div>
          )}
        </div>

        {step !== 5 && (
          <p
            style={{
              textAlign: "center",
              marginTop: 18,
              marginBottom: 0,
              fontSize: 13,
              color: theme.textMuted,
            }}
          >
            Already have an account?{" "}
            <Link
              href="/login"
              style={{ color: theme.primary, fontWeight: 700, textDecoration: "none" }}
            >
              Sign in
            </Link>
            {" · "}
            <Link
              href="/forgot-password"
              style={{ color: theme.primary, fontWeight: 600, textDecoration: "none" }}
            >
              Forgot Password?
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
