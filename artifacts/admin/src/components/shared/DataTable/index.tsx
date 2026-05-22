import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { ReactNode } from "react";

export interface DataTableColumn<T> {
  header: string;
  accessor: (row: T) => ReactNode;
  sortKey?: string;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  emptyMessage?: string;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const SKELETON_ROWS = 5;

function SortIcon({
  colKey,
  sortKey,
  sortDir,
}: {
  colKey: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}) {
  if (colKey !== sortKey)
    return <ChevronsUpDown className="text-muted-foreground/50 ml-1 inline h-3.5 w-3.5" />;
  return sortDir === "asc" ? (
    <ChevronUp className="ml-1 inline h-3.5 w-3.5" />
  ) : (
    <ChevronDown className="ml-1 inline h-3.5 w-3.5" />
  );
}

/**
 * Generic data table with built-in pagination, column sorting, loading
 * skeletons, and an empty state. Pages own their own filter state —
 * this component only renders what it receives.
 *
 * Usage:
 *   <DataTable
 *     columns={[
 *       { header: "Name", accessor: row => row.name, sortKey: "name" },
 *       { header: "Status", accessor: row => <StatusBadge status={row.status} /> },
 *     ]}
 *     data={users}
 *     isLoading={isLoading}
 *     page={page}
 *     pageSize={pageSize}
 *     total={total}
 *     onPageChange={setPage}
 *     onPageSizeChange={setPageSize}
 *     sortKey={sortKey}
 *     sortDir={sortDir}
 *     onSort={handleSort}
 *   />
 */
export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  page = 1,
  pageSize = 25,
  total = 0,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDir,
  onSort,
  emptyMessage = "No records found.",
  className,
}: DataTableProps<T>) {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
  const showPagination = !isLoading && (total > 0 || data.length > 0);

  function buildPageNumbers(current: number, total: number): (number | "ellipsis")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | "ellipsis")[] = [1];
    if (current > 3) pages.push("ellipsis");
    for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
      pages.push(p);
    }
    if (current < total - 2) pages.push("ellipsis");
    pages.push(total);
    return pages;
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="border-border overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {columns.map((col, i) => (
                <TableHead
                  key={i}
                  className={`text-xs font-semibold tracking-wide uppercase ${col.className ?? ""} ${col.sortKey && onSort ? "hover:text-foreground cursor-pointer select-none" : ""}`}
                  onClick={col.sortKey && onSort ? () => onSort(col.sortKey!) : undefined}
                >
                  {col.header}
                  {col.sortKey && onSort && (
                    <SortIcon colKey={col.sortKey} sortKey={sortKey} sortDir={sortDir} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, rowIdx) => (
                <TableRow key={rowIdx}>
                  {columns.map((_, colIdx) => (
                    <TableCell key={colIdx}>
                      <Skeleton className="h-4 w-full rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground h-32 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIdx) => (
                <TableRow key={rowIdx} className="hover:bg-muted/30 transition-colors">
                  {columns.map((col, colIdx) => (
                    <TableCell key={colIdx} className={col.className}>
                      {col.accessor(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && (
        <div className="flex flex-col items-center justify-between gap-3 px-1 sm:flex-row">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span>Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange?.(Number(v))}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="hidden sm:inline">
              {total > 0
                ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
                : `${data.length} row${data.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (page > 1) onPageChange?.(page - 1);
                    }}
                    aria-disabled={page <= 1}
                    className={page <= 1 ? "pointer-events-none opacity-40" : ""}
                  />
                </PaginationItem>
                {buildPageNumbers(page, totalPages).map((p, idx) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`e${idx}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => {
                          e.preventDefault();
                          onPageChange?.(p);
                        }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (page < totalPages) onPageChange?.(page + 1);
                    }}
                    aria-disabled={page >= totalPages}
                    className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
    </div>
  );
}
