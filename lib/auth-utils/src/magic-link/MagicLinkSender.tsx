import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MagicLinkSenderProps } from "./types";

type Status = "idle" | "sending" | "sent" | "error";

export function MagicLinkSender({
  onSend,
  cooldownSeconds = 60,
  title = "Sign in with Magic Link",
  subtitle = "We'll send a sign-in link to your email address",
}: MagicLinkSenderProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback(() => {
    setCountdown(cooldownSeconds);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [cooldownSeconds]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trimmed = email.trim();
      if (!trimmed) return;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        setStatus("error");
        setErrorMsg("Please enter a valid email address");
        return;
      }

      setStatus("sending");
      setErrorMsg("");

      try {
        await onSend(trimmed);
        setStatus("sent");
        startCountdown();
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Failed to send magic link");
      }
    },
    [email, onSend, startCountdown]
  );

  const handleResend = useCallback(async () => {
    if (countdown > 0) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      await onSend(email.trim());
      setStatus("sent");
      startCountdown();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to send magic link");
    }
  }, [countdown, email, onSend, startCountdown]);

  if (status === "sent") {
    return (
      <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            backgroundColor: "#DEF7EC",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: 32,
          }}
        >
          ✉️
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
          Check your email
        </h3>
        <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>
          We sent a sign-in link to
        </p>
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#111827",
            marginBottom: 20,
          }}
        >
          {email}
        </p>
        <button
          onClick={handleResend}
          disabled={countdown > 0}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 8,
            border: "1px solid #D1D5DB",
            backgroundColor: countdown > 0 ? "#F3F4F6" : "#fff",
            color: countdown > 0 ? "#9CA3AF" : "#374151",
            cursor: countdown > 0 ? "not-allowed" : "pointer",
          }}
        >
          {countdown > 0 ? `Resend in ${countdown}s` : "Resend link"}
        </button>
        {errorMsg && <p style={{ fontSize: 13, color: "#EF4444", marginTop: 12 }}>{errorMsg}</p>}
      </div>
    );
  }

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
          🔗
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
          {title}
        </h3>
        <p style={{ fontSize: 14, color: "#6B7280" }}>{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder="your@email.com"
            disabled={status === "sending"}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 15,
              borderRadius: 10,
              border: status === "error" ? "2px solid #EF4444" : "2px solid #D1D5DB",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {status === "error" && errorMsg && (
            <p style={{ fontSize: 13, color: "#EF4444", marginTop: 6 }}>{errorMsg}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={status === "sending" || !email.trim()}
          style={{
            width: "100%",
            padding: "12px 16px",
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 10,
            border: "none",
            backgroundColor: "#1A56DB",
            color: "#fff",
            cursor: status === "sending" ? "wait" : "pointer",
            opacity: status === "sending" || !email.trim() ? 0.6 : 1,
          }}
        >
          {status === "sending" ? "Sending..." : "Send Magic Link"}
        </button>
      </form>
    </div>
  );
}
