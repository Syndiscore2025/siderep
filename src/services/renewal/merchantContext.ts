import type {
  RenewalBusinessResearch,
  RenewalMerchantContext,
  RenewalOutreachObjective,
  RenewalResearchRequest,
} from '@/types';

import { addressFromGoogleUrl, normalizeGoogleAddressUrl } from './googleAddress';
import { resolveBusinessLocator } from './businessLocator';

function splitMerchantName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

function addressParts(value: string): { city: string; state: string } {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return { city: '', state: '' };
  if (parts.length === 2) {
    const location = parts[1]?.split(/\s+/).filter(Boolean) ?? [];
    const hasZip = /^[0-9]{5}(?:-[0-9]{4})?$/.test(location.at(-1) ?? '');
    const stateIndex = hasZip ? location.length - 2 : location.length - 1;
    return {
      city: location.slice(0, stateIndex).join(' '),
      state: stateIndex >= 0 ? (location[stateIndex] ?? '') : '',
    };
  }
  const stateAndZip = parts.at(-1)?.split(/\s+/)[0] ?? '';
  return { city: parts.at(-2) ?? '', state: stateAndZip };
}

function offerExpirationIsSoon(value: string): boolean {
  if (/\b(?:expires?\s+soon|today|tomorrow|this week)\b/i.test(value)) return true;
  const match = value.match(
    /\b(?:20[0-9]{2}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\/[0-9]{1,2}\/20[0-9]{2})\b/,
  );
  if (!match) return false;
  const expiration = Date.parse(match[0]);
  if (!Number.isFinite(expiration)) return false;
  const days = (expiration - Date.now()) / 86_400_000;
  return days >= 0 && days <= 14;
}

function hasFundingValue(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  return Boolean(
    normalized &&
    !/^(?:no|none|n\/?a|not available|unavailable|false|0|unknown|tbd)$/.test(normalized),
  );
}

export function determineOutreachObjective(
  request: RenewalResearchRequest,
): RenewalOutreachObjective {
  const input = request.input;
  if (hasFundingValue(input.existingOutstandingOffer)) return 'existing_outstanding_offer';
  if (request.eligibility === 'eligible') {
    return hasFundingValue(input.possibleLineOfCredit) || hasFundingValue(input.possibleTermLoan)
      ? 'renewal_plus_alternative_options'
      : 'renewal';
  }
  if (hasFundingValue(input.possibleLineOfCredit)) return 'line_of_credit';
  if (hasFundingValue(input.possibleTermLoan)) return 'term_loan';
  return request.outreachType === 'add_on' ? 'additional_position' : 'additional_working_capital';
}

function fundingScenario(
  request: RenewalResearchRequest,
): RenewalMerchantContext['fundingScenario'] {
  const input = request.input;
  const supportText = `${input.specialLenderIncentives} ${input.existingOutstandingOffer}`;
  const payoffSupported = /\b(?:pay\s*off|payoff|refinanc|consolidat)/i.test(supportText);
  const singlePositionSupported =
    payoffSupported && /(?:^|\D)(?:1|one)(?:\D|$)/i.test(input.existingPositions);
  const expirationUrgencySupported = offerExpirationIsSoon(input.existingOutstandingOffer);
  const primary = hasFundingValue(input.existingOutstandingOffer)
    ? 'outstanding_offer'
    : request.eligibility === 'eligible'
      ? 'renewal_eligible'
      : hasFundingValue(input.possibleLineOfCredit)
        ? 'line_of_credit'
        : hasFundingValue(input.possibleTermLoan)
          ? 'term_loan'
          : 'not_yet_eligible';
  return {
    primary,
    includesLineOfCredit: hasFundingValue(input.possibleLineOfCredit),
    includesTermLoan: hasFundingValue(input.possibleTermLoan),
    payoffSupported,
    singlePositionSupported,
    expirationUrgencySupported,
  };
}

export function buildRenewalMerchantContext(
  request: RenewalResearchRequest,
  businessResearch: RenewalBusinessResearch,
): RenewalMerchantContext {
  const name = splitMerchantName(request.input.merchantName);
  const locator = resolveBusinessLocator(request.input.businessLocator);
  const googleAddressUrl =
    locator.businessAddressGoogleUrl ||
    normalizeGoogleAddressUrl(request.input.businessAddressGoogleUrl) ||
    '';
  const businessAddress =
    locator.businessAddress ||
    request.input.businessAddress ||
    addressFromGoogleUrl(googleAddressUrl);
  const address = addressParts(businessAddress);
  const positions = [request.input.existingPositions, request.input.additionalSameDayLender]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('; ');
  return {
    merchant: {
      legalBusinessName: request.input.businessName,
      dba: request.input.dba || request.input.accountName,
      merchantFirstName: name.firstName,
      merchantLastName: name.lastName,
      address: businessAddress || googleAddressUrl,
      googleAddressUrl,
      city: request.input.city || address.city,
      state: request.input.state || address.state,
      website: locator.website || request.input.website,
      industry: request.input.industry || businessResearch.industry,
    },
    businessResearch,
    funding: {
      currentLender: request.input.latestLender,
      originalFundingAmount: request.input.originalFundingAmount,
      originalFundingDate: request.input.originalFundingDate,
      currentBalance: request.input.currentBalance,
      paidInPercentage: request.input.percentagePaid,
      productType: request.input.productType,
      renewalEligibility: request.eligibility,
      renewalEligibilityDate: request.input.renewalEligibilityDate,
      existingPositions: positions,
      possibleLineOfCredit: request.input.possibleLineOfCredit,
      possibleTermLoan: request.input.possibleTermLoan,
      specialLenderIncentives: request.input.specialLenderIncentives,
      existingOutstandingOffer: request.input.existingOutstandingOffer,
    },
    outreachObjective: determineOutreachObjective(request),
    fundingScenario: fundingScenario(request),
    representative: { ...request.repProfile },
    sentEmailHistory: [...request.sentEmailHistory].sort(
      (left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt),
    ),
  };
}
