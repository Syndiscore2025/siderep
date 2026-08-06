import { useCallback, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_EXCLUDED_STATUSES,
  createAIService,
  createEmailService,
  createReportExtractionService,
  filterReport,
  generateBulkEmail,
  parseExcludedStatusesInput,
  recordBulkRun,
  sendBulkEmail,
  setAllSelected,
  toggleRecipient,
} from '@/services';
import type { BulkSendProgress } from '@/services';
import type { BulkRecipient, ExtractedReport, GeneratedEmail, SkippedRow } from '@/types';
import { toError } from '@/utils';

import { useRefreshBulkRuns } from './useBulkRuns';
import { useSettings } from './useSettings';

/**
 * Bulk report → email workflow. Everything about the report lives in memory
 * only; nothing customer-related is persisted. Sending goes through the
 * mandatory review + approval gate, and only a metadata-only run record is
 * stored afterwards.
 */
export type BulkPhase =
  | { kind: 'idle' }
  | { kind: 'extracting' }
  | { kind: 'review' }
  | { kind: 'generating' }
  | { kind: 'sending'; progress: BulkSendProgress }
  | { kind: 'sent'; succeeded: number; failed: number }
  | { kind: 'error'; message: string };

export function useBulkReport() {
  const { settings } = useSettings();
  const refreshRuns = useRefreshBulkRuns();
  const [phase, setPhase] = useState<BulkPhase>({ kind: 'idle' });
  const [report, setReport] = useState<ExtractedReport | null>(null);
  const [recipients, setRecipients] = useState<BulkRecipient[]>([]);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [excludedInput, setExcludedInput] = useState(DEFAULT_EXCLUDED_STATUSES.join(', '));
  const [draft, setDraft] = useState<GeneratedEmail | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const excludedStatuses = useMemo(
    () => parseExcludedStatusesInput(excludedInput),
    [excludedInput],
  );

  const applyFilter = useCallback(
    (source: ExtractedReport) => {
      const result = filterReport(source, excludedStatuses);
      setRecipients(result.recipients);
      setSkipped(result.skipped);
    },
    [excludedStatuses],
  );

  const extract = useCallback(async () => {
    setPhase({ kind: 'extracting' });
    try {
      const result = await createReportExtractionService().extractActiveReport();
      if (!result.ok) {
        setPhase({ kind: 'error', message: result.error.message });
        return;
      }
      setReport(result.value);
      applyFilter(result.value);
      setPhase({ kind: 'review' });
    } catch (error) {
      setPhase({ kind: 'error', message: toError(error).message });
    }
  }, [applyFilter]);

  /** Re-run the status filter after the user edits the excluded list. */
  const refilter = useCallback(() => {
    if (report) applyFilter(report);
  }, [applyFilter, report]);

  const toggle = useCallback((rowIndex: number) => {
    setRecipients((prev) => toggleRecipient(prev, rowIndex));
  }, []);

  const selectAll = useCallback((selected: boolean) => {
    setRecipients((prev) => setAllSelected(prev, selected));
  }, []);

  const generate = useCallback(
    async (criteria: string, emailType: string) => {
      setPhase({ kind: 'generating' });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const ai = createAIService(settings);
        if (!ai.isConfigured()) {
          setPhase({ kind: 'error', message: 'Configure Azure OpenAI in Settings first.' });
          return;
        }
        const count = recipients.filter((r) => r.selected).length;
        const result = await generateBulkEmail(
          ai,
          settings,
          { criteria, emailType, recipientCount: count },
          controller.signal,
        );
        if (!result.ok) {
          setPhase({ kind: 'error', message: result.error.message });
          return;
        }
        setDraft(result.value);
        setPhase({ kind: 'review' });
      } catch (error) {
        setPhase({ kind: 'error', message: toError(error).message });
      } finally {
        abortRef.current = null;
      }
    },
    [recipients, settings],
  );

  /** The mandatory approval gate — a bulk send only ever happens from here. */
  const approveAndSend = useCallback(
    async (email: GeneratedEmail) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase({ kind: 'sending', progress: { completed: 0, total: 0, lastOk: true } });
      try {
        const service = createEmailService(settings);
        const result = await sendBulkEmail(
          service,
          email,
          recipients,
          { matched: recipients.length, skipped: skipped.length },
          {
            signal: controller.signal,
            onProgress: (progress) => setPhase({ kind: 'sending', progress }),
          },
        );
        if (!result.ok) {
          setPhase({ kind: 'error', message: result.error.message });
          return;
        }
        await recordBulkRun(result.value);
        void refreshRuns();
        setPhase({
          kind: 'sent',
          succeeded: result.value.succeeded,
          failed: result.value.failed,
        });
      } catch (error) {
        setPhase({ kind: 'error', message: toError(error).message });
      } finally {
        abortRef.current = null;
      }
    },
    [recipients, refreshRuns, settings, skipped.length],
  );

  const reset = useCallback(() => {
    setReport(null);
    setRecipients([]);
    setSkipped([]);
    setDraft(null);
    setPhase({ kind: 'idle' });
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const selectedCount = recipients.filter((r) => r.selected).length;

  return {
    phase,
    report,
    recipients,
    skipped,
    draft,
    setDraft,
    excludedInput,
    setExcludedInput,
    selectedCount,
    deliveryMode: settings.email.deliveryMode,
    extract,
    refilter,
    toggle,
    selectAll,
    generate,
    approveAndSend,
    reset,
    cancel,
  };
}
