import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminAbsoluteFetch, adminFetch } from "@/lib/adminFetcher";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart2,
  Eye,
  Heart,
  Package,
  Percent,
  RefreshCw,
  Search,
  ShoppingCart,
  Star,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SafeImage } from "@/components/ui/SafeImage";

async function apiFetch(path: string) {
  return adminAbsoluteFetch(`/api${path}`);
}

type TrendingProduct = {
  id: string;
  name: string;
  price: number;
  category?: string;
  image?: string;
  rating?: number;
  vendorName?: string;
  score?: number;
  reason?: string;
};

type TopTerm = {
  query: string;
  occurrences: number;
  zeroResults: number;
};

type ZeroResultQuery = {
  query: string;
  occurrences: number;
  lastSearchedAt: string;
};

type StatsData = {
  productCount?: number;
  restaurantCount?: number;
  userCount?: number;
  orderCount?: number;
};

type InteractionTimelineEntry = {
  date: string;
  view: number;
  cart: number;
  purchase: number;
  wishlist: number;
  total: number;
};

type InteractionStats = {
  views: number;
  carts: number;
  purchases: number;
  wishlists: number;
  conversionRate: number;
  cartRate: number;
  days: number;
};

const INTERACTION_COLORS: Record<string, string> = {
  view: "text-blue-600 bg-blue-50",
  wishlist: "text-pink-600 bg-pink-50",
  cart: "text-purple-600 bg-purple-50",
  purchase: "text-green-600 bg-green-50",
  rating: "text-amber-600 bg-amber-50",
  trending: "text-orange-600 bg-orange-50",
};

const CHART_COLORS = [
  "#f59e0b",
  "#6366f1",
  "#10b981",
  "#f43f5e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#84cc16",
];

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  const bg = color.includes("blue")
    ? "bg-blue-50 border-blue-100"
    : color.includes("green")
      ? "bg-green-50 border-green-100"
      : color.includes("purple")
        ? "bg-purple-50 border-purple-100"
        : "bg-amber-50 border-amber-100";
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border p-4", bg)}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="mt-0.5 text-[10px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-gray-800">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

const BarTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { fullTerm?: string; fullName?: string };
    name: string;
    value: number;
    color: string;
  }>;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 font-bold text-gray-800">
        {d?.payload?.fullTerm ?? d?.payload?.fullName}
      </p>
      <p style={{ color: d?.color }}>
        {d?.name}: <span className="font-bold">{d?.value}</span>
      </p>
    </div>
  );
};

