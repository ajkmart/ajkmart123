import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * ErrorRetry — canonical inline error fallback used by every admin page
 * and ErrorBoundary. Renders a short title, the underlying error message,
 * and a Retry button. Use this instead of bespoke error UIs so retry
 * affordances and copy stay consistent.
 *
 * `onRetry` may be omitted — when missing the component falls back to
 * `window.location.reload()` so even legacy callers without explicit
 * retry handlers expose a recovery path.
 */
export interface ErrorRetryProps {
  title?: string;
  description?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: "page" | "inline" | "card";
  className?: string;
  /** Optional secondary action node (e.g. "Go home" link). */
  secondary?: React.ReactNode;
}

export function ErrorRetry({
  title = "Something went wrong",
  description,
  error,
  onRetry,
  retryLabel = "Try again",
  variant = "card",
  className,
  secondary,
}: ErrorRetryProps) {
  const message =
    description ??
    (error instanceof Error ? error.message : typeof error === "string" ? error : undefined) ??
    "An unexpected error occurred while loading this section.";

  const handleRetry = () => {
    if (onRetry) onRetry();
    else if (typeof window !== "undefined") window.location.reload();
  };

  const containerCls =
    variant === "page"
      ? "min-h-[60vh] p-8"
      : variant === "inline"
        ? "p-4"
        : "p-8 rounded-xl border border-red-100 bg-red-50";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        containerCls,
        className
      )}
      data-testid="error-retry"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600"
        aria-hidden="true"
      >
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-red-900">{title}</h2>
      <p className="max-w-md text-sm text-red-700">{message}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          onClick={handleRetry}
          variant="default"
          aria-label={retryLabel}
          data-testid="error-retry-button"
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {retryLabel}
        </Button>
        {secondary}
      </div>
    </div>
  );
}
