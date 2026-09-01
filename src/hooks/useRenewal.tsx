import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import {
  useArchiveRenewalCycle,
  useClearRenewalHistory,
  useDeleteRenewalAccount,
  useRecordCopiedRenewalEmail,
  useRenewalHistory,
} from '@/hooks/useRenewalHistory';
import { useSettings } from '@/hooks/useSettings';
import {
  createExtractionService,
  createRenewalResearchService,
  mapRenewalFields,
  searchRenewalAccounts,
} from '@/services';
import type { ExtractionService, RenewalResearchService } from '@/services';
import { EMPTY_RENEWAL_INPUT } from '@/types';
import type {
  RenewalAccountRecord,
  RenewalCycleRecord,
  RenewalDraft,
  RenewalEligibility,
  RenewalInput,
  RenewalOutreachType,
} from '@/types';
import { createId, toError } from '@/utils';

export type RenewalExtractionStatus = 'idle' | 'reading' | 'success' | 'error';
export type RenewalResearchPhase = 'idle' | 'researching' | 'complete' | 'error' | 'cancelled';
export type RenewalHistoryStatus =
  { kind: 'idle'; message: '' } | { kind: 'success' | 'error'; message: string };

/** Optional signal support lets tests verify cancellation while remaining compatible with ExtractionService. */
export interface RenewalExtractionService {
  extractActiveCustomer(
    signal?: AbortSignal,
  ): ReturnType<ExtractionService['extractActiveCustomer']>;
}

export interface RenewalProviderProps {
  children: ReactNode;
  extractionService?: RenewalExtractionService;
  researchService?: RenewalResearchService;
}

export interface RenewalContextValue {
  input: RenewalInput;
  eligibility: RenewalEligibility;
  extractionStatus: RenewalExtractionStatus;
  extractionError: string | null;
  extractionWarnings: string[];
  researchPhase: RenewalResearchPhase;
  researchError: string | null;
  draft: RenewalDraft | null;
  draftId: string | null;
  showAdditionalLender: boolean;
  accountSearchQuery: string;
  accountSearchResults: RenewalAccountRecord[];
  savedAccountCount: number;
  selectedAccount: RenewalAccountRecord | null;
  currentCycle: RenewalCycleRecord | null;
  outreachType: RenewalOutreachType;
  outreachTypeLocked: boolean;
  historyStatus: RenewalHistoryStatus;
  historyLoading: boolean;
  isCopyingEmail: boolean;
  isRenewing: boolean;
  isDeletingAccount: boolean;
  isClearingHistory: boolean;
  edit: (field: keyof RenewalInput, value: string) => void;
  setEligibility: (value: RenewalEligibility) => void;
  setAccountSearchQuery: (value: string) => void;
  selectAccount: (accountId: string | null) => void;
  setOutreachType: (value: RenewalOutreachType) => void;
  showAdditionalLenderField: () => void;
  readSalesforce: () => Promise<void>;
  research: () => Promise<void>;
  retry: () => Promise<void>;
  copyEmail: () => Promise<void>;
  renewed: () => Promise<void>;
  deleteSelectedAccount: () => Promise<void>;
  clearSavedAccounts: () => Promise<void>;
  cancel: () => void;
  clear: () => void;
}

const RenewalContext = createContext<RenewalContextValue | null>(null);

const freshInput = (): RenewalInput => ({ ...EMPTY_RENEWAL_INPUT });

