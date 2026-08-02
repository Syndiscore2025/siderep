import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Button, SendIcon, StopIcon, Textarea } from '@/components/ui';
import { useChat } from '@/hooks/useChat';
import { useSession } from '@/hooks/useSession';
import { QUICK_ACTIONS } from '@/prompts';
import { cn } from '@/utils';

export function ChatComposer() {
  const { customer, messages } = useSession();
  const { sendMessage, stop, isSending } = useChat();
  const [draft, setDraft] = useState('');

  const canChat = customer !== null;

  const submit = () => {
    const value = draft.trim();
    if (!value || isSending) return;
    setDraft('');
    void sendMessage(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-edge bg-surface-1/80 p-3 backdrop-blur">
      {canChat && messages.length === 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={isSending}
              onClick={() => void sendMessage(action.prompt)}
              className="animate-scale-in rounded-full border border-edge bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-content-secondary shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-accent/40 hover:text-content-primary active:translate-y-0 disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-2 rounded-xl border border-edge bg-surface-2 p-1.5 transition-colors',
          'focus-within:border-accent',
          (!canChat || isSending) && 'opacity-70',
        )}
      >
        <Textarea
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={!canChat || isSending}
          placeholder={
            canChat ? 'Message SideRep… (Enter to send)' : 'Read customer info to start chatting'
          }
          aria-label="Message"
          className="min-h-9 flex-1 border-0 bg-transparent px-1.5 py-1 shadow-none focus:border-0"
        />
        {isSending ? (
          <Button
            variant="secondary"
            onClick={stop}
            icon={<StopIcon className="size-3.5" />}
            aria-label="Stop generating"
          />
        ) : (
          <Button
            variant="primary"
            onClick={submit}
            disabled={!canChat || draft.trim().length === 0}
            icon={<SendIcon className="size-3.5" />}
            aria-label="Send message"
          />
        )}
      </div>
      <p className="mt-1.5 px-1 text-[10px] text-content-muted">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
