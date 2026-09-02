import { useState } from 'react';

import { Button, Card, Field, Input, MailIcon, Textarea } from '@/components/ui';
import { useRenewal } from '@/hooks/useRenewal';

type CopyState =
  { kind: 'idle' } | { kind: 'success'; message: string } | { kind: 'error'; message: string };

export function RenewalResults() {
  const { draft, editDraft, copyEmail, openInGmail, isCopyingEmail } = useRenewal();
  const [copyState, setCopyState] = useState<CopyState>({ kind: 'idle' });
  if (!draft) return null;

  const copySecondary = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState({ kind: 'success', message: `${label} copied.` });
    } catch {
      setCopyState({
        kind: 'error',
        message: `Could not copy ${label.toLowerCase()}. The text remains available and selectable for manual copying.`,
      });
    }
  };

  return (
    <Card title="Renewal results" icon={<MailIcon className="size-3.5" />}>
      <div className="space-y-4">
        <p className="text-xs text-content-secondary">
          Edit any field before copying or opening it in Gmail.
        </p>
        <Field label="Subject">
          <Input
            value={draft.emailSubject}
            onChange={(event) => editDraft('emailSubject', event.target.value)}
          />
        </Field>
        <Field label="Email">
          <Textarea
            rows={12}
            value={draft.emailBody}
            onChange={(event) => editDraft('emailBody', event.target.value)}
          />
        </Field>
        <Field label="Text Message">
          <Textarea
            rows={4}
            value={draft.smsBody}
            onChange={(event) => editDraft('smsBody', event.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={isCopyingEmail}
            onClick={() => void openInGmail()}
          >
            Open in Gmail
          </Button>
          <Button size="sm" loading={isCopyingEmail} onClick={() => void copyEmail()}>
            Copy Email
          </Button>
          <Button size="sm" onClick={() => void copySecondary(draft.smsBody, 'Text')}>
            Copy Text
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copySecondary(draft.emailSubject, 'Subject')}
          >
            Copy Subject
          </Button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={
            copyState.kind === 'error' ? 'text-[11px] text-danger' : 'text-[11px] text-success'
          }
        >
          {copyState.kind === 'idle' ? '' : copyState.message}
        </p>
      </div>
    </Card>
  );
}
