import { ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface ActiveOrder {
  id: string;
  deliveryAddress?: string | null;
}

interface ActiveRide {
  dropAddress?: string | null;
}

export interface ActiveData {
  order?: ActiveOrder | null;
  ride?: ActiveRide | null;
}

interface ActiveTaskBannerProps {
  activeData: ActiveData;
  variant: "green" | "amber";
}

export function ActiveTaskBanner({ activeData, variant }: ActiveTaskBannerProps) {
  const isOrder = !!activeData?.order;
  const title = isOrder ? "Active Delivery in Progress" : "Active Ride in Progress";
  const subtitle = isOrder
    ? `Order #${activeData.order?.id?.slice(-6).toUpperCase()} — ${activeData.order?.deliveryAddress || "Customer"}`
    : `Ride → ${activeData?.ride?.dropAddress || "Drop location"}`;

  if (variant === "green") {
    return (
      <Link
        href="/active"
        className="block animate-[slideUp_0.3s_ease-out] rounded-3xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3.5 shadow-lg shadow-green-200 transition-transform active:scale-[0.98]"
        aria-label="Go to active task"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <div className="h-3 w-3 animate-pulse rounded-full bg-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold tracking-tight text-white">{title}</p>
            <p className="mt-0.5 truncate text-xs text-white/70">{subtitle}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 rounded-xl bg-white/20 px-3 py-2 text-xs font-extrabold text-white backdrop-blur-sm">
            Track <ChevronRight size={12} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/active"
      className="block animate-[slideUp_0.3s_ease-out] rounded-3xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3.5 shadow-sm transition-transform active:scale-[0.98]"
      aria-label="Go to active task"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-100">
          <div className="h-3 w-3 animate-pulse rounded-full bg-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold tracking-tight text-amber-800">{title}</p>
          <p className="mt-0.5 truncate text-xs text-amber-600">{subtitle}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1 rounded-xl bg-amber-200/60 px-3 py-2 text-xs font-extrabold text-amber-700">
          Go <ChevronRight size={12} />
        </div>
      </div>
    </Link>
  );
}
