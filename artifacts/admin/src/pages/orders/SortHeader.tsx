import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDir, SortKey } from "./constants";

export function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="hover:text-foreground group flex w-full items-center gap-1 text-left font-semibold transition-colors"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <span className="shrink-0">
        {isActive ? (
          currentDir === "asc" ? (
            <ArrowUp className="text-primary h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="text-primary h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="text-muted-foreground/40 group-hover:text-muted-foreground h-3 w-3 transition-colors" />
        )}
      </span>
    </button>
  );
}
