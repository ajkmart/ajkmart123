import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SensitiveActionDialog } from "@/components/SensitiveActionDialog";
import { PageHeader, StatCardSkeleton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  useApproveWithdrawal,
  useBatchApproveWithdrawals,
  useBatchRejectWithdrawals,
  useRejectWithdrawal,
  useWithdrawalRequests,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { parseApiError } from "@/lib/errorParser";
import { formatCurrency } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BanknoteIcon,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Inbox,
  Landmark,
  PartyPopper,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const fc = formatCurrency;
const fd = (d: string | Date) =>
  new Date(d).toLocaleString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type StatusFilter = "all" | "pending" | "paid" | "rejected";

interface WithdrawalUser {
  roles?: string[];
  phone?: string;
  name?: string;
}

interface Withdrawal {
  id: string;
  amount: string | number;
  description: string;
  status: "pending" | "paid" | "rejected";
  paymentMethod?: string | null;
  createdAt: string | Date;
  user?: WithdrawalUser;
  adminNote?: string;
  refNo?: string;
}

interface BatchResult {
  approved?: string[];
  rejected?: string[];
}

function parseDesc(desc: string) {
  const parts = desc.replace("Withdrawal — ", "").split(" · ");
  return {
    bank: parts[0] || "—",
    account: parts[1] || "—",
    title: parts[2] || "—",
    note: parts[3] || "",
  };
}

function methodLabel(method: string | null) {
  if (!method) return "Bank";
  const m = method.toLowerCase();
  if (m.includes("jazzcash")) return "JazzCash";
  if (m.includes("easypaisa")) return "EasyPaisa";
  if (
    m.includes("bank") ||
    m.includes("hbl") ||
    m.includes("mcb") ||
    m.includes("ubl") ||
    m.includes("meezan") ||
    m.includes("alfalah") ||
    m.includes("nbp") ||
    m.includes("allied")
  )
    return "Bank";
  if (m.includes("wallet")) return "Wallet";
  return "Card";
}

function methodIcon(method: string | null | undefined): string {
  if (!method) return "🏦";
  const m = method.toLowerCase();
  if (m.includes("jazzcash")) return "📱";
  if (m.includes("easypaisa")) return "📲";
  if (m.includes("wallet")) return "👛";
  if (
    m.includes("bank") ||
    m.includes("hbl") ||
    m.includes("mcb") ||
    m.includes("ubl") ||
    m.includes("meezan") ||
    m.includes("alfalah") ||
    m.includes("nbp") ||
    m.includes("allied")
  )
    return "🏦";
  return "💳";
}

function roleColor(role: string) {
  if (role === "vendor") return "bg-orange-100 text-orange-700";
  if (role === "rider") return "bg-green-100 text-green-700";
  return "bg-blue-100 text-blue-700";
}

function ApproveModal({ w, onClose }: { w: Withdrawal; onClose: () => void }) {
  const [refNo, setRefNo] = useState("");
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const approve = useApproveWithdrawal();
  const { onError: onApproveError } = useErrorHandler({ title: "Error" });
  const parsed = parseDesc(w.description || "");

  const handleApprove = () => {
    if (!refNo.trim()) {
      toast({ title: "Reference number required", variant: "destructive" });
      return;
    }
    approve.mutate(
      { id: w.id, refNo: refNo.trim(), note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast({
            title: "Withdrawal approved",
            description: `${fc(Number(w.amount))} marked as paid — Ref: ${refNo}`,
          });
          onClose();
        },
        onError: (e: unknown) => {
          onApproveError(e);
          toast({ title: "Error", description: parseApiError(e), variant: "destructive" });
        },
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
      <DialogContent className="max-w-md overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-5">
          <DialogTitle className="text-lg font-extrabold text-white">
            Approve Withdrawal
          </DialogTitle>
          <p className="mt-0.5 text-sm text-green-200">Mark as paid and enter proof of transfer</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-2 rounded-xl bg-green-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Rider / Vendor</span>
              <span className="font-bold">{w.user?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Phone</span>
              <span className="font-bold">{w.user?.phone}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1 text-gray-500">
                <Landmark className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                {methodLabel(w.paymentMethod ?? null)}
              </span>
              <span className="font-bold">{parsed.bank}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Account</span>
              <span className="font-bold">{parsed.account}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Account Name</span>
              <span className="font-bold">{parsed.title}</span>
            </div>
            <div className="flex items-center justify-between border-t border-green-200 pt-1">
              <span className="font-semibold text-gray-600">Amount to Transfer</span>
              <span className="text-xl font-extrabold text-green-600">{fc(Number(w.amount))}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Transaction / Reference No. *
            </label>
            <input
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="e.g. TXN12345678 or JC-20240101"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm focus:border-green-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Note for Rider (Optional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Transferred via JazzCash"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm focus:border-green-400 focus:outline-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button autoFocus variant="outline" className="flex-1" onClick={onClose}>
              {T("cancel")}
            </Button>
            <Button
              className="flex-1 bg-green-600 font-bold text-white hover:bg-green-700"
              onClick={handleApprove}
              disabled={approve.isPending}
            >
              {approve.isPending ? T("processing") : "Confirm Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RejectModal({ w, onClose }: { w: Withdrawal; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const reject = useRejectWithdrawal();
  const { onError: onRejectError } = useErrorHandler({ title: "Error" });
  const parsed = parseDesc(w.description || "");

  const handleReject = () => {
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    reject.mutate(
      { id: w.id, reason: reason.trim() },
      {
        onSuccess: (data: { refunded?: number }) => {
          toast({
            title: "Withdrawal rejected",
            description: `${fc(data.refunded ?? Number(w.amount))} refunded to the rider's wallet.`,
          });
          onClose();
        },
        onError: (e: unknown) => {
          onRejectError(e);
          toast({ title: "Error", description: parseApiError(e), variant: "destructive" });
        },
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
      <DialogContent className="max-w-md overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-5">
          <DialogTitle className="text-lg font-extrabold text-white">Reject Withdrawal</DialogTitle>
          <p className="mt-0.5 text-sm text-red-200">
            Amount will be automatically refunded to rider's wallet
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-2 rounded-xl bg-red-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">User</span>
              <span className="font-bold">{w.user?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Method</span>
              <span className="font-bold">{parsed.bank}</span>
            </div>
            <div className="flex items-center justify-between border-t border-red-200 pt-1">
              <span className="font-semibold text-gray-600">Amount (will be refunded)</span>
              <span className="text-xl font-extrabold text-red-600">{fc(Number(w.amount))}</span>
            </div>
          </div>
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <p className="text-xs font-semibold text-amber-700">
              {fc(Number(w.amount))} will be refunded to the rider's wallet automatically and they
              will be notified.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Rejection Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Incorrect account details · Duplicate request · Account name mismatch"
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-red-400 focus:outline-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button autoFocus variant="outline" className="flex-1" onClick={onClose}>
              {T("cancel")}
            </Button>
            <Button
              className="flex-1 bg-red-600 font-bold text-white hover:bg-red-700"
              onClick={handleReject}
              disabled={reject.isPending}
            >
              {reject.isPending ? T("processing") : "Reject & Refund"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function exportWithdrawalsCSV(rows: Withdrawal[]) {
  const header = "ID,User,Phone,Role,Method,Amount,Status,Date";
  const lines = rows.map((w) =>
    [
      w.id,
      w.user?.name ?? "",
      w.user?.phone ?? "",
      w.user?.roles?.[0] ?? "",
      methodLabel(w.paymentMethod ?? null),
      Number(w.amount).toFixed(2),
      w.status,
      new Date(w.createdAt).toISOString().slice(0, 10),
    ].join(",")
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `withdrawals-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

export default function Withdrawals() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Withdrawal | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Withdrawal | null>(null);
  const [sensitiveApproveTarget, setSensitiveApproveTarget] = useState<Withdrawal | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRejectReason, setBatchRejectReason] = useState("");

  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading, refetch } = useWithdrawalRequests();
  const batchApprove = useBatchApproveWithdrawals();
  const batchReject = useBatchRejectWithdrawals();
  const { toast } = useToast();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  useEffect(() => {
    if (data) setLastRefreshed(new Date());
  }, [data]);

  const withdrawals: Withdrawal[] = data?.withdrawals || [];

  type WdSortKey = "amount" | "createdAt" | "status";
  const [wdSortKey, setWdSortKey] = useState<WdSortKey>("createdAt");
  const [wdSortDir, setWdSortDir] = useState<"asc" | "desc">("desc");

  const handleWdSort = (key: WdSortKey) => {
    if (wdSortKey === key) setWdSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setWdSortKey(key);
      setWdSortDir("asc");
    }
  };

  function WdSortIcon({ col }: { col: WdSortKey }) {
    if (wdSortKey !== col) return <ArrowUpDown className="ml-0.5 inline h-3 w-3 opacity-40" />;
    return wdSortDir === "asc" ? (
      <ArrowUp className="text-primary ml-0.5 inline h-3 w-3" />
    ) : (
      <ArrowDown className="text-primary ml-0.5 inline h-3 w-3" />
    );
  }

  const wdStatusOrder: Record<string, number> = { pending: 0, paid: 1, rejected: 2 };

  const rawFiltered =
    statusFilter === "all" ? withdrawals : withdrawals.filter((w) => w.status === statusFilter);
  const filtered = useMemo(() => {
    return [...rawFiltered].sort((a, b) => {
      const dir = wdSortDir === "asc" ? 1 : -1;
      if (wdSortKey === "amount") return dir * (Number(a.amount) - Number(b.amount));
      if (wdSortKey === "status")
        return dir * ((wdStatusOrder[a.status] ?? 9) - (wdStatusOrder[b.status] ?? 9));
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFiltered, wdSortKey, wdSortDir]);
  const pendingFiltered = filtered.filter((w) => w.status === "pending");

  const pendingCount = withdrawals.filter((w) => w.status === "pending").length;
  const pendingAmt = withdrawals
    .filter((w) => w.status === "pending")
    .reduce((s: number, w: Withdrawal) => s + Number(w.amount), 0);
  const paidCount = withdrawals.filter((w) => w.status === "paid").length;
  const rejectedCount = withdrawals.filter((w) => w.status === "rejected").length;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => {
    const pendingIds = pendingFiltered.map((w: Withdrawal) => w.id);
    setSelected((prev) => (prev.size === pendingIds.length ? new Set() : new Set(pendingIds)));
  };
  const handleBatchApprove = () => {
    if (selected.size === 0) return;
    batchApprove.mutate([...selected], {
      onSuccess: (r: BatchResult) => {
        toast({ title: `Batch approved ${r.approved?.length || selected.size} withdrawals` });
        setSelected(new Set());
      },
      onError: (e: any) =>
        toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };
  const handleBatchReject = () => {
    if (selected.size === 0) return;
    batchReject.mutate(
      { ids: [...selected], reason: batchRejectReason || "Batch rejected by admin" },
      {
        onSuccess: (r: BatchResult) => {
          toast({ title: `Batch rejected ${r.rejected?.length || selected.size} withdrawals` });
          setSelected(new Set());
          setBatchRejectReason("");
        },
        onError: (e: any) =>
          toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const STATUS_TABS: { id: StatusFilter; label: string; count: number; color: string }[] = [
    { id: "all", label: "All", count: withdrawals.length, color: "text-gray-700" },
    { id: "pending", label: "Pending", count: pendingCount, color: "text-amber-600" },
    { id: "paid", label: "Paid", count: paidCount, color: "text-green-600" },
    { id: "rejected", label: "Rejected", count: rejectedCount, color: "text-red-600" },
  ];

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Withdrawals page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
        <PageHeader
          icon={BanknoteIcon}
          title="Withdrawal Requests"
          subtitle="Approve or reject rider & vendor withdrawal requests"
          iconBgClass="bg-purple-100"
          iconColorClass="text-purple-600"
          actions={
            <div className="flex items-center gap-2">
              <LastUpdated dataUpdatedAt={lastRefreshed?.getTime() ?? 0} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportWithdrawalsCSV(filtered)}
                className="h-9 gap-2 rounded-xl"
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="h-9 gap-2 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" /> {T("refresh")}
              </Button>
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {isLoading
            ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
            : [
                {
                  label: "Pending Requests",
                  value: String(pendingCount),
                  Icon: Clock,
                  color: "text-amber-600",
                  bg: "bg-amber-50",
                },
                {
                  label: "Pending Amount",
                  value: fc(pendingAmt),
                  Icon: Wallet,
                  color: "text-red-600",
                  bg: "bg-red-50",
                },
                {
                  label: "Paid Today",
                  value: String(paidCount),
                  Icon: CheckCircle,
                  color: "text-green-600",
                  bg: "bg-green-50",
                },
                {
                  label: "Rejected",
                  value: String(rejectedCount),
                  Icon: XCircle,
                  color: "text-gray-600",
                  bg: "bg-gray-50",
                },
              ].map((c) => (
                <Card key={c.label} className={`border-0 shadow-sm ${c.bg}`}>
                  <CardContent className="p-4">
                    <c.Icon className={`h-6 w-6 ${c.color}`} />
                    <p className={`text-lg font-extrabold ${c.color} mt-1`}>{c.value}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{c.label}</p>
                  </CardContent>
                </Card>
              ))}
        </div>

        {/* Sort Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-xs font-medium">Sort:</span>
          {(
            [
              { key: "createdAt" as const, label: "Date" },
              { key: "amount" as const, label: "Amount" },
              { key: "status" as const, label: "Status" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleWdSort(opt.key)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${wdSortKey === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 text-muted-foreground hover:border-primary/40"}`}
            >
              {opt.label}
              <WdSortIcon col={opt.key} />
            </button>
          ))}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex border-b border-gray-200">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${statusFilter === t.id ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${statusFilter === t.id ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500"}`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Pending banner for manual processing */}
        {pendingCount > 0 && statusFilter !== "paid" && statusFilter !== "rejected" && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-800">Manual Transfer Required</p>
              <p className="mt-0.5 text-xs text-amber-700">
                {pendingCount} request{pendingCount > 1 ? "s" : ""} pending. Amounts already
                deducted from wallets. Transfer manually and click Approve with reference number.
              </p>
            </div>
          </div>
        )}

        {/* Batch Action Bar */}
        {pendingFiltered.length > 0 && (
          <div className="border-border/60 flex flex-col gap-3 rounded-xl border bg-white p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded"
                checked={selected.size === pendingFiltered.length && pendingFiltered.length > 0}
                onChange={toggleAll}
              />
              <span className="text-sm text-gray-600">
                {selected.size > 0
                  ? `${selected.size} selected`
                  : "Select pending to batch-process"}
              </span>
            </div>
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <Button
                  size="sm"
                  onClick={handleBatchApprove}
                  disabled={batchApprove.isPending}
                  className="gap-1.5 rounded-xl bg-green-600 text-xs text-white hover:bg-green-700"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Batch Approve ({selected.size})
                </Button>
                <input
                  type="text"
                  placeholder="Reject reason..."
                  value={batchRejectReason}
                  onChange={(e) => setBatchRejectReason(e.target.value)}
                  className="border-border/60 bg-muted/30 h-8 rounded-lg border px-2 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBatchReject}
                  disabled={batchReject.isPending}
                  className="gap-1.5 rounded-xl border-red-300 text-xs text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Batch Reject ({selected.size})
                </Button>
              </div>
            )}
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              {statusFilter === "pending" ? (
                <PartyPopper className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
              ) : (
                <Inbox className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              )}
              <p className="font-bold text-gray-700">
                {statusFilter === "pending"
                  ? "No pending requests!"
                  : `No ${statusFilter} requests`}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {statusFilter === "pending"
                  ? "All withdrawal requests have been processed."
                  : "Nothing to show."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((w: Withdrawal) => {
              const parsed = parseDesc(w.description || "");
              const expanded = expandedId === w.id;
              return (
                <Card
                  key={w.id}
                  className={`overflow-hidden border-0 shadow-sm ${selected.has(w.id) ? "ring-primary/40 ring-2" : ""}`}
                >
                  <CardContent className="p-0">
                    <button
                      className="w-full p-4 text-left"
                      onClick={() => setExpandedId(expanded ? null : w.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {w.status === "pending" && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(w.id);
                              }}
                              className="flex-shrink-0"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 cursor-pointer rounded"
                                checked={selected.has(w.id)}
                                onChange={() => {}}
                              />
                            </div>
                          )}
                          <div
                            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-xl ${w.status === "pending" ? "bg-amber-50" : w.status === "paid" ? "bg-green-50" : "bg-red-50"}`}
                          >
                            {methodIcon(w.paymentMethod || parsed.bank)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-gray-900">
                                {w.user?.name || "Unknown"}
                              </p>
                              {w.user?.roles?.[0] && (
                                <Badge
                                  className={`text-[10px] font-bold ${roleColor(w.user.roles[0])}`}
                                  variant="outline"
                                >
                                  {w.user.roles[0]}
                                </Badge>
                              )}
                              <StatusBadge status={w.status} />
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {methodIcon(w.paymentMethod || parsed.bank)} {parsed.bank} ·{" "}
                              {w.user?.phone} · {fd(w.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <p
                            className={`text-lg font-extrabold ${w.status === "paid" ? "text-green-600" : w.status === "rejected" ? "text-gray-400 line-through" : "text-red-600"}`}
                          >
                            {fc(Number(w.amount))}
                          </p>
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </button>

                    {expanded && (
                      <div className="space-y-4 border-t border-gray-100 bg-gray-50 px-4 py-4">
                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          {[
                            {
                              label: "Bank / Method",
                              value: `${methodIcon(w.paymentMethod || parsed.bank)} ${parsed.bank}`,
                            },
                            { label: "Account No.", value: parsed.account },
                            { label: "Account Name", value: parsed.title },
                            { label: "Amount", value: fc(Number(w.amount)) },
                            { label: "Status", value: w.status.toUpperCase() },
                            ...(w.refNo ? [{ label: "Ref / Reason", value: w.refNo }] : []),
                          ].map((f) => (
                            <div key={f.label} className="rounded-xl bg-white p-3">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">
                                {f.label}
                              </p>
                              <p className="mt-0.5 text-sm font-bold text-gray-800">{f.value}</p>
                            </div>
                          ))}
                        </div>
                        {parsed.note && (
                          <div className="rounded-xl bg-white p-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase">
                              Note from User
                            </p>
                            <p className="mt-0.5 text-sm text-gray-700">{parsed.note}</p>
                          </div>
                        )}

                        {/* Action Buttons — only for pending */}
                        {w.status === "pending" && (
                          <div className="flex gap-3">
                            <Button
                              size="sm"
                              className="flex-1 gap-2 bg-green-600 font-bold text-white hover:bg-green-700"
                              onClick={() => setSensitiveApproveTarget(w)}
                            >
                              <CheckCircle className="h-4 w-4" /> Approve & Mark Paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-2 border-red-300 font-bold text-red-600 hover:bg-red-50"
                              onClick={() => setRejectTarget(w)}
                            >
                              <XCircle className="h-4 w-4" /> Reject & Refund
                            </Button>
                          </div>
                        )}

                        {/* Paid info */}
                        {w.status === "paid" && (
                          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3">
                            <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600" />
                            <p className="text-xs font-medium text-green-700">
                              {fc(Number(w.amount))} transferred to {parsed.bank} account{" "}
                              <strong>{parsed.account}</strong>.
                              {w.refNo && (
                                <>
                                  {" "}
                                  Reference: <strong>{w.refNo}</strong>
                                </>
                              )}
                            </p>
                          </div>
                        )}

                        {/* Rejected info */}
                        {w.status === "rejected" && (
                          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                            <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                            <p className="text-xs font-medium text-red-700">
                              Request rejected.{" "}
                              {w.refNo && (
                                <>
                                  Reason: <strong>{w.refNo}</strong>.
                                </>
                              )}{" "}
                              {fc(Number(w.amount))} wapas rider wallet mein aa gaya.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {approveTarget && <ApproveModal w={approveTarget} onClose={() => setApproveTarget(null)} />}
        {rejectTarget && <RejectModal w={rejectTarget} onClose={() => setRejectTarget(null)} />}

        {/* Sensitive password confirmation before withdrawal approval */}
        <SensitiveActionDialog
          open={!!sensitiveApproveTarget}
          onClose={() => setSensitiveApproveTarget(null)}
          onConfirm={() => {
            setApproveTarget(sensitiveApproveTarget);
            setSensitiveApproveTarget(null);
          }}
          title="Approve Withdrawal"
          description={`Approving ${fc(Number(sensitiveApproveTarget?.amount))} payout to ${sensitiveApproveTarget?.user?.name || sensitiveApproveTarget?.user?.phone || "this user"}. Confirm your identity to proceed.`}
          confirmLabel="Proceed to Approve"
          actionType="approve_withdrawal"
          targetId={sensitiveApproveTarget?.id}
        />
      </div>
    </ErrorBoundary>
  );
}
