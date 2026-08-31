import { useState } from 'react';

import { Badge, Button, Card, RefreshIcon, ShieldIcon } from '@/components/ui';
import { useSettings } from '@/hooks/useSettings';
import { runDiagnostics } from '@/services';
import type { CheckResult, CheckStatus } from '@/services';
import { isExtensionContext } from '@/utils/platform';

const STATUS_TONE: Record<CheckStatus, 'success' | 'danger' | 'neutral'> = {
  pass: 'success',
  fail: 'danger',
  skip: 'neutral',
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  skip: 'Skipped',
};

/**
 * Live connectivity checks for platform-supported integrations. Extension-only
 * checks are explained and skipped on web without requesting Google access.
 */
export function Diagnostics() {
  const { settings } = useSettings();
  const extension = isExtensionContext();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setResults(await runDiagnostics(settings));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      title="Diagnostics"
      icon={<ShieldIcon className="size-3.5" />}
      action={
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshIcon className="size-3.5" />}
          loading={running}
          onClick={() => void run()}
        >
          Run checks
        </Button>
      }
    >
      {results === null ? (
        <p className="px-1 py-1 text-xs text-content-muted">
          {extension
            ? 'Verify that every endpoint connects with your current settings. The Gmail check may prompt for Google sign-in.'
            : 'Storage and OpenAI checks run on web. Gmail API and Salesforce checks are extension-only and are skipped without a Google sign-in prompt.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {results.map((result) => (
            <li
              key={result.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-edge bg-surface-2/40 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium text-content-primary">
                  {result.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-content-muted">{result.detail}</span>
              </span>
              <Badge tone={STATUS_TONE[result.status]}>{STATUS_LABEL[result.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
