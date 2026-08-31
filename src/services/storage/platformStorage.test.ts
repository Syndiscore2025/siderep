import { afterEach, describe, expect, it, vi } from 'vitest';

const extensionChrome = chrome;

async function loadStorage(chromeValue: unknown) {
  vi.resetModules();
  vi.stubGlobal('chrome', chromeValue);
  return (await import('./platformStorage')).platformStorage;
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('platformStorage extension adapter', () => {
  it('round-trips values through Chrome storage', async () => {
    const storage = await loadStorage(extensionChrome);
    expect(storage.kind).toBe('chrome');
    await storage.set('target', { count: 2 });
    await expect(storage.get('target')).resolves.toEqual({ count: 2 });
    await storage.remove('target');
    await expect(storage.get('target')).resolves.toBeUndefined();
  });

  it('propagates Chrome write failures', async () => {
    const storage = await loadStorage(extensionChrome);
    vi.spyOn(extensionChrome.storage.local, 'set').mockRejectedValueOnce(new Error('write failed'));
    await expect(storage.set('target', 1)).rejects.toThrow('write failed');
  });

  it('subscribes only to the exact key in the local area', async () => {
    type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
    let listener: StorageListener = () => {};
    const chromeMock = {
      runtime: { id: 'extension-id' },
      storage: {
        local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
        onChanged: {
          addListener: vi.fn((next: StorageListener) => {
            listener = next;
          }),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;
    const storage = await loadStorage(chromeMock);
    const callback = vi.fn();
    const unsubscribe = storage.subscribe('target', callback);

    listener({ target: { newValue: 1 } }, 'sync');
    listener({ other: { newValue: 2 } }, 'local');
    expect(callback).not.toHaveBeenCalled();
    listener({ target: { newValue: 3 } }, 'local');
    expect(callback).toHaveBeenCalledWith(3);
    unsubscribe();
    expect(chromeMock.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
  });
});

describe('platformStorage web adapter', () => {
  it('uses JSON localStorage with same-tab and native cross-tab notifications', async () => {
    const storage = await loadStorage(undefined);
    const callback = vi.fn();
    const unsubscribe = storage.subscribe<{ count: number }>('target', callback);

    expect(storage.kind).toBe('localStorage');
    await storage.set('target', { count: 1 });
    await expect(storage.get('target')).resolves.toEqual({ count: 1 });
    expect(callback).toHaveBeenLastCalledWith({ count: 1 });

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'target',
        newValue: JSON.stringify({ count: 2 }),
        storageArea: window.localStorage,
      }),
    );
    expect(callback).toHaveBeenLastCalledWith({ count: 2 });
    await storage.remove('target');
    expect(callback).toHaveBeenLastCalledWith(undefined);
    unsubscribe();
  });

  it('treats malformed JSON as absent without logging stored content', async () => {
    const storage = await loadStorage(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.setItem('target', 'private malformed value');

    await expect(storage.get('target')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).not.toContain('private malformed value');
  });

  it('propagates set and remove failures', async () => {
    const storage = await loadStorage(undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    await expect(storage.set('target', 1)).rejects.toThrow('write failed');

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('remove failed');
    });
    await expect(storage.remove('target')).rejects.toThrow('remove failed');
  });
});
