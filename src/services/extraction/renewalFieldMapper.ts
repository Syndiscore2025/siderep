import { EMPTY_RENEWAL_INPUT } from '@/types';
import type { CustomerField, ExtractedCustomer, RenewalInput } from '@/types';

import { resolveBusinessLocator } from '../renewal/businessLocator';
import { addressFromGoogleUrl, normalizeGoogleAddressUrl } from '../renewal/googleAddress';

export const MAX_RENEWAL_STRING_LENGTH = 500;
export const MAX_RENEWAL_URL_LENGTH = 2048;

function stripControlCharacters(value: string, replacement: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? replacement : character;
    })
    .join('');
}

/** Alias order is significant: the first populated exact label wins. */
export const RENEWAL_FIELD_ALIASES = {
  merchantName: ['Merchant Name', 'Contact Name'],
  merchantFirstName: ['Merchant First Name', 'Contact First Name', 'First Name'],
  merchantLastName: ['Merchant Last Name', 'Contact Last Name', 'Last Name'],
  businessName: ['Business Name', 'Legal Business Name', 'Legal Name'],
  accountName: ['Account Name'],
  dba: ['DBA', 'DBA Name', 'Doing Business As'],
  businessAddress: ['Business Address', 'Billing Address', 'Merchant Address', 'Street Address'],
  businessAddressGoogleUrl: [
    'Google Business Address Link',
    'Google Address Link',
    'Google Maps Link',
    'Business Address URL',
  ],
  city: ['Business City', 'Billing City', 'Merchant City', 'City'],
  state: ['Business State', 'Billing State', 'Merchant State', 'State'],
  industry: ['Industry', 'Business Industry', 'Industry Type', 'Business Type'],
  currentBalance: ['Current Balance', 'Current Payoff', 'Balance'],
  percentagePaid: ['Current % Paid In', 'Percentage Paid', 'Percent Paid', '% Paid In'],
  latestLender: ['Most Recent Lender', 'Most Recent Funder', 'Latest Lender', 'Latest Funder'],
  latestFundingDate: ['Most Recent Funding Date', 'Latest Funding Date', 'Funding Date'],
  additionalLender: [
    'Most Recent Lender 2',
    'Most Recent Funder 2',
    'Latest Lender 2',
    'Latest Funder 2',
    'Second Lender',
    'Lender 2',
  ],
  additionalFundingDate: [
    'Most Recent Funding Date 2',
    'Latest Funding Date 2',
    'Second Funding Date',
    'Funding Date 2',
  ],
  originalFundingAmount: ['Original Funding Amount', 'Original Funded Amount', 'Funding Amount'],
  originalFundingDate: ['Original Funding Date', 'Initial Funding Date', 'Origination Date'],
  productType: ['Product Type', 'Funding Product', 'Deal Type'],
  renewalEligibilityDate: ['Renewal Eligibility Date', 'Eligibility Date', 'Renewal Date'],
  existingPositions: ['Existing Positions', 'Current Positions', 'Open Positions'],
  possibleLineOfCredit: ['Possible LOC', 'Possible Line of Credit', 'Line of Credit Option'],
  possibleTermLoan: ['Possible Term Loan', 'Term Loan Option'],
  specialLenderIncentives: ['Special Lender Incentives', 'Lender Incentives', 'Renewal Incentives'],
  existingOutstandingOffer: ['Existing Outstanding Offer', 'Outstanding Offer', 'Current Offer'],
  website: ['Website', 'Business Website', 'Website URL'],
} as const;

type AliasKey = keyof typeof RENEWAL_FIELD_ALIASES;

/** Collapses whitespace, removes control characters, and applies a hard bound. */
export function normalizeRenewalString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return stripControlCharacters(value, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_RENEWAL_STRING_LENGTH);
}

/** Returns only bounded HTTP(S) URLs without embedded credentials. */
export function normalizeRenewalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = stripControlCharacters(value, '').trim().slice(0, MAX_RENEWAL_URL_LENGTH);
  if (!clean) return undefined;
  try {
    const url = new URL(clean);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return undefined;
    return url.href.slice(0, MAX_RENEWAL_URL_LENGTH);
  } catch {
    return undefined;
  }
}

function labelKey(value: string): string {
  return normalizeRenewalString(value).toLocaleLowerCase();
}

function valuesFor(fields: CustomerField[], key: AliasKey): string[] {
  const aliases = RENEWAL_FIELD_ALIASES[key];
  const values: string[] = [];
  for (const alias of aliases) {
    for (const field of fields) {
      if (labelKey(field.label) !== labelKey(alias)) continue;
      const value = normalizeRenewalString(field.value);
      if (value) values.push(value);
    }
  }
  return values;
}

function firstValue(fields: CustomerField[], key: AliasKey): string {
  return valuesFor(fields, key)[0] ?? '';
}

function firstRawValue(fields: CustomerField[], key: AliasKey): string {
  for (const alias of RENEWAL_FIELD_ALIASES[key]) {
    const field = fields.find((candidate) => labelKey(candidate.label) === labelKey(alias));
    if (typeof field?.value === 'string' && field.value.trim()) return field.value.trim();
  }
  return '';
}

function prefer(crawled: string, manual: unknown): string {
  return crawled || normalizeRenewalString(manual);
}

function preferManual(manual: unknown, crawled: string): string {
  return normalizeRenewalString(manual) || crawled;
}

