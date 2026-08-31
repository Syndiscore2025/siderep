import type { EmailDeliveryMode } from './email';

/**
 * Bulk report data model.
 *
 * IMPORTANT: like customer data, extracted report rows exist ONLY in memory
 * while the side panel is open. They are NEVER written to disk, storage, or
 * logs. Only aggregate run METADATA (counts/status/timestamps) is ever
 * persisted, via `BulkRunRecord` below.
 */

/** A single row read from a Salesforce report grid (in-memory only). */
export interface ReportRow {
  /** Stable row index within the extracted report. */
  index: number;
  /** Column label → cell value, exactly as rendered on the page. */
  cells: Record<string, string>;
  /** Best-effort recipient email detected in the row, if any. */
  email?: string;
  /** Best-effort display name for the row (account/contact), if detected. */
  name?: string;
  /** The row's status cell value when a "Status" column exists. */
  status?: string;
}

/** The set of rows extracted from the currently visible report. */
export interface ExtractedReport {
  /** Best-effort report title. */
  title: string;
  /** Ordered column labels detected in the report header. */
  columns: string[];
  /** The parsed rows (in-memory only, never persisted). */
  rows: ReportRow[];
  /** URL the report was read from (kept in memory only, never persisted). */
  sourceUrl?: string;
  /** ISO timestamp of extraction (in-memory only). */
  extractedAt: string;
}

/** Why a report row was excluded from a bulk send. */
export type SkipReason = 'excluded-status' | 'no-email' | 'duplicate-email';

/** A row paired with the recipient decision made for it (in-memory only). */
export interface BulkRecipient {
  row: ReportRow;
  email: string;
  name?: string;
  status?: string;
  /** Whether the user has this recipient selected to receive the email. */
  selected: boolean;
}

/** A row excluded during filtering, with the reason (in-memory only). */
export interface SkippedRow {
  row: ReportRow;
  reason: SkipReason;
  status?: string;
}

/** The outcome of running the filter over an extracted report. */
export interface FilterResult {
  recipients: BulkRecipient[];
  skipped: SkippedRow[];
}

/**
 * METADATA-ONLY record of a bulk run — SideRep's OWN artifact, explicitly
 * allowed to persist. It stores NO customer data: no recipients, subjects, or
 * bodies. Only aggregate counts, status, and timing are kept so the rep can see
 * that a run happened and how it went.
 */
export interface BulkRunRecord {
  id: string;
  /** Missing on legacy records, which are treated as sent. */
  action?: 'sent' | 'prepared';
  /** Transport selected for this run; absent on legacy records. */
  deliveryMode?: EmailDeliveryMode;
  /** ISO timestamp of when the run completed. */
  ranAt: string;
  /** Rows matched after filtering (candidate recipients). */
  matched: number;
  /** Recipients the user approved and acted on. */
  attempted: number;
  /** Actions that completed successfully. */
  succeeded: number;
  /** Actions that failed. */
  failed: number;
  /** Rows skipped by the status filter. */
  skipped: number;
  /** Whether the run finished cleanly, partially, or errored out. */
  status: 'complete' | 'partial' | 'failed';
}
