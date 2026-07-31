import '@testing-library/jest-dom/vitest';

import { beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal in-memory `chrome.storage.local` mock.
//
// The extension only ever persists *configuration* (never customer data), and
// it does so through `chrome.storage.local`. Under jsdom there is no `chrome`
// global, so we install a promise-based stand-in that mirrors the MV3 API
// closely enough for the settings service tests.
// ---------------------------------------------------------------------------

type StorageRecord = Record<string, unknown>;

const store: StorageRecord = {};

function createStorageArea(): chrome.storage.StorageArea {
  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((k) => [k, store[k]]));
      }
      return Object.fromEntries(Object.keys(keys).map((k) => [k, k in store ? store[k] : keys[k]]));
    },
    async set(items: StorageRecord) {
      Object.assign(store, items);
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete store[k];
    },
    async clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
  } as unknown as chrome.storage.StorageArea;
}

const chromeMock = {
  storage: {
    local: createStorageArea(),
    onChanged: {
      addListener: () => {},
      removeListener: () => {},
    },
  },
  runtime: {
    lastError: undefined,
    id: 'test-extension-id',
  },
} as unknown as typeof chrome;

(globalThis as unknown as { chrome: typeof chrome }).chrome = chromeMock;

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});
