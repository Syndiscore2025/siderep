import type {
  ExtractCustomerResponse,
  ExtractReportResponse,
  PingResponse,
  RuntimeRequest,
} from '@/types';
import { logger } from '@/utils';

import { parseSalesforceRecord } from '@/services/extraction/salesforceParser';
import { parseSalesforceReport } from '@/services/extraction/salesforceReportParser';

/**
 * Salesforce content script.
 *
 * PHASE 2: answers PING health checks AND performs read-only DOM extraction of
 * the fields already visible on the record the user is viewing.
 *
 * GUARANTEES — this script:
 *  - never modifies the page,
 *  - never injects data into Salesforce,
 *  - never calls Salesforce APIs,
 *  - never persists or transmits anything on its own; it only responds to
 *    explicit, user-initiated requests from the side panel.
 */

const log = logger.scope('content');

function extractCustomer(): ExtractCustomerResponse {
  try {
    const customer = parseSalesforceRecord(document, location.href);
    if (!customer) {
      return {
        ok: false,
        customer: null,
        error: 'No Salesforce record fields were found on this page. Open a record detail view.',
      };
    }
    return { ok: true, customer };
  } catch (error) {
    log.error('extraction failed', error);
    return {
      ok: false,
      customer: null,
      error: error instanceof Error ? error.message : 'Failed to read the page.',
    };
  }
}

/**
 * Salesforce report grids virtualize rows — only the rows near the viewport are
 * in the DOM. We scroll the grid's scroll container to the bottom in steps so
 * more rows render, then let the caller parse. This never mutates report data;
 * it only scrolls the user's own page to reveal already-loaded content.
 */
async function revealAllReportRows(): Promise<void> {
  const scroller =
    document.querySelector<HTMLElement>('.data-grid-container, [role="grid"]')?.parentElement ??
    document.scrollingElement ??
    document.documentElement;
  if (!scroller) return;

  const MAX_STEPS = 40;
  let lastHeight = -1;
  for (let step = 0; step < MAX_STEPS; step++) {
    scroller.scrollTop = scroller.scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (scroller.scrollHeight === lastHeight) break;
    lastHeight = scroller.scrollHeight;
  }
  scroller.scrollTop = 0;
}

async function extractReport(): Promise<ExtractReportResponse> {
  try {
    await revealAllReportRows();
    const report = parseSalesforceReport(document, location.href);
    if (!report) {
      return {
        ok: false,
        report: null,
        error: 'No Salesforce report grid was found on this page. Open a report in run mode.',
      };
    }
    return { ok: true, report };
  } catch (error) {
    log.error('report extraction failed', error);
    return {
      ok: false,
      report: null,
      error: error instanceof Error ? error.message : 'Failed to read the report.',
    };
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeRequest,
    _sender,
    sendResponse: (
      response: PingResponse | ExtractCustomerResponse | ExtractReportResponse,
    ) => void,
  ) => {
    if (message?.type === 'PING') {
      sendResponse({
        ok: true,
        source: 'content',
        version: chrome.runtime.getManifest().version,
      });
      return false;
    }

    if (message?.type === 'EXTRACT_CUSTOMER') {
      sendResponse(extractCustomer());
      return false;
    }

    if (message?.type === 'EXTRACT_REPORT') {
      // Async: keep the response channel open by returning true.
      void extractReport().then(sendResponse);
      return true;
    }

    return false;
  },
);

log.debug('ready on', location.hostname);
