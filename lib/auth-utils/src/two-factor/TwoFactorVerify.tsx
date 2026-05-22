import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TwoFactorVerifyProps } from "./types";

export function TwoFactorVerify({
  onVerify,
  onBackupCode,
  verifyLoading = false,
  verifyError,
  showTrustDevice = true,
  onTrustDeviceChange,
  trustDevice = false,
}: TwoFactorVerifyProps) {
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
      const newDigits = ["", "", "", "", "", ""];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i]!;
      }
      setDigits(newDigits);
      if (pasted.length === 6) {
        void onVerify(pasted);
      }
    },
    [onVerify]
  );

  const handleBackupSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (backupCode.trim() && onBackupCode) {
        void onBackupCode(backupCode.trim());
      }
    },
    [backupCode, onBackupCode]
  );

  useEffect(() => {
    if (!useBackup) {
      inputRefs.current[0]?.focus();
    }
  }, [useBackup]);

  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            backgroundColor: "#EBF5FF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
            fontSize: 28,
          }}
        >
          🔐
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
          Two-Factor Verification
        </h3>
        <p style={{ fontSize: 14, color: "#6B7280" }}>
          {useBackup
            ? "Enter one of your backup codes"
            : "Enter the code from your authenticator app"}
        </p>
      </div>

      {!useBackup ? (
        <>
          <div
            style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}
            onPaste={handlePaste}
          >
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
                disabled={verifyLoading}
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
                  opacity: verifyLoading ? 0.6 : 1,
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <form onSubmit={handleBackupSubmit} style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value)}
            placeholder="Enter backup code"
            disabled={verifyLoading}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 15,
              fontFamily: "monospace",
              letterSpacing: 2,
              borderRadius: 10,
              border: verifyError ? "2px solid #EF4444" : "2px solid #D1D5DB",
              outline: "none",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={verifyLoading || !backupCode.trim()}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              border: "none",
              backgroundColor: "#1A56DB",
              color: "#fff",
              cursor: verifyLoading ? "wait" : "pointer",
              opacity: verifyLoading || !backupCode.trim() ? 0.6 : 1,
            }}
          >
            {verifyLoading ? "Verifying..." : "Verify Backup Code"}
          </button>
        </form>
      )}

      {verifyError && (
        <p style={{ fontSize: 13, color: "#EF4444", textAlign: "center", marginBottom: 12 }}>
          {verifyError}
        </p>
      )}

      {verifyLoading && !useBackup && (
        <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 12 }}>
          Verifying...
        </p>
      )}

      {showTrustDevice && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            backgroundColor: "#F9FAFB",
            borderRadius: 8,
            marginBottom: 16,
            cursor: "pointer",
            fontSize: 13,
            color: "#374151",
          }}
        >
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => onTrustDeviceChange?.(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "#1A56DB" }}
          />
          Trust this device for 30 days
        </label>
      )}

      {onBackupCode && (
        <button
          onClick={() => {
            setUseBackup(!useBackup);
            setBackupCode("");
            setDigits(["", "", "", "", "", ""]);
          }}
          style={{
            width: "100%",
            padding: "10px 14px",
            fontSize: 13,
            borderRadius: 8,
            border: "none",
            backgroundColor: "transparent",
            color: "#1A56DB",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          {useBackup ? "Use authenticator app instead" : "Use a backup code"}
        </button>
      )}
    </div>
  );
}
