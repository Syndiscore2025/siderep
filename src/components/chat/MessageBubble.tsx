import type { ChatMessage } from '@/types';
import { cn } from '@/utils';

function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-content-muted"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex animate-fade-up', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'rounded-br-sm bg-gradient-to-b from-accent to-accent-muted text-white ring-1 ring-inset ring-white/10'
            : 'rounded-bl-sm border border-edge bg-surface-2 text-content-primary',
          message.error && 'border-danger/40 bg-danger-soft text-danger ring-0',
        )}
      >
        {message.pending ? <TypingDots /> : message.error ? message.error : message.content}
      </div>
    </div>
  );
}
