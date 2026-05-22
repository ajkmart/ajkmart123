import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared filter bar used across list/table pages.
 *
 * Renders a search input on the left plus arbitrary filter controls
 * (selects, toggles, date pickers) on the right. Stacks on mobile.
 *
 * Usage:
 *   <FilterBar
 *     search={q}
 *     onSearch={setQ}
 *     placeholder="Search users…"
 *     filters={<>
 *       <Select …>…</Select>
 *     </>}
 *   />
 */

export interface FilterBarProps {
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  filters?: ReactNode;
  className?: string;
}

export function FilterBar({
  search = "",
  onSearch,
  placeholder = "Search…",
  filters,
  className = "",
}: FilterBarProps) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row ${className}`}>
      {onSearch !== undefined && (
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="h-10 rounded-xl bg-white pl-9"
            aria-label={placeholder}
          />
        </div>
      )}
      {filters && <div className="flex shrink-0 flex-wrap items-center gap-2">{filters}</div>}
    </div>
  );
}
