import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRenewalGenerationPrompt, buildRenewalResearchPrompt } from '@/prompts';
import { buildRenewalMerchantContext } from '@/services/renewal/merchantContext';
import { DEFAULT_SETTINGS, EMPTY_RENEWAL_INPUT } from '@/types';
import type { RenewalBusinessResearch, RenewalResearchRequest, Settings } from '@/types';

import { OpenAIResponsesService } from './openAIResponsesService';

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  renewalAI: { apiKey: 'test-key', model: 'gpt-5-mini' },
};
const REQUEST: RenewalResearchRequest = {
  input: {
    ...EMPTY_RENEWAL_INPUT,
    merchantName: 'Ada Merchant',
    businessName: 'Example Bakery LLC',
    dba: 'Example Bakery',
    businessAddress: '123 Main Street, Albany, NY 12207',
    city: 'Albany',
    state: 'NY',
    currentBalance: '$9,000',
    percentagePaid: '72%',
    latestLender: 'Example Funding',
    originalFundingAmount: '$30,000',
    originalFundingDate: '2025-06-01',
    productType: 'MCA',
    renewalEligibilityDate: '2026-09-15',
    existingPositions: '1',
    possibleLineOfCredit: '$20,000',
    specialLenderIncentives: 'Reduced fee',
    website: 'https://example.com',
  },
  eligibility: 'eligible',
  outreachType: 'renewal',
  sentEmailHistory: [],
  repProfile: { name: 'Rep', company: 'SideRep', phone: '555-0100', email: 'rep@example.com' },
};
const RESEARCH: RenewalBusinessResearch = {
  exactBusinessVerified: true,
  legalBusinessName: 'Example Bakery LLC',
  dba: 'Example Bakery',
  address: '123 Main Street',
  city: 'Albany',
  state: 'NY',
  website: 'https://example.com',
  industry: 'Wholesale bakery',
  companyDescription: 'Produces baked goods for local restaurants and retail customers.',
  products: ['Bread', 'Pastries'],
  services: ['Wholesale delivery'],
  customerType: 'Restaurants and retail customers',
  businessModel: 'Wholesale and storefront retail',
  locationDetails: 'Albany storefront and production kitchen',
  currentBusinessActivity: ['Expanded wholesale delivery'],
  workingCapitalUses: ['Ingredient inventory', 'Bakery equipment', 'Delivery payroll'],
  confidence: 'high',
};
const DRAFT = {
  outreachObjective: 'renewal_plus_alternative_options',
  businessSummary: 'Example Bakery produces baked goods for local restaurants.',
  emailSubject: 'Example Bakery renewal options',
  emailBody:
    'Hi Ada, your bakery could use added flexibility for ingredient inventory and delivery payroll. Would you have time to review renewal and line-of-credit options?',
  smsBody: 'Hi Ada, can we review renewal and line-of-credit options for Example Bakery?',
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function researchCompleted(
  profile: unknown = RESEARCH,
  sources: unknown[] = [{ type: 'url', url: 'https://example.com', title: 'Example Bakery' }],
  annotations: unknown[] = [],
): unknown {
  return {
    status: 'completed',
    output: [
      { type: 'web_search_call', action: { type: 'search', sources } },
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(profile), annotations }],
      },
    ],
  };
}

function generationCompleted(draft: unknown = DRAFT): unknown {
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }],
  };
}

function workflow(
  research: Response = jsonResponse(researchCompleted()),
  generation: Response = jsonResponse(generationCompleted()),
) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(research)
    .mockResolvedValueOnce(generation);
}

