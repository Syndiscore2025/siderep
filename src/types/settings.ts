import { z } from 'zod';

import { EMAIL_DELIVERY_MODES } from './email';

/**
 * Configuration model.
 *
 * These values MAY be persisted (via `chrome.storage.local`) because they are
 * configuration only — endpoints, model preferences, UI theme, and OAuth
 * account identity. Customer data is NEVER represented here.
 */

export const THEMES = ['dark', 'light', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** Suggested OpenAI model identifiers (free text is also allowed). */
export const SUGGESTED_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'];

export const settingsSchema = z.object({
  repProfile: z.object({
    name: z.string().trim().default(''),
    company: z.string().trim().default(''),
    phone: z.string().trim().default(''),
    email: z.string().trim().default(''),
  }),
  renewalAI: z.object({
    apiKey: z.string().default(''),
    model: z.string().trim().default(''),
  }),
  assistantAI: z.object({
    apiKey: z.string().default(''),
    model: z.string().trim().default('gpt-4o-mini'),
  }),
  ai: z.object({
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().max(32000).default(1200),
  }),
  prompts: z.object({
    defaultTone: z.string().default('professional'),
    signature: z.string().default(''),
    customInstructions: z.string().default(''),
  }),
  google: z.object({
    /** Connected Workspace address, shown for reference. Null when signed out. */
    connectedEmail: z.string().nullable().default(null),
  }),
  email: z.object({
    /** Active transport used when the user approves a send (with fallback in UI). */
    deliveryMode: z.enum(EMAIL_DELIVERY_MODES).default('gmail_api'),
    /** User-supplied template; `{{placeholders}}` are filled from re-crawled fields. */
    template: z.object({
      subject: z.string().default(''),
      body: z.string().default(''),
    }),
    /** Whether to persist a record of sent emails (SideRep artifact, not customer data). */
    rememberSent: z.boolean().default(true),
  }),
  theme: z.enum(THEMES).default('dark'),
});

export type Settings = z.infer<typeof settingsSchema>;

/** Fully-populated default configuration used on first run. */
export const DEFAULT_SETTINGS: Settings = {
  repProfile: { name: '', company: '', phone: '', email: '' },
  renewalAI: { apiKey: '', model: '' },
  assistantAI: { apiKey: '', model: 'gpt-4o-mini' },
  ai: { temperature: 0.7, maxTokens: 1200 },
  prompts: { defaultTone: 'professional', signature: '', customInstructions: '' },
  google: { connectedEmail: null },
  email: { deliveryMode: 'gmail_api', template: { subject: '', body: '' }, rememberSent: true },
  theme: 'dark',
};

/**
 * Validates and normalizes an unknown value (e.g. read from storage) into a
 * complete `Settings` object, falling back to defaults for anything missing
 * or invalid. Never throws.
 */
export function parseSettings(raw: unknown): Settings {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  // Deep-merge each known section over the defaults so a partially-stored
  // config (e.g. only a theme change) never wipes unrelated sections.
  const legacyAI = asRecord(input.ai);
  const assistantAI = asRecord(input.assistantAI);
  const merged = {
    repProfile: { ...DEFAULT_SETTINGS.repProfile, ...asRecord(input.repProfile) },
    renewalAI: { ...DEFAULT_SETTINGS.renewalAI, ...asRecord(input.renewalAI) },
    assistantAI: {
      ...DEFAULT_SETTINGS.assistantAI,
      ...(typeof legacyAI.model === 'string' ? { model: legacyAI.model } : {}),
      ...assistantAI,
    },
    ai: { ...DEFAULT_SETTINGS.ai, ...legacyAI },
    prompts: { ...DEFAULT_SETTINGS.prompts, ...asRecord(input.prompts) },
    google: { ...DEFAULT_SETTINGS.google, ...asRecord(input.google) },
    email: {
      ...DEFAULT_SETTINGS.email,
      ...asRecord(input.email),
      template: {
        ...DEFAULT_SETTINGS.email.template,
        ...asRecord(asRecord(input.email).template),
      },
    },
    theme: input.theme ?? DEFAULT_SETTINGS.theme,
  };

  const result = settingsSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_SETTINGS;
}

/** True once the Assistant's separate OpenAI key and model are present. */
export function isAssistantAIConfigured(settings: Settings): boolean {
  const { apiKey, model } = settings.assistantAI;
  return apiKey.trim().length > 0 && model.trim().length > 0;
}
