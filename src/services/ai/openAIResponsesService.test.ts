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
  businessType: 'Wholesale bakery',
  industry: 'Wholesale bakery',
  companyDescription: 'Produces baked goods for local restaurants and retail customers.',
  products: ['Bread', 'Pastries'],
  services: ['Wholesale delivery'],
  customerType: 'Restaurants and retail customers',
  businessModel: 'Wholesale and storefront retail',
  locationDetails: 'Albany storefront and production kitchen',
  currentBusinessActivity: ['Expanded wholesale delivery'],
  workingCapitalUses: [
    'Ingredient inventory',
    'Bakery equipment',
    'Delivery payroll',
    'Wholesale packaging',
  ],
  confidence: 'high',
};
const DRAFT = {
  outreachObjective: 'renewal_plus_alternative_options',
  researchFactsUsed: ['Ingredient inventory', 'Delivery payroll'],
  businessSummary: 'Example Bakery produces baked goods for local restaurants.',
  emailSubject: 'Example Bakery renewal options',
  emailBody:
    'Hi Ada, Example Bakery has reached renewal eligibility with Example Funding. We can review renewal options and the reduced-fee benefit for ingredient inventory and delivery payroll. A $20,000 line of credit could also let you draw funds as needed. Would you have time to connect?',
  smsBody:
    "Hi Ada, can we review renewal options for Example Bakery's ingredient inventory and delivery needs?",
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

function connectionCompleted(text = 'OK'): unknown {
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
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
      reasoning: { effort: 'medium' },
      max_output_tokens: 6000,
      text: {
        verbosity: 'medium',
        format: { name: 'renewal_business_research', strict: true },
      },
    });
    const context = buildRenewalMerchantContext(REQUEST, RESEARCH);
    expect(result.ok && result.value.researchContext).toEqual(context);
    expect(result.ok && result.value.researchFactsUsed).toEqual(DRAFT.researchFactsUsed);
    const generationBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
    expect(generationBody).toMatchObject({
      model: 'gpt-5-mini',
      input: buildRenewalGenerationPrompt(context),
      store: false,
      reasoning: { effort: 'medium' },
      max_output_tokens: 6000,
      text: {
        verbosity: 'medium',
        format: { name: 'renewal_personalized_outreach', strict: true },
      },
    });
    expect(generationBody).not.toHaveProperty('tools');
    expect(generationBody).not.toHaveProperty('tool_choice');
    expect(generationBody.text.format.schema.required).toEqual([
      'outreachObjective',
      'researchFactsUsed',
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

  it('uses the selected model for a tiny connection probe without web search or pipeline controls', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(connectionCompleted()));
    const result = await service().testConnection();
    expect(result.ok).toBe(true);
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: 'gpt-5-mini',
      input: 'Respond with exactly: OK',
      max_output_tokens: 16,
    });
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('reasoning');
    expect(body).not.toHaveProperty('text');
  });

  it('applies the centralized model, reasoning, verbosity, and token settings to both pipeline stages', async () => {
    const configured = new OpenAIResponsesService({
      ...SETTINGS,
      renewalAI: { ...SETTINGS.renewalAI, model: 'gpt-5.6-sol' },
      ai: {
        ...SETTINGS.ai,
        reasoningEffort: 'high',
        verbosity: 'high',
        maxOutputTokens: 7200,
      },
    });
    const fetchSpy = workflow();
    const result = await configured.research(REQUEST);
    expect(result.ok).toBe(true);
    for (const call of fetchSpy.mock.calls) {
      const body = JSON.parse(String(call[1]?.body));
      expect(body).toMatchObject({
        model: 'gpt-5.6-sol',
        reasoning: { effort: 'high' },
        max_output_tokens: 7200,
        text: { verbosity: 'high' },
      });
    }
  });

  it('removes web search at runtime and uses only supplied information when disabled', async () => {
    const webSearchDisabled = new OpenAIResponsesService({
      ...SETTINGS,
      ai: { ...SETTINGS.ai, webSearchEnabled: false },
    });
    const fallbackDraft = {
      ...DRAFT,
      researchFactsUsed: [],
      emailBody:
        'Hi Ada, Example Bakery has reached renewal eligibility with Example Funding. We can review renewal options and the reduced-fee benefit. A $20,000 line of credit could let you draw funds as needed.',
      smsBody: 'Hi Ada, can we review renewal options for Example Bakery?',
    };
    const fetchSpy = workflow(
      jsonResponse({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(RESEARCH) }] },
        ],
      }),
      jsonResponse(generationCompleted(fallbackDraft)),
    );
    const result = await webSearchDisabled.research(REQUEST);
    expect(result.ok).toBe(true);
    const researchBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(researchBody).not.toHaveProperty('tools');
    expect(researchBody).not.toHaveProperty('tool_choice');
    expect(researchBody.input).toMatch(/Web search is disabled/i);
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
    const fallbackDraft = {
      ...DRAFT,
      researchFactsUsed: [],
      emailBody:
        'Hi Ada, Example Bakery has reached renewal eligibility with Example Funding. We can review renewal options and the reduced-fee benefit. A $20,000 line of credit could let you draw funds as needed.',
      smsBody: 'Hi Ada, can we review renewal options for Example Bakery?',
    };
    workflow(
      jsonResponse(researchCompleted(RESEARCH, [{ url: 'javascript:alert(1)' }])),
      jsonResponse(generationCompleted(fallbackDraft)),
    );
    const result = await service().research(REQUEST);
    expect(result.ok && result.value.sources).toEqual([]);
    expect(result.ok && result.value.businessSummary).toBe('');
    expect(result.ok && result.value.smsBody).toBe(fallbackDraft.smsBody);
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

  it('ranks official, Google, social, LinkedIn, BBB, then directory sources', async () => {
    workflow(
      jsonResponse(
        researchCompleted(RESEARCH, [
          { type: 'url', url: 'https://directory.example/listing', title: 'Directory' },
          { type: 'url', url: 'https://bbb.org/profile', title: 'BBB' },
          { type: 'url', url: 'https://linkedin.com/company/example', title: 'LinkedIn' },
          { type: 'url', url: 'https://instagram.com/example', title: 'Instagram' },
          { type: 'url', url: 'https://google.com/maps/place/example', title: 'Google' },
          { type: 'url', url: 'https://example.com/about', title: 'Official' },
        ]),
      ),
    );
    const result = await service().research(REQUEST);
    expect(result.ok && result.value.sources.map((source) => source.title)).toEqual([
      'Official',
      'Google',
      'Instagram',
      'LinkedIn',
      'BBB',
      'Directory',
    ]);
  });

  it('does not use research from a similarly named business in another location', async () => {
    const wrongBusiness: RenewalBusinessResearch = {
      ...RESEARCH,
      address: '900 Sunset Boulevard',
      city: 'Los Angeles',
      state: 'CA',
      website: 'https://different-bakery.example',
    };
    workflow(jsonResponse(researchCompleted(wrongBusiness)));
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/before the exact merchant was verified/i);
  });

  it('rejects a verified profile without four specific working-capital uses before drafting', async () => {
    const fetchSpy = workflow(
      jsonResponse(
        researchCompleted({
          ...RESEARCH,
          workingCapitalUses: RESEARCH.workingCapitalUses.slice(0, 3),
        }),
      ),
    );

    const result = await service().research(REQUEST);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/4-6 specific working-capital uses/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects conflicting identity data even when the website domain matches', async () => {
    const conflictingBusiness: RenewalBusinessResearch = {
      ...RESEARCH,
      legalBusinessName: 'Different Bakery LLC',
      dba: 'Different Bakery',
      address: '900 Sunset Boulevard',
      city: 'Los Angeles',
      state: 'CA',
    };
    workflow(jsonResponse(researchCompleted(conflictingBusiness)));
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/before the exact merchant was verified/i);
  });

  it('does not treat a name plus state alone as an exact location match', async () => {
    const partialLocationRequest: RenewalResearchRequest = {
      ...REQUEST,
      input: {
        ...REQUEST.input,
        businessAddress: '',
        city: '',
        state: 'NY',
        website: '',
      },
    };
    workflow(jsonResponse(researchCompleted({ ...RESEARCH, city: 'Buffalo' })));
    const result = await service().research(partialLocationRequest);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/before the exact merchant was verified/i);
  });

  it('uses a shortened Google address link as an exact signal with matching name and source', async () => {
    const googleAddressRequest: RenewalResearchRequest = {
      ...REQUEST,
      input: {
        ...REQUEST.input,
        businessAddress: '',
        businessAddressGoogleUrl: 'https://maps.app.goo.gl/AbCdEf123',
        city: '',
        state: '',
        website: '',
      },
    };
    workflow(
      jsonResponse(
        researchCompleted(RESEARCH, [
          { type: 'url', url: 'https://google.com/maps/place/example-bakery', title: 'Google' },
        ]),
      ),
    );
    const result = await service().research(googleAddressRequest);
    expect(result.ok).toBe(true);
  });

  it.each([
    [
      'not-yet-eligible LOC',
      {
        ...REQUEST,
        eligibility: 'not_eligible',
        input: { ...REQUEST.input, specialLenderIncentives: '' },
      },
      {
        ...DRAFT,
        outreachObjective: 'line_of_credit',
        emailSubject: 'Example Bakery working-capital options',
        emailBody:
          'Hi Ada, Example Bakery is not quite at the renewal point yet. We may still explore additional working capital through another funding option, including a $20,000 line of credit you can draw as needed for ingredient inventory and delivery payroll.',
      },
    ],
    [
      'term loan',
      {
        ...REQUEST,
        eligibility: 'not_eligible',
        input: {
          ...REQUEST.input,
          possibleLineOfCredit: '',
          possibleTermLoan: '36-month term loan',
          specialLenderIncentives: '',
        },
      },
      {
        ...DRAFT,
        outreachObjective: 'term_loan',
        emailSubject: 'Example Bakery working-capital options',
        emailBody:
          'Hi Ada, Example Bakery is not quite at the renewal point yet. We may still explore additional working capital through another funding option. Based on your established payment history, it may be worth checking whether a 36-month term loan is available for ingredient inventory and delivery payroll.',
      },
    ],
    [
      'expiring outstanding offer',
      {
        ...REQUEST,
        input: {
          ...REQUEST.input,
          possibleLineOfCredit: '',
          specialLenderIncentives: '',
          existingOutstandingOffer: '$75,000 MCA offer expires soon',
        },
      },
      {
        ...DRAFT,
        outreachObjective: 'existing_outstanding_offer',
        emailSubject: 'Example Bakery offer follow-up',
        emailBody:
          'Hi Ada, I am following up because the $75,000 MCA offer for Example Bakery expires soon. The offer could support ingredient inventory and delivery payroll. Would you like to review the details?',
      },
    ],
  ] as const)('accepts a correctly framed %s scenario', async (_name, request, draft) => {
    workflow(jsonResponse(researchCompleted()), jsonResponse(generationCompleted(draft)));
    const result = await service().research(request);
    expect(result.ok).toBe(true);
  });

  it('rejects eligible renewal outreach that omits the current lender', async () => {
    workflow(
      jsonResponse(researchCompleted()),
      jsonResponse(
        generationCompleted({
          ...DRAFT,
          emailBody: DRAFT.emailBody.replace(' with Example Funding', ''),
        }),
      ),
    );
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/omitted the supplied current lender/i);
  });

  it('rejects a LOC scenario that omits draw-as-needed flexibility', async () => {
    workflow(
      jsonResponse(researchCompleted()),
      jsonResponse(
        generationCompleted({
          ...DRAFT,
          emailBody: DRAFT.emailBody.replace(' you draw funds as needed', ' provide funds'),
        }),
      ),
    );
    const result = await service().research(REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/line-of-credit draw flexibility/i);
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
        emailBody:
          'Hi Ada, Example Bakery has reached renewal eligibility with Example Funding. We can review renewal options and the reduced-fee benefit. A $20,000 line of credit could let you draw funds as needed.',
      }),
      /incorporate every selected research fact/i,
    ],
    [
      'too few research facts',
      generationCompleted({ ...DRAFT, researchFactsUsed: ['Ingredient inventory'] }),
      /2-4 distinct verified business facts/i,
    ],
    [
      'invented research fact',
      generationCompleted({
        ...DRAFT,
        researchFactsUsed: ['Ingredient inventory', 'Revenue growth'],
      }),
      /not grounded in verified research/i,
    ],
    [
      'selected fact omitted from outreach',
      generationCompleted({
        ...DRAFT,
        researchFactsUsed: ['Ingredient inventory', 'Bread and pastries'],
      }),
      /incorporate every selected research fact/i,
    ],
    [
      'research-free SMS',
      generationCompleted({
        ...DRAFT,
        smsBody: 'Hi Ada, can we review renewal options for Example Bakery?',
      }),
      /SMS did not use any selected business research/i,
    ],
    [
      'unsupported claim inserted directly into the email',
      generationCompleted({
        ...DRAFT,
        emailBody: `${DRAFT.emailBody} Your revenue has grown significantly.`,
      }),
      /unsupported revenue growth/i,
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
