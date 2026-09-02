import { useId, useState } from 'react';

import { Badge, Button, Card, ClockIcon, EmptyState, MailIcon } from '@/components/ui';
import { useRenewal } from '@/hooks/useRenewal';
import type { RenewalCycleRecord, RenewalSentEmailRecord } from '@/types';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function EmailRow({ email }: { email: RenewalSentEmailRecord }) {
  const { followUp, followUpTarget, researchPhase } = useRenewal();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const subject = email.subject || '(no subject)';
  const isTarget = followUpTarget?.id === email.id;
  const researching = researchPhase === 'researching';
  return (
    <li
      className={`rounded-lg border bg-surface-2/40 ${isTarget ? 'border-accent' : 'border-edge'}`}
    >
      <div className="flex items-start gap-2 pr-2">
        <button
          type="button"
          className="min-w-0 flex-1 px-3 py-2 text-left"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="block truncate text-xs font-medium text-content-primary">{subject}</span>
          <span className="text-[11px] text-content-muted">
            Copied {formatDate(email.copiedAt)}
            {isTarget ? ' · Following up' : ''}
          </span>
        </button>
        <Button
          size="sm"
          variant={isTarget ? 'primary' : 'secondary'}
          className="mt-1.5 shrink-0"
          aria-label={`Follow up on ${subject}`}
          disabled={researching}
          loading={researching && isTarget}
          onClick={() => void followUp(email.id)}
        >
          Follow up
        </Button>
      </div>
      {open && (
        <pre
          id={bodyId}
          className="border-t border-edge px-3 py-2 whitespace-pre-wrap break-words font-sans text-[11px] text-content-secondary"
        >
          {email.body}
        </pre>
      )}
    </li>
  );
}

function Cycle({ cycle, active }: { cycle: RenewalCycleRecord; active: boolean }) {
  return (
    <section
      aria-label={`${active ? 'Current' : 'Archived'} ${cycle.outreachType === 'add_on' ? 'Add-on' : 'Renewal'} cycle`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-content-secondary">
          {active ? 'Current cycle' : `Archived ${formatDate(cycle.archivedAt ?? cycle.updatedAt)}`}
        </h3>
        <Badge tone="neutral">{cycle.outreachType === 'add_on' ? 'Add-on' : 'Renewal'}</Badge>
      </div>
      <ul className="space-y-1.5">
        {[...cycle.sentEmails]
          .sort((left, right) => Date.parse(left.copiedAt) - Date.parse(right.copiedAt))
          .map((email) => (
            <EmailRow key={email.id} email={email} />
          ))}
      </ul>
    </section>
  );
}

export function RenewalCycleHistory() {
  const { selectedAccount, currentCycle } = useRenewal();
  if (!selectedAccount) return null;
  const archived = selectedAccount.cycles
    .filter((cycle) => !!cycle.archivedAt)
    .sort((left, right) => Date.parse(right.archivedAt!) - Date.parse(left.archivedAt!));

  return (
    <Card title="Renewal cycle history" icon={<ClockIcon className="size-3.5" />}>
      {!currentCycle && archived.length === 0 ? (
        <EmptyState
          icon={<MailIcon className="size-5" />}
          title="No copied emails"
          description="A cycle begins only after Copy Email succeeds and the email is saved locally."
        />
      ) : (
        <div className="space-y-4">
          {currentCycle && <Cycle cycle={currentCycle} active />}
          {archived.map((cycle) => (
            <Cycle key={cycle.id} cycle={cycle} active={false} />
          ))}
        </div>
      )}
    </Card>
  );
}
