import { useCallback, useRef, useState } from 'react';

import {
  buildGmailComposeUrl,
  createAIService,
  createEmailService,
  generateEmail,
  recordSentEmail,
} from '@/services';
import type { EmailDeliveryMode, EmailResult, GeneratedEmail, SentEmailRecord } from '@/types';
import { createId, toError } from '@/utils';

import { useRefreshSentHistory } from './useSentHistory';
import { useSession } from './useSession';
import { useSettings } from './useSettings';

/**
 * Email workflow for the active session: generate a draft from the user's
 * template + approved fields, then — only on an explicit user click — send it
 * via the configured delivery mode. Customer fields come from the in-memory
 * session; nothing about the customer is persisted. A record of the SENT email
 * (our own artifact) is optionally stored per the `rememberSent` setting.
 */
export type EmailPhase =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'review' }
  | { kind: 'sending' }
  | { kind: 'sent'; record: SentEmailRecord }
  | { kind: 'error'; message: string };

export function useEmail() {
  const { customer } = useSession();
  const { settings } = useSettings();
  const refreshHistory = useRefreshSentHistory();
  const [draft, setDraft] = useState<GeneratedEmail | null>(null);
  const [phase, setPhase] = useState<EmailPhase>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const deliveryMode = settings.email.deliveryMode;

  const generate = useCallback(
    async (instruction?: string) => {
      setPhase({ kind: 'generating' });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const ai = createAIService(settings);
        if (!ai.isConfigured()) {
          setPhase({ kind: 'error', message: 'Configure Azure OpenAI in Settings first.' });
          return;
        }
        const result = await generateEmail(ai, settings, customer, instruction, controller.signal);
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
    [customer, settings],
  );

  const finalize = useCallback(
    async (mode: EmailDeliveryMode, email: GeneratedEmail, info?: EmailResult) => {
      const record: SentEmailRecord = {
        id: createId(),
        to: email.to,
        subject: email.subject,
        body: email.body,
        deliveryMode: mode,
        messageId: info?.id,
        threadId: info?.threadId,
        sentAt: new Date().toISOString(),
      };
      if (settings.email.rememberSent) {
        await recordSentEmail(record);
        void refreshHistory();
      }
      setPhase({ kind: 'sent', record });
    },
    [refreshHistory, settings.email.rememberSent],
  );

  /** The mandatory approval gate — a send only ever happens from here. */
  const approveAndSend = useCallback(
    async (email: GeneratedEmail) => {
      setPhase({ kind: 'sending' });
      const emailDraft = { to: email.to, subject: email.subject, body: email.body };
      try {
        if (deliveryMode === 'gmail_compose_url') {
          const url = buildGmailComposeUrl(emailDraft);
          if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
            await chrome.tabs.create({ url });
          } else {
            window.open(url, '_blank', 'noopener');
          }
          await finalize('gmail_compose_url', email);
          return;
        }
        if (deliveryMode === 'manual_composer') {
          await finalize('manual_composer', email);
          return;
        }
        const service = createEmailService(settings);
        const result = await service.sendEmail(emailDraft);
        if (!result.ok) {
          setPhase({ kind: 'error', message: result.error.message });
          return;
        }
        await finalize('gmail_api', email, result.value);
      } catch (error) {
        setPhase({ kind: 'error', message: toError(error).message });
      }
    },
    [deliveryMode, finalize, settings],
  );

  const reset = useCallback(() => {
    setDraft(null);
    setPhase({ kind: 'idle' });
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return {
    draft,
    setDraft,
    phase,
    deliveryMode,
    generate,
    approveAndSend,
    reset,
    cancel,
    isGenerating: phase.kind === 'generating',
    isSending: phase.kind === 'sending',
  };
}
