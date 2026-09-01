import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, isAssistantAIConfigured, parseSettings } from './settings';

describe('parseSettings', () => {
  it('uses the SideRep merchant-pipeline defaults', () => {
    expect(DEFAULT_SETTINGS.repProfile).toMatchObject({ name: 'Michael', company: '1West' });
    expect(DEFAULT_SETTINGS.renewalAI.model).toBe('gpt-5.6-sol');
    expect(DEFAULT_SETTINGS.ai).toMatchObject({
      reasoningEffort: 'medium',
      verbosity: 'medium',
      maxOutputTokens: 6000,
      webSearchEnabled: true,
    });
    expect(DEFAULT_SETTINGS.lenderProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'PEAC', standardRenewalThreshold: 45 }),
      ]),
    );
  });

  it('returns full defaults for undefined input', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns full defaults for garbage input', () => {
    expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('deep-merges partial input over defaults', () => {
    const parsed = parseSettings({
      repProfile: { name: 'Alex' },
      renewalAI: { apiKey: 'test-key' },
      assistantAI: { apiKey: 'assistant-key' },
    });
    expect(parsed.assistantAI).toEqual({
      ...DEFAULT_SETTINGS.assistantAI,
      apiKey: 'assistant-key',
    });
    expect(parsed.repProfile).toEqual({ ...DEFAULT_SETTINGS.repProfile, name: 'Alex' });
    expect(parsed.renewalAI).toEqual({ ...DEFAULT_SETTINGS.renewalAI, apiKey: 'test-key' });
    expect(parsed.ai).toEqual(DEFAULT_SETTINGS.ai);
    expect(parsed.theme).toBe('dark');
  });

  it('migrates the legacy AI model and drops obsolete Azure credentials', () => {
    const parsed = parseSettings({
      azure: { endpoint: 'https://legacy.openai.azure.com', apiKey: 'obsolete-key' },
      ai: { model: 'gpt-4.1-mini' },
      theme: 'light',
    });

    expect(parsed).not.toHaveProperty('azure');
    expect(parsed.assistantAI).toEqual({ apiKey: '', model: 'gpt-4.1-mini' });
    expect(parsed.theme).toBe('light');
    expect(parsed.repProfile).toEqual(DEFAULT_SETTINGS.repProfile);
    expect(parsed.renewalAI).toEqual(DEFAULT_SETTINGS.renewalAI);
  });

  it('migrates the former maxTokens setting without resetting other AI defaults', () => {
    const parsed = parseSettings({ ai: { maxTokens: 2400 } });
    expect(parsed.ai).toMatchObject({
      maxOutputTokens: 2400,
      reasoningEffort: 'medium',
      verbosity: 'medium',
      webSearchEnabled: true,
    });
  });

  it('falls back to defaults when a field is invalid', () => {
    const parsed = parseSettings({ ai: { temperature: 99 } });
    expect(parsed).toEqual(DEFAULT_SETTINGS);
  });

  it('trims whitespace on trimmed fields', () => {
    const parsed = parseSettings({ assistantAI: { model: '  gpt-4o  ' } });
    expect(parsed.assistantAI.model).toBe('gpt-4o');
  });

  it('retains structured lender intelligence profiles', () => {
    const profile = parseSettings({
      lenderProfiles: [
        {
          name: 'Expansion Capital Group',
          productTypes: ['MCA'],
          standardRenewalThreshold: 55,
          earlyRenewalThreshold: 45,
          minimumFundingAgeDays: 90,
          renewalTimingRules: 'Review after 90 days.',
          payoffBehavior: 'Existing balance may be paid off through renewal.',
          customerFacingRenewalBenefits: ['Additional proceeds may be available.'],
          internalRules: 'Internal only.',
          lineOfCreditAvailable: true,
          termLoanAvailable: false,
          specialNotes: 'Do not share.',
        },
      ],
    }).lenderProfiles[0];

    expect(profile).toMatchObject({
      name: 'Expansion Capital Group',
      standardRenewalThreshold: 55,
      earlyRenewalThreshold: 45,
      minimumFundingAgeDays: 90,
      lineOfCreditAvailable: true,
    });
  });
});

describe('isAssistantAIConfigured', () => {
  it('is false with defaults', () => {
    expect(isAssistantAIConfigured(DEFAULT_SETTINGS)).toBe(false);
  });

  it('is true only when the separate Assistant key and model are set', () => {
    const configured = parseSettings({
      assistantAI: { apiKey: 'k', model: 'gpt-4o' },
    });
    expect(isAssistantAIConfigured(configured)).toBe(true);

    const missingKey = parseSettings({ assistantAI: { apiKey: '', model: 'gpt-4o' } });
    expect(isAssistantAIConfigured(missingKey)).toBe(false);
  });
});
