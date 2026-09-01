export type RenewalEligibility = 'eligible' | 'not_eligible';
export type RenewalOutreachType = 'renewal' | 'add_on';
export type RenewalResearchConfidence = 'high' | 'medium' | 'low';
export type RenewalOutreachObjective =
  | 'renewal'
  | 'additional_working_capital'
  | 'additional_position'
  | 'line_of_credit'
  | 'term_loan'
  | 'renewal_plus_alternative_options'
  | 'existing_outstanding_offer';
export type RenewalFundingScenario =
  'renewal_eligible' | 'not_yet_eligible' | 'line_of_credit' | 'term_loan' | 'outstanding_offer';

export interface RenewalInput {
  merchantName: string;
  businessName: string;
  businessLocator: string;
  accountName: string;
  dba: string;
  businessAddress: string;
  businessAddressGoogleUrl: string;
  city: string;
  state: string;
  industry: string;
  currentBalance: string;
  percentagePaid: string;
  latestLender: string;
  additionalSameDayLender: string;
  originalFundingAmount: string;
  originalFundingDate: string;
  productType: string;
  renewalEligibilityDate: string;
  existingPositions: string;
  possibleLineOfCredit: string;
  possibleTermLoan: string;
  specialLenderIncentives: string;
  existingOutstandingOffer: string;
  website: string;
}

export interface RenewalBusinessResearch {
  exactBusinessVerified: boolean;
  legalBusinessName: string;
  dba: string;
  address: string;
  city: string;
  state: string;
  website: string;
  industry: string;
  companyDescription: string;
  products: string[];
  services: string[];
  customerType: string;
  businessModel: string;
  locationDetails: string;
  currentBusinessActivity: string[];
  workingCapitalUses: string[];
  confidence: RenewalResearchConfidence;
}

export interface RenewalMerchantContext {
  merchant: {
    legalBusinessName: string;
    dba: string;
    merchantFirstName: string;
    merchantLastName: string;
    address: string;
    googleAddressUrl: string;
    city: string;
    state: string;
    website: string;
    industry: string;
  };
  businessResearch: RenewalBusinessResearch;
  funding: {
    currentLender: string;
    originalFundingAmount: string;
    originalFundingDate: string;
    currentBalance: string;
    paidInPercentage: string;
    productType: string;
    renewalEligibility: RenewalEligibility;
    renewalEligibilityDate: string;
    existingPositions: string;
    possibleLineOfCredit: string;
    possibleTermLoan: string;
    specialLenderIncentives: string;
    existingOutstandingOffer: string;
  };
  outreachObjective: RenewalOutreachObjective;
  fundingScenario: {
    primary: RenewalFundingScenario;
    includesLineOfCredit: boolean;
    includesTermLoan: boolean;
    payoffSupported: boolean;
    singlePositionSupported: boolean;
    expirationUrgencySupported: boolean;
  };
  representative: RenewalRepProfile;
  sentEmailHistory: RenewalSentEmailContext[];
}

export interface RenewalRepProfile {
  name: string;
  company: string;
  phone: string;
  email: string;
}

export interface RenewalSource {
  title: string;
  url: string;
}

export interface RenewalDraft {
  businessSummary: string;
  sources: RenewalSource[];
  emailSubject: string;
  emailBody: string;
  smsBody: string;
}

export interface RenewalSentEmailRecord {
  id: string;
  draftId: string;
  subject: string;
  body: string;
  copiedAt: string;
}

export interface RenewalCycleRecord {
  id: string;
  outreachType: RenewalOutreachType;
  sentEmails: RenewalSentEmailRecord[];
  startedAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface RenewalAccountIdentity {
  merchantName: string;
  businessName: string;
  accountName: string;
  dba: string;
  website: string;
}

export interface RenewalAccountRecord {
  id: string;
  identity: RenewalAccountIdentity;
  cycles: RenewalCycleRecord[];
  activeCycleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalHistoryStore {
  schemaVersion: 1;
  accounts: RenewalAccountRecord[];
}

export interface RenewalSentEmailContext {
  subject: string;
  body: string;
  sentAt: string;
}

export interface RenewalResearchRequest {
  input: RenewalInput;
  eligibility: RenewalEligibility;
  repProfile: RenewalRepProfile;
  outreachType: RenewalOutreachType;
  sentEmailHistory: RenewalSentEmailContext[];
}

export const EMPTY_RENEWAL_INPUT: RenewalInput = {
  merchantName: '',
  businessName: '',
  businessLocator: '',
  accountName: '',
  dba: '',
  businessAddress: '',
  businessAddressGoogleUrl: '',
  city: '',
  state: '',
  industry: '',
  currentBalance: '',
  percentagePaid: '',
  latestLender: '',
  additionalSameDayLender: '',
  originalFundingAmount: '',
  originalFundingDate: '',
  productType: '',
  renewalEligibilityDate: '',
  existingPositions: '',
  possibleLineOfCredit: '',
  possibleTermLoan: '',
  specialLenderIncentives: '',
  existingOutstandingOffer: '',
  website: '',
};
