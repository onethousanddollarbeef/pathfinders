import type { AppState } from './storage';

export const SUPABASE_PROJECT_ID = 'zrqfanveghxodzavjrkb';
export const SUPABASE_URL = 'https://zrqfanveghxodzavjrkb.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_t6NOr6t__1Sy01GLMVs77w_w35aLL37';

const SESSION_KEY = 'scholarpath.supabase.session.v1';

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
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
    let message = body || `Supabase request failed (${response.status})`;
    try {
      const parsed = JSON.parse(body) as { msg?: string; message?: string; error_description?: string };
      message = parsed.msg ?? parsed.message ?? parsed.error_description ?? message;
    } catch { /* Supabase occasionally returns a plain-text proxy error. */ }
    throw new Error(message);
  }
  return (body ? JSON.parse(body) : undefined) as T;
}

export async function signUp(email: string, password: string): Promise<{ session?: SupabaseSession; message: string }> {
  const result = await request<{ access_token?: string; refresh_token?: string; expires_in?: number; user: SupabaseUser }>(
    '/auth/v1/signup',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  if (!result.access_token || !result.refresh_token) {
    return { message: 'Check your email to confirm your account, then sign in.' };
  }
  const session = { ...result, access_token: result.access_token, refresh_token: result.refresh_token,
    expires_at: result.expires_in ? Math.floor(Date.now() / 1000) + result.expires_in : undefined };
  await setSession(session);
  return { session, message: 'Account created and sync enabled.' };
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

export async function pullState(session: SupabaseSession): Promise<AppState | undefined> {
  const rows = await request<Array<{ state: AppState }>>(
    `/rest/v1/scholarpath_states?user_id=eq.${encodeURIComponent(session.user.id)}&select=state&limit=1`,
    { method: 'GET' }, session.access_token,
  );
  return rows[0]?.state;
}

export async function pushState(session: SupabaseSession, state: AppState): Promise<void> {
  await request('/rest/v1/scholarpath_states?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: session.user.id, state, updated_at: new Date().toISOString() }),
  }, session.access_token);
}
