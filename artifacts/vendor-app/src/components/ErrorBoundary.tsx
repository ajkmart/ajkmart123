import { createLogger } from "@/lib/logger";
import { Component, type ReactNode } from "react";
import { reportError } from "../lib/error-reporter";
const log = createLogger("[ErrorBoundary]");

type FallbackFn = (reset: () => void, error: Error | null) => ReactNode;

interface Props {
  children: ReactNode;
  fallback?: ReactNode | FallbackFn;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    log.error("caught:", error, info);
    reportError({
      errorType: "frontend_crash",
      errorMessage: error.message || "Component crash",
      stackTrace: error.stack || info.componentStack,
      componentName: info.componentStack?.split("\n")[1]?.trim() || undefined,
    });
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === "function") {
        return (fallback as FallbackFn)(this.reset, this.state.error);
      }
      if (fallback != null) return fallback;
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-[60vh] flex-col items-center justify-center bg-white p-6 text-center"
        >
          <div className="w-full max-w-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
              <span className="text-3xl" aria-hidden="true">
                ⚠️
              </span>
            </div>
            <h1 className="mb-2 text-lg font-bold text-gray-900">
              Kuch galat ho gaya / Something went wrong
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-gray-500">
              {this.state.error?.message || "An unexpected error occurred. Please try again."}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={this.reset}
                className="w-full rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 active:scale-[0.98]"
              >
                Dobara koshish karein / Retry
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-xl bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 active:scale-[0.98]"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
