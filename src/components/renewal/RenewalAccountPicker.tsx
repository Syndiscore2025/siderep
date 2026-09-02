import { useId, useState } from 'react';

import { Card, Input, UserIcon } from '@/components/ui';
import { useRenewal } from '@/hooks/useRenewal';
import type { RenewalAccountIdentity } from '@/types';

const IDENTITY_LABELS: Array<[keyof RenewalAccountIdentity, string]> = [
  ['merchantName', 'Merchant'],
  ['businessName', 'Business'],
  ['accountName', 'Account'],
  ['dba', 'DBA'],
  ['website', 'Website'],
];

export function RenewalAccountPicker() {
  const renewal = useRenewal();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = renewal.accountSearchResults;
  const activeId = open && results[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined;

  const select = (index: number) => {
    const account = results[index];
    if (!account) return;
    renewal.selectAccount(account.id);
    setOpen(false);
    setActiveIndex(0);
  };

  return (
    <Card title="Saved Renewal accounts" icon={<UserIcon className="size-3.5" />}>
      <div className="relative">
        <label
          htmlFor={`${listboxId}-input`}
          className="mb-1.5 block text-xs font-medium text-content-secondary"
        >
          Find an account
        </label>
        <Input
          id={`${listboxId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeId}
          value={renewal.accountSearchQuery}
          placeholder="Search merchant, business, account, or DBA"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            renewal.setAccountSearchQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              const delta = event.key === 'ArrowDown' ? 1 : -1;
              setActiveIndex((index) => Math.max(0, Math.min(results.length - 1, index + delta)));
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              select(activeIndex);
            }
          }}
        />
        {open && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Saved Renewal accounts"
            className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-edge bg-surface-1 p-1 shadow-md"
          >
            {renewal.historyLoading ? (
              <p className="px-2 py-2 text-xs text-content-muted">Loading saved accounts…</p>
            ) : results.length === 0 ? (
              <p className="px-2 py-2 text-xs text-content-muted">No matching saved accounts.</p>
            ) : (
              results.map((account, index) => (
                <button
                  id={`${listboxId}-option-${index}`}
                  key={account.id}
                  type="button"
                  role="option"
                  aria-selected={renewal.selectedAccount?.id === account.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(index)}
                  className={`block w-full rounded-md px-2 py-2 text-left text-xs ${
                    index === activeIndex
                      ? 'bg-surface-3 text-content-primary'
                      : 'text-content-secondary'
                  }`}
                >
                  <span className="block font-medium text-content-primary">
                    {account.identity.merchantName ||
                      account.identity.businessName ||
                      account.identity.accountName ||
                      account.identity.dba ||
                      'Unnamed account'}
                  </span>
                  <span className="block truncate text-[11px] text-content-muted">
                    {[
                      account.identity.businessName,
                      account.identity.accountName,
                      account.identity.dba,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No additional aliases'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {renewal.selectedAccount && (
        <dl className="mt-3 grid gap-1 rounded-lg bg-surface-2/60 p-2.5 text-[11px]">
          {IDENTITY_LABELS.flatMap(([key, label]) => {
            const value = renewal.selectedAccount?.identity[key];
            return value ? (
              <div key={key} className="grid grid-cols-[4.5rem_1fr] gap-2">
                <dt className="text-content-muted">{label}</dt>
                <dd className="break-all text-content-secondary">{value}</dd>
              </div>
            ) : (
              []
            );
          })}
        </dl>
      )}
    </Card>
  );
}
