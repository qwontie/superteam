import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 300_000,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 20_000,
    },
  },
});
