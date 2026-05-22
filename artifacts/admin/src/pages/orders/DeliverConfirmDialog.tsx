import { MobileDrawer } from "@/components/MobileDrawer";
import { CheckCircle2 } from "lucide-react";

interface DeliverConfirmDialogProps {
  orderId: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeliverConfirmDialog({
  orderId: _orderId,
  isPending,
  onConfirm,
  onClose,
}: DeliverConfirmDialogProps) {
  return (
    <MobileDrawer
      open={true}
      onClose={onClose}
      title={
        <>
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" /> Confirm Delivery
        </>
      }
      dialogClassName="w-[95vw] max-w-sm rounded-3xl"
    >
      <div className="mt-2 space-y-4" role="alertdialog" aria-label="Confirm delivery">
        <div className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">Mark order as Delivered?</p>
          <p className="text-xs text-green-600">
            This will finalize the order. The customer will be notified that delivery is complete.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="border-border text-foreground hover:bg-muted/50 h-10 min-h-[36px] flex-1 rounded-xl border bg-white text-sm font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="h-10 min-h-[36px] flex-1 rounded-xl bg-green-600 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
          >
            {isPending ? "Updating..." : "Confirm Delivered"}
          </button>
        </div>
      </div>
    </MobileDrawer>
  );
}
