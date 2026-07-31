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
      <div className="shrink-0 p-3 pb-0">
        <CustomerCard />
      </div>
      <ChatThread />
      <ChatComposer />
    </div>
  );
}
