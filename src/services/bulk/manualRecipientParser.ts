import type { ExtractedReport, ReportRow } from '@/types';
import { err, ok } from '@/utils';
import type { Result } from '@/utils';

export const MAX_MANUAL_RECIPIENT_INPUT_LENGTH = 50_000;
export const MAX_MANUAL_RECIPIENT_LINE_LENGTH = 1_000;
export const MAX_MANUAL_RECIPIENTS = 200;

export class ManualRecipientParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualRecipientParseError';
  }
}

type HeaderKey = 'name' | 'email' | 'status';
type HeaderMap = Partial<Record<HeaderKey, number>>;

const EMAIL_PATTERN = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

function splitDelimited(line: string, delimiter: ',' | '\t'): string[] | null {
  if (delimiter === '\t') return line.split('\t').map((value) => value.trim());
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else value += char;
  }
  if (quoted) return null;
  values.push(value.trim());
  return values;
}

function headerMap(values: string[]): HeaderMap | null {
  const map: HeaderMap = {};
  for (const [index, value] of values.entries()) {
    const key = value
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase();
    if (key === 'name' || key === 'email' || key === 'status') map[key] = index;
    else return null;
  }
  return map.email === undefined ? null : map;
}

function parseValues(values: string[], header?: HeaderMap) {
  if (header) {
    if (values.length !== Object.keys(header).length) return null;
    return {
      email: values[header.email ?? -1]?.trim() ?? '',
      name: header.name === undefined ? '' : (values[header.name]?.trim() ?? ''),
      status: header.status === undefined ? '' : (values[header.status]?.trim() ?? ''),
    };
  }
  const emailIndexes = values.flatMap((value, index) =>
    EMAIL_PATTERN.test(value.trim()) ? [index] : [],
  );
  if (emailIndexes.length !== 1 || values.length > 3) return null;
  const emailIndex = emailIndexes[0];
  const remaining = values.filter((_, index) => index !== emailIndex);
  return {
    email: values[emailIndex].trim(),
    name: remaining[0]?.trim() ?? '',
    status: remaining[1]?.trim() ?? '',
  };
}

function parseLine(line: string, header?: HeaderMap) {
  const angle = line.match(/^\s*(.*?)\s*<\s*([^<>]+)\s*>\s*$/);
  if (angle && !header) return { name: angle[1].trim(), email: angle[2].trim(), status: '' };
  const delimiter = line.includes('\t') ? '\t' : line.includes(',') ? ',' : null;
  if (delimiter) {
    const values = splitDelimited(line, delimiter);
    return values ? parseValues(values, header) : null;
  }
  return header ? parseValues([line], header) : { name: '', email: line.trim(), status: '' };
}

/** Parses pasted recipients into an in-memory report without reading or writing storage. */
export function parseManualRecipients(input: string): Result<ExtractedReport> {
  if (input.length > MAX_MANUAL_RECIPIENT_INPUT_LENGTH) {
    return err(new ManualRecipientParseError('Recipient input is too long.'));
  }
  const lines = input.split(/\r?\n/).map((text, index) => ({ text, number: index + 1 }));
  const nonEmpty = lines.filter(({ text }) => text.trim().length > 0);
  if (nonEmpty.length === 0) {
    return err(new ManualRecipientParseError('Enter at least one recipient.'));
  }

  let header: HeaderMap | undefined;
  let start = 0;
  const firstDelimiter = nonEmpty[0].text.includes('\t') ? '\t' : ',';
  const firstValues = splitDelimited(nonEmpty[0].text, firstDelimiter);
  const detectedHeader = firstValues ? headerMap(firstValues) : null;
  if (detectedHeader) {
    header = detectedHeader;
    start = 1;
  }

  const rows: ReportRow[] = [];
  const seen = new Set<string>();
  for (const line of nonEmpty.slice(start)) {
    if (line.text.length > MAX_MANUAL_RECIPIENT_LINE_LENGTH) {
      return err(new ManualRecipientParseError(`Line ${line.number} is too long.`));
    }
    const parsed = parseLine(line.text, header);
    if (!parsed || !EMAIL_PATTERN.test(parsed.email)) {
      return err(
        new ManualRecipientParseError(`Line ${line.number} must contain one valid email address.`),
      );
    }
    const email = parsed.email.toLowerCase();
    if (seen.has(email)) continue;
    if (seen.size === MAX_MANUAL_RECIPIENTS) {
      return err(
        new ManualRecipientParseError(
          `Line ${line.number} exceeds the limit of ${MAX_MANUAL_RECIPIENTS} unique recipients.`,
        ),
      );
    }
    seen.add(email);
    const cells: Record<string, string> = { Email: email };
    if (parsed.name) cells.Name = parsed.name;
    if (parsed.status) cells.Status = parsed.status;
    rows.push({
      index: rows.length,
      cells,
      email,
      name: parsed.name || undefined,
      status: parsed.status || undefined,
    });
  }
  if (rows.length === 0) {
    return err(new ManualRecipientParseError('Enter at least one recipient below the header.'));
  }
  return ok({
    title: 'Manual recipients',
    columns: ['Name', 'Email', 'Status'],
    rows,
    extractedAt: new Date().toISOString(),
  });
}
