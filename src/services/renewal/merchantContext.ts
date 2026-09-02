import type {
  LenderProfile,
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

/** Dominant IANA time zone per US state/territory, keyed by postal code and full name. */
const STATE_TIME_ZONES: Record<string, string> = {
  al: 'America/Chicago',
  alabama: 'America/Chicago',
  ak: 'America/Anchorage',
  alaska: 'America/Anchorage',
  az: 'America/Phoenix',
  arizona: 'America/Phoenix',
  ar: 'America/Chicago',
  arkansas: 'America/Chicago',
  ca: 'America/Los_Angeles',
  california: 'America/Los_Angeles',
  co: 'America/Denver',
  colorado: 'America/Denver',
  ct: 'America/New_York',
  connecticut: 'America/New_York',
  dc: 'America/New_York',
  'district of columbia': 'America/New_York',
  de: 'America/New_York',
  delaware: 'America/New_York',
  fl: 'America/New_York',
  florida: 'America/New_York',
  ga: 'America/New_York',
  georgia: 'America/New_York',
  hi: 'Pacific/Honolulu',
  hawaii: 'Pacific/Honolulu',
  id: 'America/Boise',
  idaho: 'America/Boise',
  il: 'America/Chicago',
  illinois: 'America/Chicago',
  in: 'America/Indiana/Indianapolis',
  indiana: 'America/Indiana/Indianapolis',
  ia: 'America/Chicago',
  iowa: 'America/Chicago',
  ks: 'America/Chicago',
  kansas: 'America/Chicago',
  ky: 'America/New_York',
  kentucky: 'America/New_York',
  la: 'America/Chicago',
  louisiana: 'America/Chicago',
  me: 'America/New_York',
  maine: 'America/New_York',
  md: 'America/New_York',
  maryland: 'America/New_York',
  ma: 'America/New_York',
  massachusetts: 'America/New_York',
  mi: 'America/Detroit',
  michigan: 'America/Detroit',
  mn: 'America/Chicago',
  minnesota: 'America/Chicago',
  ms: 'America/Chicago',
  mississippi: 'America/Chicago',
  mo: 'America/Chicago',
  missouri: 'America/Chicago',
  mt: 'America/Denver',
  montana: 'America/Denver',
  ne: 'America/Chicago',
  nebraska: 'America/Chicago',
  nv: 'America/Los_Angeles',
  nevada: 'America/Los_Angeles',
  nh: 'America/New_York',
  'new hampshire': 'America/New_York',
  nj: 'America/New_York',
  'new jersey': 'America/New_York',
  nm: 'America/Denver',
  'new mexico': 'America/Denver',
  ny: 'America/New_York',
  'new york': 'America/New_York',
  nc: 'America/New_York',
  'north carolina': 'America/New_York',
  nd: 'America/Chicago',
  'north dakota': 'America/Chicago',
  oh: 'America/New_York',
  ohio: 'America/New_York',
  ok: 'America/Chicago',
  oklahoma: 'America/Chicago',
  or: 'America/Los_Angeles',
  oregon: 'America/Los_Angeles',
  pa: 'America/New_York',
  pennsylvania: 'America/New_York',
  pr: 'America/Puerto_Rico',
  'puerto rico': 'America/Puerto_Rico',
  ri: 'America/New_York',
  'rhode island': 'America/New_York',
  sc: 'America/New_York',
  'south carolina': 'America/New_York',
  sd: 'America/Chicago',
  'south dakota': 'America/Chicago',
  tn: 'America/Chicago',
  tennessee: 'America/Chicago',
  tx: 'America/Chicago',
  texas: 'America/Chicago',
  ut: 'America/Denver',
  utah: 'America/Denver',
  vt: 'America/New_York',
  vermont: 'America/New_York',
  va: 'America/New_York',
  virginia: 'America/New_York',
  wa: 'America/Los_Angeles',
  washington: 'America/Los_Angeles',
  wv: 'America/New_York',
  'west virginia': 'America/New_York',
  wi: 'America/Chicago',
  wisconsin: 'America/Chicago',
  wy: 'America/Denver',
  wyoming: 'America/Denver',
};

function localHour(timeZone: string | undefined, now: Date): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(now);
    return Number(hour) % 24;
  } catch {
    return now.getHours();
  }
}

/**
 * Time-of-day greeting for the merchant's local time zone, resolved from the business state.
 * Falls back to the representative's local clock when the state is unknown.
 */
