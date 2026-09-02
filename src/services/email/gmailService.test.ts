import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EmailDraft } from '@/types';

import { buildGmailComposeUrl, encodeRawMessage, openGmailCompose } from './gmailService';

/** Decodes the base64url `raw` field back to the RFC 2822 message string. */
function decodeRaw(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
}

const draft: EmailDraft = {
  to: ['dana@acme.com', 'sam@acme.com'],
  cc: ['cc@acme.com'],
  subject: 'Renewal for Acme',
  body: 'Hi Dana,\n\nLet us talk renewal.',
};

describe('buildGmailComposeUrl', () => {
  it('builds a compose-window URL with the draft prefilled', () => {
    const url = new URL(buildGmailComposeUrl(draft));
    expect(url.origin + url.pathname).toBe('https://mail.google.com/mail/');
    expect(url.searchParams.get('view')).toBe('cm');
    expect(url.searchParams.get('to')).toBe('dana@acme.com,sam@acme.com');
    expect(url.searchParams.get('cc')).toBe('cc@acme.com');
    expect(url.searchParams.get('su')).toBe('Renewal for Acme');
    expect(url.searchParams.get('body')).toBe('Hi Dana,\n\nLet us talk renewal.');
  });

  it('omits empty optional fields', () => {
    const url = new URL(buildGmailComposeUrl({ to: [], subject: '', body: '' }));
    expect(url.searchParams.has('to')).toBe(false);
    expect(url.searchParams.has('cc')).toBe(false);
    expect(url.searchParams.has('su')).toBe(false);
    expect(url.searchParams.has('body')).toBe(false);
  });
});

describe('openGmailCompose', () => {
  const chromeGlobal = globalThis as unknown as { chrome: typeof chrome };
  const composeUrl = 'https://mail.google.com/mail/?view=cm&to=dana%40acme.com';

  afterEach(() => {
    delete (chromeGlobal.chrome as unknown as Record<string, unknown>).tabs;
    delete (chromeGlobal.chrome as unknown as Record<string, unknown>).windows;
  });

  function installTabs(existing: chrome.tabs.Tab[]) {
    const query = vi.fn(async () => existing);
    const update = vi.fn(async () => undefined);
    const create = vi.fn(async () => undefined);
    const focus = vi.fn(async () => undefined);
    Object.assign(chromeGlobal.chrome, {
      tabs: { query, update, create },
      windows: { update: focus },
    });
    return { query, update, create, focus };
  }

  it('redirects an already-open Gmail tab and focuses its window', async () => {
    const tabs = installTabs([{ id: 7, windowId: 3 } as chrome.tabs.Tab]);
    await openGmailCompose(composeUrl);
    expect(tabs.query).toHaveBeenCalledWith({ url: 'https://mail.google.com/*' });
    expect(tabs.update).toHaveBeenCalledWith(7, { url: composeUrl, active: true });
    expect(tabs.focus).toHaveBeenCalledWith(3, { focused: true });
    expect(tabs.create).not.toHaveBeenCalled();
  });

  it('opens a new tab only when no Gmail tab exists', async () => {
    const tabs = installTabs([]);
    await openGmailCompose(composeUrl);
    expect(tabs.update).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledWith({ url: composeUrl });
  });

  it('falls back to a named window outside the extension and reports blocked pop-ups', async () => {
    const opened = {} as Window;
    const open = vi.spyOn(window, 'open').mockImplementation(() => opened);
    await openGmailCompose(composeUrl);
    expect(open).toHaveBeenCalledWith(composeUrl, 'siderep-gmail');
    expect(opened.opener).toBeNull();

    open.mockImplementation(() => null);
    await expect(openGmailCompose(composeUrl)).rejects.toThrow(/popup blocked/i);
  });
});

describe('encodeRawMessage', () => {
  it('encodes headers and body into a decodable base64url message', () => {
    const decoded = decodeRaw(encodeRawMessage(draft));
    expect(decoded).toContain('To: dana@acme.com, sam@acme.com');
    expect(decoded).toContain('Cc: cc@acme.com');
    expect(decoded).toContain('Subject: Renewal for Acme');
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    // Blank line separates headers from body (RFC 2822).
    expect(decoded).toContain('\r\n\r\nHi Dana,');
  });

  it('produces url-safe base64 (no +, /, or = padding)', () => {
    const encoded = encodeRawMessage(draft);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('omits Cc/Bcc headers when they are absent', () => {
    const decoded = decodeRaw(encodeRawMessage({ to: ['x@acme.com'], subject: 'S', body: 'B' }));
    expect(decoded).not.toContain('Cc:');
    expect(decoded).not.toContain('Bcc:');
  });
});
