import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as ServicesModule from '@/services';

import { SessionProvider } from './useSession';
import { useEmail } from './useEmail';

const mocks = vi.hoisted(() => ({ extension: false, emailFactory: vi.fn() }));
vi.mock('@/utils/platform', () => ({ isExtensionContext: () => mocks.extension }));
vi.mock('@/services', async (importOriginal) => ({
  ...(await importOriginal<typeof ServicesModule>()),
  createEmailService: mocks.emailFactory,
}));

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
  mocks.emailFactory.mockReset();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useEmail web delivery', () => {
  it('exposes Gmail compose for stale Gmail API settings and never creates the OAuth service', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { result } = renderHook(() => useEmail(), { wrapper: Wrapper });

    expect(result.current.deliveryMode).toBe('gmail_compose_url');
    await act(() =>
      result.current.approveAndSend({
        to: ['rep@example.com'],
        subject: 'Hello',
        body: 'Body',
      }),
    );

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('mail.google.com'),
      '_blank',
      'noopener',
    );
    expect(mocks.emailFactory).not.toHaveBeenCalled();
    expect(result.current.phase.kind).toBe('sent');
  });
});
