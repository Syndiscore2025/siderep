import { useEffect, useRef } from 'react';

import { EmptyState, SparklesIcon } from '@/components/ui';
import { useSession } from '@/hooks/useSession';

import { MessageBubble } from './MessageBubble';

export function ChatThread() {
  const { customer, messages } = useSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-soft to-transparent text-accent-hover ring-1 ring-inset ring-accent/20">
              <SparklesIcon className="size-6" />
            </div>
          }
          title={customer ? 'Ask anything about this customer' : 'Start a session'}
          description={
            customer
              ? 'Use a quick action below, or type your own request.'
              : 'Read customer info above to unlock the assistant.'
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
