import { describe, expect, it, vi } from 'vitest';

import type { RenewalAccountIdentity, RenewalHistoryStore } from '@/types';

import {
  RENEWAL_HISTORY_STORAGE_KEY,
  RenewalHistorySaveError,
  archiveRenewalCycle,
  clearRenewalHistory,
  deleteRenewalAccount,
  loadRenewalHistory,
  migrateRenewalHistory,
  recordCopiedRenewalEmail,
  searchRenewalAccounts,
  subscribeRenewalHistory,
} from './renewalHistoryService';

const NOW = '2026-08-29T12:00:00.000Z';
const IDENTITY: RenewalAccountIdentity = {
  merchantName: 'Dana Merchant',
  businessName: 'Acme Holdings',
  accountName: 'Acme Account',
  dba: 'Acme Shop',
  website: 'https://acme.example/',
};

function copyInput(draftId: string, identity: Partial<RenewalAccountIdentity> = IDENTITY) {
  return {
    identity,
    outreachType: 'renewal' as const,
    draftId,
    subject: `Subject ${draftId}`,
    body: `Line one ${draftId}\nLine two`,
    copiedAt: NOW,
  };
}

function rawStore(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    accounts: [
      {
        id: 'account-1',
        identity: { ...IDENTITY, currentBalance: '$5,000', rawSalesforce: extra },
        cycles: [
          {
            id: 'cycle-1',
            outreachType: 'renewal',
            sentEmails: [
              {
                id: 'email-1',
                draftId: 'draft-1',
                subject: 'Hello',
                body: 'First line\nSecond line',
                copiedAt: NOW,
                recipients: ['private@example.com'],
                lenders: ['Nope'],
              },
            ],
            startedAt: NOW,
            updatedAt: NOW,
            percentagePaid: '99%',
          },
        ],
        activeCycleId: 'cycle-1',
        createdAt: NOW,
        updatedAt: NOW,
        eligibility: 'eligible',
      },
    ],
    ...extra,
  };
}

