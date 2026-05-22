import { formatCurrency } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

interface CancelConfirmDialogProps {
  order: any;
  cancelling: boolean;
  onCancel: () => void;
  onBack: () => void;
}

export function CancelConfirmDialog({
  order,
  cancelling,
  onCancel,
  onBack,
}: CancelConfirmDialogProps) {
  return (
    <div
      className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4"
      role="alertdialog"
      aria-label="Cancel order confirmation"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
        <p className="text-sm font-bold text-red-700">
          Cancel Order #{order.id.slice(-6).toUpperCase()}?
        </p>
      </div>
      <p className="text-xs text-red-600">
        {order.paymentMethod === "wallet"
          ? `${formatCurrency(Math.round(order.total))} will be refunded to the customer's wallet.`
          : "Cash order — no wallet refund needed."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="h-9 min-h-[36px] flex-1 rounded-xl border border-red-200 bg-white text-sm font-bold text-red-600"
        >
          Back
        </button>
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="h-9 min-h-[36px] flex-1 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-60"
        >
          {cancelling ? "Cancelling..." : "Confirm Cancel"}
        </button>
      </div>
    </div>
  );
}
