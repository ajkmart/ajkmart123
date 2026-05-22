import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency as _sharedFc } from "@workspace/api-zod";
import { tDual } from "@workspace/i18n";
import { AlertTriangle, ArrowLeft, CheckCircle, Info, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback } from "react";
import { Link } from "wouter";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import { api } from "../lib/api";
import { formatDateTz, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

type Penalty = {
  id: string;
  type: string;
  amount: string | number;
  reason: string | null;
  createdAt: string;
};

function penaltyTypeLabel(type: string): string {
  const map: Record<string, string> = {
    cancellation: "Cancellation",
    late_delivery: "Late Delivery",
    customer_complaint: "Customer Complaint",
    misconduct: "Misconduct",
    ignore: "Ride Ignored",
    cancel: "Order Cancelled",
    late: "Late Delivery",
    conduct: "Conduct Violation",
    fraud: "Fraud Attempt",
  };
  return map[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function penaltyColor(type: string): string {
  const map: Record<string, string> = {
    cancellation: "bg-orange-50 text-orange-700 border-orange-200",
    late_delivery: "bg-yellow-50 text-yellow-700 border-yellow-200",
    customer_complaint: "bg-red-50 text-red-700 border-red-200",
    misconduct: "bg-red-100 text-red-800 border-red-300",
    ignore: "bg-amber-50 text-amber-700 border-amber-200",
    cancel: "bg-orange-50 text-orange-700 border-orange-200",
    late: "bg-yellow-50 text-yellow-700 border-yellow-200",
    conduct: "bg-red-50 text-red-700 border-red-200",
    fraud: "bg-red-100 text-red-800 border-red-300",
  };
  return map[type] ?? "bg-gray-50 text-gray-700 border-gray-200";
}

function penaltyIcon(type: string) {
  if (
    type === "conduct" ||
    type === "fraud" ||
    type === "misconduct" ||
    type === "customer_complaint"
  )
    return <AlertTriangle size={16} className="shrink-0" />;
  return <ShieldAlert size={16} className="shrink-0" />;
}

export default function PenaltyHistory() {
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const _T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);
  const currency = config.platform?.currencySymbol ?? "Rs.";
  const tz = config.regional?.timezone ?? "Asia/Karachi";
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["rider-penalty-history"],
    queryFn: () => api.getPenaltyHistory(),
    refetchInterval: false,
    staleTime: 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  const penalties: Penalty[] = data?.penalties ?? [];
  const totalDeducted: number =
    typeof data?.total_deducted === "number"
      ? data.total_deducted
      : penalties.reduce((sum, p) => sum + parseFloat(String(p.amount) || "0"), 0);

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["rider-penalty-history"] });
  }, [qc]);

  return (
    <PullToRefresh onRefresh={handlePullRefresh} accentColor="#10B981">
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 pt-4 pb-3">
          <Link href="/profile">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Penalty History</h1>
            <p className="text-xs text-gray-500">Your penalty & deduction records</p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="space-y-4 px-4 pt-4">
          {/* Summary card */}
          {!isLoading && !isError && (
            <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div>
                <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                  Total Deducted
                </p>
                <p className="mt-0.5 text-2xl font-bold text-red-600">
                  {currency} {_sharedFc(String(totalDeducted), currency)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {penalties.length} record{penalties.length !== 1 ? "s" : ""}
                </p>
              </div>
              {penalties.length === 0 ? (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50">
                  <CheckCircle size={28} className="text-green-500" />
                </div>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
                  <ShieldAlert size={28} className="text-red-400" />
                </div>
              )}
            </div>
          )}

          {/* Info banner */}
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
            <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
            <p className="text-xs leading-relaxed text-blue-700">
              Penalties are deducted from your wallet for policy violations such as ignoring ride
              requests, cancelling orders, or conduct issues. Contact support if you believe a
              penalty was applied in error.
            </p>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-gray-100 bg-white p-4"
                >
                  <div className="mb-2 h-4 w-2/5 rounded bg-gray-200" />
                  <div className="mb-2 h-3 w-3/5 rounded bg-gray-100" />
                  <div className="h-3 w-1/4 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {isError && (
            <ErrorState
              title="Could not load penalty history"
              subtitle="Please pull down to retry."
              onRetry={() => refetch()}
            />
          )}

          {/* Empty */}
          {!isLoading && !isError && penalties.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-green-50">
                <CheckCircle size={40} className="text-green-400" />
              </div>
              <p className="text-lg font-semibold text-gray-800">No Penalties</p>
              <p className="mt-1 max-w-xs text-sm text-gray-500">
                Great job! You have a clean record with no penalties.
              </p>
            </div>
          )}

          {/* Penalty list */}
          {!isLoading && !isError && penalties.length > 0 && (
            <div className="space-y-2.5">
              {penalties.map((p) => {
                const amt = parseFloat(String(p.amount) || "0");
                const color = penaltyColor(p.type);
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${color}`}
                        >
                          {penaltyIcon(p.type)}
                          {penaltyTypeLabel(p.type)}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-red-600">
                          − {currency} {_sharedFc(String(amt), currency)}
                        </p>
                      </div>
                    </div>

                    {p.reason && (
                      <p className="mt-2 text-sm leading-relaxed text-gray-600">{p.reason}</p>
                    )}

                    <p className="mt-2 text-xs text-gray-400">
                      {formatDateTz(
                        p.createdAt,
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                        tz
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
