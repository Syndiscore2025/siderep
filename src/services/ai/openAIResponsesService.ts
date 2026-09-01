import { buildRenewalGenerationPrompt, buildRenewalResearchPrompt } from '@/prompts';
import { createSideRepAIConfig } from '@/services/ai/aiConfig';
import { buildRenewalMerchantContext } from '@/services/renewal/merchantContext';
import { resolveBusinessLocator } from '@/services/renewal/businessLocator';
import { addressFromGoogleUrl } from '@/services/renewal/googleAddress';
import type {
  RenewalBusinessResearch,
  RenewalDraft,
  RenewalMerchantContext,
  RenewalOutreachObjective,
  RenewalResearchRequest,
  RenewalSource,
  Settings,
} from '@/types';
import { err, ok, toError } from '@/utils';
import type { Result } from '@/utils';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 5_000;

const RESEARCH_KEYS = [
  'exactBusinessVerified',
  'legalBusinessName',
  'dba',
  'address',
  'city',
  'state',
  'website',
  'industry',
  'companyDescription',
  'products',
  'services',
  'customerType',
  'businessModel',
  'locationDetails',
  'currentBusinessActivity',
  'workingCapitalUses',
  'confidence',
] as const;
const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    exactBusinessVerified: { type: 'boolean' },
    legalBusinessName: { type: 'string', maxLength: 500 },
    dba: { type: 'string', maxLength: 500 },
    address: { type: 'string', maxLength: 500 },
    city: { type: 'string', maxLength: 200 },
    state: { type: 'string', maxLength: 100 },
    website: { type: 'string', maxLength: 2_048 },
    industry: { type: 'string', maxLength: 300 },
    companyDescription: { type: 'string', maxLength: 1_200 },
    products: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 300 } },
    services: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 300 } },
    customerType: { type: 'string', maxLength: 500 },
    businessModel: { type: 'string', maxLength: 500 },
    locationDetails: { type: 'string', maxLength: 800 },
    currentBusinessActivity: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 500 },
    },
    workingCapitalUses: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string', maxLength: 300 },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: RESEARCH_KEYS,
} as const;

const OBJECTIVES: RenewalOutreachObjective[] = [
  'renewal',
  'additional_working_capital',
  'additional_position',
  'line_of_credit',
  'term_loan',
  'renewal_plus_alternative_options',
  'existing_outstanding_offer',
];
const DRAFT_KEYS = [
  'outreachObjective',
  'researchFactsUsed',
  'businessSummary',
  'emailSubject',
  'emailBody',
  'smsBody',
] as const;
const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outreachObjective: {
      type: 'string',
      enum: OBJECTIVES,
      description: 'Must exactly match the fixed outreach objective supplied in context.',
    },
    researchFactsUsed: {
      type: 'array',
      minItems: 0,
      maxItems: 4,
      items: { type: 'string', maxLength: 300 },
      description:
        'Two to four short facts grounded in verified business research and used naturally in the email; empty only when the exact business is unverified.',
    },
    businessSummary: {
      type: 'string',
      maxLength: 1_200,
      description:
        'A concise sourced internal profile covering business, location, type, offerings, 4-6 specific working-capital uses, notable verified context, and High/Medium/Low confidence; no citations or URLs.',
    },
    emailSubject: {
      type: 'string',
      maxLength: 200,
      description: 'A copy-ready subject without URLs.',
    },
    emailBody: {
      type: 'string',
      maxLength: 4_000,
      description:
        'A copy-ready email tailored with only verified research or explicitly supplied merchant details and business-specific capital uses; no citations or URLs.',
    },
    smsBody: {
      type: 'string',
      maxLength: 500,
      description:
        'A concise, copy-ready SMS tailored with only verified research or explicitly supplied merchant details; no URLs.',
    },
  },
  required: DRAFT_KEYS,
} as const;

type JsonRecord = Record<string, unknown>;
type DraftContent = Omit<RenewalDraft, 'sources'> & {
  outreachObjective: RenewalOutreachObjective;
  researchFactsUsed: string[];
};
type SourceCandidate = { url: string; title?: string };
type ResponseStage = {
  input: string;
  schemaName?: string;
  schema?: object;
  webSearch: boolean;
  maxOutputTokens?: number;
  applyAIControls?: boolean;
};

