import { useMemo, useState } from 'react';

import { Button, Card, Field, Input, MailIcon, Textarea } from '@/components/ui';
import { useRenewal } from '@/hooks/useRenewal';
import { normalizeRenewalUrl } from '@/services';

type CopyState =
  { kind: 'idle' } | { kind: 'success'; message: string } | { kind: 'error'; message: string };

export function RenewalResults() {
  const { draft, copyEmail, isCopyingEmail } = useRenewal();
  const [copyState, setCopyState] = useState<CopyState>({ kind: 'idle' });
  const safeSources = useMemo(
    () =>
      draft?.sources.flatMap((source) => {
        const url = normalizeRenewalUrl(source.url);
        return url ? [{ ...source, url }] : [];
      }) ?? [],
    [draft],
  );

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
        <Field label="Email subject">
          <Input
            readOnly
            value={draft.emailSubject}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>
        <Field label="Email body">
          <Textarea
            readOnly
            rows={9}
            value={draft.emailBody}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>
        <Field label="SMS text">
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

        <section aria-labelledby="renewal-summary-heading" className="border-t border-edge pt-4">
          <h3
            id="renewal-summary-heading"
            className="mb-1 text-xs font-semibold text-content-primary"
          >
            Business summary
          </h3>
          {draft.businessSummary ? (
            <p className="whitespace-pre-wrap text-xs text-content-secondary">
              {draft.businessSummary}
            </p>
          ) : (
            <p className="text-xs text-warning">
              No verified web source was returned. The drafts above use only the details you
              supplied; review them before use.
            </p>
          )}
        </section>

        {safeSources.length > 0 && (
          <section aria-labelledby="renewal-sources-heading">
            <h3
              id="renewal-sources-heading"
              className="mb-1 text-xs font-semibold text-content-primary"
            >
              Sources
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-xs">
              {safeSources.map((source, index) => (
                <li key={`${source.url}-${index}`}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-accent-hover hover:underline"
                  >
                    {source.title || source.url}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Card>
  );
}
