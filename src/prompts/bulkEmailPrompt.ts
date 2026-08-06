import type { Settings } from '@/types';

import { buildSystemPrompt } from './systemPrompt';

/**
 * Builds the messages that ask the AI to draft ONE generalized email to send to
 * many active accounts from a Salesforce report. Unlike the single-record
 * prompt, there is no per-customer context: the same subject/body goes to every
 * approved recipient, so the AI must NOT reference any individual account's
 * facts and must use a neutral greeting (e.g. "Hello,").
 *
 * The rep describes, in plain language, what the campaign is for and what kind
 * of email they want. No customer data is included or persisted here.
 */
export interface BulkEmailPromptInput {
  /** What the rep is looking for, in their words (e.g. "active performing accounts"). */
  criteria: string;
  /** The kind of email to write (e.g. "a friendly quarterly check-in"). */
  emailType: string;
  /** How many recipients the email will go to, for the AI's awareness. */
  recipientCount: number;
}

export function buildBulkEmailMessages(
  settings: Settings,
  input: BulkEmailPromptInput,
): Array<{ role: 'system' | 'user'; content: string }> {
  const { criteria, emailType, recipientCount } = input;

  const userLines = [
    'Draft ONE generalized sales email that will be sent, unchanged, to multiple',
    `accounts from a Salesforce report (about ${recipientCount} recipient(s)).`,
    '',
    'Because the SAME email goes to everyone:',
    '- Do NOT reference any specific account, person, balance, or amount.',
    '- Do NOT invent customer facts.',
    '- Use a neutral greeting such as "Hello," (no personalized name).',
    '- Keep it concise, professional, and relevant to the campaign described.',
    '',
    'CAMPAIGN — who these accounts are (the rep\'s words):',
    criteria.trim() || '(active accounts selected by the rep)',
    '',
    'EMAIL TYPE — what the rep wants written:',
    emailType.trim() || '(a concise, relevant outreach email)',
    '',
    'Respond with ONLY a JSON object (no markdown, no prose) in exactly this shape:',
    '{"subject": "...", "body": "..."}',
    'Leave "to" out entirely — recipients are added by the app after review.',
  ];

  return [
    { role: 'system', content: buildSystemPrompt(settings, null) },
    { role: 'user', content: userLines.join('\n') },
  ];
}
