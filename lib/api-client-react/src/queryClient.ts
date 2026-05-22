import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient instance for use across web apps.
 * Configure per-app by calling queryClient.setDefaultOptions() after import.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
