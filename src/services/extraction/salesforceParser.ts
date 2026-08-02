import type { CustomerField, ExtractedCustomer } from '@/types';

/**
 * Pure, read-only parser for Salesforce record pages.
 *
 * It reads ONLY what is already rendered on the page the user is viewing —
 * it never calls a Salesforce API, never mutates the DOM, and never navigates.
 * The function is deliberately side-effect free and takes a `Document` so it
 * can be unit-tested with jsdom fixtures.
 *
 * Salesforce Lightning Experience renders record detail fields as label/value
 * pairs inside `records-record-layout-item`. We support that primary layout
 * plus a couple of resilient fallbacks (dl/dt/dd, and the older Classic
 * `.detailList` table) so extraction degrades gracefully across orgs.
 */

/** Field labels whose values are sensitive and should default to NOT approved. */
const SENSITIVE_LABEL_PATTERNS = [
  /balance/i,
  /revenue/i,
  /ssn|social security/i,
  /credit\s*card|card\s*number/i,
  /password/i,
  /salary|compensation/i,
  /bank|routing|iban|account\s*number/i,
];

const MAX_FIELDS = 40;
const MAX_VALUE_LENGTH = 500;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'field';
}

function isSensitive(label: string): boolean {
  return SENSITIVE_LABEL_PATTERNS.some((pattern) => pattern.test(label));
}

function makeField(label: string, value: string, source: string): CustomerField | null {
  const cleanLabel = normalizeWhitespace(label);
  const cleanValue = normalizeWhitespace(value).slice(0, MAX_VALUE_LENGTH);
  if (!cleanLabel || !cleanValue) return null;
  return {
    key: slugify(cleanLabel),
    label: cleanLabel,
    value: cleanValue,
    source,
    approved: !isSensitive(cleanLabel),
  };
}

function pushUnique(fields: CustomerField[], field: CustomerField | null): void {
  if (!field) return;
  if (fields.some((existing) => existing.key === field.key)) return;
  fields.push(field);
}

/** Primary strategy: Lightning `records-record-layout-item` label/value pairs. */
function parseLightning(doc: Document, fields: CustomerField[]): void {
  const items = doc.querySelectorAll('records-record-layout-item');
  items.forEach((item) => {
    const labelEl =
      item.querySelector('.test-id__field-label') ?? item.querySelector('[class*="field-label"]');
    const valueEl =
      item.querySelector('.test-id__field-value') ?? item.querySelector('[class*="field-value"]');
    if (labelEl && valueEl) {
      pushUnique(
        fields,
        makeField(labelEl.textContent ?? '', valueEl.textContent ?? '', 'lightning'),
      );
    }
  });
}

/** Fallback: generic definition lists (dt/dd) commonly used in detail panels. */
function parseDefinitionLists(doc: Document, fields: CustomerField[]): void {
  doc.querySelectorAll('dl').forEach((dl) => {
    const terms = dl.querySelectorAll('dt');
    terms.forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName.toLowerCase() === 'dd') {
        pushUnique(fields, makeField(dt.textContent ?? '', dd.textContent ?? '', 'dl'));
      }
    });
  });
}

/** Fallback: Salesforce Classic `.detailList` two-column tables. */
function parseClassicDetailList(doc: Document, fields: CustomerField[]): void {
  doc.querySelectorAll('table.detailList tr').forEach((row) => {
    const label = row.querySelector('td.labelCol, th.labelCol');
    const value = row.querySelector('td.dataCol');
    if (label && value) {
      pushUnique(fields, makeField(label.textContent ?? '', value.textContent ?? '', 'classic'));
    }
  });
}

/** Best-effort record title from the Lightning highlights header. */
function readDisplayName(doc: Document): string {
  const candidates = [
    'records-highlights2 lightning-formatted-text',
    '.slds-page-header__title',
    'h1.slds-page-header__title',
    'h1',
  ];
  for (const selector of candidates) {
    const el = doc.querySelector(selector);
    const text = normalizeWhitespace(el?.textContent ?? '');
    if (text) return text;
  }
  return '';
}

/** Best-effort object/record type from the entity label in the header. */
function readRecordType(doc: Document): string | undefined {
  const el = doc.querySelector(
    'records-entity-label, .entityNameTitle, .slds-page-header__name-meta',
  );
  const text = normalizeWhitespace(el?.textContent ?? '');
  return text || undefined;
}

/**
 * Parse the visible Salesforce record into an `ExtractedCustomer`.
 * Returns `null` when no recognizable record fields are present.
 */
export function parseSalesforceRecord(doc: Document, sourceUrl?: string): ExtractedCustomer | null {
  const fields: CustomerField[] = [];

  parseLightning(doc, fields);
  if (fields.length === 0) parseDefinitionLists(doc, fields);
  if (fields.length === 0) parseClassicDetailList(doc, fields);

  if (fields.length === 0) return null;

  const trimmed = fields.slice(0, MAX_FIELDS);
  const displayName = readDisplayName(doc) || trimmed[0]?.value || 'Salesforce Record';

  return {
    displayName,
    recordType: readRecordType(doc),
    sourceUrl,
    extractedAt: new Date().toISOString(),
    fields: trimmed,
  };
}
