import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { loadSettings, resetSettings, saveSettings } from '@/services';
import { DEFAULT_SETTINGS } from '@/types';
import type { Settings } from '@/types';

/** React Query bindings for the (config-only) settings service. */

export const SETTINGS_QUERY_KEY = ['settings'] as const;

export function useSettings() {
  const query = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: loadSettings,
    staleTime: Infinity,
  });
  return {
    settings: query.data ?? DEFAULT_SETTINGS,
    isLoading: query.isLoading,
  };
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => saveSettings(settings),
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_QUERY_KEY, saved),
  });
}

export function useResetSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetSettings(),
    onSuccess: (defaults) => queryClient.setQueryData(SETTINGS_QUERY_KEY, defaults),
  });
}
