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
      assistantAI: { apiKey: 'assistant-key', model: 'gpt-4.1-mini' },
      theme: 'light',
    });
    expect(saved.theme).toBe('light');

    const loaded = await loadSettings();
    expect(loaded.assistantAI).toEqual({ apiKey: 'assistant-key', model: 'gpt-4.1-mini' });
    expect(loaded.theme).toBe('light');
  });

  it('updateSettings merges a patch without clobbering other sections', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      repProfile: { ...DEFAULT_SETTINGS.repProfile, company: 'Keep Co' },
      renewalAI: { apiKey: '', model: 'configured-model' },
      assistantAI: { apiKey: 'keep-me', model: 'gpt-4.1-mini' },
    });

    const updated = await updateSettings({
      repProfile: { name: 'Alex' },
      renewalAI: { apiKey: 'test-key' },
      assistantAI: { model: 'gpt-4o' },
      ai: { temperature: 1.2 },
    });
    expect(updated.ai.temperature).toBe(1.2);
    expect(updated.assistantAI).toEqual({ apiKey: 'keep-me', model: 'gpt-4o' });
    expect(updated.repProfile).toEqual({
      ...DEFAULT_SETTINGS.repProfile,
      name: 'Alex',
      company: 'Keep Co',
    });
    expect(updated.renewalAI).toEqual({ apiKey: 'test-key', model: 'configured-model' });
    // Unpatched values keep defaults.
    expect(updated.ai.maxTokens).toBe(DEFAULT_SETTINGS.ai.maxTokens);
  });

  it('migrates the legacy AI model without retaining obsolete Azure credentials', async () => {
    await chrome.storage.local.set({
      'siderep.settings': {
        azure: { endpoint: 'https://legacy.openai.azure.com', apiKey: 'obsolete-key' },
        ai: { model: 'gpt-4.1', temperature: 0.4 },
        theme: 'light',
      },
    });

    const loaded = await loadSettings();
    expect(loaded).not.toHaveProperty('azure');
    expect(loaded.assistantAI).toEqual({ apiKey: '', model: 'gpt-4.1' });
    expect(loaded.ai.temperature).toBe(0.4);
    expect(loaded.theme).toBe('light');
    expect(loaded.repProfile).toEqual(DEFAULT_SETTINGS.repProfile);
    expect(loaded.renewalAI).toEqual(DEFAULT_SETTINGS.renewalAI);
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