function calendarDate(value: string): string | undefined {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : us
      ? [Number(us[3]), Number(us[1]), Number(us[2])]
      : null;
  if (parts) {
    const [year, month, day] = parts;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizedDate(manual: unknown, crawled: string): string {
  const value = preferManual(manual, crawled);
  return calendarDate(value) ?? value;
}

export interface RenewalFieldMapping {
  input: RenewalInput;
  warnings: string[];
  detectedAdditionalLender: boolean;
}

/** Maps visible Salesforce fields without retaining same-day comparison dates. */
export function mapRenewalFields(
  customer: ExtractedCustomer,
  manual: RenewalInput = EMPTY_RENEWAL_INPUT,
): RenewalFieldMapping {
  const fields = customer.fields;
  const warnings: string[] = [];
  const additionalLender = firstValue(fields, 'additionalLender');
  const primaryRawDate = firstValue(fields, 'latestFundingDate');
  const additionalRawDate = firstValue(fields, 'additionalFundingDate');
  const primaryDate = calendarDate(primaryRawDate);
  const additionalDate = calendarDate(additionalRawDate);
  let additionalSameDayLender = '';

  if (additionalLender) {
    if (primaryDate && additionalDate && primaryDate === additionalDate) {
      additionalSameDayLender = additionalLender;
    } else {
      warnings.push(
        'A second lender was found, but its funding date could not be confirmed as the same latest calendar date. Review it manually.',
      );
    }
  } else if (additionalRawDate) {
    warnings.push(
      'A second funding date was found without an explicitly numbered second lender. Review it manually.',
    );
  }

  const manualLocator = resolveBusinessLocator(manual.businessLocator);
  const crawledWebsite = firstValue(fields, 'website');
  const website =
    manualLocator.website ||
    (crawledWebsite
      ? (normalizeRenewalUrl(crawledWebsite) ??
        normalizeRenewalUrl(manual.website) ??
        normalizeRenewalString(manual.website))
      : (normalizeRenewalUrl(manual.website) ?? normalizeRenewalString(manual.website)));
  const crawledAddressRaw = firstRawValue(fields, 'businessAddress');
  const manualAddress =
    manualLocator.businessAddress || normalizeRenewalString(manual.businessAddress);
  const googleAddressUrl =
    manualLocator.businessAddressGoogleUrl ||
    (normalizeGoogleAddressUrl(firstRawValue(fields, 'businessAddressGoogleUrl')) ??
      normalizeGoogleAddressUrl(crawledAddressRaw) ??
      normalizeGoogleAddressUrl(manual.businessAddressGoogleUrl) ??
      normalizeGoogleAddressUrl(manualAddress) ??
      '');
  const businessAddress =
    manualLocator.businessAddress ||
    (normalizeGoogleAddressUrl(crawledAddressRaw)
      ? ''
      : normalizeRenewalString(crawledAddressRaw)) ||
    (normalizeGoogleAddressUrl(manualAddress) ? '' : manualAddress) ||
    addressFromGoogleUrl(googleAddressUrl);
  const separateMerchantName = [
    firstValue(fields, 'merchantFirstName'),
    firstValue(fields, 'merchantLastName'),
  ]
    .filter(Boolean)
    .join(' ');

  return {
    input: {
      merchantName: prefer(
        firstValue(fields, 'merchantName') || separateMerchantName,
        manual.merchantName,
      ),
      businessName: prefer(firstValue(fields, 'businessName'), manual.businessName),
      businessLocator: manualLocator.locator || googleAddressUrl || website || businessAddress,
      accountName: prefer(firstValue(fields, 'accountName'), manual.accountName),
      dba: prefer(firstValue(fields, 'dba'), manual.dba),
      businessAddress,
      businessAddressGoogleUrl: googleAddressUrl,
      city: prefer(firstValue(fields, 'city'), manual.city),
      state: prefer(firstValue(fields, 'state'), manual.state),
      industry: prefer(firstValue(fields, 'industry'), manual.industry),
      currentBalance: preferManual(manual.currentBalance, firstValue(fields, 'currentBalance')),
      percentagePaid: preferManual(manual.percentagePaid, firstValue(fields, 'percentagePaid')),
      latestLender: prefer(firstValue(fields, 'latestLender'), manual.latestLender),
      additionalSameDayLender:
        additionalSameDayLender || normalizeRenewalString(manual.additionalSameDayLender),
      originalFundingAmount: preferManual(
        manual.originalFundingAmount,
        firstValue(fields, 'originalFundingAmount'),
      ),
      originalFundingDate: normalizedDate(
        manual.originalFundingDate,
        firstValue(fields, 'originalFundingDate'),
      ),
      productType: preferManual(manual.productType, firstValue(fields, 'productType')),
      renewalEligibilityDate: normalizedDate(
        manual.renewalEligibilityDate,
        firstValue(fields, 'renewalEligibilityDate'),
      ),
      existingPositions: preferManual(
        manual.existingPositions,
        firstValue(fields, 'existingPositions'),
      ),
      possibleLineOfCredit: preferManual(
        manual.possibleLineOfCredit,
        firstValue(fields, 'possibleLineOfCredit'),
      ),
      possibleTermLoan: preferManual(
        manual.possibleTermLoan,
        firstValue(fields, 'possibleTermLoan'),
      ),
      specialLenderIncentives: preferManual(
        manual.specialLenderIncentives,
        firstValue(fields, 'specialLenderIncentives'),
      ),
      existingOutstandingOffer: preferManual(
        manual.existingOutstandingOffer,
        firstValue(fields, 'existingOutstandingOffer'),
      ),
      website,
    },
    warnings,
    detectedAdditionalLender: Boolean(additionalSameDayLender),
  };
}
