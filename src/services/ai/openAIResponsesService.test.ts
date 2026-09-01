import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRenewalPrompt } from '@/prompts';
import { DEFAULT_SETTINGS } from '@/types';
import type { RenewalResearchRequest, Settings } from '@/types';

import { OpenAIResponsesService } from './openAIResponsesService';

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  renewalAI: { apiKey: 'test-key', model: 'gpt-5-mini' },
};

const REQUEST: RenewalResearchRequest = {
  input: {
    merchantName: 'Ada Merchant',
    businessName: 'Example Bakery LLC',
    accountName: 'Example Bakery Account',
    dba: 'Example Bakery',
    businessAddress: '123 Main Street, Albany, NY 12207',
    currentBalance: '$9,000',
    percentagePaid: '72%',
    latestLender: 'Example Funding',
    additionalSameDayLender: '',
    website: 'https://example.com',
  },
  eligibility: 'eligible',
  outreachType: 'renewal',
  sentEmailHistory: [],
  repProfile: { name: 'Rep', company: 'SideRep', phone: '555-0100', email: 'rep@example.com' },
};

const DRAFT = {
  businessSummary: 'Example Bakery is a neighborhood bakery.',
  emailSubject: 'Checking in',
  emailBody: 'Hello Ada, would you like to discuss renewal options?',
  smsBody: 'Hi Ada, are you available to discuss renewal options?',
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function completed(
  draft: unknown = DRAFT,
  sources: unknown[] = [{ type: 'url', url: 'https://example.com', title: 'Example Bakery' }],
  annotations: unknown[] = [],
): unknown {
  return {
    status: 'completed',
    output: [
      { type: 'web_search_call', action: { type: 'search', sources } },
      {
        type: 'message',
        status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify(draft), annotations }],
      },
    ],
  };
}

function service(): OpenAIResponsesService {
  return new OpenAIResponsesService(SETTINGS);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OpenAIResponsesService request contract', () => {
  it('posts the configured model and strict, non-persistent web-search request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(completed()));

    const result = await service().research(REQUEST);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-5-mini',
      input: buildRenewalPrompt(REQUEST),
      store: false,
      tools: [{ type: 'web_search' }],
      include: ['web_search_call.action.sources'],
    });
    expect(body.max_output_tokens).toEqual(expect.any(Number));
    expect(body.max_output_tokens).toBeLessThanOrEqual(4_000);
    expect(body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'renewal_draft',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: expect.objectContaining({
            businessSummary: expect.objectContaining({
              type: 'string',
              description: expect.stringMatching(/4-6 specific working-capital uses/i),
            }),
            emailSubject: expect.objectContaining({ type: 'string' }),
            emailBody: expect.objectContaining({
              type: 'string',
              description: expect.stringMatching(/only verified research.*business-specific/i),
            }),
            smsBody: expect.objectContaining({
              type: 'string',
              description: expect.stringMatching(/only verified research/i),
            }),
          }),
          required: ['businessSummary', 'emailSubject', 'emailBody', 'smsBody'],
        },
      },
    });
  });

  it('does not call fetch when the Renewal configuration is incomplete', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await new OpenAIResponsesService(DEFAULT_SETTINGS).research(REQUEST);
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('OpenAIResponsesService response parsing', () => {
  it('collects only API citations and sources, normalizes URLs, deduplicates, and keeps titles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        completed(
          DRAFT,
          [
            { type: 'url', url: 'https://EXAMPLE.com/research?b=2&a=1#section' },
            { type: 'url', url: 'https://second.example/page', title: 'Second source' },
          ],
          [
            {
              type: 'url_citation',
              url: 'https://example.com/research?a=1&b=2',
              title: 'Bakery profile',
            },
            { type: 'other', url: 'https://ignored.example' },
          ],
        ),
      ),
    );

    const result = await service().research(REQUEST);

    expect(result.ok && result.value.sources).toEqual([
      { title: 'Bakery profile', url: 'https://example.com/research?a=1&b=2' },
      { title: 'Second source', url: 'https://second.example/page' },
    ]);
  });

  it('rejects unsafe API URLs and suppresses an unsupported factual summary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        completed(DRAFT, [
          { type: 'url', url: 'javascript:alert(1)', title: 'Unsafe' },
          { type: 'url', url: 'https://user:password@example.com/private' },
        ]),
      ),
    );
    const result = await service().research(REQUEST);
    expect(result.ok && result.value.sources).toEqual([]);
    expect(result.ok && result.value.businessSummary).toBe('');
    expect(result.ok && result.value.emailBody).toBe(DRAFT.emailBody);
  });

  it('never accepts links supplied inside model JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(completed({ ...DRAFT, sources: [{ url: 'https://invented.example' }] })),
    );
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/schema/);
  });

  it('allows drafts without sources and removes only a non-empty unsupported summary', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(completed({ ...DRAFT, businessSummary: '' }, [])))
      .mockResolvedValueOnce(jsonResponse(completed(DRAFT, [])));
    const empty = await service().research(REQUEST);
    const factual = await service().research(REQUEST);
    expect(empty.ok && empty.value.sources).toEqual([]);
    expect(factual.ok && factual.value.businessSummary).toBe('');
    expect(factual.ok && factual.value.smsBody).toBe(DRAFT.smsBody);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'incomplete',
      { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
      /incomplete/,
    ],
    [
      'refusal',
      {
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }],
      },
      /refused/,
    ],
    ['API error', { error: { message: 'Provider rejected the request.' } }, /Provider rejected/],
    ['missing output', { status: 'completed' }, /missing output/],
  ])('handles %s envelopes', async (_name, envelope, expected) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(envelope));
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(expected as RegExp);
  });

  it.each([
    [
      'malformed output JSON',
      {
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'not-json' }] }],
      },
      /valid JSON/,
    ],
    ['missing schema field', completed({ ...DRAFT, smsBody: undefined }), /schema/],
    ['wrong schema type', completed({ ...DRAFT, smsBody: 1 }), /schema/],
    [
      'model-generated URL',
      completed({ ...DRAFT, emailBody: 'See https://invented.example' }),
      /outside API source metadata/,
    ],
  ])('rejects %s', async (_name, envelope, expected) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(envelope));
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(expected as RegExp);
  });

  it('handles a malformed HTTP JSON body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{', { status: 200 }));
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/malformed JSON/);
  });
});

describe('OpenAIResponsesService retries and aborts', () => {
  it('retries network errors and transient statuses at most twice', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'busy' } }, 503))
      .mockResolvedValueOnce(jsonResponse(completed()));

    const promise = service().research(REQUEST);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('caps Retry-After backoff and stops after three total attempts', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ error: { message: 'slow down' } }, 429, { 'Retry-After': '999' }),
      );

    const promise = service().research(REQUEST);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['authentication HTTP error', jsonResponse({ error: { message: 'bad key' } }, 401)],
    ['permission HTTP error', jsonResponse({ error: { message: 'forbidden' } }, 403)],
    ['validation HTTP error', jsonResponse({ error: { message: 'invalid' } }, 400)],
    [
      'refusal',
      jsonResponse({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }],
      }),
    ],
  ])('does not retry %s', async (_name, response) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('aborts during retry backoff without another request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ error: { message: 'busy' } }, 503));
    const controller = new AbortController();

    const promise = service().research(REQUEST, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.name).toBe('AbortError');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when already aborted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const controller = new AbortController();
    controller.abort();
    const result = await service().research(REQUEST, controller.signal);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.name).toBe('AbortError');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
