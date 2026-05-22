import { X } from "lucide-react";
import { formatCurrency } from "../dashboard";

interface HomeGoalModalProps {
  onClose: () => void;
  goalInput: string;
  setGoalInput: (v: string) => void;
  handleSaveGoal: () => void;
  goalMutation: { isPending: boolean; mutate: (v: null) => void };
  config: { rider?: { dailyGoal?: number } };
  currency: string;
  earningsData: { dailyGoal?: number } | undefined;
  user: { dailyGoal?: number } | null | undefined;
  T: (key: import("@workspace/i18n").TranslationKey) => string;
}

export function HomeGoalModal({
  onClose,
  goalInput,
  setGoalInput,
  handleSaveGoal,
  goalMutation,
  config,
  currency,
  earningsData,
  user,
  T,
}: HomeGoalModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-gray-900">{T("setDailyGoalTitle")}</h3>
            <p className="mt-0.5 text-xs text-gray-400">
              Admin default: {formatCurrency(config.rider?.dailyGoal ?? 5000, currency)}/day
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-600 uppercase">
            Your Personal Goal ({currency})
          </label>
          <div className="flex items-center overflow-hidden rounded-2xl border-2 border-gray-200 transition-colors focus-within:border-gray-900">
            <span className="px-3 text-sm font-bold text-gray-400">{currency}</span>
            <input
              type="number"
              min="1"
              step="100"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder={String(Math.round(config.rider?.dailyGoal ?? 5000))}
              className="flex-1 bg-transparent py-3 pr-3 text-lg font-extrabold text-gray-900 outline-none"
              autoFocus
            />
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            Leave blank to use the admin default (
            {formatCurrency(config.rider?.dailyGoal ?? 5000, currency)}).
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveGoal}
            disabled={goalMutation.isPending}
            className="flex-1 rounded-2xl bg-gray-900 py-3 text-sm font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
          >
            {goalMutation.isPending ? "Saving…" : T("saveGoal")}
          </button>
        </div>

        {(earningsData?.dailyGoal ?? user?.dailyGoal) && (
          <button
            onClick={() => goalMutation.mutate(null)}
            disabled={goalMutation.isPending}
            className="mt-2 w-full py-2.5 text-xs font-bold text-red-500 transition-colors hover:text-red-700 disabled:opacity-60"
          >
            {T("resetToAdminDefault")}
          </button>
        )}
      </div>
    </div>
  );
}
