import { useState } from 'react';

import { Header } from '@/components/layout/Header';
import type { View } from '@/components/layout/Header';
import { RenewalProvider } from '@/hooks/useRenewal';
import { SessionProvider } from '@/hooks/useSession';
import { AssistantPage } from '@/pages/AssistantPage';
import { BulkPage } from '@/pages/BulkPage';
import { EmailPage } from '@/pages/EmailPage';
import { RenewalPage } from '@/pages/RenewalPage';
import { SettingsPage } from '@/pages/SettingsPage';

export function App() {
  const [view, setView] = useState<View>('assistant');

  return (
    <SessionProvider>
      <RenewalProvider>
        <div className="flex h-full flex-col bg-surface-0">
          <Header view={view} onNavigate={setView} />
          {view === 'assistant' && <AssistantPage />}
          {view === 'email' && <EmailPage />}
          {view === 'bulk' && <BulkPage />}
          {view === 'renewal' && <RenewalPage />}
          {view === 'settings' && <SettingsPage />}
        </div>
      </RenewalProvider>
    </SessionProvider>
  );
}
