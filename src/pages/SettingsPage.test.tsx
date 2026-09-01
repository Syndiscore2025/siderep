import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSettings } from '@/services';

import { SettingsPage } from './SettingsPage';

const platform = vi.hoisted(() => ({ extension: true }));
vi.mock('@/utils/platform', () => ({ isExtensionContext: () => platform.extension }));

afterEach(() => {
  cleanup();
  platform.extension = true;
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
      expect(settings.renewalAI).toEqual({ apiKey: '', model: 'gpt-5.6-sol' });
    });
  });

  it('persists the centralized merchant AI configuration from existing Settings areas', async () => {
    renderPage();
    const renewalHeading = await screen.findByRole('heading', { name: 'OpenAI Renewal' });
    const renewal = within(renewalHeading.closest('section')!);
    expect(renewal.getByPlaceholderText('gpt-5.6-sol')).toHaveValue('gpt-5.6-sol');
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('medium');
    expect(screen.getByRole('combobox', { name: 'Verbosity' })).toHaveValue('medium');
    expect(screen.getByRole('spinbutton', { name: 'Max output tokens' })).toHaveValue(6000);
    expect(screen.getByRole('switch', { name: 'Web search' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.change(renewal.getByPlaceholderText('gpt-5.6-sol'), {
      target: { value: 'custom-model-id' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Reasoning effort' }), {
      target: { value: 'high' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Verbosity' }), {
      target: { value: 'low' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Max output tokens' }), {
      target: { value: '7000' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Web search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(async () => {
      const settings = await loadSettings();
      expect(settings.renewalAI.model).toBe('custom-model-id');
      expect(settings.ai).toMatchObject({
        reasoningEffort: 'high',
        verbosity: 'low',
        maxOutputTokens: 7000,
        webSearchEnabled: false,
      });
    });
  });
});

describe('SettingsPage platform controls', () => {
  it('retains Gmail API and Google Account controls in the extension', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Google Account' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Send directly via Gmail API' })).toBeInTheDocument();
    expect(screen.getByText(/chrome\.storage\.local on this device/i)).toBeInTheDocument();
  });

  it('hides extension-only controls and normalizes the default Gmail API mode on web', async () => {
    platform.extension = false;
    renderPage();

    const select = await screen.findByRole('combobox', { name: /Delivery mode/ });
    expect(select).toHaveValue('gmail_compose_url');
    expect(
      screen.queryByRole('option', { name: 'Send directly via Gmail API' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Google Account' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Connect Google|Reconnect/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/localStorage on this device/i)).toBeInTheDocument();
    expect(
      screen.getByText(/extension-only.*without a Google sign-in prompt/i),
    ).toBeInTheDocument();
  });
});
