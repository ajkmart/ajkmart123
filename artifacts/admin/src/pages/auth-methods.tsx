import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Fingerprint,
  Info,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Mail,
  Phone,
  Power,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────
 * Auth Methods (per-role)
 *
 * Single source of truth for which login / verification methods are
 * available to each role. Backed by the existing `platform_settings`
 * keys — the same JSON value shape (`{"customer":"on","rider":"on","vendor":"off"}`)
 * already consumed by `lib/auth-utils/server.ts` and `routes/auth.ts`.
 *
 * No backend changes are required: the per-role matrix here writes the
 * very keys the API server already reads via `isAuthMethodEnabled`.
 * ───────────────────────────────────────────────────────────────────── */

type Role = "customer" | "rider" | "vendor";

interface MethodDef {
  key: string;
  label: string;
  description: string;
  icon: typeof Phone;
  defaultOn: boolean;
  category: "primary" | "social" | "secondary";
  requiresCredentials?: {
    keys: { key: string; label: string; placeholder: string }[];
    helpUrl?: string;
  };
}

const METHODS: MethodDef[] = [
  {
    key: "auth_phone_otp_enabled",
    label: "Phone",
    description: "Send a one-time passcode via SMS to verify the user's phone number.",
    icon: Phone,
    defaultOn: true,
    category: "primary",
  },
  {
    key: "auth_email_otp_enabled",
    label: "Email",
    description: "Send a one-time passcode via email to verify the user's email address.",
    icon: Mail,
    defaultOn: true,
    category: "primary",
  },
  {
    key: "auth_username_password_enabled",
    label: "Username + Password",
    description: "Traditional username and password credentials for login.",
    icon: Lock,
    defaultOn: true,
    category: "primary",
  },
  {
    key: "auth_magic_link_enabled",
    label: "Magic Link",
    description: "Send a secure one-click sign-in link to the user's email.",
    icon: Link2,
    defaultOn: false,
    category: "primary",
  },
  {
    key: "auth_google_enabled",
    label: "Google Login",
    description: "Sign in with Google. Requires a Google OAuth Client ID.",
    icon: KeyRound,
    defaultOn: false,
    category: "social",
    requiresCredentials: {
      keys: [
        {
          key: "google_client_id",
          label: "Google Client ID",
          placeholder: "xxxx.apps.googleusercontent.com",
        },
      ],
      helpUrl: "https://console.cloud.google.com/apis/credentials",
    },
  },
  {
    key: "auth_facebook_enabled",
    label: "Facebook Login",
    description: "Sign in with Facebook. Requires a Facebook App ID.",
    icon: KeyRound,
    defaultOn: false,
    category: "social",
    requiresCredentials: {
      keys: [{ key: "facebook_app_id", label: "Facebook App ID", placeholder: "123456789012345" }],
      helpUrl: "https://developers.facebook.com/apps",
    },
  },
  {
    key: "auth_2fa_enabled",
    label: "Two-Factor Authentication (TOTP)",
    description: "Require a 6-digit authenticator app code after primary login.",
    icon: ShieldCheck,
    defaultOn: false,
    category: "secondary",
  },
  {
    key: "auth_biometric_enabled",
    label: "Biometric Login",
    description: "Allow Face ID / Fingerprint sign-in on supported mobile devices.",
    icon: Fingerprint,
    defaultOn: false,
    category: "secondary",
  },
];

const ROLES: {
  key: Role;
  label: string;
  icon: typeof Users;
  ring: string;
  chip: string;
  dot: string;
}[] = [
  {
    key: "customer",
    label: "Customer",
    icon: ShoppingBag,
    ring: "ring-blue-500/40",
    chip: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  {
    key: "rider",
    label: "Rider",
    icon: Bike,
    ring: "ring-emerald-500/40",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    key: "vendor",
    label: "Vendor",
    icon: Store,
    ring: "ring-orange-500/40",
    chip: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
  },
];

const CATEGORY_META: Record<MethodDef["category"], { label: string; description: string }> = {
  primary: {
    label: "Primary Sign-In Methods",
    description: "Core methods users can use to log in.",
  },
  social: {
    label: "Social Login Providers",
    description: "OAuth-based sign-in with external providers.",
  },
  secondary: {
    label: "Additional Security Layers",
    description: "Optional methods that strengthen authentication.",
  },
};

interface PlatformSetting {
  key: string;
  value: string;
  category: string;
}

function parseRoleValue(raw: string | undefined, defaultOn: boolean): Record<Role, boolean> {
  const fallback = { customer: defaultOn, rider: defaultOn, vendor: defaultOn };
  if (raw === undefined || raw == null || raw === "") return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<Role, string>>;
    return {
      customer: parsed.customer === "on",
      rider: parsed.rider === "on",
      vendor: parsed.vendor === "on",
    };
  } catch {
    const flat = raw === "on";
    return { customer: flat, rider: flat, vendor: flat };
  }
}

