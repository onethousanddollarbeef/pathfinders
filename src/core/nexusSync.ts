import { createEmptyProfile } from './profile';
import type { AppState } from './storage';
import type { SupabaseSession } from './supabase';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase';
import { mapSupabaseScholarship, type SupabaseScholarshipRow } from './supabaseScholarships';
import { createTrackedApplication } from './tracker';
import type { ApplicationStatus, StudentProfile } from './types';

interface RemoteProfile {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  gpa?: number;
  major?: string;
  grade_level?: string;
  state?: string;
  full_name?: string;
  phone?: string;
  school?: string;
  graduation_year?: number;
  demographics?: unknown;
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

function hasValue<T>(value: T | undefined | null): value is T {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function pickFirst<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const value of values) {
    if (hasValue(value)) return value;
  }
  return undefined;
}

/** True when the extension has no meaningful profile data yet (fresh install). */
export function isLocalProfileEmpty(profile: StudentProfile): boolean {
  return (
    !profile.firstName &&
    !profile.lastName &&
    !profile.email &&
    profile.academics.gpa === undefined &&
    !profile.academics.level &&
    (profile.academics.intendedMajors?.length ?? 0) === 0 &&
    !profile.academics.currentSchool &&
    profile.academics.graduationYear === undefined &&
    !profile.state &&
    !profile.phone &&
    profile.financials.householdIncome === undefined &&
    profile.financials.fafsaFiled === undefined &&
    profile.demographics.firstGeneration === undefined &&
    (profile.demographics.ethnicities?.length ?? 0) === 0 &&
    profile.activities.length === 0
  );
}

function parseDemographicsBlob(raw: unknown): {
  demographics: Record<string, unknown>;
  extension: Record<string, unknown>;
} {
  if (!raw) return { demographics: {}, extension: {} };
  if (Array.isArray(raw)) {
    return { demographics: { ethnicities: raw }, extension: {} };
  }
  if (typeof raw !== 'object') return { demographics: {}, extension: {} };

  const obj = raw as Record<string, unknown>;
  const nestedExtension = obj.extension;
  const extension =
    nestedExtension && typeof nestedExtension === 'object' && !Array.isArray(nestedExtension)
      ? (nestedExtension as Record<string, unknown>)
      : {};

  return { demographics: obj, extension };
}

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
    addressLine2: profile.addressLine2,
    city: profile.city,
    postalCode: profile.postalCode,
    country: profile.country,
    preferredName: profile.preferredName,
    dateOfBirth: profile.dateOfBirth,
    careerGoals: profile.careerGoals,
    fundingGoal: profile.fundingGoal,
  };
}

function profileToRemote(profile: StudentProfile, session: SupabaseSession): RemoteProfile {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  return {
    id: session.user.id,
    email: profile.email ?? session.user.email,
    first_name: profile.firstName,
    last_name: profile.lastName,
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
      militaryAffiliation: profile.demographics.militaryAffiliation,
      disability: profile.demographics.disability,
      lgbtq: profile.demographics.lgbtq,
      extension: extensionPayload(profile),
    },
  };
}

