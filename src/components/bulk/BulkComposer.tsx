import { useEffect, useState } from 'react';

import { BulkRecipientTable } from '@/components/bulk/BulkRecipientTable';
import {
  Badge,
  Button,
  Card,
  CheckIcon,
  Field,
  Input,
  RefreshIcon,
  SendIcon,
  SparklesIcon,
  Textarea,
} from '@/components/ui';
import { useBulkReport } from '@/hooks/useBulkReport';

/**
 * Bulk report → email workspace. The rep extracts a Salesforce report, reviews
 * matched recipients, describes the campaign, drafts ONE shared email with the
 * AI, then explicitly approves the send. Nothing sends automatically and no
 * customer data is persisted.
 */
export function BulkComposer() {
  const bulk = useBulkReport();
  const { phase } = bulk;

  const [criteria, setCriteria] = useState('active performing accounts');
  const [emailType, setEmailType] = useState('a friendly quarterly check-in');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (bulk.draft) {
      setSubject(bulk.draft.subject);
      setBody(bulk.draft.body);
    }
  }, [bulk.draft]);

  const isBusy =
    phase.kind === 'extracting' || phase.kind === 'generating' || phase.kind === 'sending';
  const hasReport = bulk.report !== null;

  return (
    <Card
      title="Bulk from report"
      icon={<SparklesIcon className="size-3.5" />}
      action={<Badge tone="neutral">Gmail API</Badge>}
    >
      <div className="space-y-3">
        {!hasReport && phase.kind !== 'sent' && (
          <>
            <p className="text-[11px] text-content-muted">
              Open a Salesforce report in run mode, then extract it here. Rows stay in memory only —
              nothing about the accounts is stored.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshIcon className="size-3.5" />}
              loading={phase.kind === 'extracting'}
              onClick={() => void bulk.extract()}
            >
              Extract report from page
            </Button>
          </>
        )}

        {hasReport && phase.kind !== 'sent' && (
          <>
            <Field
              label="Skip accounts with status"
              hint="Comma-separated. Matched as substrings, case-insensitive."
            >
              <Input
                value={bulk.excludedInput}
                onChange={(e) => bulk.setExcludedInput(e.target.value)}
                onBlur={bulk.refilter}
                placeholder="charge off, default, modified payments, paid in full"
              />
            </Field>

            <BulkRecipientTable
              recipients={bulk.recipients}
              skipped={bulk.skipped}
              onToggle={bulk.toggle}
              onSelectAll={bulk.selectAll}
              disabled={isBusy}
            />

            <Field label="Who these accounts are">
              <Input value={criteria} onChange={(e) => setCriteria(e.target.value)} />
            </Field>
            <Field label="What kind of email to write">
              <Textarea rows={2} value={emailType} onChange={(e) => setEmailType(e.target.value)} />
            </Field>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<SparklesIcon className="size-3.5" />}
                loading={phase.kind === 'generating'}
                disabled={bulk.selectedCount === 0 || isBusy}
                onClick={() => void bulk.generate(criteria, emailType)}
              >
                {bulk.draft ? 'Regenerate draft' : 'Draft email with AI'}
              </Button>
              <Button variant="ghost" size="sm" disabled={isBusy} onClick={bulk.reset}>
                Start over
              </Button>
            </div>

            {bulk.draft && (
              <div className="space-y-3 border-t border-edge pt-3">
                <Field label="Subject">
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </Field>
                <Field
                  label="Body (sent to every selected recipient)"
                  hint="Review and edit before sending — nothing sends automatically."
                >
                  <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>

                {phase.kind === 'sending' && (
                  <p className="text-[11px] text-content-muted">
                    Sending {phase.progress.completed} of {phase.progress.total}…
                  </p>
                )}

                <Button
                  variant="primary"
                  size="sm"
                  icon={<SendIcon className="size-3.5" />}
                  loading={phase.kind === 'sending'}
                  disabled={!body.trim() || bulk.selectedCount === 0 || isBusy}
                  onClick={() =>
                    void bulk.approveAndSend({ to: [], subject, body })
                  }
                >
                  Send to {bulk.selectedCount} approved
                </Button>
              </div>
            )}
          </>
        )}

        {phase.kind === 'sent' && (
          <div className="space-y-2">
            <span className="flex animate-fade-in items-center gap-1 text-[11px] font-medium text-success">
              <CheckIcon className="size-3.5" />
              Sent {phase.succeeded} email{phase.succeeded === 1 ? '' : 's'}
              {phase.failed > 0 ? ` · ${phase.failed} failed` : ''}.
            </span>
            <Button variant="secondary" size="sm" onClick={bulk.reset}>
              Start another run
            </Button>
          </div>
        )}

        {phase.kind === 'error' && (
          <p className="animate-fade-in text-[11px] text-danger">{phase.message}</p>
        )}
      </div>
    </Card>
  );
}
