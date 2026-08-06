import { buildBulkEmailMessages } from '@/prompts/bulkEmailPrompt';
import type { BulkEmailPromptInput } from '@/prompts/bulkEmailPrompt';
import type { BulkRecipient, BulkRunRecord, GeneratedEmail, Settings } from '@/types';
import { createId, err, ok } from '@/utils';
import type { Result } from '@/utils';

import type { AIService } from '@/services/ai/azureOpenAIService';
import type { EmailService } from '@/services/email/gmailService';
import { parseGeneratedEmail } from '@/services/email/emailGenerationService';

/**
 * Bulk send service.
 *
 * Two responsibilities, both privacy-preserving:
 *   1. `generateBulkEmail` — ask the AI for ONE generalized draft (no per-
 *      customer data) the rep reviews and edits before anything is sent.
 *   2. `sendBulkEmail`     — after explicit approval, send that one email to
 *      each selected recipient via the Gmail API, throttled and capped. It
 *      returns a METADATA-ONLY `BulkRunRecord` (counts/status/timing).
 *
 * Sending NEVER happens without the user's review + approval in the UI. No
 * recipient addresses, subjects, or bodies are persisted.
 */

/** Default upper bound on recipients per run (well under Gmail's daily limits). */
export const DEFAULT_PER_RUN_CAP = 200;
/** Delay between individual sends to stay friendly to Gmail's rate limits. */
export const DEFAULT_SEND_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Generates the one shared draft. `to` is intentionally left empty. */
export async function generateBulkEmail(
  ai: AIService,
  settings: Settings,
  input: BulkEmailPromptInput,
  signal?: AbortSignal,
): Promise<Result<GeneratedEmail>> {
  const messages = buildBulkEmailMessages(settings, input);
  const result = await ai.complete({
    messages,
    model: settings.ai.model,
    temperature: settings.ai.temperature,
    maxTokens: settings.ai.maxTokens,
    signal,
  });
  if (!result.ok) return err(result.error);
  return parseGeneratedEmail(result.value.content);
}

export interface BulkSendProgress {
  /** Recipients attempted so far (1-based as they complete). */
  completed: number;
  /** Total recipients that will be attempted this run. */
  total: number;
  /** Whether the just-completed send succeeded. */
  lastOk: boolean;
}

export interface BulkSendOptions {
  perRunCap?: number;
  sendDelayMs?: number;
  onProgress?: (progress: BulkSendProgress) => void;
  signal?: AbortSignal;
}

/**
 * Sends the approved shared email to each selected recipient, one message per
 * recipient (so no one sees another recipient's address). Returns a metadata-
 * only run record. `matched`/`skipped` describe the pre-approval filtering and
 * are passed in by the caller for the record.
 */
export async function sendBulkEmail(
  email: EmailService,
  draft: GeneratedEmail,
  recipients: BulkRecipient[],
  counts: { matched: number; skipped: number },
  options: BulkSendOptions = {},
): Promise<Result<BulkRunRecord>> {
  const cap = options.perRunCap ?? DEFAULT_PER_RUN_CAP;
  const gap = options.sendDelayMs ?? DEFAULT_SEND_DELAY_MS;
  const targets = recipients.filter((r) => r.selected).slice(0, cap);

  if (targets.length === 0) {
    return err(new Error('No recipients are selected. Select at least one to send.'));
  }
  if (!draft.body.trim()) {
    return err(new Error('The email body is empty. Draft the email before sending.'));
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    if (options.signal?.aborted) break;
    const recipient = targets[i];
    try {
      const result = await email.sendEmail({
        to: [recipient.email],
        subject: draft.subject,
        body: draft.body,
      });
      if (result.ok) succeeded++;
      else failed++;
      options.onProgress?.({ completed: i + 1, total: targets.length, lastOk: result.ok });
    } catch {
      failed++;
      options.onProgress?.({ completed: i + 1, total: targets.length, lastOk: false });
    }
    if (i < targets.length - 1 && gap > 0) await delay(gap);
  }

  const attempted = succeeded + failed;
  const status: BulkRunRecord['status'] =
    failed === 0 && attempted === targets.length
      ? 'complete'
      : succeeded === 0
        ? 'failed'
        : 'partial';

  const record: BulkRunRecord = {
    id: createId(),
    ranAt: new Date().toISOString(),
    matched: counts.matched,
    attempted,
    succeeded,
    failed,
    skipped: counts.skipped,
    status,
  };
  return ok(record);
}
