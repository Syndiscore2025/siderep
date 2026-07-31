import { approvedFields } from '@/types';
import type { ExtractedCustomer, Settings } from '@/types';

/**
 * Builds the system prompt for the active customer session.
 *
 * Only fields the user explicitly approved are ever included — this function
 * is the single gate through which customer context reaches the AI.
 */
export function buildSystemPrompt(settings: Settings, customer: ExtractedCustomer | null): string {
  const lines: string[] = [
    'You are SideRep, an AI sales assistant working alongside a sales rep in their browser.',
    'You help draft emails, summarize accounts, prepare talking points, and suggest next actions.',
    `Write in a ${settings.prompts.defaultTone} tone unless the user asks otherwise.`,
  ];

  if (settings.prompts.customInstructions.trim()) {
    lines.push(settings.prompts.customInstructions.trim());
  }

  if (settings.prompts.signature.trim()) {
    lines.push(`When drafting emails, sign them as:\n${settings.prompts.signature.trim()}`);
  }

  if (customer) {
    const fields = approvedFields(customer).map((field) => `- ${field.label}: ${field.value}`);
    if (fields.length > 0) {
      lines.push(
        '',
        'Customer context (fields the user explicitly approved from their screen):',
        `Record: ${customer.displayName}${customer.recordType ? ` (${customer.recordType})` : ''}`,
        ...fields,
      );
    }
  }

  lines.push(
    '',
    'Never invent customer facts that are not in the approved context.',
    'Never claim an email was sent — the user always reviews and sends manually.',
  );

  return lines.join('\n');
}
