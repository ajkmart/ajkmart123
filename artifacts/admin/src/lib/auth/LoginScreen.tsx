import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { OtpInput } from "@workspace/auth-react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  ShieldCheck,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "../adminAuthContext";
import { useTheme } from "./ThemeContext";
import { useAppStatus } from "./useAppStatus";
import { useAuth } from "./useAuth";
import { useRateLimitCountdown } from "./useRateLimitCountdown";

export interface LoginScreenProps {
  onSuccess?: () => void;
}

type Step = "credentials" | "mfa";

function _sessionSeconds(rememberMe: boolean) {
  return rememberMe ? 60 * 60 * 24 * 7 : 60 * 60 * 8;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const { loginWithPassword, isLoading } = useAuth();
  const { maintenance, maintenanceMsg, supportPhone, supportEmail } = useAppStatus();
  const { isRateLimited, secondsLeft, triggerRateLimit } = useRateLimitCountdown();
  const theme = useTheme();
  const [, setLocation] = useLocation();
  const { state, logout } = useAdminAuth();
  const { toast: _toast } = useToast();
  const totpInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [totp, setTotp] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("credentials");
  const [error, setError] = useState<string | null>(state.error);
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const errorText = useMemo(() => {
    if (!state.error) return error;
    if (state.error.toLowerCase().includes("session expired")) return "Session expired";
    return state.error;
  }, [error, state.error]);

  useEffect(() => {
    if (step !== "mfa") return;
    const timer = setTimeout(() => totpInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (state.error?.toLowerCase().includes("session expired")) {
      setSessionExpiredOpen(true);
    }
  }, [state.error]);

  useEffect(() => {
    if (state.user && state.accessToken) {
      onSuccess?.();
      if (!onSuccess) setLocation("/dashboard");
    }
  }, [state.user, state.accessToken, onSuccess, setLocation]);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password.trim()) return;
    if (isRateLimited) return;
    const result = await loginWithPassword(username.trim(), password, undefined, undefined);
    if (result.error === "mfa_required") {
      setTempToken(result.data?.tempToken ?? null);
      setStep("mfa");
      setTotp("");
      return;
    }
    if (!result.success) {
      if (result.error?.toLowerCase().includes("locked") && result.retryAfter)
        triggerRateLimit(result.retryAfter);
      setError(result.error ?? "Login failed");
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!totp.trim() || !tempToken) return;
    const result = await loginWithPassword(username.trim(), password, totp, tempToken);
    if (!result.success) setError(result.error ?? "Invalid code");
  }

  async function handleLogout() {
    setLogoutOpen(false);
    await logout();
    setLocation("/login");
  }

  if (maintenance) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: theme.background,
          padding: 16,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            border: `1px solid ${theme.border}`,
            borderRadius: 20,
            background: theme.surface,
            padding: 28,
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                display: "grid",
                placeItems: "center",
              }}
            >
              <ShoppingBag style={{ width: 28, height: 28, color: theme.onPrimary }} />
            </div>
          </div>
          <h1
            style={{
              margin: 0,
              textAlign: "center",
              fontSize: 24,
              fontWeight: 800,
              color: theme.text,
            }}
          >
            AJKMart Admin
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              textAlign: "center",
              color: theme.textMuted,
              lineHeight: 1.6,
            }}
          >
            {maintenanceMsg ?? "The admin panel is temporarily unavailable."}
          </p>
          {(supportPhone || supportEmail) && (
            <div
              style={{
                marginTop: 18,
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                padding: 14,
              }}
            >
              {supportPhone && <div>📞 {supportPhone}</div>}
              {supportEmail && <div>{supportEmail}</div>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0f1117",
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 448, position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              margin: "0 auto 14px",
              background: "linear-gradient(135deg, #f59e0b, #ea580c)",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 14px 30px rgba(245,158,11,0.3)",
            }}
          >
            <ShieldCheck style={{ width: 28, height: 28, color: "#fff" }} />
          </div>
          <h1 style={{ margin: 0, color: "#fff", fontSize: 28, fontWeight: 800 }}>AJKMart Admin</h1>
          <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
            {step === "credentials" ? "Sign in to continue" : "Two-factor verification"}
          </p>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 22,
            padding: 28,
            boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
          }}
        >
          {errorText && (
            <div
              data-testid="login-error"
              role="alert"
              style={{
                marginBottom: 16,
                borderRadius: 14,
                border: "1px solid rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.08)",
                padding: "10px 12px",
                color: "#fca5a5",
                fontSize: 13,
              }}
            >
              {errorText}
            </div>
          )}

          {step === "credentials" ? (
            <form onSubmit={handleCredentialsSubmit} style={{ display: "grid", gap: 16 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  Username or Email
                </label>
                <div style={{ position: "relative" }}>
                  <UserRound
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 16,
                      height: 16,
                      color: "rgba(255,255,255,0.28)",
                    }}
                  />
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="admin@example.com"
                    className="h-11 rounded-xl border-white/10 bg-white/[0.06] pl-10 text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:bg-white/[0.08] focus:ring-amber-400/15"
                  />
                </div>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="h-11 rounded-xl border-white/10 bg-white/[0.06] pr-10 text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:bg-white/[0.08] focus:ring-amber-400/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 40,
                      display: "grid",
                      placeItems: "center",
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.35)",
                    }}
                  >
                    {showPassword ? (
                      <EyeOff style={{ width: 16, height: 16 }} />
                    ) : (
                      <Eye style={{ width: 16, height: 16 }} />
                    )}
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "rgba(255,255,255,0.72)",
                    fontSize: 13,
                  }}
                >
                  <Checkbox
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(Boolean(v))}
                  />
                  Remember me
                </label>
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                  {rememberMe ? "7-day session" : "8-hour session"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLocation("/forgot-password")}
                style={{
                  justifySelf: "flex-start",
                  border: "none",
                  background: "transparent",
                  color: "#fbbf24",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                Forgot Password?
              </button>
              <button
                type="submit"
                disabled={isLoading || isRateLimited || !username.trim() || !password.trim()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  height: 46,
                  borderRadius: 14,
                  border: "none",
                  background:
                    isLoading || isRateLimited || !username.trim() || !password.trim()
                      ? "rgba(245,158,11,0.5)"
                      : "#f59e0b",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isRateLimited ? (
                  `Try again in ${secondsLeft}s`
                ) : (
                  <>
                    Sign In <ArrowRight style={{ width: 16, height: 16 }} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} style={{ display: "grid", gap: 16 }}>
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(251,191,36,0.22)",
                  background: "rgba(251,191,36,0.08)",
                  padding: 14,
                  color: "rgba(255,255,255,0.86)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Enter the 6-digit code from your authenticator app.
              </div>
              <OtpInput length={6} onComplete={setTotp} label="Authenticator code" />
              <button
                type="button"
                onClick={() => setLocation("/forgot-password")}
                style={{
                  justifySelf: "flex-start",
                  border: "none",
                  background: "transparent",
                  color: "#fbbf24",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                Lost access to authenticator? Use backup code
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    setTempToken(null);
                    setTotp("");
                  }}
                  style={{
                    height: 42,
                    padding: "0 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.8)",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <ArrowLeft
                    style={{ width: 15, height: 15, display: "inline-block", marginRight: 6 }}
                  />
                  Back to login
                </button>
                <button
                  type="submit"
                  disabled={totp.length !== 6 || isLoading}
                  style={{
                    flex: 1,
                    height: 42,
                    borderRadius: 12,
                    border: "none",
                    background: isLoading ? "rgba(245,158,11,0.5)" : "#f59e0b",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </button>
              </div>
            </form>
          )}

          <div
            style={{
              marginTop: 18,
              color: "rgba(255,255,255,0.35)",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ width: 14, height: 14, display: "inline-flex" }}>
              <Mail style={{ width: 14, height: 14 }} />
            </span>
            Contact support if you cannot access your account.
          </div>
        </div>
      </div>

      <Dialog open={sessionExpiredOpen} onOpenChange={setSessionExpiredOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Session expired</DialogTitle>
          <DialogDescription>Please sign in again to continue.</DialogDescription>
          <div style={{ display: "grid", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                setSessionExpiredOpen(false);
                setLocation("/login");
              }}
              className="h-11 rounded-xl bg-amber-500 font-semibold text-white"
            >
              Sign in
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Sign out?</DialogTitle>
          <DialogDescription>
            You will need to sign in again to access the admin panel.
          </DialogDescription>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setLogoutOpen(false)}
              className="h-10 rounded-xl border px-4"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="h-10 rounded-xl bg-red-600 px-4 font-semibold text-white"
            >
              Sign Out
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LoginScreen;
