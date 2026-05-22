import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader, StatCardSkeleton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  useApproveDeposit,
  useBulkApproveDeposits,
  useBulkRejectDeposits,
  useDepositRequests,
  useRejectDeposit,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/errorParser";
import { formatCurrency } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Inbox,
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

type StatusFilter = "all" | "pending" | "approved" | "rejected";

interface DepositUser {
  roles?: string[];
  name?: string;
  phone?: string;
}

interface Deposit {
  id: string;
  amount: string | number;
  description: string;
  status: "pending" | "approved" | "rejected";
  paymentMethod?: string | null;
  createdAt: string | Date;
  user?: DepositUser;
  txId?: string;
  adminNote?: string;
  refNo?: string;
}

interface BulkResult {
  approved?: string[];
  rejected?: string[];
}

function methodLabel(method: string | null) {
  if (!method) return "Card";
  const m = method.toLowerCase();
  if (m.includes("jazzcash")) return "JazzCash";
  if (m.includes("easypaisa")) return "EasyPaisa";
  if (m.includes("bank")) return "Bank";
  return "Card";
}

function methodIcon(method: string | null | undefined): string {
  if (!method) return "💳";
  const m = method.toLowerCase();
  if (m.includes("jazzcash")) return "📱";
  if (m.includes("easypaisa")) return "📲";
  if (m.includes("bank")) return "🏦";
  return "💳";
}

function parseDesc(desc: string) {
  const stripped = desc.replace("Manual deposit — ", "").replace("Wallet Deposit — ", "");
  const parts = stripped.split(" · ");
  const method = parts[0] || "—";
  const txIdPart = parts.find((p) => p.startsWith("TxID: "));
  const senderPart = parts.find((p) => p.startsWith("Sender: ") || p.startsWith("From: "));
  const notePart = parts.find((p) => p.startsWith("Note: "));
  return {
    method,
    txId: txIdPart ? txIdPart.replace("TxID: ", "") : "—",
    sender: senderPart ? senderPart.replace(/^(Sender|From): /, "") : "—",
    note: notePart ? notePart.replace("Note: ", "") : "",
  };
}

