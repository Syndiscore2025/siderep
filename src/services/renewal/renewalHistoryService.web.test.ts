import { afterEach, describe, expect, it, vi } from 'vitest';

const NOW = '2026-08-31T12:00:00.000Z';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('renewalHistoryService web storage cap', () => {
  it('rejects active history that cannot be pruned below approximately 3 MB', async () => {
    vi.resetModules();
    vi.stubGlobal('chrome', undefined);
    const service = await import('./renewalHistoryService');
    const emails = Array.from({ length: 790 }, (_, index) => ({
      id: `email-${index}`,
      draftId: `draft-${index}`,
      subject: 'Subject',
      body: 'x'.repeat(4_000),
      copiedAt: NOW,
    }));
    const history = {
      schemaVersion: 1,
      accounts: [
        {
          id: 'account-1',
          identity: {
            merchantName: 'Merchant',
            businessName: '',
            accountName: '',
            dba: '',
            website: '',
          },
          cycles: [
            {
              id: 'cycle-1',
              outreachType: 'renewal',
              sentEmails: emails,
              startedAt: NOW,
              updatedAt: NOW,
            },
          ],
          activeCycleId: 'cycle-1',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    window.localStorage.setItem(service.RENEWAL_HISTORY_STORAGE_KEY, JSON.stringify(history));

    await expect(
      service.recordCopiedRenewalEmail({
        selectedAccountId: 'account-1',
        identity: {},
        outreachType: 'renewal',
        draftId: 'new-draft',
        subject: 'New',
        body: 'Body',
        copiedAt: NOW,
      }),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
  });
});
