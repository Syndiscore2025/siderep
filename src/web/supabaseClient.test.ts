import { describe, expect, it } from 'vitest';

import { isPasswordSetupLocation } from './supabaseClient';

describe('isPasswordSetupLocation', () => {
  it.each([
    ['query invite', '?type=invite', ''],
    ['query recovery', '?type=recovery', ''],
    ['hash invite', '', '#type=invite'],
    ['hash recovery', '', '#type=recovery'],
  ])('detects %s intent', (_label, search, hash) => {
    expect(isPasswordSetupLocation({ search, hash })).toBe(true);
  });

  it('rejects URLs without a password setup marker', () => {
    const location = { search: '?next=dashboard', hash: '#section=account' };
    expect(isPasswordSetupLocation(location)).toBe(false);
  });
});
