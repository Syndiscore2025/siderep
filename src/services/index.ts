// Service layer barrel. Each service owns one integration boundary:
//
//   settings/    — the ONLY module allowed to persist (config-only storage)
//   ai/          — Azure OpenAI chat completions (Phase 2)
//   email/       — Gmail drafts/sends via chrome.identity OAuth (Phase 3)
//   extraction/  — read-only DOM extraction from the visible page (Phase 2)
//   messaging/   — typed chrome.runtime / chrome.tabs message transport

export {
  loadSettings,
  saveSettings,
  updateSettings,
  resetSettings,
  subscribeSettings,
} from './settings/settingsService';
export type { SettingsPatch } from './settings/settingsService';

export { AzureOpenAIService, createAIService } from './ai/azureOpenAIService';
export type { AIService } from './ai/azureOpenAIService';

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
  MessagingExtractionService,
  SampleExtractionService,
  createExtractionService,
  SAMPLE_CUSTOMER,
} from './extraction/customerExtractionService';
export type { ExtractionService } from './extraction/customerExtractionService';
export { parseSalesforceRecord } from './extraction/salesforceParser';
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

export { sendRuntimeMessage, sendTabMessage, getActiveTabId } from './messaging/runtimeMessaging';

export {
  runDiagnostics,
  checkStorage,
  checkAzure,
  checkGmail,
  checkSalesforce,
} from './diagnostics/diagnosticsService';
export type { CheckResult, CheckStatus } from './diagnostics/diagnosticsService';
