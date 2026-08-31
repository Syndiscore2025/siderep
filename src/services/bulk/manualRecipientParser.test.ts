import { describe, expect, it, vi } from 'vitest';

import {
  MAX_MANUAL_RECIPIENT_INPUT_LENGTH,
  MAX_MANUAL_RECIPIENT_LINE_LENGTH,
  MAX_MANUAL_RECIPIENTS,
  parseManualRecipients,
} from './manualRecipientParser';

describe('parseManualRecipients', () => {
  it('accepts email, CSV, tab-separated, and Name <email> lines', () => {
    const result = parseManualRecipients(
      'first@example.com\nSecond Person,second@example.com,Active\nThird\tthird@example.com\tCurrent\nFourth <fourth@example.com>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toMatchObject([
      { email: 'first@example.com' },
      { email: 'second@example.com', name: 'Second Person', status: 'Active' },
      { email: 'third@example.com', name: 'Third', status: 'Current' },
      { email: 'fourth@example.com', name: 'Fourth' },
    ]);
  });

  it('maps a name/email/status header and ignores blank lines', () => {
    const result = parseManualRecipients('Name,Email,Status\n\nAcme,owner@example.com,Active');
    expect(result.ok && result.value.rows[0]).toMatchObject({
      name: 'Acme',
      email: 'owner@example.com',
      status: 'Active',
    });
  });

  it('deduplicates case-insensitively and never persists report data', () => {
    const chromeWrite = vi.spyOn(chrome.storage.local, 'set');
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');
    const result = parseManualRecipients('Person <DUP@example.com>\ndup@example.com');
    expect(result.ok && result.value.rows).toHaveLength(1);
    expect(chromeWrite).not.toHaveBeenCalled();
    expect(localWrite).not.toHaveBeenCalled();
  });

  it('returns physical line-numbered safe errors without echoing input', () => {
    const result = parseManualRecipients('\nvalid@example.com\nprivate invalid value');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Line 3');
    expect(result.error.message).not.toContain('private invalid value');
  });

  it('enforces input, line, and unique-recipient bounds', () => {
    expect(parseManualRecipients('x'.repeat(MAX_MANUAL_RECIPIENT_INPUT_LENGTH + 1)).ok).toBe(false);
    expect(parseManualRecipients(`${'n'.repeat(MAX_MANUAL_RECIPIENT_LINE_LENGTH)}@x.com`).ok).toBe(
      false,
    );
    const tooMany = Array.from(
      { length: MAX_MANUAL_RECIPIENTS + 1 },
      (_, index) => `person${index}@example.com`,
    ).join('\n');
    expect(parseManualRecipients(tooMany).ok).toBe(false);
  });
});
