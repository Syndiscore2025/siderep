import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';
import type { ChatCompletionRequest, Settings } from '@/types';

import { OpenAIChatService } from './openAIChatService';

const CONFIGURED: Settings = {
  ...DEFAULT_SETTINGS,
  assistantAI: { apiKey: 'test-assistant-key', model: 'gpt-4.1-mini' },
};
const REQUEST: ChatCompletionRequest = {
  messages: [{ role: 'user', content: 'hi' }],
  model: 'ignored-request-model',
  temperature: 0.5,
  maxTokens: 100,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(lines: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      lines.forEach((line) => controller.enqueue(encoder.encode(line)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function collect(generator: AsyncGenerator<{ content: string }>): Promise<string> {
  let output = '';
  for await (const chunk of generator) output += chunk.content;
  return output;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OpenAIChatService', () => {
  it('does not call the network while the separate Assistant key is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await new OpenAIChatService(DEFAULT_SETTINGS).complete(REQUEST);
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the OpenAI endpoint, bearer key, configured model, and non-persistent request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hello' } }] }));
    const result = await new OpenAIChatService(CONFIGURED).complete(REQUEST);
    expect(result.ok && result.value.content).toBe('hello');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-assistant-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'gpt-4.1-mini',
      temperature: 0.5,
      max_tokens: 100,
      stream: false,
      store: false,
    });
  });

  it('uses GPT-5-compatible completion controls without unsupported temperature', async () => {
    const settings: Settings = {
      ...CONFIGURED,
      assistantAI: { ...CONFIGURED.assistantAI, model: 'gpt-5.6' },
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hello' } }] }));

    const result = await new OpenAIChatService(settings).complete(REQUEST);

    expect(result.ok).toBe(true);
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'gpt-5.6', max_completion_tokens: 100 });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('maps token usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      }),
    );
    const result = await new OpenAIChatService(CONFIGURED).complete(REQUEST);
    expect(result.ok && result.value.usage).toEqual({
      promptTokens: 3,
      completionTokens: 4,
      totalTokens: 7,
    });
  });

  it('retries a transient response and does not retry a client error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const pending = new OpenAIChatService(CONFIGURED).complete(REQUEST);
    await vi.runAllTimersAsync();
    expect((await pending).ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockReset().mockResolvedValue(jsonResponse({}, 400));
    expect((await new OpenAIChatService(CONFIGURED).complete(REQUEST)).ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('streams incremental chat-completion deltas through [DONE]', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
        'data: [DONE]\n',
      ]),
    );
    await expect(collect(new OpenAIChatService(CONFIGURED).completeStream(REQUEST))).resolves.toBe(
      'Hello',
    );
  });

  it('tests the configured Assistant connection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'pong' } }] }),
    );
    await expect(new OpenAIChatService(CONFIGURED).testConnection()).resolves.toMatchObject({
      ok: true,
    });
  });
});
