import type { ExtractedCustomer } from '@/types';
import { err, ok, toError, logger } from '@/utils';
import type { Result } from '@/utils';

import { getActiveTabId, sendTabMessage } from '@/services/messaging/runtimeMessaging';

/**
 * Customer extraction service.
 *
 * PHASE 2 performs read-only DOM extraction from the visible Salesforce page.
 * The side panel cannot read another tab's DOM directly, so it asks the
 * content script (injected on Salesforce domains) to parse the page and return
 * the visible fields. When the active tab is not a Salesforce page we fall back
 * to a clearly-labelled SAMPLE record so the workflow can still be demonstrated.
 */

const log = logger.scope('extraction');

const SALESFORCE_HOST =
  /(\.|^)(salesforce\.com|force\.com|visualforce\.com|salesforce-setup\.com)$/i;

async function activeTabIsSalesforce(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return false;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return false;
  try {
    return SALESFORCE_HOST.test(new URL(tab.url).hostname);
  } catch {
    return false;
  }
}

export const SAMPLE_CUSTOMER: ExtractedCustomer = {
  source: 'sample',
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

function freshSample(): ExtractedCustomer {
  return {
    ...SAMPLE_CUSTOMER,
    extractedAt: new Date().toISOString(),
    fields: SAMPLE_CUSTOMER.fields.map((field) => ({ ...field })),
  };
}

export interface ExtractionService {
  extractActiveCustomer(): Promise<Result<ExtractedCustomer>>;
}

export interface ExtractionServiceOptions {
  /** Defaults to true for existing/demo callers. Renewal callers can disable it. */
  allowSampleFallback?: boolean;
  /** @deprecated Prefer `allowSampleFallback`. */
  sampleFallback?: boolean;
}

/** Returns the labelled sample record. Used as a fallback off Salesforce. */
export class SampleExtractionService implements ExtractionService {
  async extractActiveCustomer(): Promise<Result<ExtractedCustomer>> {
    log.info('returning sample customer');
    return ok(freshSample());
  }
}

/**
 * Real extraction: asks the content script on the active Salesforce tab to
 * parse the visible record. Falls back to the sample when the active tab is
 * not a Salesforce page (e.g. the user is demoing the extension elsewhere).
 */
export class MessagingExtractionService implements ExtractionService {
  constructor(private readonly options: ExtractionServiceOptions = {}) {}

  async extractActiveCustomer(): Promise<Result<ExtractedCustomer>> {
    if (!(await activeTabIsSalesforce())) {
      if ((this.options.allowSampleFallback ?? this.options.sampleFallback) === false) {
        return err(new Error('The active tab is not a Salesforce page.'));
      }
      log.info('active tab is not Salesforce — returning sample customer');
      return ok(freshSample());
    }

    const tabId = await getActiveTabId();
    if (tabId == null) {
      return err(new Error('No active tab was found.'));
    }

    const response = await sendTabMessage(tabId, { type: 'EXTRACT_CUSTOMER' });
    if (!response.ok) {
      return err(
        new Error(
          'Could not reach the Salesforce page. Reload the tab so the extension can attach, then try again.',
        ),
      );
    }

    const payload = response.value;
    if (!payload.ok || !payload.customer) {
      return err(toError(payload.error ?? 'No customer fields were detected on this page.'));
    }
    return ok(payload.customer);
  }
}

export function createExtractionService(options: ExtractionServiceOptions = {}): ExtractionService {
  return new MessagingExtractionService(options);
}
