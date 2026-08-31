import { useEffect, useState } from 'react';

import { BulkOutputPanel } from '@/components/bulk/BulkOutputPanel';
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
import { MAX_MANUAL_RECIPIENT_INPUT_LENGTH } from '@/services';
import type { EmailDeliveryMode } from '@/types';

const MODE_LABEL: Record<EmailDeliveryMode, string> = {
  gmail_api: 'Gmail API',
  gmail_compose_url: 'Gmail compose',
  manual_composer: 'Manual',
};

/**
 * Bulk workspace. Extension users extract a report and send through Gmail API;
 * web users paste recipients and prepare copyable output. Recipient data stays
 * in memory and only aggregate run metadata is persisted.
 */
export function BulkComposer() {
  const bulk = useBulkReport();
  const { phase } = bulk;

  const [criteria, setCriteria] = useState('active performing accounts');
  const [emailType, setEmailType] = useState('a friendly quarterly check-in');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [manualRecipients, setManualRecipients] = useState('');

  useEffect(() => {
    if (bulk.draft) {
      setSubject(bulk.draft.subject);
      setBody(bulk.draft.body);
    }
  }, [bulk.draft]);

  const isBusy =
    phase.kind === 'extracting' || phase.kind === 'generating' || phase.kind === 'sending';
  const hasReport = bulk.report !== null;
  const isPrepared = phase.kind === 'prepared';

  return (
    <Card
      title={bulk.extensionContext ? 'Bulk from report' : 'Prepare bulk email'}
      icon={<SparklesIcon className="size-3.5" />}
      action={<Badge tone="neutral">{MODE_LABEL[bulk.deliveryMode]}</Badge>}
    >
      <div className="space-y-3">
        {!hasReport && phase.kind !== 'sent' && (
          <>
            {bulk.extensionContext ? (
              <>
                <p className="text-[11px] text-content-muted">
                  Open a Salesforce report in run mode, then extract it here. Rows stay in memory
                  only — nothing about the accounts is stored.
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
            ) : (
              <>
                <Field
                  label="Paste recipients"
                  hint="One per line: email, Name <email>, CSV, or tab-separated. Up to 200 unique recipients. Values stay in memory only."
                >
                  <Textarea
                    aria-label="Paste recipients"
                    maxLength={MAX_MANUAL_RECIPIENT_INPUT_LENGTH}
                    rows={7}
                    value={manualRecipients}
                    onChange={(event) => setManualRecipients(event.target.value)}
                    placeholder={'Name,Email,Status\nAcme,owner@example.com,Active'}
                  />
                </Field>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!manualRecipients.trim()}
                  onClick={() => bulk.loadManualRecipients(manualRecipients)}
                >
                  Load recipients
                </Button>
              </>
            )}
          </>
        )}

        {hasReport && phase.kind !== 'sent' && (
          <>
            <Field
              label={
                bulk.extensionContext ? 'Skip accounts with status' : 'Skip recipients with status'
              }
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
                  label={
                    bulk.extensionContext
                      ? 'Body (sent to every selected recipient)'
                      : 'Body (prepared for every selected recipient)'
                  }
                  hint={
                    bulk.extensionContext
                      ? 'Review and edit before sending — nothing sends automatically.'
                      : 'Review and edit before preparing copyable output or Gmail compose links.'
                  }
                >
                  <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>

                {phase.kind === 'sending' && (
                  <p className="text-[11px] text-content-muted">
                    Sending {phase.progress.completed} of {phase.progress.total}…
                  </p>
                )}

                {!isPrepared && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={bulk.extensionContext ? <SendIcon className="size-3.5" /> : undefined}
                    loading={phase.kind === 'sending'}
                    disabled={!body.trim() || bulk.selectedCount === 0 || isBusy}
                    onClick={() => void bulk.approveAndSend({ to: [], subject, body })}
                  >
                    {bulk.extensionContext
                      ? `Send to ${bulk.selectedCount} approved`
                      : `Prepare output for ${bulk.selectedCount}`}
                  </Button>
                )}

                {!bulk.extensionContext && isPrepared && bulk.deliveryMode !== 'gmail_api' && (
                  <BulkOutputPanel
                    recipients={bulk.recipients}
                    subject={subject}
                    body={body}
                    deliveryMode={bulk.deliveryMode}
                  />
                )}
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
