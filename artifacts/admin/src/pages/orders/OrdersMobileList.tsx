import { StatusBadge } from "@/components/AdminShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";

interface OrdersMobileListProps {
  isLoading: boolean;
  paginated: any[];
  onSelectOrder: (order: any) => void;
  hasActiveFilters: boolean;
  clearAll: () => void;
  pageSize: number;
  page: number;
  setPage: (v: number | ((p: number) => number)) => void;
  totalPages: number;
  safePage: number;
  sortedLength: number;
}

export function OrdersMobileList({
  isLoading,
  paginated,
  onSelectOrder,
  hasActiveFilters,
  clearAll,
  pageSize,
  page: _page,
  setPage,
  totalPages,
  safePage,
  sortedLength,
}: OrdersMobileListProps) {
  return (
    <section className="space-y-3 md:hidden" aria-label="Orders list (mobile)">
      {isLoading ? (
        [1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-24 animate-pulse rounded-2xl" aria-hidden="true" />
        ))
      ) : paginated.length === 0 ? (
        <Card className="border-border/50 rounded-2xl p-12 text-center">
          <ShoppingBag
            className="text-muted-foreground/25 mx-auto mb-3 h-10 w-10"
            aria-hidden="true"
          />
          <p className="text-muted-foreground text-sm font-semibold">No orders found</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            {hasActiveFilters ? "Try adjusting your filters" : "No orders have been placed yet"}
          </p>
          {hasActiveFilters && (
            <button onClick={clearAll} className="text-primary mt-2 text-xs hover:underline">
              Clear all filters
            </button>
          )}
        </Card>
      ) : (
        paginated.map((order: any) => (
          <Card
            key={order.id}
            className="border-border/50 cursor-pointer rounded-2xl p-4 shadow-sm transition-shadow hover:shadow-md active:scale-[0.99]"
            onClick={() => onSelectOrder(order)}
            tabIndex={0}
            role="button"
            aria-label={`Order ${order.id.slice(-8).toUpperCase()}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectOrder(order);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-foreground font-mono text-sm font-bold">
                    #{order.id.slice(-8).toUpperCase()}
                  </p>
                  <Badge
                    variant={order.type === "food" ? "default" : "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {order.type === "food"
                      ? "\uD83C\uDF54"
                      : order.type === "pharmacy"
                        ? "\uD83D\uDC8A"
                        : "\uD83D\uDED2"}{" "}
                    {order.type}
                  </Badge>
                  <StatusBadge status={order.status} />
                  {order.gpsMismatch && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      GPS Mismatch
                    </span>
                  )}
                </div>
                {order.userName && (
                  <p className="text-muted-foreground mt-1 truncate text-sm">
                    {order.userName}
                    {order.userPhone ? ` \u00B7 ${order.userPhone}` : ""}
                  </p>
                )}
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-foreground font-bold">{formatCurrency(order.total)}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {Array.isArray(order.items) ? `${order.items.length} items` : ""}
                </p>
              </div>
            </div>
          </Card>
        ))
      )}
      {!isLoading && sortedLength > pageSize && (
        <nav
          className="flex items-center justify-between gap-2 pt-2"
          aria-label="Mobile pagination"
        >
          <span className="text-muted-foreground text-xs">
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedLength)} of{" "}
            {sortedLength}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl px-3"
              onClick={() => setPage((p: number) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground px-2 text-xs">
              {safePage}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl px-3"
              onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </nav>
      )}
    </section>
  );
}
