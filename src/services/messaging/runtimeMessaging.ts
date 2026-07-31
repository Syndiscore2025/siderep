import type { RuntimeMessageType, RuntimeRequest, RuntimeResponseFor } from '@/types';
import { err, ok, toError, logger } from '@/utils';
import type { Result } from '@/utils';

/**
 * Typed wrappers around `chrome.runtime`/`chrome.tabs` messaging so every
 * surface (side panel, background, content script) exchanges only the message
 * shapes declared in `@/types/messaging`.
 */

const log = logger.scope('messaging');

type RequestOf<T extends RuntimeMessageType> = Extract<RuntimeRequest, { type: T }>;

/** Sends a message to the background service worker. */
export async function sendRuntimeMessage<T extends RuntimeMessageType>(
  request: RequestOf<T>,
): Promise<Result<RuntimeResponseFor[T]>> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return err(new Error('chrome.runtime is unavailable in this context'));
  }
  try {
    const response = (await chrome.runtime.sendMessage(request)) as RuntimeResponseFor[T];
    return ok(response);
  } catch (error) {
    log.error('runtime message failed', request.type, error);
    return err(toError(error));
  }
}

/** Sends a message to the content script in a specific tab. */
export async function sendTabMessage<T extends RuntimeMessageType>(
  tabId: number,
  request: RequestOf<T>,
): Promise<Result<RuntimeResponseFor[T]>> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
    return err(new Error('chrome.tabs is unavailable in this context'));
  }
  try {
    const response = (await chrome.tabs.sendMessage(tabId, request)) as RuntimeResponseFor[T];
    return ok(response);
  } catch (error) {
    log.error('tab message failed', request.type, error);
    return err(toError(error));
  }
}

/** Resolves the id of the active tab in the current window, if any. */
export async function getActiveTabId(): Promise<number | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}
