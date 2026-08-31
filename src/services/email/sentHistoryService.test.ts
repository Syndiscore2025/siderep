import { describe, expect, it } from 'vitest';

import type { SentEmailRecord } from '@/types';

import { clearSentEmails, loadSentEmails, recordSentEmail } from './sentHistoryService';

const makeRecord = (id: string): SentEmailRecord => ({
  id,
  to: ['dana@acme.com'],
  subject: `Subject ${id}`,
  body: `Body ${id}`,
  deliveryMode: 'gmail_api',
  sentAt: new Date().toISOString(),
});

describe('sentHistoryService', () => {
  it('starts empty', async () => {
    expect(await loadSentEmails()).toEqual([]);
  });

  it('records a sent email and reads it back', async () => {
    await recordSentEmail(makeRecord('a'));
    const history = await loadSentEmails();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('a');
    expect(history[0].subject).toBe('Subject a');
  });

  it('prepends newest records first', async () => {
    await recordSentEmail(makeRecord('first'));
    await recordSentEmail(makeRecord('second'));
    const history = await loadSentEmails();
    expect(history.map((r) => r.id)).toEqual(['second', 'first']);
  });

  it('caps history at 100 records', async () => {
    for (let i = 0; i < 105; i += 1) {
      await recordSentEmail(makeRecord(`r${i}`));
    }
    const history = await loadSentEmails();
    expect(history).toHaveLength(100);
    // The newest record is kept; the oldest is dropped.
    expect(history[0].id).toBe('r104');
    expect(history.some((r) => r.id === 'r0')).toBe(false);
  });

  it('clears all records', async () => {
    await recordSentEmail(makeRecord('a'));
    await clearSentEmails();
    expect(await loadSentEmails()).toEqual([]);
  });

  it('never stores raw customer fields — only the sent artifact shape', async () => {
    await recordSentEmail({
      ...makeRecord('a'),
      rawCustomer: { account: 'Acme' },
    } as SentEmailRecord);
    const [stored] = await loadSentEmails();
    expect(Object.keys(stored).sort()).toEqual(
      ['body', 'deliveryMode', 'id', 'sentAt', 'subject', 'to'].sort(),
    );
  });

  it('normalizes valid optional identifiers and strips unknown stored fields', async () => {
    const raw = {
      ...makeRecord('with-ids'),
      messageId: 'message-1',
      threadId: 'thread-1',
      customerPayload: { secret: true },
    };
    await chrome.storage.local.set({ 'siderep.sentEmails': [raw] });

    await expect(loadSentEmails()).resolves.toEqual([
      {
        ...makeRecord('with-ids'),
        sentAt: raw.sentAt,
        messageId: 'message-1',
        threadId: 'thread-1',
      },
    ]);
  });

  it.each([
    ['empty id', { id: '' }],
    ['invalid recipients', { to: ['valid@example.com', 42] }],
    ['invalid subject', { subject: null }],
    ['invalid body', { body: 42 }],
    ['unknown delivery mode', { deliveryMode: 'smtp' }],
    ['invalid sent date', { sentAt: 'yesterday' }],
    ['invalid message id', { messageId: 42 }],
    ['invalid thread id', { threadId: null }],
  ])('rejects a record with %s', async (_name, override) => {
    await chrome.storage.local.set({
      'siderep.sentEmails': [{ ...makeRecord('invalid'), ...override }],
    });

    await expect(loadSentEmails()).resolves.toEqual([]);
  });
});
