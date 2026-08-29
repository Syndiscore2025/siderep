import {
  normalizeRenewalString,
  normalizeRenewalUrl,
} from '@/services/extraction/renewalFieldMapper';
import type {
  RenewalAccountIdentity,
  RenewalAccountRecord,
  RenewalCycleRecord,
  RenewalHistoryStore,
  RenewalOutreachType,
  RenewalSentEmailRecord,
} from '@/types';
import { createId, logger } from '@/utils';

export const RENEWAL_HISTORY_STORAGE_KEY = 'siderep.renewalHistory';
export const MAX_RENEWAL_ACCOUNTS = 500;
export const MAX_RENEWAL_SEARCH_RESULTS = 50;
export const MAX_RENEWAL_HISTORY_BYTES = 8 * 1024 * 1024;
const MAX_CYCLES_PER_ACCOUNT = 100;
const MAX_EMAILS_PER_CYCLE = 1_000;
const MAX_ID_LENGTH = 200;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 4_000;
const LOCK_NAME = 'siderep.renewalHistory.lock';
const log = logger.scope('renewal-history');

export class RenewalHistorySaveError extends Error {
  readonly code: 'invalid_record' | 'storage_unavailable' | 'quota_exceeded' | 'future_version';

  constructor(code: RenewalHistorySaveError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RenewalHistorySaveError';
    this.code = code;
  }
}

export interface RecordCopiedRenewalEmailInput {
  selectedAccountId?: string;
  identity: Partial<RenewalAccountIdentity>;
  outreachType: RenewalOutreachType;
  draftId: string;
  subject: string;
  body: string;
  copiedAt?: string;
}

export interface RecordCopiedRenewalEmailResult {
  history: RenewalHistoryStore;
  accountId: string;
  cycleId: string;
  email: RenewalSentEmailRecord;
  duplicate: boolean;
}

const emptyHistory = (): RenewalHistoryStore => ({ schemaVersion: 1, accounts: [] });

function storageArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean && clean.length <= MAX_ID_LENGTH && /^[A-Za-z0-9._:-]+$/.test(clean)
    ? clean
    : undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeEmailText(
  value: unknown,
  maxLength: number,
  preserveLines: boolean,
): string | undefined {
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  const clean = [...value.replace(/\r\n?/g, '\n')]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127 ? true : preserveLines && character === '\n';
    })
    .join('');
  return preserveLines ? clean : clean.replace(/\s+/g, ' ').trim();
}

function normalizeIdentity(value: unknown): RenewalAccountIdentity {
  const raw = recordOf(value) ?? {};
  return {
    merchantName: normalizeRenewalString(raw.merchantName),
    businessName: normalizeRenewalString(raw.businessName),
    accountName: normalizeRenewalString(raw.accountName),
    dba: normalizeRenewalString(raw.dba),
    website: normalizeRenewalUrl(raw.website) ?? '',
  };
}

function normalizeEmail(value: unknown): RenewalSentEmailRecord | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const id = normalizeId(raw.id);
  const draftId = normalizeId(raw.draftId);
  const subject = normalizeEmailText(raw.subject, MAX_SUBJECT_LENGTH, false);
  const body = normalizeEmailText(raw.body, MAX_BODY_LENGTH, true);
  const copiedAt = normalizeDate(raw.copiedAt);
  return id && draftId && subject !== undefined && body !== undefined && copiedAt
    ? { id, draftId, subject, body, copiedAt }
    : null;
}

function normalizeCycle(value: unknown): RenewalCycleRecord | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const id = normalizeId(raw.id);
  const outreachType = raw.outreachType;
  const startedAt = normalizeDate(raw.startedAt);
  const updatedAt = normalizeDate(raw.updatedAt);
  const archivedAt = raw.archivedAt === undefined ? undefined : normalizeDate(raw.archivedAt);
  const sentEmails = Array.isArray(raw.sentEmails)
    ? raw.sentEmails.map(normalizeEmail).filter((email): email is RenewalSentEmailRecord => !!email)
    : [];
  if (
    !id ||
    (outreachType !== 'renewal' && outreachType !== 'add_on') ||
    !startedAt ||
    !updatedAt ||
    (raw.archivedAt !== undefined && !archivedAt) ||
    !sentEmails.length
  ) {
    return null;
  }
  return {
    id,
    outreachType,
    sentEmails: sentEmails.slice(-MAX_EMAILS_PER_CYCLE),
    startedAt,
    updatedAt,
    ...(archivedAt ? { archivedAt } : {}),
  };
}

