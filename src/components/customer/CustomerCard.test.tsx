import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/hooks/useSession';
import { SAMPLE_CUSTOMER } from '@/services';
import type * as CustomerExtractionModule from '@/services/extraction/customerExtractionService';
import { ok } from '@/utils';

import { CustomerCard } from './CustomerCard';

const mocks = vi.hoisted(() => ({ extension: false, extractionFactory: vi.fn() }));
vi.mock('@/services/extraction/customerExtractionService', async (importOriginal) => ({
  ...(await importOriginal<typeof CustomerExtractionModule>()),
  createExtractionService: mocks.extractionFactory,
}));
vi.mock('@/utils/platform', () => ({ isExtensionContext: () => mocks.extension }));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  mocks.extension = false;
  mocks.extractionFactory.mockReset();
  vi.restoreAllMocks();
});

describe('CustomerCard platform controls', () => {
  it('uses only manual customer entry on web', () => {
    render(<CustomerCard />, { wrapper: Wrapper });

    expect(screen.getByRole('textbox', { name: 'Customer details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read Customer Info' })).not.toBeInTheDocument();
    expect(mocks.extractionFactory).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Customer details' }), {
      target: { value: 'Account Name: Manual Acme\nEmail: rep@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load customer' }));

    expect(screen.getAllByText('Manual Acme')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Re-read' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
    expect(mocks.extractionFactory).not.toHaveBeenCalled();
  });

  it('retains Salesforce read and re-read controls in the extension', async () => {
    mocks.extension = true;
    const extractActiveCustomer = vi.fn(async () => ok(SAMPLE_CUSTOMER));
    mocks.extractionFactory.mockReturnValue({ extractActiveCustomer });
    render(<CustomerCard />, { wrapper: Wrapper });

    expect(screen.queryByRole('textbox', { name: 'Customer details' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read Customer Info' }));

    await waitFor(() => expect(extractActiveCustomer).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'Re-read' })).toBeInTheDocument();
    expect(screen.getByText('Sample data')).toBeInTheDocument();
  });
});
