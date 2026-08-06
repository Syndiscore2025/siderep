import { BulkComposer } from '@/components/bulk/BulkComposer';
import { BulkRunHistory } from '@/components/bulk/BulkRunHistory';

/**
 * Bulk workspace: extract a Salesforce report, review matched recipients, draft
 * one shared email with the AI, and send after explicit approval. Only metadata
 * about each run is stored (counts/status) — never customer data.
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
