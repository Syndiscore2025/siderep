import { useState } from 'react';

import { Header } from '@/components/layout/Header';
import type { View } from '@/components/layout/Header';
import { SessionProvider } from '@/hooks/useSession';
import { AssistantPage } from '@/pages/AssistantPage';
import { SettingsPage } from '@/pages/SettingsPage';

export function App() {
  const [view, setView] = useState<View>('assistant');

  return (
    <SessionProvider>
      <div className="flex h-full flex-col bg-surface-0">
        <Header view={view} onNavigate={setView} />
        {view === 'assistant' ? <AssistantPage /> : <SettingsPage />}
      </div>
    </SessionProvider>
  );
}
