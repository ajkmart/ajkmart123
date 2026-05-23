import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useAddOtpWhitelist,
  useDeleteOtpWhitelist,
  useOtpWhitelist,
  usePlatformSettings,
  useUpdateOtpWhitelist,
  useUpdatePlatformSettings,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  GripVertical,
  Info,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  UserX,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

const BYPASS_CODE_REGEX = /^[0-9]{6}$/;

interface ApiError {
  status?: number;
  message?: string;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value != null && ("status" in value || "message" in value);
}

function errorMessage(value: unknown, fallback = "Something went wrong"): string {
  if (isApiError(value) && typeof value.message === "string" && value.message.length > 0) {
    return value.message;
  }
  if (value instanceof Error) return value.message;
  return fallback;
}

async function api(method: string, path: string, body?: unknown) {
  try {
    return await adminFetch(path, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: unknown) {
    if (isApiError(e) && e.status === 401) return null;
    throw e;
  }
}

function useCountdown(targetIso: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetIso) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
      setRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function generateBypassCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

type OTPStatus = {
  isGloballyDisabled: boolean;
  disabledUntil: string | null;
  activeBypassCount: number;
};

type UserRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  otpBypassUntil: string | null;
};

type OtpWhitelistEntry = {
  id: string;
  identifier: string;
  label?: string;
  bypassCode: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

type OtpAuditEvent =
  | "admin_otp_bypass_set"
  | "admin_otp_bypass_cancel"
  | "admin_otp_generate"
  | "admin_otp_global_disable"
  | "admin_otp_global_restore"
  | "admin_clear_otp_attempts"
  | "login_otp_bypass"
  | "login_global_otp_bypass"
  | "otp_send_bypassed";

type AuditRow = {
  id: string;
  event: OtpAuditEvent;
  createdAt: string;
  ip: string;
  userId?: string | null;
  phone?: string | null;
  name?: string | null;
};

function isBypassActive(otpBypassUntil: string | null | undefined): boolean {
  if (!otpBypassUntil) return false;
  const ts = new Date(otpBypassUntil).getTime();
  if (Number.isNaN(ts)) return false;
  return ts > Date.now();
}

/* ── Design primitives ───────────────────────────────────────────────────── */

function ProCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border-border overflow-hidden rounded-2xl border bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon: Icon,
  label,
  sub,
  color,
  gradient,
}: {
  icon: ElementType;
  label: string;
  sub?: string;
  color: string;
  gradient: string;
}) {
  return (
    <div className={`border-border/60 border-b px-5 py-4 ${gradient}`}>
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${color} bg-white/60 backdrop-blur-sm`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-display text-sm leading-none font-bold text-gray-900">{label}</h3>
          {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  sub?: string;
  accent: string;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl border bg-white px-5 py-4 shadow-sm`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          {label}
        </p>
        <p className="font-display text-foreground mt-0.5 text-xl leading-tight font-bold">
          {value}
        </p>
        {sub && <p className="text-muted-foreground mt-0.5 text-[11px]">{sub}</p>}
      </div>
    </div>
  );
}

