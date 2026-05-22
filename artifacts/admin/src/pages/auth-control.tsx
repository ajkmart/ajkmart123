import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import {
  AlertTriangle,
  Clock3,
  GripVertical,
  KeyRound,
  RefreshCw,
  Save,
  Shield,
  Smartphone,
  UserCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const ROLES = ["customer", "rider", "vendor"] as const;
type Role = (typeof ROLES)[number];

type MethodKey =
  | "auth_phone_otp_enabled"
  | "auth_email_otp_enabled"
  | "auth_username_password_enabled"
  | "auth_google_enabled"
  | "auth_facebook_enabled"
  | "auth_magic_link_enabled"
  | "auth_biometric_enabled"
  | "auth_totp_enabled";

type MethodMatrix = Record<Exclude<MethodKey, "auth_totp_enabled">, Record<Role, boolean>> & {
  auth_totp_enabled: Record<Role, boolean>;
};

type AuthEvent = {
  id: string;
  timestamp: string;
  user: string | null;
  event_type: string;
  channel: string | null;
  role: Role | null;
  success: boolean;
  ip: string | null;
};

type LockedUser = {
  id: string;
  phone: string | null;
  email: string | null;
  attempts: number;
  locked_since: string | null;
};

type _PlatformSetting = { key: string; value: string };

const METHOD_ROWS: { key: MethodKey; label: string; platformKey?: string; note: string }[] = [
  {
    key: "auth_phone_otp_enabled",
    label: "Phone OTP",
    platformKey: "auth_phone_otp_enabled",
    note: "SMS / WhatsApp / console",
  },
  {
    key: "auth_email_otp_enabled",
    label: "Email OTP",
    platformKey: "auth_email_otp_enabled",
    note: "Email verification",
  },
  {
    key: "auth_username_password_enabled",
    label: "Username + Password",
    platformKey: "auth_username_password_enabled",
    note: "Traditional login",
  },
  {
    key: "auth_google_enabled",
    label: "Google Login",
    platformKey: "auth_google_enabled",
    note: "OAuth sign-in",
  },
  {
    key: "auth_facebook_enabled",
    label: "Facebook Login",
    platformKey: "auth_facebook_enabled",
    note: "OAuth sign-in",
  },
  {
    key: "auth_magic_link_enabled",
    label: "Magic Link",
    platformKey: "auth_magic_link_enabled",
    note: "Email link sign-in",
  },
  {
    key: "auth_biometric_enabled",
    label: "Biometric Login",
    platformKey: "auth_biometric_enabled",
    note: "Face ID / fingerprint",
  },
  { key: "auth_totp_enabled", label: "2FA / TOTP", note: "Always on; cannot be disabled" },
];

const defaultMatrix = (): MethodMatrix => ({
  auth_phone_otp_enabled: { customer: true, rider: true, vendor: true },
  auth_email_otp_enabled: { customer: true, rider: true, vendor: true },
  auth_username_password_enabled: { customer: true, rider: true, vendor: true },
  auth_google_enabled: { customer: false, rider: false, vendor: false },
  auth_facebook_enabled: { customer: false, rider: false, vendor: false },
  auth_magic_link_enabled: { customer: false, rider: false, vendor: false },
  auth_biometric_enabled: { customer: false, rider: false, vendor: false },
  auth_totp_enabled: { customer: true, rider: true, vendor: true },
});

const _parseRoleValue = (raw: string | undefined, fallback: boolean) => {
  const next = { customer: fallback, rider: fallback, vendor: fallback };
  if (!raw) return next;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<Role, string>>;
    return {
      customer: parsed.customer === "on",
      rider: parsed.rider === "on",
      vendor: parsed.vendor === "on",
    };
  } catch {
    const on = raw === "on";
    return { customer: on, rider: on, vendor: on };
  }
};

const serialiseRoleValue = (value: Record<Role, boolean>) =>
  JSON.stringify({
    customer: value.customer ? "on" : "off",
    rider: value.rider ? "on" : "off",
    vendor: value.vendor ? "on" : "off",
  });

const DragHandle = () => <GripVertical className="text-muted-foreground h-4 w-4" />;

