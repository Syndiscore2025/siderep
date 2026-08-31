import { Badge, Button, Card, ClockIcon, EmptyState, TrashIcon } from '@/components/ui';
import { useBulkRuns, useClearBulkRuns } from '@/hooks/useBulkRuns';
import type { BulkRunRecord } from '@/types';

const STATUS_TONE: Record<BulkRunRecord['status'], 'success' | 'danger' | 'neutral'> = {
  complete: 'success',
  partial: 'neutral',
  failed: 'danger',
};

function formatRanAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Read-only log of bulk runs — METADATA ONLY. It shows counts, status, and
 * timing; never recipients, subjects, or bodies (no customer data is stored).
 */
export function BulkRunHistory() {
  const { records, isLoading } = useBulkRuns();
  const clear = useClearBulkRuns();

  return (
    <Card
      title="Bulk run history"
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
          icon={<ClockIcon className="size-5" />}
          title="No bulk runs yet"
          description="Each run records only counts and status here — never recipients or email content."
        />
      ) : (
        <ul className="space-y-1.5">
          {records.map((record) => (
            <li
              key={record.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-edge bg-surface-2/40 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium text-content-primary">
                  {record.succeeded} {record.action === 'prepared' ? 'prepared' : 'sent'}
                  {record.failed > 0 ? ` · ${record.failed} failed` : ''}
                </span>
                <span className="mt-0.5 block text-[11px] text-content-muted">
                  {formatRanAt(record.ranAt)} · {record.matched} matched · {record.skipped} skipped
                </span>
              </span>
              <Badge tone={STATUS_TONE[record.status]}>{record.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
