import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RenewalExtractionService } from '@/hooks/useRenewal';
import { loadRenewalHistory, recordCopiedRenewalEmail } from '@/services';
import type { RenewalResearchService } from '@/services';
import type { ExtractedCustomer, RenewalDraft } from '@/types';
import { ok } from '@/utils';
import type { Result } from '@/utils';

import { RenewalProvider, useRenewal } from './useRenewal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DRAFT: RenewalDraft = {
  businessSummary: 'A current summary.',
  sources: [],
  emailSubject: 'Renewal options',
  emailBody: 'Hello from the renewal team.',
  smsBody: 'Let us discuss your renewal.',
};

const emptyExtraction: RenewalExtractionService = {
  extractActiveCustomer: vi.fn(async () =>
    ok({ displayName: '', extractedAt: '2026-01-01T00:00:00Z', fields: [] }),
  ),
};

function customer(fields: Array<[string, string]>): ExtractedCustomer {
  return {
    displayName: 'Customer',
    extractedAt: '2026-01-01T00:00:00Z',
    fields: fields.map(([label, value], index) => ({
      key: String(index),
      label,
      value,
      approved: true,
    })),
  };
}

function researchService(
  research: RenewalResearchService['research'] = vi.fn(async () => ok(DRAFT)),
): RenewalResearchService {
  return { isConfigured: () => true, research };
}

