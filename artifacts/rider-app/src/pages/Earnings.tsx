import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency as _sharedFcE } from "@workspace/api-zod";
import { tDual } from "@workspace/i18n";
import {
  BarChart2,
  Car,
  CheckCircle,
  ClipboardList,
  CreditCard,
  Package,
  Pencil,
  Star,
  Target,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { api } from "../lib/api";
import { useAuth } from "../lib/rider-auth";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

function SkeletonEarnings() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="animate-pulse space-y-2 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="h-3 w-16 rounded-full bg-gray-100" />
          <div className="h-8 w-28 rounded-full bg-gray-200" />
          <div className="h-2.5 w-20 rounded-full bg-gray-100" />
        </div>
        <div className="animate-pulse space-y-2 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="h-3 w-16 rounded-full bg-gray-100" />
          <div className="h-8 w-12 rounded-full bg-gray-200" />
          <div className="h-2.5 w-16 rounded-full bg-gray-100" />
        </div>
      </div>
      <div className="animate-pulse space-y-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="h-3 w-24 rounded-full bg-gray-100" />
        <div className="h-3.5 w-full rounded-full bg-gray-200" />
        <div className="h-2.5 w-28 rounded-full bg-gray-100" />
      </div>
      <div className="animate-pulse rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 h-3 w-24 rounded-full bg-gray-100" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 rounded-2xl bg-gray-50 p-4">
              <div className="mx-auto h-6 w-16 rounded-full bg-gray-200" />
              <div className="mx-auto h-2.5 w-20 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
type Period = "today" | "week" | "month";

export default function Earnings() {
  const { user, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);
  const currency = config.platform.currencySymbol ?? "Rs.";
  const formatCurrency = (n: string | number | null | undefined) =>
    _sharedFcE(n != null ? String(n) : (n as null | undefined), currency);
  const riderKeepPct = config.rider?.keepPct ?? config.finance.riderEarningPct ?? 80;
  const [period, setPeriod] = useState<Period>("week");
  const qc = useQueryClient();

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [goalError, setGoalError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["rider-earnings"],
    queryFn: () => api.getEarnings(),
    refetchInterval: 60000,
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  type PeriodBreakdown = {
    food: { earnings: number; count: number };
    parcel: { earnings: number; count: number };
    rides: { earnings: number; count: number };
  };
  type PeriodData = { earnings: number; deliveries: number; breakdown?: PeriodBreakdown };
  const periodData: PeriodData = (data?.[period as keyof typeof data] as PeriodData) || {
    earnings: 0,
    deliveries: 0,
  };

  const adminDailyGoal = config.rider?.dailyGoal ?? 0;
  const personalDailyGoal: number | null = data?.dailyGoal ?? user?.dailyGoal ?? null;
  const dailyGoal = personalDailyGoal ?? adminDailyGoal;
  const isPersonalGoal = personalDailyGoal != null && personalDailyGoal !== undefined;

  const todayPct =
    dailyGoal > 0 ? Math.min(100, Math.round(((data?.today?.earnings || 0) / dailyGoal) * 100)) : 0;

  const totalDeliveries = user?.stats?.totalDeliveries || 0;
  const totalEarnings = user?.stats?.totalEarnings || 0;
  const avgPerDelivery =
    periodData.deliveries > 0 ? periodData.earnings / periodData.deliveries : 0;

  const rating = user?.stats?.rating ?? 5;
  const ratingLabel =
    rating >= 4.8
      ? "Excellent"
      : rating >= 4.5
        ? "Very Good"
        : rating >= 4.0
          ? "Good"
          : "Needs Work";

  const PERIOD_TABS: { key: Period; label: string }[] = [
    { key: "today", label: T("today") },
    { key: "week", label: T("thisWeek") },
    { key: "month", label: T("thisMonth") },
  ];

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["rider-earnings"] });
  }, [qc]);

  const goalMutation = useMutation({
    mutationFn: (dailyGoalValue: number | null) => api.updateProfile({ dailyGoal: dailyGoalValue }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["rider-earnings"] }),
        refreshUser().catch((err) => {
          console.warn("[artifacts/rider-app/src/pages/Earnings.tsx]", err);
        }), // eslint-disable-line no-console
      ]);
      setGoalError(null);
      setShowGoalModal(false);
    },
    onError: () => {
      setGoalError(T("saveFailedMsg"));
    },
  });

  const openGoalModal = () => {
    setGoalInput(personalDailyGoal ? String(Math.round(personalDailyGoal)) : "");
    setGoalError(null);
    setShowGoalModal(true);
  };

  const handleSaveGoal = () => {
    const parsed = parseFloat(goalInput);
    if (goalInput.trim() === "") {
      goalMutation.mutate(null);
    } else if (isNaN(parsed) || parsed <= 0) {
      setGoalError("Please enter a valid goal amount greater than zero.");
    } else {
      goalMutation.mutate(parsed);
    }
  };

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen bg-[#F5F6F8]">
      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-green-500/[0.04]" />
        <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
        <div className="relative">
          <p className="mb-1 text-xs font-semibold tracking-widest text-white/40 uppercase">
            {T("incomePerformance")}
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{T("earnings")}</h1>

          <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4 backdrop-blur-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-white/40 uppercase">
              <Wallet size={13} /> {T("walletBalance")}
            </p>
            <p className="mt-1 text-[36px] leading-tight font-black text-white">
              {formatCurrency(user?.walletBalance ?? "0")}
            </p>
            <p className="mt-1 text-xs text-white/30">{T("earningsAfterDelivery")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div className="flex gap-1 rounded-full border border-gray-100 bg-white p-1 shadow-sm">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPeriod(tab.key)}
              className={`flex-1 rounded-full py-2.5 text-xs font-bold transition-all ${period === tab.key ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <SkeletonEarnings />
        ) : isError ? (
          <ErrorState
            title={T("somethingWentWrong")}
            subtitle={T("checkInternetRetry")}
            onRetry={() => qc.invalidateQueries({ queryKey: ["rider-earnings"] })}
            retryLabel={T("retry")}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-gray-900 p-5 text-white shadow-sm">
              <p className="text-sm font-medium text-white/40">{T("earnings")}</p>
              <p className="mt-1 text-3xl font-extrabold">{formatCurrency(periodData.earnings)}</p>
              <p className="mt-1 text-xs text-white/30">
                {riderKeepPct}% {T("deliveries").toLowerCase()}
              </p>
            </div>
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-500">{T("deliveries")}</p>
              <p className="mt-1 text-3xl font-extrabold text-gray-900">{periodData.deliveries}</p>
              <p className="mt-1 text-xs text-gray-400">{T("completedLabel")}</p>
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                <Target size={14} className="text-gray-900" />
                {T("dailyGoal")}
                {isPersonalGoal && (
                  <span className="rounded-full bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase">
                    {T("personalBadge")}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                Target: {formatCurrency(dailyGoal)}/day
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openGoalModal}
                className="rounded-xl bg-gray-100 p-1.5 text-gray-500 transition-colors hover:bg-gray-200 active:bg-gray-300"
                aria-label="Edit daily goal"
              >
                <Pencil size={13} />
              </button>
              <div className="text-right">
                <p className="text-lg font-extrabold text-gray-900">{todayPct}%</p>
                <p className="text-xs text-gray-400">
                  {formatCurrency(data?.today?.earnings || 0)}
                </p>
              </div>
            </div>
          </div>
          <div className="h-3.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-3.5 rounded-full transition-all duration-700 ${todayPct >= 100 ? "bg-green-500" : todayPct >= 60 ? "bg-gray-700" : "bg-gray-400"}`}
              style={{ width: `${todayPct}%` }}
            />
          </div>
          {todayPct >= 100 ? (
            <p className="mt-2.5 flex items-center gap-1 text-xs font-bold text-green-600">
              <CheckCircle size={12} /> {T("dailyGoalReached")}
            </p>
          ) : (
            <p className="mt-2.5 text-xs text-gray-400">
              {formatCurrency(dailyGoal - (data?.today?.earnings || 0))} {T("moreToGoal")}
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="mb-3.5 flex items-center gap-1.5 text-sm font-bold text-gray-800">
            <BarChart2 size={14} className="text-gray-900" /> {T("performance")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#F5F6F8] p-4 text-center">
              <p className="text-2xl font-extrabold text-gray-900">{totalDeliveries}</p>
              <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-gray-500">
                <ClipboardList size={11} /> {T("totalDeliveries")}
              </p>
            </div>
            <div className="rounded-2xl bg-[#F5F6F8] p-4 text-center">
              <p className="text-2xl font-extrabold text-gray-900">
                {formatCurrency(avgPerDelivery)}
              </p>
              <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-gray-500">
                <TrendingUp size={11} /> {T("avgPerDelivery")}
              </p>
            </div>
            <div className="rounded-2xl bg-[#F5F6F8] p-4 text-center">
              <p className="text-2xl font-extrabold text-gray-900">
                {formatCurrency(totalEarnings)}
              </p>
              <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-gray-500">
                <CreditCard size={11} /> {T("allTimeEarned")}
              </p>
            </div>
            <div className="rounded-2xl bg-[#F5F6F8] p-4 text-center">
              <div className="flex items-center justify-center gap-1">
                <p className="text-2xl font-extrabold text-gray-900">{rating.toFixed(1)}</p>
                <Star size={18} className="fill-yellow-400 text-yellow-400" />
              </div>
              <p className="mt-1 text-xs font-semibold text-gray-500">{ratingLabel}</p>
            </div>
          </div>
        </div>

        {!isLoading && !isError && periodData.breakdown && (
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="mb-3.5 flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <BarChart2 size={14} className="text-gray-900" /> By Service Type
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Food",
                  icon: <UtensilsCrossed size={16} className="text-orange-500" />,
                  earnings: periodData.breakdown.food.earnings,
                  count: periodData.breakdown.food.count,
                  bg: "bg-orange-50",
                  text: "text-orange-600",
                },
                {
                  label: "Parcel",
                  icon: <Package size={16} className="text-blue-500" />,
                  earnings: periodData.breakdown.parcel.earnings,
                  count: periodData.breakdown.parcel.count,
                  bg: "bg-blue-50",
                  text: "text-blue-600",
                },
                {
                  label: "Rides",
                  icon: <Car size={16} className="text-purple-500" />,
                  earnings: periodData.breakdown.rides.earnings,
                  count: periodData.breakdown.rides.count,
                  bg: "bg-purple-50",
                  text: "text-purple-600",
                },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} rounded-2xl p-3.5 text-center`}>
                  <div className="mb-2 flex items-center justify-center">{item.icon}</div>
                  <p className={`text-base font-extrabold ${item.text}`}>
                    {formatCurrency(item.earnings)}
                  </p>
                  <p className="mt-0.5 text-[9px] font-semibold text-gray-500">{item.count} jobs</p>
                  <p className="text-[9px] font-bold text-gray-400">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && (
          <Accordion type="single" collapsible defaultValue="breakdown">
            <AccordionItem
              value="breakdown"
              className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
            >
              <AccordionTrigger className="bg-gray-50/50 px-5 py-4 hover:no-underline">
                <span className="text-sm font-bold text-gray-800">
                  {period === "today"
                    ? `${T("today")} Breakdown`
                    : period === "week"
                      ? `${T("thisWeek")} Breakdown`
                      : T("thisMonthBreakdown")}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-0 pb-0">
                <div className="divide-y divide-gray-50">
                  {[
                    {
                      label: `${T("totalEarned")} (${riderKeepPct}%)`,
                      value: formatCurrency(periodData.earnings),
                      color: "text-green-600",
                    },
                    {
                      label: `${T("deliveries")} ${T("completedLabel")}`,
                      value: String(periodData.deliveries),
                      color: "text-gray-900",
                    },
                    {
                      label: T("avgPerDelivery"),
                      value: formatCurrency(avgPerDelivery),
                      color: "text-gray-900",
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                      <span className="text-sm text-gray-600">{row.label}</span>
                      <span className={`text-sm font-extrabold ${row.color}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <Accordion type="single" collapsible>
          <AccordionItem
            value="how-it-works"
            className="overflow-hidden rounded-3xl border-0 bg-gray-900"
          >
            <AccordionTrigger className="px-5 py-4 hover:no-underline [&>svg]:text-white/40">
              <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                <CreditCard size={14} className="text-white/60" /> {T("howEarningsWork")}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-0">
              <div className="space-y-2 px-5 pb-1">
                {[
                  T("keepPercentage").replace("{pct}", String(riderKeepPct)),
                  T("earningsCreditedInstantly"),
                  T("withdrawAnytime"),
                  T("processedWithin"),
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle size={13} className="mt-0.5 flex-shrink-0 text-green-400" />
                    <p className="text-xs leading-relaxed font-medium text-white/60">{item}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">{T("setDailyGoalTitle")}</h3>
                <p className="mt-0.5 text-xs text-gray-400">
                  Admin default: {formatCurrency(adminDailyGoal)}/day
                </p>
              </div>
              <button
                onClick={() => setShowGoalModal(false)}
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
                  placeholder={String(Math.round(adminDailyGoal))}
                  className="flex-1 bg-transparent py-3 pr-3 text-lg font-extrabold text-gray-900 outline-none"
                  autoFocus
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Leave blank to use the admin default ({formatCurrency(adminDailyGoal)}).
              </p>
            </div>

            {goalError && (
              <p className="mb-3 px-1 text-xs font-semibold text-red-500">{goalError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowGoalModal(false)}
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

            {isPersonalGoal && (
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
    </PullToRefresh>
  );
}
