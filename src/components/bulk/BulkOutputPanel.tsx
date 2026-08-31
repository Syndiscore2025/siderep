import { useEffect, useState } from 'react';

import { Badge, Button, Field, Input, Textarea } from '@/components/ui';
import { buildGmailComposeUrl } from '@/services';
import type { BulkRecipient, EmailDeliveryMode } from '@/types';

type OutputStatus = 'prepared' | 'copied' | 'opened';

export interface BulkOutputPanelProps {
  recipients: BulkRecipient[];
  subject: string;
  body: string;
  deliveryMode: Exclude<EmailDeliveryMode, 'gmail_api'>;
}

function copyText(email: string, subject: string, body: string): string {
  return `To: ${email}\nSubject: ${subject}\n\n${body}`;
}

/** Web-only prepared output. Recipient and content values remain in component memory. */
export function BulkOutputPanel({ recipients, subject, body, deliveryMode }: BulkOutputPanelProps) {
  const selected = recipients.filter((recipient) => recipient.selected);
  const [statuses, setStatuses] = useState<Record<string, OutputStatus>>({});
  const [copyError, setCopyError] = useState('');

  useEffect(() => {
    setStatuses(
      Object.fromEntries(
        recipients
          .filter((recipient) => recipient.selected)
          .map(({ email }) => [email, 'prepared']),
      ),
    );
    setCopyError('');
  }, [body, deliveryMode, recipients, subject]);

  const copy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(copyText(email, subject, body));
      setStatuses((current) => ({ ...current, [email]: 'copied' }));
      setCopyError('');
    } catch {
      setCopyError('Could not copy. The prepared output remains visible and selectable below.');
    }
  };

  return (
    <section aria-labelledby="bulk-output-heading" className="space-y-3 border-t border-edge pt-3">
      <div>
        <h3 id="bulk-output-heading" className="text-xs font-semibold text-content-primary">
          Prepared output
        </h3>
        <p className="mt-1 text-[11px] text-content-muted">
          {deliveryMode === 'gmail_compose_url'
            ? 'Open each prepared Gmail compose link when you are ready.'
            : 'Copy each prepared email into your preferred email client.'}
        </p>
      </div>

      <Field label="Subject">
        <Input aria-label="Prepared subject" readOnly value={subject} />
      </Field>
      <Field label="Body">
        <Textarea aria-label="Prepared body" readOnly rows={8} value={body} />
      </Field>

      {copyError && (
        <p className="text-[11px] text-danger" role="alert">
          {copyError}
        </p>
      )}

      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {selected.map((recipient) => {
          const status = statuses[recipient.email] ?? 'prepared';
          const url = buildGmailComposeUrl({ to: [recipient.email], subject, body });
          return (
            <li
              key={recipient.email}
              className="space-y-2 rounded-lg border border-edge bg-surface-2/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-content-muted">To</span>
                  <Input
                    aria-label={`To for ${recipient.email}`}
                    className="mt-1"
                    readOnly
                    value={recipient.email}
                  />
                </span>
                <Badge tone={status === 'prepared' ? 'neutral' : 'success'}>{status}</Badge>
              </div>
              {deliveryMode === 'manual_composer' ? (
                <Button
                  aria-label={`Copy prepared email for ${recipient.email}`}
                  size="sm"
                  onClick={() => void copy(recipient.email)}
                >
                  Copy prepared email
                </Button>
              ) : (
                <a
                  aria-label={`Open Gmail for ${recipient.email}`}
                  className="inline-flex h-7 items-center rounded-md border border-edge bg-surface-2 px-2.5 text-xs font-medium text-accent hover:underline"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    setStatuses((current) => ({ ...current, [recipient.email]: 'opened' }))
                  }
                >
                  Open prepared email in Gmail
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
