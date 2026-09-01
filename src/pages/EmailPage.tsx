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
      <div className="flex-1 overflow-y-auto p-3 md:p-5 lg:p-6">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-content-primary">
              Email workspace
            </h1>
            <p className="mt-0.5 text-xs text-content-muted">
              Review customer context, generate a draft, and approve every message before delivery.
            </p>
          </div>
          <CustomerCard />
          <EmailComposer />
          <SentHistory />
        </div>
      </div>
    </div>
  );
}
