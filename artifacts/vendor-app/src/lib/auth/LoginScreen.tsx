/**
 * LoginScreen.tsx — vendor-app
 *
 * Fully branded custom login UI for AJKMart Vendor.
 * Handles Phone OTP and Password login tabs, inline errors,
 * rate-limit countdown, and approval-status overlays.
 *
 * Business logic (handleSuccess, overlays, role guard, biometric) is
 * unchanged from the original SDK-based implementation.
 * Only the visual layer has been rewritten for brand consistency.
 */
import { createLogger } from "@/lib/logger";
import type { AuthUser as SDKAuthUser } from "@workspace/auth-react";
import { useRateLimitCountdown } from "@workspace/auth-react";
import { loadFacebookAccessToken, loadGoogleGSIToken } from "@workspace/auth-utils";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { api } from "../api";
import { captureDeviceMeta } from "../deviceMeta";
import { getVendorAuthConfig, usePlatformConfig } from "../useConfig";
import { useLanguage } from "../useLanguage";
import { useAuth as useAuthContext, type AuthUser } from "../vendor-auth";
import { useTheme } from "./ThemeContext";
import { useAppStatus } from "./useAppStatus";
import { useAuth } from "./useAuth";

const log = createLogger("[vendor-login]");

export interface LoginScreenProps {
  onSuccess?: (token: string, profile: SDKAuthUser) => void;
}

