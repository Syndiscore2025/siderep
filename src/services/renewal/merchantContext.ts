import type {
  RenewalBusinessResearch,
  RenewalMerchantContext,
  RenewalOutreachObjective,
  RenewalResearchRequest,
} from '@/types';

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

export function determineOutreachObjective(
  request: RenewalResearchRequest,
): RenewalOutreachObjective {
  const input = request.input;
  if (input.existingOutstandingOffer.trim()) return 'existing_outstanding_offer';
  if (request.outreachType === 'add_on') return 'additional_position';
  if (request.eligibility === 'eligible') {
    return input.possibleLineOfCredit.trim() || input.possibleTermLoan.trim()
      ? 'renewal_plus_alternative_options'
      : 'renewal';
  }
  if (input.possibleLineOfCredit.trim()) return 'line_of_credit';
  if (input.possibleTermLoan.trim()) return 'term_loan';
  return 'additional_working_capital';
}

export function buildRenewalMerchantContext(
  request: RenewalResearchRequest,
  businessResearch: RenewalBusinessResearch,
): RenewalMerchantContext {
  const name = splitMerchantName(request.input.merchantName);
  const address = addressParts(request.input.businessAddress);
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
      address: request.input.businessAddress,
      city: request.input.city || address.city,
      state: request.input.state || address.state,
      website: request.input.website,
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
    representative: { ...request.repProfile },
    sentEmailHistory: [...request.sentEmailHistory].sort(
      (left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt),
    ),
  };
}
