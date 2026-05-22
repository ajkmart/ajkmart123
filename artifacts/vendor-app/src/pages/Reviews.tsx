import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/ui/ErrorState";
import { api } from "../lib/api";
import { formatDateTz, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

function StarBar({ starValue, count, total }: { starValue: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const colors = [
    "",
    "bg-red-400",
    "bg-orange-400",
    "bg-yellow-400",
    "bg-lime-400",
    "bg-green-500",
  ];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-4 text-right font-bold text-gray-500">{starValue}</span>
      <span className="text-amber-400">★</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colors[starValue] ?? "bg-gray-300"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-5 text-right text-gray-400 tabular-nums">{count}</span>
    </div>
  );
}

function StarRating({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "text-xl" : "text-sm";
  return (
    <span className={cls}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(value) ? "text-amber-400" : "text-gray-200"}>
          ★
        </span>
      ))}
    </span>
  );
}

function StatusPill({ status, T }: { status: string; T: (k: TranslationKey) => string }) {
  if (status === "visible")
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
        {T("visibleLabel")}
      </span>
    );
  if (status === "pending_moderation")
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        {T("underReview")}
      </span>
    );
  if (status === "rejected")
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        {T("rejected")}
      </span>
    );
  return null;
}

export default function Reviews() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone ?? "Asia/Karachi";

  const [page, setPage] = useState(1);
  const [stars, setStars] = useState<string>("");
  const [sort, setSort] = useState<string>("newest");
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vendor-reviews", page, stars, sort],
    queryFn: () => api.getVendorReviews({ page, limit: 15, stars: stars || undefined, sort }),
    staleTime: 30_000,
  });

  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );
  const showToast = (m: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  };

  const postM = useMutation({
    mutationFn: ({ reviewId, reply }: { reviewId: string; reply: string }) =>
      api.postVendorReply(reviewId, reply),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-reviews"] });
      setReplyOpen(null);
      setReplyText("");
      showToast(`✅ ${T("replyPostedMsg")}`);
    },
    onError: (e: Error) => showToast("❌ " + (e.message || T("somethingWentWrong"))),
  });

  const putM = useMutation({
    mutationFn: ({ reviewId, reply }: { reviewId: string; reply: string }) =>
      api.updateVendorReply(reviewId, reply),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-reviews"] });
      setReplyOpen(null);
      setReplyText("");
      showToast(`✅ ${T("replyUpdatedMsg")}`);
    },
    onError: (e: Error) => showToast("❌ " + (e.message || T("somethingWentWrong"))),
  });

  const delM = useMutation({
    mutationFn: (reviewId: string) => api.deleteVendorReply(reviewId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-reviews"] });
      setReplyOpen(null);
      setReplyText("");
      showToast(`🗑️ ${T("replyDeletedMsg")}`);
    },
    onError: (e: Error) => showToast("❌ " + (e.message || T("somethingWentWrong"))),
  });

  const reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    orderType: string | null;
    status: string;
    createdAt: string;
    customerName: string | null;
    vendorReply: string | null;
  }> = useMemo(() => data?.reviews ?? [], [data?.reviews]);
  const total: number = data?.total ?? 0;
  const pages: number = data?.pages ?? 1;
  const avgRating: number | null = data?.avgRating ?? null;
  const breakdown: Record<number, number> = data?.starBreakdown ?? {};

  const trendData = useMemo(() => {
    const buckets: Record<string, { date: string; avg: number; count: number; sum: number }> = {};
    reviews.forEach((r) => {
      const d = new Date(r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!buckets[key]) buckets[key] = { date: key, avg: 0, count: 0, sum: 0 };
      buckets[key].sum += r.rating;
      buckets[key].count += 1;
    });
    return Object.values(buckets)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((b) => ({
        date: b.date.slice(5),
        avg: Number((b.sum / b.count).toFixed(2)),
        count: b.count,
      }));
  }, [reviews]);

  const handleReplySubmit = (reviewId: string, existing: boolean) => {
    if (!replyText.trim()) return;
    if (existing) {
      putM.mutate({ reviewId, reply: replyText.trim() });
    } else {
      postM.mutate({ reviewId, reply: replyText.trim() });
    }
  };

  return (
    <div className="bg-[#0A0F1A] md:bg-transparent">
      <PageHeader
        title={T("reviews")}
        subtitle={
          avgRating != null
            ? `${avgRating.toFixed(1)} ★ · ${total} ${T("reviews")}`
            : T("customerFeedback")
        }
      />
      <div className="mx-auto max-w-2xl px-4 py-4 md:max-w-none md:px-0 md:py-4">
        {/* Rating summary card */}
        <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 text-center">
              <p className="text-5xl font-black text-gray-900">
                {avgRating != null ? avgRating.toFixed(1) : "—"}
              </p>
              <StarRating value={avgRating ?? 0} size="lg" />
              <p className="mt-1 text-xs text-gray-400">
                {total} {T("reviews")}
              </p>
            </div>
            <div className="flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map((r) => (
                <StarBar key={r} starValue={r} count={breakdown[r] ?? 0} total={total} />
              ))}
            </div>
          </div>
        </div>

        {/* Rating Trend Chart */}
        {trendData.length >= 2 && (
          <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-extrabold tracking-widest text-gray-400 uppercase">
              Rating Trend (this page)
            </p>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
                <defs>
                  <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[1, 5]}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  ticks={[1, 2, 3, 4, 5]}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "none",
                    boxShadow: "0 4px 20px rgba(0,0,0,.1)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v} ★`, "Avg rating"]}
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  fill="url(#ratingGrad)"
                  dot={{ r: 3, fill: "#f97316", stroke: "white", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5">
            <span className="text-xs font-medium text-gray-500">{T("starsFilter")}</span>
            <select
              value={stars}
              onChange={(e) => {
                setStars(e.target.value);
                setPage(1);
              }}
              className="cursor-pointer bg-transparent text-xs font-semibold text-gray-700 outline-none"
            >
              <option value="">{T("all")}</option>
              {[5, 4, 3, 2, 1].map((s) => (
                <option key={s} value={String(s)}>
                  {s} ★
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5">
            <span className="text-xs font-medium text-gray-500">{T("sortLabel")}</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="cursor-pointer bg-transparent text-xs font-semibold text-gray-700 outline-none"
            >
              <option value="newest">{T("sortNewest")}</option>
              <option value="oldest">{T("sortOldest")}</option>
            </select>
          </div>
        </div>

        {/* Reviews list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-gray-100 bg-white p-4"
              >
                <div className="mb-2 h-3 w-1/3 rounded bg-gray-100" />
                <div className="h-3 w-2/3 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={T("somethingWentWrong")}
            subtitle={T("checkInternetRetry")}
            onRetry={() => refetch()}
            retryLabel={T("retry")}
          />
        ) : reviews.length === 0 ? (
          <div className="py-16 text-center">
            <p className="mb-3 text-4xl">⭐</p>
            <p className="font-extrabold text-gray-700">{T("noReviews")}</p>
            <p className="mt-1 text-sm text-gray-400">{T("customerFeedback")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                      <span className="text-sm font-bold text-blue-600">
                        {(r.customerName?.[0] ?? "?").toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-gray-800">
                          {r.customerName ?? T("customer")}
                        </p>
                        <StatusPill status={r.status} T={T} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {r.orderType && (
                          <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 text-gray-500 capitalize">
                            {r.orderType}
                          </span>
                        )}
                        {formatDateTz(
                          r.createdAt,
                          { day: "numeric", month: "short", year: "numeric" },
                          tz
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StarRating value={r.rating} />
                    {r.status === "visible" && (
                      <button
                        className="text-xs font-medium text-blue-600 underline"
                        onClick={() => {
                          if (replyOpen === r.id) {
                            setReplyOpen(null);
                          } else {
                            setReplyOpen(r.id);
                            setReplyText(r.vendorReply || "");
                          }
                        }}
                      >
                        {r.vendorReply ? T("editReplyLabel") : T("replyLabel")}
                      </button>
                    )}
                  </div>
                </div>

                {r.comment && (
                  <p className="mt-2 border-t border-gray-50 pt-2 text-sm leading-relaxed text-gray-600 italic">
                    "{r.comment}"
                  </p>
                )}

                {/* Vendor reply display */}
                {r.vendorReply && replyOpen !== r.id && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                    <div className="mt-0.5 text-blue-500">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5 fill-none stroke-current stroke-2"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs font-semibold text-blue-700">Your Reply</p>
                      <p className="text-xs text-blue-600">{r.vendorReply}</p>
                    </div>
                  </div>
                )}

                {/* Reply form */}
                {replyOpen === r.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                      rows={3}
                      placeholder="Write your reply to this customer..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={postM.isPending || putM.isPending || delM.isPending}
                    />
                    <div className="flex gap-2">
                      <button
                        className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        onClick={() => handleReplySubmit(r.id, !!r.vendorReply)}
                        disabled={
                          postM.isPending || putM.isPending || delM.isPending || !replyText.trim()
                        }
                      >
                        {postM.isPending || putM.isPending
                          ? "Saving..."
                          : r.vendorReply
                            ? "Update Reply"
                            : "Post Reply"}
                      </button>
                      {r.vendorReply && (
                        <button
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                          onClick={() => delM.mutate(r.id)}
                          disabled={delM.isPending}
                        >
                          {delM.isPending ? "..." : "Delete"}
                        </button>
                      )}
                      <button
                        className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600"
                        onClick={() => setReplyOpen(null)}
                        disabled={postM.isPending || putM.isPending || delM.isPending}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="mt-5 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 disabled:opacity-40"
            >
              ← {T("back")}
            </button>
            <span className="text-sm text-gray-500">
              {page} / {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 disabled:opacity-40"
            >
              {T("nextPage")} →
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div
          className="toast-in fixed top-0 right-0 left-0 z-50 flex justify-center"
          style={{
            paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)",
            paddingLeft: "16px",
            paddingRight: "16px",
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-2xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
