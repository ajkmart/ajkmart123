import { useQuery } from "@tanstack/react-query";
import { formatCurrency as _sharedFcP } from "@workspace/api-zod";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { Star } from "lucide-react";
import { api } from "../../lib/api";

const _fc = (n: string | number | null | undefined, currencySymbol = "Rs.") =>
  _sharedFcP(n != null ? String(n) : (n as null | undefined), currencySymbol);

interface ProfileReviewsProps {
  language: string;
  currency: string;
}

export function ProfileReviews({ language, currency: _currency }: ProfileReviewsProps) {
  const T = (key: TranslationKey) => tDual(key, language as never);

  const { data: reviewsData } = useQuery({
    queryKey: ["rider-my-reviews"],
    queryFn: () => api.getMyReviews(),
    staleTime: 60000,
  });

  return (
    <div className="animate-[slideUp_0.7s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-50">
            <Star size={16} className="text-yellow-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{T("customerReviews")}</p>
            <p className="text-[11px] text-gray-400">
              {reviewsData?.total
                ? `${reviewsData.total} ${T("reviews")} · ${reviewsData.avgRating?.toFixed(1)} avg`
                : T("noReviewsYet")}
            </p>
          </div>
        </div>
        {(reviewsData?.avgRating ?? 0) > 0 && (
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                size={12}
                className={
                  s <= Math.round(reviewsData.avgRating || 0)
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-gray-200 text-gray-200"
                }
              />
            ))}
          </div>
        )}
      </div>

      {(reviewsData?.total ?? 0) > 0 && (
        <div className="space-y-1.5 border-b border-gray-50 px-5 py-3">
          {[5, 4, 3, 2, 1].map((star) => {
            const cnt = (reviewsData?.starBreakdown?.[star] ?? 0) as number;
            const pct = reviewsData?.total ? Math.round((cnt / reviewsData.total) * 100) : 0;
            const barColors: Record<number, string> = {
              5: "bg-green-400",
              4: "bg-lime-400",
              3: "bg-yellow-400",
              2: "bg-orange-400",
              1: "bg-red-400",
            };
            return (
              <div key={star} className="flex items-center gap-2 text-[11px]">
                <span className="w-2.5 text-right font-bold text-gray-500">{star}</span>
                <Star size={9} className="flex-shrink-0 fill-amber-400 text-amber-400" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColors[star]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-5 text-right text-gray-400 tabular-nums">{cnt}</span>
              </div>
            );
          })}
        </div>
      )}

      {(reviewsData?.reviews?.length ?? 0) === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-50">
            <Star size={22} className="text-yellow-400" />
          </div>
          <p className="text-sm font-bold text-gray-700">{T("noReviewsYet")}</p>
          <p className="mt-1 text-[11px] text-gray-400">{T("completeMoreRidesFeedback")}</p>
        </div>
      ) : (
        <div className="max-h-96 divide-y divide-gray-50 overflow-y-auto">
          {(reviewsData?.reviews ?? []).map((r: any) => (
            <div key={r.id} className="px-5 py-3.5">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-yellow-100 to-orange-100 text-[11px] font-bold text-orange-600">
                    {(r.customerName || "C")[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold text-gray-700">
                    {r.customerName || T("customerFallback")}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={10}
                      className={
                        s <= r.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "fill-gray-200 text-gray-200"
                      }
                    />
                  ))}
                </div>
              </div>
              {r.comment && (
                <p className="pl-9 text-xs leading-relaxed text-gray-600 italic">"{r.comment}"</p>
              )}
              <p className="mt-1 pl-9 text-[10px] text-gray-300">
                {new Date(r.createdAt).toLocaleDateString("en-PK", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
