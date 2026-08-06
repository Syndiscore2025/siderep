import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clearSentEmails, loadSentEmails } from '@/services';
import type { SentEmailRecord } from '@/types';

/**
 * React Query bindings for the sent-email history — SideRep's OWN artifact of
 * emails it sent. This is config-adjacent persistence (never customer data);
 * fresh customer info is always re-crawled from the page when needed.
 */

export const SENT_HISTORY_QUERY_KEY = ['sentHistory'] as const;

export function useSentHistory() {
  const query = useQuery({
    queryKey: SENT_HISTORY_QUERY_KEY,
    queryFn: loadSentEmails,
    staleTime: Infinity,
  });
  return {
    records: (query.data ?? []) as SentEmailRecord[],
    isLoading: query.isLoading,
  };
}

/** Invalidates the cached history so a freshly recorded send appears at once. */
export function useRefreshSentHistory() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SENT_HISTORY_QUERY_KEY });
}

export function useClearSentHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearSentEmails,
    onSuccess: () => {
      queryClient.setQueryData(SENT_HISTORY_QUERY_KEY, []);
    },
  });
}
