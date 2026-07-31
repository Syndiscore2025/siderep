/** Roles supported by the chat conversation. */
export type ChatRole = 'system' | 'user' | 'assistant';

/** A single message in the in-memory conversation for the active customer. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** ISO timestamp (in-memory only). */
  createdAt: string;
  /** True while an assistant reply is still being generated. */
  pending?: boolean;
  /** Populated if generating this message failed. */
  error?: string;
}

/** Parameters passed to the AI completion service. */
export interface ChatCompletionRequest {
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>;
  model: string;
  temperature: number;
  maxTokens: number;
  /** Optional abort signal so the UI can cancel an in-flight request. */
  signal?: AbortSignal;
}

/** A streamed piece of an assistant response. */
export interface ChatCompletionChunk {
  content: string;
  done: boolean;
}

/** The non-streamed completion result. */
export interface ChatCompletionResult {
  content: string;
  /** Token accounting when the provider returns it. */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
