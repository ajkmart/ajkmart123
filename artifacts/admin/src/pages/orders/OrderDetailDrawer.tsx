import { StatusBadge } from "@/components/AdminShared";
import { MobileDrawer } from "@/components/MobileDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Package,
  Phone,
  Receipt,
  RotateCcw,
  ShoppingBag,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CancelConfirmDialog } from "./CancelConfirmDialog";
import { GpsStampCard } from "./GpsStampCard";
import { RefundConfirmDialog } from "./RefundConfirmDialog";
import { RiderAssignPanel } from "./RiderAssignPanel";
import { STATUS_LABELS, allowedNext, canCancel, isTerminal } from "./constants";

/* ── Return Request Panel — Admin Moderation View ── */
function ReturnPanel({
  order,
  onRefundOrder,
}: {
  order: any;
  onRefundOrder?: (amount?: number, reason?: string) => void;
}) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(String(order.total ?? ""));
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoadingReqs(true);
    try {
      const data = await adminFetch(`/orders/${order.id}/returns`);
      setRequests(Array.isArray(data) ? data : (data?.returns ?? []));
    } catch {
      setRequests([]);
    }
    setLoadingReqs(false);
  };

  useEffect(() => {
    void loadRequests();
  }, [order.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitNew = async () => {
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await adminFetch(`/orders/${order.id}/return`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim(), amount: parseFloat(amount) || order.total }),
      });
      toast({ title: "Return request created", description: "Return request logged." });
      setReason("");
      await loadRequests();
    } catch (e: unknown) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSubmitting(false);
  };

  const handleAction = async (returnId: string, action: "approve" | "reject") => {
    setActioning(returnId);
    const newStatus = action === "approve" ? "approved" : "rejected";
    const prevRequests = requests;
    setRequests((prev) => prev.map((r) => (r.id === returnId ? { ...r, status: newStatus } : r)));
    try {
      await adminFetch(`/orders/${order.id}/returns/${returnId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast({
        title: action === "approve" ? "Return approved" : "Return rejected",
        description: action === "approve" ? "Issuing refund now…" : "Return request closed.",
      });
      void loadRequests();
      if (action === "approve" && onRefundOrder) {
        const approvedReq = prevRequests.find((r) => r.id === returnId);
        onRefundOrder(
          approvedReq?.amount ?? order.total,
          approvedReq?.reason ?? "Return approved by admin"
        );
      }
    } catch (e: unknown) {
      setRequests(prevRequests);
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setActioning(null);
  };

  const statusColor = (s: string) => {
    if (s === "approved") return "bg-green-100 text-green-700";
    if (s === "rejected") return "bg-red-100 text-red-700";
    return "bg-amber-100 text-amber-700";
  };

  return (
    <div className="space-y-5">
      {/* Existing requests */}
      <div className="space-y-2">
        <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          Existing Return Requests
        </h4>
        {loadingReqs ? (
          <div className="bg-muted h-16 animate-pulse rounded-xl" />
        ) : requests.length === 0 ? (
          <p className="text-muted-foreground py-2 text-xs">
            No return requests for this order yet.
          </p>
        ) : (
          requests.map((req: any) => (
            <div key={req.id} className="border-border space-y-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground line-clamp-2 text-xs font-medium">
                    {req.reason || "No reason provided"}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    Amount: <strong>{formatCurrency(req.amount ?? req.refundAmount ?? 0)}</strong> ·{" "}
                    {formatDate(req.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(req.status)}`}
                >
                  {req.status ?? "pending"}
                </span>
              </div>
              {(req.status === "pending" || !req.status) && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 gap-1 rounded-lg bg-green-600 text-[11px] text-white hover:bg-green-700"
                    disabled={actioning === req.id}
                    onClick={() => handleAction(req.id, "approve")}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 rounded-lg border-red-300 text-[11px] text-red-600 hover:bg-red-50"
                    disabled={actioning === req.id}
                    onClick={() => handleAction(req.id, "reject")}
                  >
                    <AlertTriangle className="h-3 w-3" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create new return request */}
      <div className="space-y-3 border-t pt-4">
        <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          Log New Return Request
        </h4>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-800">Order #{order.id?.slice(-8).toUpperCase()}</p>
          <p className="mt-0.5 text-amber-700">
            Total: <strong>{formatCurrency(order.total)}</strong>
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Return Reason *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why the return is needed…"
            rows={3}
            className="border-input bg-background focus:ring-ring w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Refund Amount (Rs.)
          </label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            max={order.total}
            step="1"
            className="h-10 rounded-xl"
            placeholder="Partial or full refund"
          />
          <p className="text-muted-foreground text-xs">Max: {formatCurrency(order.total)}</p>
        </div>
        <Button
          onClick={handleSubmitNew}
          disabled={submitting}
          className="h-10 w-full gap-2 rounded-xl bg-amber-600 text-white hover:bg-amber-700"
        >
          <RotateCcw className="h-4 w-4" />
          {submitting ? "Submitting…" : "Log Return Request"}
        </Button>
      </div>
    </div>
  );
}

