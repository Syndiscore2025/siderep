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

export { GmailService, createEmailService } from './email/gmailService';
export type { EmailService } from './email/gmailService';

export {
  SampleExtractionService,
  createExtractionService,
  SAMPLE_CUSTOMER,
} from './extraction/customerExtractionService';
export type { ExtractionService } from './extraction/customerExtractionService';

export { sendRuntimeMessage, sendTabMessage, getActiveTabId } from './messaging/runtimeMessaging';
