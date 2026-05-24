import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bike, Package, Star } from "lucide-react";
import { Link } from "wouter";
import { ErrorState } from "../components/ui/ErrorState";
import { api } from "../lib/api";
import { formatDateTz, usePlatformConfig } from "../lib/useConfig";

interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  customerName?: string | null;
  createdAt: string;
  orderId?: string | null;
  rideId?: string | null;
  orderType?: string | null;
}

interface ReviewsData {
  reviews: Review[];
  avgRating?: number;
  total?: number;
  starBreakdown?: Record<number, number>;
}

function StarDistributionBar({
  starBreakdown,
  total,
}: {
  starBreakdown: Record<number, number>;
  total: number;
}) {
  const barColors: Record<number, string> = {
    5: "bg-green-500",
    4: "bg-lime-400",
    3: "bg-yellow-400",
    2: "bg-orange-400",
    1: "bg-red-500",
  };
  return (
    <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3.5 backdrop-blur-sm">
      {[5, 4, 3, 2, 1].map((star) => {
        const cnt = starBreakdown[star] ?? 0;
        const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-[11px]">
            <span className="w-3 flex-shrink-0 text-right font-bold text-white/60">{star}</span>
            <Star size={8} className="flex-shrink-0 fill-amber-400 text-amber-400" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.12]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColors[star]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-14 flex-shrink-0 text-right tabular-nums text-white/40">
              {cnt} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={
            i <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "fill-gray-200 text-gray-200"
          }
        />
      ))}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse space-y-3 rounded-3xl border border-gray-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="h-3.5 w-24 rounded-full bg-gray-200" />
        <div className="h-3 w-16 rounded-full bg-gray-100" />
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-3.5 w-3.5 rounded-full bg-gray-200" />
        ))}
      </div>
      <div className="h-3 w-3/4 rounded-full bg-gray-100" />
    </div>
  );
}

export default function Reviews() {
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone ?? "Asia/Karachi";

  const { data, isLoading, isError, refetch } = useQuery<ReviewsData>({
    queryKey: ["rider-my-reviews-full"],
    queryFn: () => api.getMyReviews(),
    staleTime: 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  const reviews: Review[] = data?.reviews ?? [];
  const avgRating: number = data?.avgRating ?? 0;
  const totalReviews: number = data?.total ?? 0;

  function formatDate(d: string) {
    return formatDateTz(d, { day: "numeric", month: "short", year: "numeric" }, tz);
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-amber-400/[0.04]" />
        <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
        <div className="relative mb-5 flex items-center gap-3">
          <Link
            href="/profile"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.07] text-white/70 transition-colors hover:bg-white/[0.12]"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="mb-0.5 text-xs font-semibold tracking-widest text-white/40 uppercase">
              Customer Feedback
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">My Reviews</h1>
          </div>
        </div>

        {!isLoading && !isError && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold text-white">
                  {avgRating > 0 ? `${avgRating.toFixed(1)} / 5.0` : "—"}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-white/30 uppercase">
                  Avg Rating
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold text-white">{totalReviews}</p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-white/30 uppercase">
                  Total Reviews
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3 text-center backdrop-blur-sm">
                <p className="text-lg font-extrabold text-amber-400">
                  {reviews.filter((r) => r.rating >= 4).length}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-white/30 uppercase">
                  Positive
                </p>
              </div>
            </div>
            {data?.starBreakdown && totalReviews > 0 && (
              <StarDistributionBar starBreakdown={data.starBreakdown} total={totalReviews} />
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 pt-4 pb-8">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : reviews.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50">
              <Star size={28} className="text-amber-300" />
            </div>
            <p className="text-base font-bold text-gray-700">No reviews yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Complete deliveries and rides to earn your first review.
            </p>
          </div>
        ) : (
          reviews.map((review) => (
            <div
              key={review.id}
              className="space-y-2.5 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <StarRow rating={review.rating} size={15} />
                  <p className="text-xs font-medium text-gray-500">
                    {review.customerName ? review.customerName : "Customer"}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      review.rideId ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {review.rideId ? (
                      <>
                        <Bike size={10} /> Ride
                      </>
                    ) : (
                      <>
                        <Package size={10} /> {review.orderType ?? "Order"}
                      </>
                    )}
                  </span>
                  {(review.orderId || review.rideId) && (
                    <p className="mt-1 max-w-[120px] truncate font-mono text-[10px] text-gray-400">
                      #{(review.orderId ?? review.rideId ?? "").slice(-8).toUpperCase()}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-gray-400">{formatDate(review.createdAt)}</p>
                </div>
              </div>

              {review.comment && review.comment.trim() && (
                <div className="rounded-2xl bg-gray-50 px-3.5 py-2.5">
                  <p className="text-sm leading-relaxed text-gray-600 italic">
                    "{review.comment.trim()}"
                  </p>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i <= Math.round(review.rating) ? "bg-amber-400" : "bg-gray-100"}`}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
