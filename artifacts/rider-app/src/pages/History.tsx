import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency as _sharedFcH } from "@workspace/api-zod";
import { tDual } from "@workspace/i18n";
import {
  Bike,
  Calendar,
  Car,
  ClipboardList,
  CreditCard,
  Package,
  RefreshCw,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useState } from "react";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import { api } from "../lib/api";
import { formatDateTz, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

function SkeletonHistory() {
  return (
    <div className="space-y-3 px-4 py-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-3xl border border-gray-100 bg-white p-4"
        >
          <div className="h-10 w-10 flex-shrink-0 rounded-2xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-32 rounded-full bg-gray-200" />
            <div className="h-2.5 w-24 rounded-full bg-gray-100" />
          </div>
          <div className="flex flex-col items-end space-y-1.5">
            <div className="h-3.5 w-16 rounded-full bg-gray-200" />
            <div className="h-5 w-14 rounded-full bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(d: string | Date, tz?: string) {
  return formatDateTz(
    d,
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
    tz ?? "Asia/Karachi"
  );
}

function formatCurrency(n: string | number | null | undefined) {
  return _sharedFcH(n != null ? String(n) : (n as null | undefined));
}

type FilterPeriod = "today" | "week" | "all";
type FilterKind = "all" | "order" | "ride" | "parcel";

type HistoryItem = {
  id: string;
  kind: "order" | "ride";
  type: string;
  status: string;
  earnings: number;
  amount: number;
  address?: string;
  createdAt: string;
  proofPhoto?: string;
  origin?: string;
  destination?: string;
  fare?: number;
  distance?: string | number;
  duration?: number;
};

const PAGE_SIZE = 50;

export default function History() {
  const [period, setPeriod] = useState<FilterPeriod>("all");
  const [kind, setKind] = useState<FilterKind>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { language } = useLanguage();
  const T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone ?? "Asia/Karachi";
  const qc = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isFetching,
  } = useInfiniteQuery({
    /* Include kind + period in the queryKey so switching filters triggers
       a fresh page-1 fetch rather than re-using the stale accumulated pages
       from a different filter combination. */
    queryKey: ["rider-history", kind, period],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      api.getHistory({ limit: PAGE_SIZE, offset: pageParam, kind, period }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam: number) =>
      lastPage.hasMore ? lastPageParam + PAGE_SIZE : undefined,
    refetchInterval: false,
  });

  /* Accumulate all loaded pages into a flat list — filters are applied server-side */
  const filtered: HistoryItem[] = data?.pages.flatMap((p) => p.history) ?? [];

  /* Date boundaries for grouping headers (display only, not for data filtering) */
  const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const nowInPKT = Date.now() + PKT_OFFSET_MS;
  const todayStart = new Date(
    Math.floor(nowInPKT / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000) - PKT_OFFSET_MS
  );
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  const totalEarnings = filtered.reduce((s, i) => s + (i.earnings || 0), 0);
  const completedItems = filtered.filter(
    (i) => i.status === "delivered" || i.status === "completed"
  );
  const cancelledItems = filtered.filter((i) => i.status === "cancelled");

  const PERIOD_TABS: { key: FilterPeriod; label: string }[] = [
    { key: "today", label: T("today") },
    { key: "week", label: T("thisWeek") },
    { key: "all", label: T("all") },
  ];
  type KindTab = { key: FilterKind; label: string; icon: React.ReactElement };
  const KIND_TABS: KindTab[] = [
    { key: "all", label: T("all"), icon: <ClipboardList size={12} /> },
    { key: "order", label: T("orders"), icon: <ShoppingCart size={12} /> },
    { key: "ride", label: T("rides"), icon: <Bike size={12} /> },
    { key: "parcel", label: T("parcels") || "Parcels", icon: <Package size={12} /> },
  ];

  function ItemIcon({ kind, type }: { kind: string; type: string }) {
    if (kind === "ride") {
      return type === "bike" ? (
        <Bike size={20} className="text-green-600" />
      ) : (
        <Car size={20} className="text-green-600" />
      );
    }
    if (type === "food") return <UtensilsCrossed size={20} className="text-blue-600" />;
    if (type === "mart") return <ShoppingCart size={20} className="text-blue-600" />;
    return <Package size={20} className="text-blue-600" />;
  }

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["rider-history", kind, period] });
  }, [qc, kind, period]);

  const totalLoaded = filtered.length;

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen bg-[#F5F6F8]">
      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-green-500/[0.04]" />
        <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold tracking-widest text-white/40 uppercase">
                <Calendar size={11} className="mr-1 inline" /> {totalLoaded} {T("totalRecords")}
              </p>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">{T("history")}</h1>
            </div>
            <button
              onClick={() => {
                void refetch();
              }}
              disabled={isFetching}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.08] transition-opacity active:bg-white/[0.12] disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={`text-white/60 ${isFetching ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {!isLoading && (
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold text-white">{formatCurrency(totalEarnings)}</p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-white/30 uppercase">
                  {T("earnings")}
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold text-white">{completedItems.length}</p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-white/30 uppercase">
                  {T("completed")}
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold text-red-400">{cancelledItems.length}</p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-white/30 uppercase">
                  {T("cancelled")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky top-0 z-10 space-y-3 bg-[#F5F6F8] px-4 pt-4 pb-2">
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
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {KIND_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setKind(tab.key)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-all ${kind === tab.key ? "bg-gray-900 text-white shadow-sm" : "border border-gray-200 bg-white text-gray-500"}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <p className="px-1 text-[10px] text-gray-400">
          Filters applied server-side across your full history. Search is limited to loaded items.
        </p>
      </div>

      <div className="space-y-3 px-4 py-3">
        {isLoading ? (
          <SkeletonHistory />
        ) : isError ? (
          <ErrorState
            title={T("somethingWentWrong")}
            subtitle={T("noRecordsFound")}
            onRetry={() => refetch()}
            retryLabel={T("retry")}
          />
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gray-100">
              <ClipboardList size={32} className="text-gray-300" />
            </div>
            <p className="text-base font-bold text-gray-700">{T("noRecordsFound")}</p>
            <p className="mt-1 text-sm text-gray-400">
              {period !== "all" ? T("widerTimePeriod") : T("deliveriesAppearHere")}
            </p>
          </div>
        ) : (
          (() => {
            const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
            const getGroup = (d: Date) => {
              if (d >= todayStart) return T("today");
              if (d >= yesterdayStart) return T("yesterday");
              if (d >= weekStart) return T("thisWeek");
              return T("earlier");
            };
            let lastGroup = "";
            return filtered.map((item: HistoryItem) => {
              const d = new Date(item.createdAt);
              const group = getGroup(d);
              const showHeader = group !== lastGroup;
              lastGroup = group;
              const completed = item.status === "delivered" || item.status === "completed";
              const cancelled = item.status === "cancelled";
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id}>
                  {showHeader && (
                    <div className="flex items-center gap-2 pt-2 pb-1">
                      <Calendar size={12} className="text-gray-400" />
                      <p className="text-xs font-bold tracking-wider text-gray-400 uppercase">
                        {group}
                      </p>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                  )}
                  <div
                    className="cursor-pointer overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition-colors active:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <div className="flex items-center gap-3.5 p-4">
                      <div
                        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${item.kind === "ride" ? "bg-green-50" : "bg-blue-50"}`}
                      >
                        <ItemIcon kind={item.kind} type={item.type} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-gray-800 capitalize">
                          {item.kind === "ride"
                            ? `${item.type} ${T("ride")}`
                            : `${item.type} ${T("deliveryLabel")}`}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {item.address || "—"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {formatDate(item.createdAt, tz)}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {completed ? (
                          <p className="text-[15px] font-extrabold text-green-600">
                            +{formatCurrency(item.earnings || 0)}
                          </p>
                        ) : (
                          <p className="font-bold text-gray-400">
                            {formatCurrency(item.amount || 0)}
                          </p>
                        )}
                        <span
                          className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            completed
                              ? "bg-green-100 text-green-700"
                              : cancelled
                                ? "bg-red-100 text-red-600"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {item.status.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="space-y-2 border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                        {item.kind === "ride" ? (
                          <>
                            {item.origin && (
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                  From
                                </span>
                                <span className="flex-1 text-xs font-medium text-gray-600">
                                  {item.origin}
                                </span>
                              </div>
                            )}
                            {item.destination && (
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                  To
                                </span>
                                <span className="flex-1 text-xs font-medium text-gray-600">
                                  {item.destination}
                                </span>
                              </div>
                            )}
                            {item.fare != null && (
                              <div className="flex items-center gap-2">
                                <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                  Fare
                                </span>
                                <span className="text-xs font-semibold text-gray-700">
                                  {formatCurrency(item.fare)}
                                </span>
                              </div>
                            )}
                            {item.distance != null && (
                              <div className="flex items-center gap-2">
                                <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                  Distance
                                </span>
                                <span className="text-xs font-semibold text-gray-700">
                                  {typeof item.distance === "number"
                                    ? `${parseFloat(String(item.distance)).toFixed(1)} km`
                                    : `${parseFloat(String(item.distance)).toFixed(1)} km`}
                                </span>
                              </div>
                            )}
                            {item.duration != null && (
                              <div className="flex items-center gap-2">
                                <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                  Duration
                                </span>
                                <span className="text-xs font-semibold text-gray-700">
                                  {item.duration} min
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                Status
                              </span>
                              <span className="text-xs font-semibold text-gray-700 capitalize">
                                {item.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                Date
                              </span>
                              <span className="text-xs text-gray-600">
                                {formatDate(item.createdAt, tz)}
                              </span>
                            </div>
                            {(completed || cancelled) && (
                              <div className="flex items-center gap-2">
                                <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                  {T("earnings")}
                                </span>
                                <span
                                  className={`text-xs font-extrabold ${completed ? "text-green-600" : "text-gray-400"}`}
                                >
                                  {completed ? `+${formatCurrency(item.earnings || 0)}` : "—"}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {item.address && (
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                  Address
                                </span>
                                <span className="flex-1 text-xs font-medium text-gray-600">
                                  {item.address}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                Status
                              </span>
                              <span className="text-xs font-semibold text-gray-700 capitalize">
                                {item.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                Date
                              </span>
                              <span className="text-xs text-gray-600">
                                {formatDate(item.createdAt, tz)}
                              </span>
                            </div>
                            {(completed || cancelled) && (
                              <div className="flex items-center gap-2">
                                <span className="w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                  {T("earnings")}
                                </span>
                                <span
                                  className={`text-xs font-extrabold ${completed ? "text-green-600" : "text-gray-400"}`}
                                >
                                  {completed ? `+${formatCurrency(item.earnings || 0)}` : "—"}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        {item.proofPhoto && completed && item.kind === "order" && (
                          <div className="flex items-start gap-2 pt-1">
                            <span className="mt-1 w-16 flex-shrink-0 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                              Proof
                            </span>
                            <a
                              href={item.proofPhoto}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block overflow-hidden rounded-xl border border-gray-200 shadow-sm transition-opacity hover:opacity-90"
                            >
                              <img
                                src={item.proofPhoto}
                                alt="Delivery proof"
                                className="h-24 w-32 object-cover"
                                loading="lazy"
                              />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    {!isExpanded && completed && item.earnings > 0 && (
                      <div className="px-4 pb-3">
                        <div className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50 px-3.5 py-2">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                            <CreditCard size={12} /> {T("earningsCredited")}
                          </span>
                          <span className="text-xs font-extrabold text-green-700">
                            {formatCurrency(item.earnings)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()
        )}

        {/* Show more button — fetches the next page from the server */}
        {!isLoading && hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 shadow-sm transition-colors active:bg-gray-50 disabled:opacity-60"
          >
            {isFetchingNextPage ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={14} className="animate-spin" /> {T("loading") || "Loading…"}
              </span>
            ) : (
              T("showMore")
            )}
          </button>
        )}
      </div>
    </PullToRefresh>
  );
}
