import { useEffect } from 'react';

import type { Theme } from '@/types';

import { useSettings } from './useSettings';

export type ResolvedTheme = 'dark' | 'light';

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

export function resolveTheme(theme: Theme, prefersLight: boolean): ResolvedTheme {
  if (theme === 'system') return prefersLight ? 'light' : 'dark';
  return theme;
}

/** Writes the resolved palette onto `<html>` so the CSS token overrides apply. */
export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/** Keeps the document palette in sync with Settings → Appearance → Theme. */
export function useTheme(): void {
  const { settings } = useSettings();
  const theme = settings.theme;

  useEffect(() => {
    const media =
      typeof window.matchMedia === 'function' ? window.matchMedia(LIGHT_SCHEME_QUERY) : null;
    const sync = () => applyTheme(resolveTheme(theme, media?.matches ?? false));
    sync();
    if (theme !== 'system' || !media) return undefined;
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [theme]);
}
