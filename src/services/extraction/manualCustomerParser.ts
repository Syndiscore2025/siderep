import type { CustomerField, ExtractedCustomer } from '@/types';
import { err, ok } from '@/utils';
import type { Result } from '@/utils';

export const MAX_MANUAL_CUSTOMER_INPUT_LENGTH = 12_000;
export const MAX_MANUAL_CUSTOMER_FIELDS = 40;
export const MAX_MANUAL_CUSTOMER_LABEL_LENGTH = 80;
export const MAX_MANUAL_CUSTOMER_VALUE_LENGTH = 500;

export class ManualCustomerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualCustomerParseError';
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function baseKey(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'field'
  );
}

function uniqueKey(label: string, used: Set<string>): string {
  const base = baseKey(label);
  let key = base;
  let suffix = 2;
  while (used.has(key)) key = `${base}-${suffix++}`;
  used.add(key);
  return key;
}

function displayName(fields: CustomerField[]): string {
  const preferred = /^(customer|customer name|account name|name|company|business name)$/i;
  return (
    fields.find((field) => preferred.test(field.label))?.value ?? fields[0]?.value ?? 'Customer'
  );
}

/** Parses user-pasted `Label: Value` lines without reading or writing storage. */
export function parseManualCustomer(input: string): Result<ExtractedCustomer> {
  if (input.length > MAX_MANUAL_CUSTOMER_INPUT_LENGTH) {
    return err(new ManualCustomerParseError('Customer details are too long.'));
  }

  const lines = input.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return err(new ManualCustomerParseError('Enter at least one Label: Value line.'));
  }
  if (lines.length > MAX_MANUAL_CUSTOMER_FIELDS) {
    return err(
      new ManualCustomerParseError(
        `Enter no more than ${MAX_MANUAL_CUSTOMER_FIELDS} customer fields.`,
      ),
    );
  }

  const fields: CustomerField[] = [];
  const usedKeys = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const separator = line.indexOf(':');
    const label = normalize(separator < 0 ? '' : line.slice(0, separator));
    const value = normalize(separator < 0 ? '' : line.slice(separator + 1));
    if (!label || !value) {
      return err(
        new ManualCustomerParseError(`Line ${index + 1} must contain a non-empty Label: Value.`),
      );
    }
    if (label.length > MAX_MANUAL_CUSTOMER_LABEL_LENGTH) {
      return err(new ManualCustomerParseError(`The label on line ${index + 1} is too long.`));
    }
    if (value.length > MAX_MANUAL_CUSTOMER_VALUE_LENGTH) {
      return err(new ManualCustomerParseError(`The value on line ${index + 1} is too long.`));
    }
    fields.push({
      key: uniqueKey(label, usedKeys),
      label,
      value,
      source: 'manual',
      approved: true,
    });
  }

  return ok({
    source: 'manual',
    displayName: displayName(fields),
    extractedAt: new Date().toISOString(),
    fields,
  });
}
