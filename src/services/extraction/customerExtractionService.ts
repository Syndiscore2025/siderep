import type { ExtractedCustomer } from '@/types';
import { ok, logger } from '@/utils';
import type { Result } from '@/utils';

/**
 * Customer extraction service.
 *
 * PHASE 1 ships a clearly-labelled SAMPLE record so the full workflow
 * (Read → Review detected fields → Approve → Chat) can be exercised end to
 * end. No page scraping happens yet.
 *
 * PHASE 2 replaces the body of `extractActiveCustomer` with read-only DOM
 * extraction from the visible Salesforce page using
 * `chrome.scripting.executeScript`. The return contract stays identical.
 */

const log = logger.scope('extraction');

export const SAMPLE_CUSTOMER: ExtractedCustomer = {
  displayName: 'Acme Robotics (Sample)',
  recordType: 'Account',
  extractedAt: new Date(0).toISOString(),
  fields: [
    {
      key: 'accountName',
      label: 'Account Name',
      value: 'Acme Robotics',
      source: 'sample',
      approved: true,
    },
    {
      key: 'industry',
      label: 'Industry',
      value: 'Manufacturing',
      source: 'sample',
      approved: true,
    },
    {
      key: 'annualRevenue',
      label: 'Annual Revenue',
      value: '$42,000,000',
      source: 'sample',
      approved: true,
    },
    {
      key: 'primaryContact',
      label: 'Primary Contact',
      value: 'Jordan Vega',
      source: 'sample',
      approved: true,
    },
    {
      key: 'contactEmail',
      label: 'Contact Email',
      value: 'jordan.vega@example.com',
      source: 'sample',
      approved: true,
    },
    {
      key: 'contractEnd',
      label: 'Contract End Date',
      value: '2026-09-30',
      source: 'sample',
      approved: true,
    },
    {
      key: 'openBalance',
      label: 'Outstanding Balance',
      value: '$18,500',
      source: 'sample',
      approved: false,
    },
  ],
};

export interface ExtractionService {
  extractActiveCustomer(): Promise<Result<ExtractedCustomer>>;
}

export class SampleExtractionService implements ExtractionService {
  async extractActiveCustomer(): Promise<Result<ExtractedCustomer>> {
    log.info('returning sample customer (Phase 1 placeholder)');
    return ok({
      ...SAMPLE_CUSTOMER,
      extractedAt: new Date().toISOString(),
      fields: SAMPLE_CUSTOMER.fields.map((field) => ({ ...field })),
    });
  }
}

export function createExtractionService(): ExtractionService {
  return new SampleExtractionService();
}
