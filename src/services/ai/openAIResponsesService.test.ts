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
  researchConfidence: 'high',
  researchFactsUsed: ['Ingredient inventory', 'Delivery payroll'],
  genericnessCheck: false,
  businessSummary: 'Example Bakery produces baked goods for local restaurants.',
  emailSubject: 'Example Bakery renewal options',
  emailBody: [
    'Hi Ada,',
    '',
    'Example Bakery has reached renewal eligibility with Example Funding, and the reduced-fee benefit still applies. A $20,000 line of credit is also an option that lets you draw funds as needed.',
    '',
    'Based on what I saw about the bakery, here are a few places extra capital could go:',
    '- Ingredient inventory bought ahead of wholesale orders, so margins hold when flour prices move',
    '- Delivery payroll covered on time while restaurant invoices are still clearing',
    '- Bakery equipment upgrades that let the production kitchen fill larger wholesale runs',
    '- Wholesale packaging stocked in bulk so new restaurant accounts ship without delay',
    '',
    'If that is useful, send over 3-4 months of business bank statements and I will see what is available.',
  ].join('\n'),
  smsBody:
    'Hi Ada, Example Bakery has reached renewal eligibility with Example Funding, and the reduced fee still applies. With ingredient inventory and delivery payroll to cover between restaurant invoices, extra capital could keep production steady. If it helps, send over 3-4 months of business bank statements and I will see what is available.',
};
const FALLBACK_EMAIL_BODY = [
  'Hi Ada,',
  '',
  'Example Bakery has reached renewal eligibility with Example Funding, and the reduced-fee benefit still applies. A $20,000 line of credit is also an option that lets you draw funds as needed.',
  '',
  'A few ways additional capital tends to work for a business like yours:',
  '- Keeping your team paid on schedule while customer payments are still coming in',
  '- Restocking your best sellers ahead of the busiest weeks of the year',
  '- Handling a repair or replacement before it interrupts sales',
  '',
  'Send over 3-4 months of business bank statements and I will see what is available.',
].join('\n');
const FALLBACK_SMS_BODY =
  'Hi Ada, Example Bakery has reached renewal eligibility with Example Funding. If extra capital would help, send over 3-4 months of business bank statements and I will see what is available.';

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
    .mockResolvedValueOnce(generation)
    .mockResolvedValueOnce(generation.clone());
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
      'researchConfidence',
      'researchFactsUsed',
      'genericnessCheck',
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
      input: [
        { role: 'system', content: 'You are a connection test.' },
        { role: 'user', content: 'Respond with exactly: OK' },
      ],
      max_output_tokens: 16,
    });
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('reasoning');
    expect(body).not.toHaveProperty('text');
  });

  it('strips a leading "Subject:" label from the generated subject', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(researchCompleted()))
      .mockResolvedValueOnce(
        jsonResponse(generationCompleted({ ...DRAFT, emailSubject: 'Subject: Bakery renewal' })),
      );

    const result = await service().research(REQUEST);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.emailSubject).toBe('Bakery renewal');
  });

  it('generates without a paid-in percentage and rejects a draft that invents one', async () => {
    const request: RenewalResearchRequest = {
      ...REQUEST,
      input: { ...REQUEST.input, percentagePaid: '' },
    };
    workflow();
    const accepted = await service().research(request);
    expect(accepted.ok).toBe(true);
    vi.restoreAllMocks();

    workflow(
      jsonResponse(researchCompleted()),
      jsonResponse(
        generationCompleted({ ...DRAFT, emailBody: `${DRAFT.emailBody} You are 55% paid in.` }),
      ),
    );
    const rejected = await service().research(request);
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.error.message).toMatch(
      /paid-in percentage that was not supplied/i,
    );
  });

  it('regenerates a draft that the model marks generic before returning it', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(researchCompleted()))
      .mockResolvedValueOnce(
        jsonResponse(generationCompleted({ ...DRAFT, genericnessCheck: true })),
      )
      .mockResolvedValueOnce(jsonResponse(generationCompleted(DRAFT)));

    const result = await service().research(REQUEST);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const retryBody = JSON.parse(String(fetchSpy.mock.calls[2]?.[1]?.body));
    expect(retryBody.input).toContain('The prior draft was generic. Regenerate it');
    expect(retryBody).not.toHaveProperty('tools');
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
      researchConfidence: 'low',
      researchFactsUsed: [],
      emailBody: FALLBACK_EMAIL_BODY,
      smsBody: FALLBACK_SMS_BODY,
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
    expect(result.ok && result.value.emailBody).toMatch(/ingredient inventory/i);
  });

  it('still generates from supplied context after a search with no safe source', async () => {
    const fallbackDraft = {
      ...DRAFT,
      researchConfidence: 'low',
      researchFactsUsed: [],
      emailBody: FALLBACK_EMAIL_BODY,
      smsBody: FALLBACK_SMS_BODY,
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
        emailBody: [
          'Hi Ada,',
          '',
          'Example Bakery is not quite at the renewal point yet with Example Funding, but another funding option may still provide additional working capital. A $20,000 line of credit would let you draw funds as needed rather than taking a lump sum.',
          '',
          'Based on what I saw about the bakery, here are a few places that flexibility could go:',
          '- Ingredient inventory bought ahead of wholesale orders, so margins hold when flour prices move',
          '- Delivery payroll covered on time while restaurant invoices are still clearing',
          '- Wholesale packaging stocked in bulk so new restaurant accounts ship without delay',
          '',
          'If that is useful, send over 3-4 months of business bank statements and I will see what is available.',
        ].join('\n'),
        smsBody:
          'Hi Ada, Example Bakery is not quite at the renewal point yet with Example Funding, but a $20,000 line of credit could cover ingredient inventory and delivery payroll as needed. If that helps, send over 3-4 months of business bank statements and I will see what is available.',
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
        emailBody: [
          'Hi Ada,',
          '',
          'Example Bakery is not quite at the renewal point yet with Example Funding, but another funding option may still provide additional working capital. Based on your established payment history, it may be worth checking whether a 36-month term loan is available.',
          '',
          'Here are a few places that capital could go at the bakery:',
          '- Ingredient inventory bought ahead of wholesale orders, so margins hold when flour prices move',
          '- Delivery payroll covered on time while restaurant invoices are still clearing',
          '- Bakery equipment upgrades that let the production kitchen fill larger wholesale runs',
          '',
          'If that is useful, send over 3-4 months of business bank statements and I will see what is available.',
        ].join('\n'),
        smsBody:
          'Hi Ada, Example Bakery is not quite at the renewal point yet with Example Funding, but with your payment history a 36-month term loan may be worth checking for ingredient inventory and delivery payroll. If that helps, send over 3-4 months of business bank statements and I will see what is available.',
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
        emailBody: [
          'Hi Ada,',
          '',
          'I am following up with Example Funding because the $75,000 MCA offer for Example Bakery expires soon.',
          '',
          'Based on what I saw about the bakery, here are a few places that offer could go:',
          '- Ingredient inventory bought ahead of wholesale orders, so margins hold when flour prices move',
          '- Delivery payroll covered on time while restaurant invoices are still clearing',
          '- Wholesale packaging stocked in bulk so new restaurant accounts ship without delay',
          '',
          'If you want to move on it, send over 3-4 months of business bank statements and I will confirm the details.',
        ].join('\n'),
        smsBody:
          'Hi Ada, the $75,000 MCA offer for Example Bakery with Example Funding expires soon and could cover ingredient inventory and delivery payroll. If you want to move on it, send over 3-4 months of business bank statements and I will confirm the details.',
      },
    ],
  ] as const)('accepts a correctly framed %s scenario', async (_name, request, draft) => {
    workflow(jsonResponse(researchCompleted()), jsonResponse(generationCompleted(draft)));
    const result = await service().research(request);
    expect(result.ok).toBe(true);
  });

  it.each([
    {
      industry: 'freight logistics',
      business: 'Summit Freight LLC',
      merchant: 'Luis',
      businessType: 'Regional freight carrier',
      description: 'Coordinates regional freight loads for commercial shippers.',
      uses: ['Carrier payments', 'Fuel purchases', 'Driver payroll', 'Bridging receivables'],
      facts: ['Carrier payments', 'Fuel purchases'],
      email: [
        'Hi Luis,',
        '',
        'Summit Freight has reached renewal eligibility with Example Funding, so this is a good time to look at renewal options.',
        '',
        'With carrier payments and fuel purchases usually landing before invoices clear, here is where a renewal could help:',
        '- Carrier payments settled on time so loads keep moving while shippers pay on their terms',
        '- Fuel purchases covered up front instead of waiting on receivables to clear',
        '- Driver payroll kept steady through slower invoice weeks so dispatch never stalls',
        '',
        'If that is useful, send over 3-4 months of business bank statements and I will see what is available.',
      ].join('\n'),
      sms: 'Hi Luis, it is Michael with 1West. Summit Freight has reached renewal eligibility with Example Funding, and since carrier payments and fuel purchases hit before invoices clear, a renewal could keep loads moving. If that helps, send over 3-4 months of business bank statements and I will see what is available.',
    },
    {
      industry: 'dog grooming',
      business: 'Paws & Polish LLC',
      merchant: 'Maya',
      businessType: 'Pet grooming salon',
      description: 'Provides full-service dog grooming and sells pet-care products.',
      uses: ['Grooming tables', 'Dryers', 'Pet-care products', 'Groomer staffing'],
      facts: ['Grooming tables', 'Pet-care products'],
      email: [
        'Hi Maya,',
        '',
        'Paws & Polish has reached renewal eligibility with Example Funding, so renewal options are on the table.',
        '',
        'Since the salon combines grooming with pet-care products, here is where a renewal could help:',
        '- Grooming tables and dryers replaced before wear slows down the daily appointment schedule',
        '- Pet-care products kept fully stocked so retail sales continue between grooming visits',
        '- Groomer staffing covered during busy seasons so more appointments can be booked',
        '',
        'If that is useful, send over 3-4 months of business bank statements and I will see what is available.',
      ].join('\n'),
      sms: 'Hi Maya, it is Michael with 1West. Paws & Polish has reached renewal eligibility with Example Funding, and a renewal could help with grooming tables or keeping pet-care products stocked. If that helps, send over 3-4 months of business bank statements and I will see what is available.',
    },
    {
      industry: 'commercial contracting',
      business: 'Stonebridge Contracting LLC',
      merchant: 'Devon',
      businessType: 'Commercial general contractor',
      description: 'Completes tenant-improvement and commercial renovation projects.',
      uses: [
        'Project materials',
        'Subcontractor costs',
        'Equipment rentals',
        'Upfront job expenses',
      ],
      facts: ['Project materials', 'Subcontractor costs'],
      email: [
        'Hi Devon,',
        '',
        'Stonebridge Contracting has reached renewal eligibility with Example Funding, so renewal options are worth a look.',
        '',
        'On tenant-improvement work, here is where a renewal could help before a job is billed through:',
        '- Project materials purchased up front so crews start on schedule instead of waiting on draws',
        '- Subcontractor costs paid on time so trades stay committed to your jobs',
        '- Equipment rentals covered across overlapping projects so no site sits idle',
        '',
        'If that is useful, send over 3-4 months of business bank statements and I will see what is available.',
      ].join('\n'),
      sms: 'Hi Devon, it is Michael with 1West. Stonebridge Contracting has reached renewal eligibility with Example Funding, and a renewal could cover project materials or subcontractor costs before a job is billed. If that helps, send over 3-4 months of business bank statements and I will see what is available.',
    },
  ])('accepts distinct, research-grounded %s outreach', async (industryCase) => {
    const research = {
      ...RESEARCH,
      legalBusinessName: industryCase.business,
      dba: industryCase.business.replace(' LLC', ''),
      businessType: industryCase.businessType,
      industry: industryCase.industry,
      companyDescription: industryCase.description,
      workingCapitalUses: industryCase.uses,
    };
    const request = {
      ...REQUEST,
      input: {
        ...REQUEST.input,
        merchantName: industryCase.merchant,
        businessName: industryCase.business,
        possibleLineOfCredit: '',
        possibleTermLoan: '',
        specialLenderIncentives: '',
      },
    };
    const draft = {
      ...DRAFT,
      outreachObjective: 'renewal',
      researchFactsUsed: industryCase.facts,
      businessSummary: industryCase.description,
      emailSubject: `${industryCase.business.replace(' LLC', '')} renewal review`,
      emailBody: industryCase.email,
      smsBody: industryCase.sms,
    };

    workflow(jsonResponse(researchCompleted(research)), jsonResponse(generationCompleted(draft)));
    const result = await service().research(request);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.emailBody).toMatch(new RegExp(industryCase.facts[0], 'i'));
    expect(result.ok && result.value.smsBody).toMatch(new RegExp(industryCase.facts[1], 'i'));
  });

  it.each([
    [
      'Markdown formatting',
      { ...DRAFT, emailBody: `**${DRAFT.emailBody}**` },
      /plain text without Markdown/i,
    ],
    [
      'an SMS signature',
      { ...DRAFT, smsBody: `${DRAFT.smsBody}\n\nRep\nSideRep` },
      /signature to the SMS/i,
    ],
    [
      'SMS bullets',
      {
        ...DRAFT,
        smsBody: `${DRAFT.smsBody}\n- Ingredient inventory\n- Delivery payroll`,
      },
      /SMS must use plain text without Markdown formatting or bullets/i,
    ],
    [
      'an email without capital-use bullets',
      {
        ...DRAFT,
        emailBody: DRAFT.emailBody
          .split('\n')
          .filter((line) => !line.startsWith('- '))
          .join('\n'),
      },
      /3-5 specific capital uses as plain-text bullets/i,
    ],
    [
      'bare-noun bullets with no business outcome',
      {
        ...DRAFT,
        emailBody: DRAFT.emailBody
          .replace(
            '- Ingredient inventory bought ahead of wholesale orders, so margins hold when flour prices move',
            '- Ingredient inventory',
          )
          .replace(
            '- Delivery payroll covered on time while restaurant invoices are still clearing',
            '- Delivery payroll',
          ),
      },
      /ties the use to a business outcome/i,
    ],
    [
      'a jammed generic capital-use sentence',
      {
        ...DRAFT,
        emailBody: DRAFT.emailBody.replace(
          'Based on what I saw about the bakery, here are a few places extra capital could go:',
          'Additional working capital could help with equipment, inventory, staffing, marketing, and operating expenses. Here are a few places it could go:',
        ),
      },
      /jammed into one generic sentence/i,
    ],
    [
      'generic industry-filler bullets',
      {
        ...DRAFT,
        emailBody: DRAFT.emailBody.replace(
          /^- .*$(?:\n- .*$)*/m,
          [
            '- Ingredient inventory bought ahead of wholesale orders, so margins hold when flour prices move',
            '- Delivery payroll covered on time while restaurant invoices are still clearing',
            '- Equipment upgrades so operations keep running smoothly every day',
            '- Marketing pushes that bring in more foot traffic each month',
          ].join('\n'),
        ),
      },
      /generic industry filler rather than grounded in verified research/i,
    ],
    [
      'a missing bank-statement request',
      {
        ...DRAFT,
        emailBody: DRAFT.emailBody.replace(
          'send over 3-4 months of business bank statements and I will see what is available',
          'reply and I will see what is available',
        ),
      },
      /3-4 months of business bank statements/i,
    ],
    [
      'a default request for a call',
      { ...DRAFT, emailBody: `${DRAFT.emailBody} Would you be open to a quick call this week?` },
      /asked for a call instead of requesting bank statements/i,
    ],
    [
      'a default request for a call in the SMS',
      { ...DRAFT, smsBody: `${DRAFT.smsBody} Or we can hop on a call.` },
      /asked for a call instead of requesting bank statements/i,
    ],
  ])('rejects %s', async (_name, draft, expected) => {
    workflow(jsonResponse(researchCompleted()), jsonResponse(generationCompleted(draft)));

    const result = await service().research(REQUEST);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(expected);
  });

  it('accepts five bullets and a call request when the rep asks for one in userNotes', async () => {
    const request: RenewalResearchRequest = {
      ...REQUEST,
      input: { ...REQUEST.input, userNotes: 'Offer a quick call if they prefer.' },
    };
    const draft = {
      ...DRAFT,
      emailBody: `${DRAFT.emailBody.replace(
        '- Wholesale packaging stocked in bulk so new restaurant accounts ship without delay',
        '- Wholesale packaging stocked in bulk so new restaurant accounts ship without delay\n- Bread and pastry production scaled up ahead of larger wholesale orders',
      )} Or we can set up a quick call if that is easier.`,
    };
    workflow(jsonResponse(researchCompleted()), jsonResponse(generationCompleted(draft)));

    const result = await service().research(request);

    expect(result.ok).toBe(true);
  });

  it('regenerates with bullet guidance when the personalization quality test fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(researchCompleted()))
      .mockResolvedValueOnce(
        jsonResponse(
          generationCompleted({
            ...DRAFT,
            emailBody: DRAFT.emailBody
              .split('\n')
              .filter((line) => !line.startsWith('- '))
              .join('\n'),
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(generationCompleted(DRAFT)));

    const result = await service().research(REQUEST);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const retryBody = JSON.parse(String(fetchSpy.mock.calls[2]?.[1]?.body));
    expect(retryBody.input).toContain('The prior draft was generic. Regenerate it');
    expect(retryBody.input).toContain('3-5 research-grounded capital-use bullets');
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
      'incorrect merchant greeting',
      generationCompleted({ ...DRAFT, emailBody: DRAFT.emailBody.replace('Hi Ada', 'Hi Rep') }),
      /merchant by first name in both greetings/i,
    ],
    [
      'incorrect paid-in percentage',
      generationCompleted({ ...DRAFT, emailBody: `${DRAFT.emailBody} You are 55% paid in.` }),
      /incorrect paid-in percentage/i,
    ],
    [
      'unsupported funding amount',
      generationCompleted({
        ...DRAFT,
        emailBody: `${DRAFT.emailBody} A $999,999 option is available.`,
      }),
      /funding amount that was not supplied/i,
    ],
    [
      'unsupported business location',
      generationCompleted({ ...DRAFT, emailBody: `${DRAFT.emailBody} Our CA team can help.` }),
      /unsupported business location/i,
    ],
    [
      'missing calls to action',
      generationCompleted({
        ...DRAFT,
        emailBody: DRAFT.emailBody.replace(
          'If that is useful, send over 3-4 months of business bank statements and I will see what is available.',
          'Thank you.',
        ),
        smsBody: 'Hi Ada, Example Bakery has renewal options with Example Funding.',
      }),
      /clear call to action/i,
    ],
    [
      'mismatched research confidence',
      generationCompleted({ ...DRAFT, researchConfidence: 'low' }),
      /confidence level that did not match/i,
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
        emailBody: DRAFT.emailBody.replace(
          /^- .*$(?:\n- .*$)*/m,
          [
            '- Bread and pastry production scaled up ahead of larger wholesale orders',
            '- Wholesale packaging stocked in bulk so new restaurant accounts ship without delay',
            '- Storefront upgrades that keep retail customers coming back between wholesale runs',
          ].join('\n'),
        ),
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