function roleColor(role: string) {
  if (role === "rider") return "bg-green-100 text-green-700";
  if (role === "customer") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function ApproveModal({ d, onClose }: { d: Deposit; onClose: () => void }) {
  const [refNo, setRefNo] = useState("");
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const approve = useApproveDeposit();
  const parsed = parseDesc(d.description || "");

  const handleApprove = () => {
    approve.mutate(
      { id: d.id, refNo: refNo.trim() || undefined, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast({
            title: "Deposit approved",
            description: `${fc(Number(d.amount))} credited to wallet.`,
          });
          onClose();
        },
        onError: (e: unknown) =>
          toast({ title: "Error", description: parseApiError(e), variant: "destructive" }),
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
          <DialogTitle className="text-lg font-extrabold text-white">Approve Deposit</DialogTitle>
          <p className="mt-0.5 text-sm text-green-200">
            Wallet will be credited and the user notified
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-2 rounded-xl bg-green-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">User</span>
              <span className="font-bold">{d.user?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Phone</span>
              <span className="font-bold">{d.user?.phone}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Method</span>
              <span className="font-bold">
                {methodLabel(d.paymentMethod ?? null)} · {parsed.method}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Transaction ID</span>
              <span className="font-mono font-bold">{parsed.txId}</span>
            </div>
            {parsed.sender !== "—" && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sender Account</span>
                <span className="font-bold">{parsed.sender}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-green-200 pt-1">
              <span className="font-semibold text-gray-600">Amount to Credit</span>
              <span className="text-xl font-extrabold text-green-600">{fc(Number(d.amount))}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Reference No. (Optional)
            </label>
            <input
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="e.g. your internal ref or TxID"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm focus:border-green-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Note for User (Optional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Verified via JazzCash"
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
              {approve.isPending ? T("processing") : "Approve & Credit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RejectModal({ d, onClose }: { d: Deposit; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const reject = useRejectDeposit();

  const handleReject = () => {
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    reject.mutate(
      { id: d.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast({ title: "Deposit rejected", description: "User has been notified." });
          onClose();
        },
        onError: (e: unknown) =>
          toast({ title: "Error", description: parseApiError(e), variant: "destructive" }),
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
          <DialogTitle className="text-lg font-extrabold text-white">Reject Deposit</DialogTitle>
          <p className="mt-0.5 text-sm text-red-200">
            Deposit will be rejected — wallet will not be credited
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-2 rounded-xl bg-red-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">User</span>
              <span className="font-bold">{d.user?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Role</span>
              <span className="font-bold capitalize">{d.user?.roles?.[0]}</span>
            </div>
            <div className="flex items-center justify-between border-t border-red-200 pt-1">
              <span className="font-semibold text-gray-600">Amount (NOT credited)</span>
              <span className="text-xl font-extrabold text-red-600">{fc(Number(d.amount))}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Rejection Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Invalid transaction ID · Duplicate request · Amount mismatch"
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
              {reject.isPending ? T("processing") : "Reject Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkApproveModal({
  count,
  totalAmount,
  onConfirm,
  onClose,
  isPending,
}: {
  count: number;
  totalAmount: number;
  onConfirm: (refNo?: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [refNo, setRefNo] = useState("");
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

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
            Bulk Approve Deposits
          </DialogTitle>
          <p className="mt-0.5 text-sm text-green-200">Approve {count} deposits at once</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-2 rounded-xl bg-green-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Selected Deposits</span>
              <span className="font-bold">{count}</span>
            </div>
            <div className="flex items-center justify-between border-t border-green-200 pt-1">
              <span className="font-semibold text-gray-600">Total to Credit</span>
              <span className="text-xl font-extrabold text-green-600">{fc(totalAmount)}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Shared Reference Note (Optional)
            </label>
            <input
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="e.g. Batch approval - March 2026"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm focus:border-green-400 focus:outline-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button autoFocus variant="outline" className="flex-1" onClick={onClose}>
              {T("cancel")}
            </Button>
            <Button
              className="flex-1 bg-green-600 font-bold text-white hover:bg-green-700"
              onClick={() => onConfirm(refNo.trim() || undefined)}
              disabled={isPending}
            >
              {isPending ? T("processing") : `Approve ${count} Deposits`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkRejectModal({
  count,
  totalAmount,
  onConfirm,
  onClose,
  isPending,
}: {
  count: number;
  totalAmount: number;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-5">
          <DialogTitle className="text-lg font-extrabold text-white">
            Bulk Reject Deposits
          </DialogTitle>
          <p className="mt-0.5 text-sm text-red-200">Reject {count} deposits at once</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-2 rounded-xl bg-red-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Selected Deposits</span>
              <span className="font-bold">{count}</span>
            </div>
            <div className="flex items-center justify-between border-t border-red-200 pt-1">
              <span className="font-semibold text-gray-600">Total Amount (NOT credited)</span>
              <span className="text-xl font-extrabold text-red-600">{fc(totalAmount)}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Rejection Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Invalid transaction IDs · Duplicate requests · Amount mismatch"
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-red-400 focus:outline-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button autoFocus variant="outline" className="flex-1" onClick={onClose}>
              {T("cancel")}
            </Button>
            <Button
              className="flex-1 bg-red-600 font-bold text-white hover:bg-red-700"
              onClick={() => {
                if (!reason.trim()) {
                  toast({ title: "Reason required", variant: "destructive" });
                  return;
                }
                onConfirm(reason.trim());
              }}
              disabled={isPending}
            >
              {isPending ? T("processing") : `Reject ${count} Deposits`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function exportDepositsCSV(rows: Deposit[]) {
  const header = "ID,User,Phone,Role,Method,Amount,Status,Date";
  const lines = rows.map((d) =>
    [
      d.id,
      d.user?.name ?? "",
      d.user?.phone ?? "",
      d.user?.roles?.[0] ?? "",
      methodLabel(d.paymentMethod ?? null),
      Number(d.amount).toFixed(2),
      d.status,
      new Date(d.createdAt).toISOString().slice(0, 10),
    ].join(",")
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `deposits-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

export default function DepositRequests() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Deposit | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Deposit | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkApprove, setShowBulkApprove] = useState(false);
  const [showBulkReject, setShowBulkReject] = useState(false);

  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading, refetch } = useDepositRequests();
  const { toast } = useToast();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  useEffect(() => {
    if (data) setLastRefreshed(new Date());
  }, [data]);
  const bulkApprove = useBulkApproveDeposits();
  const bulkReject = useBulkRejectDeposits();

  const deposits = useMemo<Deposit[]>(() => data?.deposits ?? [], [data?.deposits]);

  const duplicateTxIds = useMemo(() => {
    const seen = new Map<string, number>();
    deposits.forEach((d) => {
      const parsed = parseDesc(d.description || "");
      const txId = parsed.txId;
      if (txId && txId !== "—") seen.set(txId, (seen.get(txId) || 0) + 1);
    });
    const dups = new Set<string>();
    seen.forEach((count, txId) => {
      if (count > 1) dups.add(txId);
    });
    return dups;
  }, [deposits]);

  type DepSortKey = "amount" | "createdAt" | "status";
  const [depSortKey, setDepSortKey] = useState<DepSortKey>("createdAt");
  const [depSortDir, setDepSortDir] = useState<"asc" | "desc">("desc");

  const handleDepSort = (key: DepSortKey) => {
    if (depSortKey === key) setDepSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setDepSortKey(key);
      setDepSortDir("asc");
    }
  };

  function DepSortIcon({ col }: { col: DepSortKey }) {
    if (depSortKey !== col) return <ArrowUpDown className="ml-0.5 inline h-3 w-3 opacity-40" />;
    return depSortDir === "asc" ? (
      <ArrowUp className="text-primary ml-0.5 inline h-3 w-3" />
    ) : (
      <ArrowDown className="text-primary ml-0.5 inline h-3 w-3" />
    );
  }

  const depStatusOrder: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

  const rawFiltered =
    statusFilter === "all" ? deposits : deposits.filter((d) => d.status === statusFilter);
  const filtered = useMemo(() => {
    return [...rawFiltered].sort((a, b) => {
      const dir = depSortDir === "asc" ? 1 : -1;
      if (depSortKey === "amount") return dir * (Number(a.amount) - Number(b.amount));
      if (depSortKey === "status")
        return dir * ((depStatusOrder[a.status] ?? 9) - (depStatusOrder[b.status] ?? 9));
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFiltered, depSortKey, depSortDir]);
  const pendingCount = deposits.filter((d) => d.status === "pending").length;
  const pendingAmt = deposits
    .filter((d) => d.status === "pending")
    .reduce((s: number, d: Deposit) => s + Number(d.amount), 0);
  const approvedCount = deposits.filter((d) => d.status === "approved").length;
  const rejectedCount = deposits.filter((d) => d.status === "rejected").length;

  const pendingInFiltered = useMemo(
    () =>
      filtered.filter((d: Deposit) => d.status === "pending" && d.user?.roles?.[0] === "customer"),
    [filtered]
  );
  const allPendingSelected =
    pendingInFiltered.length > 0 && pendingInFiltered.every((d: Deposit) => selectedIds.has(d.id));

  const selectedDeposits = useMemo(
    () =>
      deposits.filter(
        (d) => selectedIds.has(d.id) && d.status === "pending" && d.user?.roles?.[0] === "customer"
      ),
    [deposits, selectedIds]
  );
  const selectedTotal = useMemo(
    () => selectedDeposits.reduce((s, d) => s + Number(d.amount), 0),
    [selectedDeposits]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingInFiltered.forEach((d: Deposit) => next.delete(d.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingInFiltered.forEach((d: Deposit) => next.add(d.id));
        return next;
      });
    }
  };

  const handleBulkApprove = (refNo?: string) => {
    const ids = Array.from(selectedIds).filter((id) =>
      deposits.find(
        (d) => d.id === id && d.status === "pending" && d.user?.roles?.[0] === "customer"
      )
    );
    bulkApprove.mutate(
      { ids, refNo },
      {
        onSuccess: (data: BulkResult) => {
          toast({ title: `${data.approved?.length ?? 0} deposits approved` });
          setSelectedIds(new Set());
          setShowBulkApprove(false);
        },
        onError: (e: Error) =>
          toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleBulkReject = (reason: string) => {
    const ids = Array.from(selectedIds).filter((id) =>
      deposits.find(
        (d) => d.id === id && d.status === "pending" && d.user?.roles?.[0] === "customer"
      )
    );
    bulkReject.mutate(
      { ids, reason },
      {
        onSuccess: (data: BulkResult) => {
          toast({ title: `${data.rejected?.length ?? 0} deposits rejected` });
          setSelectedIds(new Set());
          setShowBulkReject(false);
        },
        onError: (e: Error) =>
          toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const STATUS_TABS: { id: StatusFilter; label: string; count: number; color: string }[] = [
    { id: "all", label: "All", count: deposits.length, color: "text-gray-700" },
    { id: "pending", label: "Pending", count: pendingCount, color: "text-amber-600" },
    { id: "approved", label: "Approved", count: approvedCount, color: "text-green-600" },
    { id: "rejected", label: "Rejected", count: rejectedCount, color: "text-red-600" },
  ];

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Deposit Requests page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-5 p-4 pb-28 md:p-6">
        <PageHeader
          icon={ArrowDownToLine}
          title="Deposit Requests"
          subtitle="Approve or reject rider & customer wallet deposit requests"
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
          actions={
            <div className="flex items-center gap-2">
              <LastUpdated dataUpdatedAt={lastRefreshed?.getTime() ?? 0} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportDepositsCSV(filtered)}
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
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },
                {
                  label: "Approved",
                  value: String(approvedCount),
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
              onClick={() => handleDepSort(opt.key)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${depSortKey === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 text-muted-foreground hover:border-primary/40"}`}
            >
              {opt.label}
              <DepSortIcon col={opt.key} />
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

        {/* Select All header for pending deposits */}
        {pendingInFiltered.length > 0 && (
          <div className="flex items-center gap-3 px-1">
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={allPendingSelected}
                onChange={toggleSelectAll}
                className="text-primary focus:ring-primary/20 h-4 w-4 cursor-pointer rounded border-gray-300"
              />
              <span className="text-sm font-semibold text-gray-600">
                Select All Pending Customer Deposits ({pendingInFiltered.length})
              </span>
            </label>
            {selectedIds.size > 0 && (
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-400 underline hover:text-gray-600"
              >
                Clear selection
              </button>
            )}
          </div>
        )}

        {/* Pending banner */}
        {pendingCount > 0 && statusFilter !== "approved" && statusFilter !== "rejected" && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-800">Manual Verification Required</p>
              <p className="mt-0.5 text-xs text-amber-700">
                {pendingCount} deposit request{pendingCount > 1 ? "s" : ""} pending. Verify the
                transaction IDs and approve or reject.
              </p>
            </div>
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
                  ? "All deposit requests have been processed."
                  : "Nothing to show."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((d: Deposit) => {
              const parsed = parseDesc(d.description || "");
              const expanded = expandedId === d.id;
              const isPending = d.status === "pending";
              const isCustomer = d.user?.roles?.[0] === "customer";
              const isBulkSelectable = isPending && isCustomer;
              const isSelected = selectedIds.has(d.id);
              return (
                <Card
                  key={d.id}
                  className={`overflow-hidden border-0 shadow-sm transition-all ${isSelected && isBulkSelectable ? "ring-primary/40 bg-primary/5 ring-2" : ""}`}
                >
                  <CardContent className="p-0">
                    <div className="flex items-center">
                      {isBulkSelectable && (
                        <div className="flex items-center pl-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(d.id)}
                            className="text-primary focus:ring-primary/20 h-4 w-4 cursor-pointer rounded border-gray-300"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                      <button
                        className={`w-full p-4 text-left ${isBulkSelectable ? "pl-3" : ""}`}
                        onClick={() => setExpandedId(expanded ? null : d.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-xl ${d.status === "pending" ? "bg-amber-50" : d.status === "approved" ? "bg-green-50" : "bg-red-50"}`}
                            >
                              {methodIcon(d.paymentMethod || parsed.method)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-bold text-gray-900">
                                  {d.user?.name || "Unknown"}
                                </p>
                                {d.user?.roles?.[0] && (
                                  <Badge
                                    className={`text-[10px] font-bold ${roleColor(d.user.roles[0])}`}
                                    variant="outline"
                                  >
                                    {d.user.roles[0] === "customer" ? "Customer" : "Rider"}
                                  </Badge>
                                )}
                                <StatusBadge status={d.status} />
                                {isPending && (
                                  <Badge
                                    className="gap-0.5 border-orange-300 bg-orange-50 px-1.5 text-[10px] font-bold text-orange-700"
                                    variant="outline"
                                  >
                                    ⏳ Awaiting Manual Review
                                  </Badge>
                                )}
                                {duplicateTxIds.has(parseDesc(d.description || "").txId) && (
                                  <Badge
                                    className="border-red-300 bg-red-100 px-1.5 text-[10px] font-bold text-red-700"
                                    variant="outline"
                                  >
                                    Duplicate TxID
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {methodIcon(d.paymentMethod ?? null)} {parsed.method} ·{" "}
                                {d.user?.phone} · {fd(d.createdAt)}
                              </p>
                              {parsed.txId !== "—" && (
                                <p className="mt-0.5 flex items-center gap-1 font-mono text-xs font-bold text-gray-700">
                                  <span className="font-sans text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                                    TxID:
                                  </span>
                                  {parsed.txId}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <p
                              className={`text-lg font-extrabold ${d.status === "approved" ? "text-green-600" : d.status === "rejected" ? "text-gray-400 line-through" : "text-blue-600"}`}
                            >
                              {fc(Number(d.amount))}
                            </p>
                            {expanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </button>
                    </div>

                    {expanded && (
                      <div className="space-y-4 border-t border-gray-100 bg-gray-50 px-4 py-4">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          {[
                            {
                              label: "Payment Method",
                              value: `${methodIcon(d.paymentMethod ?? null)} ${parsed.method}`,
                            },
                            { label: "Transaction ID", value: parsed.txId },
                            { label: "Sender Account", value: parsed.sender },
                            { label: "Amount", value: fc(Number(d.amount)) },
                            { label: "Status", value: d.status.toUpperCase() },
                            ...(d.refNo ? [{ label: "Admin Ref", value: d.refNo }] : []),
                          ].map((f) => (
                            <div key={f.label} className="rounded-xl bg-white p-3">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">
                                {f.label}
                              </p>
                              <p className="mt-0.5 font-mono text-sm font-bold text-gray-800">
                                {f.value}
                              </p>
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

                        {d.status === "pending" && (
                          <div className="flex gap-3">
                            <Button
                              size="sm"
                              className="flex-1 gap-2 bg-green-600 font-bold text-white hover:bg-green-700"
                              onClick={() => setApproveTarget(d)}
                            >
                              <CheckCircle className="h-4 w-4" /> Approve & Credit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-2 border-red-300 font-bold text-red-600 hover:bg-red-50"
                              onClick={() => setRejectTarget(d)}
                            >
                              <XCircle className="h-4 w-4" /> Reject
                            </Button>
                          </div>
                        )}

                        {d.status === "approved" && (
                          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3">
                            <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600" />
                            <p className="text-xs font-medium text-green-700">
                              {fc(Number(d.amount))} {d.user?.name}'s wallet mein credited.
                              {d.refNo && (
                                <>
                                  {" "}
                                  Reference: <strong>{d.refNo}</strong>
                                </>
                              )}
                            </p>
                          </div>
                        )}

                        {d.status === "rejected" && (
                          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                            <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                            <p className="text-xs font-medium text-red-700">
                              Request rejected.{" "}
                              {d.refNo && (
                                <>
                                  Reason: <strong>{d.refNo}</strong>.
                                </>
                              )}
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

        {/* Sticky Bulk Action Bar */}
        {selectedDeposits.length > 0 && (
          <div className="fixed right-0 bottom-0 left-0 z-40 border-t border-gray-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="bg-primary/10 text-primary rounded-full px-3 py-1.5 text-sm font-extrabold">
                  {selectedDeposits.length} selected
                </div>
                <p className="hidden text-sm font-semibold text-gray-600 sm:block">
                  Total: <span className="font-extrabold text-blue-600">{fc(selectedTotal)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 font-bold text-white hover:bg-green-700"
                  onClick={() => setShowBulkApprove(true)}
                >
                  <CheckCircle className="h-4 w-4" /> Bulk Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-red-300 font-bold text-red-600 hover:bg-red-50"
                  onClick={() => setShowBulkReject(true)}
                >
                  <XCircle className="h-4 w-4" /> Bulk Reject
                </Button>
              </div>
            </div>
          </div>
        )}

        {approveTarget && <ApproveModal d={approveTarget} onClose={() => setApproveTarget(null)} />}
        {rejectTarget && <RejectModal d={rejectTarget} onClose={() => setRejectTarget(null)} />}
        {showBulkApprove && (
          <BulkApproveModal
            count={selectedDeposits.length}
            totalAmount={selectedTotal}
            onConfirm={handleBulkApprove}
            onClose={() => setShowBulkApprove(false)}
            isPending={bulkApprove.isPending}
          />
        )}
        {showBulkReject && (
          <BulkRejectModal
            count={selectedDeposits.length}
            totalAmount={selectedTotal}
            onConfirm={handleBulkReject}
            onClose={() => setShowBulkReject(false)}
            isPending={bulkReject.isPending}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
