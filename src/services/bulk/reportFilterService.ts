import type { BulkRecipient, ExtractedReport, FilterResult, SkippedRow } from '@/types';

/**
 * Pure report filtering for bulk sends.
 *
 * Turns an extracted report into the set of recipients to email and the rows
 * that were skipped (with reasons). It is deliberately side-effect free and
 * never persists anything — the report rows live in memory only.
 *
 * The default excluded statuses match the rep's rule: accounts in charge off,
 * default, modified payments, or paid in full are skipped. The list is
 * user-extendable via `excludedStatuses`.
 */

export const DEFAULT_EXCLUDED_STATUSES = [
  'charge off',
  'charged off',
  'default',
  'modified payments',
  'modified payment',
  'paid in full',
  'paid-in-full',
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when a row's status matches any excluded status (substring, case-insensitive). */
export function isExcludedStatus(status: string | undefined, excluded: string[]): boolean {
  if (!status) return false;
  const normalizedStatus = normalize(status);
  if (!normalizedStatus) return false;
  return excluded.some((term) => {
    const t = normalize(term);
    return t.length > 0 && normalizedStatus.includes(t);
  });
}

/**
 * Filters an extracted report into recipients + skipped rows.
 *
 * Skip precedence: excluded status first (a charge-off with no email is still
 * reported as excluded-status), then missing email, then duplicate email. All
 * recipients start `selected: true` so the review UI shows them checked; the
 * user unchecks anyone they don't want.
 */
export function filterReport(
  report: ExtractedReport,
  excludedStatuses: string[] = DEFAULT_EXCLUDED_STATUSES,
): FilterResult {
  const recipients: BulkRecipient[] = [];
  const skipped: SkippedRow[] = [];
  const seenEmails = new Set<string>();

  for (const row of report.rows) {
    if (isExcludedStatus(row.status, excludedStatuses)) {
      skipped.push({ row, reason: 'excluded-status', status: row.status });
      continue;
    }

    const email = row.email?.trim().toLowerCase();
    if (!email) {
      skipped.push({ row, reason: 'no-email', status: row.status });
      continue;
    }

    if (seenEmails.has(email)) {
      skipped.push({ row, reason: 'duplicate-email', status: row.status });
      continue;
    }
    seenEmails.add(email);

    recipients.push({
      row,
      email,
      name: row.name,
      status: row.status,
      selected: true,
    });
  }

  return { recipients, skipped };
}

/** The rows the user has selected to receive the email. */
export function selectedRecipients(recipients: BulkRecipient[]): BulkRecipient[] {
  return recipients.filter((recipient) => recipient.selected);
}

/** Toggles the selection of a single recipient by row index (returns a new array). */
export function toggleRecipient(recipients: BulkRecipient[], rowIndex: number): BulkRecipient[] {
  return recipients.map((recipient) =>
    recipient.row.index === rowIndex ? { ...recipient, selected: !recipient.selected } : recipient,
  );
}

/** Sets every recipient's selection to `selected` (returns a new array). */
export function setAllSelected(recipients: BulkRecipient[], selected: boolean): BulkRecipient[] {
  return recipients.map((recipient) => ({ ...recipient, selected }));
}

/** A short human summary of a skipped row for the review UI. */
export function describeSkip(row: SkippedRow): string {
  switch (row.reason) {
    case 'excluded-status':
      return `Excluded status: ${row.status ?? 'unknown'}`;
    case 'no-email':
      return 'No email address in the row';
    case 'duplicate-email':
      return 'Duplicate email address';
    default: {
      const _exhaustive: never = row.reason;
      return _exhaustive;
    }
  }
}

/** Parses a comma/newline-separated list of statuses into a normalized array. */
export function parseExcludedStatusesInput(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
