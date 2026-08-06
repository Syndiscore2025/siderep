import { buildEmailMessages } from '@/prompts';
import type { ExtractedCustomer, GeneratedEmail, Settings } from '@/types';
import { err, ok, toError } from '@/utils';
import type { Result } from '@/utils';

import type { AIService } from '@/services/ai/azureOpenAIService';

/**
 * Email generation — turns the user's template + approved customer fields into a
 * reviewable draft via the AI service. The AI is asked to return strict JSON;
 * `parseGeneratedEmail` tolerates code fences and surrounding prose.
 */

/** Extracts and validates a `GeneratedEmail` from a raw model response. */
export function parseGeneratedEmail(raw: string): Result<GeneratedEmail> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return err(new Error('The AI did not return a usable email. Please try again.'));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    return err(toError(error));
  }

  if (!parsed || typeof parsed !== 'object') {
    return err(new Error('The AI response was not a valid email object.'));
  }

  const obj = parsed as Record<string, unknown>;
  const subject = typeof obj.subject === 'string' ? obj.subject : '';
  const body = typeof obj.body === 'string' ? obj.body : '';
  const to = Array.isArray(obj.to)
    ? obj.to.filter((value): value is string => typeof value === 'string')
    : [];

  if (!body.trim()) {
    return err(new Error('The generated email had no body. Please try again.'));
  }

  return ok({ to, subject, body });
}

/** Generates an email draft from the active template and approved fields. */
export async function generateEmail(
  ai: AIService,
  settings: Settings,
  customer: ExtractedCustomer | null,
  instruction?: string,
  signal?: AbortSignal,
): Promise<Result<GeneratedEmail>> {
  const messages = buildEmailMessages(settings, customer, instruction);
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
