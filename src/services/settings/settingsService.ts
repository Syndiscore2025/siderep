import { DEFAULT_SETTINGS, parseSettings } from '@/types';
import type { Settings, Theme } from '@/types';
import { logger } from '@/utils';

/**
 * Settings service — the persistence boundary for extension configuration.
 *
 * It writes strictly to `chrome.storage.local` under a single namespaced key
 * and stores configuration exclusively (rep profile, provider config, model
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

function storageArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null;
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
  const area = storageArea();
  if (!area) return DEFAULT_SETTINGS;
  try {
    const stored = await area.get(STORAGE_KEY);
    return parseSettings(stored?.[STORAGE_KEY]);
  } catch (error) {
    log.error('failed to load settings', error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const parsed = parseSettings(settings);
  const area = storageArea();
  if (area) {
    try {
      await area.set({ [STORAGE_KEY]: parsed });
    } catch (error) {
      log.error('failed to save settings', error);
    }
  }
  return parsed;
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await loadSettings();
  return saveSettings(mergeSettings(current, patch));
}

/** Restores default configuration and clears the stored value. */
export async function resetSettings(): Promise<Settings> {
  const area = storageArea();
  if (area) {
    try {
      await area.remove(STORAGE_KEY);
    } catch (error) {
      log.error('failed to reset settings', error);
    }
  }
  return DEFAULT_SETTINGS;
}

/**
 * Subscribes to external settings changes (e.g. edited in another tab or the
 * options page). Returns an unsubscribe function.
 */
export function subscribeSettings(callback: (settings: Settings) => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
    return () => {};
  }
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName === 'local' && STORAGE_KEY in changes) {
      callback(parseSettings(changes[STORAGE_KEY]?.newValue));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
