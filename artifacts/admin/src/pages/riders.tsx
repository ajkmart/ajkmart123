import { AdminFormSheet } from "@/components/AdminFormSheet";
import { ConfirmDialog, PromptDialog } from "@/components/ConfirmDialog";
import { PullToRefresh } from "@/components/PullToRefresh";
import { FilterBar, PageHeader, StatCard, StatCardSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LastUpdated } from "@/components/ui/LastUpdated";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  useAddRiderPenalty,
  useApproveUser,
  useBulkBanUsers,
  useDeleteRiderPenalty,
  useOverrideSuspension,
  useRejectUser,
  useRestrictRider,
  useRiderPenalties,
  useRiderRatings,
  useRiders,
  useToggleRiderOnline,
  useUnrestrictRider,
  useUpdateRiderStatus,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Bike,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  Gavel,
  Phone,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  Star,
  Trash2,
  Wallet,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useLocation } from "wouter";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WalletAdjustModal } from "@/components/WalletAdjustModal";

/* ── Suspend Modal ── */
function RiderSuspendModal({ rider, onClose }: { rider: any; onClose: () => void }) {
  const { toast } = useToast();
  const statusMutation = useUpdateRiderStatus();
  const [action, setAction] = useState<"active" | "blocked" | "banned">(
    rider.isBanned ? "banned" : !rider.isActive ? "blocked" : "active"
  );
  const [reason, setReason] = useState(rider.banReason || "");

  const handleSave = () => {
    statusMutation.mutate(
      {
        id: rider.id,
        isActive: action === "active",
        isBanned: action === "banned",
        banReason: action === "banned" ? reason : null,
      },
      {
        onSuccess: () => {
          toast({ title: "Rider status updated" });
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
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
          <DialogTitle>Rider Status — {rider.name || rider.phone}</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          {(
            [
              {
                key: "active",
                label: "Active",
                desc: "Rider can accept deliveries",
                color: "green",
              },
              {
                key: "blocked",
                label: "Temporarily Blocked",
                desc: "Suspend without ban",
                color: "amber",
              },
              {
                key: "banned",
                label: "Permanently Banned",
                desc: "Full ban with reason",
                color: "red",
              },
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

function RiderDetailDrawer({ rider, onClose }: { rider: any; onClose: () => void }) {
  const { toast } = useToast();
  const { data: penData, refetch: refetchPenalties } = useRiderPenalties(rider.id);
  const { data: ratData } = useRiderRatings(rider.id);
  const restrictMut = useRestrictRider();
  const unrestrictMut = useUnrestrictRider();
  const addPenaltyMut = useAddRiderPenalty();
  const deletePenaltyMut = useDeleteRiderPenalty();

  const [showAddPenalty, setShowAddPenalty] = useState(false);
  const [penType, setPenType] = useState("manual");
  const [penAmount, setPenAmount] = useState("");
  const [penReason, setPenReason] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const penalties: any[] = penData?.penalties || [];
  const ratings: any[] = ratData?.ratings || [];

  const handleRestrict = () => {
    restrictMut.mutate(rider.id, {
      onSuccess: () => {
        toast({ title: "Rider restricted" });
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };
  const handleUnrestrict = () => {
    unrestrictMut.mutate(rider.id, {
      onSuccess: () => {
        toast({ title: "Rider unrestricted" });
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleAddPenalty = () => {
    const amt = parseFloat(penAmount) || 0;
    addPenaltyMut.mutate(
      { riderId: rider.id, type: penType, amount: amt, reason: penReason || undefined },
      {
        onSuccess: () => {
          toast({ title: "Penalty added" });
          setPenAmount("");
          setPenReason("");
          setPenType("manual");
          setShowAddPenalty(false);
          void refetchPenalties();
        },
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleDeletePenalty = (penaltyId: string) => {
    setDeletingId(penaltyId);
    deletePenaltyMut.mutate(
      { riderId: rider.id, penaltyId },
      {
        onSuccess: () => {
          toast({ title: "Penalty removed" });
          setDeletingId(null);
          void refetchPenalties();
        },
        onError: (e: any) => {
          toast({ title: "Failed", description: e.message, variant: "destructive" });
          setDeletingId(null);
        },
      }
    );
  };

  const isBusy = restrictMut.isPending || unrestrictMut.isPending;
  const [, navigate] = useLocation();

  return (
    <AdminFormSheet
      open
      onClose={onClose}
      title={`Rider Details — ${rider.name || rider.phone}`}
      description="Performance summary, penalties, and ratings."
      busy={isBusy}
      width="sm:max-w-lg"
      footer={
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            onClick={() => {
              navigate(`/transactions?userId=${rider.id}`);
              onClose();
            }}
            className="flex-1 gap-2 rounded-xl border-sky-300 text-sky-700 hover:bg-sky-50"
          >
            <Wallet className="h-4 w-4" /> View Wallet
          </Button>
          {rider.isRestricted ? (
            <Button
              onClick={handleUnrestrict}
              disabled={isBusy}
              className="flex-1 gap-2 rounded-xl bg-green-600 text-white hover:bg-green-700"
            >
              <ShieldCheck className="h-4 w-4" /> Unrestrict Rider
            </Button>
          ) : (
            <Button
              onClick={handleRestrict}
              disabled={isBusy}
              variant="outline"
              className="flex-1 gap-2 rounded-xl border-red-300 text-red-700 hover:bg-red-50"
            >
              <ShieldAlert className="h-4 w-4" /> Restrict Rider
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-[10px] font-bold text-red-500 uppercase">Cancels</p>
            <p className="text-xl font-extrabold text-red-700">{rider.cancelCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-[10px] font-bold text-amber-500 uppercase">Ignores</p>
            <p className="text-xl font-extrabold text-amber-700">{rider.ignoreCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-center">
            <p className="text-[10px] font-bold text-purple-500 uppercase">Penalties</p>
            <p className="text-xl font-extrabold text-purple-700">
              {formatCurrency(rider.penaltyTotal ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
            <p className="text-[10px] font-bold text-blue-500 uppercase">Rating</p>
            <p className="text-xl font-extrabold text-blue-700">
              {rider.avgRating ?? 0}{" "}
              <span className="text-xs font-normal">({rider.ratingCount ?? 0})</span>
            </p>
          </div>
        </div>

        {/* Penalty Management */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-foreground text-sm font-bold">Penalties</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddPenalty((v) => !v)}
              className="h-7 gap-1 rounded-lg border-red-200 px-2 text-[11px] text-red-700 hover:bg-red-50"
            >
              <Plus className="h-3 w-3" /> Add Penalty
            </Button>
          </div>

          {showAddPenalty && (
            <div className="mb-3 space-y-2 rounded-xl border border-red-100 bg-red-50/50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-red-700 uppercase">
                    Type
                  </label>
                  <select
                    value={penType}
                    onChange={(e) => setPenType(e.target.value)}
                    className="h-8 w-full rounded-lg border border-red-200 bg-white px-2 text-xs"
                  >
                    <option value="manual">Manual</option>
                    <option value="cancel">Cancellation</option>
                    <option value="ignore">Ignored Request</option>
                    <option value="complaint">Customer Complaint</option>
                    <option value="lateness">Lateness</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-red-700 uppercase">
                    Amount (Rs.)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={penAmount}
                    onChange={(e) => setPenAmount(e.target.value)}
                    className="h-8 rounded-lg border-red-200 text-xs"
                  />
                </div>
              </div>
              <Input
                placeholder="Reason (optional)"
                value={penReason}
                onChange={(e) => setPenReason(e.target.value)}
                className="h-8 rounded-lg border-red-200 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddPenalty(false)}
                  className="h-8 flex-1 rounded-lg text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddPenalty}
                  disabled={addPenaltyMut.isPending}
                  className="h-8 flex-1 rounded-lg bg-red-600 text-xs text-white hover:bg-red-700"
                >
                  {addPenaltyMut.isPending ? "Adding..." : "Apply Penalty"}
                </Button>
              </div>
            </div>
          )}

          {penalties.length > 0 ? (
            <div className="space-y-1.5">
              {penalties.map((p: any) => (
                <div
                  key={p.id}
                  className="bg-muted/30 flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {p.type === "cancel" ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    ) : (
                      <SkipForward className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="text-muted-foreground truncate">{p.reason || p.type}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.amount > 0 && (
                      <span className="font-bold text-red-600">-{formatCurrency(p.amount)}</span>
                    )}
                    <span className="text-muted-foreground">{formatDate(p.createdAt)}</span>
                    <button
                      onClick={() => handleDeletePenalty(p.id)}
                      disabled={deletingId === p.id}
                      title="Remove penalty"
                      className="ml-1 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-2 text-center text-xs">No penalties on record</p>
          )}
        </div>

        {ratings.length > 0 && (
          <div>
            <p className="text-foreground mb-2 text-sm font-bold">Recent Ratings</p>
            <div className="space-y-1.5">
              {ratings.map((rt: any) => (
                <div
                  key={rt.id}
                  className="bg-muted/30 flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-bold">{rt.stars}/5</span>
                    {rt.comment && (
                      <span className="text-muted-foreground max-w-[180px] truncate">
                        "{rt.comment}"
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">{formatDate(rt.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminFormSheet>
  );
}

function exportRidersCSV(riders: any[]) {
  const header = "ID,Name,Phone,Status,Wallet,Joined";
  const rows = riders.map((r: any) =>
    [
      r.id,
      r.name || "",
      r.phone || "",
      r.isBanned ? "banned" : !r.isActive ? "blocked" : r.isOnline ? "online" : "offline",
      r.walletBalance,
      r.createdAt?.slice(0, 10) || "",
    ].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `riders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ══════════ Main Riders Page ══════════ */
export default function Riders() {
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useRiders();
  const toggleOnlineMutation = useToggleRiderOnline();
  const overrideSuspM = useOverrideSuspension("riders");
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [walletModal, setWalletModal] = useState<any>(null);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [suspendModal, setSuspendModal] = useState<any>(null);
  const [detailModal, setDetailModal] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBanConfirm, setBulkBanConfirm] = useState(false);
  const bulkBanMutation = useBulkBanUsers();

  const riders: any[] = data?.users || data?.riders || [];

  const handleBulkBan = useCallback(() => {
    const ids = Array.from(selectedIds);
    bulkBanMutation.mutate(
      { ids, action: "ban" },
      {
        onSuccess: () => {
          toast({ title: `${ids.length} rider${ids.length !== 1 ? "s" : ""} banned` });
          setSelectedIds(new Set());
          setBulkBanConfirm(false);
        },
        onError: (e) =>
          toast({ title: "Bulk ban failed", description: e.message, variant: "destructive" }),
      }
    );
  }, [selectedIds, bulkBanMutation, toast]);

  const handleToggleOnline = (r: any) => {
    toggleOnlineMutation.mutate(
      { id: r.id, isOnline: !r.isOnline },
      {
        onSuccess: () => toast({ title: r.isOnline ? "Rider set offline" : "Rider set online" }),
        onError: (e) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  type RiderSortKey = "name" | "status" | "walletBalance" | "avgRating";
  const [sortKey, setSortKey] = useState<RiderSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: RiderSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  function SortIcon({ col }: { col: RiderSortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-0.5 inline h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="text-primary ml-0.5 inline h-3 w-3" />
    ) : (
      <ArrowDown className="text-primary ml-0.5 inline h-3 w-3" />
    );
  }

  const filtered = riders.filter((r: any) => {
    const q = search.toLowerCase();
    const matchSearch = (r.name || "").toLowerCase().includes(q) || (r.phone || "").includes(q);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "pending" && r.approvalStatus === "pending") ||
      (statusFilter === "online" && r.isOnline && r.isActive) ||
      (statusFilter === "offline" && !r.isOnline && r.isActive && r.approvalStatus !== "pending") ||
      (statusFilter === "blocked" &&
        !r.isActive &&
        !r.isBanned &&
        r.approvalStatus !== "pending") ||
      (statusFilter === "banned" && r.isBanned);
    const matchDate =
      (!dateFrom || new Date(r.createdAt) >= new Date(dateFrom)) &&
      (!dateTo || new Date(r.createdAt) <= new Date(dateTo + "T23:59:59"));
    return matchSearch && matchStatus && matchDate;
  });

  const statusRank = (r: any) => {
    if (r.isBanned) return 4;
    if (!r.isActive) return 3;
    if (r.approvalStatus === "pending") return 2;
    if (!r.isOnline) return 1;
    return 0;
  };

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return dir * (a.name || "").localeCompare(b.name || "");
      if (sortKey === "status") return dir * (statusRank(a) - statusRank(b));
      if (sortKey === "walletBalance")
        return dir * (Number(a.walletBalance) - Number(b.walletBalance));
      if (sortKey === "avgRating")
        return dir * (Number(a.avgRating || 0) - Number(b.avgRating || 0));
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const onlineRiders = riders.filter((r: any) => r.isOnline && r.isActive).length;
  const _activeRiders = riders.filter((r: any) => r.isActive && !r.isBanned).length;
  const pendingRiders = riders.filter((r: any) => r.approvalStatus === "pending").length;
  const totalWallet = riders.reduce((s: number, r: any) => s + r.walletBalance, 0);

  const getRiderStatus = (r: any): { status: string; label: string } => {
    if (r.approvalStatus === "pending")
      return { status: "pending_approval", label: "Pending Approval" };
    if (r.isBanned) return { status: "banned", label: "Banned" };
    if (r.isRestricted) return { status: "restricted", label: "Restricted" };
    if (!r.isActive) return { status: "blocked", label: "Blocked" };
    if (r.isOnline) return { status: "online", label: "Online" };
    return { status: "offline", label: "Offline" };
  };

  const approveM = useApproveUser();
  const rejectM = useRejectUser();

  const handleApprove = (r: any) => {
    approveM.mutate(
      { id: r.id },
      {
        onSuccess: () => {
          toast({ title: "Rider approved" });
          void refetch();
        },
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleReject = (r: any) => {
    setRejectTarget(r);
  };
  const submitReject = (note: string) => {
    if (!rejectTarget) return;
    const r = rejectTarget;
    setRejectTarget(null);
    rejectM.mutate(
      { id: r.id, note },
      {
        onSuccess: () => {
          toast({ title: "Rider rejected" });
          void refetch();
        },
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const qc = useQueryClient();
  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["admin-riders"] });
  }, [qc]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Riders page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh onRefresh={handlePullRefresh} className="space-y-6">
        <PageHeader
          icon={Bike}
          title="Riders"
          subtitle={`${riders.length} total · ${onlineRiders} online now${pendingRiders > 0 ? ` · ${pendingRiders} pending` : ""}`}
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
          actions={
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportRidersCSV(filtered)}
                  className="h-9 gap-2 rounded-xl"
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
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
                icon={Bike}
                label="Total Riders"
                value={riders.length}
                iconBgClass="bg-green-100"
                iconColorClass="text-green-600"
              />
              <StatCard
                icon={CheckCircle2}
                label="Online Now"
                value={onlineRiders}
                iconBgClass="bg-emerald-100"
                iconColorClass="text-emerald-600"
              />
              <StatCard
                icon={AlertTriangle}
                label="Pending Approval"
                value={pendingRiders}
                iconBgClass="bg-yellow-100"
                iconColorClass="text-yellow-600"
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
            placeholder="Search by name or phone..."
            filters={
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-muted/30 h-10 w-full rounded-xl sm:w-44">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Riders</SelectItem>
                  <SelectItem value="pending">Pending Approval</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-xs font-medium">Sort:</span>
            {(
              [
                { key: "name" as const, label: "Name" },
                { key: "status" as const, label: "Status" },
                { key: "walletBalance" as const, label: "Wallet" },
                { key: "avgRating" as const, label: "Rating" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSort(opt.key)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${sortKey === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 text-muted-foreground hover:border-primary/40"}`}
              >
                {opt.label}
                <SortIcon col={opt.key} />
              </button>
            ))}
          </div>
        </Card>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl bg-red-600 px-4 py-3 text-white shadow-lg">
            <span className="text-sm font-semibold">
              {selectedIds.size} rider{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() => setBulkBanConfirm(true)}
              >
                <Ban className="mr-1 h-3.5 w-3.5" /> Ban Selected
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

        {/* Riders List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-20 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : sortedFiltered.length === 0 ? (
          <Card className="border-border/50 rounded-2xl">
            <CardContent className="p-12 text-center">
              <Bike className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
              <p className="text-muted-foreground font-medium">
                No riders match the current filters
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedFiltered.map((r: any) => (
              <Card
                key={r.id}
                className="border-border/50 rounded-2xl shadow-sm transition-shadow hover:shadow-md"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {/* Rider Info */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded accent-blue-600"
                        checked={selectedIds.has(r.id)}
                        onChange={() =>
                          setSelectedIds((prev) => {
                            const s = new Set(prev);
                            s.has(r.id) ? s.delete(r.id) : s.add(r.id);
                            return s;
                          })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${r.name || "rider"}`}
                      />
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ${r.isOnline && r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                      >
                        {r.name ? r.name[0].toUpperCase() : "R"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-foreground text-sm font-bold">
                            {r.name || "Unknown Rider"}
                          </p>
                          <StatusBadge {...getRiderStatus(r)} size="xs" />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <a
                            href={`tel:${r.phone}`}
                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                          >
                            <Phone className="h-3 w-3" /> {r.phone}
                          </a>
                          <a
                            href={`https://wa.me/92${r.phone.replace(/^(\+92|92|0)/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                          >
                            💬 WhatsApp
                          </a>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          Joined {formatDate(r.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-center">
                      <div>
                        <p className="text-muted-foreground text-xs">Wallet</p>
                        <p className="text-sm font-bold text-green-700">
                          {formatCurrency(r.walletBalance)}
                        </p>
                      </div>
                      {(r.cancelCount > 0 || r.ignoreCount > 0) && (
                        <div className="flex gap-2">
                          {r.cancelCount > 0 && (
                            <div title="Total cancels">
                              <p className="text-[10px] font-bold text-red-500">Cancels</p>
                              <p className="text-sm font-bold text-red-600">{r.cancelCount}</p>
                            </div>
                          )}
                          {r.ignoreCount > 0 && (
                            <div title="Total ignores">
                              <p className="text-[10px] font-bold text-amber-500">Ignores</p>
                              <p className="text-sm font-bold text-amber-600">{r.ignoreCount}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {r.avgRating > 0 && (
                        <div title="Average rating">
                          <p className="text-[10px] font-bold text-blue-500">Rating</p>
                          <p className="text-sm font-bold text-blue-600">
                            {r.avgRating} <Star className="inline h-3 w-3 text-amber-400" />
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {r.approvalStatus === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(r)}
                            disabled={approveM.isPending}
                            className="h-9 gap-1.5 rounded-xl bg-green-600 text-xs text-white hover:bg-green-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(r)}
                            disabled={rejectM.isPending}
                            className="h-9 gap-1.5 rounded-xl border-red-200 text-xs text-red-700 hover:bg-red-50"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </>
                      )}
                      {r.isActive && !r.isBanned && r.approvalStatus !== "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleOnline(r)}
                          disabled={toggleOnlineMutation.isPending}
                          className={`h-9 gap-1.5 rounded-xl text-xs ${r.isOnline ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                        >
                          {r.isOnline ? (
                            <>
                              <WifiOff className="h-3.5 w-3.5" /> Set Offline
                            </>
                          ) : (
                            <>
                              <Wifi className="h-3.5 w-3.5" /> Set Online
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWalletModal(r)}
                        className="h-9 gap-1.5 rounded-xl border-green-200 text-xs text-green-700 hover:bg-green-50"
                      >
                        <Wallet className="h-3.5 w-3.5" /> Wallet
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSuspendModal(r)}
                        className={`h-9 gap-1.5 rounded-xl text-xs ${r.isActive && !r.isBanned ? "border-red-200 text-red-700 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                      >
                        {r.isActive && !r.isBanned ? (
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
                        onClick={() => setDetailModal(r)}
                        className="h-9 gap-1.5 rounded-xl border-blue-200 text-xs text-blue-700 hover:bg-blue-50"
                      >
                        <Eye className="h-3.5 w-3.5" /> Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/account-conditions?userId=${r.id}`)}
                        className="h-9 gap-1.5 rounded-xl border-violet-200 text-xs text-violet-700 hover:bg-violet-50"
                        title="Conditions"
                      >
                        <Gavel className="h-3.5 w-3.5" /> Conditions
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/transactions?userId=${r.id}`)}
                        className="h-9 gap-1.5 rounded-xl border-sky-200 text-xs text-sky-700 hover:bg-sky-50"
                        title="View Wallet"
                      >
                        <Wallet className="h-3.5 w-3.5" /> View Wallet
                      </Button>
                      {r.autoSuspendedAt && !r.adminOverrideSuspension && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            overrideSuspM.mutate(r.id, {
                              onSuccess: () =>
                                toast({
                                  title: "Suspension overridden",
                                  description: "Rider is now active again.",
                                }),
                              onError: (e: any) =>
                                toast({
                                  title: "Failed",
                                  description: e.message,
                                  variant: "destructive",
                                }),
                            });
                          }}
                          disabled={overrideSuspM.isPending}
                          className="h-9 gap-1.5 rounded-xl border-purple-200 text-xs text-purple-700 hover:bg-purple-50"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Override Suspend
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modals */}
        {walletModal && (
          <WalletAdjustModal
            mode="rider"
            subject={walletModal}
            onClose={() => setWalletModal(null)}
          />
        )}
        {suspendModal && (
          <RiderSuspendModal rider={suspendModal} onClose={() => setSuspendModal(null)} />
        )}
        {detailModal && (
          <RiderDetailDrawer rider={detailModal} onClose={() => setDetailModal(null)} />
        )}
        <ConfirmDialog
          open={bulkBanConfirm}
          title={`Ban ${selectedIds.size} Rider${selectedIds.size !== 1 ? "s" : ""}?`}
          description="These riders will be permanently banned and will not be able to accept new rides."
          confirmLabel="Ban All"
          variant="destructive"
          busy={bulkBanMutation.isPending}
          onConfirm={handleBulkBan}
          onClose={() => {
            if (!bulkBanMutation.isPending) setBulkBanConfirm(false);
          }}
        />
        <PromptDialog
          open={!!rejectTarget}
          title="Reject rider"
          description="Provide a reason (optional). The rider will be notified."
          placeholder="Rejection reason"
          confirmLabel="Reject"
          onClose={() => setRejectTarget(null)}
          onSubmit={submitReject}
        />
      </PullToRefresh>
    </ErrorBoundary>
  );
}
