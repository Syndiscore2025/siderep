/** Whether an email should be saved as a Gmail draft or sent. */
export type EmailAction = 'draft' | 'send';

/**
 * How an approved email leaves SideRep. All three keep the "user must approve
 * before send" rule; they differ only in transport so the rep can fall back if
 * one path is blocked by their org.
 *
 *   gmail_api         — sent directly via the Gmail REST API (chrome.identity OAuth)
 *   gmail_compose_url — opens Gmail's compose window pre-filled; the user clicks Send
 *   manual_composer   — an in-panel editable form the user copies out manually
 */
export const EMAIL_DELIVERY_MODES = ['gmail_api', 'gmail_compose_url', 'manual_composer'] as const;
export type EmailDeliveryMode = (typeof EMAIL_DELIVERY_MODES)[number];

/** A composed email awaiting explicit user approval. */
export interface EmailDraft {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

/**
 * A reusable email template supplied by the user. `subject` and `body` may
 * contain `{{placeholder}}` tokens that the AI fills from freshly extracted
 * (re-crawled) page fields at generation time.
 */
export interface EmailTemplate {
  subject: string;
  body: string;
}

/** The AI's filled-in draft, ready to review in the composer. */
export interface GeneratedEmail {
  to: string[];
  subject: string;
  body: string;
}

/** The outcome of a Gmail draft/send operation. */
export interface EmailResult {
  action: EmailAction;
  success: boolean;
  /** Gmail draft or message id when available. */
  id?: string;
  threadId?: string;
  error?: string;
}

/**
 * A record of an email we sent — SideRep's OWN artifact, explicitly allowed to
 * persist. It is NOT customer data: raw Salesforce fields are never stored here.
 * Fresh customer info is always re-crawled from the page when needed.
 */
export interface SentEmailRecord {
  id: string;
  to: string[];
  subject: string;
  body: string;
  deliveryMode: EmailDeliveryMode;
  /** Gmail identifiers when the transport returns them (opaque pointers). */
  messageId?: string;
  threadId?: string;
  /** ISO timestamp of when the send was recorded. */
  sentAt: string;
}
