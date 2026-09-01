export type RenewalEligibility = 'eligible' | 'not_eligible';
export type RenewalOutreachType = 'renewal' | 'add_on';

export interface RenewalInput {
  merchantName: string;
  businessName: string;
  accountName: string;
  dba: string;
  businessAddress: string;
  currentBalance: string;
  percentagePaid: string;
  latestLender: string;
  additionalSameDayLender: string;
  website: string;
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
  accountName: '',
  dba: '',
  businessAddress: '',
  currentBalance: '',
  percentagePaid: '',
  latestLender: '',
  additionalSameDayLender: '',
  website: '',
};
