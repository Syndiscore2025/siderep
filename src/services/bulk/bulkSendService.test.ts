import { describe, expect, it, vi } from 'vitest';

import type { EmailService } from '@/services';
import type { BulkRecipient } from '@/types';
import { err, ok } from '@/utils';

import { sendBulkEmail } from './bulkSendService';

const draft = { to: [], subject: 'Subject', body: 'Body' };

function recipient(index: number, selected = true): BulkRecipient {
  return {
    row: { index, cells: {} },
    email: `person-${index}@example.com`,
    selected,
  };
}

function emailService(sendEmail: ReturnType<typeof vi.fn>): EmailService {
  return { sendEmail } as unknown as EmailService;
}

function success() {
  return ok({ action: 'send' as const, success: true, id: 'message-id' });
}

describe('sendBulkEmail metadata', () => {
  it('marks extension Gmail API delivery as sent', async () => {
    const sendEmail = vi.fn(async () => success());

    const result = await sendBulkEmail(
      emailService(sendEmail),
      draft,
      [recipient(0)],
      { matched: 1, skipped: 0 },
      { sendDelayMs: 0 },
    );

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(result.ok && result.value).toMatchObject({
      action: 'sent',
      deliveryMode: 'gmail_api',
      succeeded: 1,
    });
  });

  it('does not send when no recipients are selected', async () => {
    const sendEmail = vi.fn();
    const result = await sendBulkEmail(
      emailService(sendEmail),
      draft,
      [recipient(0, false)],
      { matched: 1, skipped: 0 },
      { sendDelayMs: 0 },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/no recipients/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not send an empty body', async () => {
    const sendEmail = vi.fn();
    const result = await sendBulkEmail(
      emailService(sendEmail),
      { ...draft, body: '   ' },
      [recipient(0)],
      { matched: 1, skipped: 0 },
      { sendDelayMs: 0 },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/body is empty/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('enforces the per-run cap', async () => {
    const sendEmail = vi.fn(async () => success());
    const result = await sendBulkEmail(
      emailService(sendEmail),
      draft,
      [recipient(0), recipient(1), recipient(2)],
      { matched: 3, skipped: 0 },
      { perRunCap: 2, sendDelayMs: 0 },
    );

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      ['person-0@example.com'],
      ['person-1@example.com'],
    ]);
    expect(result.ok && result.value).toMatchObject({ attempted: 2, succeeded: 2, failed: 0 });
  });

  it('stops after aborting an in-progress run', async () => {
    const controller = new AbortController();
    const sendEmail = vi.fn(async () => {
      controller.abort();
      return success();
    });
    const result = await sendBulkEmail(
      emailService(sendEmail),
      draft,
      [recipient(0), recipient(1)],
      { matched: 2, skipped: 0 },
      { signal: controller.signal, sendDelayMs: 0 },
    );

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(result.ok && result.value).toMatchObject({
      attempted: 1,
      succeeded: 1,
      failed: 0,
      status: 'partial',
    });
  });

  it('records mixed successes and failures as partial', async () => {
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(err(new Error('rejected')))
      .mockResolvedValueOnce(success());
    const result = await sendBulkEmail(
      emailService(sendEmail),
      draft,
      [recipient(0), recipient(1), recipient(2)],
      { matched: 3, skipped: 0 },
      { sendDelayMs: 0 },
    );

    expect(result.ok && result.value).toMatchObject({
      attempted: 3,
      succeeded: 2,
      failed: 1,
      status: 'partial',
    });
  });

  it('records result errors and thrown errors as all failed', async () => {
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce(err(new Error('rejected')))
      .mockRejectedValueOnce(new Error('thrown'));
    const result = await sendBulkEmail(
      emailService(sendEmail),
      draft,
      [recipient(0), recipient(1)],
      { matched: 2, skipped: 0 },
      { sendDelayMs: 0 },
    );

    expect(result.ok && result.value).toMatchObject({
      attempted: 2,
      succeeded: 0,
      failed: 2,
      status: 'failed',
    });
  });

  it('reports progress after every attempted recipient', async () => {
    const onProgress = vi.fn();
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(err(new Error('rejected')));
    await sendBulkEmail(
      emailService(sendEmail),
      draft,
      [recipient(0), recipient(1)],
      { matched: 2, skipped: 0 },
      { onProgress, sendDelayMs: 0 },
    );

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { completed: 1, total: 2, lastOk: true },
      { completed: 2, total: 2, lastOk: false },
    ]);
  });
});
