import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/format";
import type { TranslationKey } from "@workspace/i18n";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShoppingBag,
  User,
} from "lucide-react";
import { SortHeader } from "./SortHeader";
import type { SortDir, SortKey } from "./constants";
import { allowedNext, PAGE_SIZES, STATUS_LABELS } from "./constants";

interface OrdersTableProps {
  isLoading: boolean;
  paginated: any[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onSelectOrder: (order: any) => void;
  onUpdateStatus: (id: string, status: string) => void;
  hasActiveFilters: boolean;
  clearAll: () => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  page: number;
  setPage: (v: number | ((p: number) => number)) => void;
  totalPages: number;
  safePage: number;
  sortedLength: number;
  toastFn: (opts: any) => void;
  T: (key: TranslationKey) => string;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: (checked: boolean) => void;
}

export function OrdersTable({
  isLoading,
  paginated,
  sortKey,
  sortDir,
  onSort,
  onSelectOrder,
  onUpdateStatus,
  hasActiveFilters,
  clearAll,
  pageSize,
  setPageSize,
  page: _page,
  setPage,
  totalPages,
  safePage,
  sortedLength,
  toastFn,
  T,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}: OrdersTableProps) {
  return (
    <Card className="border-border/50 hidden overflow-hidden rounded-2xl shadow-sm md:block">
      <div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded accent-blue-600"
                  checked={
                    paginated.length > 0 &&
                    !!selectedIds &&
                    paginated.every((o: any) => selectedIds.has(o.id))
                  }
                  onChange={(e) => onSelectAll?.(e.target.checked)}
                  aria-label="Select all orders"
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={T("orderId")}
                  sortKey="id"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={T("customer")}
                  sortKey="customer"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={T("type")}
                  sortKey="type"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={T("total")}
                  sortKey="total"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={T("status")}
                  sortKey="status"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-right">
                <SortHeader
                  label={T("date")}
                  sortKey="date"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4 rounded" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-36 rounded-xl" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-20" />
                  </TableCell>
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShoppingBag
                      className="text-muted-foreground/25 mb-3 h-10 w-10"
                      aria-hidden="true"
                    />
                    <p className="text-muted-foreground font-semibold">No orders found</p>
                    <p className="text-muted-foreground/60 mt-1 text-xs">
                      {hasActiveFilters
                        ? "Try adjusting your search or filters"
                        : "No orders have been placed yet"}
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearAll}
                        className="text-primary mt-2 text-xs hover:underline"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((order: any) => (
                <TableRow
                  key={order.id}
                  className={`hover:bg-muted/30 cursor-pointer ${selectedIds?.has(order.id) ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
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
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={selectedIds?.has(order.id) ?? false}
                      onChange={() => onToggleSelect?.(order.id)}
                      aria-label={`Select order ${order.id.slice(-8).toUpperCase()}`}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-mono text-sm font-medium">
                      {order.id.slice(-8).toUpperCase()}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {Array.isArray(order.items) ? `${order.items.length} items` : "N/A"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {order.userName ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          aria-hidden="true"
                        >
                          <User className="text-primary h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-foreground max-w-[140px] truncate text-sm font-semibold">
                            {order.userName}
                          </p>
                          <p className="text-muted-foreground text-xs">{order.userPhone}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Guest</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={order.type === "food" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {order.type === "food"
                        ? "\uD83C\uDF54 "
                        : order.type === "pharmacy"
                          ? "\uD83D\uDC8A "
                          : "\uD83D\uDED2 "}
                      {order.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground font-bold">
                    {formatCurrency(order.total)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={order.status}
                      onValueChange={(val) => {
                        if (!allowedNext(order).includes(val)) {
                          toastFn({
                            title: "Invalid transition",
                            description: `Can't move ${STATUS_LABELS[order.status]} to ${STATUS_LABELS[val]}`,
                            variant: "destructive",
                          });
                          return;
                        }
                        onUpdateStatus(order.id, val);
                      }}
                    >
                      <SelectTrigger
                        className={`h-8 w-36 border-2 text-[10px] font-bold tracking-wider uppercase sm:text-[11px] ${getStatusColor(order.status)}`}
                        aria-label={`Status: ${STATUS_LABELS[order.status]}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedNext(order).map((s) => (
                          <SelectItem key={s} value={s} className="text-xs font-bold uppercase">
                            {STATUS_LABELS[s] ?? s.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap sm:text-sm">
                    {formatDate(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {!isLoading && sortedLength > 0 && (
        <nav
          className="border-border/30 bg-muted/20 flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row"
          aria-label="Table pagination"
        >
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger
                className="border-border/50 h-8 w-16 rounded-lg text-xs"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="hidden sm:inline">|</span>
            <span>
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedLength)} of{" "}
              {sortedLength}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setPage(1)}
              disabled={safePage <= 1}
              aria-label="First page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setPage((p: number) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-muted-foreground px-2 text-xs">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setPage(totalPages)}
              disabled={safePage >= totalPages}
              aria-label="Last page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </nav>
      )}
    </Card>
  );
}
