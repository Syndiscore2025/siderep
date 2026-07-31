import type { ExtractedCustomer } from './customer';

/**
 * Typed message contracts exchanged over `chrome.runtime` between the side
 * panel, the background service worker, and the Salesforce content script.
 *
 * Keeping these in one place gives every surface a single source of truth and
 * lets us validate messages at the boundary (Phase 2+).
 */

export const RUNTIME_MESSAGE_TYPES = ['PING', 'EXTRACT_CUSTOMER'] as const;
export type RuntimeMessageType = (typeof RUNTIME_MESSAGE_TYPES)[number];

export interface PingRequest {
  type: 'PING';
}
export interface PingResponse {
  ok: true;
  source: 'background' | 'content';
  version: string;
}

export interface ExtractCustomerRequest {
  type: 'EXTRACT_CUSTOMER';
}
export interface ExtractCustomerResponse {
  ok: boolean;
  customer: ExtractedCustomer | null;
  error?: string;
}

export type RuntimeRequest = PingRequest | ExtractCustomerRequest;
export type RuntimeResponse = PingResponse | ExtractCustomerResponse;

/** Maps a request type to its expected response for typed messaging helpers. */
export interface RuntimeResponseFor {
  PING: PingResponse;
  EXTRACT_CUSTOMER: ExtractCustomerResponse;
}
