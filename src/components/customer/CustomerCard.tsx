import { useMutation } from '@tanstack/react-query';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  RefreshIcon,
  ShieldIcon,
  Toggle,
  TrashIcon,
  UserIcon,
} from '@/components/ui';
import { useSession } from '@/hooks/useSession';
import { createExtractionService } from '@/services';
import { approvedFields } from '@/types';
import { cn } from '@/utils';
import { isExtensionContext } from '@/utils/platform';

import { ManualCustomerInput } from './ManualCustomerInput';

/**
 * Shows the active customer session and the per-field approval toggles.
 * Reading is always an explicit user action — nothing is extracted
 * automatically.
 */
export function CustomerCard() {
  const { customer, setCustomer, toggleFieldApproval, clearSession } = useSession();
  const extension = isExtensionContext();

  const readCustomer = useMutation({
    mutationFn: async () => {
      const result = await createExtractionService().extractActiveCustomer();
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: setCustomer,
  });

  if (!customer) {
    if (!extension) {
      return (
        <Card title="Customer" icon={<UserIcon className="size-3.5" />}>
          <ManualCustomerInput onLoad={setCustomer} />
        </Card>
      );
    }
    return (
      <Card title="Customer" icon={<UserIcon className="size-3.5" />}>
        <EmptyState
          icon={
            <div className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-hover">
              <UserIcon className="size-5" />
            </div>
          }
          title="No customer loaded"
          description="Open a Salesforce record, then read the visible fields into this private session."
        >
          <Button
            variant="primary"
            loading={readCustomer.isPending}
            onClick={() => readCustomer.mutate()}
          >
            Read Customer Info
          </Button>
          {readCustomer.isError && (
            <p className="mt-2 text-xs text-danger">{(readCustomer.error as Error).message}</p>
          )}
        </EmptyState>
      </Card>
    );
  }

  const approvedCount = approvedFields(customer).length;
  const isSample =
    customer.source === 'sample' || customer.fields.some((field) => field.source === 'sample');

  return (
    <Card
      title="Customer"
      icon={<UserIcon className="size-3.5" />}
      action={
        <div className="flex items-center gap-1.5">
          {isSample && <Badge tone="warning">Sample data</Badge>}
          {customer.recordType && <Badge tone="accent">{customer.recordType}</Badge>}
        </div>
      }
    >
      <p className="mb-2.5 truncate text-sm font-semibold text-content-primary">
        {customer.displayName}
      </p>

      <ul className="animate-fade-in divide-y divide-edge/50 overflow-hidden rounded-lg border border-edge bg-surface-2/40">
        {customer.fields.map((field) => (
          <li
            key={field.key}
            className="flex items-center gap-3 px-2.5 py-1.5 transition-colors hover:bg-surface-2/80"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-content-muted">
                {field.label}
              </p>
              <p
                className={cn(
                  'truncate text-xs transition-colors',
                  field.approved ? 'text-content-primary' : 'text-content-muted line-through',
                )}
              >
                {field.value}
              </p>
            </div>
            <Toggle
              checked={field.approved}
              onChange={() => toggleFieldApproval(field.key)}
              aria-label={`Share ${field.label} with the AI`}
            />
          </li>
        ))}
      </ul>

      <div className="mt-2.5 flex items-center gap-1.5 rounded-md bg-surface-2/50 px-2 py-1.5">
        <ShieldIcon className="size-3.5 shrink-0 text-success" />
        <p className="text-[11px] text-content-secondary">
          <span className="font-semibold text-content-primary">{approvedCount}</span> of{' '}
          {customer.fields.length} fields shared · in-memory only
        </p>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1">
        {extension && customer.source !== 'manual' && (
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshIcon className="size-3.5" />}
            loading={readCustomer.isPending}
            onClick={() => readCustomer.mutate()}
          >
            Re-read
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          icon={<TrashIcon className="size-3.5" />}
          onClick={clearSession}
        >
          Clear
        </Button>
      </div>
    </Card>
  );
}
