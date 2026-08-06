import { Badge } from '@/components/ui';
import { describeSkip } from '@/services';
import type { BulkRecipient, SkippedRow } from '@/types';

/**
 * The review table: every matched recipient (checkbox-selectable) and a
 * collapsed summary of skipped rows. Recipient rows live in memory only.
 */
export function BulkRecipientTable({
  recipients,
  skipped,
  onToggle,
  onSelectAll,
  disabled,
}: {
  recipients: BulkRecipient[];
  skipped: SkippedRow[];
  onToggle: (rowIndex: number) => void;
  onSelectAll: (selected: boolean) => void;
  disabled?: boolean;
}) {
  const selectedCount = recipients.filter((r) => r.selected).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-content-muted">
          {selectedCount} of {recipients.length} selected · {skipped.length} skipped
        </span>
        {recipients.length > 0 && (
          <div className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelectAll(true)}
              className="text-accent hover:underline disabled:opacity-50"
            >
              All
            </button>
            <span aria-hidden className="text-content-muted">
              ·
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelectAll(false)}
              className="text-accent hover:underline disabled:opacity-50"
            >
              None
            </button>
          </div>
        )}
      </div>

      {recipients.length === 0 ? (
        <p className="rounded-lg border border-edge bg-surface-2/40 px-3 py-2 text-[11px] text-content-muted">
          No matching recipients. Adjust the excluded statuses or extract a different report.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {recipients.map((recipient) => (
            <li
              key={recipient.row.index}
              className="flex items-start gap-2 rounded-lg border border-edge bg-surface-2/40 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={recipient.selected}
                disabled={disabled}
                onChange={() => onToggle(recipient.row.index)}
                className="mt-0.5 size-3.5 accent-accent"
                aria-label={`Include ${recipient.email}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-content-primary">
                  {recipient.name || recipient.email}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-content-muted">
                  {recipient.email}
                </span>
              </span>
              {recipient.status && <Badge tone="neutral">{recipient.status}</Badge>}
            </li>
          ))}
        </ul>
      )}

      {skipped.length > 0 && (
        <details className="rounded-lg border border-edge bg-surface-2/40 px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-medium text-content-secondary">
            {skipped.length} skipped row{skipped.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {skipped.map((row) => (
              <li key={row.row.index} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-content-muted">
                  {row.row.name || row.row.email || `Row ${row.row.index + 1}`}
                </span>
                <span className="shrink-0 text-content-muted">{describeSkip(row)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
