import '@testing-library/jest-dom/vitest';

import { beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal in-memory `chrome.storage.local` mock.
//
// The extension persists bounded configuration and user-controlled local
// history through `chrome.storage.local`. Under jsdom there is no `chrome`
// global, so this promise-based stand-in mirrors the MV3 API and change events.
// ---------------------------------------------------------------------------

type StorageRecord = Record<string, unknown>;

const store: StorageRecord = {};
type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
const storageListeners = new Set<StorageListener>();

function emitStorageChanges(changes: Record<string, chrome.storage.StorageChange>): void {
  for (const listener of storageListeners) listener(changes, 'local');
}

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
      const changes = Object.fromEntries(
        Object.entries(items).map(([key, value]) => [
          key,
          { oldValue: store[key], newValue: value },
        ]),
      );
      Object.assign(store, items);
      emitStorageChanges(changes);
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const k of list) changes[k] = { oldValue: store[k], newValue: undefined };
      for (const k of list) delete store[k];
      emitStorageChanges(changes);
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
      addListener: (listener: StorageListener) => storageListeners.add(listener),
      removeListener: (listener: StorageListener) => storageListeners.delete(listener),
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
  storageListeners.clear();
});
