export const SUPABASE_PROJECT_ID = 'zrqfanveghxodzavjrkb';
export const SUPABASE_URL = 'https://zrqfanveghxodzavjrkb.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_t6NOr6t__1Sy01GLMVs77w_w35aLL37';
export const NEXUS_AUTH_REDIRECT_URL = 'https://nexusnext.lovable.app/auth';

const SESSION_KEY = 'scholarpath.supabase.session.v1';

export interface SupabaseUser {
  id: string;
  email?: string;
  email_confirmed_at?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
}

export interface SignUpResult {
  session?: SupabaseSession;
  message: string;
  confirmationRequired: boolean;
}

function storageArea(): chrome.storage.StorageArea | undefined {
  return typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
}

export async function getSession(): Promise<SupabaseSession | undefined> {
  const area = storageArea();
  if (!area) return undefined;
  const value = await area.get(SESSION_KEY);
  const session = value[SESSION_KEY] as SupabaseSession | undefined;
  if (!session || !session.expires_at || session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  try {
    const refreshed = await request<SupabaseSession & { expires_in?: number }>(
      '/auth/v1/token?grant_type=refresh_token',
      { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) },
    );
    const next = { ...refreshed, expires_at: refreshed.expires_in
      ? Math.floor(Date.now() / 1000) + refreshed.expires_in : undefined };
    await setSession(next);
    return next;
  } catch {
    await setSession();
    return undefined;
  }
}

async function setSession(session?: SupabaseSession): Promise<void> {
  const area = storageArea();
  if (!area) return;
  if (session) await area.set({ [SESSION_KEY]: session });
  else await area.remove(SESSION_KEY);
}

function parseAuthError(body: string, status: number): string {
  let message = body || `Supabase request failed (${status})`;
  try {
    const parsed = JSON.parse(body) as {
      msg?: string;
      message?: string;
      error_description?: string;
      error_code?: string;
    };
    if (parsed.error_code === 'weak_password') {
      return 'Choose a stronger password — at least 8 characters and not a common or leaked password.';
    }
    if (parsed.error_code === 'user_already_registered') {
      return 'An account with this email already exists. Sign in instead.';
    }
    message = parsed.msg ?? parsed.message ?? parsed.error_description ?? message;
  } catch { /* plain-text error */ }
  return message;
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(parseAuthError(body, response.status));
  }
  return (body ? JSON.parse(body) : undefined) as T;
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const result = await request<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user: SupabaseUser;
    confirmation_sent_at?: string;
  }>(
    '/auth/v1/signup',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        options: { emailRedirectTo: NEXUS_AUTH_REDIRECT_URL },
      }),
    },
  );

  if (!result.access_token || !result.refresh_token) {
    return {
      confirmationRequired: true,
      message: result.confirmation_sent_at
        ? `Confirmation email sent to ${email}. Open the link in that message, then sign in here to sync.`
        : `Account created for ${email}. Check your inbox to confirm your email, then sign in.`,
    };
  }

  const session = {
    ...result,
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: result.expires_in ? Math.floor(Date.now() / 1000) + result.expires_in : undefined,
  };
  await setSession(session);
  return { session, confirmationRequired: false, message: 'Account created and sync enabled.' };
}

export async function resendConfirmationEmail(email: string): Promise<string> {
  await request(
    `/auth/v1/resend?redirect_to=${encodeURIComponent(NEXUS_AUTH_REDIRECT_URL)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'signup',
        email,
        options: { emailRedirectTo: NEXUS_AUTH_REDIRECT_URL },
      }),
    },
  );
  return `Confirmation email resent to ${email}.`;
}

export async function signIn(email: string, password: string): Promise<SupabaseSession> {
  const result = await request<SupabaseSession & { expires_in?: number }>(
    '/auth/v1/token?grant_type=password',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  const session = { ...result, expires_at: result.expires_in ? Math.floor(Date.now() / 1000) + result.expires_in : undefined };
  await setSession(session);
  return session;
}

export async function signOut(session?: SupabaseSession): Promise<void> {
  if (session) await request('/auth/v1/logout', { method: 'POST' }, session.access_token).catch(() => undefined);
  await setSession();
}

// Re-export sync helpers from nexusSync for convenience
export { pullState, pushState, ensureRemoteProfile } from './nexusSync';
