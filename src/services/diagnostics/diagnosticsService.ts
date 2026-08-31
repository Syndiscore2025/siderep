import type { Settings } from '@/types';
import { isExtensionContext } from '@/utils/platform';
import { toError } from '@/utils';

import { createAIService } from '@/services/ai/openAIChatService';
import { createEmailService } from '@/services/email/gmailService';
import { createExtractionService } from '@/services/extraction/customerExtractionService';
import { platformStorage } from '@/services/storage/platformStorage';

/**
 * Connectivity diagnostics run on demand from Settings. Adapter storage and
 * OpenAI work on both platforms; Chrome-only integrations are skipped on web.
 * Nothing here persists customer data and every check returns a UI-safe result.
 */

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

/** Storage round-trip: proves config persistence works in this context. */
export async function checkStorage(): Promise<CheckResult> {
  const base = { id: 'storage', label: 'Local storage' };
  const probeKey = 'siderep.diagnostics.probe';
  try {
    await platformStorage.set(probeKey, Date.now());
    const read = await platformStorage.get(probeKey);
    await platformStorage.remove(probeKey);
    return read != null
      ? { ...base, status: 'pass', detail: 'Read/write round-trip succeeded.' }
      : { ...base, status: 'fail', detail: 'Wrote a value but could not read it back.' };
  } catch (error) {
    return { ...base, status: 'fail', detail: toError(error).message };
  }
}

/** OpenAI Assistant: minimal chat-completions probe using its saved credentials. */
export async function checkAssistantOpenAI(settings: Settings): Promise<CheckResult> {
  const base = { id: 'assistant-openai', label: 'OpenAI Assistant' };
  const ai = createAIService(settings);
  if (!ai.isConfigured()) {
    return { ...base, status: 'skip', detail: 'Add the Assistant API key and model in Settings.' };
  }
  const result = await ai.testConnection();
  return result.ok
    ? { ...base, status: 'pass', detail: 'Chat completions endpoint reachable.' }
    : { ...base, status: 'fail', detail: result.error.message };
}

/** Gmail: OAuth token + an authenticated profile GET (skipped unless needed). */
export async function checkGmail(settings: Settings): Promise<CheckResult> {
  const base = { id: 'gmail', label: 'Gmail API' };
  if (!isExtensionContext()) {
    return {
      ...base,
      status: 'skip',
      detail: 'Extension-only check. Web uses Gmail compose and does not request Google access.',
    };
  }
  if (settings.email.deliveryMode !== 'gmail_api') {
    return {
      ...base,
      status: 'skip',
      detail: `Not required for the "${settings.email.deliveryMode}" delivery mode.`,
    };
  }
  const auth = await createEmailService(settings).authorize(true);
  if (!auth.ok) return { ...base, status: 'fail', detail: auth.error.message };
  try {
    const res = await fetch(GMAIL_PROFILE_URL, {
      headers: { Authorization: `Bearer ${auth.value}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return {
        ...base,
        status: 'fail',
        detail: `Gmail API returned ${res.status}. ${detail.slice(0, 120)}`,
      };
    }
    const profile = (await res.json()) as { emailAddress?: string };
    return {
      ...base,
      status: 'pass',
      detail: `Authorized as ${profile.emailAddress ?? 'the connected account'}.`,
    };
  } catch (error) {
    return { ...base, status: 'fail', detail: toError(error).message };
  }
}

/** Salesforce: attempts to read the active tab via the content script. */
export async function checkSalesforce(): Promise<CheckResult> {
  const base = { id: 'salesforce', label: 'Salesforce extraction' };
  if (!isExtensionContext()) {
    return {
      ...base,
      status: 'skip',
      detail: 'Extension-only check. Paste customer fields manually in the web app.',
    };
  }
  try {
    const result = await createExtractionService().extractActiveCustomer();
    if (!result.ok) return { ...base, status: 'fail', detail: result.error.message };
    const source = result.value.fields[0]?.source;
    return source === 'sample'
      ? { ...base, status: 'skip', detail: 'Off a Salesforce record — returned the sample.' }
      : {
          ...base,
          status: 'pass',
          detail: `Read ${result.value.fields.length} field(s) from the page.`,
        };
  } catch (error) {
    return { ...base, status: 'fail', detail: toError(error).message };
  }
}

/** Runs every check. Failures are captured as results, never thrown. */
export async function runDiagnostics(settings: Settings): Promise<CheckResult[]> {
  return Promise.all([
    checkStorage(),
    checkAssistantOpenAI(settings),
    checkGmail(settings),
    checkSalesforce(),
  ]);
}
