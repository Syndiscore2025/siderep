import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';
import type { ChatCompletionRequest, Settings } from '@/types';

import { AzureOpenAIService } from './azureOpenAIService';

const CONFIGURED: Settings = {
  ...DEFAULT_SETTINGS,
  azure: {
    endpoint: 'https://x.openai.azure.com',
    deployment: 'gpt',
    apiKey: 'k',
    apiVersion: '2024-10-21',
  },
};

const REQUEST: ChatCompletionRequest = {
  messages: [{ role: 'user', content: 'hi' }],
  model: 'gpt-4o',
  temperature: 0.5,
  maxTokens: 100,
};

/** Builds a JSON Response like Azure's buffered chat/completions reply. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Builds a streaming Response body from an array of SSE lines. */
function sseResponse(lines: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function collect(gen: AsyncGenerator<{ content: string; done: boolean }>): Promise<string> {
  let out = '';
  for await (const chunk of gen) out += chunk.content;
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AzureOpenAIService.complete', () => {
  it('returns an error without hitting the network when unconfigured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await new AzureOpenAIService(DEFAULT_SETTINGS).complete(REQUEST);
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to the deployment URL with the api-key header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hello' } }] }));

    const result = await new AzureOpenAIService(CONFIGURED).complete(REQUEST);

    expect(result.ok && result.value.content).toBe('hello');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://x.openai.azure.com/openai/deployments/gpt/chat/completions?api-version=2024-10-21',
    );
    expect((init?.headers as Record<string, string>)['api-key']).toBe('k');
  });

  it('maps usage fields to camelCase', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      }),
    );
    const result = await new AzureOpenAIService(CONFIGURED).complete(REQUEST);
    expect(result.ok && result.value.usage).toEqual({
      promptTokens: 3,
      completionTokens: 4,
      totalTokens: 7,
    });
  });

  it('retries on a 429 then succeeds', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: {} }, 429))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));

    const promise = new AzureOpenAIService(CONFIGURED).complete(REQUEST);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.ok && result.value.content).toBe('ok');
  });

  it('does not retry on a 400 and returns an error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 400));
    const result = await new AzureOpenAIService(CONFIGURED).complete(REQUEST);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });
});

describe('AzureOpenAIService.completeStream', () => {
  it('yields incremental deltas and stops on [DONE]', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
        'data: [DONE]\n',
      ]),
    );
    const text = await collect(new AzureOpenAIService(CONFIGURED).completeStream(REQUEST));
    expect(text).toBe('Hello');
  });

  it('throws when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 400));
    const gen = new AzureOpenAIService(CONFIGURED).completeStream(REQUEST);
    await expect(collect(gen)).rejects.toThrow();
  });
});

describe('AzureOpenAIService.testConnection', () => {
  it('resolves ok when the probe succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'pong' } }] }),
    );
    const result = await new AzureOpenAIService(CONFIGURED).testConnection();
    expect(result.ok).toBe(true);
  });
});
