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

/** Suggested Azure OpenAI model identifiers (free text is also allowed). */
export const SUGGESTED_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'];

export const settingsSchema = z.object({
  azure: z.object({
    endpoint: z.string().trim().default(''),
    deployment: z.string().trim().default(''),
    apiKey: z.string().default(''),
    apiVersion: z.string().trim().default('2024-10-21'),
  }),
  ai: z.object({
    model: z.string().trim().default('gpt-4o'),
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
  azure: { endpoint: '', deployment: '', apiKey: '', apiVersion: '2024-10-21' },
  ai: { model: 'gpt-4o', temperature: 0.7, maxTokens: 1200 },
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
  const merged = {
    azure: { ...DEFAULT_SETTINGS.azure, ...asRecord(input.azure) },
    ai: { ...DEFAULT_SETTINGS.ai, ...asRecord(input.ai) },
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

/** True once the minimum Azure fields required to talk to the AI are present. */
export function isAzureConfigured(settings: Settings): boolean {
  const { endpoint, deployment, apiKey } = settings.azure;
  return endpoint.length > 0 && deployment.length > 0 && apiKey.length > 0;
}

/**
 * True when the endpoint is a well-formed https URL. An empty string is treated
 * as valid (the "not yet configured" state) so we don't flag a blank field.
 */
export function isValidAzureEndpoint(endpoint: string): boolean {
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) return true;
  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
}
