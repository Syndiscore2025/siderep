import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

type AuthUrlLocation = Pick<Location, 'hash' | 'search'>;

export function isPasswordSetupLocation(location: AuthUrlLocation): boolean {
  const queryType = new URLSearchParams(location.search).get('type');
  const hashType = new URLSearchParams(location.hash.replace(/^#/, '')).get('type');
  return [queryType, hashType].some((type) => type === 'invite' || type === 'recovery');
}

export const capturedPasswordSetupFlow =
  typeof window !== 'undefined' && isPasswordSetupLocation(window.location);

export interface WebAuthSession {
  user: {
    email?: string;
  };
}

export interface WebAuthResult {
  error: string | null;
}

export interface WebSessionResult extends WebAuthResult {
  session: WebAuthSession | null;
}

export interface WebAuthClient {
  getSession(): Promise<WebSessionResult>;
  onAuthStateChange(callback: (event: string, session: WebAuthSession | null) => void): {
    unsubscribe(): void;
  };
  signInWithPassword(credentials: { email: string; password: string }): Promise<WebAuthResult>;
  updateUser(attributes: { password: string }): Promise<WebAuthResult>;
  signOut(): Promise<WebAuthResult>;
}

function toWebSession(session: Session | null): WebAuthSession | null {
  return session ? { user: { email: session.user.email } } : null;
}

function createAuthAdapter(client: SupabaseClient): WebAuthClient {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      return { session: toWebSession(data.session), error: error?.message ?? null };
    },
    onAuthStateChange(callback) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        callback(event, toWebSession(session));
      });
      return { unsubscribe: () => data.subscription.unsubscribe() };
    },
    async signInWithPassword(credentials) {
      const { error } = await client.auth.signInWithPassword(credentials);
      return { error: error?.message ?? null };
    },
    async updateUser(attributes) {
      const { error } = await client.auth.updateUser(attributes);
      return { error: error?.message ?? null };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      return { error: error?.message ?? null };
    },
  };
}

function validHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const hasValidConfiguration = validHttpUrl(configuredUrl) && configuredAnonKey.length > 0;

export const supabaseConfigurationError = hasValidConfiguration
  ? null
  : 'Web authentication is not configured. Set the Supabase URL and anonymous key.';

export const supabaseClient = hasValidConfiguration
  ? createClient(configuredUrl, configuredAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const supabaseAuthClient = supabaseClient ? createAuthAdapter(supabaseClient) : null;