function normalizeAccount(value: unknown): RenewalAccountRecord | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const id = normalizeId(raw.id);
  const createdAt = normalizeDate(raw.createdAt);
  const updatedAt = normalizeDate(raw.updatedAt);
  if (!id || !createdAt || !updatedAt) return null;
  const cycles = (Array.isArray(raw.cycles) ? raw.cycles : [])
    .map(normalizeCycle)
    .filter((cycle): cycle is RenewalCycleRecord => !!cycle)
    .slice(-MAX_CYCLES_PER_ACCOUNT);
  const requestedActiveId = normalizeId(raw.activeCycleId);
  const activeCycle = cycles.find(
    (cycle) => cycle.id === requestedActiveId && cycle.archivedAt === undefined,
  );
  return {
    id,
    identity: normalizeIdentity(raw.identity),
    cycles,
    ...(activeCycle ? { activeCycleId: activeCycle.id } : {}),
    createdAt,
    updatedAt,
  };
}

/** Normalizes known unversioned and v1 data. Future versions are rejected. */
export function migrateRenewalHistory(raw: unknown): RenewalHistoryStore {
  if (raw == null) return emptyHistory();
  const source = Array.isArray(raw) ? { accounts: raw } : recordOf(raw);
  if (!source) return emptyHistory();
  if (typeof source.schemaVersion === 'number' && source.schemaVersion > 1) {
    throw new RenewalHistorySaveError(
      'future_version',
      'Renewal history was saved by a newer version.',
    );
  }
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) return emptyHistory();
  const accounts = (Array.isArray(source.accounts) ? source.accounts : [])
    .map(normalizeAccount)
    .filter((account): account is RenewalAccountRecord => !!account)
    .slice(-MAX_RENEWAL_ACCOUNTS);
  return { schemaVersion: 1, accounts };
}

async function readRaw(area: chrome.storage.StorageArea): Promise<unknown> {
  const stored = await area.get(RENEWAL_HISTORY_STORAGE_KEY);
  return stored?.[RENEWAL_HISTORY_STORAGE_KEY];
}

export async function loadRenewalHistory(): Promise<RenewalHistoryStore> {
  const area = storageArea();
  if (!area) return emptyHistory();
  try {
    return migrateRenewalHistory(await readRaw(area));
  } catch (error) {
    log.error('failed to load renewal history', error);
    return emptyHistory();
  }
}

let lockQueue: Promise<void> = Promise.resolve();

function fallbackLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = lockQueue.then(operation, operation);
  lockQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function withRenewalHistoryLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(LOCK_NAME, operation) : fallbackLock(operation);
}

function serializedBytes(history: RenewalHistoryStore): number {
  return new TextEncoder().encode(JSON.stringify(history)).byteLength;
}

function oldestArchivedCycle(
  history: RenewalHistoryStore,
): { accountIndex: number; cycleIndex: number } | null {
  let candidate: { accountIndex: number; cycleIndex: number; time: number } | null = null;
  history.accounts.forEach((account, accountIndex) => {
    account.cycles.forEach((cycle, cycleIndex) => {
      if (!cycle.archivedAt) return;
      const time = Date.parse(cycle.archivedAt);
      if (!candidate || time < candidate.time) candidate = { accountIndex, cycleIndex, time };
    });
  });
  return candidate;
}

function pruneOne(history: RenewalHistoryStore): boolean {
  const archived = oldestArchivedCycle(history);
  if (archived) {
    history.accounts[archived.accountIndex].cycles.splice(archived.cycleIndex, 1);
    return true;
  }
  const candidates = history.accounts
    .map((account, index) => ({ account, index }))
    .filter(({ account }) => !account.activeCycleId)
    .sort(
      (left, right) => Date.parse(left.account.updatedAt) - Date.parse(right.account.updatedAt),
    );
  if (!candidates.length) return false;
  history.accounts.splice(candidates[0].index, 1);
  return true;
}

function pruneToBytes(history: RenewalHistoryStore, target: number): boolean {
  while (serializedBytes(history) > target) {
    if (!pruneOne(history)) return false;
  }
  return true;
}