function service(): OpenAIResponsesService {
  return new OpenAIResponsesService(SETTINGS);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OpenAIResponsesService two-stage contract', () => {
  it('researches first, then sends the complete validated context to generation', async () => {
    const fetchSpy = workflow();
    const result = await service().research(REQUEST);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const researchBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(researchBody).toMatchObject({
      model: 'gpt-5-mini',
      input: buildRenewalResearchPrompt(REQUEST),
      store: false,
      tools: [{ type: 'web_search', search_context_size: 'high', external_web_access: true }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
      text: { format: { name: 'renewal_business_research', strict: true } },
    });
    const context = buildRenewalMerchantContext(REQUEST, RESEARCH);
    const generationBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
    expect(generationBody).toMatchObject({
      model: 'gpt-5-mini',
      input: buildRenewalGenerationPrompt(context),
      store: false,
      text: { format: { name: 'renewal_personalized_outreach', strict: true } },
    });
    expect(generationBody).not.toHaveProperty('tools');
    expect(generationBody).not.toHaveProperty('tool_choice');
    expect(generationBody.text.format.schema.required).toEqual([
      'outreachObjective',
      'businessSummary',
      'emailSubject',
      'emailBody',
      'smsBody',
    ]);
  });

  it('does not call OpenAI when Renewal configuration is incomplete', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await new OpenAIResponsesService(DEFAULT_SETTINGS).research(REQUEST);
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('OpenAIResponsesService validation', () => {
  it('normalizes API sources and returns personalized validated drafts', async () => {
    workflow(
      jsonResponse(
        researchCompleted(
          RESEARCH,
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
          ],
        ),
      ),
    );
    const result = await service().research(REQUEST);
    expect(result.ok && result.value.sources).toEqual([
      { title: 'Bakery profile', url: 'https://example.com/research?a=1&b=2' },
      { title: 'Second source', url: 'https://second.example/page' },
    ]);
    expect(result.ok && result.value.emailBody).toContain('ingredient inventory');
  });

  it('still generates from supplied context after a search with no safe source', async () => {
    workflow(jsonResponse(researchCompleted(RESEARCH, [{ url: 'javascript:alert(1)' }])));
    const result = await service().research(REQUEST);
    expect(result.ok && result.value.sources).toEqual([]);
    expect(result.ok && result.value.businessSummary).toBe('');
    expect(result.ok && result.value.smsBody).toBe(DRAFT.smsBody);
  });

  it('rejects research that skipped required web search', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }],
      }),
    );
    const result = await service().research(REQUEST);
    expect(!result.ok && result.error.message).toMatch(/required web research/i);
  });

  it.each([
    [
      'malformed research',
      researchCompleted({ ...RESEARCH, products: 'bread' }),
      /research schema/i,
    ],
    [
      'wrong objective',
      generationCompleted({ ...DRAFT, outreachObjective: 'renewal' }),
      /selected outreach objective/i,
    ],
    [
      'generic identity-free copy',
      generationCompleted({
        ...DRAFT,
        emailSubject: 'Funding options',
        emailBody: 'We can discuss ingredient inventory financing.',
        smsBody: 'Would you like to discuss options?',
      }),
      /merchant identity/i,
    ],
    [
      'research-free email',
      generationCompleted({
        ...DRAFT,
        emailBody: 'Hi Ada, would you like to discuss renewal options for Example Bakery?',
      }),
      /verified business research/i,
    ],
    [
      'model URL',
      generationCompleted({ ...DRAFT, emailBody: `${DRAFT.emailBody} https://invented.example` }),
      /outside API source metadata/i,
    ],
  ])('rejects %s', async (_name, envelope, expected) => {
    if (_name === 'malformed research') {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(envelope));
    } else {
      workflow(jsonResponse(researchCompleted()), jsonResponse(envelope));
    }
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(expected as RegExp);
  });
});

describe('OpenAIResponsesService retries and cancellation', () => {
  it('retries transient research failures before continuing to generation', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'busy' } }, 503))
      .mockResolvedValueOnce(jsonResponse(researchCompleted()))
      .mockResolvedValueOnce(jsonResponse(generationCompleted()));
    const promise = service().research(REQUEST);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('aborts during retry backoff without starting another request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ error: { message: 'busy' } }, 503));
    const controller = new AbortController();
    const promise = service().research(REQUEST, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const result = await promise;
    expect(!result.ok && result.error.name).toBe('AbortError');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when already aborted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const controller = new AbortController();
    controller.abort();
    const result = await service().research(REQUEST, controller.signal);
    expect(!result.ok && result.error.name).toBe('AbortError');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
