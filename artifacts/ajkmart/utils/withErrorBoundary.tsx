import React from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    );
  }
  WithErrorBoundary.displayName = `WithErrorBoundary(${Component.displayName ?? Component.name ?? "Component"})`;
  return WithErrorBoundary;
}
