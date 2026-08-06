import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clearBulkRuns, loadBulkRuns } from '@/services';
import type { BulkRunRecord } from '@/types';

/**
 * React Query bindings for the bulk-run history — METADATA ONLY (counts, status,
 * timing). No customer data is ever stored or read here.
 */

export const BULK_RUNS_QUERY_KEY = ['bulkRuns'] as const;

export function useBulkRuns() {
  const query = useQuery({
    queryKey: BULK_RUNS_QUERY_KEY,
    queryFn: loadBulkRuns,
    staleTime: Infinity,
  });
  return {
    records: (query.data ?? []) as BulkRunRecord[],
    isLoading: query.isLoading,
  };
}

/** Invalidates the cached history so a freshly recorded run appears at once. */
export function useRefreshBulkRuns() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BULK_RUNS_QUERY_KEY });
}

export function useClearBulkRuns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearBulkRuns,
    onSuccess: () => {
      queryClient.setQueryData(BULK_RUNS_QUERY_KEY, []);
    },
  });
}
