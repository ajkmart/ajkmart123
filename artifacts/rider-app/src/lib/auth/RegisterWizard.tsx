import { OtpInput } from "@workspace/auth-react";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { isValidPhone } from "@workspace/phone-utils";
import { ArrowLeft, Eye, EyeOff, Shield, Smartphone, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
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

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export interface RegisterWizardProps {
  onDone?: () => void;
}

export function RegisterWizard({ onDone }: RegisterWizardProps) {
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
  const [otpSending, setOtpSending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "available" | "taken">(
    "idle"
  );
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
    if (!username) return;
    setUsernameState("checking");
    try {
      const res = await api.checkAvailable({ username });
      setUsernameState(res.username && !res.username.available ? "taken" : "available");
    } catch {
      setUsernameState("idle");
    }
  };

  const sendPhoneOtp = async () => {
    const phone = (draft.phone ?? "").replace(/[^0-9]/g, "");
    if (!draft.name?.trim()) return setError("Full name is required");
    if (!isValidPhone(phone)) return setError("Enter a valid Pakistani mobile number");
    setOtpSending(true);
    const res = await sendOtp(phone);
    setOtpSending(false);
    if (!res.success) return setError(res.error ?? "Failed to send OTP");
    update("phone", phone);
    setStep(2);
    setOtpCooldown(60);
  };

  const uploadFile = async (field: keyof Draft, file?: File) => {
    if (!file) return;
    setUploading(String(field));
    setUploadPct((prev) => ({ ...prev, [String(field)]: 0 }));
    const dataUrl = await fileToDataUrl(file);
    update(field, dataUrl);
    setUploadPct((prev) => ({ ...prev, [String(field)]: 100 }));
    setTimeout(() => {
      setUploading(null);
      setUploadPct((prev) => ({ ...prev, [String(field)]: 0 }));
    }, 400);
  };

  const submit = async () => {
    if (!draft.password || draft.password.length < 8)
      return setError("Password must be at least 8 characters");
    if (draft.password !== draft.confirmPassword) return setError("Passwords do not match");
    if (!draft.terms) return setError("You must accept the terms");
    if (!draft.vehiclePhoto || !draft.licensePhoto || !draft.cnicFrontPhoto || !draft.cnicBackPhoto)
      return setError("Please upload all required documents");

    setError(null);
    const res = await api.registerRider({
      name: draft.name?.trim() ?? "",
      phone: draft.phone?.trim() ?? "",
      username: draft.username?.trim() || undefined,
      otp: draft.otp,
      cnic: draft.cnic?.trim() ?? "",
      vehicleType: draft.vehicleType?.trim() ?? "",
      vehiclePlate: draft.vehiclePlate?.trim() ?? "",
      drivingLicense: draft.drivingLicense?.trim() ?? "",
      vehicleRegistration: draft.vehicleRegistration?.trim() ?? "",
      vehiclePhoto: draft.vehiclePhoto,
      licensePhoto: draft.licensePhoto,
      cnicFrontPhoto: draft.cnicFrontPhoto,
      cnicBackPhoto: draft.cnicBackPhoto,
      password: draft.password,
    } as never);
    if (res?.token) {
      setSubmitted(true);
      localStorage.removeItem(DRAFT_KEY);
      onDone?.();
      navigate("/");
      return;
    }
    setError("Registration failed");
  };

  const pwStrength = draft.password ? strength(draft.password) : null;

  const card = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 20,
    padding: "24px 22px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
  };

  if (submitted) {
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
        <div style={{ ...card, width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: `${theme.primary}18`,
              border: `1px solid ${theme.primary}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Shield size={34} color={theme.primary} />
          </div>
          <h2 style={{ color: theme.text, fontSize: 22, fontWeight: 800, margin: 0 }}>
            Application submitted
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6 }}>
            Your rider application is under review. You’ll be notified after approval.
          </p>
        </div>
      </div>
    );
  }

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
              Step {step} of {total}
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
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <Smartphone size={30} color="#fff" />
            </div>
            <h1 style={{ color: theme.text, fontSize: 24, fontWeight: 800, margin: 0 }}>
              {T("riderRegistration")}
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

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                value={draft.name ?? ""}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Full name"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: theme.background,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                }}
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
                  }}
                >
                  +92
                </div>
                <input
                  value={draft.phone ?? ""}
                  onChange={(e) => update("phone", e.target.value)}
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
              <input
                value={draft.username ?? ""}
                onChange={(e) => update("username", e.target.value)}
                onBlur={() => void checkUsername()}
                placeholder="Username (optional)"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: theme.background,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              {usernameState === "checking" && (
                <div style={{ color: theme.textMuted, fontSize: 12 }}>Checking availability…</div>
              )}
              {usernameState === "available" && (
                <div style={{ color: "#10b981", fontSize: 12 }}>Username available</div>
              )}
              {usernameState === "taken" && (
                <div style={{ color: "#f87171", fontSize: 12 }}>Username already taken</div>
              )}
              <button
                onClick={() => void sendPhoneOtp()}
                disabled={otpSending}
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: "none",
                  background: otpSending
                    ? `${theme.primary}60`
                    : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                  color: "#fff",
                  fontWeight: 800,
                  cursor: otpSending ? "not-allowed" : "pointer",
                }}
              >
                {otpSending ? "Sending OTP…" : "Continue"}
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>OTP sent to</p>
                <p style={{ color: theme.text, fontSize: 15, fontWeight: 700, margin: "4px 0 0" }}>
                  {draft.phone}
                </p>
              </div>
              <OtpInput onComplete={(v) => update("otp", v)} length={6} label="OTP" />
              <button
                onClick={() => setStep(3)}
                disabled={(draft.otp ?? "").length !== 6}
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: "none",
                  background:
                    (draft.otp ?? "").length === 6
                      ? `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`
                      : `${theme.primary}60`,
                  color: "#fff",
                  fontWeight: 800,
                  cursor: (draft.otp ?? "").length === 6 ? "pointer" : "not-allowed",
                }}
              >
                Verify OTP
              </button>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.textMuted,
                    cursor: "pointer",
                  }}
                >
                  Back
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
                    }}
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                value={draft.cnic ?? ""}
                onChange={(e) => update("cnic", e.target.value)}
                placeholder="CNIC XXXXX-XXXXXXX-X"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: theme.background,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              <select
                value={draft.vehicleType ?? ""}
                onChange={(e) => update("vehicleType", e.target.value)}
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: theme.background,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                }}
              >
                <option value="">Vehicle type</option>
                {VEHICLES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                value={draft.vehiclePlate ?? ""}
                onChange={(e) => update("vehiclePlate", e.target.value)}
                placeholder="Vehicle plate number"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: theme.background,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              <input
                value={draft.drivingLicense ?? ""}
                onChange={(e) => update("drivingLicense", e.target.value)}
                placeholder="Driving license number"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: theme.background,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              <input
                value={draft.vehicleRegistration ?? ""}
                onChange={(e) => update("vehicleRegistration", e.target.value)}
                placeholder="Vehicle registration number"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: theme.background,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  onClick={() => setStep(2)}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.textMuted,
                    cursor: "pointer",
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    border: "none",
                    background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(["vehiclePhoto", "licensePhoto", "cnicFrontPhoto", "cnicBackPhoto"] as const).map(
                (field) => (
                  <label
                    key={field}
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: 14,
                      padding: 14,
                      background: theme.background,
                      color: theme.text,
                      cursor: "pointer",
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
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {field.replace(/([A-Z])/g, " $1")}
                        </div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>Tap to upload</div>
                      </div>
                      <Upload size={16} color={theme.primary} />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void uploadFile(field, e.target.files?.[0])}
                      style={{ display: "none" }}
                    />
                    {uploading === field && (
                      <div
                        style={{
                          marginTop: 10,
                          height: 4,
                          borderRadius: 999,
                          background: theme.border,
                        }}
                      >
                        <div
                          style={{
                            width: `${uploadPct[field] ?? 0}%`,
                            height: "100%",
                            background: theme.primary,
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    )}
                    {(draft[field] as string) && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "#10b981" }}>Uploaded</div>
                    )}
                  </label>
                )
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  onClick={() => setStep(3)}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.textMuted,
                    cursor: "pointer",
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(5)}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    border: "none",
                    background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={draft.password ?? ""}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Password"
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
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {pwStrength && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{ flex: 1, height: 4, borderRadius: 999, background: theme.border }}
                    >
                      <div
                        style={{
                          width: `${pwStrength.pct}%`,
                          height: "100%",
                          background: pwStrength.color,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pwStrength.color }}>
                      {pwStrength.label}
                    </span>
                  </div>
                </div>
              )}
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirm ? "text" : "password"}
                  value={draft.confirmPassword ?? ""}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Confirm password"
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
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
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
                />{" "}
                I agree to the terms
              </label>
              <button
                onClick={() => void submit()}
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: "none",
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Create Rider Account
              </button>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  onClick={() => setStep(4)}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.textMuted,
                    cursor: "pointer",
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem(DRAFT_KEY);
                    setDraft({});
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.textMuted,
                    cursor: "pointer",
                  }}
                >
                  Clear draft
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
