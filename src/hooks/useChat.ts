import { useCallback, useState } from 'react';

import { buildSystemPrompt } from '@/prompts';
import { createAIService } from '@/services';
import type { ChatMessage } from '@/types';
import { createId } from '@/utils';

import { useSession } from './useSession';
import { useSettings } from './useSettings';

/**
 * Chat orchestration for the active customer session.
 *
 * Builds the outgoing request from (a) the user-approved customer fields and
 * (b) the in-memory conversation, then records the assistant reply. All state
 * stays in memory via `useSession`.
 */
export function useChat() {
  const { customer, messages, addMessage, updateMessage } = useSession();
  const { settings } = useSettings();
  const [isSending, setIsSending] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isSending) return;
      setIsSending(true);

      const now = () => new Date().toISOString();
      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: trimmed,
        createdAt: now(),
      };
      addMessage(userMessage);

      const assistantId = createId();
      addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: now(),
        pending: true,
      });

      try {
        const ai = createAIService(settings);
        const history = messages
          .filter((message) => !message.pending && !message.error)
          .map(({ role, content: text }) => ({ role, content: text }));

        const result = await ai.complete({
          messages: [
            { role: 'system', content: buildSystemPrompt(settings, customer) },
            ...history,
            { role: 'user', content: trimmed },
          ],
          model: settings.ai.model,
          temperature: settings.ai.temperature,
          maxTokens: settings.ai.maxTokens,
        });

        if (result.ok) {
          updateMessage(assistantId, { content: result.value.content, pending: false });
        } else {
          updateMessage(assistantId, { pending: false, error: result.error.message });
        }
      } finally {
        setIsSending(false);
      }
    },
    [addMessage, updateMessage, customer, messages, settings, isSending],
  );

  return { sendMessage, isSending };
}
