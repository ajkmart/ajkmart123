import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Pencil, Target, X } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { formatCurrency } from "../dashboard";

interface GoalSectionProps {
  adminGoal: number;
  personalGoal: number | null;
  todayEarnings: number;
  currency: string;
  T: (key: import("@workspace/i18n").TranslationKey) => string;
  showToast: (msg: string, type: "success" | "error") => void;
  refreshUser: () => Promise<void>;
}

export function GoalSection({
  adminGoal,
  personalGoal,
  todayEarnings,
  currency,
  T,
  showToast,
  refreshUser,
}: GoalSectionProps) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const dailyGoal = personalGoal ?? adminGoal;
  const todayPct = dailyGoal > 0 ? Math.min(100, Math.round((todayEarnings / dailyGoal) * 100)) : 0;
  const reached = todayPct >= 100;

  const goalMutation = useMutation({
    mutationFn: (v: number | null) => api.updateProfile({ dailyGoal: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rider-earnings"] });
      await refreshUser().catch((err) => {
        console.warn("[artifacts/rider-app/src/components/home/GoalSection.tsx]", err);
      }); // eslint-disable-line no-console
      setShowModal(false);
      showToast("Daily goal updated!", "success");
    },
    onError: () => showToast("Could not save goal. Please try again.", "error"),
  });

  const openModal = () => {
    setGoalInput(personalGoal ? String(Math.round(personalGoal)) : "");
    setShowModal(true);
  };

  const handleSave = () => {
    const parsed = parseFloat(goalInput);
    if (goalInput.trim() === "") goalMutation.mutate(null);
    else if (!isNaN(parsed) && parsed > 0) goalMutation.mutate(parsed);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">{T("setDailyGoalTitle")}</h3>
                <p className="mt-0.5 text-xs text-gray-400">
                  Admin default: {formatCurrency(adminGoal, currency)}/day
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
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
                  placeholder={String(Math.round(adminGoal))}
                  className="flex-1 bg-transparent py-3 pr-3 text-lg font-extrabold text-gray-900 outline-none"
                  autoFocus
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Leave blank to use admin default ({formatCurrency(adminGoal, currency)}).
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={goalMutation.isPending}
                className="flex-1 rounded-2xl bg-gray-900 py-3 text-sm font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
              >
                {goalMutation.isPending ? "Saving…" : T("saveGoal")}
              </button>
            </div>
            {personalGoal != null && (
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
      )}
    </>
  );
}
