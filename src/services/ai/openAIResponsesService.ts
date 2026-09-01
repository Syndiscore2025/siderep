import { buildRenewalPrompt } from '@/prompts';
import type { RenewalDraft, RenewalResearchRequest, RenewalSource, Settings } from '@/types';
import { err, ok, toError } from '@/utils';
import type { Result } from '@/utils';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 5_000;
const MAX_OUTPUT_TOKENS = 2_000;

const DRAFT_KEYS = ['businessSummary', 'emailSubject', 'emailBody', 'smsBody'] as const;
const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
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
type DraftContent = Omit<RenewalDraft, 'sources'>;
type SourceCandidate = { url: string; title?: string };

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

function parseDraftContent(value: unknown): Result<DraftContent> {
  if (!isRecord(value) || Object.keys(value).length !== DRAFT_KEYS.length) {
    return err(new Error('OpenAI output did not match the renewal draft schema.'));
  }
  if (
    typeof value.businessSummary !== 'string' ||
    typeof value.emailSubject !== 'string' ||
    typeof value.emailBody !== 'string' ||
    typeof value.smsBody !== 'string'
  ) {
    return err(new Error('OpenAI output did not match the renewal draft schema.'));
  }
  const draft: DraftContent = {
    businessSummary: value.businessSummary,
    emailSubject: value.emailSubject,
    emailBody: value.emailBody,
    smsBody: value.smsBody,
  };
  if (DRAFT_KEYS.some((key) => /(?:https?:\/\/|www\.)/i.test(draft[key]))) {
    return err(new Error('OpenAI output contained a URL outside API source metadata.'));
  }
  return ok(draft);
}

function collectOutput(value: unknown): Result<{ text: string; sources: RenewalSource[] }> {
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
  if (!performedWebSearch) {
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

function parseResponse(value: unknown): Result<RenewalDraft> {
  const output = collectOutput(value);
  if (!output.ok) return output;
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.value.text);
  } catch {
    return err(new Error('OpenAI output was not valid JSON.'));
  }
  const content = parseDraftContent(parsed);
  if (!content.ok) return content;
  // Outreach may still use the merchant data explicitly supplied by the rep.
  // If web search returned no verifiable source, suppress the model's factual
  // summary rather than blocking otherwise useful email and SMS drafts.
  const businessSummary = output.value.sources.length ? content.value.businessSummary : '';
  return ok({ ...content.value, businessSummary, sources: output.value.sources });
}

export class OpenAIResponsesService implements RenewalResearchService {
  constructor(private readonly settings: Settings) {}

  isConfigured(): boolean {
    return Boolean(this.settings.renewalAI.apiKey.trim() && this.settings.renewalAI.model.trim());
  }

  private requestBody(request: RenewalResearchRequest): string {
    return JSON.stringify({
      model: this.settings.renewalAI.model.trim(),
      input: buildRenewalPrompt(request),
      store: false,
      tools: [{ type: 'web_search', search_context_size: 'high', external_web_access: true }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: 'json_schema',
          name: 'renewal_draft',
          strict: true,
          schema: DRAFT_SCHEMA,
        },
      },
    });
  }

  private async request(
    request: RenewalResearchRequest,
    signal?: AbortSignal,
  ): Promise<Result<unknown>> {
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
          body: this.requestBody(request),
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
    const response = await this.request(request, signal);
    return response.ok ? parseResponse(response.value) : response;
  }
}

export function createRenewalResearchService(settings: Settings): RenewalResearchService {
  return new OpenAIResponsesService(settings);
}

/** @deprecated Use the Renewal-specific research factory. */
export const createRenewalAIService = createRenewalResearchService;
