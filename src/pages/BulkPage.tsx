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
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <BulkComposer />
        <BulkRunHistory />
      </div>
    </div>
  );
}
