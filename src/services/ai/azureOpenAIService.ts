import { isAzureConfigured } from '@/types';
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResult,
  Settings,
} from '@/types';
import { err, ok, toError, logger } from '@/utils';
import type { Result } from '@/utils';

/**
 * Azure OpenAI chat service.
 *
 * Talks to the Azure "chat completions" REST endpoint:
 *   `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`
 * authenticated with the `api-key` header. Supports a buffered `complete()`,
 * a streaming `completeStream()` (Server-Sent Events), retry with exponential
 * backoff on transient failures, and a cheap `testConnection()` probe.
 */

const log = logger.scope('ai');

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AzureChoiceDelta {
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: { message?: string };
}

export interface AIService {
  /** True when the minimum Azure configuration is present. */
  isConfigured(): boolean;
  /** Buffered completion — resolves once the full reply is available. */
  complete(request: ChatCompletionRequest): Promise<Result<ChatCompletionResult>>;
  /** Streaming completion — yields incremental chunks as they arrive. */
  completeStream(request: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk>;
  /** Cheap probe that verifies the endpoint, deployment, and key work. */
  testConnection(signal?: AbortSignal): Promise<Result<void>>;
}

export class AzureOpenAIService implements AIService {
  constructor(private readonly settings: Settings) {}

  isConfigured(): boolean {
    return isAzureConfigured(this.settings);
  }

  private endpointUrl(): string {
    const base = this.settings.azure.endpoint.trim().replace(/\/+$/, '');
    const deployment = encodeURIComponent(this.settings.azure.deployment.trim());
    const apiVersion = encodeURIComponent(this.settings.azure.apiVersion.trim());
    return `${base}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  }

  private body(request: ChatCompletionRequest, stream: boolean): string {
    return JSON.stringify({
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream,
    });
  }

  /** Issues the request with retry/backoff on transient network/5xx errors. */
  private async request(
    request: ChatCompletionRequest,
    stream: boolean,
  ): Promise<Result<Response>> {
    if (!this.isConfigured()) {
      return err(
        new Error('Azure is not configured. Add your endpoint, deployment, and key in Settings.'),
      );
    }

    const url = this.endpointUrl();
    let lastError: Error = new Error('Request failed');

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.settings.azure.apiKey,
          },
          body: this.body(request, stream),
          signal: request.signal,
        });

        if (response.ok) return ok(response);

        const detail = await response.text().catch(() => '');
        lastError = new Error(
          `Azure request failed (${response.status} ${response.statusText})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
        );

        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
          return err(lastError);
        }
      } catch (error) {
        lastError = toError(error);
        if (request.signal?.aborted || attempt === MAX_RETRIES) {
          return err(lastError);
        }
      }

      const backoff = BASE_BACKOFF_MS * 2 ** attempt;
      log.warn(`retrying Azure request in ${backoff}ms (attempt ${attempt + 1})`);
      await sleep(backoff);
    }

    return err(lastError);
  }

  async complete(request: ChatCompletionRequest): Promise<Result<ChatCompletionResult>> {
    const result = await this.request(request, false);
    if (!result.ok) return result;

    try {
      const data = (await result.value.json()) as AzureChoiceDelta;
      if (data.error?.message) return err(new Error(data.error.message));

      const content = data.choices?.[0]?.message?.content ?? '';
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined;
      return ok({ content, usage });
    } catch (error) {
      return err(toError(error));
    }
  }

  async *completeStream(request: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk> {
    const result = await this.request(request, true);
    if (!result.ok) throw result.error;

    const reader = result.value.body?.getReader();
    if (!reader) {
      // Provider returned no stream — surface the buffered content as one chunk.
      const buffered = await this.complete(request);
      if (!buffered.ok) throw buffered.error;
      yield { content: buffered.value.content, done: true };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          yield { content: '', done: true };
          return;
        }
        try {
          const parsed = JSON.parse(payload) as AzureChoiceDelta;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield { content: delta, done: false };
        } catch {
          // Ignore keep-alive comments and partial fragments.
        }
      }
    }

    yield { content: '', done: true };
  }

  async testConnection(signal?: AbortSignal): Promise<Result<void>> {
    const probe: ChatCompletionRequest = {
      messages: [{ role: 'user', content: 'ping' }],
      model: this.settings.ai.model,
      temperature: 0,
      maxTokens: 1,
      signal,
    };
    const result = await this.complete(probe);
    return result.ok ? ok(undefined) : err(result.error);
  }
}

export function createAIService(settings: Settings): AIService {
  return new AzureOpenAIService(settings);
}
