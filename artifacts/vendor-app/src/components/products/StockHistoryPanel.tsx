import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { fd } from "../../lib/ui";

interface StockHistoryRow {
  id: string;
  delta: number;
  reason: string | null;
  stockAfter: number | null;
  orderId: string | null;
  createdAt: string;
}

interface StockHistoryPanelProps {
  productId: string;
}

export function StockHistoryPanel({ productId }: StockHistoryPanelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["vendor-stock-history", productId],
    queryFn: () => api.getProductStockHistory(productId),
    staleTime: 30_000,
  });

  const rows: StockHistoryRow[] = Array.isArray(data?.history) ? data.history : [];

  return (
    <div className="border-t border-purple-100 bg-purple-50/40 px-4 py-3">
      <p className="mb-2 text-[11px] font-bold tracking-wide text-purple-700 uppercase">
        Stock History
      </p>

      {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
      {isError && <p className="text-xs text-red-500">Failed to load history.</p>}
      {!isLoading && !isError && rows.length === 0 && (
        <p className="text-xs text-gray-400">No stock changes recorded yet.</p>
      )}

      {rows.length > 0 && (
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-8 rounded px-1 text-center font-extrabold tabular-nums ${
                    r.delta < 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"
                  }`}
                >
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
                <span className="text-gray-600 capitalize">{r.reason ?? "update"}</span>
                {r.stockAfter != null && (
                  <span className="text-gray-400">→ {r.stockAfter} left</span>
                )}
              </div>
              <span className="flex-shrink-0 text-gray-400">{fd(r.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
