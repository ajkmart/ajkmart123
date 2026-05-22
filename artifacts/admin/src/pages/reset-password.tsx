import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";

function getTokenFromQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get("token") ?? "";
  } catch {
    return "";
  }
}

function validateStrength(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least 1 uppercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain at least 1 number";
  return null;
}

type ValidationState =
  | { status: "checking" }
  | { status: "valid"; expiresAt: string | null; adminName: string | null }
  | { status: "invalid"; reason: "missing_token" | "invalid_or_expired" | "network" };

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const token = useMemo(getTokenFromQuery, []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationState>({ status: "checking" });
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setValidation({ status: "invalid", reason: "missing_token" });
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/auth/reset-password/validate?token=${encodeURIComponent(token)}`
        );
        const data = (await res.json().catch((_e) => ({}))) as {
          valid?: boolean;
          reason?: string;
          expiresAt?: string;
          adminName?: string;
        };
        if (cancelled) return;
        if (res.ok && data.valid)
          setValidation({
            status: "valid",
            expiresAt: data.expiresAt ?? null,
            adminName: data.adminName ?? null,
          });
        else
          setValidation({
            status: "invalid",
            reason: data.reason === "missing_token" ? "missing_token" : "invalid_or_expired",
          });
      } catch {
        if (!cancelled) setValidation({ status: "invalid", reason: "network" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }
    const strengthError = validateStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch((_e) => ({}));
      if (!res.ok) {
        setError(data?.error || "We couldn't reset your password.");
        return;
      }
      setSuccess(true);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = setTimeout(() => setLocation("/login"), 2200);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#0f1117] px-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30">
            <ShoppingBag className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Choose new password</h1>
          <p className="mt-1.5 text-[13px] text-white/50">
            {success ? "All done — signing you in" : "Create a strong, unique password"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-7 shadow-2xl backdrop-blur-md">
          {success ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-white/90">Password updated</p>
                <p className="mt-1.5 text-[13px] text-white/45">Redirecting you to sign in…</p>
              </div>
            </div>
          ) : validation.status === "checking" ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying your reset link…
            </div>
          ) : validation.status === "invalid" ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3.5">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-[13px] leading-snug text-red-300/90">
                  {validation.reason === "missing_token"
                    ? "This reset link is missing its token."
                    : validation.reason === "network"
                      ? "Couldn't reach the server. Check your connection."
                      : "This reset link is invalid or has expired."}
                </p>
              </div>
              <Link href="/forgot-password">
                <a className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-400/80 transition-colors hover:text-amber-300">
                  Request a new reset link <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Link href="/login">
                <a className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/40 transition-colors hover:text-white/70">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </a>
              </Link>

              {validation.adminName && (
                <p className="text-[13px] text-white/45">
                  Resetting password for{" "}
                  <span className="font-semibold text-white/70">{validation.adminName}</span>
                </p>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="rp-new"
                  className="block text-[11px] font-semibold tracking-widest text-white/40 uppercase"
                >
                  New password
                </label>
                <div className="relative">
                  <Input
                    id="rp-new"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    className="h-11 rounded-xl border-white/10 bg-white/[0.06] pr-10 text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:bg-white/[0.08] focus:ring-amber-400/15"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/30 transition-colors hover:text-white/60"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="rp-confirm"
                  className="block text-[11px] font-semibold tracking-widest text-white/40 uppercase"
                >
                  Confirm password
                </label>
                <Input
                  id="rp-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter the new password"
                  className="h-11 rounded-xl border-white/10 bg-white/[0.06] text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:bg-white/[0.08] focus:ring-amber-400/15"
                  required
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-[13px] text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !password || !confirmPassword}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-400 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Update password <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
