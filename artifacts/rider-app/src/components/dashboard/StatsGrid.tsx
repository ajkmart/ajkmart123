import { Calendar, Package, TrendingUp, Trophy, Truck } from "lucide-react";
import { memo } from "react";
import { formatCurrency } from "./helpers";

interface StatsGridProps {
  deliveriesToday: number;
  earningsToday: number;
  weekEarnings: number;
  totalDeliveries: number;
  currency: string;
  maxDeliveries?: number;
}

export const StatsGrid = memo(function StatsGrid({
  deliveriesToday,
  earningsToday,
  weekEarnings,
  totalDeliveries,
  currency,
  maxDeliveries,
}: StatsGridProps) {
  const stats = [
    {
      icon: <Package size={15} className="text-indigo-300" />,
      label: "Today",
      value: String(deliveriesToday),
      sub: "deliveries",
    },
    {
      icon: <TrendingUp size={15} className="text-green-300" />,
      label: "Earned",
      value: formatCurrency(earningsToday, currency),
      sub: "today",
    },
    {
      icon: <Calendar size={15} className="text-blue-300" />,
      label: "Week",
      value: formatCurrency(weekEarnings, currency),
      sub: "earnings",
    },
    {
      icon: <Trophy size={15} className="text-amber-300" />,
      label: "Total",
      value: String(totalDeliveries),
      sub: "lifetime",
    },
  ];

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-4 gap-2" role="list" aria-label="Daily statistics">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="animate-[slideUp_0.3s_ease-out] rounded-2xl border border-white/[0.06] bg-white/[0.06] p-2.5 text-center backdrop-blur-sm"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
            role="listitem"
          >
            <div className="mb-1.5 flex justify-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.06]">
                {s.icon}
              </div>
            </div>
            <p className="text-[13px] leading-tight font-extrabold text-white">{s.value}</p>
            <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-white/30 uppercase">
              {s.sub}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.06] px-3 py-2 backdrop-blur-sm">
        <Truck size={13} className="flex-shrink-0 text-indigo-300" />
        <p className="text-[11px] font-semibold text-white/60">
          Max simultaneous deliveries:{" "}
          <span className="font-extrabold text-white">{maxDeliveries ?? 3}</span>
        </p>
      </div>
    </div>
  );
});
