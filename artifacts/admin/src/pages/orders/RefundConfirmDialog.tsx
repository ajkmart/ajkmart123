import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

interface RefundConfirmDialogProps {
  order: any;
  refundAmount: string;
  setRefundAmount: (v: string) => void;
  refundReason: string;
  setRefundReason: (v: string) => void;
  isPending: boolean;
  onRefund: () => void;
  onBack: () => void;
}

export function RefundConfirmDialog({
  order,
  refundAmount,
  setRefundAmount,
  refundReason,
  setRefundReason,
  isPending,
  onRefund,
  onBack,
}: RefundConfirmDialogProps) {
  return (
    <div
      className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4"
      role="alertdialog"
      aria-label="Refund order confirmation"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
        <p className="text-sm font-bold text-blue-700">Issue Wallet Refund</p>
      </div>
      <p className="text-xs text-blue-600">
        Max refundable: {formatCurrency(Math.round(order.total))}.
      </p>
      <div className="mb-1 flex gap-1.5" role="group" aria-label="Quick refund amounts">
        {[25, 50, 75, 100].map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setRefundAmount(Math.round((order.total * pct) / 100).toString())}
            className="h-8 min-h-[36px] flex-1 rounded-lg border border-blue-200 bg-white text-xs font-bold text-blue-600 hover:bg-blue-100"
          >
            {pct === 100 ? "Full" : `${pct}%`}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Input
          type="number"
          min="1"
          max={order.total}
          placeholder={`Amount (required, max ${Math.round(order.total)})`}
          value={refundAmount}
          onChange={(e) => setRefundAmount(e.target.value)}
          className="h-9 rounded-xl text-sm"
          aria-label="Refund amount"
          required
        />
        <Input
          placeholder="Reason (optional)"
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
          className="h-9 rounded-xl text-sm"
          aria-label="Refund reason"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="h-9 min-h-[36px] flex-1 rounded-xl border border-blue-200 bg-white text-sm font-bold text-blue-600"
        >
          Back
        </button>
        <button
          onClick={onRefund}
          disabled={
            isPending ||
            !refundAmount ||
            parseFloat(refundAmount) <= 0 ||
            parseFloat(refundAmount) > order.total
          }
          className="h-9 min-h-[36px] flex-1 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-60"
        >
          {parseFloat(refundAmount) > order.total
            ? "Exceeds max"
            : isPending
              ? "Processing..."
              : "Issue Refund"}
        </button>
      </div>
    </div>
  );
}
