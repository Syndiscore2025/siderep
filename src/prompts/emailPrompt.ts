import { approvedFields } from '@/types';
import type { ExtractedCustomer, Settings } from '@/types';

import { buildSystemPrompt } from './systemPrompt';

/**
 * Builds the messages that ask the AI to fill the user's email template using
 * ONLY the approved customer fields, and to return a strict JSON object the
 * composer can parse. The template lives in settings; `{{placeholder}}` tokens
 * are resolved from the approved fields. No customer data is persisted here —
 * these fields come from the in-memory session.
 */
export function buildEmailMessages(
  settings: Settings,
  customer: ExtractedCustomer | null,
  instruction?: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const { subject, body } = settings.email.template;
  const fields = customer ? approvedFields(customer) : [];
  const fieldLines = fields.length
    ? fields.map((field) => `- ${field.label}: ${field.value}`).join('\n')
    : '(no approved fields — do not invent any customer facts)';

  const userLines = [
    'Write a sales email by filling in the template below.',
    'Replace every {{placeholder}} using ONLY the approved customer fields.',
    'If a placeholder has no matching approved field, use neutral phrasing instead of inventing data.',
    '',
    'TEMPLATE SUBJECT:',
    subject || '(no subject template — write a concise, relevant subject)',
    '',
    'TEMPLATE BODY:',
    body || '(no body template — write a concise, relevant email)',
    '',
    'APPROVED CUSTOMER FIELDS:',
    fieldLines,
  ];

  if (instruction && instruction.trim()) {
    userLines.push('', 'ADDITIONAL INSTRUCTIONS:', instruction.trim());
  }

  userLines.push(
    '',
    'Respond with ONLY a JSON object (no markdown, no prose) in exactly this shape:',
    '{"to": ["name@example.com"], "subject": "...", "body": "..."}',
    'Use an approved contact email address for "to" when one is available; otherwise use [].',
  );

  return [
    { role: 'system', content: buildSystemPrompt(settings, customer) },
    { role: 'user', content: userLines.join('\n') },
  ];
}
