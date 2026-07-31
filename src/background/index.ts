import type { PingResponse, RuntimeRequest } from '@/types';
import { logger } from '@/utils';

/**
 * Background service worker.
 *
 * Responsibilities (Phase 1):
 *  - Configure the toolbar action to open the Chrome Side Panel.
 *  - Answer PING health checks from other surfaces.
 *
 * PRIVACY: the service worker is stateless. It never stores, caches, or logs
 * customer data — it only routes typed messages between surfaces.
 */

const log = logger.scope('background');

chrome.runtime.onInstalled.addListener((details) => {
  log.info('installed', details.reason);
});

// Clicking the toolbar icon opens the side panel (Chrome 116+).
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: unknown) => log.error('failed to set side panel behavior', error));

chrome.runtime.onMessage.addListener(
  (message: RuntimeRequest, _sender, sendResponse: (response: PingResponse) => void) => {
    if (message?.type === 'PING') {
      sendResponse({
        ok: true,
        source: 'background',
        version: chrome.runtime.getManifest().version,
      });
    }
    // All Phase 1 responses are synchronous; close the channel immediately.
    return false;
  },
);
