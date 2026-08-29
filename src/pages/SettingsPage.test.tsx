import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSettings } from '@/services';

import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<SettingsPage />, { wrapper });
}

describe('SettingsPage Assistant OpenAI configuration', () => {
  it('shows separate Renewal and Assistant OpenAI settings without Azure fields', async () => {
    renderPage();
    const assistantHeading = await screen.findByRole('heading', { name: 'OpenAI Assistant' });
    const renewalHeading = screen.getByRole('heading', { name: 'OpenAI Renewal' });
    const assistant = within(assistantHeading.closest('section')!);
    const renewal = within(renewalHeading.closest('section')!);

    expect(assistant.getByLabelText(/API key/i)).toHaveAttribute('type', 'password');
    expect(assistant.getByLabelText(/Model/i)).toHaveValue('gpt-4o-mini');
    expect(renewal.getByLabelText(/API key/i)).toHaveValue('');
    expect(screen.queryByText(/Azure|Deployment name|API version/i)).not.toBeInTheDocument();
  });

  it('saves the Assistant key and model independently from Renewal', async () => {
    renderPage();
    const assistantHeading = await screen.findByRole('heading', { name: 'OpenAI Assistant' });
    const assistant = within(assistantHeading.closest('section')!);
    fireEvent.change(assistant.getByLabelText(/API key/i), {
      target: { value: 'test-assistant-key' },
    });
    fireEvent.change(assistant.getByLabelText(/Model/i), { target: { value: 'gpt-4.1-mini' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await screen.findByText('Saved');
    await waitFor(async () => {
      const settings = await loadSettings();
      expect(settings.assistantAI).toEqual({
        apiKey: 'test-assistant-key',
        model: 'gpt-4.1-mini',
      });
      expect(settings.renewalAI).toEqual({ apiKey: '', model: '' });
    });
  });
});
