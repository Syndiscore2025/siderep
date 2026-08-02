import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  isAzureConfigured,
  isValidAzureEndpoint,
  parseSettings,
} from './settings';

describe('parseSettings', () => {
  it('returns full defaults for undefined input', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns full defaults for garbage input', () => {
    expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('deep-merges partial input over defaults', () => {
    const parsed = parseSettings({ azure: { endpoint: 'https://x.openai.azure.com' } });
    expect(parsed.azure.endpoint).toBe('https://x.openai.azure.com');
    // Untouched siblings keep their defaults.
    expect(parsed.azure.apiVersion).toBe(DEFAULT_SETTINGS.azure.apiVersion);
    expect(parsed.ai).toEqual(DEFAULT_SETTINGS.ai);
    expect(parsed.theme).toBe('dark');
  });

  it('falls back to defaults when a field is invalid', () => {
    const parsed = parseSettings({ ai: { temperature: 99 } });
    expect(parsed).toEqual(DEFAULT_SETTINGS);
  });

  it('trims whitespace on trimmed fields', () => {
    const parsed = parseSettings({ azure: { endpoint: '  https://x  ' } });
    expect(parsed.azure.endpoint).toBe('https://x');
  });
});

describe('isAzureConfigured', () => {
  it('is false with defaults', () => {
    expect(isAzureConfigured(DEFAULT_SETTINGS)).toBe(false);
  });

  it('is true only when endpoint, deployment, and apiKey are all set', () => {
    const configured = parseSettings({
      azure: { endpoint: 'https://x', deployment: 'gpt', apiKey: 'k' },
    });
    expect(isAzureConfigured(configured)).toBe(true);

    const missingKey = parseSettings({ azure: { endpoint: 'https://x', deployment: 'gpt' } });
    expect(isAzureConfigured(missingKey)).toBe(false);
  });
});

describe('isValidAzureEndpoint', () => {
  it('treats an empty string as valid (not-yet-configured state)', () => {
    expect(isValidAzureEndpoint('')).toBe(true);
    expect(isValidAzureEndpoint('   ')).toBe(true);
  });

  it('accepts well-formed https URLs', () => {
    expect(isValidAzureEndpoint('https://my-resource.openai.azure.com')).toBe(true);
  });

  it('rejects non-https and malformed URLs', () => {
    expect(isValidAzureEndpoint('http://insecure.example.com')).toBe(false);
    expect(isValidAzureEndpoint('not a url')).toBe(false);
  });
});
