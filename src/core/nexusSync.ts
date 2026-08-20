import type { AppState } from './storage';
import type { SupabaseSession } from './supabase';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase';
import { mapSupabaseScholarship, type SupabaseScholarshipRow } from './supabaseScholarships';
import { createTrackedApplication } from './tracker';
import type { ApplicationStatus, StudentProfile } from './types';

interface RemoteProfile {
  id: string;
  email?: string;
  gpa?: number;
  major?: string;
  grade_level?: string;
  state?: string;
  full_name?: string;
  phone?: string;
  school?: string;
  graduation_year?: number;
  demographics?: Record<string, unknown>;
  fafsa_completed?: boolean;
  updated_at?: string;
}

interface RemoteUserScholarship {
  id: string;
  user_id: string;
  scholarship_id: string;
  status: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

const GRADE_TO_LEVEL: Record<string, StudentProfile['academics']['level']> = {
  'High School Senior': 'high-school-senior',
  'High School Junior': 'high-school-junior',
  Freshman: 'undergrad-freshman',
  Sophomore: 'undergrad-sophomore',
  Junior: 'undergrad-junior',
  Senior: 'undergrad-senior',
};

const LEVEL_TO_GRADE: Record<string, string> = {
  'high-school-senior': 'High School Senior',
  'high-school-junior': 'High School Junior',
  'undergrad-freshman': 'Freshman',
  'undergrad-sophomore': 'Sophomore',
  'undergrad-junior': 'Junior',
  'undergrad-senior': 'Senior',
};

function extensionPayload(profile: StudentProfile): Record<string, unknown> {
  return {
    academics: profile.academics,
    financials: profile.financials,
    activities: profile.activities,
    essays: profile.essays,
    recommenders: profile.recommenders,
    interests: profile.interests,
    weeklyHoursAvailable: profile.weeklyHoursAvailable,
    citizenship: profile.citizenship,
    addressLine1: profile.addressLine1,
    city: profile.city,
    postalCode: profile.postalCode,
    country: profile.country,
    preferredName: profile.preferredName,
    dateOfBirth: profile.dateOfBirth,
  };
}

function profileToRemote(profile: StudentProfile, session: SupabaseSession): RemoteProfile {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  return {
    id: session.user.id,
    email: profile.email ?? session.user.email,
    gpa: profile.academics.gpa,
    major: profile.academics.intendedMajors?.[0],
    grade_level: profile.academics.level ? LEVEL_TO_GRADE[profile.academics.level] : undefined,
    state: profile.state,
    full_name: fullName || undefined,
    phone: profile.phone,
    school: profile.academics.currentSchool,
    graduation_year: profile.academics.graduationYear,
    fafsa_completed: profile.financials.fafsaFiled,
    demographics: {
      firstGeneration: profile.demographics.firstGeneration,
      ethnicities: profile.demographics.ethnicities,
      gender: profile.demographics.gender,
      extension: extensionPayload(profile),
    },
  };
}

function remoteToProfile(remote: RemoteProfile, local: StudentProfile): StudentProfile {
  const demographics = (remote.demographics ?? {}) as Record<string, unknown>;
  const extension = (demographics.extension ?? {}) as Record<string, unknown>;
  const academics = (extension.academics ?? {}) as StudentProfile['academics'];
  const financials = (extension.financials ?? {}) as StudentProfile['financials'];
  const fullName = remote.full_name ?? '';
  const [firstName, ...rest] = fullName.split(' ');

  return {
    ...local,
    updatedAt: Date.now(),
    email: remote.email ?? local.email,
    firstName: firstName || local.firstName,
    lastName: rest.join(' ') || local.lastName,
    phone: remote.phone ?? local.phone,
    state: remote.state ?? local.state,
    citizenship: (extension.citizenship as StudentProfile['citizenship']) ?? local.citizenship,
    addressLine1: (extension.addressLine1 as string | undefined) ?? local.addressLine1,
    city: (extension.city as string | undefined) ?? local.city,
    postalCode: (extension.postalCode as string | undefined) ?? local.postalCode,
    country: (extension.country as string | undefined) ?? local.country,
    preferredName: (extension.preferredName as string | undefined) ?? local.preferredName,
    dateOfBirth: (extension.dateOfBirth as string | undefined) ?? local.dateOfBirth,
    demographics: {
      ...local.demographics,
      firstGeneration: (demographics.firstGeneration as boolean | undefined) ?? local.demographics.firstGeneration,
      ethnicities: (demographics.ethnicities as string[] | undefined) ?? local.demographics.ethnicities,
      gender: (demographics.gender as string | undefined) ?? local.demographics.gender,
    },
    academics: {
      ...local.academics,
      ...academics,
      gpa: remote.gpa ?? academics.gpa ?? local.academics.gpa,
      intendedMajors: remote.major
        ? [remote.major, ...(academics.intendedMajors ?? local.academics.intendedMajors ?? [])].filter(Boolean)
        : academics.intendedMajors ?? local.academics.intendedMajors,
      currentSchool: remote.school ?? academics.currentSchool ?? local.academics.currentSchool,
      graduationYear: remote.graduation_year ?? academics.graduationYear ?? local.academics.graduationYear,
      level: remote.grade_level
        ? GRADE_TO_LEVEL[remote.grade_level] ?? academics.level ?? local.academics.level
        : academics.level ?? local.academics.level,
    },
    financials: {
      ...local.financials,
      ...financials,
      fafsaFiled: remote.fafsa_completed ?? financials.fafsaFiled ?? local.financials.fafsaFiled,
    },
    interests: (extension.interests as string[] | undefined) ?? local.interests,
    activities: (extension.activities as StudentProfile['activities'] | undefined) ?? local.activities,
    essays: (extension.essays as StudentProfile['essays'] | undefined) ?? local.essays,
    recommenders: (extension.recommenders as StudentProfile['recommenders'] | undefined) ?? local.recommenders,
    weeklyHoursAvailable:
      (extension.weeklyHoursAvailable as number | undefined) ?? local.weeklyHoursAvailable,
  };
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
      const parsed = JSON.parse(body) as { msg?: string; message?: string };
      message = parsed.msg ?? parsed.message ?? message;
    } catch { /* plain-text error */ }
    throw new Error(message);
  }
  return (body ? JSON.parse(body) : undefined) as T;
}

