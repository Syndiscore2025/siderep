import { describe, expect, it, vi } from 'vitest';

import {
  MAX_MANUAL_CUSTOMER_FIELDS,
  MAX_MANUAL_CUSTOMER_INPUT_LENGTH,
  MAX_MANUAL_CUSTOMER_LABEL_LENGTH,
  MAX_MANUAL_CUSTOMER_VALUE_LENGTH,
  parseManualCustomer,
} from './manualCustomerParser';

describe('parseManualCustomer', () => {
  it('parses non-empty Label: Value lines into an in-memory manual customer', () => {
    const chromeWrite = vi.spyOn(chrome.storage.local, 'set');
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');
    const result = parseManualCustomer(
      ' Account Name: Acme Inc.\n\nAccount Name: Acme West\nWebsite: https://acme.test:443/path ',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ source: 'manual', displayName: 'Acme Inc.' });
    expect(result.value.fields).toEqual([
      {
        key: 'account-name',
        label: 'Account Name',
        value: 'Acme Inc.',
        source: 'manual',
        approved: true,
      },
      {
        key: 'account-name-2',
        label: 'Account Name',
        value: 'Acme West',
        source: 'manual',
        approved: true,
      },
      {
        key: 'website',
        label: 'Website',
        value: 'https://acme.test:443/path',
        source: 'manual',
        approved: true,
      },
    ]);
    expect(chromeWrite).not.toHaveBeenCalled();
    expect(localWrite).not.toHaveBeenCalled();
  });

  it('creates stable sanitized unique fallback keys', () => {
    const first = parseManualCustomer('!!!: One\n???: Two');
    const second = parseManualCustomer('!!!: One\n???: Two');
    expect(first.ok && first.value.fields.map((field) => field.key)).toEqual(['field', 'field-2']);
    expect(second.ok && second.value.fields.map((field) => field.key)).toEqual([
      'field',
      'field-2',
    ]);
  });

  it.each(['', 'Missing separator', ': Missing label', 'Missing value:   '])(
    'rejects malformed input without echoing it: %j',
    (input) => {
      const result = parseManualCustomer(input);
      expect(result.ok).toBe(false);
      if (!result.ok && input) expect(result.error.message).not.toContain(input);
    },
  );

  it('enforces input, field, label, and value bounds', () => {
    const cases = [
      'x'.repeat(MAX_MANUAL_CUSTOMER_INPUT_LENGTH + 1),
      Array.from({ length: MAX_MANUAL_CUSTOMER_FIELDS + 1 }, (_, index) => `Field: ${index}`).join(
        '\n',
      ),
      `${'L'.repeat(MAX_MANUAL_CUSTOMER_LABEL_LENGTH + 1)}: value`,
      `Label: ${'v'.repeat(MAX_MANUAL_CUSTOMER_VALUE_LENGTH + 1)}`,
    ];
    for (const input of cases) expect(parseManualCustomer(input).ok).toBe(false);
  });
});
