const GOOGLE_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
]);

export function normalizeGoogleAddressUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, 2_048);
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return undefined;
    const host = url.hostname.toLocaleLowerCase();
    if (!GOOGLE_MAPS_HOSTS.has(host) && !host.endsWith('.google.com')) return undefined;
    if (host === 'goo.gl' && !url.pathname.startsWith('/maps')) return undefined;
    if (
      host.endsWith('google.com') &&
      !url.pathname.startsWith('/maps') &&
      host !== 'maps.google.com'
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanAddress(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' ')).replace(/\s+/g, ' ').trim();
  } catch {
    return value.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export function addressFromGoogleUrl(value: unknown): string {
  const normalized = normalizeGoogleAddressUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
  for (const key of ['query', 'q', 'destination']) {
    const candidate = url.searchParams.get(key);
    if (candidate) return cleanAddress(candidate);
  }
  const match = url.pathname.match(/\/maps\/(?:place|search)\/([^/@]+)/i);
  return match?.[1] ? cleanAddress(match[1]) : '';
}
