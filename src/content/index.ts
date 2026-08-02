import type { ExtractCustomerResponse, PingResponse, RuntimeRequest } from '@/types';
import { logger } from '@/utils';

import { parseSalesforceRecord } from '@/services/extraction/salesforceParser';

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

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeRequest,
    _sender,
    sendResponse: (response: PingResponse | ExtractCustomerResponse) => void,
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

    return false;
  },
);

log.debug('ready on', location.hostname);
