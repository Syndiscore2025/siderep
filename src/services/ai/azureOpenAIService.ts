import { isAzureConfigured } from '@/types';
import type { ChatCompletionRequest, ChatCompletionResult, Settings } from '@/types';
import { err, logger } from '@/utils';
import type { Result } from '@/utils';

/**
 * Azure OpenAI chat service.
 *
 * PHASE 1: placeholder. The interface and request/response contracts are final
 * so the UI is built against them today. PHASE 2 fills `complete()` with a
 * `fetch` to
 *   `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`
 * using the `api-key` header, with streaming via ReadableStream.
 */

const log = logger.scope('ai');

export interface AIService {
  /** True when the minimum Azure configuration is present. */
  isConfigured(): boolean;
  complete(request: ChatCompletionRequest): Promise<Result<ChatCompletionResult>>;
}

export class AzureOpenAIService implements AIService {
  constructor(private readonly settings: Settings) {}

  isConfigured(): boolean {
    return isAzureConfigured(this.settings);
  }

  async complete(_request: ChatCompletionRequest): Promise<Result<ChatCompletionResult>> {
    log.warn('Azure OpenAI integration is not implemented until Phase 2');
    return err(
      new Error(
        'AI chat arrives in Phase 2. Add your Azure endpoint, deployment, and key in Settings.',
      ),
    );
  }
}

export function createAIService(settings: Settings): AIService {
  return new AzureOpenAIService(settings);
}
