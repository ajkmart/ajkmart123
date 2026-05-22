import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/errorParser";

interface UseErrorHandlerOptions {
  onError?: (err: unknown) => void;
  title?: string;
}

/**
 * Returns a stable `onError` callback suitable for `useMutation` options.
 * Calls `parseApiError` on the thrown value and fires a destructive toast.
 * Pass `onError` to run additional side-effects after the toast.
 */
export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { toast } = useToast();
  const { onError, title = "Something went wrong" } = options;

  function handleError(err: unknown) {
    const description = parseApiError(err);
    toast({ title, description, variant: "destructive" });
    onError?.(err);
  }

  return { onError: handleError };
}
