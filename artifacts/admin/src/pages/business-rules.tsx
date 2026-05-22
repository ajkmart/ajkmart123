import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings2, Shield } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { useLocation, useSearch } from "wouter";

const AccountConditions = lazy(() => import("@/pages/account-conditions"));
const ConditionRules = lazy(() => import("@/pages/condition-rules"));

const VALID_TABS = ["conditions", "rules"] as const;
type BusinessRulesTab = (typeof VALID_TABS)[number];

function isValidTab(t: string | null): t is BusinessRulesTab {
  return VALID_TABS.includes(t as BusinessRulesTab);
}

function SuspenseFallback() {
  return (
    <div className="text-muted-foreground flex animate-pulse items-center justify-center py-24 text-sm">
      Loading…
    </div>
  );
}

export default function BusinessRulesPage() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(rawSearch);
  const tabParam = params.get("tab");
  const activeTab: BusinessRulesTab = isValidTab(tabParam) ? tabParam : "conditions";

  const setTab = (tab: BusinessRulesTab) => {
    navigate(`/business-rules?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    if (!isValidTab(tabParam)) {
      navigate("/business-rules?tab=conditions", { replace: true });
    }
  }, [tabParam, navigate]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Business Rules page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-0">
        <Tabs value={activeTab} onValueChange={(v) => setTab(v as BusinessRulesTab)}>
          <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-border/50 sticky top-0 z-10 border-b px-4 pt-4 pb-0 backdrop-blur">
            <TabsList className="h-10 gap-1 border-0 bg-transparent p-0">
              <TabsTrigger
                value="conditions"
                className="data-[state=active]:border-primary flex h-10 items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Shield className="h-4 w-4" />
                Account Conditions
              </TabsTrigger>
              <TabsTrigger
                value="rules"
                className="data-[state=active]:border-primary flex h-10 items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Settings2 className="h-4 w-4" />
                Automation Rules
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="conditions" className="mt-0 p-4 md:p-6">
            <Suspense fallback={<SuspenseFallback />}>
              <AccountConditions />
            </Suspense>
          </TabsContent>

          <TabsContent value="rules" className="mt-0 p-4 md:p-6">
            <Suspense fallback={<SuspenseFallback />}>
              <ConditionRules />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
}
