import { useState } from 'react';

import { Header } from '@/components/layout/Header';
import type { View } from '@/components/layout/Header';
import { RenewalProvider } from '@/hooks/useRenewal';
import { SessionProvider } from '@/hooks/useSession';
import { useTheme } from '@/hooks/useTheme';
import { AssistantPage } from '@/pages/AssistantPage';
import { BulkPage } from '@/pages/BulkPage';
import { EmailPage } from '@/pages/EmailPage';
import { RenewalPage } from '@/pages/RenewalPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { cn } from '@/utils';

export function App({ platform = 'extension' }: { platform?: 'extension' | 'web' }) {
  const [view, setView] = useState<View>('renewal');
  const web = platform === 'web';
  useTheme();

  return (
    <SessionProvider>
      <RenewalProvider>
        <div className={cn('flex h-full flex-col bg-surface-0', web && 'web-app-shell')}>
          <Header view={view} onNavigate={setView} platform={platform} />
          <div className="flex min-h-0 flex-1 flex-col">
            {view === 'assistant' && <AssistantPage />}
            {view === 'email' && <EmailPage />}
            {view === 'bulk' && <BulkPage />}
            {view === 'renewal' && <RenewalPage />}
            {view === 'settings' && <SettingsPage />}
          </div>
        </div>
      </RenewalProvider>
    </SessionProvider>
  );
}
