/** Whether an email should be saved as a Gmail draft or sent. */
export type EmailAction = 'draft' | 'send';

/** A composed email awaiting explicit user approval. */
export interface EmailDraft {
  to: string[];
  cc?: string[];
  bcc?: string[];
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
