import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import {
  capturedPasswordSetupFlow,
  supabaseAuthClient,
  supabaseConfigurationError,
  type WebAuthClient,
  type WebAuthSession,
} from './supabaseClient';

interface AuthGateProps {
  children: ReactNode;
  authClient?: WebAuthClient | null;
  configurationError?: string | null;
  passwordSetupFlow?: boolean;
}

function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-edge bg-surface-1 p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-3">
          <img src="/icons/icon-128.png" alt="" className="size-10 rounded-xl" />
          <div>
            <p className="font-semibold text-content-primary">SideRep</p>
            <p className="text-xs text-content-muted">Sales Assistant</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}

const inputClass =
  'w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-content-primary ' +
  'placeholder:text-content-muted';
const buttonClass =
  'w-full rounded-lg bg-accent px-3 py-2 font-medium text-white transition-colors ' +
  'hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60';

export function AuthGate({
  children,
  authClient = supabaseAuthClient,
  configurationError = supabaseConfigurationError,
  passwordSetupFlow = capturedPasswordSetupFlow,
}: AuthGateProps) {
  const [session, setSession] = useState<WebAuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [needsPassword, setNeedsPassword] = useState(passwordSetupFlow);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    if (!authClient) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setInitialError(null);
    const subscription = authClient.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
      if (event === 'SIGNED_OUT') setNeedsPassword(false);
      setLoading(false);
    });

    void authClient
      .getSession()
      .then((result) => {
        if (!active) return;
        if (result.error) {
          setInitialError(result.error);
        } else {
          setSession(result.session);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setInitialError('Unable to check your authentication session.');
        setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [authClient, retry]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await authClient.signInWithPassword({ email: email.trim(), password });
      if (result.error) setActionError(result.error);
    } catch {
      setActionError('Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;
    if (password.length < 8) {
      setActionError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setActionError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const result = await authClient.updateUser({ password });
      if (result.error) setActionError(result.error);
      else {
        setNeedsPassword(false);
        setPassword('');
        setConfirmation('');
      }
    } catch {
      setActionError('Unable to update your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!authClient) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) setActionError(result.error);
      else setSession(null);
    } catch {
      setActionError('Unable to sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (configurationError || !authClient) {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold">Authentication unavailable</h1>
        <p role="alert" className="mt-2 text-sm text-content-secondary">
          {configurationError ?? 'Web authentication is not configured.'}
        </p>
      </AuthCard>
    );
  }

  if (loading) {
    return (
      <AuthCard>
        <p role="status" className="text-sm text-content-secondary">
          Checking your session…
        </p>
      </AuthCard>
    );
  }

  if (initialError) {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold">Unable to load your account</h1>
        <p role="alert" className="mt-2 text-sm text-danger">
          {initialError}
        </p>
        <button
          type="button"
          className={`${buttonClass} mt-5`}
          onClick={() => setRetry((value) => value + 1)}
        >
          Try again
        </button>
      </AuthCard>
    );
  }

  if (session && needsPassword) {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold">Set your password</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Choose a password to finish accessing SideRep.
        </p>
        <form className="mt-5 space-y-4" onSubmit={updatePassword}>
          <label className="block text-sm font-medium">
            New password
            <input
              className={`${inputClass} mt-1`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Confirm password
            <input
              className={`${inputClass} mt-1`}
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
          {actionError && (
            <p role="alert" className="text-sm text-danger">
              {actionError}
            </p>
          )}
          <button className={buttonClass} type="submit" disabled={busy}>
            {busy ? 'Updating…' : 'Set password'}
          </button>
        </form>
      </AuthCard>
    );
  }

  if (!session) {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-content-secondary">Use your SideRep account to continue.</p>
        <form className="mt-5 space-y-4" onSubmit={signIn}>
          <label className="block text-sm font-medium">
            Email
            <input
              className={`${inputClass} mt-1`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className={`${inputClass} mt-1`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {actionError && (
            <p role="alert" className="text-sm text-danger">
              {actionError}
            </p>
          )}
          <button className={buttonClass} type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 items-center justify-end gap-3 border-b border-edge bg-surface-1
          px-4 py-2 text-xs text-content-secondary"
      >
        <span>{session.user.email ?? 'Authenticated account'}</span>
        {actionError && (
          <span role="alert" className="text-danger">
            {actionError}
          </span>
        )}
        <button
          type="button"
          className="rounded-md border border-edge px-2.5 py-1 text-content-primary
            hover:bg-surface-2 disabled:opacity-60"
          onClick={signOut}
          disabled={busy}
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