/* ── Dispute Panel — Admin Moderation View ── */
function DisputePanel({ order }: { order: any }) {
  const { toast } = useToast();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loadingDisp, setLoadingDisp] = useState(true);
  const [note, setNote] = useState("");
  const [type, setType] = useState("wrong_item");
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const DISPUTE_TYPES = [
    { value: "wrong_item", label: "Wrong item delivered" },
    { value: "not_delivered", label: "Not delivered" },
    { value: "damaged", label: "Item damaged" },
    { value: "overcharged", label: "Overcharged" },
    { value: "fraud", label: "Suspected fraud" },
    { value: "other", label: "Other" },
  ];

  const loadDisputes = async () => {
    setLoadingDisp(true);
    try {
      const data = await adminFetch(`/orders/${order.id}/disputes`);
      setDisputes(Array.isArray(data) ? data : (data?.disputes ?? []));
    } catch {
      setDisputes([]);
    }
    setLoadingDisp(false);
  };

  useEffect(() => {
    void loadDisputes();
  }, [order.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitNew = async () => {
    if (!note.trim()) {
      toast({ title: "Details required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await adminFetch(`/orders/${order.id}/dispute`, {
        method: "POST",
        body: JSON.stringify({ type, note: note.trim() }),
      });
      toast({ title: "Dispute logged", description: "Order flagged for investigation." });
      setNote("");
      await loadDisputes();
    } catch (e: unknown) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSubmitting(false);
  };

  const handleResolve = async (disputeId: string, resolution: "resolved" | "dismissed") => {
    setActioning(disputeId);
    const prevDisputes = disputes;
    setDisputes((prev) => prev.map((d) => (d.id === disputeId ? { ...d, status: resolution } : d)));
    try {
      await adminFetch(`/orders/${order.id}/disputes/${disputeId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: resolution }),
      });
      toast({ title: resolution === "resolved" ? "Dispute resolved" : "Dispute dismissed" });
      void loadDisputes();
    } catch (e: unknown) {
      setDisputes(prevDisputes);
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setActioning(null);
  };

  const statusColor = (s: string) => {
    if (s === "resolved") return "bg-green-100 text-green-700";
    if (s === "dismissed") return "bg-slate-100 text-slate-600";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="space-y-5">
      {/* Existing disputes */}
      <div className="space-y-2">
        <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          Open Disputes
        </h4>
        {loadingDisp ? (
          <div className="bg-muted h-16 animate-pulse rounded-xl" />
        ) : disputes.length === 0 ? (
          <p className="text-muted-foreground py-2 text-xs">No disputes for this order.</p>
        ) : (
          disputes.map((d: any) => (
            <div key={d.id} className="border-border space-y-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-xs font-medium">
                    {DISPUTE_TYPES.find((t) => t.value === d.type)?.label ?? d.type}
                  </p>
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]">
                    {d.note || d.details}
                  </p>
                  <p className="text-muted-foreground/60 text-[10px]">{formatDate(d.createdAt)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(d.status)}`}
                >
                  {d.status ?? "open"}
                </span>
              </div>
              {(d.status === "open" || !d.status) && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 gap-1 rounded-lg bg-green-600 text-[11px] text-white hover:bg-green-700"
                    disabled={actioning === d.id}
                    onClick={() => handleResolve(d.id, "resolved")}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 rounded-lg text-[11px] text-slate-600"
                    disabled={actioning === d.id}
                    onClick={() => handleResolve(d.id, "dismissed")}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Log new dispute */}
      <div className="space-y-3 border-t pt-4">
        <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          Log New Dispute
        </h4>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-semibold text-red-800">Order #{order.id?.slice(-8).toUpperCase()}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Dispute Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border-input bg-background h-10 w-full rounded-xl border px-3 text-sm"
          >
            {DISPUTE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Details *
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Provide full context…"
            rows={3}
            className="border-input bg-background focus:ring-ring w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <Button
          onClick={handleSubmitNew}
          disabled={submitting}
          className="h-10 w-full gap-2 rounded-xl bg-red-600 text-white hover:bg-red-700"
        >
          <Flag className="h-4 w-4" />
          {submitting ? "Logging…" : "Log Dispute"}
        </Button>
      </div>
    </div>
  );
}

interface OrderDetailDrawerProps {
  selectedOrder: any;
  onClose: () => void;
  showCancelConfirm: boolean;
  setShowCancelConfirm: (v: boolean) => void;
  showRefundConfirm: boolean;
  setShowRefundConfirm: (v: boolean) => void;
  refundAmount: string;
  setRefundAmount: (v: string) => void;
  refundReason: string;
  setRefundReason: (v: string) => void;
  cancelling: boolean;
  onCancelOrder: () => void;
  onRefundOrder: (amount?: number, reason?: string) => void;
  refundPending: boolean;
  showAssignRider: boolean;
  setShowAssignRider: (v: boolean) => void;
  riderSearch: string;
  setRiderSearch: (v: string) => void;
  ridersData: any;
  onAssignRider: (rider: any) => void;
  assignPending: boolean;
  onUpdateStatus: (id: string, status: string, extra?: { localUpdate?: any }) => void;
  onDeliverConfirm: (id: string) => void;
}

export function OrderDetailDrawer({
  selectedOrder,
  onClose,
  showCancelConfirm,
  setShowCancelConfirm,
  showRefundConfirm,
  setShowRefundConfirm,
  refundAmount,
  setRefundAmount,
  refundReason,
  setRefundReason,
  cancelling,
  onCancelOrder,
  onRefundOrder,
  refundPending,
  showAssignRider,
  setShowAssignRider,
  riderSearch,
  setRiderSearch,
  ridersData,
  onAssignRider,
  assignPending,
  onUpdateStatus,
  onDeliverConfirm,
}: OrderDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"details" | "return" | "dispute">("details");

  return (
    <MobileDrawer
      open={!!selectedOrder}
      onClose={() => {
        setActiveTab("details");
        onClose();
      }}
      title={
        <>
          <ShoppingBag className="h-5 w-5 text-indigo-600" aria-hidden="true" /> Order Detail{" "}
          {selectedOrder && <StatusBadge status={selectedOrder.status} />}
        </>
      }
      dialogClassName="w-[95vw] max-w-lg rounded-3xl max-h-[90vh] overflow-y-auto"
    >
      {selectedOrder && (
        <div className="mt-2 space-y-4">
          {/* Tab navigation */}
          <div className="-mx-1 flex gap-1 border-b">
            {(
              [
                { key: "details" as const, label: "Details", icon: ShoppingBag },
                { key: "return" as const, label: "Return Request", icon: RotateCcw },
                { key: "dispute" as const, label: "Dispute", icon: Flag },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${activeTab === t.key ? "border-indigo-600 text-indigo-700" : "text-muted-foreground hover:text-foreground border-transparent"}`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "return" && (
            <ReturnPanel order={selectedOrder} onRefundOrder={onRefundOrder} />
          )}
          {activeTab === "dispute" && <DisputePanel order={selectedOrder} />}
          {activeTab === "details" && (
            <>
              {showCancelConfirm && (
                <CancelConfirmDialog
                  order={selectedOrder}
                  cancelling={cancelling}
                  onCancel={onCancelOrder}
                  onBack={() => setShowCancelConfirm(false)}
                />
              )}

              {showRefundConfirm && (
                <RefundConfirmDialog
                  order={selectedOrder}
                  refundAmount={refundAmount}
                  setRefundAmount={setRefundAmount}
                  refundReason={refundReason}
                  setRefundReason={setRefundReason}
                  isPending={refundPending}
                  onRefund={onRefundOrder}
                  onBack={() => setShowRefundConfirm(false)}
                />
              )}

              <section
                className="bg-muted/40 space-y-2.5 rounded-xl p-4 text-sm"
                aria-label="Order information"
              >
                <h2 className="sr-only">Order Information</h2>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order ID</span>
                  <span className="font-mono font-bold">
                    {selectedOrder.id.slice(-8).toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge
                    variant={selectedOrder.type === "food" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {selectedOrder.type === "food"
                      ? "\uD83C\uDF54 "
                      : selectedOrder.type === "pharmacy"
                        ? "\uD83D\uDC8A "
                        : "\uD83D\uDED2 "}
                    {selectedOrder.type}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-foreground text-lg font-bold">
                    {formatCurrency(selectedOrder.total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment</span>
                  <span
                    className={`font-medium capitalize ${selectedOrder.paymentMethod === "wallet" ? "text-blue-600" : "text-green-600"}`}
                  >
                    {selectedOrder.paymentMethod === "wallet" ? "Wallet" : "Cash"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Delivery Address</span>
                  <span className="max-w-[220px] text-right text-xs break-words">
                    {selectedOrder.deliveryAddress || "\u2014"}
                  </span>
                </div>
              </section>

              {selectedOrder.customerLat != null && selectedOrder.customerLng != null && (
                <GpsStampCard order={selectedOrder} />
              )}

              {selectedOrder.proofPhotoUrl &&
                (() => {
                  const rawUrl: string = selectedOrder.proofPhotoUrl as string;
                  const apiBase = window.location.origin;
                  const resolvedUrl =
                    /^\/api\/uploads\/[\w.\-]+$/.test(rawUrl) ||
                    /^\/uploads\/[\w.\-]+$/.test(rawUrl)
                      ? `${apiBase}${rawUrl}`
                      : (() => {
                          try {
                            const u = new URL(rawUrl);
                            return (u.protocol === "https:" || u.protocol === "http:") &&
                              (u.pathname.startsWith("/api/uploads/") ||
                                u.pathname.startsWith("/uploads/"))
                              ? rawUrl
                              : null;
                          } catch {
                            return null;
                          }
                        })();
                  if (!resolvedUrl) return null;
                  return (
                    <section
                      className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
                      aria-label="Payment proof"
                    >
                      <h3 className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-amber-700 uppercase">
                        <Receipt className="h-3 w-3" aria-hidden="true" /> Payment Receipt
                        {selectedOrder.txnRef && (
                          <span className="ml-auto text-[10px] font-normal text-amber-600 normal-case">
                            Txn: {selectedOrder.txnRef}
                          </span>
                        )}
                      </h3>
                      <a
                        href={resolvedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                        aria-label="View full payment receipt image"
                      >
                        <img
                          src={resolvedUrl}
                          alt="Payment receipt"
                          className="max-h-56 w-full rounded-lg border border-amber-200 bg-white object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <p className="mt-1 text-center text-[10px] text-amber-600">
                          Click to view full image
                        </p>
                      </a>
                    </section>
                  );
                })()}

              <section
                className="space-y-1 rounded-xl border border-blue-100 bg-blue-50 p-3"
                aria-label="Customer contact"
              >
                <h3 className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-blue-600 uppercase">
                  <User className="h-3 w-3" aria-hidden="true" /> Customer
                </h3>
                <p className="text-sm font-semibold text-gray-800">
                  {selectedOrder.userName || "Guest"}
                </p>
                {selectedOrder.userPhone && (
                  <div className="mt-1 flex gap-3">
                    <a
                      href={`tel:${selectedOrder.userPhone}`}
                      className="flex min-h-[36px] items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      aria-label={`Call customer ${selectedOrder.userPhone}`}
                    >
                      <Phone className="h-3 w-3" aria-hidden="true" /> {selectedOrder.userPhone}
                    </a>
                    <a
                      href={`https://wa.me/92${selectedOrder.userPhone.replace(/^(\+92|0)/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[36px] items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                      aria-label="WhatsApp customer"
                    >
                      WhatsApp
                    </a>
                  </div>
                )}
              </section>

              {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 && (
                <section aria-label="Order items">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Package className="h-4 w-4 text-indigo-600" aria-hidden="true" /> Items (
                    {selectedOrder.items.length})
                  </h2>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item: any, i: number) => (
                      <div
                        key={i}
                        className="bg-muted/30 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          <p className="text-muted-foreground text-xs">x{item.quantity}</p>
                        </div>
                        <p className="text-foreground shrink-0 font-bold">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                      </div>
                    ))}
                    <div className="bg-primary/5 border-primary/20 flex items-center justify-between rounded-xl border px-3 py-2.5">
                      <p className="text-foreground font-bold">Total</p>
                      <p className="text-primary text-lg font-bold">
                        {formatCurrency(selectedOrder.total)}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              <RiderAssignPanel
                order={selectedOrder}
                ridersData={ridersData}
                riderSearch={riderSearch}
                setRiderSearch={setRiderSearch}
                showAssignRider={showAssignRider}
                setShowAssignRider={setShowAssignRider}
                onAssignRider={onAssignRider}
                assignPending={assignPending}
              />

              {isTerminal(selectedOrder.status) && selectedOrder.paymentMethod === "wallet" && (
                <section aria-label="Admin actions">
                  <h3 className="text-muted-foreground mb-1.5 text-xs font-medium">
                    Admin Actions
                  </h3>
                  {selectedOrder.refundedAt ? (
                    <div className="flex h-9 items-center gap-1.5 rounded-xl border-2 border-green-300 bg-green-50 px-4 text-xs font-bold text-green-700">
                      Refunded
                      {selectedOrder.refundedAmount
                        ? ` \u2014 ${formatCurrency(Math.round(parseFloat(selectedOrder.refundedAmount)))}`
                        : ""}
                    </div>
                  ) : !showRefundConfirm ? (
                    <button
                      onClick={() => {
                        setShowRefundConfirm(true);
                        setShowCancelConfirm(false);
                        setRefundAmount("");
                        setRefundReason("");
                      }}
                      className="flex h-9 min-h-[36px] items-center gap-1.5 rounded-xl border-2 border-blue-300 bg-blue-50 px-4 text-xs font-bold whitespace-nowrap text-blue-700 transition-colors hover:bg-blue-100"
                      aria-label="Issue wallet refund"
                    >
                      Issue Wallet Refund
                    </button>
                  ) : null}
                </section>
              )}

              {!isTerminal(selectedOrder.status) && (
                <section className="flex gap-3" aria-label="Status controls">
                  <div className="flex-1">
                    <h3 className="text-muted-foreground mb-1.5 text-xs font-medium">
                      Move to Next Status
                    </h3>
                    <Select
                      value={selectedOrder.status}
                      onValueChange={(val) => {
                        if (val === selectedOrder.status) return;
                        if (val === "delivered") {
                          onDeliverConfirm(selectedOrder.id);
                          return;
                        }
                        onUpdateStatus(selectedOrder.id, val, { localUpdate: true });
                      }}
                    >
                      <SelectTrigger
                        className={`h-9 border-2 text-[11px] font-bold tracking-wider uppercase ${getStatusColor(selectedOrder.status)}`}
                        aria-label="Change order status"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedNext(selectedOrder)
                          .filter((s) => s !== "cancelled")
                          .map((s) => (
                            <SelectItem key={s} value={s} className="text-xs font-bold uppercase">
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2
                                  className="h-3 w-3 text-green-500"
                                  aria-hidden="true"
                                />
                                {STATUS_LABELS[s]}
                              </span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {canCancel(selectedOrder) && !showCancelConfirm && (
                    <div>
                      <h3 className="text-muted-foreground mb-1.5 text-xs font-medium">
                        Admin Actions
                      </h3>
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="flex h-9 min-h-[36px] items-center gap-1.5 rounded-xl border-2 border-red-300 bg-red-50 px-4 text-xs font-bold whitespace-nowrap text-red-600 transition-colors hover:bg-red-100"
                        aria-label="Cancel and refund this order"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel & Refund
                      </button>
                    </div>
                  )}
                </section>
              )}

              <footer className="text-muted-foreground border-border/40 flex justify-between border-t pt-3 text-xs">
                <span>Ordered: {formatDate(selectedOrder.createdAt)}</span>
                <span>Updated: {formatDate(selectedOrder.updatedAt)}</span>
              </footer>
            </>
          )}
        </div>
      )}
    </MobileDrawer>
  );
}
