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
    <main className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[-12rem] right-[-8rem] size-96 rounded-full bg-accent-muted/10 blur-3xl"
      />
      <section className="relative w-full max-w-md animate-fade-up rounded-2xl border border-edge-strong/80 bg-surface-1/90 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
        <div className="mb-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 ring-1 ring-inset ring-white/5">
              <img src="/icons/icon-128.png" alt="" className="size-10 rounded-xl" />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-content-primary">SideRep</p>
              <p className="mt-0.5 text-xs text-content-muted">AI-powered sales workspace</p>
            </div>
          </div>
          <span className="rounded-full border border-accent/20 bg-accent-soft px-2.5 py-1 text-[10px] font-semibold text-accent-hover">
            ADMIN MANAGED
          </span>
        </div>
        {children}
        <div className="mt-7 flex items-center gap-2 border-t border-edge pt-4 text-[11px] text-content-muted">
          <span className="size-1.5 rounded-full bg-success" />
          Your workspace data stays on this device.
        </div>
      </section>
    </main>
  );
}

const inputClass =
  'mt-1.5 h-11 w-full rounded-xl border border-edge bg-surface-2/80 px-3.5 text-sm ' +
  'text-content-primary shadow-inner shadow-black/10 placeholder:text-content-muted transition-all ' +
  'hover:border-edge-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15';
const buttonClass =
  'h-11 w-full rounded-xl bg-gradient-to-b from-accent to-accent-muted px-4 text-sm font-semibold ' +
  'text-white shadow-md shadow-accent/10 ring-1 ring-inset ring-white/10 transition-all ' +
  'hover:from-accent-hover hover:to-accent active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';

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
  const [changingPassword, setChangingPassword] = useState(false);
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
      if (event === 'SIGNED_OUT') {
        setNeedsPassword(false);
        setChangingPassword(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        setNeedsPassword(true);
      } else if (nextSession) {
        setNeedsPassword(passwordSetupFlow || nextSession.user.passwordConfigured !== true);
      }
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
          setNeedsPassword(
            Boolean(
              result.session &&
              (passwordSetupFlow || result.session.user.passwordConfigured !== true),
            ),
          );
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
  }, [authClient, passwordSetupFlow, retry]);

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
      const result = await authClient.updateUser({
        password,
        data: { password_configured: true },
      });
      if (result.error) setActionError(result.error);
      else {
        setNeedsPassword(false);
        setChangingPassword(false);
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
        <h1 className="text-xl font-semibold tracking-tight text-content-primary">
          Authentication unavailable
        </h1>
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
        <h1 className="text-xl font-semibold tracking-tight text-content-primary">
          Unable to load your account
        </h1>
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

  if (session && (needsPassword || changingPassword)) {
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold tracking-tight text-content-primary">
          Set your password
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          {needsPassword
            ? 'Replace your administrator-issued temporary password to continue.'
            : 'Choose a new password for your SideRep account.'}
        </p>
        <form className="mt-5 space-y-4" onSubmit={updatePassword}>
          <label className="block text-xs font-semibold text-content-secondary">
            New password
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className="block text-xs font-semibold text-content-secondary">
            Confirm password
            <input
              className={inputClass}
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
          {!needsPassword && (
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
              onClick={() => {
                setChangingPassword(false);
                setPassword('');
                setConfirmation('');
                setActionError(null);
              }}
            >
              Cancel
            </button>
          )}
        </form>
      </AuthCard>
    );
  }

  if (!session) {
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold tracking-tight text-content-primary">Sign in</h1>
        <p className="mt-1.5 text-sm text-content-secondary">
          Use the email and password provided by your administrator.
        </p>
        <form className="mt-6 space-y-4" onSubmit={signIn}>
          <label className="block text-xs font-semibold text-content-secondary">
            Email
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-xs font-semibold text-content-secondary">
            Password
            <input
              className={inputClass}
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
        className="flex shrink-0 items-center justify-end gap-3 border-b border-edge bg-surface-1/70
          px-4 py-2.5 text-xs text-content-secondary backdrop-blur-xl md:px-6"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full bg-success" />
          <span className="truncate">{session.user.email ?? 'Authenticated account'}</span>
        </span>
        {actionError && (
          <span role="alert" className="text-danger">
            {actionError}
          </span>
        )}
        <button
          type="button"
          className="rounded-lg px-2.5 py-1.5 font-medium text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
          onClick={() => setChangingPassword(true)}
        >
          Change password
        </button>
        <button
          type="button"
          className="rounded-lg border border-edge bg-surface-2/60 px-3 py-1.5 font-medium text-content-primary
            transition-colors hover:border-edge-strong hover:bg-surface-3 disabled:opacity-60"
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
