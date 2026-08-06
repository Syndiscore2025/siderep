import type { ExtractedReport } from '@/types';
import { err, ok, toError, logger } from '@/utils';
import type { Result } from '@/utils';

import { getActiveTabId, sendTabMessage } from '@/services/messaging/runtimeMessaging';

/**
 * Report extraction service.
 *
 * Bulk mode reads a Salesforce REPORT rendered on the active tab. The side
 * panel cannot read another tab's DOM directly, so it asks the content script
 * to scroll the (virtualized) report grid, parse it, and return the rows. When
 * the active tab is not a Salesforce page we return a clearly-labelled SAMPLE
 * report so the workflow can still be demonstrated. Rows exist in memory only.
 */

const log = logger.scope('report-extraction');

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

export const SAMPLE_REPORT: ExtractedReport = {
  title: 'Active Accounts (Sample)',
  columns: ['Account Name', 'Email', 'Status', 'Balance'],
  extractedAt: new Date(0).toISOString(),
  sourceUrl: undefined,
  rows: [
    {
      index: 0,
      cells: {
        'Account Name': 'Acme Robotics',
        Email: 'ap@acme.example.com',
        Status: 'Active',
        Balance: '$18,500',
      },
      email: 'ap@acme.example.com',
      name: 'Acme Robotics',
      status: 'Active',
    },
    {
      index: 1,
      cells: {
        'Account Name': 'Vega Foods',
        Email: 'billing@vega.example.com',
        Status: 'Charge Off',
        Balance: '$0',
      },
      email: 'billing@vega.example.com',
      name: 'Vega Foods',
      status: 'Charge Off',
    },
    {
      index: 2,
      cells: {
        'Account Name': 'Northwind Ltd',
        Email: 'accounts@northwind.example.com',
        Status: 'Active',
        Balance: '$7,200',
      },
      email: 'accounts@northwind.example.com',
      name: 'Northwind Ltd',
      status: 'Active',
    },
    {
      index: 3,
      cells: {
        'Account Name': 'Delta Supply',
        Email: 'finance@delta.example.com',
        Status: 'Default',
        Balance: '$44,900',
      },
      email: 'finance@delta.example.com',
      name: 'Delta Supply',
      status: 'Default',
    },
  ],
};

function freshSample(): ExtractedReport {
  return {
    ...SAMPLE_REPORT,
    extractedAt: new Date().toISOString(),
    rows: SAMPLE_REPORT.rows.map((row) => ({ ...row, cells: { ...row.cells } })),
  };
}

export interface ReportExtractionService {
  extractActiveReport(): Promise<Result<ExtractedReport>>;
}

/** Returns the labelled sample report. Used as a fallback off Salesforce. */
export class SampleReportExtractionService implements ReportExtractionService {
  async extractActiveReport(): Promise<Result<ExtractedReport>> {
    log.info('returning sample report');
    return ok(freshSample());
  }
}

/**
 * Real extraction: asks the content script on the active Salesforce tab to
 * scroll + parse the visible report. Falls back to the sample when the active
 * tab is not a Salesforce page.
 */
export class MessagingReportExtractionService implements ReportExtractionService {
  async extractActiveReport(): Promise<Result<ExtractedReport>> {
    if (!(await activeTabIsSalesforce())) {
      log.info('active tab is not Salesforce — returning sample report');
      return ok(freshSample());
    }

    const tabId = await getActiveTabId();
    if (tabId == null) {
      return err(new Error('No active tab was found.'));
    }

    const response = await sendTabMessage(tabId, { type: 'EXTRACT_REPORT' });
    if (!response.ok) {
      return err(
        new Error(
          'Could not reach the Salesforce report. Reload the tab so the extension can attach, then try again.',
        ),
      );
    }

    const payload = response.value;
    if (!payload.ok || !payload.report) {
      return err(toError(payload.error ?? 'No report grid was detected on this page.'));
    }
    return ok(payload.report);
  }
}

export function createReportExtractionService(): ReportExtractionService {
  return new MessagingReportExtractionService();
}
