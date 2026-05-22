import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StatCardSkeleton } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart2, Heart, LayoutDashboard, Search } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { useLocation, useSearch } from "wouter";

const OverviewAnalytics = lazy(() => import("@/pages/overview-analytics"));
const RevenueAnalytics = lazy(() => import("@/pages/revenue-analytics"));
const SearchAnalytics = lazy(() => import("@/pages/search-analytics"));
const WishlistInsights = lazy(() => import("@/pages/wishlist-insights"));

const VALID_TABS = ["overview", "revenue", "search", "users"] as const;
type AnalyticsTab = (typeof VALID_TABS)[number];

function isValidTab(t: string | null): t is AnalyticsTab {
  return VALID_TABS.includes(t as AnalyticsTab);
}

function SuspenseFallback() {
  return (
    <div className="space-y-6 p-4">
      <div className="bg-muted h-10 w-56 animate-pulse rounded-2xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="bg-muted h-64 animate-pulse rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-muted h-48 animate-pulse rounded-2xl" />
        <div className="bg-muted h-48 animate-pulse rounded-2xl" />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(rawSearch);
  const tabParam = params.get("tab");
  const activeTab: AnalyticsTab = isValidTab(tabParam) ? tabParam : "overview";

  const setTab = (tab: AnalyticsTab) => {
    navigate(`/analytics?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    if (!isValidTab(tabParam)) {
      navigate("/analytics?tab=overview", { replace: true });
    }
  }, [tabParam, navigate]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Analytics page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-0">
        <Tabs value={activeTab} onValueChange={(v) => setTab(v as AnalyticsTab)}>
          <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-border/50 sticky top-0 z-10 border-b px-4 pt-4 pb-0 backdrop-blur">
            <TabsList className="h-10 gap-1 border-0 bg-transparent p-0">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:border-primary flex h-10 items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <LayoutDashboard className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="revenue"
                className="data-[state=active]:border-primary flex h-10 items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <BarChart2 className="h-4 w-4" />
                Revenue
              </TabsTrigger>
              <TabsTrigger
                value="search"
                className="data-[state=active]:border-primary flex h-10 items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Search className="h-4 w-4" />
                Search
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="data-[state=active]:border-primary flex h-10 items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Heart className="h-4 w-4" />
                Users & Wishlist
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-0 p-4 md:p-6">
            <Suspense fallback={<SuspenseFallback />}>
              <OverviewAnalytics />
            </Suspense>
          </TabsContent>

          <TabsContent value="revenue" className="mt-0 p-4 md:p-6">
            <Suspense fallback={<SuspenseFallback />}>
              <RevenueAnalytics />
            </Suspense>
          </TabsContent>

          <TabsContent value="search" className="mt-0 p-4 md:p-6">
            <Suspense fallback={<SuspenseFallback />}>
              <SearchAnalytics />
            </Suspense>
          </TabsContent>

          <TabsContent value="users" className="mt-0 p-4 md:p-6">
            <Suspense fallback={<SuspenseFallback />}>
              <WishlistInsights />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
}
