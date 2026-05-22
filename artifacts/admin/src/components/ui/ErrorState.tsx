import { ErrorRetry, type ErrorRetryProps } from "@/components/ui/ErrorRetry";

/**
 * ErrorState — thin alias around `<ErrorRetry>` so consumers can pick
 * a name that reads better when paired with `<LoadingState>`. Both
 * components ship the same retry semantics; this is purely a naming
 * convenience.
 */
export type ErrorStateProps = ErrorRetryProps;

export function ErrorState(props: ErrorStateProps) {
  return <ErrorRetry {...props} />;
}
