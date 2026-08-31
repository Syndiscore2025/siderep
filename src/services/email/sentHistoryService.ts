import { EMAIL_DELIVERY_MODES } from '@/types';
import type { SentEmailRecord } from '@/types';
import { logger } from '@/utils';

import { platformStorage } from '@/services/storage/platformStorage';

/**
 * Sent-email history — SideRep's OWN artifact of emails it sent.
 *
 * This service stores the Email tool's sent artifacts, not raw Salesforce field
 * payloads. Records are capped to `MAX_RECORDS` (newest first) and can be cleared
 * at any time. Renewal copied-email history is separate and uses its own key.
 */

const STORAGE_KEY = 'siderep.sentEmails';
const MAX_RECORDS = 100;
const log = logger.scope('sent-history');

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

function isDeliveryMode(value: unknown): value is SentEmailRecord['deliveryMode'] {
  return EMAIL_DELIVERY_MODES.some((mode) => mode === value);
}

function normalizeRecord(value: unknown): SentEmailRecord | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const to = raw.to;
  if (
    typeof raw.id !== 'string' ||
    !raw.id ||
    !Array.isArray(to) ||
    !to.every((recipient): recipient is string => typeof recipient === 'string') ||
    typeof raw.subject !== 'string' ||
    typeof raw.body !== 'string' ||
    !isDeliveryMode(raw.deliveryMode) ||
    !isIsoDate(raw.sentAt) ||
    (raw.messageId !== undefined && typeof raw.messageId !== 'string') ||
    (raw.threadId !== undefined && typeof raw.threadId !== 'string')
  ) {
    return null;
  }
  return {
    id: raw.id,
    to: [...to],
    subject: raw.subject,
    body: raw.body,
    deliveryMode: raw.deliveryMode,
    ...(typeof raw.messageId === 'string' ? { messageId: raw.messageId } : {}),
    ...(typeof raw.threadId === 'string' ? { threadId: raw.threadId } : {}),
    sentAt: raw.sentAt,
  };
}

function normalize(raw: unknown): SentEmailRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRecord).filter((record): record is SentEmailRecord => record !== null);
}

export async function loadSentEmails(): Promise<SentEmailRecord[]> {
  try {
    return normalize(await platformStorage.get(STORAGE_KEY));
  } catch (error) {
    log.error('failed to load sent history', error);
    return [];
  }
}

export async function recordSentEmail(record: SentEmailRecord): Promise<void> {
  try {
    const normalized = normalizeRecord(record);
    if (!normalized) return;
    const existing = await loadSentEmails();
    const next = [normalized, ...existing].slice(0, MAX_RECORDS);
    await platformStorage.set(STORAGE_KEY, next);
  } catch (error) {
    log.error('failed to record sent email', error);
  }
}

export async function clearSentEmails(): Promise<void> {
  try {
    await platformStorage.remove(STORAGE_KEY);
  } catch (error) {
    log.error('failed to clear sent history', error);
  }
}
