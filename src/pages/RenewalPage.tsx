import { RenewalAccountPicker } from '@/components/renewal/RenewalAccountPicker';
import { RenewalCycleHistory } from '@/components/renewal/RenewalCycleHistory';
import { RenewalInputCard } from '@/components/renewal/RenewalInputCard';
import { RenewalResults } from '@/components/renewal/RenewalResults';
import { Button, EmptyState, MailIcon } from '@/components/ui';
import { useRenewal } from '@/hooks/useRenewal';

export function RenewalPage() {
  const renewal = useRenewal();
  return (
    <main className="flex min-h-0 flex-1 flex-col" aria-labelledby="renewal-page-heading">
      <div className="flex-1 overflow-y-auto p-3 md:overflow-hidden md:p-5 lg:p-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 md:h-full md:min-h-0">
          <div className="shrink-0">
            <h1
              id="renewal-page-heading"
              className="text-lg font-semibold tracking-tight text-content-primary"
            >
              Renewal outreach
            </h1>
            <p className="mt-0.5 text-xs text-content-muted">
              Research a business and create copy-ready renewal outreach.
            </p>
          </div>
          <div className="flex flex-col gap-4 md:min-h-0 md:flex-1 md:flex-row">
            <section
              aria-label="Business details"
              className="space-y-4 md:w-[22rem] md:shrink-0 md:overflow-y-auto md:pr-1 lg:w-[29rem] xl:w-[31rem]"
            >
              <RenewalAccountPicker />
              <RenewalInputCard />
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
                      window.confirm(
                        'Delete this saved Renewal account and all of its cycle history?',
                      )
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
                    if (
                      window.confirm('Clear all locally saved Renewal accounts and cycle history?')
                    ) {
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
            </section>

            <section
              aria-label="Generated outreach"
              className="space-y-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:rounded-2xl md:border md:border-edge md:bg-surface-1/40 md:p-3 md:shadow-lg"
            >
              {renewal.draft ? (
                <RenewalResults />
              ) : (
                <div className="flex min-h-72 items-center justify-center rounded-xl border border-edge bg-surface-1/40 p-6 md:min-h-full">
                  <EmptyState
                    icon={<MailIcon className="size-5" />}
                    title="Drafts will appear here"
                    description="Enter the merchant details, then research the business to generate a tailored email and text."
                  />
                </div>
              )}
              <RenewalCycleHistory />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
