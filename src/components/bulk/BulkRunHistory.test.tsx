import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  records: [
    {
      id: 'prepared',
      action: 'prepared' as const,
      deliveryMode: 'manual_composer' as const,
      ranAt: '2026-08-31T00:00:00.000Z',
      matched: 2,
      attempted: 2,
      succeeded: 2,
      failed: 0,
      skipped: 0,
      status: 'complete' as const,
    },
    {
      id: 'legacy',
      ranAt: '2026-08-30T00:00:00.000Z',
      matched: 1,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      status: 'complete' as const,
    },
  ],
}));

vi.mock('@/hooks/useBulkRuns', () => ({
  useBulkRuns: () => ({ records: mocks.records, isLoading: false }),
  useClearBulkRuns: () => ({ isPending: false, mutate: vi.fn() }),
}));

import { BulkRunHistory } from './BulkRunHistory';

afterEach(cleanup);

describe('BulkRunHistory', () => {
  it('labels prepared records as prepared and legacy records as sent', () => {
    render(<BulkRunHistory />);
    expect(screen.getByText('2 prepared')).toBeInTheDocument();
    expect(screen.getByText('1 sent')).toBeInTheDocument();
  });
});
