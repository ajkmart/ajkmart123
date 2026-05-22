import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TwoFactorSetupProps } from "./types";

export function TwoFactorSetup({
  qrCodeDataUrl,
  secret,
  backupCodes,
  onVerify,
  verifyLoading = false,
  verifyError,
  appName = "App",
}: TwoFactorSetupProps) {
  const [copied, setCopied] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupsCopied, setBackupsCopied] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;
      const newDigits = [...digits];
      newDigits[index] = value.slice(-1);
      setDigits(newDigits);

      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      const fullCode = newDigits.join("");
      if (fullCode.length === 6) {
        void onVerify(fullCode);
      }
    },
    [digits, onVerify]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (!pasted) return;
      const newDigits = [...digits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || "";
      }
      setDigits(newDigits);
      const fullCode = newDigits.join("");
      if (fullCode.length === 6) {
        void onVerify(fullCode);
      }
    },
    [digits, onVerify]
  );

  const copySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_e) {
      /* fallback: already visible */
    }
  }, [secret]);

  const copyBackupCodes = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setBackupsCopied(true);
      setTimeout(() => setBackupsCopied(false), 2000);
    } catch (_e) {
      /* noop */
    }
  }, [backupCodes]);

  const downloadBackupCodes = useCallback(() => {
    const content = `${appName} Backup Codes\n${"=".repeat(30)}\n\n${backupCodes.join("\n")}\n\nKeep these codes safe. Each code can only be used once.`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${appName.toLowerCase().replace(/\s+/g, "-")}-backup-codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [backupCodes, appName]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  return (
    <div style={{ maxWidth: 400, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#111827" }}>
          Set Up Two-Factor Authentication
        </h3>
        <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.5 }}>
          Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </p>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 20,
          padding: 16,
          backgroundColor: "#fff",
          borderRadius: 12,
          border: "1px solid #E5E7EB",
        }}
      >
        <img
          src={qrCodeDataUrl}
          alt="Scan this QR code with your authenticator app"
          width={200}
          height={200}
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
          Or enter this key manually:
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            backgroundColor: "#F3F4F6",
            padding: "10px 14px",
            borderRadius: 8,
            fontFamily: "monospace",
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: 13,
              wordBreak: "break-all",
              color: "#374151",
              letterSpacing: 1,
            }}
          >
            {secret}
          </span>
          <button
            onClick={copySecret}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #D1D5DB",
              backgroundColor: copied ? "#DEF7EC" : "#fff",
              color: copied ? "#03543F" : "#374151",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 10 }}>
          Enter the 6-digit code from your app:
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }} onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={{
                width: 44,
                height: 52,
                textAlign: "center",
                fontSize: 22,
                fontWeight: 700,
                borderRadius: 10,
                border: verifyError ? "2px solid #EF4444" : "2px solid #D1D5DB",
                outline: "none",
                color: "#111827",
              }}
            />
          ))}
        </div>
        {verifyError && (
          <p style={{ fontSize: 13, color: "#EF4444", textAlign: "center", marginTop: 8 }}>
            {verifyError}
          </p>
        )}
        {verifyLoading && (
          <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: 8 }}>
            Verifying...
          </p>
        )}
      </div>

      {backupCodes.length > 0 && (
        <div style={{ marginTop: 24, borderTop: "1px solid #E5E7EB", paddingTop: 20 }}>
          <button
            onClick={() => setShowBackupCodes(!showBackupCodes)}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #D1D5DB",
              backgroundColor: "#fff",
              color: "#374151",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Backup Codes</span>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>
              {showBackupCodes ? "Hide" : "Show"}
            </span>
          </button>

          {showBackupCodes && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, color: "#EF4444", marginBottom: 10, fontWeight: 500 }}>
                Save these codes. Each can only be used once.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  backgroundColor: "#F9FAFB",
                  padding: 14,
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                }}
              >
                {backupCodes.map((bc, i) => (
                  <span
                    key={i}
                    style={{
                      fontFamily: "monospace",
                      fontSize: 13,
                      color: "#374151",
                      padding: "4px 8px",
                      backgroundColor: "#fff",
                      borderRadius: 4,
                      textAlign: "center",
                    }}
                  >
                    {bc}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={copyBackupCodes}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 13,
                    borderRadius: 6,
                    border: "1px solid #D1D5DB",
                    backgroundColor: backupsCopied ? "#DEF7EC" : "#fff",
                    color: backupsCopied ? "#03543F" : "#374151",
                    cursor: "pointer",
                  }}
                >
                  {backupsCopied ? "Copied!" : "Copy All"}
                </button>
                <button
                  onClick={downloadBackupCodes}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 13,
                    borderRadius: 6,
                    border: "1px solid #D1D5DB",
                    backgroundColor: "#fff",
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  Download
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
