import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/**
 * LoadingState — canonical loading indicator for any async section in
 * the admin panel. Consolidates the half-dozen ad-hoc spinners that
 * each page used to roll on its own.
 *
 * Use `variant="page"` for full-page (route-level) loaders,
 * `variant="card"` for card/panel loaders, and `variant="inline"` for
 * inline placeholders next to buttons or chips.
 */
export interface LoadingStateProps {
  label?: string;
  variant?: "page" | "card" | "inline";
  className?: string;
}

export function LoadingState({
  label = "Loading…",
  variant = "card",
  className,
}: LoadingStateProps) {
  const containerCls =
    variant === "page" ? "min-h-[60vh] p-8" : variant === "inline" ? "p-2" : "p-8";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="loading-state"
      className={cn(
        "text-muted-foreground flex flex-col items-center justify-center gap-2 text-center",
        containerCls,
        className
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin text-indigo-500" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
