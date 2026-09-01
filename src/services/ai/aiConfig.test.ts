import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';

import { createSideRepAIConfig } from './aiConfig';

describe('createSideRepAIConfig', () => {
  it('defaults Renewal research to GPT-5.6 Sol with web search enabled', () => {
    expect(createSideRepAIConfig(DEFAULT_SETTINGS)).toMatchObject({
      model: 'gpt-5.6-sol',
      webSearchEnabled: true,
    });
  });

  it('centralizes the selected Renewal model and AI behavior settings without fallback', () => {
    const config = createSideRepAIConfig({
      ...DEFAULT_SETTINGS,
      renewalAI: { apiKey: 'key', model: 'custom-model-id' },
      ai: {
        ...DEFAULT_SETTINGS.ai,
        reasoningEffort: 'high',
        verbosity: 'low',
        maxOutputTokens: 7_000,
        webSearchEnabled: false,
      },
    });
    expect(config).toEqual({
      model: 'custom-model-id',
      reasoningEffort: 'high',
      verbosity: 'low',
      maxOutputTokens: 7_000,
      webSearchEnabled: false,
    });
  });
});
