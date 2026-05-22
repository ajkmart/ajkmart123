import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { adminFetch } from "@/lib/adminFetcher";
import { getAdminTiming } from "@/lib/adminTiming";
import { safeCopyToClipboard } from "@/lib/safeClipboard";
import { useLanguage } from "@/lib/useLanguage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { ADMIN_SERVICE_LIST } from "@workspace/service-constants";
import {
  Activity,
  AppWindow,
  ArrowUpRight,
  Bus,
  CalendarDays,
  Car,
  Eye,
  EyeOff,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Mail,
  Package,
  Pencil,
  Pill,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ScrollText,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  UtensilsCrossed,
  Wallet,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";

type PlatformSetting = { key: string; value: string };

function getSettingValue(
  settings: PlatformSetting[] | undefined,
  key: string,
  fallback = ""
): string {
  if (!Array.isArray(settings)) return fallback;
  const row = settings.find((s) => s && typeof s === "object" && s.key === key);
  const v = row?.value;
  return typeof v === "string" ? v : fallback;
}

/* ── Types ── */
interface AdminAccount {
  id: string;
  name: string;
  role: string;
  permissions: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  username?: string | null;
  email?: string | null;
}

interface AdminSession {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt?: string | null;
  isCurrent?: boolean;
}

type AppManagementTab = "overview" | "admins" | "release-notes" | "sessions";

interface AdminFormBody {
  name: string;
  role: string;
  permissions: string;
  isActive: boolean;
  email?: string | null;
  secret?: string;
}
interface AppOverview {
  users: { total: number; active: number; banned: number };
  orders: { total: number; pending: number };
  rides: { total: number; active: number };
  pharmacy: { total: number };
  parcel: { total: number };
  adminAccounts: number;
  appStatus: string;
  appName: string;
  features: Record<string, string>;
}

const ADMIN_ROLES = [
  {
    val: "super",
    label: "Super Admin",
    desc: "Full access to everything",
    color: "bg-red-100 text-red-700",
  },
  {
    val: "manager",
    label: "Manager",
    desc: "Orders, rides, users",
    color: "bg-blue-100 text-blue-700",
  },
  {
    val: "finance",
    label: "Finance Admin",
    desc: "Transactions & wallet",
    color: "bg-green-100 text-green-700",
  },
  {
    val: "support",
    label: "Support Admin",
    desc: "Users & broadcast only",
    color: "bg-amber-100 text-amber-700",
  },
];

const PERMISSIONS = [
  "users",
  "orders",
  "rides",
  "pharmacy",
  "parcel",
  "products",
  "transactions",
  "settings",
  "broadcast",
  "flash-deals",
];

const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  mart: ShoppingCart,
  food: UtensilsCrossed,
  rides: Car,
  pharmacy: Pill,
  parcel: Package,
  van: Bus,
  wallet: Wallet,
};

const SERVICE_MAP: Array<{
  key: string;
  label: string;
  description: string;
  setting: string;
  color: string;
  colorLight: string;
  Icon: LucideIcon;
}> = [
  ...ADMIN_SERVICE_LIST.map((s) => ({
    key: s.key,
    label: s.label,
    description: s.description,
    setting: s.setting,
    color: s.color,
    colorLight: s.colorLight,
    Icon: SERVICE_ICON_MAP[s.key] ?? Activity,
  })),
  {
    key: "wallet",
    label: "Wallet",
    description: "Digital wallet for payments & transfers",
    setting: "feature_wallet",
    color: "#1A56DB",
    colorLight: "#E5EDFF",
    Icon: Wallet,
  },
];

const EMPTY_ADMIN = {
  name: "",
  email: "",
  secret: "",
  role: "manager",
  permissions: PERMISSIONS.join(","),
  isActive: true,
};

