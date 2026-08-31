/**
 * Customer data model.
 *
 * IMPORTANT: values described here exist ONLY in memory while the side panel
 * is open. Nothing in this module is ever written to disk, storage, or logs.
 */

/** A single customer field held in the active in-memory session. */
export interface CustomerField {
  /** Stable machine key, e.g. `accountName`. */
  key: string;
  /** Human-friendly label shown in the UI, e.g. `Account Name`. */
  label: string;
  /** The value exactly as rendered on the page. */
  value: string;
  /** Where the value came from (shown for transparency). */
  source?: string;
  /**
   * Whether the user has explicitly approved sending this field to the AI.
   * Fields are never sent until the user confirms.
   */
  approved: boolean;
}

/** The set of fields extracted for the currently active record. */
export interface ExtractedCustomer {
  /** How this in-memory customer was loaded. */
  source?: 'salesforce' | 'sample' | 'manual';
  /** Best-effort display name for the current record. */
  displayName: string;
  /** Salesforce object type if detectable (Account, Contact, Opportunity…). */
  recordType?: string;
  /** URL the data was read from (kept in memory only, never persisted). */
  sourceUrl?: string;
  /** ISO timestamp of extraction (in-memory only). */
  extractedAt: string;
  /** The individual detected fields. */
  fields: CustomerField[];
}

/** Returns only the fields the user has approved for AI use. */
export function approvedFields(customer: ExtractedCustomer): CustomerField[] {
  return customer.fields.filter((field) => field.approved);
}