/** Merge a Supabase profile row into the extension profile, preferring remote website data. */
export function remoteToProfile(remote: RemoteProfile, local: StudentProfile): StudentProfile {
  const base = isLocalProfileEmpty(local) ? createEmptyProfile() : local;
  const { demographics, extension } = parseDemographicsBlob(remote.demographics);
  const academics = (extension.academics ?? {}) as StudentProfile['academics'];
  const financials = (extension.financials ?? {}) as StudentProfile['financials'];
  const fullName = remote.full_name ?? '';
  const [fullFirst, ...fullRest] = fullName.split(' ').filter(Boolean);

  const firstName = pickFirst(remote.first_name, fullFirst, extension.firstName as string | undefined, base.firstName);
  const lastName = pickFirst(remote.last_name, fullRest.join(' ') || undefined, extension.lastName as string | undefined, base.lastName);

  return {
    ...base,
    updatedAt: Date.now(),
    email: pickFirst(remote.email, base.email),
    firstName,
    lastName,
    phone: pickFirst(remote.phone, base.phone),
    state: pickFirst(remote.state, base.state),
    citizenship: pickFirst(extension.citizenship as StudentProfile['citizenship'], base.citizenship),
    addressLine1: pickFirst(extension.addressLine1 as string | undefined, base.addressLine1),
    addressLine2: pickFirst(extension.addressLine2 as string | undefined, base.addressLine2),
    city: pickFirst(extension.city as string | undefined, base.city),
    postalCode: pickFirst(extension.postalCode as string | undefined, base.postalCode),
    country: pickFirst(extension.country as string | undefined, base.country),
    preferredName: pickFirst(extension.preferredName as string | undefined, base.preferredName),
    dateOfBirth: pickFirst(extension.dateOfBirth as string | undefined, base.dateOfBirth),
    careerGoals: pickFirst(extension.careerGoals as string | undefined, base.careerGoals),
    fundingGoal: pickFirst(extension.fundingGoal as number | undefined, base.fundingGoal),
    demographics: {
      ...base.demographics,
      firstGeneration: pickFirst(
        demographics.firstGeneration as boolean | undefined,
        base.demographics.firstGeneration,
      ),
      ethnicities: pickFirst(
        demographics.ethnicities as string[] | undefined,
        base.demographics.ethnicities,
      ),
      gender: pickFirst(demographics.gender as string | undefined, base.demographics.gender),
      militaryAffiliation: pickFirst(
        demographics.militaryAffiliation as string[] | undefined,
        base.demographics.militaryAffiliation,
      ),
      disability: pickFirst(demographics.disability as boolean | undefined, base.demographics.disability),
      lgbtq: pickFirst(demographics.lgbtq as boolean | undefined, base.demographics.lgbtq),
    },
    academics: {
      ...base.academics,
      ...academics,
      gpa: pickFirst(remote.gpa, academics.gpa, base.academics.gpa),
      intendedMajors: pickFirst(
        remote.major ? [remote.major] : undefined,
        academics.intendedMajors,
        base.academics.intendedMajors,
      ),
      currentSchool: pickFirst(remote.school, academics.currentSchool, base.academics.currentSchool),
      graduationYear: pickFirst(remote.graduation_year, academics.graduationYear, base.academics.graduationYear),
      level: pickFirst(
        remote.grade_level ? GRADE_TO_LEVEL[remote.grade_level] : undefined,
        academics.level,
        base.academics.level,
      ),
    },
    financials: {
      ...base.financials,
      ...financials,
      fafsaFiled: pickFirst(remote.fafsa_completed, financials.fafsaFiled, base.financials.fafsaFiled),
    },
    interests: pickFirst(extension.interests as string[] | undefined, base.interests) ?? [],
    activities: pickFirst(extension.activities as StudentProfile['activities'] | undefined, base.activities) ?? [],
    essays: pickFirst(extension.essays as StudentProfile['essays'] | undefined, base.essays) ?? [],
    recommenders: pickFirst(extension.recommenders as StudentProfile['recommenders'] | undefined, base.recommenders) ?? [],
    weeklyHoursAvailable: pickFirst(
      extension.weeklyHoursAvailable as number | undefined,
      base.weeklyHoursAvailable,
    ) ?? 5,
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

export async function ensureRemoteProfile(session: SupabaseSession, local: AppState): Promise<void> {
  const remote = profileToRemote(local.profile, session);
  await upsertRows('profiles', 'id', [remote], session.access_token);
}

export async function pullState(session: SupabaseSession, local: AppState): Promise<AppState> {
  const profiles = await request<RemoteProfile[]>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`,
    { method: 'GET' },
    session.access_token,
  );

  let profile = local.profile;
  const remoteProfile = profiles[0];
  if (remoteProfile) {
    profile = remoteToProfile(remoteProfile, local.profile);
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
