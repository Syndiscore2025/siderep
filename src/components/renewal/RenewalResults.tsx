import { useState } from 'react';

import { Button, Card, Field, Input, MailIcon, Textarea } from '@/components/ui';
import { useRenewal } from '@/hooks/useRenewal';

type CopyState =
  { kind: 'idle' } | { kind: 'success'; message: string } | { kind: 'error'; message: string };

export function RenewalResults() {
  const { draft, copyEmail, isCopyingEmail } = useRenewal();
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
        <Field label="Subject">
          <Input
            readOnly
            value={draft.emailSubject}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>
        <Field label="Email">
          <Textarea
            readOnly
            rows={9}
            value={draft.emailBody}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>
        <Field label="Text Message">
          <Textarea
            readOnly
            rows={4}
            value={draft.smsBody}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={isCopyingEmail}
            onClick={() => void copyEmail()}
          >
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
