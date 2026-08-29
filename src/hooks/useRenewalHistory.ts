import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  archiveRenewalCycle,
  clearRenewalHistory,
  deleteRenewalAccount,
  loadRenewalHistory,
  recordCopiedRenewalEmail,
  subscribeRenewalHistory,
} from '@/services';
import type { RecordCopiedRenewalEmailInput } from '@/services';
import type { RenewalHistoryStore } from '@/types';

export const RENEWAL_HISTORY_QUERY_KEY = ['renewalHistory'] as const;
const EMPTY_HISTORY: RenewalHistoryStore = { schemaVersion: 1, accounts: [] };

function useCommittedHistoryMutation<TVariables, TResult extends { history: RenewalHistoryStore }>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => queryClient.setQueryData(RENEWAL_HISTORY_QUERY_KEY, result.history),
  });
}

export function useRenewalHistory() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: RENEWAL_HISTORY_QUERY_KEY,
    queryFn: loadRenewalHistory,
    staleTime: Infinity,
  });

  useEffect(
    () =>
      subscribeRenewalHistory(() => {
        void queryClient.invalidateQueries({ queryKey: RENEWAL_HISTORY_QUERY_KEY });
      }),
    [queryClient],
  );

  return {
    history: query.data ?? EMPTY_HISTORY,
    accounts: query.data?.accounts ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useRecordCopiedRenewalEmail() {
  return useCommittedHistoryMutation(recordCopiedRenewalEmail);
}

export function useArchiveRenewalCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, cycleId }: { accountId: string; cycleId: string }) =>
      archiveRenewalCycle(accountId, cycleId),
    onSuccess: (history) => queryClient.setQueryData(RENEWAL_HISTORY_QUERY_KEY, history),
  });
}

export function useDeleteRenewalAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRenewalAccount,
    onSuccess: (history) => queryClient.setQueryData(RENEWAL_HISTORY_QUERY_KEY, history),
  });
}

export function useClearRenewalHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearRenewalHistory,
    onSuccess: (history) => queryClient.setQueryData(RENEWAL_HISTORY_QUERY_KEY, history),
  });
}

export type { RecordCopiedRenewalEmailInput };