export default function AuthControlPage() {
  const { toast } = useToast();
  const [_loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [_lockedLoading, setLockedLoading] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [matrix, setMatrix] = useState<MethodMatrix>(defaultMatrix());
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [lockedUsers, setLockedUsers] = useState<LockedUser[]>([]);
  const [eventType, setEventType] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState("");
  const [savedChannelOrder, setSavedChannelOrder] = useState(["whatsapp", "sms", "email"]);
  const [channelOrder, setChannelOrder] = useState(["whatsapp", "sms", "email"]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [methodsRes, settingsRes] = await Promise.all([
        adminFetch("/admin/auth/methods"),
        adminFetch("/platform-settings"),
      ]);
      const nextMatrix = defaultMatrix();
      Object.entries(methodsRes.methods ?? {}).forEach(([key, value]) => {
        if (key in nextMatrix)
          nextMatrix[key as keyof MethodMatrix] = {
            customer: Boolean((value as Record<string, boolean>).customer),
            rider: Boolean((value as Record<string, boolean>).rider),
            vendor: Boolean((value as Record<string, boolean>).vendor),
          } as never;
      });
      const map: Record<string, string> = {};
      for (const row of settingsRes.settings ?? []) map[row.key] = row.value;
      setMatrix(nextMatrix);
      setSettings(map);
      setSavedChannelOrder(
        (map["auth_otp_channel_order"] ?? "whatsapp,sms,email")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean) as [string, string, string]
      );
      setChannelOrder(
        (map["auth_otp_channel_order"] ?? "whatsapp,sms,email")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean) as [string, string, string]
      );
    } catch (e) {
      toast({
        title: "Failed to load auth control",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const params = new URLSearchParams();
      if (eventType) params.set("event_type", eventType);
      if (roleFilter) params.set("role", roleFilter);
      if (successFilter) params.set("success", successFilter);
      const data = await adminFetch(`/admin/auth/events?${params.toString()}`);
      setEvents(data.events ?? []);
    } catch (e) {
      toast({
        title: "Failed to load auth events",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setEventsLoading(false);
    }
  }, [eventType, roleFilter, successFilter, toast]);

  const loadLocked = useCallback(async () => {
    setLockedLoading(true);
    try {
      const data = await adminFetch("/admin/auth/locked-users");
      setLockedUsers(data.users ?? []);
    } catch (e) {
      toast({
        title: "Failed to load locked users",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setLockedLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);
  useEffect(() => {
    void loadLocked();
  }, [loadLocked]);

  const dirty = useMemo(() => {
    const current = JSON.stringify({ settings, matrix, channelOrder });
    const saved = JSON.stringify({ settings, matrix, channelOrder: savedChannelOrder });
    return current !== saved;
  }, [settings, matrix, channelOrder, savedChannelOrder]);

  const setCell = (method: MethodKey, role: Role, value: boolean) => {
    setMatrix((prev) => ({ ...prev, [method]: { ...prev[method], [role]: value } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Array<{ key: string; value: string }> = [];
      for (const row of METHOD_ROWS) {
        if (row.key === "auth_totp_enabled") continue;
        payload.push({ key: row.key, value: serialiseRoleValue(matrix[row.key]) });
      }
      payload.push({
        key: "auth_totp_enabled",
        value: serialiseRoleValue(matrix.auth_totp_enabled),
      });
      payload.push({ key: "auth_otp_channel_order", value: channelOrder.join(",") });
      await adminFetch("/admin/settings/auth-methods", {
        method: "PATCH",
        body: JSON.stringify({ settings: payload }),
      });
      setSavedChannelOrder(channelOrder.slice() as [string, string, string]);
      toast({ title: "Saved", description: "Auth control center updated" });
      await load();
      await loadEvents();
      await loadLocked();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const unlockUser = async (id: string) => {
    try {
      await adminFetch(`/admin/users/${id}/otp/attempts`, { method: "DELETE" });
      toast({ title: "Unlocked", description: "OTP attempts cleared" });
      await loadLocked();
    } catch (e) {
      toast({
        title: "Unlock failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const moveChannel = (from: number, to: number) => {
    const next = [...channelOrder];
    const item = next.splice(from, 1)[0]!;
    next.splice(to, 0, item);
    setChannelOrder(next as [string, string, string]);
  };

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <PageHeader
          title="Auth Control Center"
          subtitle="Unified auth, registration, OTP, and security controls."
        />
        <div className="flex items-center gap-3">
          <Button onClick={() => void load()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload
          </Button>
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
          <Badge variant="secondary" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Disabling all methods for a role will lock users out
          </Badge>
        </div>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            <h3 className="font-semibold">Auth Methods Matrix</h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Method</th>
                  {ROLES.map((role) => (
                    <th key={role} className="p-2 text-left capitalize">
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METHOD_ROWS.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-muted-foreground text-xs">{row.note}</div>
                    </td>
                    {ROLES.map((role) => {
                      const on = matrix[row.key][role];
                      const disabled = row.key === "auth_totp_enabled";
                      return (
                        <td key={role} className="p-2">
                          <button
                            disabled={disabled}
                            onClick={() => setCell(row.key, role, !on)}
                            className={`flex h-8 w-14 items-center rounded-full px-1 transition ${on ? "bg-emerald-500" : "bg-muted"} ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
                          >
                            <span
                              className={`h-6 w-6 rounded-full bg-white transition ${on ? "translate-x-6" : "translate-x-0"}`}
                            />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            <h3 className="font-semibold">Registration Settings</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["feature_new_users", "New user registration"],
                ["user_require_approval", "Customer auto-approval"],
                ["rider_auto_approve", "Rider auto-approval"],
                ["vendor_auto_approve", "Vendor auto-approval"],
              ] as [string, string][]
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-muted-foreground text-xs">Platform setting</div>
                </div>
                <button
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, [key]: prev[key] === "on" ? "off" : "on" }))
                  }
                  className={`flex h-8 w-14 items-center rounded-full px-1 ${settings[key] === "on" ? "bg-emerald-500" : "bg-muted"}`}
                >
                  <span
                    className={`h-6 w-6 rounded-full bg-white transition ${settings[key] === "on" ? "translate-x-6" : "translate-x-0"}`}
                  />
                </button>
              </div>
            ))}
            <div>
              <div className="mb-2 text-sm font-medium">Signup bonus amount (PKR)</div>
              <Input
                value={settings.customer_signup_bonus ?? "0"}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, customer_signup_bonus: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Welcome notification</div>
              <Textarea
                value={settings.auth_welcome_message ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, auth_welcome_message: e.target.value }))
                }
                rows={4}
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            <h3 className="font-semibold">OTP Channel & Delivery</h3>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {channelOrder.map((ch, index) => (
                <div
                  key={ch}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dragIndex != null && moveChannel(dragIndex, index)}
                  className="bg-muted/40 flex items-center gap-2 rounded-full border px-3 py-2"
                >
                  <DragHandle /> {ch.toUpperCase()}
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span>Console fallback (dev only)</span>
                <button
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      auth_otp_console_fallback:
                        prev.auth_otp_console_fallback === "on" ? "off" : "on",
                    }))
                  }
                  className={`flex h-8 w-14 items-center rounded-full px-1 ${settings.auth_otp_console_fallback === "on" ? "bg-emerald-500" : "bg-muted"}`}
                ></button>
              </div>
              {(
                [
                  ["auth_otp_login_ttl_min", "Login TTL"],
                  ["auth_otp_register_ttl_min", "Register TTL"],
                  ["auth_otp_reset_ttl_min", "Reset TTL"],
                  ["auth_otp_merge_ttl_min", "Merge TTL"],
                  ["auth_magic_link_ttl_min", "Magic Link TTL"],
                ] as [string, string][]
              ).map(([key, label]) => (
                <div key={key}>
                  <div className="mb-2 text-sm font-medium">{label} (min)</div>
                  <Input
                    value={settings[key] ?? ""}
                    onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <h3 className="font-semibold">Security & Rate Limits</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["security_login_max_attempts", "Max login attempts"],
                ["security_lockout_minutes", "Lockout duration (min)"],
                ["security_admin_token_hrs", "Admin session hours"],
                ["security_session_days", "Customer session days"],
                ["security_rider_token_days", "Rider token days"],
              ] as [string, string][]
            ).map(([key, label]) => (
              <div key={key}>
                <div className="mb-2 text-sm font-medium">{label}</div>
                <Input
                  value={settings[key] ?? ""}
                  onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="lg:col-span-3">
              <div className="mb-2 text-sm font-medium">Admin IP whitelist</div>
              <Textarea
                value={settings.security_admin_ip_whitelist ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, security_admin_ip_whitelist: e.target.value }))
                }
                rows={3}
                placeholder="10.0.0.0/8, 192.168.1.10"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span>Force 2FA for admins</span>
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    security_mfa_required: prev.security_mfa_required === "on" ? "off" : "on",
                  }))
                }
                className={`flex h-8 w-14 items-center rounded-full px-1 ${settings.security_mfa_required === "on" ? "bg-emerald-500" : "bg-muted"}`}
              ></button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span>Force 2FA for super-admins</span>
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    security_super_admin_mfa_required:
                      prev.security_super_admin_mfa_required === "on" ? "off" : "on",
                  }))
                }
                className={`flex h-8 w-14 items-center rounded-full px-1 ${settings.security_super_admin_mfa_required === "on" ? "bg-emerald-500" : "bg-muted"}`}
              ></button>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            <h3 className="font-semibold">Recent Auth Events</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="event type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
            <Input
              placeholder="role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            />
            <Input
              placeholder="success / failure"
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => void loadEvents()} disabled={eventsLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="p-2 text-left">Timestamp</th>
                  <th className="p-2 text-left">User</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Channel</th>
                  <th className="p-2 text-left">Role</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-t">
                    <td className="p-2">{new Date(ev.timestamp).toLocaleString()}</td>
                    <td className="p-2">{ev.user ?? "—"}</td>
                    <td className="p-2">{ev.event_type}</td>
                    <td className="p-2">{ev.channel ?? "—"}</td>
                    <td className="p-2 capitalize">{ev.role ?? "—"}</td>
                    <td className="p-2">
                      <Badge variant={ev.success ? "default" : "destructive"}>
                        {ev.success ? "success" : "failure"}
                      </Badge>
                    </td>
                    <td className="p-2">{ev.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <h3 className="font-semibold">Locked Out Users</h3>
          </div>
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="p-2 text-left">Phone / Email</th>
                  <th className="p-2 text-left">Attempts</th>
                  <th className="p-2 text-left">Locked Since</th>
                  <th className="p-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {lockedUsers.map((user) => (
                  <tr key={user.id} className="border-t">
                    <td className="p-2">{user.phone ?? user.email ?? "—"}</td>
                    <td className="p-2">{user.attempts}</td>
                    <td className="p-2">
                      {user.locked_since ? new Date(user.locked_since).toLocaleString() : "—"}
                    </td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" onClick={() => void unlockUser(user.id)}>
                        Unlock
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </ErrorBoundary>
  );
}