export interface RenewalResearchService {
  isConfigured(): boolean;
  testConnection(signal?: AbortSignal): Promise<Result<void>>;
  research(request: RenewalResearchRequest, signal?: AbortSignal): Promise<Result<RenewalDraft>>;
}

function supportsAdvancedResponseControls(model: string): boolean {
  return /^(?:gpt-5(?:[.-]|$)|o[0-9]+(?:-|$))/i.test(model.trim());
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function abortError(): Error {
  return new DOMException('The request was aborted.', 'AbortError');
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      reject(abortError());
    }
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

function retryDelay(response: Response | undefined, attempt: number): number {
  const value = response?.headers.get('Retry-After')?.trim();
  let requested: number | undefined;
  if (value && /^\d+(?:\.\d+)?$/.test(value)) requested = Number(value) * 1_000;
  else if (value) {
    const date = Date.parse(value);
    if (Number.isFinite(date)) requested = Math.max(0, date - Date.now());
  }
  const fallback = BASE_BACKOFF_MS * 2 ** attempt;
  return Math.min(MAX_BACKOFF_MS, Math.max(0, requested ?? fallback));
}

function apiErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined;
  return typeof value.error.message === 'string' && value.error.message.trim()
    ? value.error.message.trim()
    : 'OpenAI returned an API error.';
}