export function RenewalProvider({
  children,
  extractionService: extractionOverride,
  researchService: researchOverride,
}: RenewalProviderProps) {
  const { settings } = useSettings();
  const extractionService = useMemo<RenewalExtractionService>(
    () => extractionOverride ?? createExtractionService({ allowSampleFallback: false }),
    [extractionOverride],
  );
  const researchService = useMemo(
    () => researchOverride ?? createRenewalResearchService(settings),
    [researchOverride, settings],
  );
  const renewalHistory = useRenewalHistory();
  const recordEmail = useRecordCopiedRenewalEmail();
  const archiveCycle = useArchiveRenewalCycle();
  const deleteAccount = useDeleteRenewalAccount();
  const clearHistory = useClearRenewalHistory();

  const [input, setInputState] = useState<RenewalInput>(freshInput);
  const inputRef = useRef(input);
  const [eligibility, setEligibility] = useState<RenewalEligibility>('eligible');
  const [extractionStatus, setExtractionStatus] = useState<RenewalExtractionStatus>('idle');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [researchPhase, setResearchPhase] = useState<RenewalResearchPhase>('idle');
  const [researchError, setResearchError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RenewalDraft | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [showAdditionalLender, setShowAdditionalLender] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [outreachType, setOutreachTypeState] = useState<RenewalOutreachType>('renewal');
  const [historyStatus, setHistoryStatus] = useState<RenewalHistoryStatus>({
    kind: 'idle',
    message: '',
  });
  const [copyPending, setCopyPending] = useState(false);

  const extractionSequence = useRef(0);
  const researchSequence = useRef(0);
  const extractionAbort = useRef<AbortController | null>(null);
  const researchAbort = useRef<AbortController | null>(null);
  const copyInFlight = useRef(false);

  const selectedAccount = useMemo(
    () => renewalHistory.accounts.find((account) => account.id === selectedAccountId) ?? null,
    [renewalHistory.accounts, selectedAccountId],
  );
  const currentCycle = useMemo(
    () =>
      selectedAccount?.cycles.find((cycle) => cycle.id === selectedAccount.activeCycleId) ?? null,
    [selectedAccount],
  );
  const accountSearchResults = useMemo(
    () => searchRenewalAccounts(renewalHistory.history, accountSearchQuery),
    [accountSearchQuery, renewalHistory.history],
  );

  const setInput = useCallback((next: RenewalInput) => {
    inputRef.current = next;
    setInputState(next);
  }, []);

  const edit = useCallback(
    (field: keyof RenewalInput, value: string) => {
      setInput({ ...inputRef.current, [field]: value });
    },
    [setInput],
  );

  const stopAsyncWork = useCallback(() => {
    extractionAbort.current?.abort();
    researchAbort.current?.abort();
    extractionAbort.current = null;
    researchAbort.current = null;
    extractionSequence.current += 1;
    researchSequence.current += 1;
  }, []);

  const resetVolatile = useCallback(
    (nextInput: RenewalInput) => {
      stopAsyncWork();
      setInput(nextInput);
      setEligibility('eligible');
      setExtractionStatus('idle');
      setExtractionError(null);
      setExtractionWarnings([]);
      setResearchPhase('idle');
      setResearchError(null);
      setDraft(null);
      setDraftId(null);
      setShowAdditionalLender(false);
    },
    [setInput, stopAsyncWork],
  );

  const selectAccount = useCallback(
    (accountId: string | null) => {
      const account = renewalHistory.accounts.find((candidate) => candidate.id === accountId);
      setSelectedAccountId(account?.id ?? null);
      setAccountSearchQuery('');
      setHistoryStatus({ kind: 'idle', message: '' });
      if (!account) {
        setOutreachTypeState('renewal');
        resetVolatile(freshInput());
        return;
      }
      const active = account.cycles.find((cycle) => cycle.id === account.activeCycleId);
      setOutreachTypeState(active?.outreachType ?? 'renewal');
      resetVolatile({
        ...freshInput(),
        merchantName: account.identity.merchantName,
        businessName: account.identity.businessName,
        accountName: account.identity.accountName,
        dba: account.identity.dba,
        website: account.identity.website,
      });
    },
    [renewalHistory.accounts, resetVolatile],
  );

  const setOutreachType = useCallback(
    (value: RenewalOutreachType) => {
      if (!currentCycle?.sentEmails.length) setOutreachTypeState(value);
    },
    [currentCycle],
  );

  const readSalesforce = useCallback(async () => {
    extractionAbort.current?.abort();
    const controller = new AbortController();
    extractionAbort.current = controller;
    const sequence = ++extractionSequence.current;
    setExtractionStatus('reading');
    setExtractionError(null);
    setExtractionWarnings([]);

    try {
      const result = await extractionService.extractActiveCustomer(controller.signal);
      if (controller.signal.aborted || sequence !== extractionSequence.current) return;
      if (!result.ok) {
        extractionAbort.current = null;
        setExtractionStatus('error');
        setExtractionError(result.error.message);
        return;
      }
      const mapping = mapRenewalFields(result.value, inputRef.current);
      setInput(mapping.input);
      setExtractionWarnings(mapping.warnings);
      setShowAdditionalLender((visible) => visible || mapping.detectedAdditionalLender);
      extractionAbort.current = null;
      setExtractionStatus('success');
    } catch (error) {
      if (controller.signal.aborted || sequence !== extractionSequence.current) return;
      extractionAbort.current = null;
      setExtractionStatus('error');
      setExtractionError(toError(error).message);
    }
  }, [extractionService, setInput]);

  const research = useCallback(async () => {
    researchAbort.current?.abort();
    researchAbort.current = null;
    const sequence = ++researchSequence.current;
    const currentInput = inputRef.current;
    if (
      ![
        currentInput.merchantName,
        currentInput.businessName,
        currentInput.accountName,
        currentInput.dba,
        currentInput.businessAddress,
        currentInput.businessAddressGoogleUrl,
        currentInput.website,
      ].some((value) => value.trim().length > 0)
    ) {
      setResearchPhase('error');
      setResearchError(
        'Enter at least one merchant, business, account, DBA, address, Google address link, or website value.',
      );
      return;
    }
    if (!researchService.isConfigured()) {
      setResearchPhase('error');
      setResearchError('Renewal AI is not configured. Add an API key and model in Settings.');
      return;
    }

    const controller = new AbortController();
    researchAbort.current = controller;
    setResearchPhase('researching');
    setResearchError(null);
    setDraft(null);
    setDraftId(null);

    try {
      const result = await researchService.research(
        {
          input: currentInput,
          eligibility,
          repProfile: settings.repProfile,
          outreachType: currentCycle?.outreachType ?? outreachType,
          sentEmailHistory: (currentCycle?.sentEmails ?? [])
            .slice()
            .sort((left, right) => Date.parse(left.copiedAt) - Date.parse(right.copiedAt))
            .map((email) => ({
              subject: email.subject,
              body: email.body,
              sentAt: email.copiedAt,
            })),
        },
        controller.signal,
      );
      if (controller.signal.aborted || sequence !== researchSequence.current) return;
      if (!result.ok) {
        researchAbort.current = null;
        setResearchPhase('error');
        setResearchError(result.error.message);
        return;
      }
      researchAbort.current = null;
      setDraft(result.value);
      setDraftId(createId());
      setResearchPhase('complete');
    } catch (error) {
      if (controller.signal.aborted || sequence !== researchSequence.current) return;
      researchAbort.current = null;
      setResearchPhase('error');
      setResearchError(toError(error).message);
    }
  }, [currentCycle, eligibility, outreachType, researchService, settings.repProfile]);

  const copyEmail = useCallback(async () => {
    if (!draft || !draftId || copyInFlight.current) return;
    const accountIdAtCopy = selectedAccount?.id ?? null;
    const recordInput = {
      selectedAccountId: accountIdAtCopy ?? undefined,
      identity: {
        merchantName: inputRef.current.merchantName,
        businessName: inputRef.current.businessName,
        accountName: inputRef.current.accountName,
        dba: inputRef.current.dba,
        website: inputRef.current.website,
      },
      outreachType: currentCycle?.outreachType ?? outreachType,
      draftId,
      subject: draft.emailSubject,
      body: draft.emailBody,
    };
    copyInFlight.current = true;
    setCopyPending(true);
    setHistoryStatus({ kind: 'idle', message: '' });
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.emailSubject}\n\n${draft.emailBody}`);
    } catch {
      setHistoryStatus({
        kind: 'error',
        message:
          'Could not copy email. The text remains available and selectable for manual copying.',
      });
      copyInFlight.current = false;
      setCopyPending(false);
      return;
    }
    try {
      const result = await recordEmail.mutateAsync(recordInput);
      setSelectedAccountId((current) => (current === accountIdAtCopy ? result.accountId : current));
      setHistoryStatus({
        kind: 'success',
        message: result.duplicate
          ? 'Email copied; this draft was already saved.'
          : 'Email copied and saved locally.',
      });
    } catch {
      setHistoryStatus({
        kind: 'error',
        message: 'Email copied, but local history was not saved.',
      });
    } finally {
      copyInFlight.current = false;
      setCopyPending(false);
    }
  }, [currentCycle, draft, draftId, outreachType, recordEmail, selectedAccount]);

  const renewed = useCallback(async () => {
    if (!selectedAccount || !currentCycle || archiveCycle.isPending) return;
    try {
      await archiveCycle.mutateAsync({ accountId: selectedAccount.id, cycleId: currentCycle.id });
      setOutreachTypeState('renewal');
      resetVolatile({
        ...freshInput(),
        merchantName: selectedAccount.identity.merchantName,
        businessName: selectedAccount.identity.businessName,
        accountName: selectedAccount.identity.accountName,
        dba: selectedAccount.identity.dba,
        website: selectedAccount.identity.website,
      });
      setHistoryStatus({ kind: 'success', message: 'Renewal cycle archived.' });
    } catch (error) {
      setHistoryStatus({
        kind: 'error',
        message: `Could not archive the cycle: ${toError(error).message}`,
      });
    }
  }, [archiveCycle, currentCycle, resetVolatile, selectedAccount]);

  const deleteSelectedAccount = useCallback(async () => {
    if (!selectedAccount || deleteAccount.isPending) return;
    try {
      await deleteAccount.mutateAsync(selectedAccount.id);
      setSelectedAccountId(null);
      setOutreachTypeState('renewal');
      resetVolatile(freshInput());
      setHistoryStatus({ kind: 'success', message: 'Saved Renewal account deleted.' });
    } catch (error) {
      setHistoryStatus({
        kind: 'error',
        message: `Could not delete the account: ${toError(error).message}`,
      });
    }
  }, [deleteAccount, resetVolatile, selectedAccount]);

  const clearSavedAccounts = useCallback(async () => {
    if (clearHistory.isPending) return;
    try {
      await clearHistory.mutateAsync();
      setSelectedAccountId(null);
      setOutreachTypeState('renewal');
      resetVolatile(freshInput());
      setHistoryStatus({ kind: 'success', message: 'All local Renewal data cleared.' });
    } catch (error) {
      setHistoryStatus({
        kind: 'error',
        message: `Could not clear Renewal data: ${toError(error).message}`,
      });
    }
  }, [clearHistory, resetVolatile]);

  const cancel = useCallback(() => {
    const wasResearching = researchAbort.current !== null;
    extractionAbort.current?.abort();
    researchAbort.current?.abort();
    extractionAbort.current = null;
    researchAbort.current = null;
    extractionSequence.current += 1;
    researchSequence.current += 1;
    setExtractionStatus((status) => (status === 'reading' ? 'idle' : status));
    setResearchPhase((phase) => (phase === 'researching' ? 'cancelled' : phase));
    setResearchError((error) => (wasResearching ? null : error));
  }, []);

  const clear = useCallback(() => {
    setSelectedAccountId(null);
    setAccountSearchQuery('');
    setOutreachTypeState('renewal');
    setHistoryStatus({ kind: 'idle', message: '' });
    resetVolatile(freshInput());
  }, [resetVolatile]);

  useEffect(
    () => () => {
      extractionAbort.current?.abort();
      researchAbort.current?.abort();
      extractionSequence.current += 1;
      researchSequence.current += 1;
    },
    [],
  );

  const value = useMemo<RenewalContextValue>(
    () => ({
      input,
      eligibility,
      extractionStatus,
      extractionError,
      extractionWarnings,
      researchPhase,
      researchError,
      draft,
      draftId,
      showAdditionalLender,
      accountSearchQuery,
      accountSearchResults,
      savedAccountCount: renewalHistory.accounts.length,
      selectedAccount,
      currentCycle,
      outreachType,
      outreachTypeLocked: Boolean(currentCycle?.sentEmails.length),
      historyStatus,
      historyLoading: renewalHistory.isLoading,
      isCopyingEmail: copyPending || recordEmail.isPending,
      isRenewing: archiveCycle.isPending,
      isDeletingAccount: deleteAccount.isPending,
      isClearingHistory: clearHistory.isPending,
      edit,
      setEligibility,
      setAccountSearchQuery,
      selectAccount,
      setOutreachType,
      showAdditionalLenderField: () => setShowAdditionalLender(true),
      readSalesforce,
      research,
      retry: research,
      copyEmail,
      renewed,
      deleteSelectedAccount,
      clearSavedAccounts,
      cancel,
      clear,
    }),
    [
      cancel,
      accountSearchQuery,
      accountSearchResults,
      archiveCycle.isPending,
      clear,
      clearHistory.isPending,
      clearSavedAccounts,
      copyEmail,
      copyPending,
      currentCycle,
      deleteAccount.isPending,
      deleteSelectedAccount,
      draft,
      draftId,
      edit,
      eligibility,
      extractionError,
      extractionStatus,
      extractionWarnings,
      input,
      historyStatus,
      renewalHistory.isLoading,
      renewalHistory.accounts.length,
      readSalesforce,
      recordEmail.isPending,
      renewed,
      research,
      researchError,
      researchPhase,
      selectedAccount,
      selectAccount,
      setOutreachType,
      showAdditionalLender,
      outreachType,
    ],
  );

  return <RenewalContext.Provider value={value}>{children}</RenewalContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- provider and hook are intentionally co-located
export function useRenewal(): RenewalContextValue {
  const context = useContext(RenewalContext);
  if (!context) throw new Error('useRenewal must be used within a RenewalProvider');
  return context;
}
