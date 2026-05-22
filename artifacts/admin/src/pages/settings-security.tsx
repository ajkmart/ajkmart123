import { Button } from "@/components/ui/button";
import {
  Chrome,
  ExternalLink,
  Facebook,
  Fingerprint,
  KeyRound,
  Mail,
  Phone,
  Shield,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { Link } from "wouter";

type RoleFlags = { customer: boolean; rider: boolean; vendor: boolean };

function parseRoleFlags(val: string | undefined, defaultOn: boolean): RoleFlags {
  if (val === undefined || val == null || val === "") {
    return { customer: defaultOn, rider: defaultOn, vendor: defaultOn };
  }
  if (val === "on") return { customer: true, rider: true, vendor: true };
  if (val === "off") return { customer: false, rider: false, vendor: false };
  try {
    const p = JSON.parse(val) as Record<string, string>;
    return {
      customer: p.customer !== "off",
      rider: p.rider !== "off",
      vendor: p.vendor !== "off",
    };
  } catch {
    return { customer: val === "on", rider: val === "on", vendor: val === "on" };
  }
}

function toRoleJson(f: RoleFlags): string {
  return JSON.stringify({
    customer: f.customer ? "on" : "off",
    rider: f.rider ? "on" : "off",
    vendor: f.vendor ? "on" : "off",
  });
}

const AUTH_METHODS = [
  {
    key: "auth_phone_otp_enabled",
    label: "Phone OTP",
    desc: "SMS one-time password login",
    icon: Phone,
    color: "text-green-600",
    bg: "bg-green-50",
    default: true,
  },
  {
    key: "auth_email_otp_enabled",
    label: "Email OTP",
    desc: "Email one-time password login",
    icon: Mail,
    color: "text-blue-600",
    bg: "bg-blue-50",
    default: true,
  },
  {
    key: "auth_username_password_enabled",
    label: "Username / Password",
    desc: "Classic credentials login",
    icon: KeyRound,
    color: "text-gray-600",
    bg: "bg-gray-100",
    default: true,
  },
  {
    key: "auth_google_enabled",
    label: "Google OAuth",
    desc: "Sign in with Google account",
    icon: Chrome,
    color: "text-red-600",
    bg: "bg-red-50",
    default: false,
  },
  {
    key: "auth_facebook_enabled",
    label: "Facebook OAuth",
    desc: "Sign in with Facebook account",
    icon: Facebook,
    color: "text-blue-700",
    bg: "bg-blue-50",
    default: false,
  },
  {
    key: "auth_magic_link_enabled",
    label: "Magic Link",
    desc: "Passwordless email link login",
    icon: Wand2,
    color: "text-purple-600",
    bg: "bg-purple-50",
    default: false,
  },
  {
    key: "auth_2fa_enabled",
    label: "Two-Factor Auth (2FA)",
    desc: "TOTP authenticator app support",
    icon: ShieldCheck,
    color: "text-orange-600",
    bg: "bg-orange-50",
    default: false,
  },
  {
    key: "auth_biometric_enabled",
    label: "Biometric / Passkey",
    desc: "Fingerprint or face login (web)",
    icon: Fingerprint,
    color: "text-teal-600",
    bg: "bg-teal-50",
    default: false,
  },
] as const;

const ROLES: { key: keyof RoleFlags; label: string; emoji: string }[] = [
  { key: "customer", label: "Customer", emoji: "👤" },
  { key: "rider", label: "Rider", emoji: "🛵" },
  { key: "vendor", label: "Vendor", emoji: "🏪" },
];

export function SecuritySection({
  localValues,
  handleChange,
}: {
  localValues?: Record<string, string>;
  dirtyKeys?: Set<string>;
  handleChange?: (k: string, v: string) => void;
  handleToggle?: (k: string, v: boolean) => void;
}) {
  const vals = localValues ?? {};

  function toggle(key: string, role: keyof RoleFlags, defaultOn: boolean) {
    const current = parseRoleFlags(vals[key], defaultOn);
    const next = { ...current, [role]: !current[role] };
    handleChange?.(key, toRoleJson(next));
  }

  function toggleAll(key: string, defaultOn: boolean) {
    const current = parseRoleFlags(vals[key], defaultOn);
    const allOn = current.customer && current.rider && current.vendor;
    handleChange?.(key, toRoleJson({ customer: !allOn, rider: !allOn, vendor: !allOn }));
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-50">
            <Shield className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <h3 className="text-foreground text-sm font-bold">Login Methods — Per-Role Control</h3>
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              Enable or disable each login method independently for customers, riders, and vendors.
              Click <strong>Save Changes</strong> at the top of the page to apply.
            </p>
          </div>
        </div>

        <div className="border-border overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-border border-b">
                <th className="text-muted-foreground w-1/2 px-4 py-2.5 text-left text-[11px] font-bold tracking-wide uppercase">
                  Auth Method
                </th>
                {ROLES.map((r) => (
                  <th
                    key={r.key}
                    className="text-muted-foreground px-3 py-2.5 text-center text-[11px] font-bold tracking-wide uppercase"
                  >
                    {r.emoji} {r.label}
                  </th>
                ))}
                <th className="text-muted-foreground px-3 py-2.5 text-center text-[11px] font-bold tracking-wide uppercase">
                  All
                </th>
              </tr>
            </thead>
            <tbody>
              {AUTH_METHODS.map((m, idx) => {
                const flags = parseRoleFlags(vals[m.key], m.default);
                const allOn = flags.customer && flags.rider && flags.vendor;
                const Icon = m.icon;
                return (
                  <tr
                    key={m.key}
                    className={`border-border border-b last:border-0 ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${m.bg}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${m.color}`} />
                        </div>
                        <div>
                          <p className="text-foreground text-xs font-semibold">{m.label}</p>
                          <p className="text-muted-foreground text-[10px]">{m.desc}</p>
                        </div>
                      </div>
                    </td>
                    {ROLES.map((r) => (
                      <td key={r.key} className="px-3 py-3 text-center">
                        <button
                          onClick={() => toggle(m.key, r.key, m.default)}
                          className={`focus:ring-primary relative h-5 w-10 rounded-full transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none ${flags[r.key] ? "bg-primary" : "bg-muted"}`}
                          title={`${flags[r.key] ? "Disable" : "Enable"} ${m.label} for ${r.label}`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-150 ${flags[r.key] ? "left-5" : "left-0.5"}`}
                          />
                        </button>
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggleAll(m.key, m.default)}
                        className={`focus:ring-primary relative h-5 w-10 rounded-full transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none ${allOn ? "bg-primary" : "bg-muted"}`}
                        title={
                          allOn
                            ? `Disable ${m.label} for all roles`
                            : `Enable ${m.label} for all roles`
                        }
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-150 ${allOn ? "left-5" : "left-0.5"}`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-muted-foreground mt-2 px-1 text-[10px]">
          💡 The <strong>All</strong> column toggles the method on or off for every role at once.
          Disabling all methods for a role will lock those users out — keep at least one enabled.
        </p>
      </div>

      <div className="border-border/50 flex flex-col items-center justify-center gap-4 border-t px-6 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
          <Shield className="h-6 w-6 text-red-500" />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-foreground text-sm font-bold">Advanced Security Settings</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Lockouts, blocked IPs, rate limits, GPS controls, fraud detection, and the admin audit
            log are in the dedicated Security Dashboard.
          </p>
        </div>
        <Link href="/security">
          <Button className="gap-2 rounded-xl" size="sm">
            <ExternalLink className="h-3.5 w-3.5" />
            Open Security Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
