// Barrel export for the domain types. Import from `@/types` everywhere else.

export { approvedFields } from './customer';
export type { CustomerField, ExtractedCustomer } from './customer';

export type {
  ChatRole,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionChunk,
  ChatCompletionResult,
} from './ai';

export type { EmailAction, EmailDraft, EmailResult } from './email';

export { RUNTIME_MESSAGE_TYPES } from './messaging';
export type {
  RuntimeMessageType,
  PingRequest,
  PingResponse,
  ExtractCustomerRequest,
  ExtractCustomerResponse,
  RuntimeRequest,
  RuntimeResponse,
  RuntimeResponseFor,
} from './messaging';

export {
  THEMES,
  SUGGESTED_MODELS,
  settingsSchema,
  DEFAULT_SETTINGS,
  parseSettings,
  isAzureConfigured,
} from './settings';
export type { Settings, Theme } from './settings';
