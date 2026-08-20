import type { AppState } from './storage';
import type { SupabaseSession } from './supabase';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase';
import { mapSupabaseScholarship, type SupabaseScholarshipRow } from './supabaseScholarships';
import { isLocalProfileEmpty, profileToSupabaseRow, supabaseRowToProfile } from './profileSchema';
import { createTrackedApplication } from './tracker';
import type { ApplicationStatus } from './types';

interface RemoteUserScholarship {
  id: string;
  user_id: string;
  scholarship_id: string;
  status: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

function mapRemoteStatus(status: string): ApplicationStatus {
  if (status === 'submitted') return 'submitted';
  if (status === 'started' || status === 'planning') return 'started';
  return 'saved';
}

function mapExtensionStatus(status: ApplicationStatus): string {
  if (status === 'submitted') return 'submitted';
  if (status === 'started') return 'started';
  if (status === 'saved') return 'saved';
  return 'saved';
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
      const parsed = JSON.parse(body) as { msg?: string; message?: string; hint?: string };
      message = parsed.msg ?? parsed.message ?? message;
      if (parsed.hint && !message.includes(parsed.hint)) message = `${message} ${parsed.hint}`;
    } catch { /* plain-text error */ }
    if (message.includes('Supabase') || message.includes('request failed')) {
      message = 'Could not sync with your account. Try again in a moment.';
    }
    throw new Error(message);
  }
  return (body ? JSON.parse(body) : undefined) as T;
}

/** PostgREST requires a JSON array for insert/upsert payloads. */
async function upsertRows<T extends object>(
  table: string,
  onConflict: string,
  rows: T[],
  accessToken: string,
): Promise<void> {
  if (rows.length === 0) return;
  await request(`/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  }, accessToken);
}

export { isLocalProfileEmpty, supabaseRowToProfile as remoteToProfile } from './profileSchema';

export async function ensureRemoteProfile(session: SupabaseSession, local: AppState): Promise<void> {
  const remote = profileToSupabaseRow(local.profile, session.user.id, session.user.email);
  await upsertRows('profiles', 'id', [remote], session.access_token);
}

export async function pullState(session: SupabaseSession, local: AppState): Promise<AppState> {
  const profiles = await request<ReturnType<typeof profileToSupabaseRow>[]>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`,
    { method: 'GET' },
    session.access_token,
  );

  let profile = local.profile;
  const remoteProfile = profiles[0];
  if (remoteProfile) {
    profile = supabaseRowToProfile(remoteProfile, local.profile);
    if (!profile.email) profile = { ...profile, email: session.user.email };
  } else if (!profile.email && session.user.email) {
    profile = { ...profile, email: session.user.email };
  }

  const tracked = await request<RemoteUserScholarship[]>(
    `/rest/v1/user_scholarships?user_id=eq.${encodeURIComponent(session.user.id)}&select=*`,
    { method: 'GET' },
    session.access_token,
  );

  if (tracked.length === 0) {
    return { ...local, profile };
  }

  const scholarshipIds = [...new Set(tracked.map((entry) => entry.scholarship_id))];
  const scholarshipRows = scholarshipIds.length > 0
    ? await request<SupabaseScholarshipRow[]>(
      `/rest/v1/scholarships?id=in.(${scholarshipIds.map((id) => encodeURIComponent(id)).join(',')})&select=*`,
      { method: 'GET' },
      session.access_token,
    )
    : [];

  const scholarships = scholarshipRows.map(mapSupabaseScholarship);
  const scholarshipMap = new Map(scholarships.map((entry) => [entry.id, entry]));

  const customScholarships = [...local.customScholarships];
  for (const scholarship of scholarships) {
    if (!customScholarships.some((entry) => entry.id === scholarship.id)) {
      customScholarships.push(scholarship);
    }
  }

  const remoteApplications = tracked
    .filter((entry) => scholarshipMap.has(entry.scholarship_id))
    .map((entry) => {
      const scholarship = scholarshipMap.get(entry.scholarship_id)!;
      const existing = local.applications.find((app) => app.scholarshipId === entry.scholarship_id);
      const base = existing ?? createTrackedApplication(scholarship, profile);
      return {
        ...base,
        status: mapRemoteStatus(entry.status),
        notes: entry.notes ?? base.notes,
      };
    });

  const localOnlyApplications = isLocalProfileEmpty(local.profile) && local.applications.length === 0
    ? []
    : local.applications.filter(
      (application) => !tracked.some((entry) => entry.scholarship_id === application.scholarshipId),
    );

  return {
    ...local,
    profile,
    customScholarships,
    applications: [...remoteApplications, ...localOnlyApplications],
  };
}

export async function pushState(session: SupabaseSession, state: AppState): Promise<void> {
  await ensureRemoteProfile(session, state);

  const uuidApplications = state.applications.filter((application) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(application.scholarshipId),
  );

  await upsertRows(
    'user_scholarships',
    'user_id,scholarship_id',
    uuidApplications.map((application) => ({
      user_id: session.user.id,
      scholarship_id: application.scholarshipId,
      status: mapExtensionStatus(application.status),
      notes: application.notes,
    })),
    session.access_token,
  );
}