function enforceCollectionBounds(history: RenewalHistoryStore): boolean {
  for (const account of history.accounts) {
    while (account.cycles.length > MAX_CYCLES_PER_ACCOUNT) {
      const archived = account.cycles
        .map((cycle, index) => ({ cycle, index }))
        .filter(({ cycle }) => !!cycle.archivedAt)
        .sort(
          (left, right) => Date.parse(left.cycle.archivedAt!) - Date.parse(right.cycle.archivedAt!),
        )[0];
      if (!archived) return false;
      account.cycles.splice(archived.index, 1);
    }
    const active = account.cycles.find((cycle) => cycle.id === account.activeCycleId);
    if (active && active.sentEmails.length > MAX_EMAILS_PER_CYCLE) return false;
  }
  while (history.accounts.length > MAX_RENEWAL_ACCOUNTS) {
    if (!pruneOne(history)) return false;
  }
  return true;
}

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|QUOTA_BYTES/i.test(message);
}

async function commitWithQuotaRetry(
  area: chrome.storage.StorageArea,
  history: RenewalHistoryStore,
): Promise<void> {
  if (!enforceCollectionBounds(history) || !pruneToBytes(history, MAX_RENEWAL_HISTORY_BYTES)) {
    throw new RenewalHistorySaveError(
      'quota_exceeded',
      'The active Renewal history is too large to save.',
    );
  }
  try {
    await area.set({ [RENEWAL_HISTORY_STORAGE_KEY]: history });
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const retryTarget = Math.max(0, Math.floor(serializedBytes(history) * 0.75));
    if (!pruneToBytes(history, retryTarget)) {
      throw new RenewalHistorySaveError(
        'quota_exceeded',
        'The active Renewal history is too large to save.',
        {
          cause: error,
        },
      );
    }
    try {
      await area.set({ [RENEWAL_HISTORY_STORAGE_KEY]: history });
    } catch (retryError) {
      throw new RenewalHistorySaveError(
        'quota_exceeded',
        'Renewal history storage quota was exceeded.',
        {
          cause: retryError,
        },
      );
    }
  }
}

function findDraft(history: RenewalHistoryStore, draftId: string) {
  for (const account of history.accounts) {
    for (const cycle of account.cycles) {
      const email = cycle.sentEmails.find((entry) => entry.draftId === draftId);
      if (email) return { account, cycle, email };
    }
  }
  return undefined;
}

function identityMatch(account: RenewalAccountRecord, identity: RenewalAccountIdentity): boolean {
  const fields: Array<keyof RenewalAccountIdentity> = [
    'merchantName',
    'businessName',
    'accountName',
    'dba',
    'website',
  ];
  return fields.some((field) => {
    const left = account.identity[field].toLocaleLowerCase();
    const right = identity[field].toLocaleLowerCase();
    return Boolean(left && right && left === right);
  });
}

function mergedIdentity(
  current: RenewalAccountIdentity,
  incoming: RenewalAccountIdentity,
): RenewalAccountIdentity {
  return {
    merchantName: incoming.merchantName || current.merchantName,
    businessName: incoming.businessName || current.businessName,
    accountName: incoming.accountName || current.accountName,
    dba: incoming.dba || current.dba,
    website: incoming.website || current.website,
  };
}

