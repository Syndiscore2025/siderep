import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/globals.css';
import { App } from '@/sidepanel/App';

import { AuthGate } from './AuthGate';

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
      <div className="mx-auto h-full w-full max-w-[1440px] overflow-hidden border-x border-edge">
        <AuthGate>
          <App />
        </AuthGate>
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
