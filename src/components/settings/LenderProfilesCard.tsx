import { useEffect, useState } from 'react';

import { Button, Card, Field, Input, Textarea, Toggle } from '@/components/ui';
import type { LenderProfile } from '@/types';

const emptyProfile = (): LenderProfile => ({
  name: '',
  productTypes: [],
  standardRenewalThreshold: null,
  earlyRenewalThreshold: null,
  minimumFundingAgeDays: null,
  renewalTimingRules: '',
  payoffBehavior: '',
  customerFacingRenewalBenefits: [],
  internalRules: '',
  lineOfCreditAvailable: false,
  termLoanAvailable: false,
  specialNotes: '',
});

function list(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function LenderProfilesCard({
  profiles,
  onChange,
  resetToken,
}: {
  profiles: LenderProfile[];
  onChange: (profiles: LenderProfile[]) => void;
  resetToken: number;
}) {
  const [openProfile, setOpenProfile] = useState<number | null>(null);
  useEffect(() => setOpenProfile(null), [resetToken]);
  const update = (index: number, patch: Partial<LenderProfile>) =>
    onChange(
      profiles.map((profile, current) => (current === index ? { ...profile, ...patch } : profile)),
    );

  return (
    <Card
      title="Lender Intelligence"
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onChange([...profiles, emptyProfile()]);
            setOpenProfile(profiles.length);
          }}
        >
          Add lender
        </Button>
      }
    >
      <p className="mb-3 text-xs text-content-muted">
        Customer-facing benefits inform outreach. Internal rules and special notes guide scenario
        logic only and are never passed to merchant drafting.
      </p>
      <div className="space-y-3">
        {profiles.map((profile, index) => (
          <details
            key={index}
            open={openProfile === index}
            onToggle={(event) => setOpenProfile(event.currentTarget.open ? index : null)}
            className="rounded-lg border border-edge bg-surface-2/40 p-3"
          >
            <summary className="cursor-pointer text-xs font-medium text-content-primary">
              {profile.name || 'New lender profile'}
            </summary>
            <div className="mt-3 max-h-[34rem] overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lender name">
                  <Input
                    value={profile.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </Field>
                <Field label="Product types" hint="One per line.">
                  <Textarea
                    rows={2}
                    value={profile.productTypes.join('\n')}
                    onChange={(event) => update(index, { productTypes: list(event.target.value) })}
                  />
                </Field>
                <Field
                  label="Standard renewal threshold"
                  hint="Paid-in percentage; leave blank if unknown."
                >
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={profile.standardRenewalThreshold ?? ''}
                    onChange={(event) =>
                      update(index, { standardRenewalThreshold: numberOrNull(event.target.value) })
                    }
                  />
                </Field>
                <Field
                  label="Early renewal threshold"
                  hint="Paid-in percentage; leave blank if none."
                >
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={profile.earlyRenewalThreshold ?? ''}
                    onChange={(event) =>
                      update(index, { earlyRenewalThreshold: numberOrNull(event.target.value) })
                    }
                  />
                </Field>
                <Field
                  label="Minimum funding age"
                  hint="Days; used only when a funding date is supplied."
                >
                  <Input
                    type="number"
                    min="0"
                    value={profile.minimumFundingAgeDays ?? ''}
                    onChange={(event) =>
                      update(index, { minimumFundingAgeDays: numberOrNull(event.target.value) })
                    }
                  />
                </Field>
                <div className="flex items-center justify-around gap-3 rounded-lg border border-edge px-3 py-2">
                  <Toggle
                    checked={profile.lineOfCreditAvailable}
                    onChange={(value) => update(index, { lineOfCreditAvailable: value })}
                    aria-label="Line of credit available"
                  />
                  <span className="text-xs text-content-secondary">LOC available</span>
                  <Toggle
                    checked={profile.termLoanAvailable}
                    onChange={(value) => update(index, { termLoanAvailable: value })}
                    aria-label="Term loan available"
                  />
                  <span className="text-xs text-content-secondary">Term loan available</span>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Renewal timing rules">
                    <Textarea
                      rows={2}
                      value={profile.renewalTimingRules}
                      onChange={(event) =>
                        update(index, { renewalTimingRules: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Payoff behavior">
                    <Textarea
                      rows={2}
                      value={profile.payoffBehavior}
                      onChange={(event) => update(index, { payoffBehavior: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Customer-facing renewal benefits" hint="One per line.">
                    <Textarea
                      rows={3}
                      value={profile.customerFacingRenewalBenefits.join('\n')}
                      onChange={(event) =>
                        update(index, { customerFacingRenewalBenefits: list(event.target.value) })
                      }
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Internal rules">
                    <Textarea
                      rows={2}
                      value={profile.internalRules}
                      onChange={(event) => update(index, { internalRules: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Special notes">
                    <Textarea
                      rows={2}
                      value={profile.specialNotes}
                      onChange={(event) => update(index, { specialNotes: event.target.value })}
                    />
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onChange(profiles.filter((_, current) => current !== index));
                    setOpenProfile(null);
                  }}
                >
                  Remove lender
                </Button>
              </div>
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}
