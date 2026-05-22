import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { TranslationKey } from "@workspace/i18n";
import { TrendingUp } from "lucide-react";

interface OrdersStatsCardsProps {
  totalCount: number;
  pendingCount: number;
  activeCount: number;
  deliveredCount: number;
  totalRevenue: number;
  T: (key: TranslationKey) => string;
}

export function OrdersStatsCards({
  totalCount,
  pendingCount,
  activeCount,
  deliveredCount,
  totalRevenue,
  T,
}: OrdersStatsCardsProps) {
  return (
    <section aria-label="Order statistics">
      <h2 className="sr-only">Order Statistics</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="border-border/50 rounded-2xl p-4 text-center shadow-sm">
          <p className="text-foreground text-3xl font-bold">{totalCount}</p>
          <p className="text-muted-foreground mt-1 text-xs">{T("totalOrders")}</p>
        </Card>
        <Card className="border-border/50 rounded-2xl border-amber-200/60 bg-amber-50/60 p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-amber-700">{pendingCount}</p>
          <p className="mt-1 text-xs text-amber-600">{T("pending")}</p>
        </Card>
        <Card className="border-border/50 rounded-2xl border-blue-200/60 bg-blue-50/60 p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-blue-700">{activeCount}</p>
          <p className="mt-1 text-xs text-blue-500">{T("activeNow")}</p>
        </Card>
        <Card className="border-border/50 rounded-2xl border-green-200/60 bg-green-50/60 p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-green-700">{deliveredCount}</p>
          <p className="mt-1 text-xs text-green-500">{T("delivered")}</p>
        </Card>
        <Card className="border-border/50 col-span-2 rounded-2xl border-purple-200/60 bg-purple-50/60 p-4 text-center shadow-sm sm:col-span-1">
          <div className="mb-1 flex items-center justify-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-purple-600" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold text-purple-700">{formatCurrency(totalRevenue)}</p>
          <p className="mt-1 text-xs text-purple-500">{T("totalRevenue")}</p>
        </Card>
      </div>
    </section>
  );
}
