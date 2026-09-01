import { describe, expect, it } from 'vitest';

import { resolveBusinessLocator } from './businessLocator';

describe('resolveBusinessLocator', () => {
  it('accepts a company website with or without its protocol', () => {
    expect(resolveBusinessLocator('expresslogistics.example/about')).toMatchObject({
      kind: 'website',
      locator: 'https://expresslogistics.example/about',
      website: 'https://expresslogistics.example/about',
    });
  });

  it('classifies Google Maps URLs and extracts their address when available', () => {
    expect(
      resolveBusinessLocator(
        'https://www.google.com/maps/search/?api=1&query=2200+S+Main+Street%2C+Lombard%2C+IL+60148',
      ),
    ).toMatchObject({
      kind: 'google_maps',
      businessAddress: '2200 S Main Street, Lombard, IL 60148',
      businessAddressGoogleUrl: expect.stringContaining('google.com/maps/search'),
    });
  });

  it('retains a full or partial address as an address locator', () => {
    expect(resolveBusinessLocator('2200 S Main Street, Lombard, IL 60148')).toEqual({
      kind: 'address',
      locator: '2200 S Main Street, Lombard, IL 60148',
      businessAddress: '2200 S Main Street, Lombard, IL 60148',
      businessAddressGoogleUrl: '',
      website: '',
    });
  });
});
