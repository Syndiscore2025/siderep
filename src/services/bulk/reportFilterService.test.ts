import { describe, expect, it } from 'vitest';

import type { ExtractedReport, ReportRow } from '@/types';

import {
  DEFAULT_EXCLUDED_STATUSES,
  filterReport,
  isExcludedStatus,
  parseExcludedStatusesInput,
  selectedRecipients,
  setAllSelected,
  toggleRecipient,
} from './reportFilterService';

function row(partial: Partial<ReportRow> & { index: number }): ReportRow {
  return { cells: {}, ...partial };
}

function report(rows: ReportRow[]): ExtractedReport {
  return { title: 'r', columns: [], rows, extractedAt: new Date(0).toISOString() };
}

describe('isExcludedStatus', () => {
  it('matches excluded statuses case-insensitively as substrings', () => {
    expect(isExcludedStatus('Charge Off', DEFAULT_EXCLUDED_STATUSES)).toBe(true);
    expect(isExcludedStatus('  DEFAULT  ', DEFAULT_EXCLUDED_STATUSES)).toBe(true);
    expect(isExcludedStatus('Paid In Full', DEFAULT_EXCLUDED_STATUSES)).toBe(true);
    expect(isExcludedStatus('Active', DEFAULT_EXCLUDED_STATUSES)).toBe(false);
  });

  it('treats an empty/undefined status as not excluded', () => {
    expect(isExcludedStatus(undefined, DEFAULT_EXCLUDED_STATUSES)).toBe(false);
    expect(isExcludedStatus('', DEFAULT_EXCLUDED_STATUSES)).toBe(false);
  });
});

describe('filterReport', () => {
  it('keeps active accounts with emails and skips excluded statuses', () => {
    const result = filterReport(
      report([
        row({ index: 0, email: 'a@x.com', status: 'Active', name: 'A' }),
        row({ index: 1, email: 'b@x.com', status: 'Charge Off', name: 'B' }),
        row({ index: 2, email: 'c@x.com', status: 'Default', name: 'C' }),
      ]),
    );
    expect(result.recipients.map((r) => r.email)).toEqual(['a@x.com']);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((s) => s.reason === 'excluded-status')).toBe(true);
  });

  it('skips rows without an email address', () => {
    const result = filterReport(report([row({ index: 0, status: 'Active' })]));
    expect(result.recipients).toHaveLength(0);
    expect(result.skipped[0].reason).toBe('no-email');
  });

  it('de-duplicates repeated email addresses', () => {
    const result = filterReport(
      report([
        row({ index: 0, email: 'dup@x.com', status: 'Active' }),
        row({ index: 1, email: 'DUP@x.com', status: 'Active' }),
      ]),
    );
    expect(result.recipients).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('duplicate-email');
  });

  it('defaults every recipient to selected', () => {
    const result = filterReport(report([row({ index: 0, email: 'a@x.com', status: 'Active' })]));
    expect(result.recipients[0].selected).toBe(true);
  });
});

describe('selection helpers', () => {
  const recipients = filterReport(
    report([
      row({ index: 0, email: 'a@x.com', status: 'Active' }),
      row({ index: 1, email: 'b@x.com', status: 'Active' }),
    ]),
  ).recipients;

  it('toggles a single recipient by row index', () => {
    const next = toggleRecipient(recipients, 0);
    expect(next[0].selected).toBe(false);
    expect(next[1].selected).toBe(true);
  });

  it('sets all and reports the selected subset', () => {
    expect(selectedRecipients(setAllSelected(recipients, false))).toHaveLength(0);
    expect(selectedRecipients(setAllSelected(recipients, true))).toHaveLength(2);
  });
});

describe('parseExcludedStatusesInput', () => {
  it('splits on commas and newlines and trims blanks', () => {
    expect(parseExcludedStatusesInput('charge off, default\n paid in full , ')).toEqual([
      'charge off',
      'default',
      'paid in full',
    ]);
  });
});
