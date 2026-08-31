import { afterEach, describe, expect, it, vi } from 'vitest';

import { isExtensionContext } from './platform';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isExtensionContext', () => {
  it('recognizes a non-empty Chrome runtime id', () => {
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } });
    expect(isExtensionContext()).toBe(true);
  });

  it('returns false when Chrome is absent', () => {
    vi.stubGlobal('chrome', undefined);
    expect(isExtensionContext()).toBe(false);
  });

  it('returns false for partial Chrome globals', () => {
    vi.stubGlobal('chrome', { storage: { local: {} } });
    expect(isExtensionContext()).toBe(false);

    vi.stubGlobal('chrome', { runtime: { id: '   ' }, storage: { local: {} } });
    expect(isExtensionContext()).toBe(false);
  });
});
