import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';

import { loadSettings, resetSettings, saveSettings, updateSettings } from './settingsService';

describe('settingsService', () => {
  it('loads defaults when nothing is stored', async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', async () => {
    const saved = await saveSettings({
      ...DEFAULT_SETTINGS,
      azure: { ...DEFAULT_SETTINGS.azure, endpoint: 'https://x.openai.azure.com' },
      theme: 'light',
    });
    expect(saved.theme).toBe('light');

    const loaded = await loadSettings();
    expect(loaded.azure.endpoint).toBe('https://x.openai.azure.com');
    expect(loaded.theme).toBe('light');
  });

  it('updateSettings merges a patch without clobbering other sections', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      azure: { ...DEFAULT_SETTINGS.azure, endpoint: 'https://keep-me' },
    });

    const updated = await updateSettings({ ai: { temperature: 1.2 } });
    expect(updated.ai.temperature).toBe(1.2);
    expect(updated.azure.endpoint).toBe('https://keep-me');
    // Unpatched values keep defaults.
    expect(updated.ai.maxTokens).toBe(DEFAULT_SETTINGS.ai.maxTokens);
  });

  it('resetSettings restores defaults', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' });
    await expect(resetSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('sanitizes invalid stored values back to defaults on load', async () => {
    await chrome.storage.local.set({ 'siderep.settings': { ai: { temperature: 999 } } });
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});
