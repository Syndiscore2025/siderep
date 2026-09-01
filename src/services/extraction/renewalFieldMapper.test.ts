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
        ...EMPTY_RENEWAL_INPUT,
        merchantName: 'Manual merchant',
        businessName: '',
        accountName: '',
        dba: 'Manual DBA',
        businessAddress: '123 Manual Street',
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
    expect(result.input.businessAddress).toBe('123 Manual Street');
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
    expect(result.input).not.toHaveProperty('latestFundingDate');
    expect(result.input).not.toHaveProperty('additionalFundingDate');
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

  it('warns for incomplete secondary data and retains no same-day comparison dates', () => {
    const result = mapRenewalFields(customer([['Second Funding Date', '2026-06-01']]));
    expect(result.warnings.join(' ')).toMatch(/without an explicitly numbered second lender/i);
    expect(result.input.originalFundingDate).toBe('');
  });

  it('keeps safe websites and prefers manually reviewed balance and percentage values', () => {
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

  it('maps complete merchant and funding context from exact Salesforce aliases', () => {
    const result = mapRenewalFields(
      customer([
        ['Contact First Name', 'Avery'],
        ['Contact Last Name', 'Stone'],
        ['Billing City', 'Denver'],
        ['Billing State', 'CO'],
        ['Industry', 'Commercial HVAC'],
        ['Current Balance', '$25,000'],
        ['Current % Paid In', '71%'],
        ['Original Funding Amount', '$100,000'],
        ['Original Funding Date', '8/15/2025'],
        ['Product Type', 'MCA'],
        ['Renewal Eligibility Date', '2026-09-15'],
        ['Existing Positions', '1'],
        ['Possible LOC', '$50,000'],
        ['Possible Term Loan', '36 months'],
        ['Special Lender Incentives', 'Reduced origination fee'],
        ['Existing Outstanding Offer', '$75,000 renewal offer'],
      ]),
    );

    expect(result.input).toMatchObject({
      merchantName: 'Avery Stone',
      city: 'Denver',
      state: 'CO',
      industry: 'Commercial HVAC',
      currentBalance: '$25,000',
      percentagePaid: '71%',
      originalFundingAmount: '$100,000',
      originalFundingDate: '2025-08-15',
      productType: 'MCA',
      renewalEligibilityDate: '2026-09-15',
      existingPositions: '1',
      possibleLineOfCredit: '$50,000',
      possibleTermLoan: '36 months',
      specialLenderIncentives: 'Reduced origination fee',
      existingOutstandingOffer: '$75,000 renewal offer',
    });
  });

  it('maps a Salesforce business address for research disambiguation', () => {
    const result = mapRenewalFields(
      customer([
        ['Business Name', 'Acme Market'],
        ['Business Address', '42 Market Street, Denver, CO 80202'],
      ]),
    );

    expect(result.input.businessAddress).toBe('42 Market Street, Denver, CO 80202');
  });
});
