import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as ServicesModule from '@/services';
import type { BulkRunRecord, ExtractedReport } from '@/types';
import { ok } from '@/utils';

import { useBulkReport } from './useBulkReport';

const mocks = vi.hoisted(() => ({
  extension: false,
  extractionFactory: vi.fn(),
  emailFactory: vi.fn(),
  sendBulkEmail: vi.fn(),
  recordBulkRun: vi.fn(async (_record: unknown) => undefined),
}));

vi.mock('@/utils/platform', () => ({ isExtensionContext: () => mocks.extension }));
vi.mock('@/services', async (importOriginal) => ({
  ...(await importOriginal<typeof ServicesModule>()),
  createReportExtractionService: mocks.extractionFactory,
  createEmailService: mocks.emailFactory,
  sendBulkEmail: mocks.sendBulkEmail,
  recordBulkRun: mocks.recordBulkRun,
}));

const report: ExtractedReport = {
  title: 'Report',
  columns: ['Email', 'Status'],
  extractedAt: '2026-08-31T00:00:00.000Z',
  rows: [{ index: 0, cells: {}, email: 'extension@example.com', status: 'Active' }],
};

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  mocks.extension = false;
  mocks.extractionFactory.mockReset();
  mocks.emailFactory.mockReset();
  mocks.sendBulkEmail.mockReset();
  mocks.recordBulkRun.mockReset();
});

describe('useBulkReport platform workflow', () => {
  it('uses manual web input and never creates extraction or email/send services', async () => {
    const { result } = renderHook(() => useBulkReport(), { wrapper: Wrapper });
    expect(result.current.deliveryMode).toBe('gmail_compose_url');

    await act(() => result.current.extract());
    act(() => result.current.loadManualRecipients('Web Person <web@example.com>'));
    await act(() =>
      result.current.approveAndSend({ to: [], subject: 'Prepared subject', body: 'Prepared body' }),
    );

    expect(mocks.extractionFactory).not.toHaveBeenCalled();
    expect(mocks.emailFactory).not.toHaveBeenCalled();
    expect(mocks.sendBulkEmail).not.toHaveBeenCalled();
    expect(mocks.recordBulkRun).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'prepared',
        deliveryMode: 'gmail_compose_url',
        matched: 1,
        succeeded: 1,
      }),
    );
    const record = mocks.recordBulkRun.mock.calls[0][0] as BulkRunRecord;
    expect(record).not.toHaveProperty('recipients');
    expect(record).not.toHaveProperty('subject');
    expect(record).not.toHaveProperty('body');
    expect(result.current.phase).toEqual({ kind: 'prepared', count: 1 });
  });

  it('preserves extension extraction and Gmail API bulk delivery', async () => {
    mocks.extension = true;
    const extraction = { extractActiveReport: vi.fn(async () => ok(report)) };
    const email = { sendEmail: vi.fn() };
    const sent: BulkRunRecord = {
      id: 'sent-run',
      action: 'sent',
      deliveryMode: 'gmail_api',
      ranAt: '2026-08-31T00:00:00.000Z',
      matched: 1,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      status: 'complete',
    };
    mocks.extractionFactory.mockReturnValue(extraction);
    mocks.emailFactory.mockReturnValue(email);
    mocks.sendBulkEmail.mockResolvedValue(ok(sent));
    const { result } = renderHook(() => useBulkReport(), { wrapper: Wrapper });

    expect(result.current.deliveryMode).toBe('gmail_api');
    await act(() => result.current.extract());
    await act(() => result.current.approveAndSend({ to: [], subject: 'Subject', body: 'Body' }));

    expect(extraction.extractActiveReport).toHaveBeenCalledOnce();
    expect(mocks.emailFactory).toHaveBeenCalledOnce();
    expect(mocks.sendBulkEmail).toHaveBeenCalledOnce();
    expect(mocks.recordBulkRun).toHaveBeenCalledWith(expect.objectContaining({ action: 'sent' }));
    expect(result.current.phase).toEqual({ kind: 'sent', succeeded: 1, failed: 0 });
  });
});
