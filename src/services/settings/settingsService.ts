import { DEFAULT_SETTINGS, parseSettings } from '@/types';
import type { Settings, Theme } from '@/types';
import { logger } from '@/utils';

import { platformStorage } from '@/services/storage/platformStorage';

/**
 * Settings service — the persistence boundary for extension configuration.
 *
 * It writes through platform-local storage under a single namespaced key and
 * stores configuration exclusively (rep profile, provider config, model
 * preferences, prompt defaults, connected Google account, theme). Email, bulk,
 * and Renewal histories use their own isolated services and keys; none are
 * routed through this settings module.
 */

const STORAGE_KEY = 'siderep.settings';
const log = logger.scope('settings');

/** Partial patch shape used by `updateSettings`. */
export interface SettingsPatch {
  repProfile?: Partial<Settings['repProfile']>;
  renewalAI?: Partial<Settings['renewalAI']>;
  assistantAI?: Partial<Settings['assistantAI']>;
  ai?: Partial<Settings['ai']>;
  prompts?: Partial<Settings['prompts']>;
  google?: Partial<Settings['google']>;
  email?: Partial<Settings['email']>;
  theme?: Theme;
}

function mergeSettings(base: Settings, patch: SettingsPatch): Settings {
  return {
    repProfile: { ...base.repProfile, ...patch.repProfile },
    renewalAI: { ...base.renewalAI, ...patch.renewalAI },
    assistantAI: { ...base.assistantAI, ...patch.assistantAI },
    ai: { ...base.ai, ...patch.ai },
    prompts: { ...base.prompts, ...patch.prompts },
    google: { ...base.google, ...patch.google },
    email: {
      ...base.email,
      ...patch.email,
      template: { ...base.email.template, ...patch.email?.template },
    },
    theme: patch.theme ?? base.theme,
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    return parseSettings(await platformStorage.get(STORAGE_KEY));
  } catch (error) {
    log.error('failed to load settings', error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const parsed = parseSettings(settings);
  try {
    await platformStorage.set(STORAGE_KEY, parsed);
  } catch (error) {
    log.error('failed to save settings', error);
  }
  return parsed;
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await loadSettings();
  return saveSettings(mergeSettings(current, patch));
}

/** Restores default configuration and clears the stored value. */
export async function resetSettings(): Promise<Settings> {
  try {
    await platformStorage.remove(STORAGE_KEY);
  } catch (error) {
    log.error('failed to reset settings', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Subscribes to external settings changes (e.g. edited in another tab or the
 * options page). Returns an unsubscribe function.
 */
export function subscribeSettings(callback: (settings: Settings) => void): () => void {
  return platformStorage.subscribe(STORAGE_KEY, (value) => callback(parseSettings(value)));
}
