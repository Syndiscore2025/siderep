// Service layer barrel. Each service owns one integration boundary:
//
//   settings/    — persisted extension configuration
//   ai/          — OpenAI chat completions and Renewal Responses API
//   email/       — Gmail drafts/sends via chrome.identity OAuth (Phase 3)
//   extraction/  — read-only DOM extraction from the visible page (Phase 2)
//   messaging/   — typed chrome.runtime / chrome.tabs message transport
//   renewal/     — bounded local Renewal account and copied-email history

export {
  loadSettings,
  saveSettings,
  updateSettings,
  resetSettings,
  subscribeSettings,
} from './settings/settingsService';
export type { SettingsPatch } from './settings/settingsService';

export { OpenAIChatService, createAIService } from './ai/openAIChatService';
export type { AIService } from './ai/openAIChatService';
export { createSideRepAIConfig } from './ai/aiConfig';
export type { SideRepAIConfig } from './ai/aiConfig';
export {
  OpenAIResponsesService,
  createRenewalResearchService,
  createRenewalAIService,
} from './ai/openAIResponsesService';
export type { RenewalResearchService } from './ai/openAIResponsesService';

export {
  GmailService,
  createEmailService,
  buildGmailComposeUrl,
  encodeRawMessage,
} from './email/gmailService';
export type { EmailService } from './email/gmailService';
export { generateEmail, parseGeneratedEmail } from './email/emailGenerationService';
export { loadSentEmails, recordSentEmail, clearSentEmails } from './email/sentHistoryService';

export {
  RENEWAL_HISTORY_STORAGE_KEY,
  MAX_RENEWAL_ACCOUNTS,
  MAX_RENEWAL_SEARCH_RESULTS,
  MAX_RENEWAL_HISTORY_BYTES,
  MAX_WEB_RENEWAL_HISTORY_BYTES,
  RenewalHistorySaveError,
  migrateRenewalHistory,
  loadRenewalHistory,
  recordCopiedRenewalEmail,
  archiveRenewalCycle,
  deleteRenewalAccount,
  clearRenewalHistory,
  searchRenewalAccounts,
  subscribeRenewalHistory,
} from './renewal/renewalHistoryService';
export type {
  RecordCopiedRenewalEmailInput,
  RecordCopiedRenewalEmailResult,
} from './renewal/renewalHistoryService';
export { buildRenewalMerchantContext, determineOutreachObjective } from './renewal/merchantContext';
export { addressFromGoogleUrl, normalizeGoogleAddressUrl } from './renewal/googleAddress';

export {
  MessagingExtractionService,
  SampleExtractionService,
  createExtractionService,
  SAMPLE_CUSTOMER,
} from './extraction/customerExtractionService';
export type { ExtractionService } from './extraction/customerExtractionService';
export type { ExtractionServiceOptions } from './extraction/customerExtractionService';
export { parseSalesforceRecord } from './extraction/salesforceParser';
export {
  MAX_MANUAL_CUSTOMER_INPUT_LENGTH,
  MAX_MANUAL_CUSTOMER_FIELDS,
  MAX_MANUAL_CUSTOMER_LABEL_LENGTH,
  MAX_MANUAL_CUSTOMER_VALUE_LENGTH,
  ManualCustomerParseError,
  parseManualCustomer,
} from './extraction/manualCustomerParser';
export {
  MAX_RENEWAL_STRING_LENGTH,
  MAX_RENEWAL_URL_LENGTH,
  RENEWAL_FIELD_ALIASES,
  normalizeRenewalString,
  normalizeRenewalUrl,
  mapRenewalFields,
} from './extraction/renewalFieldMapper';
export type { RenewalFieldMapping } from './extraction/renewalFieldMapper';
export { parseSalesforceReport } from './extraction/salesforceReportParser';
export {
  MessagingReportExtractionService,
  SampleReportExtractionService,
  createReportExtractionService,
  SAMPLE_REPORT,
} from './extraction/reportExtractionService';
export type { ReportExtractionService } from './extraction/reportExtractionService';

export {
  DEFAULT_EXCLUDED_STATUSES,
  isExcludedStatus,
  filterReport,
  selectedRecipients,
  toggleRecipient,
  setAllSelected,
  describeSkip,
  parseExcludedStatusesInput,
} from './bulk/reportFilterService';
export {
  DEFAULT_PER_RUN_CAP,
  DEFAULT_SEND_DELAY_MS,
  generateBulkEmail,
  sendBulkEmail,
} from './bulk/bulkSendService';
export type { BulkSendProgress, BulkSendOptions } from './bulk/bulkSendService';
export { loadBulkRuns, recordBulkRun, clearBulkRuns } from './bulk/bulkRunHistoryService';
export {
  MAX_MANUAL_RECIPIENT_INPUT_LENGTH,
  MAX_MANUAL_RECIPIENT_LINE_LENGTH,
  MAX_MANUAL_RECIPIENTS,
  ManualRecipientParseError,
  parseManualRecipients,
} from './bulk/manualRecipientParser';

export { sendRuntimeMessage, sendTabMessage, getActiveTabId } from './messaging/runtimeMessaging';

export {
  runDiagnostics,
  checkStorage,
  checkAssistantOpenAI,
  checkGmail,
  checkSalesforce,
} from './diagnostics/diagnosticsService';
export type { CheckResult, CheckStatus } from './diagnostics/diagnosticsService';
