import { describe, expect, it } from 'vitest';

import type { EmailDraft } from '@/types';

import { buildGmailComposeUrl, encodeRawMessage } from './gmailService';

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
