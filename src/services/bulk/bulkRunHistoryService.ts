import type { BulkRunRecord } from '@/types';
import { logger } from '@/utils';

/**
 * Bulk-run history — METADATA ONLY.
 *
 * This records that a bulk send happened and how it went: counts, status, and
 * timing. It stores NO customer data — no recipients, subjects, or bodies are
 * ever persisted here. Records are capped (newest first) and can be cleared.
 */

const STORAGE_KEY = 'siderep.bulkRuns';
const MAX_RECORDS = 50;
const log = logger.scope('bulk-history');

function storageArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null;
}

function normalize(raw: unknown): BulkRunRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is BulkRunRecord =>
      !!item && typeof item === 'object' && typeof (item as BulkRunRecord).id === 'string',
  );
}

export async function loadBulkRuns(): Promise<BulkRunRecord[]> {
  const area = storageArea();
  if (!area) return [];
  try {
    const stored = await area.get(STORAGE_KEY);
    return normalize(stored?.[STORAGE_KEY]);
  } catch (error) {
    log.error('failed to load bulk history', error);
    return [];
  }
}

export async function recordBulkRun(record: BulkRunRecord): Promise<void> {
  const area = storageArea();
  if (!area) return;
  try {
    const existing = await loadBulkRuns();
    const next = [record, ...existing].slice(0, MAX_RECORDS);
    await area.set({ [STORAGE_KEY]: next });
  } catch (error) {
    log.error('failed to record bulk run', error);
  }
}

export async function clearBulkRuns(): Promise<void> {
  const area = storageArea();
  if (!area) return;
  try {
    await area.remove(STORAGE_KEY);
  } catch (error) {
    log.error('failed to clear bulk history', error);
  }
}
