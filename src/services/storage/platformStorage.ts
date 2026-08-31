import { isExtensionContext } from '@/utils/platform';
import { logger } from '@/utils/logger';

export type PlatformStorageKind = 'chrome' | 'localStorage';
export type PlatformStorageListener<T> = (value: T | undefined) => void;

export interface PlatformStorage {
  readonly kind: PlatformStorageKind;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  subscribe<T>(key: string, listener: PlatformStorageListener<T>): () => void;
}

const log = logger.scope('platform-storage');

function createExtensionStorage(): PlatformStorage {
  return {
    kind: 'chrome',
    async get<T>(key: string): Promise<T | undefined> {
      const stored = await chrome.storage.local.get(key);
      return stored[key] as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.local.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await chrome.storage.local.remove(key);
    },
    subscribe<T>(key: string, listener: PlatformStorageListener<T>): () => void {
      const onChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ): void => {
        if (areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, key)) {
          listener(changes[key]?.newValue as T | undefined);
        }
      };
      chrome.storage.onChanged.addListener(onChanged);
      return () => chrome.storage.onChanged.removeListener(onChanged);
    },
  };
}

function parseWebValue<T>(value: string | null): T | undefined {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    log.warn('ignored malformed JSON in web storage');
    return undefined;
  }
}

function createWebStorage(): PlatformStorage {
  const listeners = new Map<string, Set<PlatformStorageListener<unknown>>>();
  const notify = (key: string, value: unknown): void => {
    for (const listener of listeners.get(key) ?? []) listener(value);
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.storageArea !== window.localStorage || event.key === null) return;
    notify(event.key, parseWebValue(event.newValue));
  };
  window.addEventListener('storage', onStorage);

  return {
    kind: 'localStorage',
    async get<T>(key: string): Promise<T | undefined> {
      return parseWebValue<T>(window.localStorage.getItem(key));
    },
    async set<T>(key: string, value: T): Promise<void> {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new TypeError('Storage value is not JSON-serializable.');
      window.localStorage.setItem(key, serialized);
      notify(key, value);
    },
    async remove(key: string): Promise<void> {
      window.localStorage.removeItem(key);
      notify(key, undefined);
    },
    subscribe<T>(key: string, listener: PlatformStorageListener<T>): () => void {
      const listenersForKey = listeners.get(key) ?? new Set<PlatformStorageListener<unknown>>();
      listenersForKey.add(listener as PlatformStorageListener<unknown>);
      listeners.set(key, listenersForKey);
      return () => {
        listenersForKey.delete(listener as PlatformStorageListener<unknown>);
        if (!listenersForKey.size) listeners.delete(key);
      };
    },
  };
}

export const platformStorage: PlatformStorage = isExtensionContext()
  ? createExtensionStorage()
  : createWebStorage();