export async function recordCopiedRenewalEmail(
  input: RecordCopiedRenewalEmailInput,
): Promise<RecordCopiedRenewalEmailResult> {
  return withRenewalHistoryLock(async () => {
    const area = storageArea();
    if (!area)
      throw new RenewalHistorySaveError('storage_unavailable', 'Local storage is unavailable.');
    const history = migrateRenewalHistory(await readRaw(area));
    const draftId = normalizeId(input.draftId);
    const copiedAt = normalizeDate(input.copiedAt ?? new Date().toISOString());
    const subject = normalizeEmailText(input.subject, MAX_SUBJECT_LENGTH, false);
    const body = normalizeEmailText(input.body, MAX_BODY_LENGTH, true);
    if (
      !draftId ||
      !copiedAt ||
      subject === undefined ||
      body === undefined ||
      !['renewal', 'add_on'].includes(input.outreachType)
    ) {
      throw new RenewalHistorySaveError(
        'invalid_record',
        'The copied email could not be safely stored.',
      );
    }
    const duplicate = findDraft(history, draftId);
    if (duplicate) {
      return {
        history,
        accountId: duplicate.account.id,
        cycleId: duplicate.cycle.id,
        email: duplicate.email,
        duplicate: true,
      };
    }

    const identity = normalizeIdentity(input.identity);
    const selectedId = normalizeId(input.selectedAccountId);
    let account = history.accounts.find((candidate) => candidate.id === selectedId);
    account ??= history.accounts.find((candidate) => identityMatch(candidate, identity));
    if (!account) {
      account = {
        id: createId(),
        identity,
        cycles: [],
        createdAt: copiedAt,
        updatedAt: copiedAt,
      };
      history.accounts.push(account);
    } else {
      account.identity = mergedIdentity(account.identity, identity);
      account.updatedAt = copiedAt;
    }

    let cycle = account.cycles.find(
      (candidate) => candidate.id === account.activeCycleId && !candidate.archivedAt,
    );
    if (!cycle) {
      cycle = {
        id: createId(),
        outreachType: input.outreachType,
        sentEmails: [],
        startedAt: copiedAt,
        updatedAt: copiedAt,
      };
      account.cycles.push(cycle);
      account.activeCycleId = cycle.id;
    }
    const email: RenewalSentEmailRecord = {
      id: createId(),
      draftId,
      subject,
      body,
      copiedAt,
    };
    cycle.sentEmails.push(email);
    cycle.updatedAt = copiedAt;
    await commitWithQuotaRetry(area, history);
    return { history, accountId: account.id, cycleId: cycle.id, email, duplicate: false };
  });
}

export async function archiveRenewalCycle(
  accountId: string,
  expectedCycleId: string,
): Promise<RenewalHistoryStore> {
  return withRenewalHistoryLock(async () => {
    const area = storageArea();
    if (!area)
      throw new RenewalHistorySaveError('storage_unavailable', 'Local storage is unavailable.');
    const history = migrateRenewalHistory(await readRaw(area));
    const account = history.accounts.find((candidate) => candidate.id === normalizeId(accountId));
    if (!account || account.activeCycleId !== normalizeId(expectedCycleId)) return history;
    const cycle = account.cycles.find((candidate) => candidate.id === account.activeCycleId);
    if (!cycle || cycle.archivedAt) return history;
    const archivedAt = new Date().toISOString();
    cycle.archivedAt = archivedAt;
    cycle.updatedAt = archivedAt;
    account.updatedAt = archivedAt;
    delete account.activeCycleId;
    await commitWithQuotaRetry(area, history);
    return history;
  });
}

export async function deleteRenewalAccount(accountId: string): Promise<RenewalHistoryStore> {
  return withRenewalHistoryLock(async () => {
    const area = storageArea();
    if (!area)
      throw new RenewalHistorySaveError('storage_unavailable', 'Local storage is unavailable.');
    const history = migrateRenewalHistory(await readRaw(area));
    const next = history.accounts.filter((account) => account.id !== normalizeId(accountId));
    if (next.length === history.accounts.length) return history;
    history.accounts = next;
    await commitWithQuotaRetry(area, history);
    return history;
  });
}

export async function clearRenewalHistory(): Promise<RenewalHistoryStore> {
  return withRenewalHistoryLock(async () => {
    const area = storageArea();
    if (!area)
      throw new RenewalHistorySaveError('storage_unavailable', 'Local storage is unavailable.');
    await area.remove(RENEWAL_HISTORY_STORAGE_KEY);
    return emptyHistory();
  });
}

export function searchRenewalAccounts(
  history: RenewalHistoryStore,
  query: string,
): RenewalAccountRecord[] {
  const term = normalizeRenewalString(query).toLocaleLowerCase();
  const accounts = [...history.accounts].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
  if (!term) return accounts.slice(0, MAX_RENEWAL_SEARCH_RESULTS);
  return accounts
    .filter((account) =>
      [
        account.identity.merchantName,
        account.identity.businessName,
        account.identity.accountName,
        account.identity.dba,
      ].some((value) => value.toLocaleLowerCase().includes(term)),
    )
    .slice(0, MAX_RENEWAL_SEARCH_RESULTS);
}

export function subscribeRenewalHistory(
  callback: (history: RenewalHistoryStore) => void,
): () => void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return () => {};
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local' || !(RENEWAL_HISTORY_STORAGE_KEY in changes)) return;
    try {
      callback(migrateRenewalHistory(changes[RENEWAL_HISTORY_STORAGE_KEY]?.newValue));
    } catch (error) {
      log.error('ignored unsupported renewal history change', error);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
