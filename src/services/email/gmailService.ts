import type { EmailDraft, EmailResult, Settings } from '@/types';
import { err, logger } from '@/utils';
import type { Result } from '@/utils';

/**
 * Gmail service (Google Workspace).
 *
 * PHASE 1: placeholder. PHASE 3 implements OAuth via `chrome.identity` and the
 * Gmail REST API (`gmail.googleapis.com`). Both operations ALWAYS require
 * explicit user approval in the UI first — the extension never sends or drafts
 * automatically or in the background.
 */

const log = logger.scope('gmail');

export interface EmailService {
  isConnected(): boolean;
  getConnectedEmail(): string | null;
  createDraft(draft: EmailDraft): Promise<Result<EmailResult>>;
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

  async createDraft(_draft: EmailDraft): Promise<Result<EmailResult>> {
    log.warn('Gmail draft creation is not implemented until Phase 3');
    return err(new Error('Creating Gmail drafts arrives in Phase 3.'));
  }

  async sendEmail(_draft: EmailDraft): Promise<Result<EmailResult>> {
    log.warn('Gmail send is not implemented until Phase 3');
    return err(new Error('Sending via Gmail arrives in Phase 3.'));
  }
}

export function createEmailService(settings: Settings): EmailService {
  return new GmailService(settings);
}
