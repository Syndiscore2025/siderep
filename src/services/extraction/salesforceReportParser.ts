import type { ExtractedReport, ReportRow } from '@/types';

/**
 * Pure, read-only parser for Salesforce report pages.
 *
 * Like the record parser, it reads ONLY what is already rendered on the page
 * the user is viewing — it never calls a Salesforce API, never mutates the DOM,
 * and never navigates. It takes a `Document` so it can be unit-tested with
 * jsdom fixtures.
 *
 * Salesforce report runtimes vary. The Lightning report runtime and Classic
 * both ultimately render a tabular grid, so we target a plain header/row table
 * structure with a few resilient selector strategies and degrade gracefully.
 */

const MAX_ROWS = 1000;
const MAX_COLUMNS = 60;
const MAX_CELL_LENGTH = 500;

// A permissive email matcher — good enough to spot an address inside a cell.
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cellText(el: Element): string {
  // Prefer an explicit mailto/email link's address over its display text.
  const mailto = el.querySelector('a[href^="mailto:"]');
  const href = mailto?.getAttribute('href');
  if (href) {
    const addr = normalizeWhitespace(href.replace(/^mailto:/i, '').split('?')[0]);
    if (addr) return addr;
  }
  return normalizeWhitespace(el.textContent ?? '').slice(0, MAX_CELL_LENGTH);
}

/** Finds the grid's header labels using several resilient strategies. */
function readHeaders(table: Element): string[] {
  const headerCells =
    table.querySelectorAll('thead th').length > 0
      ? table.querySelectorAll('thead th')
      : table.querySelectorAll(
          '[role="rowgroup"] [role="columnheader"], [role="columnheader"], th',
        );
  const labels: string[] = [];
  headerCells.forEach((cell) => {
    const label = normalizeWhitespace(cell.textContent ?? '');
    if (label && labels.length < MAX_COLUMNS) labels.push(label);
  });
  return labels;
}

/** Returns the body rows, excluding any header row. */
function readBodyRows(table: Element): Element[] {
  const bodyRows =
    table.querySelectorAll('tbody tr').length > 0
      ? table.querySelectorAll('tbody tr')
      : table.querySelectorAll('[role="row"]');
  const rows: Element[] = [];
  bodyRows.forEach((row) => {
    // Skip pure header rows (only th / columnheader cells).
    const dataCells = row.querySelectorAll('td, [role="gridcell"], [role="cell"]');
    if (dataCells.length > 0) rows.push(row);
  });
  return rows;
}

function findColumnKey(columns: string[], patterns: RegExp[]): string | undefined {
  return columns.find((col) => patterns.some((p) => p.test(col)));
}

/** Builds a `ReportRow` from a DOM row, keyed by the detected column labels. */
function buildRow(
  rowEl: Element,
  index: number,
  columns: string[],
  statusKey: string | undefined,
  emailKey: string | undefined,
  nameKey: string | undefined,
): ReportRow | null {
  const cellEls = rowEl.querySelectorAll('td, [role="gridcell"], [role="cell"]');
  if (cellEls.length === 0) return null;

  const cells: Record<string, string> = {};
  cellEls.forEach((cellEl, i) => {
    const key = columns[i] ?? `Column ${i + 1}`;
    const value = cellText(cellEl);
    if (value) cells[key] = value;
  });
  if (Object.keys(cells).length === 0) return null;

  // Email: prefer the named column, else scan every cell for an address.
  let email = emailKey ? cells[emailKey] : undefined;
  if (!email) {
    for (const value of Object.values(cells)) {
      const match = value.match(EMAIL_RE);
      if (match) {
        email = match[0];
        break;
      }
    }
  }
  email = email && EMAIL_RE.test(email) ? email : undefined;

  return {
    index,
    cells,
    email,
    name: nameKey ? cells[nameKey] : undefined,
    status: statusKey ? cells[statusKey] : undefined,
  };
}

function readTitle(doc: Document): string {
  const candidates = [
    '.reportName',
    '.slds-page-header__title',
    'h1.slds-page-header__title',
    'h1',
  ];
  for (const selector of candidates) {
    const text = normalizeWhitespace(doc.querySelector(selector)?.textContent ?? '');
    if (text) return text;
  }
  return 'Salesforce Report';
}

/**
 * Parse the visible Salesforce report into an `ExtractedReport`.
 * Returns `null` when no recognizable report grid is present.
 */
export function parseSalesforceReport(doc: Document, sourceUrl?: string): ExtractedReport | null {
  const table =
    doc.querySelector('table[role="grid"], [role="grid"]') ??
    doc.querySelector('table.data-grid, table.reportTable, table');
  if (!table) return null;

  const columns = readHeaders(table);
  if (columns.length === 0) return null;

  const statusKey = findColumnKey(columns, [/^status$/i, /account\s*status/i, /stage/i]);
  const emailKey = findColumnKey(columns, [/e-?mail/i]);
  const nameKey = findColumnKey(columns, [/account\s*name/i, /^name$/i, /contact/i, /company/i]);

  const rows: ReportRow[] = [];
  for (const rowEl of readBodyRows(table)) {
    if (rows.length >= MAX_ROWS) break;
    const row = buildRow(rowEl, rows.length, columns, statusKey, emailKey, nameKey);
    if (row) rows.push(row);
  }
  if (rows.length === 0) return null;

  return {
    title: readTitle(doc),
    columns,
    rows,
    sourceUrl,
    extractedAt: new Date().toISOString(),
  };
}
