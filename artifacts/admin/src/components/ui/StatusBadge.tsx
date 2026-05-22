import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; classes: string }> = {
  delivered: { label: "Delivered", classes: "bg-green-100 text-green-700 border-green-200" },
  active: { label: "Active", classes: "bg-green-100 text-green-700 border-green-200" },
  approved: { label: "Approved", classes: "bg-green-100 text-green-700 border-green-200" },
  completed: { label: "Completed", classes: "bg-green-100 text-green-700 border-green-200" },
  verified: { label: "Verified", classes: "bg-green-100 text-green-700 border-green-200" },
  paid: { label: "Paid", classes: "bg-green-100 text-green-700 border-green-200" },
  success: { label: "Success", classes: "bg-green-100 text-green-700 border-green-200" },
  online: { label: "Online", classes: "bg-green-100 text-green-700 border-green-200" },

  pending: { label: "Pending", classes: "bg-amber-100 text-amber-700 border-amber-200" },
  in_progress: { label: "In Progress", classes: "bg-amber-100 text-amber-700 border-amber-200" },
  preparing: { label: "Preparing", classes: "bg-amber-100 text-amber-700 border-amber-200" },
  ready: { label: "Ready", classes: "bg-amber-100 text-amber-700 border-amber-200" },
  review: { label: "Review", classes: "bg-amber-100 text-amber-700 border-amber-200" },
  under_review: { label: "Under Review", classes: "bg-amber-100 text-amber-700 border-amber-200" },
  waiting: { label: "Waiting", classes: "bg-amber-100 text-amber-700 border-amber-200" },

  cancelled: { label: "Cancelled", classes: "bg-red-100 text-red-700 border-red-200" },
  suspended: { label: "Suspended", classes: "bg-red-100 text-red-700 border-red-200" },
  rejected: { label: "Rejected", classes: "bg-red-100 text-red-700 border-red-200" },
  failed: { label: "Failed", classes: "bg-red-100 text-red-700 border-red-200" },
  blocked: { label: "Blocked", classes: "bg-red-100 text-red-700 border-red-200" },
  banned: { label: "Banned", classes: "bg-red-100 text-red-700 border-red-200" },
  inactive: { label: "Inactive", classes: "bg-red-100 text-red-700 border-red-200" },
  offline: { label: "Offline", classes: "bg-red-100 text-red-700 border-red-200" },
  expired: { label: "Expired", classes: "bg-red-100 text-red-700 border-red-200" },

  searching: { label: "Searching", classes: "bg-amber-100 text-amber-700 border-amber-200" },
  bargaining: { label: "Bargaining", classes: "bg-amber-100 text-amber-700 border-amber-200" },

  assigned: { label: "Assigned", classes: "bg-blue-100 text-blue-700 border-blue-200" },
  processing: { label: "Processing", classes: "bg-blue-100 text-blue-700 border-blue-200" },
  picked_up: { label: "Picked Up", classes: "bg-blue-100 text-blue-700 border-blue-200" },
  on_the_way: { label: "On the Way", classes: "bg-blue-100 text-blue-700 border-blue-200" },
  dispatched: { label: "Dispatched", classes: "bg-blue-100 text-blue-700 border-blue-200" },
  accepted: { label: "Accepted", classes: "bg-blue-100 text-blue-700 border-blue-200" },
  in_transit: { label: "In Transit", classes: "bg-blue-100 text-blue-700 border-blue-200" },
  arrived: { label: "Arrived", classes: "bg-blue-100 text-blue-700 border-blue-200" },

  credit: { label: "Credit", classes: "bg-green-100 text-green-700 border-green-200" },
  debit: { label: "Debit", classes: "bg-red-100 text-red-700 border-red-200" },

  resubmit: { label: "Resubmit", classes: "bg-orange-100 text-orange-700 border-orange-200" },
  restricted: { label: "Restricted", classes: "bg-purple-100 text-purple-700 border-purple-200" },
  pending_approval: {
    label: "Pending Approval",
    classes: "bg-amber-100 text-amber-700 border-amber-200",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    classes: "bg-sky-100 text-sky-700 border-sky-200",
  },
  confirmed: { label: "Confirmed", classes: "bg-sky-100 text-sky-700 border-sky-200" },
};

function normalizeStatus(status: string): string {
  return status.toLowerCase().replace(/[\s-]+/g, "_");
}

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
  size?: "xs" | "sm" | "md";
}

export function StatusBadge({ status, label, className, size = "sm" }: StatusBadgeProps) {
  const normalized = normalizeStatus(status);
  const config = STATUS_MAP[normalized];

  const displayLabel = label ?? config?.label ?? status;
  const classes = config?.classes ?? "bg-gray-100 text-gray-600 border-gray-200";

  const sizeClasses = {
    xs: "text-[10px] px-1.5 py-0.5",
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold capitalize",
        sizeClasses,
        classes,
        className
      )}
    >
      {displayLabel}
    </span>
  );
}
