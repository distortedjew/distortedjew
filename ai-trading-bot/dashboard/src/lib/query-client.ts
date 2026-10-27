import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

/** App-wide TanStack Query client: short staleness (the WebSocket keeps data fresh), smart retries. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && !error.isTransient) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      },
      mutations: { retry: false },
    },
  });
}
