import { BulkComposer } from '@/components/bulk/BulkComposer';
import { BulkRunHistory } from '@/components/bulk/BulkRunHistory';

/**
 * Bulk workspace: load recipients, review matches, draft one shared email with
 * the AI, then explicitly send (extension) or prepare output (web). Only
 * aggregate run metadata is stored — never customer data.
 */
export function BulkPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-3 md:p-5 lg:p-6">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-content-primary">
              Bulk outreach
            </h1>
            <p className="mt-0.5 text-xs text-content-muted">
              Prepare personalized messages in batches with an explicit review step.
            </p>
          </div>
          <BulkComposer />
          <BulkRunHistory />
        </div>
      </div>
    </div>
  );
}