export default function SearchAnalyticsPage() {
  const [trendingPeriod, setTrendingPeriod] = useState("7d");
  const [timelineDays, setTimelineDays] = useState("30");

  const {
    data: trendingData,
    isLoading: trendLoading,
    refetch: refetchTrending,
  } = useQuery<{ products: TrendingProduct[] }>({
    queryKey: ["admin-trending-products", trendingPeriod],
    queryFn: () =>
      apiFetch(`/recommendations/trending?limit=20&days=${trendingPeriod.replace("d", "")}`),
    staleTime: 5 * 60_000,
  });

  const { data: trendingSearchData, isLoading: _searchLoading } = useQuery<{ searches: string[] }>({
    queryKey: ["admin-trending-searches"],
    queryFn: () => apiFetch("/products/trending-searches?limit=20"),
    staleTime: 5 * 60_000,
  });

  const [termsDays, setTermsDays] = useState("30");
  const { data: topTermsData, isLoading: topTermsLoading } = useQuery<{ terms: TopTerm[] }>({
    queryKey: ["admin-search-top-terms", termsDays],
    queryFn: () => adminFetch(`/search-analytics/top-terms?days=${termsDays}&limit=30`),
    staleTime: 2 * 60_000,
  });

  const [zeroDays, setZeroDays] = useState("30");
  const { data: zeroResultsData, isLoading: zeroResultsLoading } = useQuery<{
    queries: ZeroResultQuery[];
  }>({
    queryKey: ["admin-search-zero-results", zeroDays],
    queryFn: () => adminFetch(`/search-analytics/zero-results?days=${zeroDays}&limit=50`),
    staleTime: 2 * 60_000,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<StatsData>({
    queryKey: ["admin-platform-stats"],
    queryFn: () => apiFetch("/stats/public"),
    staleTime: 5 * 60_000,
  });

  const { data: timelineData, isLoading: timelineLoading } = useQuery<{
    timeline: InteractionTimelineEntry[];
  }>({
    queryKey: ["admin-interaction-timeline", timelineDays],
    queryFn: () => adminFetch(`/search-analytics/interaction-timeline?days=${timelineDays}`),
    staleTime: 5 * 60_000,
  });

  const { data: statsInteraction, isLoading: interactionStatsLoading } = useQuery<InteractionStats>(
    {
      queryKey: ["admin-interaction-stats", timelineDays],
      queryFn: () => adminFetch(`/search-analytics/interaction-stats?days=${timelineDays}`),
      staleTime: 5 * 60_000,
    }
  );

  const trending: TrendingProduct[] = trendingData?.products ?? [];
  const searchTerms: string[] = Array.isArray(trendingSearchData?.searches)
    ? trendingSearchData.searches
    : [];
  const topTerms: TopTerm[] = topTermsData?.terms ?? [];
  const zeroQueries: ZeroResultQuery[] = zeroResultsData?.queries ?? [];
  const timeline: InteractionTimelineEntry[] = timelineData?.timeline ?? [];

  // Use real top-terms if available, fall back to trending-searches for the chart
  const chartTerms =
    topTerms.length > 0
      ? topTerms.slice(0, 12)
      : searchTerms.slice(0, 12).map((t) => ({ query: t, occurrences: 1, zeroResults: 0 }));

  // Bar chart data for search terms — real occurrence counts
  const searchChartData = chartTerms.map((t) => ({
    term: t.query.length > 14 ? t.query.slice(0, 12) + "…" : t.query,
    fullTerm: t.query,
    occurrences: t.occurrences,
  }));

  // Product score chart data
  const productChartData = trending.slice(0, 10).map((p) => ({
    name: p.name.length > 14 ? p.name.slice(0, 12) + "…" : p.name,
    fullName: p.name,
    score: p.score !== undefined ? Math.round(p.score) : 0,
  }));

  const convRate = statsInteraction?.conversionRate ?? 0;
  const cartRate = statsInteraction?.cartRate ?? 0;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Search Analytics page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <PageHeader
          icon={BarChart2}
          title="Search & Engagement Analytics"
          subtitle="What customers are searching, viewing, and engaging with most"
          iconBgClass="bg-blue-100"
          iconColorClass="text-blue-600"
          actions={
            <div className="flex items-center gap-2">
              <Select value={timelineDays} onValueChange={setTimelineDays}>
                <SelectTrigger className="h-8 w-28 rounded-xl border-gray-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchTrending()}
                className="h-8 gap-1 rounded-xl"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Total Products"
            value={statsLoading ? "…" : (statsData?.productCount?.toLocaleString() ?? "—")}
            icon={Package}
            color="text-blue-600"
          />
          <StatCard
            label="Restaurants"
            value={statsLoading ? "…" : (statsData?.restaurantCount?.toLocaleString() ?? "—")}
            icon={TrendingUp}
            color="text-green-600"
          />
          <StatCard
            label="Trending Items"
            value={trending.length}
            icon={TrendingUp}
            color="text-purple-600"
          />
          <StatCard
            label="Search Terms"
            value={searchTerms.length}
            icon={Search}
            color="text-amber-600"
          />
        </div>

        {/* Conversion Rate & Engagement Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {interactionStatsLoading ? (
            Array(4)
              .fill(0)
              .map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                  <Eye className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {(statsInteraction?.views ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-500">Product Views</p>
                  <p className="text-[10px] text-gray-400">last {timelineDays}d</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-purple-100 bg-purple-50 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100">
                  <ShoppingCart className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{cartRate.toFixed(1)}%</p>
                  <p className="text-[11px] text-gray-500">Cart Rate</p>
                  <p className="text-[10px] text-gray-400">
                    {(statsInteraction?.carts ?? 0).toLocaleString()} cart adds
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-green-100 bg-green-50 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-100">
                  <Percent className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{convRate.toFixed(1)}%</p>
                  <p className="text-[11px] text-gray-500">Conversion Rate</p>
                  <p className="text-[10px] text-gray-400">
                    {(statsInteraction?.purchases ?? 0).toLocaleString()} purchases
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-pink-100 bg-pink-50 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-100">
                  <Heart className="h-4 w-4 text-pink-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {(statsInteraction?.wishlists ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-500">Wishlist Saves</p>
                  <p className="text-[10px] text-gray-400">last {timelineDays}d</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Engagement Over Time — Line Chart */}
        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-indigo-50 to-blue-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-semibold text-gray-800">
                Product Engagement Over Time
              </span>
            </div>
            <span className="text-xs text-gray-400">
              Last {timelineDays} days · views, cart adds & purchases
            </span>
          </div>
          <CardContent className="p-4">
            {timelineLoading ? (
              <div className="flex h-48 animate-pulse items-center justify-center text-sm text-gray-400">
                Loading…
              </div>
            ) : timeline.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                <BarChart2 className="h-8 w-8 opacity-20" />
                <p className="text-sm">No engagement data for this period yet</p>
                <p className="text-xs text-gray-300">
                  Data populates as customers interact with products
                </p>
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="viewGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(d) =>
                        new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      }
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="view"
                      name="Views"
                      stroke="#6366f1"
                      fill="url(#viewGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="cart"
                      name="Cart Adds"
                      stroke="#8b5cf6"
                      fill="url(#cartGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="purchase"
                      name="Purchases"
                      stroke="#10b981"
                      fill="url(#purchaseGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts row — Search Terms + Product Scores */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Search Terms Bar Chart */}
          <Card className="overflow-hidden rounded-2xl shadow-sm">
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-semibold text-gray-800">Top Search Terms</span>
              </div>
              <Select value={termsDays} onValueChange={setTermsDays}>
                <SelectTrigger className="h-7 w-20 rounded-lg border-gray-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardContent className="p-4">
              {topTermsLoading ? (
                <div className="flex h-52 animate-pulse items-center justify-center text-sm text-gray-400">
                  Loading…
                </div>
              ) : searchChartData.length === 0 ? (
                <div className="flex h-52 flex-col items-center justify-center gap-2 text-gray-400">
                  <Search className="h-8 w-8 opacity-20" />
                  <p className="text-sm">No search data yet</p>
                </div>
              ) : (
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={searchChartData}
                        layout="vertical"
                        margin={{ top: 0, right: 20, left: 4, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: "#9ca3af" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="term"
                          width={80}
                          tick={{ fontSize: 10, fill: "#374151" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<BarTooltip />} cursor={{ fill: "#fef9f0" }} />
                        <Bar
                          dataKey="occurrences"
                          name="Searches"
                          radius={[0, 6, 6, 0]}
                          barSize={14}
                        >
                          {searchChartData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-right text-[10px] text-gray-400">
                    Based on real search events (last {termsDays} days)
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Trending Product Scores */}
          <Card className="overflow-hidden rounded-2xl shadow-sm">
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-800">Trending Product Scores</span>
              </div>
              <Select value={trendingPeriod} onValueChange={setTrendingPeriod}>
                <SelectTrigger className="h-7 w-20 rounded-lg border-gray-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">Today</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardContent className="p-4">
              {trendLoading ? (
                <div className="flex h-52 animate-pulse items-center justify-center text-sm text-gray-400">
                  Loading…
                </div>
              ) : productChartData.length === 0 ? (
                <div className="flex h-52 flex-col items-center justify-center gap-2 text-gray-400">
                  <Package className="h-8 w-8 opacity-20" />
                  <p className="text-sm">No trending data yet</p>
                </div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={productChartData}
                      margin={{ top: 4, right: 4, left: 0, bottom: 28 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 9, fill: "#374151" }}
                        axisLine={false}
                        tickLine={false}
                        angle={-30}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip content={<BarTooltip />} cursor={{ fill: "#f5f3ff" }} />
                      <Bar dataKey="score" name="Trending Score" radius={[6, 6, 0, 0]} barSize={20}>
                        {productChartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Zero-Results Searches */}
        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-red-50 to-rose-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-semibold text-gray-800">Zero-Result Searches</span>
              <Badge variant="secondary" className="text-xs">
                {zeroQueries.length}
              </Badge>
            </div>
            <Select value={zeroDays} onValueChange={setZeroDays}>
              <SelectTrigger className="h-7 w-20 rounded-lg border-gray-200 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CardContent className="p-0">
            {zeroResultsLoading ? (
              <div className="flex h-32 animate-pulse items-center justify-center text-sm text-gray-400">
                Loading…
              </div>
            ) : zeroQueries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400">
                <AlertCircle className="h-8 w-8 opacity-20" />
                <p className="text-sm">No zero-result searches in the last {zeroDays} days</p>
                <p className="text-xs text-gray-400">
                  Great — your inventory is covering all searches!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
                        Query
                      </th>
                      <th className="w-24 px-4 py-2 text-right text-xs font-semibold tracking-wide text-gray-500 uppercase">
                        Searches
                      </th>
                      <th className="w-36 px-4 py-2 text-right text-xs font-semibold tracking-wide text-gray-500 uppercase">
                        Last Searched
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeroQueries.map((row, i) => (
                      <tr
                        key={row.query}
                        className={cn(
                          "border-b transition-colors last:border-0 hover:bg-red-50/40",
                          i % 2 === 0 ? "" : "bg-gray-50/50"
                        )}
                      >
                        <td className="flex items-center gap-2 px-4 py-2.5 font-medium text-gray-800">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                          {row.query}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Badge
                            variant="secondary"
                            className="border-red-100 bg-red-50 text-xs text-red-700"
                          >
                            {row.occurrences}×
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                          {new Date(row.lastSearchedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-right text-[10px] text-gray-400">
                  Queries that returned 0 products — add inventory to cover these gaps.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranked lists */}
        <div className="grid gap-5 md:grid-cols-2">
          {/* Top Search Terms List */}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-semibold text-gray-800">Top Search Terms</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {topTerms.length || searchTerms.length}
              </Badge>
            </div>
            <div className="p-3">
              {topTermsLoading ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                  Loading…
                </div>
              ) : topTerms.length === 0 && searchTerms.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-400">
                  <Search className="h-8 w-8 opacity-20" />
                  <p className="text-sm">No search data yet</p>
                </div>
              ) : topTerms.length > 0 ? (
                <div className="space-y-1.5">
                  {topTerms.slice(0, 15).map((term, i) => (
                    <div
                      key={term.query}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-gray-50"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          i === 0
                            ? "bg-amber-100 text-amber-700"
                            : i === 1
                              ? "bg-gray-100 text-gray-600"
                              : i === 2
                                ? "bg-orange-100 text-orange-700"
                                : "bg-gray-50 text-gray-400"
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate text-sm text-gray-700">{term.query}</span>
                      <span className="shrink-0 text-xs text-gray-400">{term.occurrences}×</span>
                      <TrendingUp
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          i < 3 ? "text-orange-500" : "text-gray-300"
                        )}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {searchTerms.slice(0, 15).map((term, i) => (
                    <div
                      key={term}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-gray-50"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          i === 0
                            ? "bg-amber-100 text-amber-700"
                            : i === 1
                              ? "bg-gray-100 text-gray-600"
                              : i === 2
                                ? "bg-orange-100 text-orange-700"
                                : "bg-gray-50 text-gray-400"
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate text-sm text-gray-700">{term}</span>
                      <TrendingUp
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          i < 3 ? "text-orange-500" : "text-gray-300"
                        )}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trending Products List */}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-800">Trending Products</span>
              </div>
              <Select value={trendingPeriod} onValueChange={setTrendingPeriod}>
                <SelectTrigger className="h-7 w-20 rounded-lg border-gray-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">Today</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-3">
              {trendLoading ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                  Loading…
                </div>
              ) : trending.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-400">
                  <Package className="h-8 w-8 opacity-20" />
                  <p className="text-sm">No trending data yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {trending.slice(0, 10).map((product, i) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          i === 0
                            ? "bg-purple-100 text-purple-700"
                            : i === 1
                              ? "bg-indigo-100 text-indigo-700"
                              : i === 2
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-50 text-gray-400"
                        )}
                      >
                        {i + 1}
                      </span>
                      {product.image ? (
                        <SafeImage
                          src={product.image}
                          alt={product.name}
                          className="h-8 w-8 shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                          <Package className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">{product.name}</p>
                        <p className="truncate text-xs text-gray-400">
                          {product.vendorName && `${product.vendorName} · `}Rs.{" "}
                          {product.price?.toLocaleString()}
                        </p>
                      </div>
                      {product.score !== undefined && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {Math.round(product.score)} pts
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Engagement Guide */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b bg-gradient-to-r from-teal-50 to-green-50 px-4 py-3">
            <Eye className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-semibold text-gray-800">Customer Engagement Guide</span>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 md:grid-cols-3">
            {[
              {
                type: "view",
                label: "Product Views",
                desc: "How many times products are opened and viewed by customers",
                icon: Eye,
              },
              {
                type: "wishlist",
                label: "Wishlist Adds",
                desc: "Products customers save to view later — shows purchase intent",
                icon: Heart,
              },
              {
                type: "cart",
                label: "Cart Adds",
                desc: "Products added to cart — high conversion intent",
                icon: ShoppingCart,
              },
              {
                type: "trending",
                label: "Trending Score",
                desc: "Combined score based on views, cart adds, and purchases",
                icon: TrendingUp,
              },
              {
                type: "rating",
                label: "Product Ratings",
                desc: "Customer satisfaction signals from product reviews",
                icon: Star,
              },
              {
                type: "purchase",
                label: "Conversions",
                desc: "Products that led to completed orders",
                icon: ShoppingCart,
              },
            ].map((item) => {
              const Icon = item.icon;
              const colorClass = INTERACTION_COLORS[item.type] || "text-gray-600 bg-gray-50";
              return (
                <div
                  key={item.type}
                  className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3"
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      colorClass
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
