import { addressFromGoogleUrl, normalizeGoogleAddressUrl } from './googleAddress';

export type BusinessLocatorKind = 'empty' | 'address' | 'google_maps' | 'website';

export interface ResolvedBusinessLocator {
  kind: BusinessLocatorKind;
  locator: string;
  businessAddress: string;
  businessAddressGoogleUrl: string;
  website: string;
}

const MAX_LOCATOR_LENGTH = 2048;

function clean(value: unknown, limit = MAX_LOCATOR_LENGTH): string {
  if (typeof value !== 'string') return '';
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function normalizeWebsite(value: string): string {
  const candidate = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#].*)?$/i.test(value)
    ? `https://${value}`
    : value;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href.slice(0, MAX_LOCATOR_LENGTH)
      : '';
  } catch {
    return '';
  }
}

/** Classifies one user-facing locator while retaining the established internal fields. */
export function resolveBusinessLocator(value: unknown): ResolvedBusinessLocator {
  const locator = clean(value);
  if (!locator)
    return {
      kind: 'empty',
      locator: '',
      businessAddress: '',
      businessAddressGoogleUrl: '',
      website: '',
    };

  const googleAddressUrl = normalizeGoogleAddressUrl(locator);
  if (googleAddressUrl) {
    return {
      kind: 'google_maps',
      locator: googleAddressUrl,
      businessAddress: addressFromGoogleUrl(googleAddressUrl),
      businessAddressGoogleUrl: googleAddressUrl,
      website: '',
    };
  }

  const website = normalizeWebsite(locator);
  if (website)
    return {
      kind: 'website',
      locator: website,
      businessAddress: '',
      businessAddressGoogleUrl: '',
      website,
    };

  return {
    kind: 'address',
    locator: clean(locator, 500),
    businessAddress: clean(locator, 500),
    businessAddressGoogleUrl: '',
    website: '',
  };
}
