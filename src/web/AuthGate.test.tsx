import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthGate } from './AuthGate';
import type { WebAuthClient, WebAuthSession, WebSessionResult } from './supabaseClient';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

interface AuthHarness {
  client: WebAuthClient;
  emit(event: string, session: WebAuthSession | null): void;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function createAuthHarness(
  initialSession: WebAuthSession | null = null,
  overrides: Partial<WebAuthClient> = {},
): AuthHarness {
  let listener: ((event: string, session: WebAuthSession | null) => void) | undefined;
  const unsubscribe = vi.fn();
  const client: WebAuthClient = {
    getSession: vi.fn(async () => ({ session: initialSession, error: null })),
    onAuthStateChange: vi.fn((callback) => {
      listener = callback;
      return { unsubscribe };
    }),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
  return {
    client,
    unsubscribe,
    emit(event, session) {
      listener?.(event, session);
    },
  };
}

function renderGate(harness: AuthHarness, passwordSetupFlow = false) {
  return render(
    <AuthGate
      authClient={harness.client}
      configurationError={null}
      passwordSetupFlow={passwordSetupFlow}
    >
      <div>Protected SideRep app</div>
    </AuthGate>,
  );
}

function configuredSession(email: string): WebAuthSession {
  return { user: { email, passwordConfigured: true } };
}

describe('AuthGate', () => {
  it('shows a safe configuration state without starting auth', () => {
    render(
      <AuthGate authClient={null} configurationError="Authentication has not been configured.">
        <div>Protected SideRep app</div>
      </AuthGate>,
    );

    expect(screen.getByRole('heading', { name: 'Authentication unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Authentication has not been configured.');
    expect(screen.queryByText('Protected SideRep app')).not.toBeInTheDocument();
  });

  it('loads the initial session and cleans up its auth subscription', async () => {
    let resolveSession!: (result: WebSessionResult) => void;
    const harness = createAuthHarness(null, {
      getSession: vi.fn(
        () =>
          new Promise<WebSessionResult>((resolve) => {
            resolveSession = resolve;
          }),
      ),
    });
    const { unmount } = renderGate(harness);

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    await act(async () => {
      resolveSession({ session: configuredSession('rep@example.com'), error: null });
    });
    expect(screen.getByText('rep@example.com')).toBeInTheDocument();
    expect(screen.getByText('Protected SideRep app')).toBeInTheDocument();

    unmount();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it('offers email/password sign-in without a sign-up action', async () => {
    const harness = createAuthHarness();
    renderGate(harness);

    await screen.findByRole('heading', { name: 'Sign in' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' rep@example.com ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(harness.client.signInWithPassword).toHaveBeenCalledWith({
        email: 'rep@example.com',
        password: 'password123',
      });
    });
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();

    act(() => harness.emit('SIGNED_IN', configuredSession('rep@example.com')));
    expect(screen.getByText('Protected SideRep app')).toBeInTheDocument();
  });

  it('displays sign-in failures without exposing the protected app', async () => {
    const harness = createAuthHarness(null, {
      signInWithPassword: vi.fn(async () => ({ error: 'Invalid login credentials' })),
    });
    renderGate(harness);

    await screen.findByRole('heading', { name: 'Sign in' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rep@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(screen.queryByText('Protected SideRep app')).not.toBeInTheDocument();
  });

  it('requires an admin-created user to replace their temporary password', async () => {
    const harness = createAuthHarness({
      user: { email: 'new-user@example.com', passwordConfigured: false },
    });
    renderGate(harness);

    await screen.findByRole('heading', { name: 'Set your password' });
    expect(screen.getByText(/administrator-issued temporary password/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() => {
      expect(harness.client.updateUser).toHaveBeenCalledWith({
        password: 'new-password',
        data: { password_configured: true },
      });
    });
    expect(await screen.findByText('Protected SideRep app')).toBeInTheDocument();
  });

  it('still supports password setup links for an existing user', async () => {
    const harness = createAuthHarness(configuredSession('invited@example.com'));
    renderGate(harness, true);

    expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
  });

  it('enters password setup when Supabase emits password recovery', async () => {
    const session = configuredSession('recovering@example.com');
    const harness = createAuthHarness(session);
    renderGate(harness);

    await screen.findByText('recovering@example.com');
    act(() => harness.emit('PASSWORD_RECOVERY', session));

    expect(screen.getByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
    expect(screen.queryByText('Protected SideRep app')).not.toBeInTheDocument();
  });

  it('shows an initial-session error and can retry safely', async () => {
    const getSession = vi
      .fn<WebAuthClient['getSession']>()
      .mockResolvedValueOnce({ session: null, error: 'Session service unavailable' })
      .mockResolvedValueOnce({ session: null, error: null });
    const harness = createAuthHarness(null, { getSession });
    renderGate(harness);

    expect(await screen.findByRole('alert')).toHaveTextContent('Session service unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('signs out without clearing SideRep local data', async () => {
    window.localStorage.setItem('siderep.settings', '{"theme":"dark"}');
    const harness = createAuthHarness(configuredSession('rep@example.com'));
    renderGate(harness);

    await screen.findByText('rep@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(harness.client.signOut).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('siderep.settings')).toBe('{"theme":"dark"}');
  });

  it('allows a configured user to change or cancel changing their password', async () => {
    const harness = createAuthHarness(configuredSession('rep@example.com'));
    renderGate(harness);

    await screen.findByText('Protected SideRep app');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText(/choose a new password/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Protected SideRep app')).toBeInTheDocument();
  });
});