describe('renewalHistoryService', () => {
  it('reads absence and malformed values without writing', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set');
    expect(await loadRenewalHistory()).toEqual({ schemaVersion: 1, accounts: [] });
    await chrome.storage.local.set({ [RENEWAL_HISTORY_STORAGE_KEY]: 'bad' });
    set.mockClear();
    expect(await loadRenewalHistory()).toEqual({ schemaVersion: 1, accounts: [] });
    expect(set).not.toHaveBeenCalled();
  });

  it('normalizes known legacy data and strips every unknown or forbidden field', () => {
    const migrated = migrateRenewalHistory({ accounts: rawStore().accounts });
    const account = migrated.accounts[0];
    expect(Object.keys(account).sort()).toEqual(
      ['activeCycleId', 'createdAt', 'cycles', 'id', 'identity', 'updatedAt'].sort(),
    );
    expect(Object.keys(account.identity).sort()).toEqual(
      ['accountName', 'businessName', 'dba', 'merchantName', 'website'].sort(),
    );
    expect(Object.keys(account.cycles[0].sentEmails[0]).sort()).toEqual(
      ['body', 'copiedAt', 'draftId', 'id', 'subject'].sort(),
    );
    expect(account.cycles[0].sentEmails[0].body).toBe('First line\nSecond line');
  });

  it('rejects future versions and never overwrites them during a mutation', async () => {
    const future = { schemaVersion: 2, accounts: [], futureData: true };
    await chrome.storage.local.set({ [RENEWAL_HISTORY_STORAGE_KEY]: future });
    await expect(recordCopiedRenewalEmail(copyInput('draft-new'))).rejects.toMatchObject({
      code: 'future_version',
    });
    const stored = await chrome.storage.local.get(RENEWAL_HISTORY_STORAGE_KEY);
    expect(stored[RENEWAL_HISTORY_STORAGE_KEY]).toEqual(future);
  });

  it('rejects non-ISO dates and over-bound copy instead of truncating it', async () => {
    expect(
      migrateRenewalHistory({
        ...rawStore(),
        accounts: [{ ...(rawStore().accounts as object[])[0], updatedAt: '08/29/2026' }],
      }).accounts,
    ).toEqual([]);
    await expect(
      recordCopiedRenewalEmail({ ...copyInput('too-long'), body: 'x'.repeat(4_001) }),
    ).rejects.toMatchObject({ code: 'invalid_record' });
    expect((await loadRenewalHistory()).accounts).toEqual([]);
  });

  it('creates an account and active cycle only when an email is recorded', async () => {
    const result = await recordCopiedRenewalEmail(copyInput('draft-a'));
    expect(result.duplicate).toBe(false);
    expect(result.history.accounts).toHaveLength(1);
    const account = result.history.accounts[0];
    expect(account.identity).toEqual(IDENTITY);
    expect(account.activeCycleId).toBe(result.cycleId);
    expect(account.cycles[0].sentEmails[0]).toMatchObject({
      draftId: 'draft-a',
      body: 'Line one draft-a\nLine two',
    });
  });

  it('is globally idempotent by draftId before account resolution', async () => {
    const first = await recordCopiedRenewalEmail(copyInput('same-draft'));
    const second = await recordCopiedRenewalEmail({
      ...copyInput('same-draft', { merchantName: 'Different account' }),
      selectedAccountId: 'not-the-account',
    });
    expect(second.duplicate).toBe(true);
    expect(second.accountId).toBe(first.accountId);
    expect(second.history.accounts).toHaveLength(1);
    expect(second.history.accounts[0].cycles[0].sentEmails).toHaveLength(1);
  });

  it('serializes concurrent fallback-lock writes without losing records', async () => {
    await Promise.all([
      recordCopiedRenewalEmail(copyInput('draft-a')),
      recordCopiedRenewalEmail(copyInput('draft-b')),
    ]);
    const history = await loadRenewalHistory();
    expect(history.accounts).toHaveLength(1);
    expect(history.accounts[0].cycles[0].sentEmails.map((email) => email.draftId).sort()).toEqual([
      'draft-a',
      'draft-b',
    ]);
  });

  it('merges only non-empty selected-account identity fields', async () => {
    const first = await recordCopiedRenewalEmail(copyInput('draft-a'));
    await recordCopiedRenewalEmail({
      ...copyInput('draft-b', { merchantName: '', dba: 'New DBA', website: '' }),
      selectedAccountId: first.accountId,
    });
    const identity = (await loadRenewalHistory()).accounts[0].identity;
    expect(identity.merchantName).toBe(IDENTITY.merchantName);
    expect(identity.dba).toBe('New DBA');
    expect(identity.website).toBe(IDENTITY.website);
  });

  it('archives idempotently without creating an empty replacement cycle', async () => {
    const recorded = await recordCopiedRenewalEmail(copyInput('draft-a'));
    const archived = await archiveRenewalCycle(recorded.accountId, recorded.cycleId);
    expect(archived.accounts[0].activeCycleId).toBeUndefined();
    expect(archived.accounts[0].cycles).toHaveLength(1);
    expect(archived.accounts[0].cycles[0].archivedAt).toBeTruthy();
    const repeated = await archiveRenewalCycle(recorded.accountId, recorded.cycleId);
    expect(repeated).toEqual(archived);
  });

  it('deletes one account and clear removes only the Renewal key', async () => {
    const first = await recordCopiedRenewalEmail(copyInput('draft-a'));
    await recordCopiedRenewalEmail(copyInput('draft-b', { merchantName: 'Beta' }));
    await chrome.storage.local.set({ 'siderep.sentEmails': ['keep'] });
    const afterDelete = await deleteRenewalAccount(first.accountId);
    expect(afterDelete.accounts).toHaveLength(1);
    await clearRenewalHistory();
    expect(await loadRenewalHistory()).toEqual({ schemaVersion: 1, accounts: [] });
    expect((await chrome.storage.local.get('siderep.sentEmails'))['siderep.sentEmails']).toEqual([
      'keep',
    ]);
  });

  it('searches all account aliases case-insensitively but not website or email content', () => {
    const history = migrateRenewalHistory(rawStore()) as RenewalHistoryStore;
    expect(searchRenewalAccounts(history, 'acme account')).toHaveLength(1);
    expect(searchRenewalAccounts(history, 'SHOP')).toHaveLength(1);
    expect(searchRenewalAccounts(history, 'acme.example')).toHaveLength(0);
    expect(searchRenewalAccounts(history, 'first line')).toHaveLength(0);
  });

  it('retries quota writes after deterministic archived-cycle pruning', async () => {
    const first = await recordCopiedRenewalEmail(copyInput('draft-old'));
    await archiveRenewalCycle(first.accountId, first.cycleId);
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    const set = vi.spyOn(chrome.storage.local, 'set');
    set.mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded')).mockImplementation(originalSet);
    const saved = await recordCopiedRenewalEmail({
      ...copyInput('draft-new'),
      selectedAccountId: first.accountId,
    });
    expect(set).toHaveBeenCalledTimes(2);
    expect(saved.history.accounts[0].cycles).toHaveLength(1);
    expect(saved.history.accounts[0].cycles[0].sentEmails[0].draftId).toBe('draft-new');
  });

  it('surfaces a typed quota error rather than dropping an active email', async () => {
    const set = vi
      .spyOn(chrome.storage.local, 'set')
      .mockRejectedValue(new Error('quota exceeded'));
    const error = await recordCopiedRenewalEmail(copyInput('draft-a')).catch((value) => value);
    expect(error).toBeInstanceOf(RenewalHistorySaveError);
    expect(error).toMatchObject({ code: 'quota_exceeded' });
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('subscribes only to normalized Renewal local-storage changes', async () => {
    const callback = vi.fn();
    const unsubscribe = subscribeRenewalHistory(callback);
    await chrome.storage.local.set({ unrelated: true });
    expect(callback).not.toHaveBeenCalled();
    await chrome.storage.local.set({ [RENEWAL_HISTORY_STORAGE_KEY]: rawStore() });
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 1 }));
    unsubscribe();
    await chrome.storage.local.remove(RENEWAL_HISTORY_STORAGE_KEY);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