/* ── Sessions Tab Component ── */
function SessionsTab() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const { toast } = useToast();
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load sessions on mount
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await adminFetch("/auth/sessions");
      const raw: unknown = Array.isArray(data) ? data : (data?.sessions ?? []);
      setSessions(Array.isArray(raw) ? (raw as AdminSession[]) : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sessions";
      toast({ title: "Error loading sessions", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Remove a specific session
  const revokeSession = async (sessionId: string) => {
    try {
      await adminFetch(`/auth/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(sessions.filter((s) => s.id !== sessionId));
      toast({ title: "Session revoked" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke session";
      toast({ title: "Error revoking session", description: message, variant: "destructive" });
    }
  };

  // Revoke all sessions
  const revokeAllSessions = async () => {
    setConfirmRevokeAll(false);
    try {
      await adminFetch("/auth/sessions", { method: "DELETE" });
      setSessions([]);
      toast({
        title: "All sessions revoked - logging out...",
        description: "You will be redirected to login.",
      });
      redirectTimerRef.current = setTimeout(() => {
        window.location.href = `${import.meta.env.BASE_URL || "/"}login`;
      }, getAdminTiming().loginRedirectDelayMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke sessions";
      toast({ title: "Error revoking sessions", description: message, variant: "destructive" });
    }
  };

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);
  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    []
  );

  const formatTime = (isoDate: string | null) => {
    if (!isoDate) return "Never";
    return new Date(isoDate).toLocaleString("en-PK", {
      day: "numeric",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const parseUA = (ua: string) => {
    if (!ua) return "Unknown Device";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Mobile")) return "Mobile Browser";
    return "Browser";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Manage active admin sessions across all devices
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSessions}
            disabled={isLoading}
            className="h-9 gap-2 rounded-xl"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          {sessions.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmRevokeAll(true)}
              className="h-9 gap-2 rounded-xl bg-red-600 hover:bg-red-700"
            >
              <LogOut className="h-4 w-4" /> Sign out everywhere
            </Button>
          )}
        </div>
      </div>

      <Card className="border-border/50 overflow-hidden rounded-2xl">
        {isLoading ? (
          <div className="text-muted-foreground p-8 text-center">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="text-muted-foreground p-12 text-center">
            <Globe className="mx-auto mb-3 h-8 w-8 opacity-50" />
            <p>No active sessions</p>
          </div>
        ) : (
          <div className="divide-border/50 divide-y">
            {sessions.map((session) => {
              const isCurrentSession = session.isCurrent;
              return (
                <div
                  key={session.id}
                  className="hover:bg-muted/50 flex items-center justify-between p-4 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Globe className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                      <p className="text-sm font-semibold">
                        {parseUA(session.userAgent ?? "")}
                        {isCurrentSession && (
                          <Badge className="ml-2 bg-green-100 text-xs text-green-700">
                            Current Device
                          </Badge>
                        )}
                      </p>
                    </div>
                    <div className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                      <p className="truncate">IP: {session.ipAddress || "Unknown"}</p>
                      <p>Created: {formatTime(session.createdAt)}</p>
                      <p>Last used: {formatTime(session.lastUsedAt)}</p>
                      {session.expiresAt && (
                        <p className="text-yellow-600">Expires: {formatTime(session.expiresAt)}</p>
                      )}
                    </div>
                  </div>
                  {!isCurrentSession && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeSession(session.id)}
                      className="ml-2 h-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        onConfirm={revokeAllSessions}
        title="Revoke all sessions?"
        description="You will be logged out of all devices."
        confirmLabel="Revoke all"
        variant="destructive"
      />
    </div>
  );
}

export default function AppManagement() {
  const { language } = useLanguage();
  const _T = (key: TranslationKey) => tDual(key, language);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { state: authState } = useAdminAuth();
  const isSuperAdmin = authState.user?.role === "super";
  const [tab, setTab] = useState<AppManagementTab>("overview");
  const [adminForm, setAdminForm] = useState({ ...EMPTY_ADMIN });
  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
  const [adminDialog, setAdminDialog] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  /* ── Release Notes state ── */
  const [rnDialog, setRnDialog] = useState(false);
  const [editingRn, setEditingRn] = useState<any>(null);
  const [rnForm, setRnForm] = useState({
    version: "",
    releaseDate: new Date().toISOString().split("T")[0],
    notes: "",
    sortOrder: "0",
  });
  const [deleteRnTarget, setDeleteRnTarget] = useState<{ id: string; version: string } | null>(
    null
  );
  const [resetLinkAdmin, setResetLinkAdmin] = useState<{ id: string; email: string } | null>(null);

  /* ── Compliance settings state ── */
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [minAppVersion, setMinAppVersion] = useState("");
  const [termsVersion, setTermsVersion] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [playStoreUrl, setPlayStoreUrl] = useState("");

  /* ── Queries ── */
  const {
    data: overview,
    isLoading: overviewLoading,
    refetch: refetchOverview,
  } = useQuery<AppOverview>({
    queryKey: ["admin-app-overview"],
    queryFn: () => adminFetch("/app-overview"),
    refetchInterval: getAdminTiming().refetchIntervalAppManagementMs,
  });

  const {
    data: adminsData,
    isLoading: adminsLoading,
    refetch: refetchAdmins,
  } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => adminFetch("/admin-accounts"),
  });

  const { data: settingsData } = useQuery({
    queryKey: ["admin-platform-settings"],
    queryFn: () => adminFetch("/platform-settings"),
  });

  const {
    data: rnData,
    isLoading: rnLoading,
    refetch: _refetchRn,
  } = useQuery({
    queryKey: ["admin-release-notes"],
    queryFn: () => adminFetch("/release-notes"),
  });

  const admins: AdminAccount[] = adminsData?.accounts || [];
  const settings: any[] = settingsData?.settings || [];
  const appStatus = getSettingValue(settings, "app_status", "active");
  const releaseNotes: any[] = rnData?.releaseNotes || [];

  /* ── Sync compliance state from platform settings (in useEffect to avoid setState-in-render) ── */
  useEffect(() => {
    if (!settingsData?.settings) return;
    const s: any[] = settingsData.settings ?? [];
    const savedMinAppVersion = s.find((x: any) => x.key === "min_app_version")?.value || "";
    const savedTermsVersion = s.find((x: any) => x.key === "terms_version")?.value || "";
    const savedAppStoreUrl = s.find((x: any) => x.key === "app_store_url")?.value || "";
    const savedPlayStoreUrl = s.find((x: any) => x.key === "play_store_url")?.value || "";
    if (savedMinAppVersion) setMinAppVersion((prev) => prev || savedMinAppVersion);
    if (savedTermsVersion) setTermsVersion((prev) => prev || savedTermsVersion);
    if (savedAppStoreUrl) setAppStoreUrl((prev) => prev || savedAppStoreUrl);
    if (savedPlayStoreUrl) setPlayStoreUrl((prev) => prev || savedPlayStoreUrl);
  }, [settingsData]);

  /* ── Release Notes Mutations ── */
  const saveRn = useMutation({
    mutationFn: async (body: any) => {
      if (editingRn)
        return adminFetch(`/release-notes/${editingRn.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      return adminFetch("/release-notes", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-release-notes"] });
      setRnDialog(false);
      setEditingRn(null);
      setRnForm({
        version: "",
        releaseDate: new Date().toISOString().split("T")[0],
        notes: "",
        sortOrder: "0",
      });
      toast({ title: editingRn ? "Release note updated" : "Release note created" });
    },

    onError: (e: any) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const deleteRn = useMutation({
    mutationFn: (id: string) => adminFetch(`/release-notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-release-notes"] });
      toast({ title: "Release note deleted" });
    },
  });

  const openNewRn = () => {
    setEditingRn(null);
    setRnForm({
      version: "",
      releaseDate: new Date().toISOString().split("T")[0],
      notes: "",
      sortOrder: "0",
    });
    setRnDialog(true);
  };

  const openEditRn = (rn: any) => {
    setEditingRn(rn);
    setRnForm({
      version: rn.version,
      releaseDate: rn.releaseDate ?? new Date().toISOString().split("T")[0],
      notes: Array.isArray(rn.notes) ? rn.notes.join("\n") : (rn.notes ?? ""),
      sortOrder: String(rn.sortOrder ?? 0),
    });
    setRnDialog(true);
  };

  const submitRn = () => {
    if (!rnForm.version.trim()) {
      toast({ title: "Version required", variant: "destructive" });
      return;
    }
    if (!rnForm.notes.trim()) {
      toast({ title: "Release notes required", variant: "destructive" });
      return;
    }
    const notesArr = rnForm.notes
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedSortOrder = parseInt(rnForm.sortOrder);
    saveRn.mutate({
      version: rnForm.version.trim(),
      releaseDate: rnForm.releaseDate,
      notes: notesArr,
      sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0,
    });
  };

  /* ── Compliance settings save ── */
  const handleComplianceSave = async () => {
    setComplianceSaving(true);
    try {
      const pairs = [
        { key: "min_app_version", value: minAppVersion.trim() || "1.0.0" },
        { key: "terms_version", value: termsVersion.trim() || "1.0" },
        { key: "app_store_url", value: appStoreUrl.trim() },
        { key: "play_store_url", value: playStoreUrl.trim() },
      ].filter((p) => p.value !== "");
      await adminFetch("/platform-settings", {
        method: "PUT",
        body: JSON.stringify({ settings: pairs }),
      });
      void qc.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      toast({ title: "Compliance settings saved" });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setComplianceSaving(false);
  };

  /* ── Admin Mutations ── */
  const saveAdmin = useMutation({
    mutationFn: async (body: any) => {
      if (editingAdmin)
        return adminFetch(`/admin-accounts/${editingAdmin.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      return adminFetch("/admin-accounts", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-accounts"] });
      void qc.invalidateQueries({ queryKey: ["admin-app-overview"] });
      setAdminDialog(false);
      setEditingAdmin(null);
      setAdminForm({ ...EMPTY_ADMIN });
      toast({ title: editingAdmin ? "Admin updated" : "Admin account created" });
    },
    onError: (e: any) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const deleteAdmin = useMutation({
    mutationFn: (id: string) => adminFetch(`/admin-accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-accounts"] });
      toast({ title: "Admin removed" });
    },
  });

  const toggleAdmin = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/admin-accounts/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-accounts"] }),
  });

  /* ── Send password-reset link (super-admin only) ──
     Calls POST /api/admin/admin-accounts/:id/send-reset-link which issues a
     fresh single-use token (existing tokens for that account are invalidated
     server-side) and emails it. In non-prod, the API echoes back resetUrl so
     a super-admin can copy it directly when SMTP isn't configured. */
  const sendResetLink = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/admin-accounts/${id}/send-reset-link`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async (data: { resetUrl?: string } | null | undefined) => {
      const resetUrl: string | undefined = data?.resetUrl;
      if (resetUrl) {
        // Surface clipboard failure: the toast previously claimed the link
        // was copied even when the browser blocked the write.
        const result = await safeCopyToClipboard(resetUrl);
        toast({
          title: result.ok ? "Reset link generated" : "Reset link generated (copy failed)",
          description: result.ok
            ? "Email sent. Link copied to clipboard for your records."
            : "Email sent, but the link could not be copied automatically — open the audit log to retrieve it.",
          variant: result.ok ? undefined : "destructive",
        });
      } else {
        toast({
          title: "Reset link sent",
          description: "An email with the reset link is on its way.",
        });
      }
    },
    onError: (e: unknown) => {
      const message =
        e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Please try again.";
      toast({
        title: "Could not send reset link",
        description: message,
        variant: "destructive",
      });
    },
  });

  /* ── Maintenance mode ──
   *  Editing of `app_status` is now consolidated under
   *  /settings/general (single edit surface — see SETTINGS_MAP.md).
   *  The previous inline mutation handler has been removed; both the
   *  status banner and the dedicated tab now route to the canonical
   *  Settings editor instead of writing the setting from this page.
   */

  /* ── Form handlers ── */
  const openNewAdmin = () => {
    setEditingAdmin(null);
    setAdminForm({ ...EMPTY_ADMIN });
    setShowSecret(false);
    setAdminDialog(true);
  };
  const openEditAdmin = (a: AdminAccount) => {
    setEditingAdmin(a);
    setAdminForm({
      name: a.name,
      email: a.email ?? "",
      secret: "",
      role: a.role,
      permissions: a.permissions,
      isActive: a.isActive,
    });
    setShowSecret(false);
    setAdminDialog(true);
  };
  const togglePermission = (p: string) => {
    const perms = adminForm.permissions.split(",").filter(Boolean);
    const next = perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p];
    setAdminForm((f) => ({ ...f, permissions: next.join(",") }));
  };

  const submitAdmin = () => {
    if (!adminForm.name) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!editingAdmin && !adminForm.secret) {
      toast({ title: "Secret required", variant: "destructive" });
      return;
    }
    const trimmedEmail = adminForm.email.trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({
        title: "Invalid email",
        description: "Enter a valid email or leave it blank.",
        variant: "destructive",
      });
      return;
    }
    const body: AdminFormBody = {
      name: adminForm.name,
      role: adminForm.role,
      permissions: adminForm.permissions,
      isActive: adminForm.isActive,
    };
    if (trimmedEmail) body.email = trimmedEmail;
    else if (editingAdmin) body.email = null;
    if (adminForm.secret) body.secret = adminForm.secret;
    saveAdmin.mutate(body);
  };

  const roleCfg = (role: string) => ADMIN_ROLES.find((r) => r.val === role) || ADMIN_ROLES[1]!;

  /* ── Stat Card ── */
  function StatCard({ icon: Icon, label, value, sub, color }: any) {
    return (
      <div className="border-border/50 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="font-display mt-3 text-2xl font-bold">{value}</p>
        <p className="text-muted-foreground text-sm">{label}</p>
        {sub && <p className="text-muted-foreground/70 mt-0.5 text-xs">{sub}</p>}
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          App Management page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={AppWindow}
          title="App Management"
          subtitle="Control the entire app — status, admins, services"
          iconBgClass="bg-slate-100"
          iconColorClass="text-slate-600"
          actions={
            <div className="flex gap-2">
              {tab === "admins" && (
                <Button onClick={openNewAdmin} className="h-10 gap-2 rounded-xl">
                  <Plus className="h-4 w-4" /> New Admin
                </Button>
              )}
              <Link
                href="/audit-logs"
                className="border-border bg-background text-foreground hover:bg-muted inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors"
              >
                <ScrollText className="h-4 w-4" /> View Full Audit Log →
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  void refetchOverview();
                  void refetchAdmins();
                }}
                className="h-10 gap-2 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          }
        />

        {/* App Status Banner — always-visible read-only summary. Editing lives at /settings/general. */}
        <div
          className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${appStatus === "maintenance" ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50"}`}
        >
          <WrenchIcon
            className={`h-6 w-6 flex-shrink-0 ${appStatus === "maintenance" ? "text-amber-600" : "text-green-600"}`}
          />
          <div className="flex-1">
            <p
              className={`font-bold ${appStatus === "maintenance" ? "text-amber-800" : "text-green-800"}`}
            >
              {appStatus === "maintenance"
                ? "Maintenance Mode is ON — users blocked"
                : "App is Live — all systems normal"}
            </p>
            <p
              className={`text-sm ${appStatus === "maintenance" ? "text-amber-700" : "text-green-700"}`}
            >
              {appStatus === "maintenance"
                ? "The customer apps are showing a maintenance screen. Go to Settings → General to bring the app back online."
                : "Customers can access all services normally. Toggle maintenance mode in Settings → General if you need downtime."}
            </p>
          </div>
          <Link
            href="/settings/general"
            className={`admin-focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 ${appStatus === "maintenance" ? "bg-amber-700" : "bg-green-700"}`}
          >
            {appStatus === "maintenance" ? "Go Live in Settings" : "Manage in Settings"}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {/* Tabs — scrollable on mobile */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="bg-muted flex w-max min-w-full gap-1 rounded-xl p-1">
            {(
              [
                { id: "overview", label: "Overview", Icon: LayoutDashboard },
                { id: "admins", label: "Admin Accounts", Icon: Users },
                { id: "release-notes", label: "Release Notes", Icon: Rocket },
                { id: "sessions", label: "Active Sessions", Icon: Globe },
              ] as { id: AppManagementTab; label: string; Icon: LucideIcon }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all ${tab === t.id ? "text-foreground bg-white shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <t.Icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══ Overview Tab ══ */}
        {tab === "overview" && (
          <div className="space-y-5">
            {overviewLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-muted h-28 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  <StatCard
                    icon={Users}
                    label="Total Users"
                    value={overview?.users.total ?? 0}
                    sub={`${overview?.users.active} active · ${overview?.users.banned} banned`}
                    color="bg-blue-100 text-blue-600"
                  />
                  <StatCard
                    icon={ShoppingBag}
                    label="Total Orders"
                    value={overview?.orders.total ?? 0}
                    sub={`${overview?.orders.pending} pending`}
                    color="bg-indigo-100 text-indigo-600"
                  />
                  <StatCard
                    icon={Car}
                    label="Total Rides"
                    value={overview?.rides.total ?? 0}
                    sub={`${overview?.rides.active} active now`}
                    color="bg-green-100 text-green-600"
                  />
                  <StatCard
                    icon={Pill}
                    label="Pharmacy Orders"
                    value={overview?.pharmacy.total ?? 0}
                    sub="all time"
                    color="bg-pink-100 text-pink-600"
                  />
                  <StatCard
                    icon={Package}
                    label="Parcel Bookings"
                    value={overview?.parcel.total ?? 0}
                    sub="all time"
                    color="bg-orange-100 text-orange-600"
                  />
                  <StatCard
                    icon={Shield}
                    label="Admin Accounts"
                    value={overview?.adminAccounts ?? 0}
                    sub="active sub-admins"
                    color="bg-violet-100 text-violet-600"
                  />
                </div>

                {/* Feature status grid */}
                <Card className="border-border/50 rounded-2xl">
                  <div className="border-border/50 flex items-center gap-3 border-b p-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                      <Activity className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="font-bold">Service Status</h2>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Live status of all app services
                      </p>
                    </div>
                  </div>
                  <CardContent className="p-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {SERVICE_MAP.map((svc) => {
                        const featureVal = getSettingValue(settings, svc.setting, "on");
                        const isOn = featureVal === "on";
                        return (
                          <div
                            key={svc.key}
                            className={`relative overflow-hidden rounded-xl border p-4 transition-all ${isOn ? "border-green-200 bg-gradient-to-br from-green-50 to-emerald-50" : "border-red-200 bg-gradient-to-br from-red-50 to-rose-50"}`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${isOn ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"}`}
                              >
                                <svc.Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold">{svc.label}</p>
                                <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                                  {svc.description}
                                </p>
                                <div className="mt-2 flex items-center gap-1.5">
                                  <span
                                    className={`h-2 w-2 rounded-full ${isOn ? "animate-pulse bg-green-500" : "bg-red-400"}`}
                                  />
                                  <span
                                    className={`text-xs font-bold ${isOn ? "text-green-600" : "text-red-500"}`}
                                  >
                                    {isOn ? "Online" : "Offline"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ══ Admin Accounts Tab ══ */}
        {tab === "admins" && (
          <div className="space-y-4">
            {/* Master Admin info */}
            <Card className="rounded-2xl border-red-200 bg-red-50/50">
              <CardContent className="flex items-start gap-3 p-4">
                <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                <div>
                  <p className="font-bold text-red-800">Super Admin (Master)</p>
                  <p className="text-sm text-red-700">
                    Secret stored in env var{" "}
                    <code className="rounded bg-red-100 px-1">ADMIN_SECRET</code>. Full access to
                    all features. Cannot be managed here.
                  </p>
                </div>
              </CardContent>
            </Card>

            {adminsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-muted h-20 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : admins.length === 0 ? (
              <Card className="border-border/50 rounded-2xl">
                <CardContent className="p-12 text-center">
                  <Users className="text-muted-foreground/30 mx-auto mb-3 h-12 w-12" />
                  <p className="text-muted-foreground font-medium">No sub-admin accounts yet</p>
                  <p className="text-muted-foreground/60 mt-1 text-sm">
                    Create accounts for managers, support, finance staff
                  </p>
                  <Button onClick={openNewAdmin} className="mt-4 gap-2 rounded-xl">
                    <Plus className="h-4 w-4" />
                    Add Admin Account
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {admins.map((a) => {
                  const cfg = roleCfg(a.role);
                  return (
                    <Card key={a.id} className="border-border/50 rounded-2xl shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-600">
                            {a.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-foreground font-bold">{a.name}</p>
                              <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                                {cfg.label}
                              </Badge>
                              {!a.isActive && (
                                <Badge
                                  variant="outline"
                                  className="bg-gray-100 text-xs text-gray-500"
                                >
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3">
                              <p className="text-muted-foreground text-xs">
                                Permissions:{" "}
                                {a.permissions
                                  ? a.permissions.split(",").slice(0, 4).join(", ") +
                                    (a.permissions.split(",").length > 4
                                      ? `... +${a.permissions.split(",").length - 4} more`
                                      : "")
                                  : "all"}
                              </p>
                            </div>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              Last login:{" "}
                              {a.lastLoginAt
                                ? new Date(a.lastLoginAt).toLocaleString("en-PK", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Never"}
                            </p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <button
                              onClick={() =>
                                toggleAdmin.mutate({ id: a.id, isActive: !a.isActive })
                              }
                              className="hover:bg-muted rounded-lg p-2"
                              title={a.isActive ? "Deactivate" : "Activate"}
                            >
                              {a.isActive ? (
                                <ToggleRight className="h-5 w-5 text-green-600" />
                              ) : (
                                <ToggleLeft className="text-muted-foreground h-5 w-5" />
                              )}
                            </button>
                            {isSuperAdmin && (
                              <button
                                onClick={() => {
                                  if (!a.email) {
                                    toast({
                                      title: "No email on file",
                                      description:
                                        "Add an email to this admin before sending a reset link.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  setResetLinkAdmin({ id: a.id, email: a.email });
                                }}
                                disabled={sendResetLink.isPending}
                                className="rounded-lg p-2 hover:bg-amber-50 disabled:opacity-50"
                                title={
                                  a.email
                                    ? `Send reset link to ${a.email}`
                                    : "Admin has no email on file"
                                }
                                data-testid={`button-send-reset-link-${a.id}`}
                              >
                                <Mail className="h-4 w-4 text-amber-600" />
                              </button>
                            )}
                            <button
                              onClick={() => openEditAdmin(a)}
                              className="hover:bg-muted rounded-lg p-2"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </button>
                            <button
                              onClick={() => deleteAdmin.mutate(a.id)}
                              className="rounded-lg p-2 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ Release Notes Tab ══ */}
        {tab === "release-notes" && (
          <div className="space-y-5">
            {/* Compliance Settings */}
            <Card className="border-border/50 rounded-2xl shadow-sm">
              <div className="border-border/50 flex items-center gap-3 border-b p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100">
                  <Smartphone className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="font-bold">App Version Compliance</h2>
                  <p className="text-muted-foreground text-xs">
                    Force-update enforcement and terms versioning
                  </p>
                </div>
              </div>
              <CardContent className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Minimum Required Version</label>
                    <Input
                      placeholder="e.g. 1.2.0"
                      value={minAppVersion}
                      onChange={(e) => setMinAppVersion(e.target.value)}
                      className="h-10 rounded-xl font-mono"
                    />
                    <p className="text-muted-foreground text-xs">
                      Users on older versions will be forced to update
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Terms Version</label>
                    <Input
                      placeholder="e.g. 2.0"
                      value={termsVersion}
                      onChange={(e) => setTermsVersion(e.target.value)}
                      className="h-10 rounded-xl font-mono"
                    />
                    <p className="text-muted-foreground text-xs">
                      Changing this forces users to re-accept T&amp;Cs
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">App Store URL (iOS)</label>
                    <Input
                      placeholder="https://apps.apple.com/..."
                      value={appStoreUrl}
                      onChange={(e) => setAppStoreUrl(e.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Play Store URL (Android)</label>
                    <Input
                      placeholder="https://play.google.com/store/apps/..."
                      value={playStoreUrl}
                      onChange={(e) => setPlayStoreUrl(e.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleComplianceSave}
                  disabled={complianceSaving}
                  className="gap-2 rounded-xl"
                >
                  <Save className="h-4 w-4" />
                  {complianceSaving ? "Saving..." : "Save Compliance Settings"}
                </Button>
              </CardContent>
            </Card>

            {/* Release Notes List */}
            <Card className="border-border/50 rounded-2xl shadow-sm">
              <div className="border-border/50 flex items-center justify-between border-b p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                    <FileText className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="font-bold">What's New — Release Notes</h2>
                    <p className="text-muted-foreground text-xs">Shown to users after app update</p>
                  </div>
                </div>
                <Button onClick={openNewRn} className="h-9 gap-2 rounded-xl text-sm">
                  <Plus className="h-4 w-4" /> Add Release
                </Button>
              </div>
              <CardContent className="p-5">
                {rnLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-muted h-16 animate-pulse rounded-xl" />
                    ))}
                  </div>
                ) : releaseNotes.length === 0 ? (
                  <div className="py-12 text-center">
                    <FileText className="text-muted-foreground/30 mx-auto mb-3 h-10 w-10" />
                    <p className="text-muted-foreground text-sm">
                      No release notes yet. Add your first one!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {releaseNotes.map((rn: any) => (
                      <div
                        key={rn.id}
                        className="border-border/50 hover:bg-muted/20 rounded-xl border p-4 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="border-purple-200 bg-purple-50 font-mono text-xs text-purple-700"
                              >
                                v{rn.version}
                              </Badge>
                              {rn.releaseDate && (
                                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                                  <CalendarDays className="h-3 w-3" /> {rn.releaseDate}
                                </span>
                              )}
                            </div>
                            <ul className="space-y-1">
                              {(Array.isArray(rn.notes) ? rn.notes : [])
                                .slice(0, 3)
                                .map((note: string, i: number) => (
                                  <li
                                    key={i}
                                    className="text-muted-foreground flex items-start gap-1.5 text-xs"
                                  >
                                    <span className="mt-0.5 text-purple-500">•</span>
                                    <span className="line-clamp-1">{note}</span>
                                  </li>
                                ))}
                              {Array.isArray(rn.notes) && rn.notes.length > 3 && (
                                <li className="text-muted-foreground/60 text-xs">
                                  +{rn.notes.length - 3} more
                                </li>
                              )}
                            </ul>
                          </div>
                          <div className="flex flex-shrink-0 gap-2">
                            <button
                              onClick={() => openEditRn(rn)}
                              className="hover:bg-muted text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteRnTarget({ id: rn.id, version: rn.version })}
                              className="text-muted-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ Release Notes Dialog ══ */}
        <Dialog
          open={rnDialog}
          onOpenChange={(v) => {
            setRnDialog(v);
            if (!v) {
              setEditingRn(null);
            }
          }}
        >
          <DialogContent className="max-h-[90dvh] w-[95vw] max-w-lg overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-600" />
                {editingRn ? "Edit Release Notes" : "Add Release Notes"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">
                    Version <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. 1.2.0"
                    value={rnForm.version}
                    onChange={(e) => setRnForm((f) => ({ ...f, version: e.target.value }))}
                    className="h-10 rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Release Date</label>
                  <Input
                    type="date"
                    value={rnForm.releaseDate}
                    onChange={(e) => setRnForm((f) => ({ ...f, releaseDate: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Release Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  placeholder={
                    "One note per line:\nNew feature added\nBug fix: order tracking\nImproved performance"
                  }
                  value={rnForm.notes}
                  onChange={(e) => setRnForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={6}
                  className="border-input bg-background focus:ring-ring w-full resize-none rounded-xl border px-3 py-2 font-mono text-sm focus:ring-2 focus:outline-none"
                />
                <p className="text-muted-foreground text-xs">
                  Enter one bullet point per line — each line becomes a separate item in the "What's
                  New" sheet
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Sort Order</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={rnForm.sortOrder}
                  onChange={(e) => setRnForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="h-10 w-32 rounded-xl"
                />
                <p className="text-muted-foreground text-xs">Lower number = shown first</p>
              </div>
              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setRnDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitRn}
                  disabled={saveRn.isPending}
                  className="flex-1 gap-2 rounded-xl"
                >
                  <Save className="h-4 w-4" />
                  {saveRn.isPending ? "Saving..." : editingRn ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ══ Admin Account Dialog ══ */}
        <Dialog
          open={adminDialog}
          onOpenChange={(v) => {
            setAdminDialog(v);
            if (!v) {
              setEditingAdmin(null);
              setAdminForm({ ...EMPTY_ADMIN });
            }
          }}
        >
          <DialogContent className="max-h-[90dvh] w-[95vw] max-w-lg overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                {editingAdmin ? "Edit Admin Account" : "Create Admin Account"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Ahmed Khan"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-11 rounded-xl"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Email
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    (used for password resets)
                  </span>
                </label>
                <Input
                  type="email"
                  placeholder="ahmed@ajkmart.local"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                  className="h-11 rounded-xl"
                  data-testid="input-admin-email"
                />
              </div>

              {/* Secret */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Admin Secret {!editingAdmin && <span className="text-red-500">*</span>}
                  {editingAdmin && (
                    <span className="text-muted-foreground ml-1 text-xs font-normal">
                      (leave blank to keep current)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    placeholder="Create a strong secret key"
                    value={adminForm.secret}
                    onChange={(e) => setAdminForm((f) => ({ ...f, secret: e.target.value }))}
                    className="h-11 rounded-xl pr-10 font-mono"
                  />
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-muted-foreground text-xs">
                  This secret is used to log in to the admin panel. Keep it secure.
                </p>
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {ADMIN_ROLES.filter((r) => r.val !== "super").map((r) => (
                    <div
                      key={r.val}
                      onClick={() => setAdminForm((f) => ({ ...f, role: r.val }))}
                      className={`cursor-pointer rounded-xl border p-3 transition-all ${adminForm.role === r.val ? "border-blue-400 bg-blue-50" : "border-border bg-muted/30 hover:border-blue-200"}`}
                    >
                      <Badge variant="outline" className={`mb-1.5 text-xs ${r.color}`}>
                        {r.label}
                      </Badge>
                      <p className="text-muted-foreground text-xs">{r.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Permissions */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Page Access</label>
                <div className="flex flex-wrap gap-2">
                  {PERMISSIONS.map((p) => {
                    const active = adminForm.permissions.split(",").includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => togglePermission(p)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-all ${active ? "border-blue-600 bg-blue-600 text-white" : "bg-muted border-border text-muted-foreground hover:border-blue-300"}`}
                      >
                        {p.replace("-", " ")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active toggle */}
              <div
                onClick={() => setAdminForm((f) => ({ ...f, isActive: !f.isActive }))}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 ${adminForm.isActive ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}
              >
                <span className="text-sm font-semibold">Account Active</span>
                <div
                  className={`relative h-5 w-10 rounded-full transition-colors ${adminForm.isActive ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${adminForm.isActive ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setAdminDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitAdmin}
                  disabled={saveAdmin.isPending}
                  className="flex-1 gap-2 rounded-xl"
                >
                  <Save className="h-4 w-4" />
                  {saveAdmin.isPending ? "Saving..." : editingAdmin ? "Update" : "Create Admin"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ══ Sessions Tab ══ */}
        {tab === "sessions" && <SessionsTab />}

        <ConfirmDialog
          open={!!resetLinkAdmin}
          onClose={() => setResetLinkAdmin(null)}
          onConfirm={() => {
            if (!resetLinkAdmin) return;
            sendResetLink.mutate(resetLinkAdmin.id, { onSettled: () => setResetLinkAdmin(null) });
          }}
          title={tDual("sendResetLinkTitle", language)}
          description={
            resetLinkAdmin ? `Send a password reset link to ${resetLinkAdmin.email}?` : ""
          }
          confirmLabel="Send link"
          busy={sendResetLink.isPending}
        />
        <ConfirmDialog
          open={!!deleteRnTarget}
          onClose={() => setDeleteRnTarget(null)}
          onConfirm={() => {
            if (!deleteRnTarget) return;
            deleteRn.mutate(deleteRnTarget.id, { onSettled: () => setDeleteRnTarget(null) });
          }}
          title="Delete release notes?"
          description={deleteRnTarget ? `Delete release notes for v${deleteRnTarget.version}?` : ""}
          confirmLabel="Delete"
          variant="destructive"
          busy={deleteRn.isPending}
        />
      </div>
    </ErrorBoundary>
  );
}
