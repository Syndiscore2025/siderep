import { CustomerCard } from '@/components/customer/CustomerCard';
import { EmailComposer } from '@/components/email/EmailComposer';
import { SentHistory } from '@/components/email/SentHistory';

/**
 * Email workspace: the active customer context on top (load/approve fields),
 * the template-driven composer in the middle, and the sent-email log below.
 * Sending always requires explicit user approval in the composer.
 */
export function EmailPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <CustomerCard />
        <EmailComposer />
        <SentHistory />
      </div>
    </div>
  );
}
