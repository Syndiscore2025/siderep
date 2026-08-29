import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { RENEWAL_HISTORY_STORAGE_KEY } from '@/services';

import {
  RENEWAL_HISTORY_QUERY_KEY,
  useArchiveRenewalCycle,
  useClearRenewalHistory,
  useDeleteRenewalAccount,
  useRecordCopiedRenewalEmail,
  useRenewalHistory,
} from './useRenewalHistory';

afterEach(cleanup);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const record = {
  identity: { merchantName: 'Acme' },
  outreachType: 'renewal' as const,
  draftId: 'draft-1',
  subject: 'Hello',
  body: 'Body',
  copiedAt: '2026-08-29T12:00:00.000Z',
};

describe('useRenewalHistory', () => {
  it('loads the empty snapshot and caches committed mutation snapshots', async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(
      () => ({ history: useRenewalHistory(), record: useRecordCopiedRenewalEmail() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.history.isLoading).toBe(false));
    expect(result.current.history.accounts).toEqual([]);
    await act(() => result.current.record.mutateAsync(record));
    expect(client.getQueryData(RENEWAL_HISTORY_QUERY_KEY)).toMatchObject({
      accounts: [{ identity: { merchantName: 'Acme' } }],
    });
  });

  it('updates the cache for archive, delete, and clear mutations', async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(
      () => ({
        history: useRenewalHistory(),
        record: useRecordCopiedRenewalEmail(),
        archive: useArchiveRenewalCycle(),
        remove: useDeleteRenewalAccount(),
        clear: useClearRenewalHistory(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.history.isLoading).toBe(false));
    const saved = await act(() => result.current.record.mutateAsync(record));
    await act(() =>
      result.current.archive.mutateAsync({ accountId: saved.accountId, cycleId: saved.cycleId }),
    );
    expect(
      (
        client.getQueryData(RENEWAL_HISTORY_QUERY_KEY) as {
          accounts: Array<{ activeCycleId?: string }>;
        }
      ).accounts[0].activeCycleId,
    ).toBeUndefined();
    await act(() => result.current.remove.mutateAsync(saved.accountId));
    await waitFor(() => expect(result.current.history.accounts).toEqual([]));
    await act(() => result.current.clear.mutateAsync());
    expect(client.getQueryData(RENEWAL_HISTORY_QUERY_KEY)).toEqual({
      schemaVersion: 1,
      accounts: [],
    });
  });

  it('invalidates and reloads when another storage writer changes the Renewal key', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(useRenewalHistory, { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await chrome.storage.local.set({
      [RENEWAL_HISTORY_STORAGE_KEY]: {
        schemaVersion: 1,
        accounts: [
          {
            id: 'account-external',
            identity: {
              merchantName: 'External',
              businessName: '',
              accountName: '',
              dba: '',
              website: '',
            },
            cycles: [],
            createdAt: '2026-08-29T12:00:00.000Z',
            updatedAt: '2026-08-29T12:00:00.000Z',
          },
        ],
      },
    });
    await waitFor(() => expect(result.current.accounts[0]?.identity.merchantName).toBe('External'));
  });
});
