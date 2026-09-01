import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatThread } from '@/components/chat/ChatThread';
import { CustomerCard } from '@/components/customer/CustomerCard';

/**
 * Main workspace: customer session on top, conversation below, composer
 * pinned to the bottom.
 */
export function AssistantPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="contents md:mx-auto md:flex md:min-h-0 md:w-full md:max-w-6xl md:flex-1 md:gap-4 md:p-5 lg:p-6">
        <div className="shrink-0 p-3 pb-0 md:w-80 md:overflow-y-auto md:p-0 lg:w-96">
          <CustomerCard />
        </div>
        <div className="contents md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden md:rounded-2xl md:border md:border-edge md:bg-surface-1/40 md:shadow-lg">
          <ChatThread />
          <ChatComposer />
        </div>
      </div>
    </div>
  );
}
