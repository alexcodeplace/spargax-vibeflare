import { QueryClient } from '@tanstack/react-query';

/**
 * Creates a fresh QueryClient with standard VibeFlare defaults.
 * Always call this on the server (per-request) and for the initial browser instance.
 */
export function createBrowserQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}

let _client: QueryClient | undefined;

/**
 * Returns the singleton QueryClient for browser use.
 * Never call from server context — use createBrowserQueryClient() per request instead.
 */
export function getBrowserQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserQueryClient: server context — use createBrowserQueryClient');
  }
  return (_client ??= createBrowserQueryClient());
}