function serialiseRoleValue(roles: Record<Role, boolean>): string {
  return JSON.stringify({
    customer: roles.customer ? "on" : "off",
    rider: roles.rider ? "on" : "off",
    vendor: roles.vendor ? "on" : "off",
  });
}

export default function AuthMethodsPage() {
  const { toast } = useToast();
  const [_settings, setSettings] = useState<PlatformSetting[]>([]);
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<Record<string, boolean>>({});
  const [rotatingSecret, setRotatingSecret] = useState(false);

  const dirtyKeys = useMemo(() => {
    const set = new Set<string>();
    for (const k of Object.keys(localValues)) {
      if (localValues[k] !== savedValues[k]) set.add(k);
    }
    return set;
  }, [localValues, savedValues]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/platform-settings");
      const arr: PlatformSetting[] = data.settings || [];
      setSettings(arr);
      const map: Record<string, string> = {};
      for (const s of arr) map[s.key] = s.value;
      setSavedValues(map);
      setLocalValues(map);
    } catch (e: unknown) {
      toast({
        title: "Failed to load settings",
        description: (e instanceof Error ? e.message : null) || "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const setValue = useCallback((key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleCell = useCallback(
    (method: MethodDef, role: Role) => {
      const current = parseRoleValue(localValues[method.key], method.defaultOn);
      const next = { ...current, [role]: !current[role] };
      setValue(method.key, serialiseRoleValue(next));
    },
    [localValues, setValue]
  );

  const setRoleAll = useCallback((role: Role, on: boolean) => {
    setLocalValues((prev) => {
      const next = { ...prev };
      for (const m of METHODS) {
        const current = parseRoleValue(next[m.key], m.defaultOn);
        next[m.key] = serialiseRoleValue({ ...current, [role]: on });
      }
      return next;
    });
  }, []);

  const setMethodAll = useCallback(
    (method: MethodDef, on: boolean) => {
      setValue(method.key, serialiseRoleValue({ customer: on, rider: on, vendor: on }));
    },
    [setValue]
  );

  const resetAll = useCallback(() => setLocalValues(savedValues), [savedValues]);

  /* Super admin MFA toggle — reads/writes security_super_admin_mfa_required */
  const superAdminMfaOn = localValues["security_super_admin_mfa_required"] === "on";

  /* Rotate Master Secret — calls POST /api/admin/auth/rotate-secret */
  const handleRotateSecret = useCallback(async () => {
    if (
      !window.confirm(
        "This will immediately rotate the master admin secret and notify all active admins by email.\n\nYou will need to use the new secret for your next login. Continue?"
      )
    )
      return;
    setRotatingSecret(true);
    try {
      const data = await adminFetch("/auth/rotate-secret", { method: "POST" });
      toast({
        title: "Master secret rotated",
        description: data?.message ?? "New secret is now active. All admins notified.",
      });
    } catch (e: unknown) {
      toast({
        title: "Rotation failed",
        description: (e instanceof Error ? e.message : null) || "Try again",
        variant: "destructive",
      });
    } finally {
      setRotatingSecret(false);
    }
  }, [toast]);
  const handleSave = useCallback(async () => {
    if (dirtyKeys.size === 0) return;
    setSaving(true);
    try {
      const changes = Array.from(dirtyKeys).map((key) => ({ key, value: localValues[key] ?? "" }));
      await adminFetch("/platform-settings", {
        method: "PUT",
        body: JSON.stringify({ settings: changes }),
      });
      setSavedValues((prev) => {
        const updated = { ...prev };
        for (const c of changes) updated[c.key] = c.value;
        return updated;
      });
      toast({
        title: "Auth methods saved",
        description: `${changes.length} change(s) applied. Apps refresh on next request.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: (e instanceof Error ? e.message : null) || "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [dirtyKeys, localValues, toast]);

  const filteredMethods = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return METHODS;
    return METHODS.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.key.toLowerCase().includes(q)
    );
  }, [search]);

  const groupedMethods = useMemo(() => {
    const groups: Record<MethodDef["category"], MethodDef[]> = {
      primary: [],
      social: [],
      secondary: [],
    };
    for (const m of filteredMethods) groups[m.category].push(m);
    return groups;
  }, [filteredMethods]);

  /* ───────── role usage stats (header summary) ───────── */
  const roleStats = useMemo(() => {
    return ROLES.map((r) => {
      let enabled = 0;
      for (const m of METHODS) {
        const roles = parseRoleValue(localValues[m.key], m.defaultOn);
        if (roles[r.key]) enabled++;
      }
      return { ...r, enabled, total: METHODS.length };
    });
  }, [localValues]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="text-primary h-7 w-7 animate-spin" />
          <p className="text-muted-foreground text-sm font-medium">Loading auth methods…</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Auth Methods page crashed. Please reload.
        </div>
      }
    >
      <TooltipProvider delayDuration={200}>
        <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 pb-32 sm:pb-24">
          {/* ───────── Header ───────── */}
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5">
              <PageHeader
                icon={KeyRound}
                title="Auth Methods"
                subtitle="Per-role login & security controls — Customer, Rider, Vendor"
                iconBgClass="bg-indigo-100"
                iconColorClass="text-indigo-600"
                actions={
                  <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    {dirtyKeys.size > 0 && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 font-semibold text-amber-800"
                      >
                        {dirtyKeys.size} unsaved
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetAll}
                      disabled={dirtyKeys.size === 0 || saving}
                      className="hidden sm:inline-flex"
                    >
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={dirtyKeys.size === 0 || saving}
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {saving ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-4 w-4" />
                      )}
                      Save changes
                    </Button>
                  </div>
                }
              />

              {/* Role summary chips */}
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                {roleStats.map((r) => {
                  const Icon = r.icon;
                  const pct = Math.round((r.enabled / r.total) * 100);
                  return (
                    <div
                      key={r.key}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 sm:gap-3 ${r.chip}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] leading-tight font-bold tracking-wide uppercase sm:text-xs">
                          {r.label}
                        </p>
                        <p className="truncate text-[10px] leading-tight opacity-75 sm:text-[11px]">
                          {r.enabled}/{r.total} methods • {pct}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ───────── Body ───────── */}
          <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-6">
            {/* Search + bulk actions */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search methods (e.g. OTP, Google, Biometric)…"
                  className="h-10 border-slate-200 bg-white pl-9"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-row">
                {ROLES.map((r) => (
                  <div key={r.key} className="flex flex-col items-stretch gap-1 sm:flex-row">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRoleAll(r.key, true)}
                          className="h-9 px-2 text-[11px] sm:px-3 sm:text-xs"
                        >
                          <r.icon className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">All ON</span>
                          <span className="ml-1 inline sm:hidden">ON</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Enable every method for {r.label}</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>

            {/* Unsaved-changes inline warning banner — immediate visual feedback when any toggle is changed */}
            {dirtyKeys.size > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-900 shadow-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="flex-1 text-xs leading-relaxed sm:text-[13px]">
                  <span className="font-bold">
                    You have {dirtyKeys.size} unsaved change{dirtyKeys.size > 1 ? "s" : ""}.
                  </span>{" "}
                  These will be lost if you navigate away. Click{" "}
                  <span className="font-semibold">Save changes</span> to apply them.
                </p>
              </div>
            )}
            {/* Info banner */}
            <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3.5 py-3 text-indigo-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs leading-relaxed sm:text-[13px]">
                Changes save immediately to the platform configuration and are read by all client
                apps on their next API call. Disabling a method blocks that login flow at the server
                — there is no client-side bypass.
              </p>
            </div>

            {/* ───────── Method groups ───────── */}
            {(["primary", "social", "secondary"] as const).map((cat) => {
              const items = groupedMethods[cat];
              if (items.length === 0) return null;
              const meta = CATEGORY_META[cat];
              return (
                <section key={cat} className="space-y-3">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                        {meta.label}
                      </h2>
                      <p className="text-[11px] text-slate-500 sm:text-xs">{meta.description}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      {items.length} {items.length === 1 ? "method" : "methods"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {items.map((method) => {
                      const roles = parseRoleValue(localValues[method.key], method.defaultOn);
                      const isDirty = dirtyKeys.has(method.key);
                      const Icon = method.icon;
                      const enabledCount = ROLES.filter((r) => roles[r.key]).length;
                      const allOn = enabledCount === ROLES.length;
                      const allOff = enabledCount === 0;
                      return (
                        <Card
                          key={method.key}
                          className={`border bg-white p-4 transition-all sm:p-5 ${
                            isDirty
                              ? "border-amber-300 shadow-md ring-2 shadow-amber-100/50 ring-amber-200/60"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {/* header */}
                          <div className="mb-3 flex items-start gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                allOff
                                  ? "bg-slate-100 text-slate-400"
                                  : "bg-indigo-50 text-indigo-600"
                              }`}
                            >
                              <Icon className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm leading-tight font-semibold text-slate-900">
                                  {method.label}
                                </h3>
                                {isDirty && (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-300 bg-amber-50 text-[9px] font-bold text-amber-700"
                                  >
                                    CHANGED
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs leading-snug text-slate-500">
                                {method.description}
                              </p>
                              <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                                {method.key}
                              </p>
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setMethodAll(method, !allOn)}
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                    allOn
                                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                  }`}
                                  aria-label={
                                    allOn ? "Disable for all roles" : "Enable for all roles"
                                  }
                                >
                                  <Power className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {allOn ? "Disable for all roles" : "Enable for all roles"}
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {/* per-role toggles */}
                          <div className="grid grid-cols-3 gap-2">
                            {ROLES.map((r) => {
                              const on = roles[r.key];
                              const RIcon = r.icon;
                              return (
                                <button
                                  key={r.key}
                                  onClick={() => toggleCell(method, r.key)}
                                  className={`group relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-all ${
                                    on
                                      ? `${r.chip} border-current/30 font-semibold shadow-sm`
                                      : "border-slate-200 bg-slate-50/60 text-slate-400 hover:bg-slate-100"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <RIcon className="h-3.5 w-3.5" />
                                    <span className="text-[11px] font-bold tracking-wide uppercase">
                                      {r.label}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${on ? r.dot : "bg-slate-300"}`}
                                    />
                                    <span className="text-[10px] font-bold tracking-wider">
                                      {on ? "ON" : "OFF"}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* magic link TTL */}
                          {method.key === "auth_magic_link_enabled" && (
                            <div className="mt-4 border-t border-slate-100 pt-4">
                              <div className="mb-2.5 flex items-center gap-2">
                                <Lock className="h-3.5 w-3.5 text-slate-500" />
                                <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                                  Link Expiry
                                </p>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-600">
                                  Magic link TTL (minutes)
                                </label>
                                <Input
                                  type="number"
                                  min={5}
                                  max={1440}
                                  value={localValues["auth_magic_link_ttl_min"] ?? "30"}
                                  onChange={(e) =>
                                    setValue("auth_magic_link_ttl_min", e.target.value)
                                  }
                                  placeholder="30"
                                  className="h-9 w-32 border-slate-200 bg-slate-50 text-xs"
                                />
                                <p className="text-[10px] text-slate-400">
                                  How long the one-click login link stays valid after being sent.
                                  Default: 30 minutes.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* required credentials */}
                          {method.requiresCredentials && (
                            <div className="mt-4 border-t border-slate-100 pt-4">
                              <div className="mb-2.5 flex items-center gap-2">
                                <Lock className="h-3.5 w-3.5 text-slate-500" />
                                <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                                  Required credentials
                                </p>
                                {method.requiresCredentials.helpUrl && (
                                  <a
                                    href={method.requiresCredentials.helpUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700"
                                  >
                                    Get keys <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                              <div className="space-y-2">
                                {method.requiresCredentials.keys.map((cred) => {
                                  const v = localValues[cred.key] ?? "";
                                  const credDirty = dirtyKeys.has(cred.key);
                                  const reveal = revealedSecret[cred.key];
                                  const missing = !v && !allOff;
                                  return (
                                    <div key={cred.key} className="space-y-1">
                                      <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-semibold text-slate-600">
                                          {cred.label}
                                        </label>
                                        {missing && (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                                            <AlertTriangle className="h-3 w-3" /> Required
                                          </span>
                                        )}
                                        {credDirty && (
                                          <Badge
                                            variant="outline"
                                            className="border-amber-300 bg-amber-50 text-[9px] font-bold text-amber-700"
                                          >
                                            CHANGED
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="relative">
                                        <Input
                                          type={reveal ? "text" : "password"}
                                          value={v}
                                          onChange={(e) => setValue(cred.key, e.target.value)}
                                          placeholder={cred.placeholder}
                                          className="h-9 border-slate-200 bg-slate-50 pr-9 font-mono text-xs"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setRevealedSecret((s) => ({
                                              ...s,
                                              [cred.key]: !s[cred.key],
                                            }))
                                          }
                                          className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                                          aria-label={reveal ? "Hide" : "Reveal"}
                                        >
                                          {reveal ? (
                                            <EyeOff className="h-3.5 w-3.5" />
                                          ) : (
                                            <Eye className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* status footer */}
                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {allOff ? (
                                <>
                                  <XCircle className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="font-semibold text-slate-500">
                                    Disabled for all roles
                                  </span>
                                </>
                              ) : allOn ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  <span className="font-semibold text-emerald-700">
                                    Enabled for all roles
                                  </span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                                  <span className="font-semibold text-indigo-700">
                                    Enabled for {enabledCount} of {ROLES.length} roles
                                  </span>
                                </>
                              )}
                            </div>
                            <span className="text-[10px] font-medium text-slate-400">
                              Default: {method.defaultOn ? "ON" : "OFF"}
                            </span>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {filteredMethods.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Search className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No methods match "{search}"</p>
                <p className="text-xs text-slate-500">Try a different search term.</p>
                <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="mt-2">
                  Clear search
                </Button>
              </div>
            )}

            {/* ───────── Super Admin Security ───────── */}
            <section className="mt-2">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-slate-800">Super Admin Security</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Settings that apply to the master super-admin login only.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {/* Require 2FA for Super Admin toggle */}
                <Card className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 shadow-sm sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-600" />
                      <span className="text-sm font-semibold text-slate-800">
                        Require 2FA for Super Admin
                      </span>
                      {superAdminMfaOn ? (
                        <Badge className="h-4 border-emerald-200 bg-emerald-100 px-1.5 py-0 text-[10px] font-semibold text-emerald-700">
                          Enabled
                        </Badge>
                      ) : (
                        <Badge className="h-4 border-slate-200 bg-slate-100 px-1.5 py-0 text-[10px] font-semibold text-slate-500">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      When enabled, the master super-admin must provide a valid TOTP code on every
                      login. Set{" "}
                      <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">
                        admin_master_totp_secret
                      </code>{" "}
                      in Platform Settings before enabling.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={superAdminMfaOn}
                    onClick={() =>
                      setValue("security_super_admin_mfa_required", superAdminMfaOn ? "off" : "on")
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:outline-none ${
                      superAdminMfaOn
                        ? "border-indigo-600 bg-indigo-600"
                        : "border-slate-300 bg-slate-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${superAdminMfaOn ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </button>
                </Card>

                {/* Rotate Master Secret button */}
                <Card className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 shadow-sm sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 shrink-0 text-rose-600" />
                      <span className="text-sm font-semibold text-slate-800">
                        Rotate Master Secret
                      </span>
                      <Badge className="h-4 border-rose-200 bg-rose-50 px-1.5 py-0 text-[10px] font-semibold text-rose-700">
                        Destructive
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      Generates a new cryptographically strong master secret immediately without a
                      server restart. The old secret is invalidated at once and all active admins
                      are notified by email.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rotatingSecret}
                    onClick={handleRotateSecret}
                    className="shrink-0 border-rose-300 text-rose-700 hover:border-rose-400 hover:bg-rose-50"
                  >
                    {rotatingSecret ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {rotatingSecret ? "Rotating…" : "Rotate secret"}
                  </Button>
                </Card>
              </div>
            </section>
          </div>

          {/* ───────── Sticky save bar (mobile/tablet) ───────── */}
          {dirtyKeys.size > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-30 sm:hidden">
              <div className="m-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 p-3 text-white shadow-2xl shadow-black/40">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
                  <p className="truncate text-xs font-semibold">
                    {dirtyKeys.size} unsaved change{dirtyKeys.size > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetAll}
                    className="h-8 px-2 text-white hover:bg-white/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="h-8 bg-indigo-500 hover:bg-indigo-400"
                  >
                    {saving ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
