import { describe, expect, it } from 'vitest';

import type { BulkRunRecord } from '@/types';

import { clearBulkRuns, loadBulkRuns, recordBulkRun } from './bulkRunHistoryService';

const record: BulkRunRecord = {
  id: 'run-1',
  ranAt: '2026-08-31T12:00:00.000Z',
  matched: 4,
  attempted: 3,
  succeeded: 3,
  failed: 0,
  skipped: 1,
  status: 'complete',
};

describe('bulkRunHistoryService', () => {
  it('round-trips and clears metadata-only records', async () => {
    await recordBulkRun(record);
    await expect(loadBulkRuns()).resolves.toEqual([record]);
    await clearBulkRuns();
    await expect(loadBulkRuns()).resolves.toEqual([]);
  });

  it('keeps known optional metadata and strips all unknown fields', async () => {
    const stored = {
      ...record,
      action: 'prepared',
      deliveryMode: 'manual_composer',
      recipients: ['customer@example.com'],
      subject: 'Private subject',
      body: 'Private body',
    };
    await chrome.storage.local.set({ 'siderep.bulkRuns': [stored] });

    await expect(loadBulkRuns()).resolves.toEqual([
      { ...record, action: 'prepared', deliveryMode: 'manual_composer' },
    ]);
  });

  it('treats missing legacy action and delivery mode as valid', async () => {
    await chrome.storage.local.set({ 'siderep.bulkRuns': [record] });
    await expect(loadBulkRuns()).resolves.toEqual([record]);
  });

  it.each([
    ['empty id', { id: '' }],
    ['invalid date', { ranAt: '2026-08-31' }],
    ['negative count', { matched: -1 }],
    ['fractional count', { attempted: 1.5 }],
    ['non-finite count', { succeeded: Number.POSITIVE_INFINITY }],
    ['unknown status', { status: 'cancelled' }],
    ['unknown action', { action: 'drafted' }],
    ['unknown delivery mode', { deliveryMode: 'smtp' }],
  ])('rejects a record with %s', async (_name, override) => {
    await chrome.storage.local.set({ 'siderep.bulkRuns': [{ ...record, ...override }] });
    await expect(loadBulkRuns()).resolves.toEqual([]);
  });
});
