import { RenewalAccountPicker } from '@/components/renewal/RenewalAccountPicker';
import { RenewalCycleHistory } from '@/components/renewal/RenewalCycleHistory';
import { RenewalInputCard } from '@/components/renewal/RenewalInputCard';
import { RenewalResults } from '@/components/renewal/RenewalResults';
import { Button } from '@/components/ui';
import { useRenewal } from '@/hooks/useRenewal';

export function RenewalPage() {
  const renewal = useRenewal();
  return (
    <main className="flex min-h-0 flex-1 flex-col" aria-labelledby="renewal-page-heading">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <h1 id="renewal-page-heading" className="text-base font-semibold text-content-primary">
            Renewal outreach
          </h1>
          <p className="text-xs text-content-muted">
            Research a business and create copy-ready renewal outreach.
          </p>
        </div>
        <RenewalAccountPicker />
        <RenewalInputCard />
        <RenewalResults />
        <RenewalCycleHistory />
        <section aria-label="Renewal data controls" className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!renewal.currentCycle}
            loading={renewal.isRenewing}
            onClick={() => {
              if (window.confirm('Archive this active Renewal cycle as renewed?'))
                void renewal.renewed();
            }}
          >
            Renewed
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!renewal.selectedAccount}
            loading={renewal.isDeletingAccount}
            onClick={() => {
              if (
                window.confirm('Delete this saved Renewal account and all of its cycle history?')
              ) {
                void renewal.deleteSelectedAccount();
              }
            }}
          >
            Delete saved account
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={renewal.savedAccountCount === 0}
            loading={renewal.isClearingHistory}
            onClick={() => {
              if (window.confirm('Clear all locally saved Renewal accounts and cycle history?')) {
                void renewal.clearSavedAccounts();
              }
            }}
          >
            Clear all Renewal data
          </Button>
        </section>
        {renewal.historyStatus.message && (
          <p
            role="status"
            aria-live="polite"
            className={
              renewal.historyStatus.kind === 'error'
                ? 'text-[11px] text-danger'
                : 'text-[11px] text-success'
            }
          >
            {renewal.historyStatus.message}
          </p>
        )}
      </div>
    </main>
  );
}