export function merchantGreeting(state: string, now: Date = new Date()): string {
  const timeZone = STATE_TIME_ZONES[state.trim().toLocaleLowerCase()];
  const hour = localHour(timeZone, now);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
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

function lenderProfileFor(
  lenderName: string,
  lenderProfiles: LenderProfile[] | undefined,
): LenderProfile | null {
  const normalizedLender = lenderName.trim().toLocaleLowerCase();
  if (!normalizedLender) return null;
  return (
    lenderProfiles?.find(
      (profile) => profile.name.trim().toLocaleLowerCase() === normalizedLender,
    ) ?? null
  );
}

function percentage(value: string): number | null {
  const match = value.match(/(?:^|\s)([0-9]{1,3}(?:\.[0-9]+)?)(?:\s*%|$)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type EligibilityResolution = Pick<
  RenewalMerchantContext['fundingScenario'],
  'eligibilitySource' | 'thresholdUsed' | 'earlyRenewal'
> & { eligibility: RenewalEligibility };

function resolveEligibility(
  request: RenewalResearchRequest,
  profile: LenderProfile | null,
  now = Date.now(),
): EligibilityResolution {
  const explicitDate = timestamp(request.input.renewalEligibilityDate);
  if (profile && explicitDate !== null) {
    return {
      eligibility: explicitDate <= now ? 'eligible' : 'not_eligible',
      eligibilitySource: 'explicit_renewal_date',
      thresholdUsed: null,
      earlyRenewal: false,
    };
  }

  const paidIn = percentage(request.input.percentagePaid);
  const standard = profile?.standardRenewalThreshold ?? null;
  const early = profile?.earlyRenewalThreshold ?? null;
  const thresholdUsed =
    paidIn !== null && standard !== null && paidIn >= standard
      ? standard
      : paidIn !== null && early !== null && paidIn >= early
        ? early
        : null;
  if (thresholdUsed !== null) {
    const fundedAt = timestamp(request.input.originalFundingDate);
    if (
      profile?.minimumFundingAgeDays !== null &&
      profile?.minimumFundingAgeDays !== undefined &&
      fundedAt !== null &&
      now - fundedAt < profile.minimumFundingAgeDays * 86_400_000
    ) {
      return {
        eligibility: 'not_eligible',
        eligibilitySource: 'funding_age',
        thresholdUsed,
        earlyRenewal: thresholdUsed === early && thresholdUsed !== standard,
      };
    }
    return {
      eligibility: 'eligible',
      eligibilitySource: 'paid_in_threshold',
      thresholdUsed,
      earlyRenewal: thresholdUsed === early && thresholdUsed !== standard,
    };
  }
  return {
    eligibility: request.eligibility,
    eligibilitySource: 'manual',
    thresholdUsed: null,
    earlyRenewal: false,
  };
}

export function determineOutreachObjective(
  request: RenewalResearchRequest,
): RenewalOutreachObjective {
  const input = request.input;
  const profile = lenderProfileFor(input.latestLender, request.lenderProfiles);
  const eligibility = resolveEligibility(request, profile).eligibility;
  if (hasFundingValue(input.existingOutstandingOffer)) return 'existing_outstanding_offer';
  if (eligibility === 'eligible') {
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
  eligibility: EligibilityResolution,
  profile: LenderProfile | null,
): RenewalMerchantContext['fundingScenario'] {
  const input = request.input;
  const supportText = `${input.specialLenderIncentives} ${input.existingOutstandingOffer} ${profile?.payoffBehavior ?? ''}`;
  const payoffSupported = /\b(?:pay\s*off|payoff|refinanc|consolidat)/i.test(supportText);
  const singlePositionSupported =
    payoffSupported && /(?:^|\D)(?:1|one)(?:\D|$)/i.test(input.existingPositions);
  const expirationUrgencySupported = offerExpirationIsSoon(input.existingOutstandingOffer);
  const primary = hasFundingValue(input.existingOutstandingOffer)
    ? 'outstanding_offer'
    : eligibility.eligibility === 'eligible'
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
    profileLineOfCreditAvailable: profile?.lineOfCreditAvailable ?? false,
    profileTermLoanAvailable: profile?.termLoanAvailable ?? false,
    payoffSupported,
    singlePositionSupported,
    expirationUrgencySupported,
    eligibilitySource: eligibility.eligibilitySource,
    thresholdUsed: eligibility.thresholdUsed,
    earlyRenewal: eligibility.earlyRenewal,
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
  const lenderProfile = lenderProfileFor(request.input.latestLender, request.lenderProfiles);
  const eligibility = resolveEligibility(request, lenderProfile);
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
      renewalEligibility: eligibility.eligibility,
      renewalEligibilityDate: request.input.renewalEligibilityDate,
      existingPositions: positions,
      possibleLineOfCredit: request.input.possibleLineOfCredit,
      possibleTermLoan: request.input.possibleTermLoan,
      specialLenderIncentives: request.input.specialLenderIncentives,
      existingOutstandingOffer: request.input.existingOutstandingOffer,
    },
    outreachObjective: determineOutreachObjective(request),
    fundingScenario: fundingScenario(request, eligibility, lenderProfile),
    lenderProfile,
    userNotes: request.input.userNotes,
    representative: { ...request.repProfile },
    sentEmailHistory: [...request.sentEmailHistory].sort(
      (left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt),
    ),
    greeting: merchantGreeting(request.input.state || address.state || businessResearch.state),
    tone: request.tone?.trim() || 'professional',
  };
}
