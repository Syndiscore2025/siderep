import { useState } from 'react';

import { Badge, Button, Card, ClockIcon, EmptyState, MailIcon, TrashIcon } from '@/components/ui';
import { useClearSentHistory, useSentHistory } from '@/hooks/useSentHistory';
import type { EmailDeliveryMode, SentEmailRecord } from '@/types';
import { cn } from '@/utils';

const MODE_LABEL: Record<EmailDeliveryMode, string> = {
  gmail_api: 'Gmail API',
  gmail_compose_url: 'Gmail compose',
  manual_composer: 'Manual',
};

function formatSentAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function HistoryRow({ record }: { record: SentEmailRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-edge bg-surface-2/40">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2 text-left"
      >
        <span className="mt-0.5 text-content-muted">
          <MailIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-content-primary">
            {record.subject || '(no subject)'}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-content-muted">
            <ClockIcon className="size-3" />
            {formatSentAt(record.sentAt)}
            <span aria-hidden>·</span>
            <span className="truncate">{record.to.join(', ') || '—'}</span>
          </span>
        </span>
        <Badge tone="neutral">{MODE_LABEL[record.deliveryMode]}</Badge>
      </button>
      {open && (
        <div className="animate-fade-in border-t border-edge px-3 py-2">
          <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-content-secondary">
            {record.body}
          </pre>
        </div>
      )}
    </li>
  );
}

/**
 * Read-only log of emails sent through the Email tool. Rows expand to show the
 * sent body; this Email-tool log can be cleared independently of Renewal data.
 */
export function SentHistory() {
  const { records, isLoading } = useSentHistory();
  const clear = useClearSentHistory();

  return (
    <Card
      title="Sent history"
      icon={<ClockIcon className="size-3.5" />}
      action={
        records.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<TrashIcon className="size-3.5" />}
            loading={clear.isPending}
            onClick={() => clear.mutate()}
          >
            Clear
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <p className="px-1 py-2 text-xs text-content-muted">Loading…</p>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<MailIcon className="size-5" />}
          title="No emails sent yet"
          description="Emails sent through the Email tool appear here as a bounded local history that you can clear."
        />
      ) : (
        <ul className={cn('space-y-1.5')}>
          {records.map((record) => (
            <HistoryRow key={record.id} record={record} />
          ))}
        </ul>
      )}
    </Card>
  );
}
