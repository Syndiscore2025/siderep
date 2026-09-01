import { describe, expect, it } from 'vitest';

import { addressFromGoogleUrl, normalizeGoogleAddressUrl } from './googleAddress';

describe('Google business address links', () => {
  it.each([
    [
      'https://www.google.com/maps/search/?api=1&query=42+Market+Street%2C+Denver%2C+CO+80202',
      '42 Market Street, Denver, CO 80202',
    ],
    [
      'https://www.google.com/maps/place/42+Market+Street,+Denver,+CO+80202/@39.7,-104.9,15z',
      '42 Market Street, Denver, CO 80202',
    ],
    ['https://maps.google.com/?q=42+Market+Street%2C+Denver%2C+CO', '42 Market Street, Denver, CO'],
  ])('extracts an address from %s', (url, expected) => {
    expect(addressFromGoogleUrl(url)).toBe(expected);
  });

  it('accepts shortened Maps links for research even when no address is embedded', () => {
    expect(normalizeGoogleAddressUrl('https://maps.app.goo.gl/AbCdEf123')).toContain(
      'maps.app.goo.gl/AbCdEf123',
    );
    expect(addressFromGoogleUrl('https://maps.app.goo.gl/AbCdEf123')).toBe('');
  });

  it.each([
    'javascript:alert(1)',
    'https://example.com/maps/place/test',
    'https://goo.gl/forms/abc',
  ])('rejects non-Google-Maps URL %s', (url) =>
    expect(normalizeGoogleAddressUrl(url)).toBeUndefined(),
  );
});
