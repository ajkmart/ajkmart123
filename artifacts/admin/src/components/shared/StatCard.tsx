import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "wouter";

/**
 * Shared stat card used across high-traffic admin pages.
 *
 * Displays a metric with an icon, label, value, optional trend and
 * optional click-through link. Replaces per-page ad-hoc stat card
 * implementations on dashboard, users, orders, rides, vendors, riders,
 * transactions, kyc, reviews, sos-alerts, and others.
 *
 * Usage:
 *   <StatCard icon={Users} label="Total Users" value={1234} />
 *   <StatCard icon={DollarSign} label="Revenue" value="Rs. 12,400" trend={+5.2} href="/transactions" />
 */

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  href?: string;
  onClick?: () => void;
  iconBgClass?: string;
  iconColorClass?: string;
  className?: string;
}

function StatCardInner({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  iconBgClass = "bg-slate-100",
  iconColorClass = "text-slate-600",
}: Omit<StatCardProps, "href" | "className">) {
  const trendUp = typeof trend === "number" && trend > 0;
  const trendDown = typeof trend === "number" && trend < 0;

  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconBgClass} ${iconColorClass}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
        <p className="text-foreground mt-0.5 text-xl leading-tight font-bold">{value}</p>
        {(sub || typeof trend === "number") && (
          <div className="mt-1 flex items-center gap-1.5">
            {typeof trend === "number" && (
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                  trendUp
                    ? "text-emerald-600"
                    : trendDown
                      ? "text-red-500"
                      : "text-muted-foreground"
                }`}
              >
                {trendUp && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
                {trendDown && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                {trend > 0 ? "+" : ""}
                {trend.toFixed(1)}%
              </span>
            )}
            {sub && <span className="text-muted-foreground truncate text-[11px]">{sub}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Animated placeholder shown while stat card data is loading.
 * Matches the dimensions of StatCard so the layout doesn't shift.
 */
export function StatCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`border-border/50 h-[88px] rounded-2xl border bg-white p-4 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="bg-muted h-10 w-10 flex-shrink-0 animate-pulse rounded-xl" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="bg-muted h-3 w-20 animate-pulse rounded" />
          <div className="bg-muted h-6 w-14 animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}

export function StatCard({ href, onClick, className = "", ...props }: StatCardProps) {
  const base = "rounded-2xl border border-border/50 bg-white p-4 shadow-sm";
  const interactive = href || onClick;

  if (href) {
    return (
      <Link href={href}>
        <div
          className={`${base} cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md ${className}`}
        >
          <StatCardInner {...props} />
        </div>
      </Link>
    );
  }

  return (
    <div
      className={`${base} ${interactive ? "cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md" : ""} ${className}`}
      onClick={onClick}
    >
      <StatCardInner {...props} />
    </div>
  );
}
