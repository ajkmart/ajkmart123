import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/vendor-auth";

const CITIES = [
  "Muzaffarabad",
  "Mirpur",
  "Rawalakot",
  "Bagh",
  "Kotli",
  "Bhimber",
  "Jhelum",
  "Rawalpindi",
  "Islamabad",
  "Lahore",
  "Karachi",
  "Other",
];

type PhotoKey = "frontId" | "backId" | "selfie";

interface Props {
  onClose: () => void;
  rejectionReason?: string | null;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PhotoBox({
  label,
  icon,
  dataUrl,
  photoKey,
  onFile,
  loading,
}: {
  label: string;
  icon: string;
  dataUrl: string | null;
  photoKey: PhotoKey;
  onFile: (key: PhotoKey, file: File | null) => void;
  loading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
        {icon} {label} <span style={{ color: "#ef4444" }}>*</span>
      </p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={loading}
        style={{
          width: "100%",
          minHeight: 90,
          border: `2px dashed ${dataUrl ? "#10b981" : "#d1d5db"}`,
          borderRadius: 14,
          background: dataUrl ? "#f0fdf4" : "#f9fafb",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          cursor: loading ? "not-allowed" : "pointer",
          overflow: "hidden",
          padding: 8,
        }}
      >
        {loading ? (
          <span style={{ fontSize: 12, color: "#6b7280" }}>Processing…</span>
        ) : dataUrl ? (
          <img
            src={dataUrl}
            alt={label}
            style={{ maxHeight: 76, maxWidth: "100%", objectFit: "contain", borderRadius: 8 }}
          />
        ) : (
          <>
            <span style={{ fontSize: 28 }}>📷</span>
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>
              Tap to upload or capture
            </span>
          </>
        )}
      </button>
      {dataUrl && !loading && (
        <button
          type="button"
          onClick={() => onFile(photoKey, null)}
          style={{
            marginTop: 4,
            fontSize: 11,
            color: "#ef4444",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ✕ Remove
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(photoKey, f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const IS: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 12,
  border: "1.5px solid #e5e7eb",
  background: "#f9fafb",
  fontSize: 14,
  color: "#1f2937",
  boxSizing: "border-box",
  outline: "none",
};

export function VendorKycModal({ onClose, rejectionReason }: Props) {
  const { refreshUser, user } = useAuth();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState(user?.name || "");
  const [cnic, setCnic] = useState(user?.cnic || "");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState(user?.city || "");
  const [photos, setPhotos] = useState<Record<PhotoKey, string | null>>({
    frontId: null,
    backId: null,
    selfie: null,
  });
  const [photoLoading, setPhotoLoading] = useState<PhotoKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const formatCnic = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 13);
    if (d.length <= 5) return d;
    if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
  };

  const handlePhoto = useCallback(async (key: PhotoKey, file: File | null) => {
    if (!file) {
      setPhotos((p) => ({ ...p, [key]: null }));
      return;
    }
    setPhotoLoading(key);
    try {
      const url = await fileToDataUrl(file);
      setPhotos((p) => ({ ...p, [key]: url }));
    } catch {
      setError("Failed to read image. Please try again.");
    } finally {
      setPhotoLoading(null);
    }
  }, []);

  const validate1 = () => {
    if (!fullName.trim()) return "Full name is required";
    if (!cnic.trim() || !/^\d{5}-\d{7}-\d$/.test(cnic.trim()))
      return "Valid CNIC is required (format: XXXXX-XXXXXXX-X)";
    return null;
  };

  const validate2 = () => {
    if (!photos.frontId) return "Front side of CNIC is required";
    if (!photos.backId) return "Back side of CNIC is required";
    if (!photos.selfie) return "Selfie holding your CNIC is required";
    return null;
  };

  const handleSubmit = async () => {
    setError("");
    const v = validate2();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      await api.submitKycBase64({
        fullName: fullName.trim(),
        cnic: cnic.trim(),
        dateOfBirth: dob || undefined,
        gender: gender || undefined,
        city: city || undefined,
        frontIdPhoto: photos.frontId!,
        backIdPhoto: photos.backId!,
        selfiePhoto: photos.selfie!,
      });
      await refreshUser();
      setDone(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Submission failed. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,0.65)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            maxWidth: 420,
            width: "100%",
            padding: "40px 32px",
            textAlign: "center",
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              background: "#f0fdf4",
              border: "2px solid #86efac",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: 40,
            }}
          >
            ✅
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1f2937", margin: "0 0 10px" }}>
            Submitted for Review!
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
            Your KYC documents have been submitted. Our team will review them within 24 hours and
            notify you of the result.
          </p>
          <button
            onClick={onClose}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #f97316, #ea580c)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          maxWidth: 460,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid #f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 1,
            borderRadius: "24px 24px 0 0",
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1f2937", margin: "0 0 2px" }}>
              Identity Verification (KYC)
            </h2>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Step {step} of 2 — {step === 1 ? "Personal Details" : "Photo Documents"}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "none",
              background: "#f3f4f6",
              cursor: "pointer",
              fontSize: 20,
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", padding: "10px 24px 0", gap: 8 }}>
          {[1, 2].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 4,
                background: n <= step ? "#f97316" : "#e5e7eb",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {/* Rejection reason */}
          {rejectionReason && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 12,
                padding: "10px 14px",
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, margin: "0 0 2px" }}>
                Previous submission was rejected
              </p>
              <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>Reason: {rejectionReason}</p>
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  Full Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Exactly as on your CNIC"
                  style={IS}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  CNIC Number <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  value={cnic}
                  onChange={(e) => setCnic(formatCnic(e.target.value))}
                  placeholder="XXXXX-XXXXXXX-X"
                  inputMode="numeric"
                  maxLength={15}
                  style={IS}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  style={IS}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  Gender
                </label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} style={IS}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other / Prefer not to say</option>
                </select>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  City
                </label>
                <select value={city} onChange={(e) => setCity(e.target.value)} style={IS}>
                  <option value="">Select city</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 12,
                  padding: "10px 14px",
                }}
              >
                <p style={{ fontSize: 12, color: "#9a3412", fontWeight: 600, margin: "0 0 2px" }}>
                  🔒 Why we need this
                </p>
                <p style={{ fontSize: 12, color: "#c2410c", margin: 0, lineHeight: 1.5 }}>
                  KYC verification is required by Pakistani regulations for processing payments and
                  wallet withdrawals.
                </p>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px", lineHeight: 1.6 }}>
                Upload clear, well-lit photos. Make sure all text is readable and the full card is
                visible.
              </p>
              <PhotoBox
                label="CNIC — Front Side"
                icon="🪪"
                dataUrl={photos.frontId}
                photoKey="frontId"
                onFile={handlePhoto}
                loading={photoLoading === "frontId"}
              />
              <PhotoBox
                label="CNIC — Back Side"
                icon="🪪"
                dataUrl={photos.backId}
                photoKey="backId"
                onFile={handlePhoto}
                loading={photoLoading === "backId"}
              />
              <PhotoBox
                label="Selfie Holding Your CNIC"
                icon="🤳"
                dataUrl={photos.selfie}
                photoKey="selfie"
                onFile={handlePhoto}
                loading={photoLoading === "selfie"}
              />
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 12,
                  padding: "10px 14px",
                }}
              >
                <p style={{ fontSize: 12, color: "#1e40af", margin: 0, lineHeight: 1.5 }}>
                  💡 For the selfie, hold your CNIC card next to your face. Both your face and the
                  card must be clearly visible.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: "#fef2f2",
                borderRadius: 10,
                fontSize: 13,
                color: "#dc2626",
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {/* Navigation buttons */}
          <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
            {step > 1 && (
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError("");
                }}
                style={{
                  flex: "0 0 auto",
                  height: 48,
                  padding: "0 20px",
                  borderRadius: 14,
                  border: "1.5px solid #e5e7eb",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              disabled={submitting || photoLoading != null}
              onClick={() => {
                setError("");
                if (step === 1) {
                  const v = validate1();
                  if (v) {
                    setError(v);
                    return;
                  }
                  setStep(2);
                } else {
                  void handleSubmit();
                }
              }}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 14,
                border: "none",
                background:
                  submitting || photoLoading != null
                    ? "#fdba74"
                    : "linear-gradient(135deg, #f97316, #ea580c)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: submitting || photoLoading != null ? "not-allowed" : "pointer",
              }}
            >
              {step === 1
                ? "Next: Upload Photos →"
                : submitting
                  ? "Submitting…"
                  : "Submit for Review ✓"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