/* ── Store/shop SVG icon ── */
function StoreIcon({ size = 32, color = "#0F1117" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

/* ── Spinner ── */
function Spinner({ color = "#0F1117" }: { color?: string }) {
  return (
    <svg
      width="18"
      height="18"
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

/* ── OTP boxes component ── */
function OtpBoxes({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const theme = useTheme();

  const handleChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 1);
    const chars = value.split("");
    chars[i] = v;
    const next = chars.join("").slice(0, 6);
    onChange(next);
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
    if (next.length === 6) onComplete?.(next);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) inputRefs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) onComplete?.(pasted);
  };

  return (
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
          value={value[i] ?? ""}
          disabled={disabled}
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
            background: value[i] ? `${theme.primary}18` : theme.background,
            border: `1.5px solid ${value[i] ? theme.primary : theme.border}`,
            color: theme.text,
            transition: "all 0.15s",
            opacity: disabled ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  );
}

function normalizeRoles(u: AuthUser): string[] {
  const rawRoles = u.roles;
  return Array.isArray(rawRoles)
    ? rawRoles
    : typeof (u as unknown as { role?: string }).role === "string"
      ? [(u as unknown as { role: string }).role]
      : [];
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const { sendOtp, verifyOtp, loginWithPassword } = useAuth();
  const { maintenance, maintenanceMsg, supportPhone, supportEmail } = useAppStatus();
  const theme = useTheme();
  const { login } = useAuthContext();
  const [, navigate] = useLocation();
  const { config } = usePlatformConfig();
  const auth = getVendorAuthConfig(config);
  const { language } = useLanguage();
  const T = useCallback((k: TranslationKey) => tDual(k, language), [language]);
  const { isRateLimited, secondsLeft, triggerRateLimit } = useRateLimitCountdown();

  /* ── Overlay / approval state ── */
  const [overlay, setOverlay] = useState<"pending" | "rejected" | "biometric" | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const capturedTokenRef = useRef("");
  const capturedProfileRef = useRef<AuthUser | null>(null);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);

  /* ── UI state ── */
  const [loginMode, setLoginMode] = useState<"otp" | "password">("otp");
  const [otpStep, setOtpStep] = useState<"phone" | "otp">("phone");
  const [localPhone, setLocalPhone] = useState("");
  const [localOtp, setLocalOtp] = useState("");
  const [localIdentifier, setLocalIdentifier] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  /* ── 2FA state ── */
  const [twoFaData, setTwoFaData] = useState<{ tempToken: string; identifier: string } | null>(
    null
  );
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaVerifying, setTwoFaVerifying] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    void (async () => {
      try {
        const { isBiometricEnabled } = await import("../biometric");
        setBiometricEnabled(await isBiometricEnabled());
      } catch (e) {
        log.debug("biometric check failed:", e);
      }
    })();
  }, []);

  const translateApiError = useCallback(
    (raw: string): string => {
      const lower = raw.toLowerCase();
      if (/too many|attempts|locked|rate limit|lockout/.test(lower)) {
        if (!isRateLimited) triggerRateLimit(60);
        return T("accountLocked") as string;
      }
      if (/banned|suspended|blocked/.test(lower)) return T("accountSuspended") as string;
      if (/network|fetch|connection|timeout|offline/.test(lower))
        return T("networkError") as string;
      if (/otp.*send|send.*otp|failed to send/.test(lower)) return T("sendOtpFailed") as string;
      if (/access.*denied|role|riders? only|vendors? only/.test(lower))
        return T("accessDenied") as string;
      return T("loginFailed") as string;
    },
    [T, isRateLimited, triggerRateLimit]
  );

  const handleSuccess = useCallback(
    async (_sdkUser: SDKAuthUser, _sdkToken: string) => {
      setLoginError(null);
      capturedTokenRef.current = _sdkToken ?? "";
      capturedProfileRef.current = null;
      setIsProcessing(true);

      let profile: AuthUser;
      try {
        profile = (await api.getMe()) as AuthUser;
        capturedProfileRef.current = profile;
      } catch (fetchErr: unknown) {
        const err = fetchErr as {
          code?: string;
          approvalStatus?: string;
          rejectionReason?: string | null;
        };
        if (err.code === "APPROVAL_PENDING") {
          setOverlay("pending");
          setIsProcessing(false);
          return;
        }
        if (err.code === "APPROVAL_REJECTED") {
          setRejectionReason(err.rejectionReason ?? null);
          setOverlay("rejected");
          setIsProcessing(false);
          return;
        }
        api.clearTokens();
        setLoginError(
          fetchErr instanceof Error
            ? translateApiError(fetchErr.message)
            : (T("loginFailed") as string)
        );
        setIsProcessing(false);
        return;
      }

      const approvalStatus = profile.approvalStatus;
      if (approvalStatus === "pending") {
        setOverlay("pending");
        setIsProcessing(false);
        return;
      }
      if (approvalStatus === "rejected") {
        setRejectionReason(profile.rejectionReason ?? null);
        setOverlay("rejected");
        setIsProcessing(false);
        return;
      }

      const profileRoles = normalizeRoles(profile);
      if (!profileRoles.includes("vendor")) {
        api.clearTokens();
        setLoginError(
          (T("accessDenied") as string) || "Access denied. This app is for vendors only."
        );
        setIsProcessing(false);
        return;
      }

      setIsProcessing(false);
      if (!biometricEnabled) {
        setOverlay("biometric");
        return;
      }
      login(_sdkToken, profile, api.getRefreshToken() ?? undefined);
      onSuccess?.(_sdkToken, profile as unknown as SDKAuthUser);
      navigate("/");
    },
    [biometricEnabled, login, navigate, T, translateApiError, onSuccess]
  );

  const confirmBiometric = async (enable: boolean) => {
    if (!capturedTokenRef.current) {
      setOverlay(null);
      navigate("/");
      return;
    }
    setIsBiometricLoading(true);
    try {
      if (enable) {
        const { setBiometricEnabled: setBio } = await import("../biometric").catch(
          () => ({}) as never
        );
        if (setBio) await setBio(true);
      }
      const profile = capturedProfileRef.current ?? ((await api.getMe()) as AuthUser);
      const roles = normalizeRoles(profile);
      if (!roles.includes("vendor")) {
        api.clearTokens();
        setLoginError((T("accessDenied") as string) || "Access denied.");
        setOverlay(null);
        return;
      }
      login(capturedTokenRef.current, profile, api.getRefreshToken() ?? undefined);
      setOverlay(null);
      navigate("/");
    } catch (err: unknown) {
      api.clearTokens();
      setLoginError(
        err instanceof Error ? translateApiError(err.message) : (T("loginFailed") as string)
      );
      setOverlay(null);
    } finally {
      setIsBiometricLoading(false);
    }
  };

  const handleGoogle = useCallback(async () => {
    if (!auth.googleClientId) {
      setLoginError(T("socialLoginComingSoon") as string);
      return;
    }
    try {
      const [idToken, deviceMeta] = await Promise.all([
        loadGoogleGSIToken(auth.googleClientId),
        Promise.race([
          captureDeviceMeta(),
          new Promise<undefined>((r) => setTimeout(() => r(undefined), 2000)),
        ]),
      ]);
      const res = (await api.socialGoogle({ idToken, deviceMeta })) as Record<string, unknown>;
      api.storeTokens(res.token as string, res.refreshToken as string | undefined);
      await handleSuccess(res.user as SDKAuthUser, res.token as string);
    } catch (e: unknown) {
      setLoginError(
        e instanceof Error ? translateApiError(e.message) : (T("loginFailed") as string)
      );
    }
  }, [auth.googleClientId, handleSuccess, T, translateApiError]);

  const handleFacebook = useCallback(async () => {
    if (!auth.facebookAppId) {
      setLoginError(T("socialLoginComingSoon") as string);
      return;
    }
    try {
      const [accessToken, deviceMeta] = await Promise.all([
        loadFacebookAccessToken(auth.facebookAppId),
        Promise.race([
          captureDeviceMeta(),
          new Promise<undefined>((r) => setTimeout(() => r(undefined), 2000)),
        ]),
      ]);
      const res = (await api.socialFacebook({ accessToken, deviceMeta })) as Record<
        string,
        unknown
      >;
      api.storeTokens(res.token as string, res.refreshToken as string | undefined);
      await handleSuccess(res.user as SDKAuthUser, res.token as string);
    } catch (e: unknown) {
      setLoginError(
        e instanceof Error ? translateApiError(e.message) : (T("loginFailed") as string)
      );
    }
  }, [auth.facebookAppId, handleSuccess, T, translateApiError]);

  const handleSendOtp = async () => {
    const phone = localPhone.trim();
    if (!phone || !/^0?3\d{9}$/.test(phone.replace(/[\s\-()+]/g, ""))) {
      setLoginError(
        (T("invalidPhoneNumber") as string) || "Enter a valid Pakistani mobile number (03XXXXXXXXX)"
      );
      return;
    }
    setLoginError(null);
    setOtpSending(true);
    const result = await sendOtp(phone);
    setOtpSending(false);
    if (!result.success) {
      setLoginError(translateApiError(result.error ?? ""));
      return;
    }
    if (result.data?.otp) setDevOtp(result.data.otp as string);
    setLocalOtp("");
    setOtpStep("otp");
    setResendCooldown(60);
  };

  const handleVerifyOtp = async (otpOverride?: string) => {
    const otp = otpOverride ?? localOtp;
    if (otp.length !== 6) {
      setLoginError("Please enter the complete 6-digit OTP");
      return;
    }
    setLoginError(null);
    setVerifying(true);
    const result = await verifyOtp(localPhone, otp);
    setVerifying(false);
    if (!result.success) {
      setLoginError(translateApiError(result.error ?? ""));
      setLocalOtp("");
      return;
    }
    const { token, refreshToken } = result.data!;
    api.storeTokens(token, refreshToken);
    await handleSuccess({ id: "", phone: localPhone, roles: [] } as unknown as SDKAuthUser, token);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localIdentifier.trim()) {
      setLoginError("Please enter your phone number or username");
      return;
    }
    if (!localPassword) {
      setLoginError((T("enterPassword") as string) || "Please enter your password");
      return;
    }
    setLoginError(null);
    setSigningIn(true);
    const result = await loginWithPassword(localIdentifier.trim(), localPassword);
    setSigningIn(false);
    if (!result.success) {
      setLoginError(translateApiError(result.error ?? ""));
      return;
    }
    const { token, refreshToken, requires2FA, tempToken } = result.data!;
    if (requires2FA && tempToken) {
      setTwoFaData({ tempToken, identifier: localIdentifier.trim() });
      return;
    }
    api.storeTokens(token, refreshToken);
    await handleSuccess({ id: "", phone: localIdentifier } as unknown as SDKAuthUser, token);
  };

  const handleVerify2fa = async () => {
    if (twoFaCode.length !== 6) {
      setLoginError("Enter the 6-digit authenticator code");
      return;
    }
    setLoginError(null);
    setTwoFaVerifying(true);
    try {
      const res = (await api.twoFactorVerify({
        code: twoFaCode,
        tempToken: twoFaData!.tempToken,
      })) as Record<string, unknown>;
      const token = (res.accessToken ?? res.token) as string;
      const refreshToken = res.refreshToken as string | undefined;
      api.storeTokens(token, refreshToken);
      setTwoFaData(null);
      setTwoFaCode("");
      await handleSuccess(
        { id: "", phone: twoFaData!.identifier, roles: [] } as unknown as SDKAuthUser,
        token
      );
    } catch (err: unknown) {
      setLoginError(
        err instanceof Error ? translateApiError(err.message) : "Invalid code. Please try again."
      );
    } finally {
      setTwoFaVerifying(false);
    }
  };

  const isBlocked = isProcessing || isRateLimited;

  /* ── Overlays ── */
  if (maintenance) {
    return (
      <OverlayWrapper>
        <MaintenanceOverlay
          message={maintenanceMsg}
          supportPhone={supportPhone}
          supportEmail={supportEmail}
        />
      </OverlayWrapper>
    );
  }
  if (overlay === "pending")
    return <PendingOverlay appName={config.platform.appName} onBack={() => setOverlay(null)} />;
  if (overlay === "rejected")
    return (
      <RejectedOverlay
        reason={rejectionReason}
        onBack={() => {
          setOverlay(null);
          setRejectionReason(null);
        }}
      />
    );
  if (overlay === "biometric")
    return (
      <BiometricPromptOverlay
        onAccept={() => void confirmBiometric(true)}
        onDecline={() => void confirmBiometric(false)}
        loading={isBiometricLoading}
      />
    );

  /* ── 2FA overlay ── */
  if (twoFaData) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: theme.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
        }}
      >
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 20,
            padding: "28px 24px",
            width: "100%",
            maxWidth: 400,
            boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: `${theme.primary}15`,
                border: `1px solid ${theme.primary}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
              }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.primary}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>
            <h2 style={{ color: theme.text, fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>
              Two-Factor Authentication
            </h2>
            <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
              Enter the 6-digit code from your authenticator app
            </p>
          </div>
          {loginError && (
            <div
              role="alert"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 16,
                color: "#f87171",
                fontSize: 13,
              }}
            >
              {loginError}
            </div>
          )}
          <OtpBoxes
            value={twoFaCode}
            onChange={(v) => {
              setTwoFaCode(v);
              setLoginError(null);
            }}
            onComplete={() => void handleVerify2fa()}
            disabled={twoFaVerifying}
          />
          <button
            onClick={() => void handleVerify2fa()}
            disabled={twoFaVerifying || twoFaCode.length < 6}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 12,
              border: "none",
              marginTop: 18,
              background:
                twoFaVerifying || twoFaCode.length < 6
                  ? `${theme.primary}60`
                  : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: twoFaVerifying || twoFaCode.length < 6 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {twoFaVerifying ? (
              <>
                <Spinner color="#fff" /> Verifying…
              </>
            ) : (
              "Verify"
            )}
          </button>
          <button
            onClick={() => {
              setTwoFaData(null);
              setTwoFaCode("");
              setLoginError(null);
            }}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              color: theme.textMuted,
              fontSize: 13,
              cursor: "pointer",
              marginTop: 12,
              padding: 8,
            }}
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  /* ── Shared styles ── */
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
    transition: "border-color 0.15s",
  };
  const btnPrimary: React.CSSProperties = {
    width: "100%",
    height: 48,
    borderRadius: 12,
    border: "none",
    background: isBlocked
      ? `${theme.primary}60`
      : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: isBlocked ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "opacity 0.15s",
    opacity: isBlocked ? 0.7 : 1,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        pointerEvents: isBlocked ? "none" : "auto",
      }}
    >
      {/* ── Branded header ── */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
            boxShadow: `0 8px 28px ${theme.primary}45`,
          }}
        >
          <StoreIcon size={36} color="#fff" />
        </div>
        <h1
          style={{
            color: theme.text,
            fontSize: 26,
            fontWeight: 800,
            margin: "0 0 4px",
            letterSpacing: "-0.5px",
          }}
        >
          AJKMart Vendor
        </h1>
        <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
          Sign in to your vendor account
        </p>
      </div>

      {/* ── Card ── */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 20,
          padding: "24px 22px",
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Error / rate-limit banner */}
        {(loginError || isRateLimited) && (
          <div
            role="alert"
            aria-live="assertive"
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
            {isRateLimited ? `⏳ Too many attempts. Try again in ${secondsLeft}s` : loginError}
          </div>
        )}

        {/* Dev OTP hint */}
        {import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEV_OTP === "true" && devOtp && otpStep === "otp" && (
          <div
            style={{
              background: "#1a2035",
              border: "1px solid #2d3a55",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 12,
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            Dev OTP: <strong style={{ color: theme.primary }}>{devOtp}</strong>
          </div>
        )}

        {/* ── Login mode tabs ── */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: theme.background,
            borderRadius: 12,
            padding: 4,
            marginBottom: 22,
          }}
        >
          {(["otp", "password"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setLoginMode(mode);
                setLoginError(null);
                setOtpStep("phone");
              }}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                transition: "all 0.18s",
                background: loginMode === mode ? theme.surface : "transparent",
                color: loginMode === mode ? theme.primary : theme.textMuted,
                boxShadow: loginMode === mode ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
              }}
            >
              {mode === "otp" ? "Phone" : "Password"}
            </button>
          ))}
        </div>

        {/* ── OTP mode: phone step ── */}
        {loginMode === "otp" && otpStep === "phone" && (
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
                  value={localPhone}
                  onChange={(e) => {
                    setLocalPhone(e.target.value);
                    setLoginError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && void handleSendOtp()}
                  placeholder="03XXXXXXXXX"
                  maxLength={11}
                  autoFocus
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </div>
            <button onClick={() => void handleSendOtp()} disabled={otpSending} style={btnPrimary}>
              {otpSending ? (
                <>
                  <Spinner color="#fff" /> Sending OTP…
                </>
              ) : (
                (T("sendOtpBtn") as string) || "Send OTP"
              )}
            </button>
          </div>
        )}

        {/* ── OTP mode: otp step ── */}
        {loginMode === "otp" && otpStep === "otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: theme.textMuted, fontSize: 13, margin: "0 0 4px" }}>OTP sent to</p>
              <p style={{ color: theme.text, fontSize: 15, fontWeight: 700, margin: 0 }}>
                {localPhone}
              </p>
            </div>
            <OtpBoxes
              value={localOtp}
              onChange={(v) => {
                setLocalOtp(v);
                setLoginError(null);
              }}
              onComplete={(v) => void handleVerifyOtp(v)}
              disabled={verifying}
            />
            <button
              onClick={() => void handleVerifyOtp()}
              disabled={verifying || localOtp.length < 6}
              style={btnPrimary}
            >
              {verifying ? (
                <>
                  <Spinner color="#fff" /> Verifying…
                </>
              ) : (
                "Verify & Sign In"
              )}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={() => {
                  setOtpStep("phone");
                  setLocalOtp("");
                  setDevOtp("");
                  setLoginError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: theme.textMuted,
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                ← Change Number
              </button>
              {resendCooldown > 0 ? (
                <span style={{ color: theme.textMuted, fontSize: 12 }}>
                  Resend in {resendCooldown}s
                </span>
              ) : (
                <button
                  onClick={() => void handleSendOtp()}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.primary,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Resend OTP
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Password mode ── */}
        {loginMode === "password" && (
          <form
            onSubmit={(e) => void handlePasswordLogin(e)}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
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
                Phone / Username *
              </label>
              <input
                type="text"
                value={localIdentifier}
                onChange={(e) => {
                  setLocalIdentifier(e.target.value);
                  setLoginError(null);
                }}
                placeholder="03XXXXXXXXX or username"
                autoFocus
                style={inputStyle}
              />
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
                Password *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={localPassword}
                  onChange={(e) => {
                    setLocalPassword(e.target.value);
                    setLoginError(null);
                  }}
                  placeholder="Enter your password"
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
                    padding: 0,
                  }}
                >
                  {showPassword ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div style={{ textAlign: "right", marginTop: -8 }}>
              <Link
                href="/forgot-password"
                style={{
                  fontSize: 12,
                  color: theme.primary,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Forgot Password?
              </Link>
            </div>
            <button type="submit" disabled={signingIn} style={btnPrimary}>
              {signingIn ? (
                <>
                  <Spinner color="#fff" /> Signing In…
                </>
              ) : (
                (T("signIn") as string) || "Sign In"
              )}
            </button>
          </form>
        )}

        {/* ── Social login ── */}
        {(auth.google || auth.facebook) && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
              <div style={{ flex: 1, height: 1, background: theme.border }} />
              <span style={{ color: theme.textMuted, fontSize: 11, fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: theme.border }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {auth.google && (
                <button
                  onClick={() => void handleGoogle()}
                  disabled={socialLoading !== null}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: theme.background,
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: socialLoading !== null ? "not-allowed" : "pointer",
                    opacity: socialLoading !== null ? 0.6 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>
              )}
              {auth.facebook && (
                <button
                  onClick={() => void handleFacebook()}
                  disabled={socialLoading !== null}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: theme.background,
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: socialLoading !== null ? "not-allowed" : "pointer",
                    opacity: socialLoading !== null ? 0.6 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Continue with Facebook
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Register link ── */}
        <p
          style={{
            textAlign: "center",
            marginTop: 20,
            marginBottom: 0,
            fontSize: 13,
            color: theme.textMuted,
          }}
        >
          New vendor?{" "}
          <Link
            href="/register"
            style={{ color: theme.primary, fontWeight: 700, textDecoration: "none" }}
          >
            Register Your Store
          </Link>
        </p>
      </div>

      <p style={{ color: theme.textMuted, fontSize: 11, marginTop: 20, opacity: 0.5 }}>
        AJKMart Vendor © {new Date().getFullYear()}
      </p>
    </div>
  );
}

/* ─────────────────────────────── Overlay components ────────────────────────── */

function OverlayWrapper({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: t.background,
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 384 }}>{children}</div>
    </div>
  );
}

function MaintenanceOverlay({
  message,
  supportPhone,
  supportEmail,
}: {
  message?: string;
  supportPhone?: string;
  supportEmail?: string;
}) {
  const theme = useTheme();
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 18,
        padding: "28px 24px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          border: `1px solid ${theme.primary}40`,
          background: `${theme.primary}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.primary}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </div>
      <h2 style={{ color: theme.text, fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
        Under Maintenance
      </h2>
      <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
        {message ?? "We're performing scheduled maintenance. Back soon!"}
      </p>
      {(supportPhone || supportEmail) && (
        <div
          style={{
            background: theme.background,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: "12px 16px",
            textAlign: "left",
          }}
        >
          <p
            style={{
              color: theme.primary,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: "0 0 8px",
            }}
          >
            Need Help?
          </p>
          {supportPhone && (
            <p style={{ color: theme.text, fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
              📞 {supportPhone}
            </p>
          )}
          {supportEmail && (
            <p style={{ color: theme.textMuted, fontSize: 12, margin: 0 }}>{supportEmail}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PendingOverlay({ appName, onBack }: { appName?: string; onBack?: () => void }) {
  const theme = useTheme();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.background,
        padding: 16,
      }}
    >
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 18,
          padding: "28px 24px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          width: "100%",
          maxWidth: 384,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            border: `1px solid ${theme.primary}40`,
            background: `${theme.primary}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.primary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h2 style={{ color: theme.text, fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
          Application Under Review
        </h2>
        <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          Your {appName ?? "vendor application"} is being reviewed by our team. You'll be notified
          once approved.
        </p>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: `${theme.primary}15`,
              color: theme.primary,
              border: `1px solid ${theme.primary}30`,
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Back to Login
          </button>
        )}
      </div>
    </div>
  );
}

function RejectedOverlay({ reason, onBack }: { reason?: string | null; onBack?: () => void }) {
  const theme = useTheme();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.background,
        padding: 16,
      }}
    >
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 18,
          padding: "28px 24px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          width: "100%",
          maxWidth: 384,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.error ?? "#ef4444"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h2 style={{ color: theme.text, fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
          Application Not Approved
        </h2>
        {reason && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.22)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 20,
              textAlign: "left",
            }}
          >
            <p
              style={{ color: theme.error ?? "#fca5a5", fontSize: 13, lineHeight: 1.5, margin: 0 }}
            >
              {reason}
            </p>
          </div>
        )}
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "rgba(239,68,68,0.1)",
              color: theme.error ?? "#f87171",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Back to Login
          </button>
        )}
      </div>
    </div>
  );
}

function BiometricPromptOverlay({
  onAccept,
  onDecline,
  loading,
}: {
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}) {
  const theme = useTheme();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.background,
        padding: 16,
      }}
    >
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 18,
          padding: "28px 24px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          width: "100%",
          maxWidth: 384,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            border: `1px solid ${theme.primary}40`,
            background: `${theme.primary}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.primary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 10a2 2 0 0 0-2 2c0 1.02.5 1.96 1.34 2.53a.5.5 0 0 1 .16.58L10.5 18h3l-1-2.89a.5.5 0 0 1 .16-.58A2.5 2.5 0 0 0 14 12a2 2 0 0 0-2-2z" />
            <path d="M12 4C9.38 4 6 5.55 6 9v3a6 6 0 0 0 12 0V9c0-3.45-3.38-5-6-5z" />
          </svg>
        </div>
        <h2 style={{ color: theme.text, fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
          Enable Biometric Login?
        </h2>
        <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
          Sign in faster next time with your fingerprint or face scan.
        </p>
        <button
          onClick={onAccept}
          disabled={loading}
          style={{
            background: loading
              ? `${theme.primaryDark}80`
              : `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "12px 20px",
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            width: "100%",
            marginBottom: 10,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Setting up…" : "Enable Biometrics"}
        </button>
        <button
          onClick={onDecline}
          disabled={loading}
          style={{
            background: "transparent",
            color: theme.textMuted,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
            width: "100%",
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