function AvatarInitial({ name }: { name: string | null }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-400 to-purple-500 text-xs font-bold text-white shadow-sm">
      {initials}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */

type _DeliveryOtpResult = {
  rideId: string;
  otp: string | null;
  otpVerified: boolean;
  displayStatus: "pending" | "used" | "expired";
  rideStatus: string;
  arrivedAt: string | null;
  createdAt: string;
  otpAttempts: {
    count: number;
    firstAt: string | null;
    expiresAt: string | null;
  };
};

export default function OtpControl() {
  const { toast } = useToast();

  const [status, setStatus] = useState<OTPStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const remaining = useCountdown(status?.disabledUntil ?? null);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [bypassMins, setBypassMins] = useState<Record<string, string>>({});
  const searchAbortRef = useRef<AbortController | null>(null);

  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  /* ── Global-suspension confirmation modal ── */
  const [suspendModal, setSuspendModal] = useState<{
    open: boolean;
    mins: number;
  }>({ open: false, mins: 0 });
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendPending, setSuspendPending] = useState(false);

  /* ── OTP Rate Limiting card ── */
  const { data: settingsData } = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();
  const getSetting = useCallback(
    (key: string, fallback: string) =>
      (settingsData?.settings ?? []).find((s: { key: string; value: string }) => s.key === key)
        ?.value ?? fallback,
    [settingsData?.settings]
  );
  const [rlPhone, setRlPhone] = useState("");
  const [rlIp, setRlIp] = useState("");
  const [rlWindow, setRlWindow] = useState("");
  const [rlSaving, setRlSaving] = useState(false);
  useEffect(() => {
    if (settingsData?.settings?.length > 0) {
      setRlPhone(getSetting("security_otp_max_per_phone", "5"));
      setRlIp(getSetting("security_otp_max_per_ip", "20"));
      setRlWindow(getSetting("security_otp_window_min", "60"));
    }
  }, [settingsData, getSetting]);

  /* ── Delivery OTP Viewer ── */
  const [rideIdInput, setRideIdInput] = useState("");
  const [otpLookupResult, setOtpLookupResult] = useState<{
    rideId: string;
    otp: string | null;
    otpStatus: "Pending" | "Used" | "Expired";
    createdAt: string;
    rideStatus: string;
  } | null>(null);
  const [otpLookupError, setOtpLookupError] = useState<string | null>(null);
  const [otpLookupLoading, setOtpLookupLoading] = useState(false);
  const [otpVisible, setOtpVisible] = useState(false);
  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const d = await api("GET", "/otp/status");
      if (d) setStatus(d as OTPStatus);
    } catch (_err) {
      toast({ title: "Failed to load OTP status", variant: "destructive" });
    } finally {
      setStatusLoading(false);
    }
  }, [toast]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const d = await api("GET", "/otp/audit?page=1");
      if (d?.entries) {
        setAuditRows((d.entries as AuditRow[]).slice(0, 20));
      }
    } catch (err) {
      toast({
        title: "Failed to load audit log",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAuditLoading(false);
    }
  }, [toast]);

  const loadRateLimits = useCallback(async () => {
    try {
      const d = await adminFetch("/platform-settings");
      const settings: Array<{ key: string; value: string }> = d?.settings ?? [];
      const get = (key: string, def: string) => settings.find((s) => s.key === key)?.value ?? def;
      const perPhone = get("security_otp_max_per_phone", "5");
      const perIp = get("security_otp_max_per_ip", "10");
      const winMin = get("security_otp_window_min", "10");
      setRlPhone(perPhone);
      setRlIp(perIp);
      setRlWindow(winMin);
    } catch (err) {
      console.warn("[otp-control] Failed to load rate-limit settings:", err);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadAudit();
    void loadRateLimits();
  }, [loadStatus, loadAudit, loadRateLimits]);

  useEffect(() => {
    if (status?.isGloballyDisabled && remaining === 0 && status.disabledUntil) {
      const t = setTimeout(loadStatus, 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [remaining, status?.isGloballyDisabled, status?.disabledUntil, loadStatus]);

  const openSuspendModal = (mins: number) => {
    if (!mins || mins <= 0) return;
    setSuspendReason("");
    setSuspendModal({ open: true, mins });
  };

  const confirmSuspend = async () => {
    if (!suspendReason.trim()) return;
    setSuspendPending(true);
    try {
      await api("POST", "/otp/disable", {
        minutes: suspendModal.mins,
        reason: suspendReason.trim(),
      });
      const mins = suspendModal.mins;
      const durationLabel =
        mins >= 60 && mins % 60 === 0
          ? `${mins / 60} hour(s)`
          : `${mins} minute(s)`;
      toast({
        title: "OTP Suspended",
        description: `All OTPs suspended for ${durationLabel}.`,
      });
      void loadStatus();
      void loadAudit();
      setSuspendModal({ open: false, mins: 0 });
      setSuspendReason("");
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: errorMessage(e, "Failed to suspend OTPs."),
        variant: "destructive",
      });
    } finally {
      setSuspendPending(false);
    }
  };

  const saveRateLimits = async () => {
    const phone = parseInt(rlPhone, 10);
    const ip = parseInt(rlIp, 10);
    const win = parseInt(rlWindow, 10);
    if (isNaN(phone) || phone < 1 || isNaN(ip) || ip < 1 || isNaN(win) || win < 1) {
      toast({
        title: "Invalid values",
        description: "All rate limit fields must be positive integers.",
        variant: "destructive",
      });
      return;
    }
    setRlSaving(true);
    try {
      await updateSettings.mutateAsync([
        { key: "security_otp_max_per_phone", value: String(phone) },
        { key: "security_otp_max_per_ip", value: String(ip) },
        { key: "security_otp_window_min", value: String(win) },
      ]);
      toast({
        title: "Rate limits saved",
        description: "OTP rate limiting settings updated.",
      });
    } catch (e: unknown) {
      toast({
        title: "Failed to save",
        description: errorMessage(e, "Could not update rate limit settings."),
        variant: "destructive",
      });
    } finally {
      setRlSaving(false);
    }
  };

  const lookupDeliveryOtp = async () => {
    const id = rideIdInput.trim();
    if (!id) return;
    setOtpLookupLoading(true);
    setOtpLookupError(null);
    setOtpLookupResult(null);
    setOtpVisible(false);
    try {
      const d = await api("GET", `/otp/delivery-otp/${encodeURIComponent(id)}`);
      if (d?.rideId || d?.otp !== undefined) {
        setOtpLookupResult(d);
      } else {
        setOtpLookupError(d?.error ?? "Ride not found.");
      }
    } catch (e: unknown) {
      if (isApiError(e) && e.status === 404) {
        setOtpLookupError("Ride not found. Check the Ride ID and try again.");
      } else {
        setOtpLookupError(errorMessage(e, "Failed to look up delivery OTP."));
      }
    } finally {
      setOtpLookupLoading(false);
    }
  };

  const searchUsers = useCallback(async () => {
    if (!query.trim() || query.trim().length < 2) return;
    searchAbortRef.current?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;
    setSearching(true);
    try {
      const d = await adminFetch(`/users/search?q=${encodeURIComponent(query)}&limit=20`, {
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      setUsers(
        (d?.users ?? []).map((u: UserRow) => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          email: u.email ?? null,
          otpBypassUntil: u.otpBypassUntil ?? null,
        }))
      );
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (isApiError(e) && (e as { name?: string }).name === "AbortError") return;
      toast({
        title: "Search failed",
        description: errorMessage(e, "Could not load users."),
        variant: "destructive",
      });
    } finally {
      if (searchAbortRef.current === ctrl) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  }, [query, toast]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) void searchUsers();
    }, 400);
    return () => clearTimeout(t);
  }, [query, searchUsers]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    []
  );

  const grantBypass = async (userId: string, mins: number) => {
    try {
      const d = await api("POST", `/users/${userId}/otp/bypass`, {
        minutes: mins,
      });
      if (d?.bypassUntil) {
        toast({
          title: "Bypass Granted",
          description: `OTP bypass active for ${mins} minute(s).`,
        });
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, otpBypassUntil: d.bypassUntil } : u))
        );
        void loadStatus();
      } else {
        toast({
          title: "Error",
          description: d?.error ?? "Failed",
          variant: "destructive",
        });
      }
    } catch (e: unknown) {
      if (isApiError(e) && e.status === 409) {
        toast({
          title: "Bypass already active",
          description: errorMessage(e, "User already has an active OTP bypass."),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Error",
        description: errorMessage(e, "Failed to grant bypass."),
        variant: "destructive",
      });
    }
  };

  const cancelBypass = async (userId: string) => {
    try {
      await api("DELETE", `/users/${userId}/otp/bypass`);
      toast({ title: "Bypass Removed" });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, otpBypassUntil: null } : u)));
      void loadStatus();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: errorMessage(e, "Failed to remove bypass."),
        variant: "destructive",
      });
    }
  };

  /* ── Generate OTP for user (support tool) ── */
  const [generatedOtp, setGeneratedOtp] = useState<{
    userId: string;
    code: string;
    copiedCode: boolean;
  } | null>(null);
  const [generatingOtpFor, setGeneratingOtpFor] = useState<string | null>(null);

  const generateUserOtp = async (userId: string) => {
    setGeneratingOtpFor(userId);
    try {
      const d = await api("POST", `/users/${userId}/otp/generate`);
      if (d?.otp || d?.code) {
        setGeneratedOtp({ userId, code: d.otp ?? d.code, copiedCode: false });
      } else {
        toast({
          title: "Error",
          description: d?.error ?? "Failed to generate OTP.",
          variant: "destructive",
        });
      }
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: errorMessage(e, "Failed to generate OTP."),
        variant: "destructive",
      });
    } finally {
      setGeneratingOtpFor(null);
    }
  };

  const copyOtpCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setGeneratedOtp((prev) => (prev ? { ...prev, copiedCode: true } : null));
      setTimeout(
        () => setGeneratedOtp((prev) => (prev ? { ...prev, copiedCode: false } : null)),
        2000
      );
    } catch (_e) {
      /* ignore */
    }
  };

  /* ── Unlock (clear OTP attempts) ── */
  const [unlockingFor, setUnlockingFor] = useState<string | null>(null);

  const clearOtpAttempts = async (userId: string, name: string | null) => {
    setUnlockingFor(userId);
    try {
      await api("DELETE", `/users/${userId}/otp/attempts`);
      toast({
        title: "User Unlocked",
        description: `OTP attempt counter cleared for ${name ?? "user"}.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: errorMessage(e, "Failed to clear attempts."),
        variant: "destructive",
      });
    } finally {
      setUnlockingFor(null);
    }
  };

  const eventLabel: Record<OtpAuditEvent, string> = {
    admin_otp_bypass_set: "Bypass granted",
    admin_otp_bypass_cancel: "Bypass revoked",
    admin_otp_generate: "OTP generated",
    admin_otp_global_disable: "OTP suspended",
    admin_otp_global_restore: "Suspension lifted",
    admin_clear_otp_attempts: "Rate-limit cleared",
    login_otp_bypass: "Per-user bypass used",
    login_global_otp_bypass: "Global bypass used",
    otp_send_bypassed: "OTP send bypassed",
  };

  const eventColors: Record<OtpAuditEvent, string> = {
    admin_otp_bypass_set: "bg-blue-500",
    admin_otp_bypass_cancel: "bg-gray-400",
    admin_otp_generate: "bg-purple-500",
    admin_otp_global_disable: "bg-orange-500",
    admin_otp_global_restore: "bg-green-500",
    admin_clear_otp_attempts: "bg-teal-500",
    login_otp_bypass: "bg-blue-400",
    login_global_otp_bypass: "bg-orange-400",
    otp_send_bypassed: "bg-purple-400",
  };

  const eventBadgeColors: Record<OtpAuditEvent, string> = {
    admin_otp_bypass_set: "bg-blue-50 text-blue-700 border-blue-200",
    admin_otp_bypass_cancel: "bg-gray-50 text-gray-600 border-gray-200",
    admin_otp_generate: "bg-purple-50 text-purple-700 border-purple-200",
    admin_otp_global_disable: "bg-orange-50 text-orange-700 border-orange-200",
    admin_otp_global_restore: "bg-green-50 text-green-700 border-green-200",
    admin_clear_otp_attempts: "bg-teal-50 text-teal-700 border-teal-200",
    login_otp_bypass: "bg-blue-50 text-blue-700 border-blue-200",
    login_global_otp_bypass: "bg-orange-50 text-orange-700 border-orange-200",
    otp_send_bypassed: "bg-purple-50 text-purple-700 border-purple-200",
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          OTP Control page crashed. Please reload.
        </div>
      }
    >
      <div className="max-w-4xl space-y-6">
        {/* ── Header ── */}
        <PageHeader
          icon={Shield}
          title="OTP Control Center"
          subtitle="Unified panel for all OTP settings — global suspension, per-user bypasses, and whitelist management."
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-700"
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void loadStatus();
                void loadAudit();
              }}
              disabled={statusLoading}
              className="gap-1.5 rounded-xl"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          }
        />

        {/* ── Dev-only: OTP bypass production warning ── */}
        {import.meta.env.DEV && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>Development mode:</strong> OTP bypass codes (including{" "}
              <code className="rounded bg-amber-100 px-1 font-mono">000000</code> and{" "}
              <code className="rounded bg-amber-100 px-1 font-mono">123456</code>) are blocked
              server-side in production. Bypass features here only work in development and staging
              environments.
            </span>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={status?.isGloballyDisabled ? ShieldOff : Shield}
            label="Global OTP"
            value={
              status == null ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                </span>
              ) : status.isGloballyDisabled ? (
                <span className="text-red-600">Suspended</span>
              ) : (
                <span className="text-green-600">Active</span>
              )
            }
            sub={
              status?.isGloballyDisabled && remaining > 0
                ? `Restores in ${fmtCountdown(remaining)}`
                : "All users must verify"
            }
            accent={
              status?.isGloballyDisabled ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
            }
          />
          <StatCard
            icon={Users}
            label="Active Bypasses"
            value={status == null ? "—" : status.activeBypassCount}
            sub="Users skipping OTP"
            accent="bg-blue-100 text-blue-600"
          />
          <StatCard
            icon={Activity}
            label="Audit Events"
            value={
              auditLoading ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                </span>
              ) : (
                auditRows.length
              )
            }
            sub="No-OTP logins recorded"
            accent="bg-purple-100 text-purple-600"
          />
        </div>

        {/* ── 1. GLOBAL SUSPENSION ── */}
        <ProCard>
          <CardHeader
            icon={ShieldOff}
            label="Global OTP Suspension"
            sub="Temporarily disable OTP for all users during SMS outages"
            color="text-indigo-600"
            gradient="bg-gradient-to-r from-indigo-50/80 to-slate-50"
          />
          <div className="space-y-4 p-5">
            {/* Status banner */}
            {status == null ? (
              <div className="bg-muted/30 border-border flex h-16 items-center justify-center rounded-xl border">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : status.isGloballyDisabled ? (
              <div className="flex items-center gap-4 rounded-xl border-2 border-red-200 bg-red-50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-red-800">OTPs are GLOBALLY SUSPENDED</p>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-red-200 px-2 py-0.5 font-mono text-xs font-bold text-red-800">
                      <Clock className="h-3 w-3" />
                      {fmtCountdown(remaining)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-red-600">
                    All users can log in without OTP. Auto-restores when the timer expires.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    api("DELETE", "/otp/disable")
                      .then(() => {
                        toast({
                          title: "OTPs Restored",
                          description: "Global OTP suspension lifted.",
                        });
                        void loadStatus();
                        void loadAudit();
                      })
                      .catch((e: unknown) => {
                        toast({
                          title: "Error",
                          description: errorMessage(e, "Failed to restore OTPs."),
                          variant: "destructive",
                        });
                      })
                  }
                  className="shrink-0 rounded-xl"
                >
                  Restore Now
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-green-800">OTPs are ACTIVE</p>
                  <p className="mt-0.5 text-xs text-green-600">
                    {status.activeBypassCount > 0
                      ? `${status.activeBypassCount} user(s) have per-user bypass active.`
                      : "All users must verify OTP on login."}
                  </p>
                </div>
              </div>
            )}

            {/* Info notice */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Use during SMS/OTP delivery outages. OTP verification auto-resumes when the timer
                expires. New registrations during suspension will have{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-[10px]">
                  is_verified = false
                </code>
                .
              </span>
            </div>

            {/* Suspend buttons */}
            <div>
              <p className="text-muted-foreground mb-2.5 text-[11px] font-semibold tracking-wider uppercase">
                Suspend for
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "30 min", mins: 30 },
                  { label: "1 hour", mins: 60 },
                  { label: "2 hours", mins: 120 },
                  { label: "24 hours", mins: 1440 },
                ].map((opt) => (
                  <button
                    key={opt.mins}
                    onClick={() => openSuspendModal(opt.mins)}
                    disabled={statusLoading}
                    className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    placeholder="Custom min"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    className="h-8 w-28 rounded-xl text-xs"
                    min={1}
                    max={10080}
                  />
                  <button
                    onClick={() => {
                      const m = parseInt(customMinutes, 10);
                      if (Number.isNaN(m) || m <= 0) {
                        toast({
                          title: "Invalid duration",
                          description: "Enter a whole number of minutes greater than 0.",
                          variant: "destructive",
                        });
                        return;
                      }
                      openSuspendModal(m);
                    }}
                    disabled={!customMinutes || statusLoading}
                    className="h-8 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    Suspend
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ProCard>

        {/* ── Suspension Confirmation Modal ── */}
        <Dialog
          open={suspendModal.open}
          onOpenChange={(open) => {
            if (!open && !suspendPending) setSuspendModal({ open: false, mins: 0 });
          }}
        >
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <ShieldOff className="h-5 w-5" /> Confirm Global OTP Suspension
              </DialogTitle>
            </DialogHeader>
            <div className="mt-1 space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">
                  You are about to suspend OTP verification for <strong>all users</strong> for{" "}
                  <strong>
                    {suspendModal.mins >= 60
                      ? `${suspendModal.mins / 60 === Math.floor(suspendModal.mins / 60) ? suspendModal.mins / 60 + " hour(s)" : suspendModal.mins + " minutes"}`
                      : `${suspendModal.mins} minute(s)`}
                  </strong>
                  . Users will be able to log in without receiving an OTP code.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold tracking-wider uppercase">
                  Reason for suspension <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="e.g. SMS gateway outage — Twilio down, users cannot receive OTP codes"
                  className="border-input bg-background h-24 w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-300 focus:outline-none"
                />
                <p className="text-muted-foreground text-[11px]">
                  This reason is written to the audit log and included in the admin notification.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setSuspendModal({ open: false, mins: 0 })}
                  disabled={suspendPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 gap-1.5 rounded-xl"
                  onClick={confirmSuspend}
                  disabled={!suspendReason.trim() || suspendPending}
                >
                  {suspendPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Suspending…
                    </>
                  ) : (
                    <>
                      <ShieldOff className="h-3.5 w-3.5" /> Confirm Suspension
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── 2. OTP CHANNEL PRIORITY ── */}
        <OtpChannelsSection />

        {/* ── 3. PER-USER BYPASS ── */}
        <ProCard>
          <CardHeader
            icon={Users}
            label="Per-User OTP Bypass"
            sub="Users here always skip OTP — highest-priority bypass, overrides global setting"
            color="text-blue-600"
            gradient="bg-gradient-to-r from-blue-50/80 to-slate-50"
          />
          <div className="space-y-4 p-5">
            {/* Search */}
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2" />
              {searching && (
                <Loader2 className="text-muted-foreground absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 animate-spin" />
              )}
              <Input
                className="h-10 rounded-xl pr-10 pl-10 text-sm focus-visible:ring-blue-400"
                placeholder="Search by name, phone, or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* Results */}
            {users.length > 0 && (
              <div className="space-y-2">
                {users.map((user) => {
                  const bypassActive = isBypassActive(user.otpBypassUntil);
                  return (
                    <div
                      key={user.id}
                      className={`rounded-xl border p-3.5 transition-colors ${bypassActive ? "border-blue-200 bg-blue-50/60" : "border-border bg-white"}`}
                    >
                      <div className="flex items-center gap-3">
                        <AvatarInitial name={user.name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-foreground text-sm font-semibold">
                              {user.name ?? "Unnamed"}
                            </p>
                            {bypassActive ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                                <UserCheck className="h-2.5 w-2.5" /> Bypass Active
                              </span>
                            ) : (
                              <span className="bg-muted text-muted-foreground border-border inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                                <UserX className="h-2.5 w-2.5" /> Normal OTP
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                            {user.phone ?? user.email ?? "—"}
                          </p>
                          {bypassActive && user.otpBypassUntil && (
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-green-700">
                              <Clock className="h-3 w-3" /> Until {fmtDate(user.otpBypassUntil)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="border-border/50 mt-3 space-y-2 border-t pt-3">
                        {/* Bypass row */}
                        <div className="flex flex-wrap gap-1.5">
                          {bypassActive ? (
                            <button
                              onClick={() => cancelBypass(user.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
                            >
                              <XCircle className="h-3 w-3" /> Remove Bypass
                            </button>
                          ) : (
                            <>
                              {[
                                { label: "15 min", mins: 15 },
                                { label: "1 hour", mins: 60 },
                                { label: "24 hrs", mins: 1440 },
                              ].map((opt) => (
                                <button
                                  key={opt.mins}
                                  onClick={() => grantBypass(user.id, opt.mins)}
                                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                                >
                                  {opt.label}
                                </button>
                              ))}
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  placeholder="min"
                                  value={bypassMins[user.id] ?? ""}
                                  onChange={(e) =>
                                    setBypassMins((p) => ({
                                      ...p,
                                      [user.id]: e.target.value,
                                    }))
                                  }
                                  className="h-7 w-16 rounded-lg text-xs"
                                  min={1}
                                />
                                <button
                                  onClick={() => {
                                    const m = parseInt(bypassMins[user.id] ?? "", 10);
                                    if (m > 0) void grantBypass(user.id, m);
                                  }}
                                  className="border-border text-foreground hover:bg-muted/40 h-7 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold transition-colors"
                                >
                                  Custom
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Support tools row */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <button
                            onClick={() => generateUserOtp(user.id)}
                            disabled={generatingOtpFor === user.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
                          >
                            {generatingOtpFor === user.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <KeyRound className="h-3 w-3" />
                            )}
                            Generate OTP
                          </button>
                          <button
                            onClick={() => clearOtpAttempts(user.id, user.name)}
                            disabled={unlockingFor === user.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60"
                          >
                            {unlockingFor === user.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Unlock className="h-3 w-3" />
                            )}
                            Unlock
                          </button>
                        </div>

                        {/* Generated OTP display */}
                        {generatedOtp?.userId === user.id && (
                          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                            <span className="text-[11px] font-medium text-emerald-700">
                              Generated OTP:
                            </span>
                            <span className="font-mono text-sm font-bold tracking-widest text-emerald-800">
                              {generatedOtp.code}
                            </span>
                            <button
                              onClick={() => copyOtpCode(generatedOtp.code)}
                              className="ml-auto shrink-0 rounded p-1 text-emerald-600 transition-colors hover:text-emerald-800"
                              title="Copy to clipboard"
                            >
                              {generatedOtp.copiedCode ? (
                                <CheckCheck className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <span className="text-[10px] text-emerald-600">Expires in 10 min</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!searching && query.trim().length >= 2 && users.length === 0 && (
              <div className="text-muted-foreground bg-muted/20 border-border rounded-xl border border-dashed py-8 text-center text-sm">
                No users found matching "{query}"
              </div>
            )}

            {!query.trim() && (
              <div className="text-muted-foreground bg-muted/10 border-border rounded-xl border border-dashed py-8 text-center text-sm">
                <Search className="text-muted-foreground/40 mx-auto mb-2 h-8 w-8" />
                Type at least 2 characters to search users
              </div>
            )}
          </div>
        </ProCard>

        {/* ── 3. AUDIT LOG ── */}
        <ProCard>
          <CardHeader
            icon={Activity}
            label="No-OTP Login Audit"
            sub="Every login that bypassed OTP, per-user or via global suspension"
            color="text-purple-600"
            gradient="bg-gradient-to-r from-purple-50/80 to-slate-50"
          />
          <div className="p-5">
            {auditLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading audit log…
              </div>
            ) : auditRows.length === 0 ? (
              <div className="text-muted-foreground bg-muted/10 border-border rounded-xl border border-dashed py-8 text-center text-sm">
                <Clock className="text-muted-foreground/40 mx-auto mb-2 h-8 w-8" />
                No no-OTP logins recorded yet
              </div>
            ) : (
              <div className="space-y-px">
                {auditRows.map((row, i) => (
                  <div
                    key={row.id}
                    className={`hover:bg-muted/30 flex items-center gap-3 px-3 py-2.5 text-xs transition-colors ${i === 0 ? "rounded-t-xl" : ""} ${i === auditRows.length - 1 ? "rounded-b-xl" : ""}`}
                  >
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${eventColors[row.event] ?? "bg-gray-400"}`}
                    />
                    <span className="text-muted-foreground hidden w-36 shrink-0 font-mono sm:block">
                      {fmtDate(row.createdAt)}
                    </span>
                    <ChevronRight className="text-muted-foreground/50 hidden h-3 w-3 shrink-0 sm:block" />
                    <span className="text-foreground flex-1 truncate font-semibold">
                      {row.name ?? row.phone ?? row.userId ?? "—"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${eventBadgeColors[row.event] ?? "bg-muted text-muted-foreground border-border"}`}
                    >
                      {eventLabel[row.event] ?? row.event}
                    </span>
                    <span className="text-muted-foreground hidden shrink-0 font-mono md:block">
                      {row.ip}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-border/50 mt-4 border-t pt-4">
              <button
                onClick={loadAudit}
                disabled={auditLoading}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
              >
                <RefreshCw className={`h-3 w-3 ${auditLoading ? "animate-spin" : ""}`} />
                Refresh log
              </button>
            </div>
          </div>
        </ProCard>

        {/* ── 4. RATE-LIMITED USERS ── */}
        <LockedUsersPanel />

        {/* ── 5. OTP RATE LIMITING ── */}
        <ProCard>
          <CardHeader
            icon={Gauge}
            label="OTP Rate Limiting"
            sub="Max OTP requests per phone/IP before the user is throttled"
            color="text-orange-600"
            gradient="bg-gradient-to-r from-orange-50/80 to-slate-50"
          />
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                  <span className="h-2 w-2 rounded-full bg-orange-400" />
                  Max per phone
                </label>
                <Input
                  type="number"
                  value={rlPhone}
                  onChange={(e) => setRlPhone(e.target.value)}
                  className="h-9 rounded-xl text-sm"
                  min={1}
                  max={100}
                  placeholder="5"
                />
                <p className="text-muted-foreground text-[10px]">OTPs per phone per window</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  Max per IP
                </label>
                <Input
                  type="number"
                  value={rlIp}
                  onChange={(e) => setRlIp(e.target.value)}
                  className="h-9 rounded-xl text-sm"
                  min={1}
                  max={500}
                  placeholder="20"
                />
                <p className="text-muted-foreground text-[10px]">OTPs per IP per window</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Window (minutes)
                </label>
                <Input
                  type="number"
                  value={rlWindow}
                  onChange={(e) => setRlWindow(e.target.value)}
                  className="h-9 rounded-xl text-sm"
                  min={1}
                  max={1440}
                  placeholder="60"
                />
                <p className="text-muted-foreground text-[10px]">Rolling window duration</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button
                size="sm"
                className="gap-1.5 rounded-xl bg-orange-600 text-white hover:bg-orange-700"
                onClick={saveRateLimits}
                disabled={rlSaving || updateSettings.isPending}
              >
                {rlSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save Rate Limits"
                )}
              </Button>
              <p className="text-muted-foreground text-xs">
                Changes apply to new OTP requests immediately.
              </p>
            </div>
          </div>
        </ProCard>

        {/* ── 5. DELIVERY OTP VIEWER ── */}
        <ProCard>
          <CardHeader
            icon={KeyRound}
            label="Delivery OTP Viewer"
            sub="Look up the current handover OTP for a ride or parcel delivery"
            color="text-teal-600"
            gradient="bg-gradient-to-r from-teal-50/80 to-slate-50"
          />
          <div className="space-y-4 p-5">
            <div className="flex gap-2">
              <Input
                className="h-10 flex-1 rounded-xl font-mono text-sm"
                placeholder="Enter Ride ID or Delivery ID…"
                value={rideIdInput}
                onChange={(e) => {
                  setRideIdInput(e.target.value);
                  setOtpLookupResult(null);
                  setOtpLookupError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void lookupDeliveryOtp();
                }}
              />
              <Button
                size="sm"
                className="h-10 gap-1.5 rounded-xl bg-teal-600 px-4 text-white hover:bg-teal-700"
                onClick={lookupDeliveryOtp}
                disabled={!rideIdInput.trim() || otpLookupLoading}
              >
                {otpLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Look Up"}
              </Button>
            </div>

            {otpLookupError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-800">{otpLookupError}</p>
              </div>
            )}

            {otpLookupResult && (
              <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
                    Ride {otpLookupResult.rideId}
                  </p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold ${
                      otpLookupResult.otpStatus === "Used"
                        ? "border-green-300 bg-green-100 text-green-700"
                        : otpLookupResult.otpStatus === "Expired"
                          ? "border-red-300 bg-red-100 text-red-700"
                          : "border-amber-300 bg-amber-100 text-amber-700"
                    }`}
                  >
                    {otpLookupResult.otpStatus}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-muted-foreground mb-1 text-[10px]">OTP Code</p>
                    {otpLookupResult.otp ? (
                      <div className="flex items-center gap-2">
                        <code
                          className={`rounded-lg border border-teal-300 bg-white px-3 py-1.5 font-mono text-xl font-bold tracking-[0.3em] text-teal-900 ${!otpVisible ? "blur-sm select-none" : ""}`}
                        >
                          {otpLookupResult.otp}
                        </code>
                        <button
                          onClick={() => setOtpVisible((v) => !v)}
                          className="border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
                          title={otpVisible ? "Hide OTP" : "Reveal OTP"}
                        >
                          {otpVisible ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm italic">No OTP generated</span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-muted-foreground mb-0.5 text-[10px]">Ride Status</p>
                    <p className="text-foreground text-xs font-semibold capitalize">
                      {otpLookupResult.rideStatus}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      {new Date(otpLookupResult.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!otpVisible && otpLookupResult.otp && (
                  <p className="flex items-center gap-1 text-[11px] text-teal-600">
                    <AlertTriangle className="h-3 w-3" /> Click the eye icon to reveal the OTP —
                    only do this when assisting a customer.
                  </p>
                )}
              </div>
            )}

            {!otpLookupResult && !otpLookupError && !otpLookupLoading && (
              <div className="text-muted-foreground bg-muted/10 border-border rounded-xl border border-dashed py-6 text-center text-sm">
                <KeyRound className="text-muted-foreground/40 mx-auto mb-2 h-8 w-8" />
                Enter a Ride ID above to look up its delivery OTP
              </div>
            )}
          </div>
        </ProCard>

        {/* ── 6. WHITELIST ── */}
        <WhitelistSection />
      </div>
    </ErrorBoundary>
  );
}

/* ── Rate-limited / locked users panel ──────────────────────────────────── */

type ThrottledEntry = {
  key: string;
  count: number;
  firstAt: string;
  expiresAt: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

function maskIdentifier(id: string): string {
  if (id.includes("@")) {
    const [local, domain] = id.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (id.length > 6) return `${id.slice(0, 4)}***${id.slice(-2)}`;
  return `${id.slice(0, 2)}***`;
}

function ExpiresIn({ iso }: { iso: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms <= 0) { setLabel("Expired"); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLabel(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return <span>{label}</span>;
}

function LockedUsersPanel() {
  const { toast } = useToast();
  const [throttled, setThrottled] = useState<ThrottledEntry[]>([]);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("GET", "/otp/rate-limited");
      if (d) {
        setThrottled((d.throttled as ThrottledEntry[]) ?? []);
        setMaxAttempts((d.maxAttempts as number) ?? 5);
      }
    } catch {
      /* silent — don't spam toasts on background poll */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    intervalRef.current = setInterval(() => void load(), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  async function unlock(entry: ThrottledEntry) {
    setUnlocking((prev) => new Set(prev).add(entry.key));
    try {
      await api("DELETE", "/otp/attempts/by-key", { key: entry.key });
      toast({
        title: "User Unlocked",
        description: `Rate-limit cleared for ${maskIdentifier(entry.key)}.`,
      });
      setThrottled((prev) => prev.filter((e) => e.key !== entry.key));
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: errorMessage(e, "Failed to clear rate-limit."),
        variant: "destructive",
      });
    } finally {
      setUnlocking((prev) => {
        const next = new Set(prev);
        next.delete(entry.key);
        return next;
      });
    }
  }

  const count = throttled.length;

  return (
    <ProCard>
      <div className="border-b border-border/60 bg-gradient-to-r from-rose-50/80 to-slate-50 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 text-rose-600 backdrop-blur-sm">
              <LockKeyhole className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold leading-none text-gray-900">
                Rate-Limited Users
              </h3>
              <p className="mt-0.5 text-[11px] text-gray-500">
                Identifiers currently throttled after {maxAttempts}+ failed OTP attempts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {count > 0 && (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
                {count} throttled
              </span>
            )}
            <button
              onClick={() => void load()}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {loading && throttled.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for throttled users…
          </div>
        ) : throttled.length === 0 ? (
          <div className="rounded-xl border border-dashed border-green-200 bg-green-50/40 py-8 text-center">
            <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-green-300" />
            <p className="text-sm font-medium text-green-700">No throttled users right now</p>
            <p className="mt-0.5 text-[11px] text-green-600">
              Auto-refreshes every 30 s · last checked {new Date().toLocaleTimeString()}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {throttled.map((entry) => {
              const isUnlocking = unlocking.has(entry.key);
              const displayName = entry.name ?? null;
              const displayId = entry.phone ?? entry.email ?? entry.key;
              const isKnownUser = !!entry.userId;

              return (
                <div
                  key={entry.key}
                  className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/40 px-4 py-3"
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600">
                    {isKnownUser
                      ? (displayName ?? "?")
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : "?"}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {displayName && (
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {displayName}
                        </span>
                      )}
                      {!isKnownUser && (
                        <span className="rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          Unregistered
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      <span className="font-mono">{maskIdentifier(displayId)}</span>
                      <span className="h-1 w-1 rounded-full bg-gray-300" />
                      <span>
                        <span className="font-semibold text-rose-600">{entry.count}</span> attempts
                      </span>
                      <span className="h-1 w-1 rounded-full bg-gray-300" />
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        <ExpiresIn iso={entry.expiresAt} />
                      </span>
                    </div>
                  </div>

                  {/* Attempt count badge */}
                  <div className="hidden shrink-0 sm:flex flex-col items-center">
                    <span className="rounded-lg bg-rose-100 border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700 tabular-nums">
                      {entry.count}/{maxAttempts}
                    </span>
                    <span className="mt-0.5 text-[9px] text-rose-400 uppercase tracking-wide">
                      attempts
                    </span>
                  </div>

                  {/* Unlock button */}
                  <button
                    onClick={() => void unlock(entry)}
                    disabled={isUnlocking}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:opacity-60"
                  >
                    {isUnlocking ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Unlock className="h-3 w-3" />
                    )}
                    Unlock
                  </button>
                </div>
              );
            })}

            <p className="pt-1 text-[11px] text-muted-foreground">
              Showing identifiers with ≥{maxAttempts} failed OTP attempts in the current window.
              Unlocking clears the counter immediately.
            </p>
          </div>
        )}
      </div>
    </ProCard>
  );
}

/* ── OTP Channel Priority (drag-and-drop reorder) ───────────────────────── */

type OtpChannel = "sms" | "whatsapp" | "email";

const CHANNEL_META: Record<
  OtpChannel,
  { label: string; desc: string; Icon: ElementType; dot: string; ring: string; badge: string }
> = {
  sms: {
    label: "SMS",
    desc: "Standard text message via your SMS provider",
    Icon: MessageSquare,
    dot: "bg-blue-500",
    ring: "border-blue-200 bg-blue-50",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
  },
  whatsapp: {
    label: "WhatsApp",
    desc: "WhatsApp Business API message",
    Icon: MessageCircle,
    dot: "bg-green-500",
    ring: "border-green-200 bg-green-50",
    badge: "bg-green-100 text-green-700 border-green-200",
  },
  email: {
    label: "Email",
    desc: "Email delivery — slowest but most reliable fallback",
    Icon: Mail,
    dot: "bg-orange-500",
    ring: "border-orange-200 bg-orange-50",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
  },
};

function OtpChannelsSection() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<OtpChannel[]>(["whatsapp", "sms", "email"]);
  const [saved, setSaved] = useState<OtpChannel[]>(["whatsapp", "sms", "email"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const d = await api("GET", "/otp/channels");
        if (d?.channels) {
          const ch = (d.channels as string[]).filter((c): c is OtpChannel =>
            ["sms", "whatsapp", "email"].includes(c)
          );
          setChannels(ch);
          setSaved(ch);
        }
      } catch {
        /* keep defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = channels.join(",") !== saved.join(",");

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const next = [...channels];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setChannels(next);
  }

  async function save() {
    setSaving(true);
    try {
      const d = await api("PATCH", "/otp/channels", { channels });
      if (d?.channels) {
        const ch = (d.channels as string[]).filter((c): c is OtpChannel =>
          ["sms", "whatsapp", "email"].includes(c)
        );
        setChannels(ch);
        setSaved(ch);
      } else {
        setSaved(channels);
      }
      toast({ title: "Channel order saved", description: `Priority: ${channels.join(" → ")}` });
    } catch (e: unknown) {
      toast({
        title: "Failed to save",
        description: errorMessage(e, "Could not update channel priority."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function revert() {
    setChannels([...saved]);
  }

  return (
    <ProCard>
      <div className="border-b border-border/60 bg-gradient-to-r from-sky-50/80 to-slate-50 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 text-sky-600 backdrop-blur-sm">
            <ListChecks className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold leading-none text-gray-900">
              OTP Channel Priority
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Drag to reorder. First channel is tried first; others are automatic fallbacks.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading channels…
          </div>
        ) : (
          <>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="otp-channels">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {channels.map((ch, idx) => {
                      const meta = CHANNEL_META[ch];
                      const isFirst = idx === 0;
                      return (
                        <Draggable key={ch} draggableId={ch} index={idx}>
                          {(prov, snapshot) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-shadow ${
                                snapshot.isDragging
                                  ? "shadow-lg ring-2 ring-sky-300 border-sky-200 bg-sky-50/60"
                                  : `${meta.ring} hover:shadow-sm`
                              }`}
                            >
                              {/* Drag handle */}
                              <div
                                {...prov.dragHandleProps}
                                className="shrink-0 cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing"
                                title="Drag to reorder"
                              >
                                <GripVertical className="h-5 w-5" />
                              </div>

                              {/* Position number */}
                              <div
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                  isFirst
                                    ? "bg-sky-600 text-white"
                                    : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {idx + 1}
                              </div>

                              {/* Channel icon */}
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${meta.ring}`}
                              >
                                <meta.Icon className={`h-4 w-4 ${isFirst ? "opacity-100" : "opacity-60"}`} />
                              </div>

                              {/* Label + desc */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {meta.label}
                                  </span>
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.badge}`}
                                  >
                                    {isFirst ? "Primary" : `Fallback ${idx + 1}`}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[11px] text-gray-400">{meta.desc}</p>
                              </div>

                              {/* Active dot */}
                              <div
                                className={`h-2 w-2 shrink-0 rounded-full ${meta.dot} ${
                                  isFirst ? "opacity-100" : "opacity-30"
                                }`}
                              />
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {/* Arrow flow summary */}
            <div className="mt-3 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span className="font-medium text-gray-600">Delivery order:</span>
              {channels.map((ch, idx) => (
                <span key={ch} className="flex items-center gap-1">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 font-semibold ${CHANNEL_META[ch].badge}`}
                  >
                    {CHANNEL_META[ch].label}
                  </span>
                  {idx < channels.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-gray-300" />
                  )}
                </span>
              ))}
            </div>

            {/* Actions */}
            {isDirty && (
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={revert}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Revert
                </button>
                <button
                  onClick={() => void save()}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3 w-3" />
                  )}
                  Save Order
                </button>
              </div>
            )}
            {!isDirty && (
              <p className="mt-3 text-right text-[11px] text-muted-foreground">
                Saved order: <span className="font-medium">{saved.join(" → ")}</span>
              </p>
            )}
          </>
        )}
      </div>
    </ProCard>
  );
}

/* ── Whitelist section ───────────────────────────────────────────────────── */

function WhitelistSection() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useOtpWhitelist();
  const addEntry = useAddOtpWhitelist();
  const updateEntry = useUpdateOtpWhitelist();
  const deleteEntry = useDeleteOtpWhitelist();

  const [identifier, setIdentifier] = useState("");
  const [label, setLabel] = useState("");
  const [bypassCode, setBypassCode] = useState(() => generateBypassCode());
  const [expiresAt, setExpiresAt] = useState("");
  const [adding, setAdding] = useState(false);

  const [bypassFeatureStatus, setBypassFeatureStatus] = useState<{
    whitelistEnabled: boolean;
    environment: string;
  } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    api("GET", "/otp/bypass-feature-status")
      .then((res) => {
        if (res && typeof res === "object" && "whitelistEnabled" in res) {
          setBypassFeatureStatus(res as { whitelistEnabled: boolean; environment: string });
        }
      })
      .catch(() => {});
  }, []);

  const entries: Array<OtpWhitelistEntry> = data?.entries ?? [];

  async function handleAdd() {
    if (!identifier.trim()) {
      toast({ title: "Identifier required", variant: "destructive" });
      return;
    }
    const code = bypassCode?.trim() || generateBypassCode();
    if (!BYPASS_CODE_REGEX.test(code)) {
      toast({
        title: "Invalid bypass code",
        description: "Use a 6-digit numeric code.",
        variant: "destructive",
      });
      return;
    }
    setAdding(true);
    try {
      await addEntry.mutateAsync({
        identifier: identifier.trim(),
        label: label.trim() || undefined,
        bypassCode: code,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      toast({
        title: "Added to whitelist",
        description: `Bypass code ${code} is active.`,
      });
      setIdentifier("");
      setLabel("");
      setBypassCode(generateBypassCode());
      setExpiresAt("");
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: errorMessage(e, "Could not add whitelist entry."),
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(entry: OtpWhitelistEntry) {
    try {
      await updateEntry.mutateAsync({
        id: entry.id,
        isActive: !entry.isActive,
      });
      toast({
        title: entry.isActive ? "Whitelist entry disabled" : "Whitelist entry enabled",
        description: entry.identifier,
      });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: errorMessage(e, "Could not update whitelist entry."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string, identifier: string) {
    if (!confirm(`Remove "${identifier}" from whitelist?`)) return;
    try {
      await deleteEntry.mutateAsync(id);
      toast({ title: "Removed from whitelist" });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: errorMessage(e, "Could not delete entry."),
        variant: "destructive",
      });
    }
  }

  const showDisabledBanner =
    !bannerDismissed &&
    bypassFeatureStatus !== null &&
    bypassFeatureStatus.environment === "production" &&
    !bypassFeatureStatus.whitelistEnabled;

  return (
    <ProCard>
      <CardHeader
        icon={ListChecks}
        label="OTP Whitelist"
        sub="Per-identity bypass — phones/emails that accept a fixed 6-digit code instead of real SMS"
        color="text-indigo-600"
        gradient="bg-gradient-to-r from-indigo-50/80 to-slate-50"
      />
      <div className="space-y-5 p-5">
        {/* Production disabled banner */}
        {showDisabledBanner && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="font-semibold">
                OTP whitelist bypass is disabled in production.
              </p>
              <p className="mt-0.5">
                Entries in this list will not be used to bypass OTP in the live environment. Set{" "}
                <code className="rounded bg-red-100 px-1 font-mono">ENABLE_OTP_BYPASS_PRODUCTION=true</code>{" "}
                in your server environment variables to re-enable.
              </p>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              className="ml-auto shrink-0 text-red-400 hover:text-red-600"
              aria-label="Dismiss banner"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Info */}
        <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
          <span>
            Perfect for App Store reviewers and testers. Identifiers here bypass real SMS and accept
            the configured 6-digit bypass code.
          </span>
        </div>

        {/* Add form */}
        <div className="border-border bg-muted/20 space-y-3 rounded-xl border p-4">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Add Entry
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Input
              className="h-9 rounded-xl text-sm"
              placeholder="Phone or email (identifier)"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <Input
              className="h-9 rounded-xl text-sm"
              placeholder="Label (e.g. Apple Reviewer)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <div className="relative">
              <Input
                className="h-9 rounded-xl pr-16 font-mono text-sm"
                placeholder="Bypass code (6 digits)"
                value={bypassCode}
                onChange={(e) => setBypassCode(e.target.value)}
              />
              <button
                onClick={() => setBypassCode(generateBypassCode())}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700"
              >
                New
              </button>
            </div>
            <Input
              className="h-9 rounded-xl text-sm"
              type="datetime-local"
              placeholder="Expires (optional)"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="h-9 w-full gap-1.5 rounded-xl"
            onClick={handleAdd}
            disabled={adding}
          >
            {adding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add to Whitelist
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading whitelist…
          </div>
        ) : entries.length === 0 ? (
          <div className="text-muted-foreground bg-muted/10 border-border rounded-xl border border-dashed py-8 text-center text-sm">
            <ListChecks className="text-muted-foreground/40 mx-auto mb-2 h-8 w-8" />
            No whitelist entries yet
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry: OtpWhitelistEntry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors ${
                  entry.isActive
                    ? "border-indigo-200 bg-indigo-50/50"
                    : "bg-muted/20 border-border opacity-60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-foreground truncate font-semibold">{entry.identifier}</p>
                    {entry.isActive ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {entry.label && (
                      <span className="text-muted-foreground text-xs">{entry.label}</span>
                    )}
                    <span className="border-border text-foreground rounded-md border bg-white px-1.5 py-0.5 font-mono text-[10px]">
                      {entry.bypassCode}
                    </span>
                    {entry.expiresAt && (
                      <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(entry.expiresAt) < new Date() ? (
                          <span className="font-medium text-red-500">Expired</span>
                        ) : (
                          `Expires ${new Date(entry.expiresAt).toLocaleDateString()}`
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleToggle(entry)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      entry.isActive
                        ? "border-border text-muted-foreground hover:bg-muted/40 bg-white"
                        : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                    }`}
                  >
                    {entry.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id, entry.identifier)}
                    className="border-border flex h-7 w-7 items-center justify-center rounded-lg border text-red-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-1">
          <button
            onClick={() => refetch()}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Refresh whitelist
          </button>
        </div>
      </div>
    </ProCard>
  );
}