function createWrapper(
  extractionService: RenewalExtractionService = emptyExtraction,
  research: RenewalResearchService = researchService(),
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RenewalProvider extractionService={extractionService} researchService={research}>
          {children}
        </RenewalProvider>
      </QueryClientProvider>
    );
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useRenewal', () => {
  it('starts eligible, edits in memory, and reveals the optional lender on demand', () => {
    const { result } = renderHook(() => useRenewal(), { wrapper: createWrapper() });

    expect(result.current.eligibility).toBe('eligible');
    expect(result.current.showAdditionalLender).toBe(false);
    act(() => {
      result.current.edit('merchantName', 'Manual Merchant');
      result.current.setEligibility('not_eligible');
      result.current.showAdditionalLenderField();
    });

    expect(result.current.input.merchantName).toBe('Manual Merchant');
    expect(result.current.eligibility).toBe('not_eligible');
    expect(result.current.showAdditionalLender).toBe(true);
  });

  it('maps Salesforce fields, retains manual fallback, and detects a same-day lender', async () => {
    const extraction: RenewalExtractionService = {
      extractActiveCustomer: vi.fn(async () =>
        ok(
          customer([
            ['Business Name', 'Extracted Business'],
            ['Most Recent Funding Date', '2026-08-01'],
            ['Most Recent Lender 2', 'Second Capital'],
            ['Most Recent Funding Date 2', '08/01/2026'],
          ]),
        ),
      ),
    };
    const { result } = renderHook(() => useRenewal(), { wrapper: createWrapper(extraction) });
    act(() => result.current.edit('merchantName', 'Manual Merchant'));

    await act(() => result.current.readSalesforce());

    expect(result.current.input).toMatchObject({
      merchantName: 'Manual Merchant',
      businessName: 'Extracted Business',
      additionalSameDayLender: 'Second Capital',
    });
    expect(result.current.showAdditionalLender).toBe(true);
    expect(result.current.extractionStatus).toBe('success');
  });

  it('validates identifying input before research', async () => {
    const research = vi.fn<RenewalResearchService['research']>();
    const { result } = renderHook(() => useRenewal(), {
      wrapper: createWrapper(emptyExtraction, researchService(research)),
    });

    await act(() => result.current.research());

    expect(research).not.toHaveBeenCalled();
    expect(result.current.researchError).toMatch(/at least one merchant/i);
  });

  it('allows address-only research and passes the address to the research service', async () => {
    const research = vi.fn<RenewalResearchService['research']>(async () => ok(DRAFT));
    const { result } = renderHook(() => useRenewal(), {
      wrapper: createWrapper(emptyExtraction, researchService(research)),
    });

    act(() => result.current.edit('businessAddress', '42 Market Street, Denver, CO 80202'));
    await act(() => result.current.research());

    expect(research).toHaveBeenCalledTimes(1);
    expect(research.mock.calls[0][0].input).toMatchObject({
      businessAddress: '42 Market Street, Denver, CO 80202',
      businessName: '',
      website: '',
    });
    expect(result.current.researchPhase).toBe('complete');
    expect(result.current.draft).toEqual(DRAFT);
  });

  it('aborts and ignores stale extraction and research completions', async () => {
    const firstExtraction = deferred<Result<ExtractedCustomer>>();
    const secondExtraction = deferred<Result<ExtractedCustomer>>();
    const extractionSignals: AbortSignal[] = [];
    const extraction: RenewalExtractionService = {
      extractActiveCustomer: vi
        .fn()
        .mockImplementationOnce((signal: AbortSignal) => {
          extractionSignals.push(signal);
          return firstExtraction.promise;
        })
        .mockImplementationOnce((signal: AbortSignal) => {
          extractionSignals.push(signal);
          return secondExtraction.promise;
        }),
    };
    const firstResearch = deferred<Result<RenewalDraft>>();
    const secondResearch = deferred<Result<RenewalDraft>>();
    const researchSignals: AbortSignal[] = [];
    const research = vi
      .fn<RenewalResearchService['research']>()
      .mockImplementationOnce((_request, signal) => {
        if (signal) researchSignals.push(signal);
        return firstResearch.promise;
      })
      .mockImplementationOnce((_request, signal) => {
        if (signal) researchSignals.push(signal);
        return secondResearch.promise;
      });
    const { result } = renderHook(() => useRenewal(), {
      wrapper: createWrapper(extraction, researchService(research)),
    });

    act(() => {
      void result.current.readSalesforce();
      void result.current.readSalesforce();
    });
    expect(extractionSignals[0].aborted).toBe(true);
    await act(async () => secondExtraction.resolve(ok(customer([['Merchant Name', 'Newest']]))));
    await act(async () => firstExtraction.resolve(ok(customer([['Merchant Name', 'Stale']]))));
    expect(result.current.input.merchantName).toBe('Newest');

    act(() => {
      void result.current.research();
      void result.current.research();
    });
    expect(researchSignals[0].aborted).toBe(true);
    await act(async () => secondResearch.resolve(ok({ ...DRAFT, emailSubject: 'Newest draft' })));
    await act(async () => firstResearch.resolve(ok({ ...DRAFT, emailSubject: 'Stale draft' })));
    expect(result.current.draft?.emailSubject).toBe('Newest draft');
  });

  it('cancel and clear abort work and do not save a Renewal history record', async () => {
    const pending = deferred<Result<RenewalDraft>>();
    let signal: AbortSignal | undefined;
    const research = vi.fn<RenewalResearchService['research']>((_request, nextSignal) => {
      signal = nextSignal;
      return pending.promise;
    });
    const storageSet = vi.spyOn(chrome.storage.local, 'set');
    const { result } = renderHook(() => useRenewal(), {
      wrapper: createWrapper(emptyExtraction, researchService(research)),
    });
    act(() => result.current.edit('businessName', 'In-memory only'));
    act(() => void result.current.research());
    await waitFor(() => expect(result.current.researchPhase).toBe('researching'));

    act(() => result.current.cancel());
    expect(signal?.aborted).toBe(true);
    expect(result.current.researchPhase).toBe('cancelled');

    act(() => result.current.clear());
    await act(async () => pending.resolve(ok(DRAFT)));
    expect(result.current.input.businessName).toBe('');
    expect(result.current.draft).toBeNull();
    expect(result.current.researchPhase).toBe('idle');
    expect(storageSet).not.toHaveBeenCalled();
  });

  it('writes to the clipboard before idempotently saving a generated draft', async () => {
    let copyCount = 0;
    const writeText = vi.fn(async () => {
      copyCount += 1;
      if (copyCount === 1) expect((await loadRenewalHistory()).accounts).toEqual([]);
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { result } = renderHook(() => useRenewal(), { wrapper: createWrapper() });
    act(() => result.current.edit('merchantName', 'Acme'));
    await act(() => result.current.research());
    await act(() => result.current.copyEmail());
    await act(() => result.current.copyEmail());

    const history = await loadRenewalHistory();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(history.accounts).toHaveLength(1);
    expect(history.accounts[0].cycles[0].sentEmails).toHaveLength(1);
    expect(result.current.historyStatus.message).toMatch(/already saved/i);
  });

  it('does not mutate history when clipboard copying fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    const { result } = renderHook(() => useRenewal(), { wrapper: createWrapper() });
    act(() => result.current.edit('businessName', 'Acme'));
    await act(() => result.current.research());
    await act(() => result.current.copyEmail());
    expect((await loadRenewalHistory()).accounts).toEqual([]);
    expect(result.current.historyStatus.message).toMatch(/could not copy email/i);
  });

  it('discloses when clipboard copy succeeds but local storage fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(new Error('quota exceeded'));
    const { result } = renderHook(() => useRenewal(), { wrapper: createWrapper() });
    act(() => result.current.edit('businessName', 'Acme'));
    await act(() => result.current.research());
    await act(() => result.current.copyEmail());
    expect(result.current.historyStatus).toEqual({
      kind: 'error',
      message: 'Email copied, but local history was not saved.',
    });
  });

  it('selects saved identity while clearing volatile fields and restoring the cycle type', async () => {
    const saved = await recordCopiedRenewalEmail({
      identity: {
        merchantName: 'Saved Merchant',
        businessName: 'Saved Business',
        accountName: 'Saved Account',
        dba: 'Saved DBA',
        website: 'https://saved.example',
      },
      outreachType: 'add_on',
      draftId: 'saved-draft',
      subject: 'Saved',
      body: 'Saved body',
    });
    const { result } = renderHook(() => useRenewal(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.accountSearchResults).toHaveLength(1));
    act(() => {
      result.current.edit('currentBalance', '$50,000');
      result.current.edit('percentagePaid', '80%');
      result.current.edit('latestLender', 'Private lender');
      result.current.selectAccount(saved.accountId);
    });
    expect(result.current.input).toMatchObject({
      merchantName: 'Saved Merchant',
      accountName: 'Saved Account',
      currentBalance: '',
      percentagePaid: '',
      latestLender: '',
    });
    expect(result.current.outreachType).toBe('add_on');
    expect(result.current.outreachTypeLocked).toBe(true);
  });

  it('sends only active-cycle history oldest-to-newest and archives without a replacement cycle', async () => {
    const first = await recordCopiedRenewalEmail({
      ...copyInputForProvider('later', '2026-08-02T00:00:00Z'),
      outreachType: 'add_on',
    });
    await recordCopiedRenewalEmail({
      ...copyInputForProvider('earlier', '2026-08-01T00:00:00Z'),
      selectedAccountId: first.accountId,
      outreachType: 'add_on',
    });
    const research = vi.fn<RenewalResearchService['research']>(async () => ok(DRAFT));
    const { result } = renderHook(() => useRenewal(), {
      wrapper: createWrapper(emptyExtraction, researchService(research)),
    });
    await waitFor(() => expect(result.current.accountSearchResults).toHaveLength(1));
    act(() => result.current.selectAccount(first.accountId));
    await act(() => result.current.research());
    expect(research.mock.calls[0][0].sentEmailHistory.map((email) => email.subject)).toEqual([
      'Subject earlier',
      'Subject later',
    ]);
    await act(() => result.current.renewed());
    const account = (await loadRenewalHistory()).accounts[0];
    expect(account.activeCycleId).toBeUndefined();
    expect(account.cycles).toHaveLength(1);
    expect(result.current.input.merchantName).toBe('History Merchant');
    expect(result.current.draft).toBeNull();
    expect(result.current.outreachType).toBe('renewal');
  });
});

function copyInputForProvider(draftId: string, copiedAt: string) {
  return {
    identity: { merchantName: 'History Merchant' },
    draftId,
    subject: `Subject ${draftId}`,
    body: `Body ${draftId}`,
    copiedAt,
  };
}
