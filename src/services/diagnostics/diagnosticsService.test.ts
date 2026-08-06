import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';
import type { Settings } from '@/types';

import { checkAzure, checkGmail, checkStorage } from './diagnosticsService';

const CONFIGURED_AZURE: Settings = {
  ...DEFAULT_SETTINGS,
  azure: {
    endpoint: 'https://x.openai.azure.com',
    deployment: 'gpt',
    apiKey: 'k',
    apiVersion: '2024-10-21',
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
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

describe('checkAzure', () => {
  it('skips when Azure is not configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await checkAzure(DEFAULT_SETTINGS);
    expect(result.status).toBe('skip');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes when the completions probe succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const result = await checkAzure(CONFIGURED_AZURE);
    expect(result.status).toBe('pass');
  });

  it('fails and surfaces the error when the endpoint rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: { message: 'bad' } }, 401));
    const result = await checkAzure(CONFIGURED_AZURE);
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
});
