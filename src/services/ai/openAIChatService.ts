import { isAssistantAIConfigured } from '@/types';
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResult,
  Settings,
} from '@/types';
import { err, logger, ok, toError } from '@/utils';
import type { Result } from '@/utils';

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const log = logger.scope('ai');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usesModernCompletionParameters(model: string): boolean {
  return /^(?:gpt-5(?:[.-]|$)|o[0-9]+(?:-|$))/i.test(model.trim());
}

interface OpenAIChoiceEnvelope {
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: { message?: string };
}

export interface AIService {
  isConfigured(): boolean;
  complete(request: ChatCompletionRequest): Promise<Result<ChatCompletionResult>>;
  completeStream(request: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk>;
  testConnection(signal?: AbortSignal): Promise<Result<void>>;
}

export class OpenAIChatService implements AIService {
  constructor(private readonly settings: Settings) {}

  isConfigured(): boolean {
    return isAssistantAIConfigured(this.settings);
  }

  private body(request: ChatCompletionRequest, stream: boolean): string {
    const model = this.settings.assistantAI.model.trim();
    const completionControl = usesModernCompletionParameters(model)
      ? { max_completion_tokens: request.maxTokens }
      : { temperature: request.temperature, max_tokens: request.maxTokens };
    return JSON.stringify({
      model,
      messages: request.messages,
      ...completionControl,
      stream,
      store: false,
    });
  }

  private async request(
    request: ChatCompletionRequest,
    stream: boolean,
  ): Promise<Result<Response>> {
    if (!this.isConfigured()) {
      return err(
        new Error('OpenAI Assistant is not configured. Add its API key and model in Settings.'),
      );
    }

    let lastError: Error = new Error('Request failed');
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(CHAT_COMPLETIONS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.settings.assistantAI.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: this.body(request, stream),
          signal: request.signal,
        });
        if (response.ok) return ok(response);

        const detail = await response.text().catch(() => '');
        lastError = new Error(
          `OpenAI request failed (${response.status} ${response.statusText})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
        );
        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
          return err(lastError);
        }
      } catch (error) {
        lastError = toError(error);
        if (request.signal?.aborted || attempt === MAX_RETRIES) return err(lastError);
      }

      const backoff = BASE_BACKOFF_MS * 2 ** attempt;
      log.warn(`retrying OpenAI request in ${backoff}ms (attempt ${attempt + 1})`);
      await sleep(backoff);
    }
    return err(lastError);
  }

  async complete(request: ChatCompletionRequest): Promise<Result<ChatCompletionResult>> {
    const result = await this.request(request, false);
    if (!result.ok) return result;
    try {
      const data = (await result.value.json()) as OpenAIChoiceEnvelope;
      if (data.error?.message) return err(new Error(data.error.message));
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined;
      return ok({ content: data.choices?.[0]?.message?.content ?? '', usage });
    } catch (error) {
      return err(toError(error));
    }
  }

  async *completeStream(request: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk> {
    const result = await this.request(request, true);
    if (!result.ok) throw result.error;
    const reader = result.value.body?.getReader();
    if (!reader) {
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
          const parsed = JSON.parse(payload) as OpenAIChoiceEnvelope;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield { content: delta, done: false };
        } catch {
          // Ignore SSE comments and malformed keep-alives.
        }
      }
    }
    yield { content: '', done: true };
  }

  async testConnection(signal?: AbortSignal): Promise<Result<void>> {
    const result = await this.complete({
      messages: [{ role: 'user', content: 'ping' }],
      model: this.settings.assistantAI.model,
      temperature: 0,
      maxTokens: 1,
      signal,
    });
    return result.ok ? ok(undefined) : err(result.error);
  }
}

export function createAIService(settings: Settings): AIService {
  return new OpenAIChatService(settings);
}
