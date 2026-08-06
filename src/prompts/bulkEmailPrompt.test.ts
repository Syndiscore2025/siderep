import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';

import { buildBulkEmailMessages } from './bulkEmailPrompt';

describe('buildBulkEmailMessages', () => {
  const input = {
    criteria: 'active performing accounts',
    emailType: 'a friendly quarterly check-in',
    recipientCount: 12,
  };

  it('returns a system + user message pair', () => {
    const messages = buildBulkEmailMessages(DEFAULT_SETTINGS, input);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('includes the campaign criteria and email type verbatim', () => {
    const [, user] = buildBulkEmailMessages(DEFAULT_SETTINGS, input);
    expect(user.content).toContain('active performing accounts');
    expect(user.content).toContain('a friendly quarterly check-in');
    expect(user.content).toContain('12 recipient');
  });

  it('instructs the model not to reference specific accounts or invent data', () => {
    const [, user] = buildBulkEmailMessages(DEFAULT_SETTINGS, input);
    expect(user.content).toMatch(/do not reference any specific account/i);
    expect(user.content).toMatch(/do not invent customer facts/i);
    expect(user.content).toMatch(/neutral greeting/i);
  });

  it('asks for a strict JSON object with only subject and body', () => {
    const [, user] = buildBulkEmailMessages(DEFAULT_SETTINGS, input);
    expect(user.content).toContain('{"subject": "...", "body": "..."}');
    expect(user.content).toMatch(/leave "to" out/i);
  });

  it('falls back to neutral phrasing when criteria/email type are blank', () => {
    const [, user] = buildBulkEmailMessages(DEFAULT_SETTINGS, {
      criteria: '   ',
      emailType: '',
      recipientCount: 0,
    });
    expect(user.content).toContain('active accounts selected by the rep');
    expect(user.content).toContain('a concise, relevant outreach email');
  });
});
