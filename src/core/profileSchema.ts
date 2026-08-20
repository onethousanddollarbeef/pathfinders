import { createEmptyProfile } from './profile';
import type { StudentProfile } from './types';

/** Grade labels stored in Supabase `profiles.grade_level` (matches nexusnext.lovable.app). */
export const WEBSITE_GRADE_LEVELS = [
  'High School Freshman',
  'High School Sophomore',
  'High School Junior',
  'High School Senior',
  'Freshman',
  'Sophomore',
  'Junior',
  'Senior',
  'Graduate',
  'Doctoral',
  'Non-traditional',
] as const;

export type WebsiteGradeLevel = (typeof WEBSITE_GRADE_LEVELS)[number];

const GRADE_TO_LEVEL: Record<string, StudentProfile['academics']['level']> = {
  'High School Freshman': 'high-school-freshman',
  'High School Sophomore': 'high-school-sophomore',
  'High School Junior': 'high-school-junior',
  'High School Senior': 'high-school-senior',
  Freshman: 'undergrad-freshman',
  Sophomore: 'undergrad-sophomore',
  Junior: 'undergrad-junior',
  Senior: 'undergrad-senior',
  Graduate: 'graduate',
  Doctoral: 'doctoral',
  'Non-traditional': 'non-traditional',
};

const LEVEL_TO_GRADE: Record<string, WebsiteGradeLevel> = {
  'high-school-freshman': 'High School Freshman',
  'high-school-sophomore': 'High School Sophomore',
  'high-school-junior': 'High School Junior',
  'high-school-senior': 'High School Senior',
  'undergrad-freshman': 'Freshman',
  'undergrad-sophomore': 'Sophomore',
  'undergrad-junior': 'Junior',
  'undergrad-senior': 'Senior',
  graduate: 'Graduate',
  doctoral: 'Doctoral',
  'non-traditional': 'Non-traditional',
};

