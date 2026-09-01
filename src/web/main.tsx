import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/globals.css';

import { AuthGate } from './AuthGate';

export const WebApp = lazy(() => import('@/sidepanel/App').then(({ App }) => ({ default: App })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="mx-auto h-full w-full max-w-[1600px] overflow-hidden border-x border-edge bg-surface-0 shadow-2xl shadow-black/40">
        <AuthGate>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-content-muted">
                Loading your workspace…
              </div>
            }
          >
            <WebApp platform="web" />
          </Suspense>
        </AuthGate>
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
