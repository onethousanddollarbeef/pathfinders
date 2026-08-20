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

export function isEmailVerified(session: SupabaseSession): boolean {
  return Boolean(session.user.email_confirmed_at);
}

export const CONFIRMATION_EMAIL_SENDER =
  'Supabase Auth (default: noreply@mail.app.supabase.io, or your custom SMTP sender)';

export interface SignUpResult {
  session?: SupabaseSession;
  message: string;
  signedIn: boolean;
  verificationOptional: boolean;
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
    if (parsed.error_code === 'email_not_confirmed' || message.toLowerCase().includes('email not confirmed')) {
      return 'Email not confirmed yet. Turn off **Confirm email** in Supabase for instant sign-in, or verify your email first.';
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

function buildSession(result: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: SupabaseUser;
}): SupabaseSession {
  return {
    ...result,
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: result.expires_in ? Math.floor(Date.now() / 1000) + result.expires_in : undefined,
  };
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

  if (result.access_token && result.refresh_token) {
    const session = buildSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in,
      user: result.user,
    });
    await setSession(session);
    const verifyHint = isEmailVerified(session)
      ? ''
      : ' You can verify your email anytime from Account — it is optional.';
    return {
      session,
      signedIn: true,
      verificationOptional: !isEmailVerified(session),
      message: `Account created — you are signed in and syncing.${verifyHint}`,
    };
  }

  // If confirm-email is disabled, signup should return a session. When it does not,
  // try signing in immediately in case the account was created anyway.
  try {
    const session = await signIn(email, password);
    const verifyHint = isEmailVerified(session)
      ? ''
      : ' You can verify your email anytime from Account — it is optional.';
    return {
      session,
      signedIn: true,
      verificationOptional: !isEmailVerified(session),
      message: `Account created — you are signed in and syncing.${verifyHint}`,
    };
  } catch {
    return {
      signedIn: false,
      verificationOptional: true,
      message:
        `Account created for ${email}, but sign-in is blocked until email is confirmed. ` +
        `To get instant access (sign up and use Nexus right away), disable **Confirm email** in Supabase: ` +
        `Authentication → Providers → Email. Verification emails are sent by ${CONFIRMATION_EMAIL_SENDER} — check spam or configure custom SMTP in Supabase Auth settings.`,
    };
  }
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
  return `Verification email sent to ${email} from ${CONFIRMATION_EMAIL_SENDER}. Check spam if it does not arrive within a few minutes.`;
}

export async function signIn(email: string, password: string): Promise<SupabaseSession> {
  const result = await request<SupabaseSession & { expires_in?: number }>(
    '/auth/v1/token?grant_type=password',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  const session = buildSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_in: result.expires_in,
    user: result.user,
  });
  await setSession(session);
  return session;
}

export async function signOut(session?: SupabaseSession): Promise<void> {
  if (session) await request('/auth/v1/logout', { method: 'POST' }, session.access_token).catch(() => undefined);
  await setSession();
}

// Re-export sync helpers from nexusSync for convenience
export { pullState, pushState, ensureRemoteProfile } from './nexusSync';
