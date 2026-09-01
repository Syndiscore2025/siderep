import { describe, expect, it } from 'vitest';

import { EMPTY_RENEWAL_INPUT } from '@/types';
import type { RenewalBusinessResearch, RenewalResearchRequest } from '@/types';

import { buildRenewalMerchantContext, determineOutreachObjective } from './merchantContext';

const RESEARCH: RenewalBusinessResearch = {
  exactBusinessVerified: true,
  legalBusinessName: 'Acme HVAC LLC',
  dba: 'Acme HVAC',
  address: '42 Market Street',
  city: 'Denver',
  state: 'CO',
  website: 'https://acme.example',
  businessType: 'Commercial HVAC contractor',
  industry: 'Commercial HVAC',
  companyDescription: 'Installs and services commercial HVAC systems.',
  products: ['HVAC equipment', 'Replacement parts'],
  services: ['Installation', 'Emergency repair'],
  customerType: 'Commercial property owners',
  businessModel: 'Project and service based',
  locationDetails: 'One Denver service location',
  currentBusinessActivity: ['Hiring technicians'],
  workingCapitalUses: [
    'Equipment purchases',
    'Technician payroll',
    'Installation materials',
    'Service vehicles',
  ],
  confidence: 'high',
};

function request(
  input: Partial<RenewalResearchRequest['input']> = {},
  requestOverrides: Partial<RenewalResearchRequest> = {},
): RenewalResearchRequest {
  return {
    input: {
      ...EMPTY_RENEWAL_INPUT,
      merchantName: 'Avery Stone',
      businessName: 'Acme HVAC LLC',
      businessAddress: '42 Market Street, Denver, CO 80202',
      currentBalance: '$25,000',
      percentagePaid: '71%',
      latestLender: 'Example Capital',
      originalFundingAmount: '$100,000',
      originalFundingDate: '2025-08-15',
      productType: 'MCA',
      renewalEligibilityDate: '2026-09-15',
      existingPositions: '1',
      specialLenderIncentives: 'Reduced origination fee',
      ...input,
    },
    eligibility: 'eligible',
    outreachType: 'renewal',
    repProfile: { name: 'Rae', company: 'SideRep', phone: '555-0100', email: 'rae@example.com' },
    sentEmailHistory: [],
    ...requestOverrides,
  };
}

describe('determineOutreachObjective', () => {
  it.each([
    [{ existingOutstandingOffer: '$75,000 offer' }, {}, 'existing_outstanding_offer'],
    [{}, { outreachType: 'add_on' }, 'renewal'],
    [{ possibleLineOfCredit: '$50,000' }, {}, 'renewal_plus_alternative_options'],
    [{}, {}, 'renewal'],
    [{ possibleLineOfCredit: '$50,000' }, { eligibility: 'not_eligible' }, 'line_of_credit'],
    [{ possibleTermLoan: '36 months' }, { eligibility: 'not_eligible' }, 'term_loan'],
    [{}, { eligibility: 'not_eligible', outreachType: 'add_on' }, 'additional_position'],
    [
      { possibleLineOfCredit: 'N/A', possibleTermLoan: 'No', existingOutstandingOffer: 'None' },
      { eligibility: 'not_eligible' },
      'additional_working_capital',
    ],
    [{}, { eligibility: 'not_eligible' }, 'additional_working_capital'],
  ] as const)('selects the objective from funding facts', (input, overrides, expected) => {
    expect(determineOutreachObjective(request(input, overrides))).toBe(expected);
  });
});

describe('buildRenewalMerchantContext', () => {
  it('builds the complete structured context and sorts email history', () => {
    const context = buildRenewalMerchantContext(
      request(
        { additionalSameDayLender: 'Second Capital' },
        {
          sentEmailHistory: [
            { subject: 'Later', body: 'Later body', sentAt: '2026-08-02T00:00:00Z' },
            { subject: 'Earlier', body: 'Earlier body', sentAt: '2026-08-01T00:00:00Z' },
          ],
        },
      ),
      RESEARCH,
    );

    expect(context.merchant).toMatchObject({
      legalBusinessName: 'Acme HVAC LLC',
      merchantFirstName: 'Avery',
      merchantLastName: 'Stone',
      city: 'Denver',
      state: 'CO',
      industry: 'Commercial HVAC',
    });
    expect(context.businessResearch).toEqual(RESEARCH);
    expect(context.funding).toMatchObject({
      currentLender: 'Example Capital',
      originalFundingAmount: '$100,000',
      currentBalance: '$25,000',
      paidInPercentage: '71%',
      existingPositions: '1; Second Capital',
      specialLenderIncentives: 'Reduced origination fee',
    });
    expect(context.outreachObjective).toBe('renewal');
    expect(context.fundingScenario).toEqual({
      primary: 'renewal_eligible',
      includesLineOfCredit: false,
      includesTermLoan: false,
      payoffSupported: false,
      singlePositionSupported: false,
      expirationUrgencySupported: false,
    });
    expect(context.sentEmailHistory.map((email) => email.subject)).toEqual(['Earlier', 'Later']);
  });

  it('handles single names and a two-part street/location address safely', () => {
    const context = buildRenewalMerchantContext(
      request({ merchantName: 'Avery', businessAddress: '42 Market Street, Denver CO 80202' }),
      RESEARCH,
    );
    expect(context.merchant).toMatchObject({
      merchantFirstName: 'Avery',
      merchantLastName: '',
      city: 'Denver',
      state: 'CO',
    });
  });

  it('uses a Google Maps address link as the business address', () => {
    const context = buildRenewalMerchantContext(
      request({
        businessAddress: '',
        businessAddressGoogleUrl:
          'https://www.google.com/maps/search/?api=1&query=42+Market+Street%2C+Denver%2C+CO+80202',
      }),
      RESEARCH,
    );
    expect(context.merchant).toMatchObject({
      address: '42 Market Street, Denver, CO 80202',
      city: 'Denver',
      state: 'CO',
      googleAddressUrl: expect.stringContaining('google.com/maps/search'),
    });
  });

  it('uses the universal locator to populate website and address context', () => {
    const websiteContext = buildRenewalMerchantContext(
      request({ businessLocator: 'acme.example' }),
      RESEARCH,
    );
    const addressContext = buildRenewalMerchantContext(
      request({ businessLocator: '42 Market Street, Denver, CO 80202' }),
      RESEARCH,
    );

    expect(websiteContext.merchant.website).toBe('https://acme.example/');
    expect(addressContext.merchant).toMatchObject({
      address: '42 Market Street, Denver, CO 80202',
      city: 'Denver',
      state: 'CO',
    });
  });

  it('sets scenario permission flags only from supplied funding facts', () => {
    const context = buildRenewalMerchantContext(
      request({
        existingOutstandingOffer: '$75,000 MCA offer expires soon',
        specialLenderIncentives: 'Existing balance payoff available',
        existingPositions: 'one',
        possibleTermLoan: '36 months',
      }),
      RESEARCH,
    );
    expect(context.fundingScenario).toMatchObject({
      primary: 'outstanding_offer',
      includesTermLoan: true,
      payoffSupported: true,
      singlePositionSupported: true,
      expirationUrgencySupported: true,
    });
  });
});
