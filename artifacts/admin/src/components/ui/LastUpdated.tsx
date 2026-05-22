import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

function timeAgo(ts: number): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface LastUpdatedProps {
  dataUpdatedAt: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function LastUpdated({
  dataUpdatedAt,
  onRefresh,
  isRefreshing,
  className,
}: LastUpdatedProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!dataUpdatedAt) return null;

  return (
    <div className={cn("text-muted-foreground flex items-center gap-1.5 text-xs", className)}>
      <span>Updated {timeAgo(dataUpdatedAt)}</span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh data"
          className="hover:text-foreground rounded p-0.5 transition-colors disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
        </button>
      )}
    </div>
  );
}
