import { describe, expect, it } from 'vitest';

import { EMPTY_RENEWAL_INPUT } from '@/types';
import type { CustomerField, ExtractedCustomer } from '@/types';

import {
  MAX_RENEWAL_STRING_LENGTH,
  mapRenewalFields,
  normalizeRenewalString,
  normalizeRenewalUrl,
} from './renewalFieldMapper';

function customer(fields: Array<[string, string]>, sourceUrl?: string): ExtractedCustomer {
  return {
    displayName: 'Record',
    extractedAt: '2026-01-01T00:00:00.000Z',
    sourceUrl,
    fields: fields.map(([label, value], index): CustomerField => ({
      key: String(index),
      label,
      value,
      approved: true,
    })),
  };
}

describe('renewal value normalization', () => {
  it('normalizes and bounds strings', () => {
    expect(normalizeRenewalString(`  Acme\n\t${'x'.repeat(600)}  `)).toBe(
      `Acme ${'x'.repeat(MAX_RENEWAL_STRING_LENGTH - 5)}`,
    );
  });

  it('allows only HTTP(S) URLs without credentials', () => {
    expect(normalizeRenewalUrl('https://example.com/about')).toBe('https://example.com/about');
    expect(normalizeRenewalUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeRenewalUrl('https://user:secret@example.com')).toBeUndefined();
  });
});

describe('mapRenewalFields', () => {
  it('uses exact aliases in declared priority order and preserves manual values for empty crawl data', () => {
    const result = mapRenewalFields(
      customer([
        ['Account Name', 'Lower priority'],
        ['Business Name', 'Higher priority'],
        ['Merchant Name', ''],
        ['Some Merchant Name Note', 'Must not match'],
      ]),
      {
        merchantName: 'Manual merchant',
        businessName: '',
        accountName: '',
        dba: 'Manual DBA',
        currentBalance: '$12,500',
        percentagePaid: '',
        latestLender: '',
        additionalSameDayLender: '',
        website: '',
      },
    );

    expect(result.input.businessName).toBe('Higher priority');
    expect(result.input.merchantName).toBe('Manual merchant');
    expect(result.input.dba).toBe('Manual DBA');
    expect(result.input.currentBalance).toBe('$12,500');
  });

  it('keeps a secondary lender only when explicit dates tie on the latest calendar date', () => {
    const result = mapRenewalFields(
      customer([
        ['Most Recent Funding Date', '2026-06-01T08:00:00Z'],
        ['Most Recent Lender 2', 'Second Capital'],
        ['Most Recent Funding Date 2', '06/01/2026'],
      ]),
    );

    expect(result.input.additionalSameDayLender).toBe('Second Capital');
    expect(result.detectedAdditionalLender).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(JSON.stringify(result.input)).not.toMatch(/fundingDate/i);
  });

  it('omits and warns about a secondary lender whose latest date does not tie', () => {
    const result = mapRenewalFields(
      customer([
        ['Funding Date', '2026-06-02'],
        ['Lender 2', 'Old Capital'],
        ['Funding Date 2', '2026-06-01'],
      ]),
    );

    expect(result.input.additionalSameDayLender).toBe('');
    expect(result.warnings.join(' ')).toMatch(/review it manually/i);
  });

  it('warns for incomplete secondary data and retains no funding dates', () => {
    const result = mapRenewalFields(customer([['Second Funding Date', '2026-06-01']]));
    expect(result.warnings.join(' ')).toMatch(/without an explicitly numbered second lender/i);
    expect(Object.keys(result.input)).not.toContain('fundingDate');
  });

  it('keeps safe websites while Salesforce cannot overwrite manual balance or percentage', () => {
    const result = mapRenewalFields(
      customer(
        [
          ['Website', 'https://merchant.example/path'],
          ['Current % Paid In', '72%'],
          ['Current Balance', '$99,999'],
        ],
        'https://salesforce.example/record',
      ),
      { ...EMPTY_RENEWAL_INPUT, currentBalance: '$8,500', percentagePaid: '64%' },
    );

    expect(result.input.website).toBe('https://merchant.example/path');
    expect(result.input.currentBalance).toBe('$8,500');
    expect(result.input.percentagePaid).toBe('64%');
  });
});
