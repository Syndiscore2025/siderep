import { buildRenewalGenerationPrompt, buildRenewalResearchPrompt } from '@/prompts';
import { buildRenewalMerchantContext } from '@/services/renewal/merchantContext';
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
const MAX_OUTPUT_TOKENS = 4_000;

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
};
type SourceCandidate = { url: string; title?: string };
type ResponseStage = {
  input: string;
  schemaName: string;
  schema: object;
  webSearch: boolean;
};

export interface RenewalResearchService {
  isConfigured(): boolean;
  research(request: RenewalResearchRequest, signal?: AbortSignal): Promise<Result<RenewalDraft>>;
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
    businessSummary: value.businessSummary,
    emailSubject: value.emailSubject.trim(),
    emailBody: value.emailBody.trim(),
    smsBody: value.smsBody.trim(),
  };
  if (DRAFT_KEYS.some((key) => /(?:https?:\/\/|www\.)/i.test(draft[key]))) {
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
): Result<{ research: RenewalBusinessResearch; sources: RenewalSource[] }> {
  const output = collectOutput(value, true);
  if (!output.ok) return output;
  const parsed = parseJson(output.value.text);
  if (!parsed.ok) return parsed;
  const content = parseResearchContent(parsed.value);
  if (!content.ok) return content;
  const research = output.value.sources.length
    ? content.value
    : { ...content.value, exactBusinessVerified: false, confidence: 'low' as const };
  return ok({ research, sources: output.value.sources });
}

function anchors(values: string[]): string[] {
  const ignored = new Set(['business', 'company', 'service', 'services', 'working', 'capital']);
  return values
    .flatMap((value) => [value, ...value.split(/[^A-Za-z0-9]+/)])
    .map((value) => value.trim().toLocaleLowerCase())
    .filter((value) => value.length >= 4 && !ignored.has(value));
}

function includesAny(text: string, values: string[]): boolean {
  const normalized = text.toLocaleLowerCase();
  return values.some((value) => value && normalized.includes(value.toLocaleLowerCase()));
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
  if (context.businessResearch.exactBusinessVerified) {
    const identityTokens = new Set(
      anchors([context.merchant.legalBusinessName, context.merchant.dba]),
    );
    const researchAnchors = anchors([
      context.businessResearch.industry,
      ...context.businessResearch.products,
      ...context.businessResearch.services,
      ...context.businessResearch.workingCapitalUses,
    ]).filter((value) => !identityTokens.has(value));
    if (researchAnchors.length && !includesAny(content.emailBody, researchAnchors)) {
      return err(new Error('OpenAI email did not use the verified business research.'));
    }
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
  const { outreachObjective: _objective, ...draft } = personalized.value;
  const businessSummary =
    sources.length && context.businessResearch.exactBusinessVerified ? draft.businessSummary : '';
  return ok({ ...draft, businessSummary, sources });
}

export class OpenAIResponsesService implements RenewalResearchService {
  constructor(private readonly settings: Settings) {}

  isConfigured(): boolean {
    return Boolean(this.settings.renewalAI.apiKey.trim() && this.settings.renewalAI.model.trim());
  }

  private requestBody(stage: ResponseStage): string {
    return JSON.stringify({
      model: this.settings.renewalAI.model.trim(),
      input: stage.input,
      store: false,
      ...(stage.webSearch
        ? {
            tools: [{ type: 'web_search', search_context_size: 'high', external_web_access: true }],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
          }
        : {}),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: 'json_schema',
          name: stage.schemaName,
          strict: true,
          schema: stage.schema,
        },
      },
    });
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
        input: buildRenewalResearchPrompt(request),
        schemaName: 'renewal_business_research',
        schema: RESEARCH_SCHEMA,
        webSearch: true,
      },
      signal,
    );
    if (!researchResponse.ok) return researchResponse;
    const researched = parseResearchResponse(researchResponse.value);
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