/** Supabase `profiles` row shape (nexusnext.lovable.app). */
export interface SupabaseProfileRow {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  school?: string | null;
  graduation_year?: number | null;
  gpa?: number | null;
  major?: string | null;
  bio?: string | null;
  grade_level?: string | null;
  state?: string | null;
  /** JSON array on the website, e.g. `["Woman"]`. */
  demographics?: string[] | null;
  first_generation?: boolean | null;
  disability?: boolean | null;
  lgbtq?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const PLACEHOLDER_PREFIX = 'enter your';

export function isPlaceholderText(value: string | undefined | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return trimmed.toLowerCase().startsWith(PLACEHOLDER_PREFIX);
}

export function cleanRemoteText(value: string | undefined | null): string | undefined {
  if (!value || isPlaceholderText(value)) return undefined;
  return value.trim();
}

export function splitFullName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function joinFullName(firstName?: string, lastName?: string): string | undefined {
  const full = [firstName, lastName].filter(Boolean).join(' ').trim();
  return full || undefined;
}

export function gradeLevelToEducationLevel(gradeLevel?: string | null): StudentProfile['academics']['level'] | undefined {
  if (!gradeLevel) return undefined;
  return GRADE_TO_LEVEL[gradeLevel.trim()];
}

export function educationLevelToGradeLevel(level?: StudentProfile['academics']['level']): WebsiteGradeLevel | undefined {
  if (!level) return undefined;
  return LEVEL_TO_GRADE[level];
}

export function profileToSupabaseRow(profile: StudentProfile, userId: string, email?: string): SupabaseProfileRow {
  const demographics = (profile.demographics.tags ?? []).filter(Boolean);
  const row: SupabaseProfileRow = {
    id: userId,
    full_name: joinFullName(profile.firstName, profile.lastName),
    email: profile.email ?? email,
    phone: profile.phone,
    school: profile.academics.currentSchool,
    graduation_year: profile.academics.graduationYear,
    gpa: profile.academics.gpa,
    major: profile.academics.intendedMajors?.[0],
    bio: profile.bio,
    grade_level: educationLevelToGradeLevel(profile.academics.level),
    state: profile.state,
    demographics: demographics.length > 0 ? demographics : undefined,
    first_generation: profile.demographics.firstGeneration,
    disability: profile.demographics.disability,
    lgbtq: profile.demographics.lgbtq,
  };

  return compactProfileRow(row);
}

export function supabaseRowToProfile(row: SupabaseProfileRow, local: StudentProfile): StudentProfile {
  const base = isLocalProfileEmpty(local) ? createEmptyProfile() : local;
  const fullName = cleanRemoteText(row.full_name);
  const fromName = fullName ? splitFullName(fullName) : {};

  const demoTags = Array.isArray(row.demographics)
    ? row.demographics.map((entry) => entry.trim()).filter(Boolean)
    : [];

  return {
    ...base,
    updatedAt: Date.now(),
    email: cleanRemoteText(row.email) ?? base.email,
    firstName: fromName.firstName ?? base.firstName,
    lastName: fromName.lastName ?? base.lastName,
    phone: cleanRemoteText(row.phone) ?? base.phone,
    state: cleanRemoteText(row.state) ?? base.state,
    bio: cleanRemoteText(row.bio) ?? base.bio,
    academics: {
      ...base.academics,
      gpa: row.gpa ?? undefined,
      intendedMajors: cleanRemoteText(row.major) ? [row.major!.trim()] : base.academics.intendedMajors,
      currentSchool: cleanRemoteText(row.school) ?? base.academics.currentSchool,
      graduationYear: row.graduation_year && row.graduation_year > 0 ? row.graduation_year : base.academics.graduationYear,
      level: gradeLevelToEducationLevel(row.grade_level) ?? base.academics.level,
    },
    demographics: {
      ...base.demographics,
      tags: demoTags.length > 0 ? demoTags : base.demographics.tags,
      gender: demoTags[0] ?? base.demographics.gender,
      firstGeneration: row.first_generation ?? base.demographics.firstGeneration,
      disability: row.disability ?? base.demographics.disability,
      lgbtq: row.lgbtq ?? base.demographics.lgbtq,
    },
  };
}

function compactProfileRow(row: SupabaseProfileRow): SupabaseProfileRow {
  const next: SupabaseProfileRow = { id: row.id };
  if (cleanRemoteText(row.full_name)) next.full_name = row.full_name!.trim();
  if (cleanRemoteText(row.email)) next.email = row.email!.trim();
  if (cleanRemoteText(row.phone)) next.phone = row.phone!.trim();
  if (cleanRemoteText(row.school)) next.school = row.school!.trim();
  if (row.graduation_year && row.graduation_year > 0) next.graduation_year = row.graduation_year;
  if (row.gpa !== undefined && row.gpa !== null) next.gpa = row.gpa;
  if (cleanRemoteText(row.major)) next.major = row.major!.trim();
  if (cleanRemoteText(row.bio)) next.bio = row.bio!.trim();
  if (cleanRemoteText(row.grade_level)) next.grade_level = row.grade_level!.trim();
  if (cleanRemoteText(row.state)) next.state = row.state!.trim();
  if (row.demographics && row.demographics.length > 0) next.demographics = row.demographics;
  if (row.first_generation !== undefined && row.first_generation !== null) next.first_generation = row.first_generation;
  if (row.disability !== undefined && row.disability !== null) next.disability = row.disability;
  if (row.lgbtq !== undefined && row.lgbtq !== null) next.lgbtq = row.lgbtq;
  return next;
}

export function isLocalProfileEmpty(profile: StudentProfile): boolean {
  return (
    !profile.firstName &&
    !profile.lastName &&
    !profile.email &&
    !profile.bio &&
    profile.academics.gpa === undefined &&
    !profile.academics.level &&
    (profile.academics.intendedMajors?.length ?? 0) === 0 &&
    !profile.academics.currentSchool &&
    (profile.academics.graduationYear === undefined || profile.academics.graduationYear === 0) &&
    !profile.state &&
    !profile.phone &&
    (profile.demographics.tags?.length ?? 0) === 0 &&
    profile.demographics.firstGeneration === undefined &&
    profile.activities.length === 0
  );
}
