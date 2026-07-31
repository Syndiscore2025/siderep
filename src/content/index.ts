import type { PingResponse, RuntimeRequest } from '@/types';
import { logger } from '@/utils';

/**
 * Salesforce content script.
 *
 * PHASE 1: placeholder that proves the injection pipeline works on Salesforce
 * pages (it only answers PING health checks). PHASE 2 adds read-only DOM
 * extraction of the fields already visible to the user.
 *
 * GUARANTEES — this script:
 *  - never modifies the page,
 *  - never injects data into Salesforce,
 *  - never calls Salesforce APIs,
 *  - never persists or transmits anything on its own; it only responds to
 *    explicit, user-initiated requests from the side panel.
 */

const log = logger.scope('content');

chrome.runtime.onMessage.addListener(
  (message: RuntimeRequest, _sender, sendResponse: (response: PingResponse) => void) => {
    if (message?.type === 'PING') {
      sendResponse({
        ok: true,
        source: 'content',
        version: chrome.runtime.getManifest().version,
      });
    }
    return false;
  },
);

log.debug('ready on', location.hostname);
