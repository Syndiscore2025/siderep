import type { EmailDraft, EmailResult, Settings } from '@/types';
import { err, ok, toError, logger } from '@/utils';
import type { Result } from '@/utils';

/**
 * Gmail service (Google Workspace).
 *
 * Implements the `gmail_api` delivery mode: OAuth via `chrome.identity` and a
 * send through the Gmail REST API (`gmail.googleapis.com`). Sending ALWAYS
 * requires explicit user approval in the UI first — the extension never sends
 * in the background. The `gmail_compose_url` mode is a pure URL builder below
 * (no OAuth, no network) for orgs that block API sends.
 */

const log = logger.scope('gmail');

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_COMPOSE_URL = 'https://mail.google.com/mail/';
const GMAIL_TAB_PATTERN = 'https://mail.google.com/*';
/** Named target so repeated web-app opens reuse one Gmail window. */
const GMAIL_WINDOW_NAME = 'siderep-gmail';

/** Base64url-encodes a UTF-8 string (Gmail's `raw` message format). */
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Builds an RFC 2822 message and returns it base64url-encoded for the API. */
export function encodeRawMessage(draft: EmailDraft): string {
  const headers = [
    `To: ${draft.to.join(', ')}`,
    draft.cc?.length ? `Cc: ${draft.cc.join(', ')}` : '',
    draft.bcc?.length ? `Bcc: ${draft.bcc.join(', ')}` : '',
    `Subject: ${draft.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ].filter(Boolean);
  return toBase64Url(`${headers.join('\r\n')}\r\n\r\n${draft.body}`);
}

/** Builds a Gmail compose-window URL pre-filled from the draft (no send). */
export function buildGmailComposeUrl(draft: EmailDraft): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1' });
  if (draft.to.length) params.set('to', draft.to.join(','));
  if (draft.cc?.length) params.set('cc', draft.cc.join(','));
  if (draft.bcc?.length) params.set('bcc', draft.bcc.join(','));
  if (draft.subject) params.set('su', draft.subject);
  if (draft.body) params.set('body', draft.body);
  return `${GMAIL_COMPOSE_URL}?${params.toString()}`;
}

/**
 * Opens a compose URL in the user's Gmail. In the extension this reuses the
 * first open Gmail tab (e.g. a pinned inbox) and focuses it; a new tab is only
 * created when none exists. In the web app it falls back to a named window and
 * throws when a pop-up blocker prevents it.
 */
export async function openGmailCompose(url: string): Promise<void> {
  const tabs = typeof chrome !== 'undefined' ? chrome.tabs : undefined;
  if (tabs?.query && tabs.update && tabs.create) {
    const [existing] = await tabs.query({ url: GMAIL_TAB_PATTERN });
    if (existing?.id !== undefined) {
      await tabs.update(existing.id, { url, active: true });
      if (existing.windowId !== undefined && chrome.windows?.update) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return;
    }
    await tabs.create({ url });
    return;
  }
  const opened = window.open(url, GMAIL_WINDOW_NAME);
  if (!opened) throw new Error('Popup blocked');
  opened.opener = null;
}

export interface EmailService {
  isConnected(): boolean;
  getConnectedEmail(): string | null;
  authorize(interactive?: boolean): Promise<Result<string>>;
  sendEmail(draft: EmailDraft): Promise<Result<EmailResult>>;
}

export class GmailService implements EmailService {
  constructor(private readonly settings: Settings) {}

  isConnected(): boolean {
    return this.settings.google.connectedEmail !== null;
  }

  getConnectedEmail(): string | null {
    return this.settings.google.connectedEmail;
  }

  /** Obtains an OAuth token via chrome.identity, prompting the user if needed. */
  authorize(interactive = true): Promise<Result<string>> {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.identity?.getAuthToken) {
        resolve(err(new Error('Google sign-in is unavailable in this context.')));
        return;
      }
      chrome.identity.getAuthToken({ interactive }, (token) => {
        const lastError = chrome.runtime?.lastError;
        const value = typeof token === 'string' ? token : token?.token;
        if (lastError || !value) {
          resolve(err(new Error(lastError?.message ?? 'Google authorization failed.')));
          return;
        }
        resolve(ok(value));
      });
    });
  }

  async sendEmail(draft: EmailDraft): Promise<Result<EmailResult>> {
    const tokenResult = await this.authorize(true);
    if (!tokenResult.ok) return err(tokenResult.error);

    try {
      const response = await fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenResult.value}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodeRawMessage(draft) }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        log.error('Gmail send failed', response.status, detail);
        return err(new Error(`Gmail send failed (${response.status}). ${detail.slice(0, 200)}`));
      }
      const json = (await response.json()) as { id?: string; threadId?: string };
      return ok({ action: 'send', success: true, id: json.id, threadId: json.threadId });
    } catch (error) {
      return err(toError(error));
    }
  }
}

export function createEmailService(settings: Settings): EmailService {
  return new GmailService(settings);
}
