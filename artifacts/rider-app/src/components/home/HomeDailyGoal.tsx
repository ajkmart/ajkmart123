import { CheckCircle, Pencil, Target } from "lucide-react";
import { formatCurrency } from "../dashboard";

interface HomeDailyGoalProps {
  adminGoal: number;
  personalGoal: number | null;
  todayEarnings: number;
  currency: string;
  openGoalModal: () => void;
  T: (key: import("@workspace/i18n").TranslationKey) => string;
}

export function HomeDailyGoal({
  adminGoal,
  personalGoal,
  todayEarnings,
  currency,
  openGoalModal,
  T,
}: HomeDailyGoalProps) {
  const dailyGoal = personalGoal ?? adminGoal;
  const todayPct = dailyGoal > 0 ? Math.min(100, Math.round((todayEarnings / dailyGoal) * 100)) : 0;
  const reached = todayPct >= 100;

  return (
    <button
      type="button"
      onClick={openGoalModal}
      aria-label="Set personal daily earnings goal"
      className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm transition-colors active:bg-gray-50"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
          <Target size={12} className={reached ? "text-green-500" : "text-gray-400"} />
          {T("dailyGoal")}
          {personalGoal != null && (
            <span className="rounded-full bg-gray-900 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-white uppercase">
              {T("myGoalBadge")}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs font-extrabold ${reached ? "text-green-600" : "text-gray-900"}`}
          >
            {todayPct}%
          </span>
          {reached && <CheckCircle size={12} className="text-green-500" />}
          <Pencil size={11} className="text-gray-300" />
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${reached ? "bg-green-500" : todayPct >= 60 ? "bg-gray-700" : "bg-gray-400"}`}
          style={{ width: `${todayPct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] font-medium text-gray-400">
        {reached
          ? T("dailyGoalReached")
          : `${formatCurrency(todayEarnings, currency)} / ${formatCurrency(dailyGoal, currency)}`}
      </p>
    </button>
  );
}
