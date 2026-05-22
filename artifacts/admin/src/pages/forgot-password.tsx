import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed.toLowerCase() }),
      });
      if (!response.ok) {
        const data = await response.json().catch((_e) => ({}));
        setError(data?.error ? String(data.error) : "We couldn't send the reset link.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error — please try again.");
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
          <h1 className="text-2xl font-bold tracking-tight text-white">Reset password</h1>
          <p className="mt-1.5 text-[13px] text-white/50">
            {submitted ? "Check your inbox" : "We’ll send a reset link to your email"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-7 shadow-2xl backdrop-blur-md">
          {submitted ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-white/90">Link sent</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
                  If {email} matches an admin account, a reset link was sent.
                </p>
              </div>
              <Link href="/login">
                <button className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-[13px] font-medium text-white/70 transition-all hover:bg-white/[0.08] hover:text-white/90">
                  Return to sign in
                </button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Link href="/login">
                <a className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/40 transition-colors hover:text-white/70">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </a>
              </Link>

              <div className="space-y-1.5">
                <label
                  htmlFor="fp-email"
                  className="block text-[11px] font-semibold tracking-widest text-white/40 uppercase"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/25" />
                  <Input
                    id="fp-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11 rounded-xl border-white/10 bg-white/[0.06] pl-9 text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:bg-white/[0.08] focus:ring-amber-400/15"
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-[13px] text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-400 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Send reset link <ArrowRight className="h-4 w-4" />
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
