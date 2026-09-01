import {
  Button,
  Card,
  Field,
  Input,
  Select,
  ShieldIcon,
  SparklesIcon,
  StopIcon,
} from '@/components/ui';
import { useRenewal } from '@/hooks/useRenewal';
import type { RenewalEligibility, RenewalInput, RenewalOutreachType } from '@/types';
import { cn } from '@/utils';

const FIELDS: Array<{
  key: keyof RenewalInput;
  label: string;
  placeholder?: string;
  type?: 'text' | 'url';
  manual?: boolean;
  wide?: boolean;
}> = [
  { key: 'merchantName', label: 'Merchant name' },
  { key: 'businessName', label: 'Business name' },
  { key: 'accountName', label: 'Account name' },
  { key: 'dba', label: 'DBA' },
  {
    key: 'businessAddress',
    label: 'Business address',
    placeholder: 'Street, city, state, ZIP',
    manual: true,
  },
  { key: 'city', label: 'City', manual: true },
  { key: 'state', label: 'State', manual: true },
  {
    key: 'businessAddressGoogleUrl',
    label: 'Google business address link',
    placeholder: 'https://www.google.com/maps/…',
    type: 'url',
    manual: true,
    wide: true,
  },
  { key: 'website', label: 'Website', placeholder: 'https://…', type: 'url' },
  { key: 'industry', label: 'Industry', manual: true },
  { key: 'currentBalance', label: 'Current balance', manual: true },
  { key: 'percentagePaid', label: 'Percentage paid', manual: true },
  { key: 'latestLender', label: 'Current lender', manual: true },
  { key: 'originalFundingAmount', label: 'Original funding amount', manual: true },
  { key: 'originalFundingDate', label: 'Original funding date', manual: true },
  { key: 'productType', label: 'Product type', manual: true },
  { key: 'renewalEligibilityDate', label: 'Renewal eligibility date', manual: true },
  { key: 'existingPositions', label: 'Existing positions', manual: true },
  { key: 'possibleLineOfCredit', label: 'Possible LOC', manual: true },
  { key: 'possibleTermLoan', label: 'Possible term loan', manual: true },
  { key: 'specialLenderIncentives', label: 'Special lender incentives', manual: true },
  { key: 'existingOutstandingOffer', label: 'Existing outstanding offer', manual: true },
];

const ELIGIBILITY: Array<{ value: RenewalEligibility; label: string }> = [
  { value: 'eligible', label: 'Eligible' },
  { value: 'not_eligible', label: 'Not eligible' },
];

export function RenewalInputCard() {
  const renewal = useRenewal();
  const isResearching = renewal.researchPhase === 'researching';
  const canRetry = renewal.researchPhase === 'error' || renewal.researchPhase === 'cancelled';

  return (
    <Card title="Renewal details" icon={<SparklesIcon className="size-3.5" />}>
      <div className="space-y-3">
        <p className="text-xs text-content-secondary">
          Enter a business name and address or website for the most accurate web research.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.key} className={field.wide ? 'sm:col-span-2' : undefined}>
              <Field
                label={field.label}
                hint={field.manual ? 'Not saved between sessions.' : undefined}
              >
                <Input
                  aria-label={field.label}
                  type={field.type}
                  value={renewal.input[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) => renewal.edit(field.key, event.target.value)}
                />
              </Field>
            </div>
          ))}
        </div>

        <Field
          label="Outreach type"
          hint={
            renewal.outreachTypeLocked
              ? 'Locked after the first copied email in this cycle.'
              : undefined
          }
        >
          <Select
            aria-label="Outreach type"
            value={renewal.outreachType}
            disabled={renewal.outreachTypeLocked}
            onChange={(event) => renewal.setOutreachType(event.target.value as RenewalOutreachType)}
          >
            <option value="renewal">Renewal</option>
            <option value="add_on">Add-on</option>
          </Select>
        </Field>

        {renewal.showAdditionalLender ? (
          <Field label="Additional same-day lender">
            <Input
              value={renewal.input.additionalSameDayLender}
              onChange={(event) => renewal.edit('additionalSameDayLender', event.target.value)}
            />
          </Field>
        ) : (
          <Button size="sm" variant="ghost" onClick={renewal.showAdditionalLenderField}>
            Add same-day lender
          </Button>
        )}

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-content-secondary">Eligibility</legend>
          <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-0.5">
            {ELIGIBILITY.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={renewal.eligibility === option.value}
                onClick={() => renewal.setEligibility(option.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  renewal.eligibility === option.value
                    ? 'bg-surface-3 text-content-primary shadow-sm'
                    : 'text-content-secondary hover:text-content-primary',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={renewal.extractionStatus === 'reading'}
            onClick={() => void renewal.readSalesforce()}
          >
            {renewal.extractionStatus === 'success' ? 'Re-read Salesforce' : 'Read Salesforce'}
          </Button>
          {!isResearching && !canRetry && (
            <Button variant="primary" size="sm" onClick={() => void renewal.research()}>
              Go—Research &amp; Generate
            </Button>
          )}
          {isResearching && (
            <Button variant="danger" size="sm" icon={<StopIcon />} onClick={renewal.cancel}>
              Stop
            </Button>
          )}
          {canRetry && (
            <Button size="sm" onClick={() => void renewal.retry()}>
              Retry
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={renewal.clear}>
            Clear
          </Button>
        </div>

        {renewal.extractionStatus === 'success' && (
          <p className="text-[11px] text-success">
            Salesforce fields read. Review and edit them before research.
          </p>
        )}
        {renewal.extractionError && (
          <p className="text-[11px] text-warning" role="alert">
            Salesforce could not be read: {renewal.extractionError} You can still enter the details
            manually.
          </p>
        )}
        {renewal.extractionWarnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-warning">
            {renewal.extractionWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        {renewal.researchPhase === 'researching' && (
          <p className="text-[11px] text-content-secondary" role="status" aria-live="polite">
            Researching the business and generating drafts…
          </p>
        )}
        {renewal.researchPhase === 'cancelled' && (
          <p className="text-[11px] text-content-secondary" role="status">
            Research stopped.
          </p>
        )}
        {renewal.researchError && (
          <p className="text-[11px] text-danger" role="alert">
            {renewal.researchError}
          </p>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-surface-2/60 p-2.5">
          <ShieldIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
          <p className="text-[11px] text-content-muted">
            SideRep retains locally only saved account identity/aliases, website, and the complete
            subject/body of emails successfully copied with Copy Email. Balance, percentage,
            lenders, eligibility, research, sources, SMS, generated-only drafts, and raw Salesforce
            fields are not retained. On generation, current-cycle copied email history is sent to
            OpenAI as context. Bounded archives may be pruned; saved accounts can be deleted or
            cleared here.
          </p>
        </div>
      </div>
    </Card>
  );
}