async function readUnknownJson(response: Response): Promise<Result<unknown>> {
  try {
    return ok(await response.json());
  } catch {
    return err(new Error('OpenAI returned malformed JSON.'));
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function parseSource(value: unknown): SourceCandidate | undefined {
  if (!isRecord(value) || typeof value.url !== 'string') return undefined;
  const title = typeof value.title === 'string' ? value.title.trim() : undefined;
  return { url: value.url, ...(title ? { title } : {}) };
}

function sourceFromAnnotation(value: unknown): SourceCandidate | undefined {
  if (!isRecord(value) || value.type !== 'url_citation') return undefined;
  return parseSource(value);
}

function normalizeSource(candidate: SourceCandidate): RenewalSource | undefined {
  try {
    const url = new URL(candidate.url.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    url.hash = '';
    url.searchParams.sort();
    return { title: candidate.title?.trim() || url.hostname, url: url.href };
  } catch {
    return undefined;
  }
}

function normalizeSources(candidates: SourceCandidate[]): RenewalSource[] {
  const sources = new Map<string, RenewalSource>();
  for (const candidate of candidates) {
    const source = normalizeSource(candidate);
    if (!source) continue;
    const existing = sources.get(source.url);
    if (!existing || (existing.title === new URL(existing.url).hostname && candidate.title)) {
      sources.set(source.url, source);
    }
  }
  return [...sources.values()];
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.toLocaleLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sameHost(left: string, right: string): boolean {
  const first = sourceHost(left);
  const second = sourceHost(right);
  return Boolean(
    first &&
    second &&
    (first === second || first.endsWith(`.${second}`) || second.endsWith(`.${first}`)),
  );
}

function sourcePriority(source: RenewalSource, officialWebsite: string): number {
  const host = sourceHost(source.url);
  if (officialWebsite && sameHost(source.url, officialWebsite)) return 0;
  if (host === 'google.com' || host.endsWith('.google.com') || host === 'maps.app.goo.gl') return 1;
  if (
    ['facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com'].some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  )
    return 2;
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 3;
  if (host === 'bbb.org' || host.endsWith('.bbb.org')) return 4;
  return 5;
}

function rankSources(sources: RenewalSource[], officialWebsite: string): RenewalSource[] {
  return sources
    .map((source, index) => ({ source, index }))
    .sort(
      (left, right) =>
        sourcePriority(left.source, officialWebsite) -
          sourcePriority(right.source, officialWebsite) || left.index - right.index,
    )
    .map(({ source }) => source);
}

function comparable(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function valuesMatch(left: string, right: string): boolean {
  const first = comparable(left);
  const second = comparable(right);
  return Boolean(
    first &&
    second &&
    (first === second ||
      (Math.min(first.length, second.length) >= 5 &&
        (first.includes(second) || second.includes(first)))),
  );
}

function verifyResearchIdentity(
  request: RenewalResearchRequest,
  research: RenewalBusinessResearch,
  sources: RenewalSource[],
): boolean {
  if (!research.exactBusinessVerified || !sources.length) return false;
  const input = request.input;
  const locator = resolveBusinessLocator(input.businessLocator);
  const suppliedAddress =
    locator.businessAddress ||
    input.businessAddress ||
    addressFromGoogleUrl(locator.businessAddressGoogleUrl || input.businessAddressGoogleUrl);
  const suppliedWebsite = locator.website || input.website;
  const websiteMatch = Boolean(suppliedWebsite && sameHost(suppliedWebsite, research.website));
  const addressMatch = Boolean(
    suppliedAddress && research.address && valuesMatch(suppliedAddress, research.address),
  );
  const suppliedNames = [input.businessName, input.dba, input.accountName].filter(Boolean);
  const researchedNames = [research.legalBusinessName, research.dba].filter(Boolean);
  const nameMatch = suppliedNames.some((name) =>
    researchedNames.some((researchedName) => valuesMatch(name, researchedName)),
  );
  const nameConflict = Boolean(suppliedNames.length && researchedNames.length && !nameMatch);
  const cityMatch = !input.city || valuesMatch(input.city, research.city);
  const stateMatch = !input.state || valuesMatch(input.state, research.state);
  const cityConflict = Boolean(input.city && research.city && !cityMatch);
  const stateConflict = Boolean(input.state && research.state && !stateMatch);
  if (nameConflict || cityConflict || stateConflict) return false;
  const completeLocationMatch = Boolean(input.city && input.state && cityMatch && stateMatch);
  const googleAddressMatch = Boolean(
    (locator.businessAddressGoogleUrl || input.businessAddressGoogleUrl) &&
    nameMatch &&
    sources.some((source) => {
      const host = sourceHost(source.url);
      return host === 'google.com' || host.endsWith('.google.com') || host === 'maps.app.goo.gl';
    }),
  );
  return websiteMatch || addressMatch || googleAddressMatch || (nameMatch && completeLocationMatch);
}

function stringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === 'string' && item.length <= maxLength)
  );
}

function parseResearchContent(value: unknown): Result<RenewalBusinessResearch> {
  if (!isRecord(value) || Object.keys(value).length !== RESEARCH_KEYS.length) {
    return err(new Error('OpenAI output did not match the business research schema.'));
  }
  const stringKeys = [
    'legalBusinessName',
    'dba',
    'address',
    'city',
    'state',
    'website',
    'industry',
    'companyDescription',
    'customerType',
    'businessModel',
    'locationDetails',
  ] as const;
  if (
    typeof value.exactBusinessVerified !== 'boolean' ||
    !stringKeys.every((key) => typeof value[key] === 'string') ||
    !stringArray(value.products, 8, 300) ||
    !stringArray(value.services, 8, 300) ||
    !stringArray(value.currentBusinessActivity, 8, 500) ||
    !stringArray(value.workingCapitalUses, 6, 300) ||
    !['high', 'medium', 'low'].includes(String(value.confidence))
  ) {
    return err(new Error('OpenAI output did not match the business research schema.'));
  }
  if (value.website && !normalizeSource({ url: value.website })) {
    return err(new Error('OpenAI business research contained an unsafe website.'));
  }
  return ok(value as unknown as RenewalBusinessResearch);
}

function parseDraftContent(
  value: unknown,
  expectedObjective: RenewalOutreachObjective,
): Result<DraftContent> {
  if (!isRecord(value) || Object.keys(value).length !== DRAFT_KEYS.length) {
    return err(new Error('OpenAI output did not match the renewal draft schema.'));
  }
  if (
    typeof value.outreachObjective !== 'string' ||
    !stringArray(value.researchFactsUsed, 4, 300) ||
    typeof value.businessSummary !== 'string' ||
    typeof value.emailSubject !== 'string' ||
    typeof value.emailBody !== 'string' ||
    typeof value.smsBody !== 'string'
  ) {
    return err(new Error('OpenAI output did not match the renewal draft schema.'));
  }
  if (value.outreachObjective !== expectedObjective) {
    return err(new Error('OpenAI output did not preserve the selected outreach objective.'));
  }
  const draft: DraftContent = {
    outreachObjective: value.outreachObjective as RenewalOutreachObjective,
    researchFactsUsed: value.researchFactsUsed,
    businessSummary: value.businessSummary,
    emailSubject: value.emailSubject.trim(),
    emailBody: value.emailBody.trim(),
    smsBody: value.smsBody.trim(),
  };
  if (
    [draft.businessSummary, draft.emailSubject, draft.emailBody, draft.smsBody]
      .concat(draft.researchFactsUsed)
      .some((value) => /(?:https?:\/\/|www\.)/i.test(value))
  ) {
    return err(new Error('OpenAI output contained a URL outside API source metadata.'));
  }
  if (!draft.emailSubject || !draft.emailBody || !draft.smsBody) {
    return err(new Error('OpenAI returned an incomplete renewal draft.'));
  }
  return ok(draft);
}

function collectOutput(
  value: unknown,
  requireWebSearch: boolean,
): Result<{ text: string; sources: RenewalSource[] }> {
  if (!isRecord(value)) return err(new Error('OpenAI returned a malformed response envelope.'));
  const apiMessage = apiErrorMessage(value);
  if (apiMessage) return err(new Error(apiMessage));
  if (value.status === 'incomplete') {
    const reason =
      isRecord(value.incomplete_details) && typeof value.incomplete_details.reason === 'string'
        ? `: ${value.incomplete_details.reason}`
        : '';
    return err(new Error(`OpenAI response was incomplete${reason}.`));
  }
  if (value.status !== 'completed') {
    return err(new Error('OpenAI response did not complete successfully.'));
  }
  if (!Array.isArray(value.output)) {
    return err(new Error('OpenAI response was missing output.'));
  }

  const texts: string[] = [];
  const candidates: SourceCandidate[] = [];
  let performedWebSearch = false;
  for (const item of value.output) {
    if (!isRecord(item)) continue;
    if (item.type === 'web_search_call') {
      performedWebSearch = true;
      if (isRecord(item.action) && Array.isArray(item.action.sources)) {
        for (const source of item.action.sources) {
          const candidate = parseSource(source);
          if (candidate) candidates.push(candidate);
        }
      }
    }
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (content.type === 'refusal') {
        return err(new Error('OpenAI refused to generate the renewal draft.'));
      }
      if (content.type !== 'output_text') continue;
      if (typeof content.text !== 'string') {
        return err(new Error('OpenAI returned malformed output text.'));
      }
      texts.push(content.text);
      if (Array.isArray(content.annotations)) {
        for (const annotation of content.annotations) {
          const candidate = sourceFromAnnotation(annotation);
          if (candidate) candidates.push(candidate);
        }
      }
    }
  }
  if (requireWebSearch && !performedWebSearch) {
    return err(new Error('OpenAI did not perform the required web research.'));
  }
  if (texts.length !== 1 || !texts[0]?.trim()) {
    return err(
      new Error(
        texts.length ? 'OpenAI returned ambiguous output.' : 'OpenAI output text was missing.',
      ),
    );
  }
  return ok({ text: texts[0], sources: normalizeSources(candidates) });
}

function parseJson(text: string): Result<unknown> {
  try {
    return ok(JSON.parse(text));
  } catch {
    return err(new Error('OpenAI output was not valid JSON.'));
  }
}

function parseResearchResponse(
  value: unknown,
  request: RenewalResearchRequest,
  requireWebSearch: boolean,
): Result<{ research: RenewalBusinessResearch; sources: RenewalSource[] }> {
  const output = collectOutput(value, requireWebSearch);
  if (!output.ok) return output;
  const parsed = parseJson(output.value.text);
  if (!parsed.ok) return parsed;
  const content = parseResearchContent(parsed.value);
  if (!content.ok) return content;
  const locator = resolveBusinessLocator(request.input.businessLocator);
  const sources = rankSources(
    output.value.sources,
    locator.website || request.input.website || content.value.website,
  );
  const verified = verifyResearchIdentity(request, content.value, sources);
  const research = verified
    ? content.value
    : { ...content.value, exactBusinessVerified: false, confidence: 'low' as const };
  return ok({ research, sources });
}

function anchors(values: string[]): string[] {
  const ignored = new Set([
    'business',
    'company',
    'service',
    'services',
    'working',
    'capital',
    'funding',
    'additional',
    'expenses',
    'could',
    'help',
    'their',
    'with',
  ]);
  return values
    .flatMap((value) => [value, ...value.split(/[^A-Za-z0-9]+/)])
    .map((value) => value.trim().toLocaleLowerCase())
    .filter((value) => value.length >= 4 && !ignored.has(value));
}

function includesAny(text: string, values: string[]): boolean {
  const normalized = text.toLocaleLowerCase();
  return values.some((value) => value && normalized.includes(value.toLocaleLowerCase()));
}

const RESTRICTED_CLAIMS = [
  {
    name: 'revenue growth',
    pattern:
      /\b(?:(?:revenue|sales)\s+(?:has\s+)?(?:grown|growth|increased|increasing)|growing\s+(?:revenue|sales))\b/i,
  },
  { name: 'profitability', pattern: /\bprofitab(?:le|ility)\b/i },
  {
    name: 'employee count',
    pattern:
      /\b(?:(?:employs?|employees?|staff)\s+(?:of\s+)?[0-9]+|[0-9]+\s+(?:employees?|staff members?))\b/i,
  },
  {
    name: 'contracts',
    pattern: /\b(?:(?:new|major|specific|large)\s+contracts?|contract(?:s|ed)?\s+with)\b/i,
  },
  { name: 'expansion', pattern: /\b(?:expansion|expanded|expanding)\b/i },
  {
    name: 'new locations',
    pattern: /\b(?:new locations?|opened?\s+(?:a\s+)?(?:new|second)\s+location)\b/i,
  },
  {
    name: 'customer volume',
    pattern: /\b(?:customer volume|customers?\s+(?:has|have)\s+(?:grown|increased))\b/i,
  },
] as const;

function validateRestrictedClaims(
  content: DraftContent,
  context: RenewalMerchantContext,
): Result<DraftContent> {
  const outreach = `${content.emailSubject}\n${content.emailBody}\n${content.smsBody}`;
  const suppliedContext = JSON.stringify({ merchant: context.merchant, funding: context.funding });
  const verifiedResearch = context.businessResearch.exactBusinessVerified
    ? JSON.stringify(context.businessResearch)
    : '';
  const support = `${suppliedContext}\n${verifiedResearch}`;
  for (const claim of RESTRICTED_CLAIMS) {
    if (claim.pattern.test(outreach) && !claim.pattern.test(support)) {
      return err(new Error(`OpenAI introduced unsupported ${claim.name} information.`));
    }
  }
  return ok(content);
}

function moneyValue(value: string): string {
  return value.match(/\$\s?[0-9][0-9,]*(?:\.[0-9]{2})?/)?.[0].replace(/[\s,]/g, '') ?? '';
}

function includesMoney(text: string, amount: string): boolean {
  return !amount || text.replace(/[\s,]/g, '').includes(amount);
}

function validateFundingScenario(
  content: DraftContent,
  context: RenewalMerchantContext,
): Result<DraftContent> {
  const email = content.emailBody;
  const copy = `${content.emailSubject}\n${content.emailBody}\n${content.smsBody}`;
  const scenario = context.fundingScenario;
  if (scenario.primary === 'renewal_eligible') {
    if (!/(?:reached|at|now).{0,30}renewal eligib|eligible.{0,20}renewal/i.test(email)) {
      return err(new Error('OpenAI did not state that the merchant reached renewal eligibility.'));
    }
    if (context.funding.currentLender && !includesAny(email, [context.funding.currentLender])) {
      return err(
        new Error('OpenAI omitted the supplied current lender from eligible renewal outreach.'),
      );
    }
    const payoffLanguage = /\b(?:pay\s*off|payoff|refinanc|consolidat)/i.test(copy);
    if (scenario.payoffSupported !== payoffLanguage) {
      return err(new Error('OpenAI used incorrect renewal payoff language.'));
    }
    const singlePositionLanguage = /\b(?:one|single)\s+(?:position|payment)\b/i.test(copy);
    if (scenario.singlePositionSupported !== singlePositionLanguage) {
      return err(new Error('OpenAI used incorrect single-position language.'));
    }
    if (
      context.funding.specialLenderIncentives &&
      !includesAny(email, anchors([context.funding.specialLenderIncentives]))
    ) {
      return err(new Error('OpenAI omitted the supplied lender-specific renewal incentive.'));
    }
  } else if (scenario.primary !== 'outstanding_offer') {
    if (!/(?:not (?:quite|yet)|haven't|have not).{0,40}renewal|before.{0,30}renewal/i.test(email)) {
      return err(
        new Error('OpenAI did not explain that the merchant is not yet renewal eligible.'),
      );
    }
    if (!/(?:additional (?:working )?capital|another funding option)/i.test(email)) {
      return err(new Error('OpenAI omitted the possible additional working-capital path.'));
    }
    if (/(?:review|discuss|offer).{0,20}renewal options?|renewal offer/i.test(email)) {
      return err(new Error('OpenAI incorrectly pitched a renewal before eligibility.'));
    }
  }
  if (scenario.includesLineOfCredit) {
    if (!/(?:line of credit|\bLOC\b)/i.test(copy) || !/(?:draw|as needed)/i.test(copy)) {
      return err(new Error('OpenAI did not explain line-of-credit draw flexibility.'));
    }
    if (!includesMoney(copy, moneyValue(context.funding.possibleLineOfCredit))) {
      return err(new Error('OpenAI omitted the supplied line-of-credit amount.'));
    }
  }
  if (scenario.includesTermLoan) {
    if (
      !/(?:term loan|term product)/i.test(email) ||
      !/(?:payment history|payment track record|worth (?:checking|exploring))/i.test(email)
    ) {
      return err(new Error('OpenAI did not frame the term-loan scenario from payment history.'));
    }
    if (
      /(?:better pricing|lower rate|reduced rate)/i.test(copy) &&
      !/(?:better pricing|lower rate|reduced rate)/i.test(context.funding.specialLenderIncentives)
    ) {
      return err(new Error('OpenAI invented unsupported term-loan pricing.'));
    }
  }
  if (scenario.primary === 'outstanding_offer') {
    if (!/\boffer\b/i.test(email)) {
      return err(new Error('OpenAI did not make the outstanding offer the outreach focus.'));
    }
    if (!includesMoney(email, moneyValue(context.funding.existingOutstandingOffer))) {
      return err(new Error('OpenAI omitted the supplied outstanding-offer amount.'));
    }
    const supportedUrgencyLanguage = /(?:expir|deadline|act now|urgent|limited time)/i.test(copy);
    const unsupportedUrgencyLanguage = /(?:expires? soon|act now|urgent|limited time)/i.test(copy);
    if (
      (scenario.expirationUrgencySupported && !supportedUrgencyLanguage) ||
      (!scenario.expirationUrgencySupported && unsupportedUrgencyLanguage)
    ) {
      return err(new Error('OpenAI used incorrect outstanding-offer urgency.'));
    }
  }
  const approvalSupported = /\b(?:approved|approval)\b/i.test(
    context.funding.existingOutstandingOffer,
  );
  if (!approvalSupported && /(?:guaranteed approval|pre-?approved|approved for)/i.test(copy)) {
    return err(new Error('OpenAI introduced an unsupported approval claim.'));
  }
  return ok(content);
}

function validatePersonalization(
  content: DraftContent,
  context: RenewalMerchantContext,
): Result<DraftContent> {
  const identityAnchors = [
    context.merchant.merchantFirstName,
    context.merchant.legalBusinessName,
    context.merchant.dba,
    ...anchors([context.merchant.legalBusinessName, context.merchant.dba]),
  ].filter(Boolean);
  if (
    identityAnchors.length &&
    (!includesAny(`${content.emailSubject}\n${content.emailBody}`, identityAnchors) ||
      !includesAny(content.smsBody, identityAnchors))
  ) {
    return err(new Error('OpenAI output was not personalized to the supplied merchant identity.'));
  }
  const claims = validateRestrictedClaims(content, context);
  if (!claims.ok) return claims;
  const scenario = validateFundingScenario(content, context);
  if (!scenario.ok) return scenario;
  if (!context.businessResearch.exactBusinessVerified) {
    if (content.researchFactsUsed.length) {
      return err(
        new Error('OpenAI used business research before the exact merchant was verified.'),
      );
    }
    const suppliedContext = JSON.stringify({
      merchant: context.merchant,
      funding: context.funding,
    });
    const unverifiedAnchors = anchors([
      context.businessResearch.industry,
      context.businessResearch.companyDescription,
      ...context.businessResearch.products,
      ...context.businessResearch.services,
      context.businessResearch.customerType,
      context.businessResearch.businessModel,
      context.businessResearch.locationDetails,
      ...context.businessResearch.currentBusinessActivity,
      ...context.businessResearch.workingCapitalUses,
    ]).filter((value) => !includesAny(suppliedContext, [value]));
    if (unverifiedAnchors.length && includesAny(content.emailBody, unverifiedAnchors)) {
      return err(new Error('OpenAI used unverified business research in outreach.'));
    }
    return ok(content);
  }
  const facts = content.researchFactsUsed.map((fact) => fact.trim()).filter(Boolean);
  if (
    facts.length < 2 ||
    facts.length > 4 ||
    new Set(facts.map(comparable)).size !== facts.length
  ) {
    return err(new Error('OpenAI did not select 2-4 distinct verified business facts.'));
  }
  const researchCorpus = [
    context.businessResearch.industry,
    context.businessResearch.companyDescription,
    ...context.businessResearch.products,
    ...context.businessResearch.services,
    context.businessResearch.customerType,
    context.businessResearch.businessModel,
    context.businessResearch.locationDetails,
    ...context.businessResearch.currentBusinessActivity,
    ...context.businessResearch.workingCapitalUses,
  ].join('\n');
  for (const fact of facts) {
    const factAnchors = anchors([fact]);
    if (!factAnchors.length || !includesAny(researchCorpus, factAnchors)) {
      return err(new Error('OpenAI selected a fact that was not grounded in verified research.'));
    }
    if (!includesAny(content.emailBody, factAnchors)) {
      return err(new Error('OpenAI did not naturally incorporate every selected research fact.'));
    }
  }
  const selectedFactAnchors = anchors(facts);
  if (selectedFactAnchors.length && !includesAny(content.smsBody, selectedFactAnchors)) {
    return err(new Error('OpenAI SMS did not use any selected business research.'));
  }
  return ok(content);
}

function parseGenerationResponse(
  value: unknown,
  context: RenewalMerchantContext,
  sources: RenewalSource[],
): Result<RenewalDraft> {
  const output = collectOutput(value, false);
  if (!output.ok) return output;
  const parsed = parseJson(output.value.text);
  if (!parsed.ok) return parsed;
  const content = parseDraftContent(parsed.value, context.outreachObjective);
  if (!content.ok) return content;
  const personalized = validatePersonalization(content.value, context);
  if (!personalized.ok) return personalized;
  const { outreachObjective: _objective, researchFactsUsed: _facts, ...draft } = personalized.value;
  const businessSummary =
    sources.length && context.businessResearch.exactBusinessVerified ? draft.businessSummary : '';
  return ok({ ...draft, businessSummary, sources });
}

export class OpenAIResponsesService implements RenewalResearchService {
  private readonly config: ReturnType<typeof createSideRepAIConfig>;

  constructor(private readonly settings: Settings) {
    this.config = createSideRepAIConfig(settings);
  }

  isConfigured(): boolean {
    return Boolean(this.settings.renewalAI.apiKey.trim() && this.config.model);
  }

  private requestBody(stage: ResponseStage): string {
    const useAdvancedControls =
      stage.applyAIControls !== false && supportsAdvancedResponseControls(this.config.model);
    const text = {
      ...(useAdvancedControls ? { verbosity: this.config.verbosity } : {}),
      ...(stage.schema && stage.schemaName
        ? {
            format: {
              type: 'json_schema',
              name: stage.schemaName,
              strict: true,
              schema: stage.schema,
            },
          }
        : {}),
    };
    return JSON.stringify({
      model: this.config.model,
      input: stage.input,
      store: false,
      ...(useAdvancedControls ? { reasoning: { effort: this.config.reasoningEffort } } : {}),
      ...(stage.webSearch && this.config.webSearchEnabled
        ? {
            tools: [{ type: 'web_search', search_context_size: 'high', external_web_access: true }],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
          }
        : {}),
      max_output_tokens: stage.maxOutputTokens ?? this.config.maxOutputTokens,
      ...(Object.keys(text).length ? { text } : {}),
    });
  }

  async testConnection(signal?: AbortSignal): Promise<Result<void>> {
    const response = await this.request(
      {
        input: 'Respond with exactly: OK',
        webSearch: false,
        maxOutputTokens: 16,
        applyAIControls: false,
      },
      signal,
    );
    if (!response.ok) return response;
    const output = collectOutput(response.value, false);
    if (!output.ok) return output;
    return output.value.text.trim() === 'OK'
      ? ok(undefined)
      : err(new Error('OpenAI test connection returned an unexpected response.'));
  }

  private async request(stage: ResponseStage, signal?: AbortSignal): Promise<Result<unknown>> {
    if (!this.isConfigured()) {
      return err(new Error('Renewal AI is not configured. Add an API key and model in Settings.'));
    }
    if (signal?.aborted) return err(abortError());

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response: Response | undefined;
      try {
        response = await fetch(RESPONSES_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.settings.renewalAI.apiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: this.requestBody(stage),
          signal,
        });
        if (response.ok) return readUnknownJson(response);

        const body = await readUnknownJson(response);
        const message = body.ok ? apiErrorMessage(body.value) : undefined;
        const failure = new Error(
          message ?? `OpenAI request failed with status ${response.status}.`,
        );
        if (!isRetryableStatus(response.status) || attempt === MAX_RETRIES) return err(failure);
      } catch (error) {
        const failure = toError(error);
        if (signal?.aborted || failure.name === 'AbortError' || attempt === MAX_RETRIES) {
          return err(failure);
        }
      }

      try {
        await wait(retryDelay(response, attempt), signal);
      } catch (error) {
        return err(signal?.aborted ? abortError() : toError(error));
      }
    }
    return err(new Error('OpenAI request failed.'));
  }

  async research(
    request: RenewalResearchRequest,
    signal?: AbortSignal,
  ): Promise<Result<RenewalDraft>> {
    const researchResponse = await this.request(
      {
        input: buildRenewalResearchPrompt(request, this.config.webSearchEnabled),
        schemaName: 'renewal_business_research',
        schema: RESEARCH_SCHEMA,
        webSearch: true,
      },
      signal,
    );
    if (!researchResponse.ok) return researchResponse;
    const researched = parseResearchResponse(
      researchResponse.value,
      request,
      this.config.webSearchEnabled,
    );
    if (!researched.ok) return researched;
    const context = buildRenewalMerchantContext(request, researched.value.research);
    const generationResponse = await this.request(
      {
        input: buildRenewalGenerationPrompt(context),
        schemaName: 'renewal_personalized_outreach',
        schema: DRAFT_SCHEMA,
        webSearch: false,
      },
      signal,
    );
    return generationResponse.ok
      ? parseGenerationResponse(generationResponse.value, context, researched.value.sources)
      : generationResponse;
  }
}

export function createRenewalResearchService(settings: Settings): RenewalResearchService {
  return new OpenAIResponsesService(settings);
}

/** @deprecated Use the Renewal-specific research factory. */
export const createRenewalAIService = createRenewalResearchService;
