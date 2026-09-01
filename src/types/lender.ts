import { z } from 'zod';

const profileText = z.string().trim().max(2_000).default('');
const profileList = z.array(z.string().trim().min(1).max(300)).max(20).default([]);

export const lenderProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  productTypes: profileList,
  standardRenewalThreshold: z.number().min(0).max(100).nullable().default(null),
  earlyRenewalThreshold: z.number().min(0).max(100).nullable().default(null),
  minimumFundingAgeDays: z.number().int().min(0).max(3_650).nullable().default(null),
  renewalTimingRules: profileText,
  payoffBehavior: profileText,
  customerFacingRenewalBenefits: profileList,
  internalRules: profileText,
  lineOfCreditAvailable: z.boolean().default(false),
  termLoanAvailable: z.boolean().default(false),
  specialNotes: profileText,
});

export type LenderProfile = z.infer<typeof lenderProfileSchema>;

/** Only seeded rules explicitly supplied by the SideRep operator are included by default. */
export const DEFAULT_LENDER_PROFILES: LenderProfile[] = [
  {
    name: 'PEAC',
    productTypes: [],
    standardRenewalThreshold: 45,
    earlyRenewalThreshold: null,
    minimumFundingAgeDays: null,
    renewalTimingRules: '',
    payoffBehavior: '',
    customerFacingRenewalBenefits: [
      'Remaining interest on the current PEAC loan may be waived on renewal',
      'Origination fee may decrease from 2% to 1%',
      'Qualified customers may receive rate incentives',
      'Term matching may be available',
      'Monthly payment incentives may be available',
    ],
    internalRules: '',
    lineOfCreditAvailable: false,
    termLoanAvailable: false,
    specialNotes: '',
  },
];
