import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';
import type { Settings } from '@/types';
import type * as CustomerExtractionModule from '@/services/extraction/customerExtractionService';
import type * as GmailModule from '@/services/email/gmailService';

import {
  checkAssistantOpenAI,
  checkGmail,
  checkSalesforce,
  checkStorage,
} from './diagnosticsService';

const mocks = vi.hoisted(() => ({
  extension: true,
  emailFactory: vi.fn(),
  extractionFactory: vi.fn(),
}));
vi.mock('@/utils/platform', () => ({ isExtensionContext: () => mocks.extension }));
vi.mock('@/services/email/gmailService', async (importOriginal) => ({
  ...(await importOriginal<typeof GmailModule>()),
  createEmailService: mocks.emailFactory,
}));
vi.mock('@/services/extraction/customerExtractionService', async (importOriginal) => ({
  ...(await importOriginal<typeof CustomerExtractionModule>()),
  createExtractionService: mocks.extractionFactory,
}));

const CONFIGURED_ASSISTANT: Settings = {
  ...DEFAULT_SETTINGS,
  assistantAI: { apiKey: 'test-assistant-key', model: 'gpt-4o-mini' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  mocks.extension = true;
  mocks.emailFactory.mockReset();
  mocks.extractionFactory.mockReset();
  vi.restoreAllMocks();
});

describe('checkStorage', () => {
  it('passes a read/write round-trip and cleans up the probe key', async () => {
    const result = await checkStorage();
    expect(result.status).toBe('pass');
    const leftover = await chrome.storage.local.get('siderep.diagnostics.probe');
    expect(leftover['siderep.diagnostics.probe']).toBeUndefined();
  });
});

describe('checkAssistantOpenAI', () => {
  it('skips when the OpenAI Assistant is not configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await checkAssistantOpenAI(DEFAULT_SETTINGS);
    expect(result.status).toBe('skip');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes when the completions probe succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'OK' } }] }),
    );
    const result = await checkAssistantOpenAI(CONFIGURED_ASSISTANT);
    expect(result.status).toBe('pass');
  });

  it('fails and surfaces the error when the endpoint rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: { message: 'bad' } }, 401),
    );
    const result = await checkAssistantOpenAI(CONFIGURED_ASSISTANT);
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('401');
  });
});

describe('checkGmail', () => {
  it('skips when the delivery mode does not need the Gmail API', async () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      email: { ...DEFAULT_SETTINGS.email, deliveryMode: 'gmail_compose_url' },
    };
    const result = await checkGmail(settings);
    expect(result.status).toBe('skip');
    expect(result.detail).toContain('gmail_compose_url');
  });

  it('skips before creating an OAuth service on web', async () => {
    mocks.extension = false;
    const result = await checkGmail(DEFAULT_SETTINGS);
    expect(result).toMatchObject({ status: 'skip' });
    expect(result.detail).toMatch(/extension-only.*does not request Google access/i);
    expect(mocks.emailFactory).not.toHaveBeenCalled();
  });
});

describe('checkSalesforce', () => {
  it('skips before creating the Chrome extraction service on web', async () => {
    mocks.extension = false;
    const result = await checkSalesforce();
    expect(result).toMatchObject({ status: 'skip' });
    expect(result.detail).toMatch(/extension-only/i);
    expect(mocks.extractionFactory).not.toHaveBeenCalled();
  });
});
