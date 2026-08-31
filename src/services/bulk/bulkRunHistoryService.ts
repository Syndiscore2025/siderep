import { EMAIL_DELIVERY_MODES } from '@/types';
import type { BulkRunRecord } from '@/types';
import { logger } from '@/utils';

import { platformStorage } from '@/services/storage/platformStorage';

/**
 * Bulk-run history — METADATA ONLY.
 *
 * This records that a bulk action happened and how it went: counts, status, and
 * timing. It stores NO customer data — no recipients, subjects, or bodies are
 * ever persisted here. Records are capped (newest first) and can be cleared.
 */

const STORAGE_KEY = 'siderep.bulkRuns';
const MAX_RECORDS = 50;
const log = logger.scope('bulk-history');

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isDeliveryMode(value: unknown): value is NonNullable<BulkRunRecord['deliveryMode']> {
  return EMAIL_DELIVERY_MODES.some((mode) => mode === value);
}

function normalizeRecord(value: unknown): BulkRunRecord | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const { matched, attempted, succeeded, failed, skipped } = raw;
  if (
    typeof raw.id !== 'string' ||
    !raw.id ||
    !isIsoDate(raw.ranAt) ||
    !isCount(matched) ||
    !isCount(attempted) ||
    !isCount(succeeded) ||
    !isCount(failed) ||
    !isCount(skipped) ||
    (raw.status !== 'complete' && raw.status !== 'partial' && raw.status !== 'failed') ||
    (raw.action !== undefined && raw.action !== 'sent' && raw.action !== 'prepared') ||
    (raw.deliveryMode !== undefined && !isDeliveryMode(raw.deliveryMode))
  ) {
    return null;
  }
  return {
    id: raw.id,
    ...(raw.action === 'sent' || raw.action === 'prepared' ? { action: raw.action } : {}),
    ...(isDeliveryMode(raw.deliveryMode) ? { deliveryMode: raw.deliveryMode } : {}),
    ranAt: raw.ranAt,
    matched,
    attempted,
    succeeded,
    failed,
    skipped,
    status: raw.status,
  };
}

function normalize(raw: unknown): BulkRunRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRecord).filter((record): record is BulkRunRecord => record !== null);
}

export async function loadBulkRuns(): Promise<BulkRunRecord[]> {
  try {
    return normalize(await platformStorage.get(STORAGE_KEY));
  } catch (error) {
    log.error('failed to load bulk history', error);
    return [];
  }
}

export async function recordBulkRun(record: BulkRunRecord): Promise<void> {
  try {
    const normalized = normalizeRecord(record);
    if (!normalized) return;
    const existing = await loadBulkRuns();
    const next = [normalized, ...existing].slice(0, MAX_RECORDS);
    await platformStorage.set(STORAGE_KEY, next);
  } catch (error) {
    log.error('failed to record bulk run', error);
  }
}

export async function clearBulkRuns(): Promise<void> {
  try {
    await platformStorage.remove(STORAGE_KEY);
  } catch (error) {
    log.error('failed to clear bulk history', error);
  }
}
