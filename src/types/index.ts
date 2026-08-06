// Barrel export for the domain types. Import from `@/types` everywhere else.

export { approvedFields } from './customer';
export type { CustomerField, ExtractedCustomer } from './customer';

export type {
  ReportRow,
  ExtractedReport,
  SkipReason,
  BulkRecipient,
  SkippedRow,
  FilterResult,
  BulkRunRecord,
} from './report';

export type {
  ChatRole,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionChunk,
  ChatCompletionResult,
} from './ai';

export { EMAIL_DELIVERY_MODES } from './email';
export type {
  EmailAction,
  EmailDeliveryMode,
  EmailDraft,
  EmailTemplate,
  GeneratedEmail,
  EmailResult,
  SentEmailRecord,
} from './email';

export { RUNTIME_MESSAGE_TYPES } from './messaging';
export type {
  RuntimeMessageType,
  PingRequest,
  PingResponse,
  ExtractCustomerRequest,
  ExtractCustomerResponse,
  ExtractReportRequest,
  ExtractReportResponse,
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
  isValidAzureEndpoint,
} from './settings';
export type { Settings, Theme } from './settings';
