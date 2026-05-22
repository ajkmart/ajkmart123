import { AdminFormSheet } from "@/components/AdminFormSheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";
import { WalletAdjustModal } from "@/components/WalletAdjustModal";
import { FilterBar, PageHeader, StatCard, StatCardSkeleton } from "@/components/shared";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddWhitelistEntry,
  useDeleteWhitelistEntry,
  useDeliveryAccess,
  useDeliveryAccessRequests,
  useOverrideSuspension,
  usePlatformSettings,
  useResolveDeliveryRequest,
  useUpdateVendorStatus,
  useVendorCommissionOverride,
  useVendors,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { useHasPermission } from "@/hooks/usePermissions";
import { adminFetch } from "@/lib/adminFetcher";
import { formatCurrency, formatDate } from "@/lib/format";
import { PLATFORM_DEFAULTS } from "@/lib/platformConfig";
import { useLanguage } from "@/lib/useLanguage";
import { useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Award,
  Ban,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck,
  Gavel,
  MessageCircle,
  Package,
  Percent,
  Phone,
  RefreshCw,
  Settings2,
  Star,
  Store,
  TrendingUp,
  Trophy,
  Truck,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

/* ── Suspend Modal ── */
function SuspendModal({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const { toast } = useToast();
  const statusMutation = useUpdateVendorStatus();
  const [action, setAction] = useState<"active" | "blocked" | "banned">(
    vendor.isBanned ? "banned" : !vendor.isActive ? "blocked" : "active"
  );
  const [reason, setReason] = useState(vendor.banReason || "");

  const handleSave = () => {
    statusMutation.mutate(
      {
        id: vendor.id,
        isActive: action === "active",
        isBanned: action === "banned",
        banReason: action === "banned" ? reason : null,
      },
      {
        onSuccess: () => {
          toast({ title: "Vendor status updated" });
          onClose();
        },
        onError: (e: any) =>
          toast({
            title: "Failed",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      }
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[95vw] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Vendor Status — {vendor.storeName || vendor.name}</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          {(
            [
              { key: "active", label: "Active", desc: "Vendor can accept orders", color: "green" },
              {
                key: "blocked",
                label: "Temporarily Blocked",
                desc: "Suspend without ban",
                color: "amber",
              },
              { key: "banned", label: "Permanently Banned", desc: "Ban with reason", color: "red" },
            ] as Array<{
              key: "active" | "blocked" | "banned";
              label: string;
              desc: string;
              color: string;
            }>
          ).map((opt) => (
            <div
              key={opt.key}
              onClick={() => setAction(opt.key)}
              className={`cursor-pointer rounded-xl border p-3 transition-all ${
                action === opt.key
                  ? opt.color === "green"
                    ? "border-green-400 bg-green-50"
                    : opt.color === "amber"
                      ? "border-amber-400 bg-amber-50"
                      : "border-red-400 bg-red-50"
                  : "bg-muted/30 border-border"
              }`}
            >
              <p className="text-sm font-bold">{opt.label}</p>
              <p className="text-muted-foreground text-xs">{opt.desc}</p>
            </div>
          ))}
          {action === "banned" && (
            <Input
              placeholder="Ban reason (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-11 rounded-xl border-red-200"
            />
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={statusMutation.isPending || (action === "banned" && !reason)}
              className="flex-1 rounded-xl"
            >
              {statusMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Commission Override Modal ── */
function CommissionModal({
  vendor,
  defaultPct,
  onClose,
}: {
  vendor: any;
  defaultPct: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const overrideMutation = useVendorCommissionOverride();
  const [pct, setPct] = useState(String(vendor.commissionOverride ?? defaultPct));

  const handleSave = () => {
    const v = parseFloat(pct);
    if (isNaN(v) || v < 0 || v > 100) {
      toast({ title: "Invalid %", variant: "destructive" });
      return;
    }
    overrideMutation.mutate(
      { id: vendor.id, commissionPct: v },
      {
        onSuccess: () => {
          toast({ title: "Commission override saved" });
          onClose();
        },
        onError: (e) =>
          toast({
            title: "Failed",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      }
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[95vw] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-orange-600" /> Commission —{" "}
            {vendor.storeName || vendor.name}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
            <p className="text-orange-700">
              Platform default: <strong>{defaultPct}%</strong>
            </p>
            {vendor.commissionOverride && (
              <p className="mt-0.5 text-orange-700">
                Current override: <strong>{vendor.commissionOverride}%</strong>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
              Override Commission %
            </label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="h-12 rounded-xl text-lg font-bold"
            />
            <p className="text-muted-foreground text-xs">
              Set to 0–100%. Leave at platform default to reset.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={overrideMutation.isPending}
              className="flex-1 rounded-xl bg-orange-600 text-white hover:bg-orange-700"
            >
              {overrideMutation.isPending ? "Saving..." : "Save Override"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Vendor Tier helpers ── */
const TIERS = [
  {
    key: "bronze",
    label: "Bronze",
    icon: Award,
    color: "text-amber-700 bg-amber-100 border-amber-200",
  },
  {
    key: "silver",
    label: "Silver",
    icon: Star,
    color: "text-slate-600 bg-slate-100 border-slate-200",
  },
  {
    key: "gold",
    label: "Gold",
    icon: Trophy,
    color: "text-yellow-600 bg-yellow-100 border-yellow-200",
  },
] as const;
type VendorTier = "bronze" | "silver" | "gold";

function TierBadge({ tier }: { tier?: VendorTier | null }) {
  if (!tier) return null;
  const t = TIERS.find((x) => x.key === tier);
  if (!t) return null;
  const Icon = t.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${t.color}`}
    >
      <Icon className="h-3 w-3" /> {t.label}
    </span>
  );
}

/* ── Vendor Verification Drawer ── */
function VendorVerificationDrawer({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const { toast } = useToast();
  const statusMutation = useUpdateVendorStatus();
  const [note, setNote] = useState("");

  // Vendor profile fields may be nested under vendorProfile or flattened at top level
  const profile = vendor.vendorProfile ?? vendor;
  const businessName = profile.businessName ?? vendor.businessName ?? null;
  const businessType = profile.businessType ?? vendor.businessType ?? null;
  const ntn = profile.ntn ?? vendor.ntn ?? null;
  const storeAddress = profile.storeAddress ?? vendor.storeAddress ?? null;
  const cnic = vendor.cnic ?? null;
  const nationalId = vendor.nationalId ?? null;
  const kycStatus = vendor.kycStatus ?? null;
  const tier = vendor.accountLevel ?? null;

  const kycColor =
    kycStatus === "verified"
      ? "text-green-700 bg-green-50"
      : kycStatus === "rejected"
        ? "text-red-700 bg-red-50"
        : kycStatus === "pending"
          ? "text-amber-700 bg-amber-50"
          : "text-slate-600 bg-slate-50";

  const VRow = ({ label, value }: { label: string; value: string | null }) => (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium break-all">{value || "—"}</span>
    </div>
  );

  const handleApprove = () => {
    statusMutation.mutate(
      {
        id: vendor.id,
        isActive: true,
        isBanned: false,
        banReason: null,
        approvalStatus: "approved",
        approvalNote: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast({
            title: "Vendor approved",
            description: `${vendor.storeName || vendor.name} is now active.`,
          });
          onClose();
        },
        onError: (e: any) =>
          toast({
            title: "Failed",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      }
    );
  };

  const handleReject = () => {
    if (!note.trim()) {
      toast({ title: "Rejection note required", variant: "destructive" });
      return;
    }
    statusMutation.mutate(
      {
        id: vendor.id,
        isActive: false,
        isBanned: false,
        banReason: note.trim(),
        approvalStatus: "rejected",
        approvalNote: note.trim(),
      },
      {
        onSuccess: () => {
          toast({ title: "Vendor rejected", description: "Vendor has been notified." });
          onClose();
        },
        onError: (e: any) =>
          toast({
            title: "Failed",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      }
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-blue-600" /> Verify Vendor —{" "}
            {vendor.storeName || vendor.name}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1 space-y-4">
          {/* Core identity */}
          <div>
            <p className="text-muted-foreground mb-2 text-[10px] font-bold tracking-wider uppercase">
              Identity
            </p>
            <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
              <VRow label="Store Name" value={vendor.storeName || null} />
              <VRow label="Owner" value={vendor.name || null} />
              <VRow label="Phone" value={vendor.phone || null} />
              <VRow label="Email" value={vendor.email || null} />
              <VRow label="Category" value={vendor.storeCategory || null} />
              <VRow
                label="Applied"
                value={vendor.createdAt ? new Date(vendor.createdAt).toLocaleDateString() : null}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Status</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${vendor.approvalStatus === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
                >
                  {vendor.approvalStatus || "pending"}
                </span>
              </div>
            </div>
          </div>

          {/* Business documents */}
          <div>
            <p className="text-muted-foreground mb-2 text-[10px] font-bold tracking-wider uppercase">
              Business Documents
            </p>
            <div className="border-border space-y-2 rounded-xl border bg-slate-50 p-4 text-sm">
              <VRow label="Business Name" value={businessName} />
              <VRow label="Business Type" value={businessType} />
              <VRow label="NTN / Tax No." value={ntn} />
              <VRow label="Store Address" value={storeAddress} />
            </div>
          </div>

          {/* KYC */}
          <div>
            <p className="text-muted-foreground mb-2 text-[10px] font-bold tracking-wider uppercase">
              KYC / Identity
            </p>
            <div className="border-border space-y-2 rounded-xl border bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">KYC Status</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${kycColor}`}
                >
                  {kycStatus || "not submitted"}
                </span>
              </div>
              <VRow label="CNIC" value={cnic} />
              <VRow label="National ID" value={nationalId} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tier</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                    tier === "gold"
                      ? "border-yellow-200 bg-yellow-50 text-yellow-600"
                      : tier === "silver"
                        ? "border-slate-200 bg-slate-100 text-slate-600"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {tier || "bronze"}
                </span>
              </div>
            </div>
          </div>

          {/* Approval note */}
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Note (required for rejection)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Documents incomplete, CNIC missing, or reason for rejection..."
              rows={2}
              className="border-input bg-background focus:ring-ring w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={onClose}
              disabled={statusMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="flex-1 rounded-xl border-red-200 text-red-700 hover:bg-red-50"
              onClick={handleReject}
              disabled={statusMutation.isPending}
            >
              <XCircle className="mr-1.5 h-4 w-4" /> Reject
            </Button>
            <Button
              className="flex-1 rounded-xl bg-green-600 text-white hover:bg-green-700"
              onClick={handleApprove}
              disabled={statusMutation.isPending}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function exportVendorsCSV(vendors: any[]) {
  const header = "ID,Store,Owner,Phone,Status,Orders,Revenue,Wallet,Joined";
  const rows = vendors.map((v: any) =>
    [
      v.id,
      v.storeName || "",
      v.name || "",
      v.phone || "",
      v.isBanned ? "banned" : !v.isActive ? "blocked" : "active",
      v.totalOrders || 0,
      v.totalRevenue || 0,
      v.walletBalance,
      v.createdAt?.slice(0, 10) || "",
    ].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `vendors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ══════════ Main Vendors Page ══════════ */
export default function Vendors() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useVendors();
  const { data: settingsData } = usePlatformSettings();
  const overrideSuspM = useOverrideSuspension("vendors");
  const { data: daData } = useDeliveryAccess();
  const addWhitelistM = useAddWhitelistEntry();
  const deleteWhitelistM = useDeleteWhitelistEntry();
  const { data: reqData } = useDeliveryAccessRequests();
  const resolveReqM = useResolveDeliveryRequest();
  const { toast } = useToast();
  const canWrite = useHasPermission("vendors.edit");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [walletModal, setWalletModal] = useState<any>(null);
  const [suspendModal, setSuspendModal] = useState<any>(null);
  const [commModal, setCommModal] = useState<any>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStore, setInviteStore] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const invitePhoneRef = useRef<HTMLInputElement>(null);

  const openInvite = useCallback(() => {
    setInvitePhone("");
    setInviteEmail("");
    setInviteStore("");
    setInviteOpen(true);
    setTimeout(() => invitePhoneRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    window.addEventListener("admin:new-item", openInvite);
    return () => window.removeEventListener("admin:new-item", openInvite);
  }, [openInvite]);

  const handleInviteVendor = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!invitePhone.trim() && !inviteEmail.trim()) {
        toast({ title: "Phone or email required", variant: "destructive" });
        return;
      }
      setInviteSending(true);
      try {
        const res: any = await adminFetch("/vendors/invite", {
          method: "POST",
          body: JSON.stringify({
            phone: invitePhone.trim() || undefined,
            email: inviteEmail.trim() || undefined,
            name: inviteStore.trim() || undefined,
          }),
        });
        const channelLabel =
          res?.channel === "push"
            ? "Push notification sent"
            : res?.channel === "email"
              ? "Email sent"
              : "Invite logged";
        toast({
          title: "Invitation sent",
          description: `${channelLabel} to ${invitePhone.trim() || inviteEmail.trim()}`,
        });
        setInviteOpen(false);
      } catch (err: unknown) {
        toast({
          title: "Failed to invite vendor",
          description: err instanceof Error ? err.message : "Please try again",
          variant: "destructive",
        });
      }
      setInviteSending(false);
    },
    [invitePhone, inviteEmail, inviteStore, toast]
  );

  const settings: any[] = settingsData?.settings || [];
  const vendorCommissionPct = parseFloat(
    settings.find((s: any) => s.key === "vendor_commission_pct")?.value ??
      String(PLATFORM_DEFAULTS.vendorCommissionPct)
  );
  const vendorShare = 1 - vendorCommissionPct / 100;

  const vendors: any[] = data?.vendors || [];
  const deliveryMode = daData?.mode || "all";
  const vendorWhitelistMap = new Map<string, string>();
  (daData?.whitelist || [])
    .filter((w: any) => w.type === "vendor" && w.status === "active")
    .forEach((w: any) => vendorWhitelistMap.set(w.targetId, w.id));
  const whitelistedVendorIds = new Set(vendorWhitelistMap.keys());
  const pendingRequests: any[] = reqData?.requests || [];
  const vendorPendingReqs = new Map<string, any[]>();
  pendingRequests
    .filter((r: any) => r.status === "pending")
    .forEach((r: any) => {
      const arr = vendorPendingReqs.get(r.vendorId) || [];
      arr.push(r);
      vendorPendingReqs.set(r.vendorId, arr);
    });

  const filtered = vendors.filter((v: any) => {
    const q = search.toLowerCase();
    const matchSearch =
      (v.storeName || "").toLowerCase().includes(q) ||
      (v.name || "").toLowerCase().includes(q) ||
      (v.phone || "").includes(q);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && v.isActive && !v.isBanned) ||
      (statusFilter === "pending" && v.approvalStatus === "pending") ||
      (statusFilter === "blocked" &&
        !v.isActive &&
        !v.isBanned &&
        v.approvalStatus !== "pending") ||
      (statusFilter === "banned" && v.isBanned);
    const matchDate =
      (!dateFrom || new Date(v.createdAt) >= new Date(dateFrom)) &&
      (!dateTo || new Date(v.createdAt) <= new Date(dateTo + "T23:59:59"));
    return matchSearch && matchStatus && matchDate;
  });

  const totalEarnings = vendors.reduce((s: number, v: any) => s + v.totalRevenue * vendorShare, 0);
  const totalWallet = vendors.reduce((s: number, v: any) => s + v.walletBalance, 0);
  const activeVendors = vendors.filter((v: any) => v.isActive && !v.isBanned).length;
  const pendingVendors = vendors.filter((v: any) => v.approvalStatus === "pending").length;
  const suspendedVendors = vendors.filter(
    (v: any) => (!v.isActive || v.isBanned) && v.approvalStatus !== "pending"
  ).length;

  const getStatusBadge = (v: any) => {
    if (v.isBanned) return <StatusBadge status="banned" size="xs" />;
    if (v.approvalStatus === "pending") return <StatusBadge status="pending_approval" size="xs" />;
    if (!v.isActive) return <StatusBadge status="inactive" size="xs" label="Blocked" />;
    if (v.storeIsOpen) return <StatusBadge status="active" size="xs" label="Open" />;
    return <StatusBadge status="offline" size="xs" label="Closed" />;
  };

  const [verifyModal, setVerifyModal] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tierUpdating, setTierUpdating] = useState<string | null>(null);
  const [bulkConfirmAction, setBulkConfirmAction] = useState<"approve" | "suspend" | null>(null);
  const [bulkActing, setBulkActing] = useState(false);

  // Declare qc and sort state BEFORE any callbacks that close over them
  const qc = useQueryClient();

  const [sortKey, setSortKey] = useState<"storeName" | "totalRevenue" | "walletBalance" | null>(
    null
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleVendorSort = useCallback((key: "storeName" | "totalRevenue" | "walletBalance") => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a: any, b: any) => {
      const av = sortKey === "storeName" ? (a.storeName || "").toLowerCase() : (a[sortKey] ?? 0);
      const bv = sortKey === "storeName" ? (b.storeName || "").toLowerCase() : (b[sortKey] ?? 0);

      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleBulkApprove = useCallback(async () => {
    setBulkActing(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) =>
        adminFetch(`/vendors/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: true, isBanned: false, approvalStatus: "approved" }),
        })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast({ title: `${succeeded} approved, ${failed} failed`, variant: "destructive" });
    } else {
      toast({ title: `${succeeded} vendor${succeeded !== 1 ? "s" : ""} approved` });
    }
    setSelectedIds(new Set());
    setBulkActing(false);
    setBulkConfirmAction(null);
    await qc.invalidateQueries({ queryKey: ["admin-vendors"] });
  }, [selectedIds, toast, qc]);

  const handleBulkSuspend = useCallback(async () => {
    setBulkActing(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) =>
        adminFetch(`/vendors/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: false, isBanned: false }),
        })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast({ title: `${succeeded} suspended, ${failed} failed`, variant: "destructive" });
    } else {
      toast({ title: `${succeeded} vendor${succeeded !== 1 ? "s" : ""} suspended` });
    }
    setSelectedIds(new Set());
    setBulkActing(false);
    setBulkConfirmAction(null);
    await qc.invalidateQueries({ queryKey: ["admin-vendors"] });
  }, [selectedIds, toast, qc]);

  const handleBulkExport = useCallback(() => {
    const selected = sortedFiltered.filter((v: any) => selectedIds.has(v.id));
    exportVendorsCSV(selected);
  }, [selectedIds, sortedFiltered]);

  const handleTierChange = useCallback(
    async (vendorId: string, tier: VendorTier) => {
      setTierUpdating(vendorId);
      try {
        await adminFetch(`/vendors/${vendorId}/tier`, {
          method: "PATCH",
          body: JSON.stringify({ tier }),
        });
        await qc.invalidateQueries({ queryKey: ["admin-vendors"] });
        toast({ title: "Tier updated", description: `Vendor tier set to ${tier}.` });
      } catch (e: unknown) {
        toast({
          title: "Failed to update tier",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      }
      setTierUpdating(null);
    },
    [qc, toast]
  );

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["admin-vendors"] });
  }, [qc]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Vendors page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh onRefresh={handlePullRefresh} className="space-y-6">
        <PageHeader
          icon={Store}
          title="Vendors"
          subtitle={`${vendors.length} total · ${activeVendors} active${pendingVendors > 0 ? ` · ${pendingVendors} pending` : ""} · ${suspendedVendors} suspended`}
          iconBgClass="bg-orange-100"
          iconColorClass="text-orange-600"
          actions={
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportVendorsCSV(filtered)}
                  className="h-9 gap-2 rounded-xl"
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
                <button
                  onClick={() => setLocation("/settings?cat=vendor")}
                  className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Vendor Config
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="h-9 gap-2 rounded-xl"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />{" "}
                  {T("refresh")}
                </Button>
              </div>
              <LastUpdated
                dataUpdatedAt={dataUpdatedAt}
                onRefresh={refetch}
                isRefreshing={isFetching}
              />
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                icon={Store}
                label="Total Vendors"
                value={vendors.length}
                iconBgClass="bg-orange-100"
                iconColorClass="text-orange-600"
              />
              <StatCard
                icon={CheckCircle2}
                label="Active Stores"
                value={activeVendors}
                iconBgClass="bg-green-100"
                iconColorClass="text-green-600"
              />
              <StatCard
                icon={TrendingUp}
                label="Total Earnings"
                value={formatCurrency(totalEarnings)}
                iconBgClass="bg-blue-100"
                iconColorClass="text-blue-600"
              />
              <StatCard
                icon={Wallet}
                label="Wallet Pending"
                value={formatCurrency(totalWallet)}
                iconBgClass="bg-amber-100"
                iconColorClass="text-amber-600"
              />
            </>
          )}
        </div>

        {/* Filters */}
        <Card className="border-border/50 space-y-3 rounded-2xl p-4 shadow-sm">
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search store name, vendor name, phone..."
            filters={
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-muted/30 h-10 w-full rounded-xl sm:w-44">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending Approval</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: "storeName" as const, label: "Name" },
              { key: "totalRevenue" as const, label: "Revenue" },
              { key: "walletBalance" as const, label: "Wallet" },
            ].map((col) => (
              <button
                key={col.key}
                onClick={() => toggleVendorSort(col.key)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${sortKey === col.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
              >
                {col.label}
                {sortKey === col.key ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-50" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-muted/30 h-9 w-32 rounded-xl text-xs"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-muted/30 h-9 w-32 rounded-xl text-xs"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-primary text-xs hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </Card>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl bg-indigo-600 px-4 py-3 text-white shadow-lg">
            <span className="text-sm font-semibold">
              {selectedIds.size} vendor{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() => setBulkConfirmAction("approve")}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve All
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() => setBulkConfirmAction("suspend")}
              >
                <Ban className="mr-1 h-3.5 w-3.5" /> Suspend All
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={handleBulkExport}
              >
                <Download className="mr-1 h-3.5 w-3.5" /> Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-white hover:bg-white/20"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          </div>
        )}

        {/* Vendors Table/Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-muted h-24 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <Card className="border-border/50 rounded-2xl">
            <CardContent className="p-12 text-center">
              <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-red-400" />
              <p className="text-foreground mb-1 font-semibold">Failed to load vendors</p>
              <p className="text-muted-foreground mb-4 text-sm">
                {(error as any)?.message || "An unexpected error occurred."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-border/50 rounded-2xl">
            <CardContent className="p-12 text-center">
              <Store className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
              <p className="text-muted-foreground font-medium">No vendors found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedFiltered.map((v: any) => (
              <Card
                key={v.id}
                className={`border-border/50 rounded-2xl shadow-sm transition-shadow hover:shadow-md ${selectedIds.has(v.id) ? "border-indigo-300 ring-2 ring-indigo-500" : ""}`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {/* Checkbox + Store Info */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(v.id)}
                        onChange={() => toggleSelect(v.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded accent-indigo-600"
                        onClick={(e) => e.stopPropagation()}
                      />

                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-2xl">
                        🏪
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-foreground truncate text-sm font-bold">
                            {v.storeName || "Unnamed Store"}
                          </p>
                          {getStatusBadge(v)}
                          <TierBadge tier={v.accountLevel as VendorTier} />

                          {(deliveryMode === "stores" || deliveryMode === "both") &&
                            (whitelistedVendorIds.has(v.id) ? (
                              <Badge
                                className="cursor-pointer gap-1 border-blue-200 bg-blue-100 text-[10px] text-blue-700 hover:bg-blue-200"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  const entryId = vendorWhitelistMap.get(v.id);
                                  if (entryId)
                                    deleteWhitelistM.mutate(entryId, {
                                      onSuccess: () =>
                                        toast({
                                          title: "Delivery disabled",
                                          description: `${v.storeName || "Store"} removed from delivery whitelist`,
                                        }),
                                      onError: (err: any) =>
                                        toast({
                                          title: "Failed",
                                          description: err.message,
                                          variant: "destructive",
                                        }),
                                    });
                                }}
                              >
                                <Truck className="h-2.5 w-2.5" /> Delivery
                              </Badge>
                            ) : (
                              <Badge
                                className="cursor-pointer gap-1 border-gray-200 bg-gray-100 text-[10px] text-gray-500 hover:bg-gray-200"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  addWhitelistM.mutate(
                                    { type: "vendor", targetId: v.id, serviceType: "all" },
                                    {
                                      onSuccess: () =>
                                        toast({
                                          title: "Delivery enabled",
                                          description: `${v.storeName || "Store"} added to delivery whitelist`,
                                        }),
                                      onError: (err: any) =>
                                        toast({
                                          title: "Failed",
                                          description: err.message,
                                          variant: "destructive",
                                        }),
                                    }
                                  );
                                }}
                              >
                                <Truck className="h-2.5 w-2.5" /> No Delivery
                              </Badge>
                            ))}
                          {vendorPendingReqs.has(v.id) && (
                            <Badge
                              className="cursor-pointer gap-1 border-yellow-200 bg-yellow-100 text-[10px] text-yellow-700 hover:bg-yellow-200"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                const reqs = vendorPendingReqs.get(v.id) || [];
                                reqs.forEach((r: any) => {
                                  resolveReqM.mutate(
                                    { id: r.id, status: "approved" },
                                    {
                                      onSuccess: () => {
                                        toast({
                                          title: "Request approved",
                                          description: `Delivery access granted to ${v.storeName || "store"}`,
                                        });
                                      },
                                      onError: (err: any) =>
                                        toast({
                                          title: "Failed",
                                          description: err.message,
                                          variant: "destructive",
                                        }),
                                    }
                                  );
                                });
                              }}
                            >
                              <ClipboardList className="mr-1 inline h-2.5 w-2.5" />
                              {vendorPendingReqs.get(v.id)!.length} Request
                              {vendorPendingReqs.get(v.id)!.length > 1 ? "s" : ""} — Approve
                            </Badge>
                          )}
                          {v.storeCategory && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {v.storeCategory}
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs">{v.name || "—"}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {v.phone && (
                            <a
                              href={`tel:${v.phone}`}
                              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                            >
                              <Phone className="h-3 w-3" /> {v.phone}
                            </a>
                          )}
                          {v.phone && (
                            <a
                              href={`https://wa.me/92${v.phone.replace(/^(\+92|0)/, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                            >
                              <MessageCircle className="h-3 w-3" /> WhatsApp
                            </a>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          Joined {formatDate(v.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 sm:gap-4">
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Orders</p>
                        <p className="text-sm font-bold">{v.totalOrders}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Revenue</p>
                        <p className="text-sm font-bold text-green-600">
                          {formatCurrency(v.totalRevenue * vendorShare)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Wallet</p>
                        <p className="text-sm font-bold text-orange-600">
                          {formatCurrency(v.walletBalance)}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {v.approvalStatus === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setVerifyModal(v)}
                          disabled={!canWrite}
                          className="h-9 gap-1.5 rounded-xl border-blue-200 text-xs text-blue-700 hover:bg-blue-50"
                        >
                          <FileCheck className="h-3.5 w-3.5" /> Verify
                        </Button>
                      )}
                      {/* Tier selector */}
                      <div className="relative">
                        <select
                          value={v.accountLevel || ""}
                          onChange={(e) => {
                            if (e.target.value)
                              void handleTierChange(v.id, e.target.value as VendorTier);
                          }}
                          disabled={tierUpdating === v.id || !canWrite}
                          className="h-9 cursor-pointer appearance-none rounded-xl border border-amber-200 bg-amber-50 pr-6 pl-2 text-xs text-amber-700 focus:ring-2 focus:ring-amber-300 focus:outline-none disabled:opacity-50"
                          title="Set vendor tier"
                        >
                          <option value="">No Tier</option>
                          {TIERS.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <Award className="pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 text-amber-600" />
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCommModal(v)}
                        disabled={!canWrite}
                        className="h-9 gap-1.5 rounded-xl border-purple-200 text-xs text-purple-700 hover:bg-purple-50"
                      >
                        <Percent className="h-3.5 w-3.5" /> Commission
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWalletModal(v)}
                        disabled={!canWrite}
                        className="h-9 gap-1.5 rounded-xl border-orange-200 text-xs text-orange-700 hover:bg-orange-50"
                      >
                        <Wallet className="h-3.5 w-3.5" /> Wallet
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSuspendModal(v)}
                        disabled={!canWrite}
                        className={`h-9 gap-1.5 rounded-xl text-xs ${v.isActive && !v.isBanned ? "border-red-200 text-red-700 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                      >
                        {v.isActive && !v.isBanned ? (
                          <>
                            <Ban className="h-3.5 w-3.5" /> Suspend
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/account-conditions?userId=${v.id}`)}
                        className="h-9 gap-1.5 rounded-xl border-violet-200 text-xs text-violet-700 hover:bg-violet-50"
                        title="Conditions"
                      >
                        <Gavel className="h-3.5 w-3.5" /> Conditions
                      </Button>
                      {v.autoSuspendedAt && !v.adminOverrideSuspension && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            overrideSuspM.mutate(v.id, {
                              onSuccess: () =>
                                toast({
                                  title: "Suspension overridden",
                                  description: "Vendor is now active again.",
                                }),
                              onError: (e: any) =>
                                toast({
                                  title: "Failed",
                                  description: e instanceof Error ? e.message : String(e),
                                  variant: "destructive",
                                }),
                            });
                          }}
                          disabled={overrideSuspM.isPending}
                          className="h-9 gap-1.5 rounded-xl border-purple-200 text-xs text-purple-700 hover:bg-purple-50"
                        >
                          <Settings2 className="h-3.5 w-3.5" /> Override Suspend
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Pending orders warning */}
                  {v.pendingOrders > 0 && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <Package className="h-4 w-4 text-amber-600" />
                      <p className="text-xs font-semibold text-amber-700">
                        {v.pendingOrders} pending order{v.pendingOrders > 1 ? "s" : ""} waiting
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modals */}
        {walletModal && (
          <WalletAdjustModal
            mode="vendor"
            subject={walletModal}
            onClose={() => setWalletModal(null)}
          />
        )}
        {suspendModal && (
          <SuspendModal vendor={suspendModal} onClose={() => setSuspendModal(null)} />
        )}
        {commModal && (
          <CommissionModal
            vendor={commModal}
            defaultPct={vendorCommissionPct}
            onClose={() => setCommModal(null)}
          />
        )}
        {verifyModal && (
          <VendorVerificationDrawer vendor={verifyModal} onClose={() => setVerifyModal(null)} />
        )}

        {/* Invite Vendor Sheet (triggered by N shortcut) */}
        <AdminFormSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          title="Invite Vendor"
          description="Send an invitation to a new vendor via phone or email."
          busy={inviteSending}
          width="sm:max-w-sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1 rounded-xl"
                onClick={() => setInviteOpen(false)}
                disabled={inviteSending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="vendor-invite-form"
                className="h-9 flex-1 rounded-xl"
                disabled={inviteSending}
              >
                {inviteSending ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {inviteSending ? "Sending…" : "Send Invite"}
              </Button>
            </>
          }
        >
          <form id="vendor-invite-form" onSubmit={handleInviteVendor} className="space-y-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Phone Number
              </label>
              <Input
                ref={invitePhoneRef}
                type="tel"
                placeholder="+92 300 1234567"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Email (optional)
              </label>
              <Input
                type="email"
                placeholder="vendor@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Store Name (optional)
              </label>
              <Input
                type="text"
                placeholder="Store name"
                value={inviteStore}
                onChange={(e) => setInviteStore(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
          </form>
        </AdminFormSheet>
        <ConfirmDialog
          open={!!bulkConfirmAction}
          title={
            bulkConfirmAction === "approve"
              ? `Approve ${selectedIds.size} Vendor${selectedIds.size !== 1 ? "s" : ""}?`
              : `Suspend ${selectedIds.size} Vendor${selectedIds.size !== 1 ? "s" : ""}?`
          }
          description={
            bulkConfirmAction === "approve"
              ? "These vendors will be approved and activated on the platform immediately."
              : "These vendors will be suspended and cannot accept new orders."
          }
          confirmLabel={bulkConfirmAction === "approve" ? "Approve All" : "Suspend All"}
          variant={bulkConfirmAction === "suspend" ? "destructive" : "default"}
          busy={bulkActing}
          onConfirm={() =>
            bulkConfirmAction === "approve" ? handleBulkApprove() : handleBulkSuspend()
          }
          onClose={() => {
            if (!bulkActing) setBulkConfirmAction(null);
          }}
        />
      </PullToRefresh>
    </ErrorBoundary>
  );
}