export async function ensureRemoteProfile(session: SupabaseSession, local: AppState): Promise<void> {
  const remote = profileToRemote(local.profile, session);
  await request('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(remote),
  }, session.access_token);
}

export async function pullState(session: SupabaseSession, local: AppState): Promise<AppState> {
  const profiles = await request<RemoteProfile[]>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`,
    { method: 'GET' },
    session.access_token,
  );

  let profile = local.profile;
  if (profiles[0]) {
    profile = remoteToProfile(profiles[0], local.profile);
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
  const scholarshipRows = await request<SupabaseScholarshipRow[]>(
    `/rest/v1/scholarships?id=in.(${scholarshipIds.map((id) => encodeURIComponent(id)).join(',')})&select=*`,
    { method: 'GET' },
    session.access_token,
  );
  const scholarships = scholarshipRows.map(mapSupabaseScholarship);
  const scholarshipMap = new Map(scholarships.map((entry) => [entry.id, entry]));

  const customScholarships = [...local.customScholarships];
  for (const scholarship of scholarships) {
    if (!customScholarships.some((entry) => entry.id === scholarship.id)) {
      customScholarships.push(scholarship);
    }
  }

  const applications = tracked
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

  const localOnlyApplications = local.applications.filter(
    (application) => !tracked.some((entry) => entry.scholarship_id === application.scholarshipId),
  );

  return {
    ...local,
    profile,
    customScholarships,
    applications: [...applications, ...localOnlyApplications],
  };
}

export async function pushState(session: SupabaseSession, state: AppState): Promise<void> {
  await ensureRemoteProfile(session, state);

  const uuidApplications = state.applications.filter((application) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(application.scholarshipId),
  );

  for (const application of uuidApplications) {
    await request('/rest/v1/user_scholarships?on_conflict=user_id,scholarship_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: session.user.id,
        scholarship_id: application.scholarshipId,
        status: mapExtensionStatus(application.status),
        notes: application.notes,
      }),
    }, session.access_token);
  }
}
