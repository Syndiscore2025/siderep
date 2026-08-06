import type { SentEmailRecord } from '@/types';
import { logger } from '@/utils';

/**
 * Sent-email history — SideRep's OWN artifact of emails it sent.
 *
 * This is the one deliberate exception to "never persist": it records emails we
 * generated and sent, NOT customer data. Raw Salesforce fields are never stored
 * here; fresh customer info is always re-read from the page when needed. Records
 * are capped to `MAX_RECORDS` (newest first) and can be cleared at any time.
 */

const STORAGE_KEY = 'siderep.sentEmails';
const MAX_RECORDS = 100;
const log = logger.scope('sent-history');

function storageArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null;
}

function normalize(raw: unknown): SentEmailRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is SentEmailRecord =>
      !!item && typeof item === 'object' && typeof (item as SentEmailRecord).id === 'string',
  );
}

export async function loadSentEmails(): Promise<SentEmailRecord[]> {
  const area = storageArea();
  if (!area) return [];
  try {
    const stored = await area.get(STORAGE_KEY);
    return normalize(stored?.[STORAGE_KEY]);
  } catch (error) {
    log.error('failed to load sent history', error);
    return [];
  }
}

export async function recordSentEmail(record: SentEmailRecord): Promise<void> {
  const area = storageArea();
  if (!area) return;
  try {
    const existing = await loadSentEmails();
    const next = [record, ...existing].slice(0, MAX_RECORDS);
    await area.set({ [STORAGE_KEY]: next });
  } catch (error) {
    log.error('failed to record sent email', error);
  }
}

export async function clearSentEmails(): Promise<void> {
  const area = storageArea();
  if (!area) return;
  try {
    await area.remove(STORAGE_KEY);
  } catch (error) {
    log.error('failed to clear sent history', error);
  }
}
