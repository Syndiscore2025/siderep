import { describe, expect, it } from 'vitest';

import { applyTheme, resolveTheme } from './useTheme';

describe('resolveTheme', () => {
  it('honours explicit themes and follows the OS for system', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('writes the palette onto the document root', () => {
    const root = document.createElement('html');
    applyTheme('light', root);
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
  });
});
