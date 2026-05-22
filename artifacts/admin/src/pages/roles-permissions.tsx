/**
 * Roles & Permissions admin page — professional enterprise-grade redesign.
 * Lists RBAC roles, allows editing the permissions on each role,
 * and creating new custom roles. Built-in roles can be edited but not deleted.
 *
 * Backend enforcement lives at /api/admin/system/rbac/* —
 * the UI here is gated by `system.roles.manage` for write actions.
 */
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SensitiveActionDialog } from "@/components/SensitiveActionDialog";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchAdmin } from "@/lib/adminFetcher";
import { isAbortError, useAbortableEffect } from "@/lib/useAbortableEffect";
import {
  AlertTriangle,
  Ban,
  BarChart2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Database,
  FileText,
  Globe,
  KeyRound,
  LayoutGrid,
  Lock,
  LogOut,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Shield,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface PermissionDef {
  id: string;
  category: string;
  label?: string;
  description?: string;
  highRisk?: boolean;
}

interface RbacRole {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  permissions: string[];
}

interface AdminAccount {
  id: string;
  username?: string;
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  lastLoginAt?: string | null;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

const ROLE_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-teal-100 text-teal-700",
];

const ADMIN_AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function colorForString(str: string, palette: string[]) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return palette[h % palette.length]!;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  system: Settings2,
  users: Users,
  orders: ShoppingCart,
  products: Package,
  reports: BarChart2,
  finance: CreditCard,
  kyc: ClipboardCheck,
  drivers: Truck,
  vendors: Store,
  tags: Tag,
  global: Globe,
  documents: FileText,
  data: Database,
  actions: Zap,
};

function categoryIcon(cat: string) {
  const key = cat.toLowerCase();
  for (const [k, Icon] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return Icon;
  }
  return Shield;
}

/* ── Skeleton components ─────────────────────────────────────────── */

function RoleSidebarSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-transparent p-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function PermissionMatrixSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-2 h-1.5 flex-1 rounded-full" />
          </div>
          {[0, 1, 2].map((j) => (
            <div key={j} className="flex items-center gap-3 rounded-lg px-3 py-2">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AdminListSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg p-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ── Stats bar ───────────────────────────────────────────────────── */

interface StatsBarProps {
  roles: RbacRole[];
  catalog: PermissionDef[];
  adminRoleMap: Record<string, string[]>;
  adminsLoaded: boolean;
  loading: boolean;
}

function StatsBar({ roles, catalog, adminRoleMap, adminsLoaded, loading }: StatsBarProps) {
  const assignedAdminCount = adminsLoaded
    ? Object.values(adminRoleMap).filter((rs) => rs.length > 0).length
    : null;
  const highRiskCount = catalog.filter((p) => p.highRisk).length;

  const stats = [
    {
      label: "Total roles",
      value: roles.length,
      display: String(roles.length),
      icon: Shield,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Admins assigned",
      value: assignedAdminCount,
      display: assignedAdminCount == null ? "—" : String(assignedAdminCount),
      icon: Users,
      color: "bg-violet-50 text-violet-600",
    },
    {
      label: "Permissions",
      value: catalog.length,
      display: String(catalog.length),
      icon: KeyRound,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "High-risk",
      value: highRiskCount,
      display: String(highRiskCount),
      icon: AlertTriangle,
      color: "bg-red-50 text-red-600",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border bg-white p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.color}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl leading-none font-bold tabular-nums">{s.display}</div>
              <div className="text-muted-foreground mt-0.5 text-xs">{s.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Permission Matrix component ─────────────────────────────────── */

function PermissionMatrix({
  roles,
  catalog,
  loading,
  canManage,
  onReload,
}: {
  roles: RbacRole[];
  catalog: PermissionDef[];
  loading: boolean;
  canManage: boolean;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [matrixSearch, setMatrixSearch] = useState("");
  // draftMap: roleId -> Set of permissionIds (mutable draft state per role)
  const [draftMap, setDraftMap] = useState<Record<string, Set<string>>>({});
  const [savingRole, setSavingRole] = useState<string | null>(null);

  // Initialise draft map when roles load / change
  useEffect(() => {
    setDraftMap((prev) => {
      const next: Record<string, Set<string>> = {};
      for (const r of roles) {
        // Keep existing draft if present, otherwise seed from server state
        next[r.id] = prev[r.id] ?? new Set(r.permissions);
      }
      return next;
    });
  }, [roles]);

  const toggleCell = (roleId: string, permId: string) => {
    if (!canManage) return;
    setDraftMap((prev) => {
      const next = { ...prev };
      const set = new Set(prev[roleId] ?? []);
      set.has(permId) ? set.delete(permId) : set.add(permId);
      next[roleId] = set;
      return next;
    });
  };

  const isDirty = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return false;
    const draft = draftMap[roleId];
    if (!draft) return false;
    const orig = new Set(role.permissions);
    if (orig.size !== draft.size) return true;
    for (const p of draft) if (!orig.has(p)) return true;
    return false;
  };

  const saveRole = async (roleId: string) => {
    const draft = draftMap[roleId];
    if (!draft) return;
    setSavingRole(roleId);
    try {
      await fetchAdmin(`/system/rbac/roles/${roleId}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: Array.from(draft) }),
      });
      toast({ title: "Permissions saved", description: "Role permissions updated successfully." });
      onReload();
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSavingRole(null);
  };

  const categorized = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of catalog) {
      const q = matrixSearch.toLowerCase();
      if (q && !p.id.toLowerCase().includes(q) && !(p.label || "").toLowerCase().includes(q))
        continue;
      const cat = p.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog, matrixSearch]);

  if (loading) {
    return <div className="bg-muted h-48 animate-pulse rounded-xl" />;
  }

  if (!catalog.length) {
    return (
      <div className="border-border/50 text-muted-foreground rounded-xl border p-12 text-center">
        <LayoutGrid className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm">No permission catalog loaded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            value={matrixSearch}
            onChange={(e) => setMatrixSearch(e.target.value)}
            placeholder="Filter permissions…"
            className="border-border bg-background focus:ring-ring h-9 w-full rounded-xl border pr-3 pl-9 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          {catalog.length} permissions · {roles.length} roles
          {canManage && <span className="ml-1 text-indigo-600">· click any cell to toggle</span>}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl shadow-sm">
        <div className="border-border/50 rounded-xl border">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-border border-b">
                <th className="text-muted-foreground bg-muted/40 sticky left-0 z-10 min-w-[220px] px-4 py-3 text-left font-semibold">
                  Permission
                </th>
                {roles.map((r) => {
                  const dirty = isDirty(r.id);
                  return (
                    <th
                      key={r.id}
                      className="px-3 py-3 text-center font-semibold whitespace-nowrap"
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] ${colorForString(r.id, ROLE_COLORS)}`}
                        >
                          {r.isBuiltIn && <Lock className="h-2.5 w-2.5 opacity-60" />}
                          {r.name}
                        </div>
                        {canManage && dirty && (
                          <button
                            onClick={() => void saveRole(r.id)}
                            disabled={savingRole === r.id}
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                          >
                            <Save className="h-2.5 w-2.5" />
                            {savingRole === r.id ? "Saving…" : "Save"}
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {categorized.map(([category, perms]) => (
                <>
                  <tr key={`cat-${category}`} className="border-border/50 border-b bg-slate-50/80">
                    <td
                      colSpan={roles.length + 1}
                      className="sticky left-0 bg-slate-50/80 px-4 py-2"
                    >
                      <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                        {category}
                      </span>
                      <span className="text-muted-foreground/60 ml-2 text-[10px]">
                        {perms.length}
                      </span>
                    </td>
                  </tr>
                  {perms.map((p) => (
                    <tr
                      key={p.id}
                      className="border-border/30 hover:bg-muted/20 border-b transition-colors"
                    >
                      <td className="hover:bg-muted/20 sticky left-0 z-10 bg-white px-4 py-2.5 transition-colors">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-foreground truncate font-medium">
                                {p.label || p.id}
                              </span>
                              {p.highRisk && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
                                  <AlertTriangle className="h-2.5 w-2.5" /> HIGH RISK
                                </span>
                              )}
                            </div>
                            <p className="text-muted-foreground/60 truncate font-mono text-[10px]">
                              {p.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      {roles.map((r) => {
                        const draft = draftMap[r.id];
                        const has = draft ? draft.has(p.id) : r.permissions.includes(p.id);
                        const wasOrig = r.permissions.includes(p.id);
                        const changed = has !== wasOrig;
                        return (
                          <td key={r.id} className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => toggleCell(r.id, p.id)}
                              disabled={!canManage}
                              title={
                                canManage
                                  ? has
                                    ? "Click to revoke"
                                    : "Click to grant"
                                  : "Read-only"
                              }
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-all ${
                                has
                                  ? `bg-indigo-100 text-indigo-600 ${canManage ? "cursor-pointer hover:bg-indigo-200" : ""} ${changed ? "ring-2 ring-amber-400" : ""}`
                                  : `bg-slate-100 text-slate-300 ${canManage ? "cursor-pointer hover:bg-slate-200" : ""} ${changed ? "ring-2 ring-amber-400" : ""}`
                              }`}
                            >
                              {has ? (
                                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              ) : (
                                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {canManage && (
        <p className="text-muted-foreground text-xs">
          <span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-indigo-100 align-middle ring-2 ring-amber-400" />
          Highlighted cells have unsaved changes. Click "Save" above the role column to persist.
        </p>
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function RolesPermissionsPage() {
  const { toast } = useToast();
  const { has, isSuper } = usePermissions();
  const canManage = isSuper || has("system.roles.manage");

  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(0);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"roles" | "admins" | "matrix">("roles");
  const [_confirmRemoveRole, setConfirmRemoveRole] = useState(false);
  const [sensitiveDeleteRole, setSensitiveDeleteRole] = useState(false);
  const [sensitiveSavePerms, setSensitiveSavePerms] = useState(false);
  const [sensitiveRoleToggle, setSensitiveRoleToggle] = useState<{
    adminId: string;
    roleId: string;
  } | null>(null);

  /* ── Single-dialog create role ──────────────────────────────────── */
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  /* ── Inline edit role name/description ─────────────────────────── */
  const [showEditRole, setShowEditRole] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  /* ── Unsaved-changes guard ──────────────────────────────────────── */
  const [pendingRole, setPendingRole] = useState<RbacRole | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  /* ── Admin assignments tab state ────────────────────────────────── */
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [adminRoleMap, setAdminRoleMap] = useState<Record<string, string[]>>({});
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);
  const [activeAdminEffective, setActiveAdminEffective] = useState<string[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsDataLoaded, setAdminsDataLoaded] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [effectiveSearch, setEffectiveSearch] = useState("");

  const activeRole = useMemo(
    () => roles.find((r) => r.id === activeRoleId) ?? null,
    [roles, activeRoleId]
  );

  const dirty = useMemo(() => {
    if (!activeRole) return false;
    if (activeRole.permissions.length !== draftPerms.size) return true;
    return (
      activeRole.permissions.some((p) => !draftPerms.has(p)) ||
      [...draftPerms].some((p) => !activeRole.permissions.includes(p))
    );
  }, [activeRole, draftPerms]);

  const reload = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [catRes, rolesRes] = await Promise.all([
        fetchAdmin("/system/rbac/permissions", { signal }),
        fetchAdmin("/system/rbac/roles", { signal }),
      ]);
      if (signal?.aborted) return;
      const cat: PermissionDef[] = catRes?.data?.permissions ?? catRes?.permissions ?? [];
      const rls: RbacRole[] = rolesRes?.data?.roles ?? rolesRes?.roles ?? [];
      setCatalog(cat);
      setRoles(rls);
      setLastUpdatedAt(Date.now());
      if (rls.length && !activeRoleId) {
        setActiveRoleId(rls[0]!.id);
        setDraftPerms(new Set(rls[0]!.permissions));
      }
    } catch (err) {
      if (isAbortError(err)) return;
      toast({ title: "Failed to load roles", description: String(err), variant: "destructive" });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useAbortableEffect((signal) => {
    void reload(signal);
  }, []);

  /* ── Admin assignments ──────────────────────────────────────────── */
  const loadAdmins = useCallback(async () => {
    setAdminsLoading(true);
    try {
      const res = await fetchAdmin("/admin-accounts");
      const list: AdminAccount[] =
        res?.data?.accounts ??
        res?.accounts ??
        res?.data?.adminAccounts ??
        res?.adminAccounts ??
        (Array.isArray(res?.data) ? res.data : null) ??
        (Array.isArray(res) ? res : []) ??
        [];
      setAdmins(Array.isArray(list) ? list : []);
      const map: Record<string, string[]> = {};
      await Promise.all(
        (Array.isArray(list) ? list : []).map(async (a) => {
          try {
            const r = await fetchAdmin(`/system/rbac/admins/${a.id}/roles`);
            const rs: RbacRole[] = r?.data?.roles ?? r?.roles ?? [];
            map[a.id] = rs.map((x) => x.id);
          } catch (err: unknown) {
            // eslint-disable-next-line no-console
            console.debug(
              "[roles-permissions] admin role fetch failed for",
              a.id,
              ":",
              err instanceof Error ? err.message : String(err)
            );
            map[a.id] = [];
          }
        })
      );
      setAdminRoleMap(map);
    } catch (err) {
      toast({ title: "Failed to load admins", description: String(err), variant: "destructive" });
    } finally {
      setAdminsLoading(false);
      setAdminsDataLoaded(true);
    }
  }, [toast]);

  useEffect(() => {
    if (tab === "admins" && !admins.length) void loadAdmins();
  }, [tab, loadAdmins, admins.length]);

  const selectAdmin = async (a: AdminAccount) => {
    setActiveAdminId(a.id);
    setActiveAdminEffective([]);
    setEffectiveSearch("");
    try {
      const r = await fetchAdmin(`/system/rbac/admins/${a.id}/effective-permissions`);
      setActiveAdminEffective(r?.data?.permissions ?? r?.permissions ?? []);
    } catch (_err) {
      toast({
        title: "Could not load effective permissions",
        description: "Try again or reload the page.",
        variant: "destructive",
      });
    }
  };

  const toggleAdminRole = async (adminId: string, roleId: string) => {
    if (!canManage) return;
    const current = new Set(adminRoleMap[adminId] ?? []);
    if (current.has(roleId)) current.delete(roleId);
    else current.add(roleId);
    const next = [...current];
    setAdminRoleMap((prev) => ({ ...prev, [adminId]: next }));
    try {
      await fetchAdmin(`/system/rbac/admins/${adminId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds: next }),
      });
      toast({ title: "Roles updated" });
      if (activeAdminId === adminId) await selectAdmin({ id: adminId } as AdminAccount);
    } catch (err) {
      toast({ title: "Update failed", description: String(err), variant: "destructive" });
      void loadAdmins();
    }
  };

  /* Attempt to switch to a different role; show discard dialog if dirty */
  const trySelectRole = (role: RbacRole) => {
    if (role.id === activeRoleId) return;
    if (dirty) {
      setPendingRole(role);
      setShowDiscardDialog(true);
    } else {
      doSelectRole(role);
    }
  };

  const doSelectRole = (role: RbacRole) => {
    setActiveRoleId(role.id);
    setDraftPerms(new Set(role.permissions));
    setFilter("");
  };

  const togglePerm = (id: string) => {
    if (!canManage) return;
    setDraftPerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* toggleCategoryAll operates only on the currently filtered perms for the category */
  const toggleCategoryAll = (perms: PermissionDef[], selectAll: boolean) => {
    if (!canManage) return;
    setDraftPerms((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (selectAll) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  };

  const save = async () => {
    if (!activeRole || !canManage) return;
    setSaving(true);
    try {
      await fetchAdmin(`/system/rbac/roles/${activeRole.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: [...draftPerms] }),
      });
      toast({ title: "Saved", description: `Permissions updated for ${activeRole.name}` });
      await reload();
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openCreateRole = () => {
    setNewSlug("");
    setNewName("");
    setNewDesc("");
    setShowCreateRole(true);
  };

  const submitNewRole = async () => {
    const slug = newSlug.trim();
    const name = newName.trim() || slug;
    if (!slug) return;
    setCreating(true);
    try {
      const res = await fetchAdmin("/system/rbac/roles", {
        method: "POST",
        body: JSON.stringify({ slug, name, description: newDesc.trim() || undefined }),
      });
      const role = (res?.data?.role ?? res?.role) as RbacRole | undefined;
      toast({ title: "Role created", description: name });
      setShowCreateRole(false);
      setFilter("");
      await reload();
      if (role) {
        setActiveRoleId(role.id);
        setDraftPerms(new Set());
      }
    } catch (err) {
      toast({ title: "Create failed", description: String(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openEditRole = () => {
    if (!activeRole) return;
    setEditName(activeRole.name);
    setEditDesc(activeRole.description ?? "");
    setShowEditRole(true);
  };

  const submitEditRole = async () => {
    if (!activeRole) return;
    setEditSaving(true);
    try {
      await fetchAdmin(`/system/rbac/roles/${activeRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim() || undefined,
          description: editDesc.trim() === "" ? null : editDesc.trim(),
        }),
      });
      toast({ title: "Role updated" });
      setShowEditRole(false);
      await reload();
    } catch (err) {
      toast({ title: "Update failed", description: String(err), variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const performRemoveRole = async () => {
    if (!activeRole || activeRole.isBuiltIn) return;
    setConfirmRemoveRole(false);
    try {
      await fetchAdmin(`/system/rbac/roles/${activeRole.id}`, { method: "DELETE" });
      toast({ title: "Role deleted" });
      setActiveRoleId(null);
      await reload();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  };

  const filtered = useMemo(() => {
    if (!filter) return catalog;
    const q = filter.toLowerCase();
    return catalog.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        (p.label ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
    );
  }, [catalog, filter]);

  const grouped = useMemo(() => {
    const m = new Map<string, PermissionDef[]>();
    for (const p of filtered) {
      if (!m.has(p.category)) m.set(p.category, []);
      m.get(p.category)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const filteredAdmins = useMemo(() => {
    if (!adminSearch) return admins;
    const q = adminSearch.toLowerCase();
    return admins.filter(
      (a) =>
        (a.name ?? "").toLowerCase().includes(q) ||
        (a.username ?? "").toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q)
    );
  }, [admins, adminSearch]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Roles & Permissions page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          icon={Shield}
          title="Roles & Permissions"
          subtitle="Fine-grained access control for admin users."
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-700"
          actions={
            <div className="flex items-center gap-2">
              <LastUpdated
                dataUpdatedAt={lastUpdatedAt}
                onRefresh={() => {
                  void (tab === "roles" ? reload() : loadAdmins());
                }}
                isRefreshing={loading || adminsLoading}
              />
              <Button
                variant="outline"
                onClick={() => {
                  void (tab === "roles" ? reload() : loadAdmins());
                }}
                disabled={loading || adminsLoading}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${loading || adminsLoading ? "animate-spin" : ""}`}
                />{" "}
                Reload
              </Button>
              {canManage && tab === "roles" && (
                <Button onClick={openCreateRole}>
                  <Plus className="mr-2 h-4 w-4" /> New role
                </Button>
              )}
            </div>
          }
        />

        {/* Stats bar */}
        <StatsBar
          roles={roles}
          catalog={catalog}
          adminRoleMap={adminRoleMap}
          adminsLoaded={adminsDataLoaded}
          loading={loading}
        />

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          <button
            onClick={() => setTab("roles")}
            data-testid="tab-roles"
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === "roles" ? "border-indigo-600 text-indigo-700" : "text-muted-foreground hover:text-foreground border-transparent"}`}
          >
            <Shield className="-mt-0.5 mr-1.5 inline h-4 w-4" />
            Roles
          </button>
          <button
            onClick={() => setTab("matrix")}
            data-testid="tab-matrix"
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === "matrix" ? "border-indigo-600 text-indigo-700" : "text-muted-foreground hover:text-foreground border-transparent"}`}
          >
            <LayoutGrid className="-mt-0.5 mr-1.5 inline h-4 w-4" />
            Permission Matrix
          </button>
          <button
            onClick={() => setTab("admins")}
            data-testid="tab-admins"
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === "admins" ? "border-indigo-600 text-indigo-700" : "text-muted-foreground hover:text-foreground border-transparent"}`}
          >
            <Users className="-mt-0.5 mr-1.5 inline h-4 w-4" />
            Admin assignments
          </button>
        </div>

        {/* Matrix tab */}
        {tab === "matrix" && (
          <PermissionMatrix
            roles={roles}
            catalog={catalog}
            loading={loading}
            canManage={canManage}
            onReload={() => void reload()}
          />
        )}

        {/* Read-only banner */}
        {!canManage && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Lock className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Read-only mode.</strong> You can browse roles and permissions, but changes are
              disabled. The{" "}
              <code className="rounded bg-amber-100 px-1 font-mono">system.roles.manage</code>{" "}
              permission is required to edit.
            </span>
          </div>
        )}

        {tab === "admins" ? (
          <AdminAssignments
            admins={filteredAdmins}
            allAdmins={admins}
            roles={roles}
            adminRoleMap={adminRoleMap}
            activeAdminId={activeAdminId}
            activeAdminEffective={activeAdminEffective}
            onSelect={selectAdmin}
            onToggleRole={(adminId, roleId) => setSensitiveRoleToggle({ adminId, roleId })}
            onAdminUpdated={(adminId, updates) => {
              setAdmins((prev) => prev.map((a) => (a.id === adminId ? { ...a, ...updates } : a)));
            }}
            onAdminDeleted={(adminId) => {
              setAdmins((prev) => prev.filter((a) => a.id !== adminId));
              if (activeAdminId === adminId) setActiveAdminId(null);
            }}
            canManage={canManage}
            loading={adminsLoading}
            search={adminSearch}
            onSearchChange={setAdminSearch}
            effectiveSearch={effectiveSearch}
            onEffectiveSearchChange={setEffectiveSearch}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
            {/* Roles sidebar */}
            <aside className="flex flex-col rounded-xl border bg-white shadow-sm">
              <div className="border-b px-4 py-3">
                <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Roles
                </span>
                <span className="text-muted-foreground ml-2 text-xs">({roles.length})</span>
              </div>
              {loading ? (
                <RoleSidebarSkeleton />
              ) : (
                <ul className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
                  {roles.map((r) => {
                    const isActive = activeRoleId === r.id;
                    const avatarColor = colorForString(r.id, ROLE_COLORS);
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => trySelectRole(r)}
                          data-testid={`role-${r.slug}`}
                          className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                            isActive
                              ? "border border-indigo-200 bg-indigo-50 shadow-sm"
                              : "border border-transparent hover:bg-slate-50"
                          }`}
                        >
                          {/* colored avatar */}
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor}`}
                          >
                            {r.name[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`truncate text-sm font-medium ${isActive ? "text-indigo-900" : ""}`}
                              >
                                {r.name}
                              </span>
                              {r.isBuiltIn && (
                                <Lock className="text-muted-foreground h-3 w-3 shrink-0" />
                              )}
                            </div>
                            <div className="text-muted-foreground truncate text-xs">
                              {r.description ? r.description : r.slug}
                            </div>
                          </div>
                          {/* permission count badge */}
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}
                          >
                            {r.permissions.length}
                          </span>
                          {/* active left border indicator */}
                          {isActive && (
                            <div className="absolute top-1/2 left-0 h-6 w-0.5 -translate-y-1/2 rounded-r bg-indigo-600" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {!roles.length && !loading && (
                    <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                      No roles defined yet.
                    </li>
                  )}
                </ul>
              )}
            </aside>

            {/* Permission editor */}
            <section className="flex flex-col rounded-xl border bg-white shadow-sm">
              {loading ? (
                <>
                  <div className="flex items-center gap-3 border-b p-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-9 w-64 rounded-lg" />
                  </div>
                  <PermissionMatrixSkeleton />
                </>
              ) : !activeRole ? (
                <div className="text-muted-foreground flex flex-1 items-center justify-center p-12 text-sm">
                  <div className="space-y-2 text-center">
                    <Shield className="mx-auto h-10 w-10 text-slate-200" />
                    <p>Select a role from the sidebar to view and edit its permissions.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Role header */}
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${colorForString(activeRole.id, ROLE_COLORS)}`}
                      >
                        {activeRole.name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold">{activeRole.name}</h2>
                          {activeRole.isBuiltIn && (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <Lock className="h-3 w-3" />
                              built-in
                            </Badge>
                          )}
                          {canManage && !activeRole.isBuiltIn && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={openEditRole}
                              title="Edit role name / description"
                              className="h-6 w-6 p-0"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {activeRole.description || "No description"} ·{" "}
                          <span className="font-medium">{draftPerms.size}</span> of {catalog.length}{" "}
                          permissions enabled
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                        <Input
                          placeholder="Filter permissions…"
                          className="h-9 w-56 pl-8"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        />
                      </div>
                      {canManage && !activeRole.isBuiltIn && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSensitiveDeleteRole(true)}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          onClick={() => setSensitiveSavePerms(true)}
                          disabled={!dirty || saving}
                          className="relative"
                        >
                          <Save className="mr-1.5 h-4 w-4" />
                          {saving ? "Saving…" : "Save"}
                          {dirty && !saving && (
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Permission matrix */}
                  <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
                    {grouped.map(([category, perms]) => {
                      const allChecked = perms.every((p) => draftPerms.has(p.id));
                      const noneChecked = perms.every((p) => !draftPerms.has(p.id));
                      const enabledCount = perms.filter((p) => draftPerms.has(p.id)).length;
                      const pct = perms.length
                        ? Math.round((enabledCount / perms.length) * 100)
                        : 0;
                      const CatIcon = categoryIcon(category);
                      return (
                        <div
                          key={category}
                          className="overflow-hidden rounded-xl border border-slate-100"
                        >
                          {/* Category header */}
                          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <CatIcon className="h-4 w-4 shrink-0 text-slate-500" />
                              <span className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                                {category}
                              </span>
                              <div className="ml-3 flex max-w-[200px] flex-1 items-center gap-2">
                                <Progress value={pct} className="h-1.5 flex-1" />
                                <span className="text-muted-foreground text-[11px] whitespace-nowrap">
                                  {enabledCount}/{perms.length}
                                </span>
                              </div>
                            </div>
                            {canManage && (
                              <div className="ml-3 flex shrink-0 gap-1">
                                <button
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${allChecked ? "text-muted-foreground cursor-not-allowed opacity-40" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
                                  disabled={allChecked}
                                  onClick={() => toggleCategoryAll(perms, true)}
                                >
                                  Select all
                                </button>
                                <button
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${noneChecked ? "text-muted-foreground cursor-not-allowed opacity-40" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                                  disabled={noneChecked}
                                  onClick={() => toggleCategoryAll(perms, false)}
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Permission rows */}
                          <ul className="divide-y divide-slate-50">
                            {perms.map((p) => {
                              const checked = draftPerms.has(p.id);
                              return (
                                <li key={p.id}>
                                  <label
                                    className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors ${p.highRisk ? (checked ? "bg-red-50" : "hover:bg-red-50/40") : checked ? "bg-indigo-50/60" : "hover:bg-slate-50/80"}`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      checked={checked}
                                      onChange={() => togglePerm(p.id)}
                                      disabled={!canManage}
                                      data-testid={`perm-${p.id}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <code
                                          className={`font-mono text-sm font-medium ${checked ? (p.highRisk ? "text-red-800" : "text-indigo-800") : "text-slate-700"}`}
                                        >
                                          {p.id}
                                        </code>
                                        {p.highRisk && (
                                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                            <AlertTriangle className="h-3 w-3" /> high-risk
                                          </span>
                                        )}
                                      </div>
                                      {(p.label || p.description) && (
                                        <div className="text-muted-foreground mt-0.5 text-xs">
                                          {p.label || p.description}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                    {!grouped.length && (
                      <div className="text-muted-foreground py-10 text-center text-sm">
                        <Search className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                        No permissions match your filter.
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* ── Create role dialog ────────────────────────────────────────── */}
        <Dialog
          open={showCreateRole}
          onOpenChange={(o) => {
            if (!o && !creating) setShowCreateRole(false);
          }}
        >
          <DialogContent className="w-[95vw] max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                  <Shield className="h-4 w-4 text-indigo-600" />
                </span>
                Create new role
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Slug <span className="text-red-500">*</span>
                </label>
                <Input
                  autoFocus
                  placeholder="e.g. billing_manager"
                  value={newSlug}
                  onChange={(e) =>
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
                  }
                  disabled={creating}
                  className="font-mono"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Lowercase letters, numbers and underscores only.
                </p>
                {newSlug && (
                  <p className="mt-1 font-mono text-xs text-indigo-600">
                    Role ID will be: <strong>{newSlug}</strong>
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Display name</label>
                <Input
                  placeholder="e.g. Billing Manager"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSlug.trim()) void submitNewRole();
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  placeholder="Short description of this role's purpose"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  disabled={creating}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateRole(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={() => void submitNewRole()} disabled={!newSlug.trim() || creating}>
                {creating ? "Creating…" : "Create role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit role dialog ──────────────────────────────────────────── */}
        <Dialog
          open={showEditRole}
          onOpenChange={(o) => {
            if (!o && !editSaving) setShowEditRole(false);
          }}
        >
          <DialogContent className="w-[95vw] max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                  <Shield className="h-4 w-4 text-indigo-600" />
                </span>
                Edit role
              </DialogTitle>
            </DialogHeader>
            {activeRole && (
              <p className="text-muted-foreground -mt-2 font-mono text-xs">
                Slug: <strong>{activeRole.slug}</strong>
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Display name</label>
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={editSaving}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  disabled={editSaving}
                  rows={3}
                  className="resize-none"
                  placeholder="Short description of this role's purpose"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowEditRole(false)}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submitEditRole()}
                disabled={!editName.trim() || editSaving}
              >
                {editSaving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Discard unsaved changes guard ───────────────────────────── */}
        <ConfirmDialog
          open={showDiscardDialog}
          title="Discard unsaved changes?"
          description="You have unsaved permission changes on this role. Discard them and switch roles?"
          confirmLabel="Discard"
          cancelLabel="Stay"
          variant="destructive"
          onConfirm={() => {
            setShowDiscardDialog(false);
            if (pendingRole) {
              doSelectRole(pendingRole);
              setPendingRole(null);
            }
          }}
          onClose={() => {
            setShowDiscardDialog(false);
            setPendingRole(null);
          }}
        />

        {/* ── Delete role — requires password re-entry ─────────────────── */}
        <SensitiveActionDialog
          open={sensitiveDeleteRole}
          onClose={() => setSensitiveDeleteRole(false)}
          onConfirm={performRemoveRole}
          title="Delete role"
          description={activeRole ? `Delete role "${activeRole.name}"? This cannot be undone.` : ""}
          confirmLabel="Delete Role"
          actionType="delete_role"
          targetId={activeRole?.id}
        />

        {/* ── Save permissions — requires password re-entry ─────────────── */}
        <SensitiveActionDialog
          open={sensitiveSavePerms}
          onClose={() => setSensitiveSavePerms(false)}
          onConfirm={save}
          title="Save permission changes"
          description={
            activeRole
              ? `You are about to update permissions for "${activeRole.name}". Confirm your identity to proceed.`
              : ""
          }
          confirmLabel="Save Permissions"
          actionType="save_permissions"
          targetId={activeRole?.id}
        />

        {/* ── Admin role toggle — requires password re-entry ───────────────── */}
        <SensitiveActionDialog
          open={!!sensitiveRoleToggle}
          onClose={() => setSensitiveRoleToggle(null)}
          onConfirm={() => {
            if (sensitiveRoleToggle)
              void toggleAdminRole(sensitiveRoleToggle.adminId, sensitiveRoleToggle.roleId);
          }}
          title="Change Admin Role"
          description="You are about to change this admin's role assignments. This will immediately affect their access. Confirm your identity to proceed."
          confirmLabel="Apply Role Change"
          actionType="toggle_admin_role"
          targetId={sensitiveRoleToggle?.adminId}
        />
      </div>
    </ErrorBoundary>
  );
}

/* ── Admin Assignments ───────────────────────────────────────────── */

interface AdminAssignmentsProps {
  admins: AdminAccount[];
  allAdmins: AdminAccount[];
  roles: RbacRole[];
  adminRoleMap: Record<string, string[]>;
  activeAdminId: string | null;
  activeAdminEffective: string[];
  onSelect: (a: AdminAccount) => void;
  onToggleRole: (adminId: string, roleId: string) => void;
  onAdminUpdated: (adminId: string, updates: Partial<AdminAccount>) => void;
  onAdminDeleted: (adminId: string) => void;
  canManage: boolean;
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  effectiveSearch: string;
  onEffectiveSearchChange: (v: string) => void;
}

function AdminAssignments({
  admins,
  allAdmins,
  roles,
  adminRoleMap,
  activeAdminId,
  activeAdminEffective,
  onSelect,
  onToggleRole,
  onAdminUpdated,
  onAdminDeleted,
  canManage,
  loading,
  search,
  onSearchChange,
  effectiveSearch,
  onEffectiveSearchChange,
}: AdminAssignmentsProps) {
  const { toast } = useToast();
  const active = allAdmins.find((a) => a.id === activeAdminId) ?? null;

  const [suspending, setSuspending] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleToggleSuspend = async () => {
    if (!active) return;
    const newActive = !(active.isActive ?? true);
    setSuspending(true);
    try {
      await fetchAdmin(`/admin-accounts/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: newActive }),
      });
      onAdminUpdated(active.id, { isActive: newActive });
      toast({
        title: newActive ? "Admin activated" : "Admin suspended",
        description: `${active.name ?? active.username ?? active.id} has been ${newActive ? "reactivated" : "suspended"}.`,
      });
    } catch (err) {
      toast({ title: "Action failed", description: String(err), variant: "destructive" });
    } finally {
      setSuspending(false);
    }
  };

  const handleRevokeSessions = async () => {
    if (!active) return;
    setRevoking(true);
    try {
      await fetchAdmin(`/admin-accounts/${active.id}/revoke-sessions`, { method: "POST" });
      toast({
        title: "Sessions revoked",
        description: `All active sessions for ${active.name ?? active.username ?? active.id} have been invalidated.`,
      });
    } catch (err) {
      toast({ title: "Revoke failed", description: String(err), variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  };

  const handleDelete = async () => {
    if (!active) return;
    setDeleting(true);
    try {
      await fetchAdmin(`/admin-accounts/${active.id}`, { method: "DELETE" });
      toast({
        title: "Admin deleted",
        description: `${active.name ?? active.username ?? active.id} was removed.`,
      });
      onAdminDeleted(active.id);
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const displayName = (a: AdminAccount) => a.name || a.username || a.email || a.id;
  const displayEmail = (a: AdminAccount) =>
    a.email && a.email !== displayName(a) ? a.email : (a.username ?? "");

  /* Group effective permissions by category prefix */
  const groupedEffective = useMemo(() => {
    const q = effectiveSearch.toLowerCase();
    const perms = effectiveSearch
      ? activeAdminEffective.filter((p) => p.toLowerCase().includes(q))
      : activeAdminEffective;
    const m = new Map<string, string[]>();
    for (const p of perms) {
      const cat = p.split(".")[0] ?? "other";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [activeAdminEffective, effectiveSearch]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">
      {/* Admin list sidebar */}
      <aside className="flex flex-col rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Admins ({allAdmins.length})
          </span>
          {loading && <RefreshCw className="text-muted-foreground h-3.5 w-3.5 animate-spin" />}
        </div>
        <div className="shrink-0 border-b p-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
            <Input
              placeholder="Search by name or email…"
              className="h-9 pl-8 text-sm"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <AdminListSkeleton />
        ) : (
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
            {admins.map((a) => {
              const isActive = activeAdminId === a.id;
              const avatarBg = colorForString(a.id, ADMIN_AVATAR_COLORS);
              const name = displayName(a);
              const email = displayEmail(a);
              const roleCount = (adminRoleMap[a.id] ?? []).length;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => onSelect(a)}
                    data-testid={`admin-${a.id}`}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${isActive ? "border border-indigo-200 bg-indigo-50" : "border border-transparent hover:bg-slate-50"}`}
                  >
                    {/* initials avatar */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarBg}`}
                    >
                      {initials(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{name}</span>
                        {a.isActive === false ? (
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            inactive
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            active
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {email || a.id}
                        {roleCount > 0 && ` · ${roleCount} role${roleCount !== 1 ? "s" : ""}`}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
            {!admins.length && !loading && (
              <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                {search ? "No admins match the search." : "No admin accounts found."}
              </li>
            )}
          </ul>
        )}
      </aside>

      {/* Right panel */}
      <section className="rounded-xl border bg-white shadow-sm">
        {!active ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-12 text-sm">
            <div className="space-y-2 text-center">
              <Users className="mx-auto h-10 w-10 text-slate-200" />
              <p>Select an admin to manage their role assignments.</p>
            </div>
          </div>
        ) : (
          <>
            <ConfirmDialog
              open={confirmDelete}
              title="Delete admin account?"
              description={`Permanently delete "${displayName(active)}"? This cannot be undone. Their active sessions will be revoked first.`}
              confirmLabel={deleting ? "Deleting…" : "Delete"}
              variant="destructive"
              onConfirm={() => void handleDelete()}
              onClose={() => setConfirmDelete(false)}
            />
            {/* Admin header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ${colorForString(active.id, ADMIN_AVATAR_COLORS)}`}
                >
                  {initials(displayName(active))}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{displayName(active)}</h2>
                    {active.isActive === false ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        inactive
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        active
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {displayEmail(active) && <span>{displayEmail(active)} · </span>}
                    Role: <code className="font-mono">{active.role || "—"}</code>
                    {" · "}
                    {(adminRoleMap[active.id] ?? []).length} RBAC role
                    {(adminRoleMap[active.id] ?? []).length !== 1 ? "s" : ""} assigned
                    {active.lastLoginAt && (
                      <>
                        {" · "}Last login: {new Date(active.lastLoginAt).toLocaleDateString()}
                      </>
                    )}
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleToggleSuspend()}
                    disabled={suspending || revoking || deleting}
                    className={
                      active.isActive === false
                        ? "text-emerald-700 hover:bg-emerald-50"
                        : "text-amber-700 hover:bg-amber-50"
                    }
                  >
                    {suspending ? (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : active.isActive === false ? (
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {active.isActive === false ? "Activate" : "Suspend"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRevokeSessions()}
                    disabled={suspending || revoking || deleting}
                  >
                    {revoking ? (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Revoke Sessions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={suspending || revoking || deleting}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
              {/* Role assignment cards */}
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <Shield className="h-3.5 w-3.5" /> Assigned roles
                </h3>
                <div className="space-y-2">
                  {roles.map((r) => {
                    const checked = (adminRoleMap[active.id] ?? []).includes(r.id);
                    const avatarColor = colorForString(r.id, ROLE_COLORS);
                    return (
                      <label
                        key={r.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                          checked
                            ? "border-indigo-200 bg-indigo-50 shadow-sm"
                            : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                        } ${!canManage ? "cursor-not-allowed opacity-70" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={checked}
                          onChange={() => onToggleRole(active.id, r.id)}
                          disabled={!canManage}
                          data-testid={`assign-${r.slug}`}
                        />
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}
                        >
                          {r.name[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-sm font-medium ${checked ? "text-indigo-900" : ""}`}
                            >
                              {r.name}
                            </span>
                            {r.isBuiltIn && <Lock className="text-muted-foreground h-3 w-3" />}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {r.permissions.length} permissions
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Effective permissions tag cloud */}
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <KeyRound className="h-3.5 w-3.5" /> Effective permissions (
                  {activeAdminEffective.length})
                </h3>
                {activeAdminEffective.length > 0 && (
                  <div className="relative mb-3">
                    <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                    <Input
                      placeholder="Search permissions…"
                      className="h-9 pl-8 text-sm"
                      value={effectiveSearch}
                      onChange={(e) => onEffectiveSearchChange(e.target.value)}
                    />
                  </div>
                )}
                {activeAdminEffective.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    No permissions resolved yet.
                    <br />
                    <span className="text-xs">
                      (Super admins implicitly have every permission.)
                    </span>
                  </p>
                ) : groupedEffective.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    No permissions match your search.
                  </p>
                ) : (
                  <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                    {groupedEffective.map(([cat, perms]) => {
                      const CatIcon = categoryIcon(cat);
                      return (
                        <div key={cat}>
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <CatIcon className="h-3 w-3 text-slate-400" />
                            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                              {cat}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {perms.map((p) => (
                              <code
                                key={p}
                                className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 transition-colors hover:bg-slate-200"
                              >
                                {p}
                              </code>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
