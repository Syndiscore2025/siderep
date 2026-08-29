import { useCallback, useRef, useState } from 'react';

import { buildSystemPrompt } from '@/prompts';
import { createAIService } from '@/services';
import { createId, toError } from '@/utils';

import { useSession } from './useSession';
import { useSettings } from './useSettings';

/**
 * Chat orchestration for the active customer session.
 *
 * Builds the outgoing request from (a) the user-approved customer fields and
 * (b) the in-memory conversation, streams the assistant reply token-by-token
 * into the in-memory message, and supports cancelling an in-flight request.
 * All state stays in memory via `useSession`.
 */
export function useChat() {
  const { customer, messages, addMessage, updateMessage } = useSession();
  const { settings } = useSettings();
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isSending) return;
      setIsSending(true);

      const now = () => new Date().toISOString();
      addMessage({
        id: createId(),
        role: 'user',
        content: trimmed,
        createdAt: now(),
      });

      const assistantId = createId();
      addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: now(),
        pending: true,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const ai = createAIService(settings);
        const history = messages
          .filter((message) => !message.pending && !message.error)
          .map(({ role, content: text }) => ({ role, content: text }));

        const requestMessages = [
          { role: 'system' as const, content: buildSystemPrompt(settings, customer) },
          ...history,
          { role: 'user' as const, content: trimmed },
        ];
        const request = {
          messages: requestMessages,
          model: settings.assistantAI.model,
          temperature: settings.ai.temperature,
          maxTokens: settings.ai.maxTokens,
          signal: controller.signal,
        };

        let accumulated = '';
        for await (const chunk of ai.completeStream(request)) {
          if (chunk.content) {
            accumulated += chunk.content;
            updateMessage(assistantId, { content: accumulated, pending: !chunk.done });
          }
          if (chunk.done) break;
        }

        updateMessage(assistantId, {
          content: accumulated,
          pending: false,
          error: accumulated ? undefined : 'The assistant returned an empty response.',
        });
      } catch (error) {
        const aborted = controller.signal.aborted;
        updateMessage(assistantId, {
          pending: false,
          error: aborted ? 'Cancelled.' : toError(error).message,
        });
      } finally {
        abortRef.current = null;
        setIsSending(false);
      }
    },
    [addMessage, updateMessage, customer, messages, settings, isSending],
  );

  return { sendMessage, stop, isSending };
}
