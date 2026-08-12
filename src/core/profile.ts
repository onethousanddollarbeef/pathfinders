/**
 * Profile creation and completeness scoring.
 *
 * Completeness is not vanity: every unanswered field is a rule the engine has to
 * mark "unknown", which downgrades matches to "needs info". The prompts here are
 * ordered by how many scholarships each answer would unlock.
 */

import type { ProfileField, Scholarship, StudentProfile } from './types';
import { FIELD_LABELS, getProfileValue } from './eligibility';

export const PROFILE_VERSION = 1;

export function createEmptyProfile(now: number = Date.now()): StudentProfile {
  return {
    version: PROFILE_VERSION,
    updatedAt: now,
    country: 'United States',
    demographics: {},
    academics: { gpaScale: 4 },
    financials: {},
    interests: [],
    activities: [],
    essays: [],
    recommenders: [],
    weeklyHoursAvailable: 5,
  };
}

interface CompletenessField {
  field: ProfileField | 'identity' | 'contact';
  label: string;
  weight: number;
  isSet: (profile: StudentProfile) => boolean;
}

const CHECKS: CompletenessField[] = [
  { field: 'identity', label: 'Name and date of birth', weight: 1, isSet: (p) => Boolean(p.firstName && p.lastName) },
  { field: 'contact', label: 'Email and mailing address', weight: 1, isSet: (p) => Boolean(p.email && p.city && p.state) },
  { field: 'state', label: 'State of residence', weight: 2, isSet: (p) => Boolean(p.state) },
  { field: 'citizenship', label: 'Citizenship status', weight: 2, isSet: (p) => Boolean(p.citizenship) },
  { field: 'academics.level', label: 'Education level', weight: 2, isSet: (p) => Boolean(p.academics.level) },
  { field: 'academics.gpa', label: 'GPA', weight: 3, isSet: (p) => p.academics.gpa !== undefined },
  { field: 'academics.intendedMajors', label: 'Intended major(s)', weight: 3, isSet: (p) => (p.academics.intendedMajors?.length ?? 0) > 0 },
  { field: 'academics.graduationYear', label: 'Graduation year', weight: 1, isSet: (p) => p.academics.graduationYear !== undefined },
  { field: 'financials.householdIncome', label: 'Household income', weight: 2, isSet: (p) => p.financials.householdIncome !== undefined },
  { field: 'financials.pellEligible', label: 'Pell Grant eligibility', weight: 1, isSet: (p) => p.financials.pellEligible !== undefined },
  { field: 'financials.fafsaFiled', label: 'FAFSA filed', weight: 1, isSet: (p) => p.financials.fafsaFiled !== undefined },
  { field: 'demographics.firstGeneration', label: 'First-generation status', weight: 2, isSet: (p) => p.demographics.firstGeneration !== undefined },
  { field: 'demographics.ethnicities', label: 'Ethnicity (optional but unlocks awards)', weight: 1, isSet: (p) => (p.demographics.ethnicities?.length ?? 0) > 0 },
  { field: 'interests', label: 'Interests', weight: 2, isSet: (p) => p.interests.length > 0 },
  { field: 'activities', label: 'Activities and leadership', weight: 2, isSet: (p) => p.activities.length > 0 },
  { field: 'essays', label: 'Essay library', weight: 2, isSet: (p) => p.essays.length > 0 },
  { field: 'academics.satTotal', label: 'SAT or ACT score', weight: 1, isSet: (p) => p.academics.satTotal !== undefined || p.academics.actComposite !== undefined },
];

export interface CompletenessResult {
  percent: number;
  missing: { label: string; weight: number }[];
}

export function profileCompleteness(profile: StudentProfile): CompletenessResult {
  const total = CHECKS.reduce((sum, check) => sum + check.weight, 0);
  let earned = 0;
  const missing: { label: string; weight: number }[] = [];
  for (const check of CHECKS) {
    if (check.isSet(profile)) earned += check.weight;
    else missing.push({ label: check.label, weight: check.weight });
  }
  missing.sort((a, b) => b.weight - a.weight);
  return { percent: Math.round((earned / total) * 100), missing };
}

/**
 * Ranks the unanswered profile fields by how much award money they would put
 * back in play, so the UI can ask the highest-leverage question first.
 */
export interface ProfileGap {
  field: ProfileField;
  label: string;
  blockedCount: number;
  blockedValue: number;
}

export function findHighImpactGaps(profile: StudentProfile, scholarships: Scholarship[]): ProfileGap[] {
  const byField = new Map<ProfileField, ProfileGap>();

  for (const scholarship of scholarships) {
    for (const rule of scholarship.eligibility) {
      const value = getProfileValue(profile, rule.field);
      const missing = value === undefined || (Array.isArray(value) && value.length === 0);
      if (!missing) continue;
      const existing = byField.get(rule.field) ?? {
        field: rule.field,
        label: FIELD_LABELS[rule.field] ?? rule.field,
        blockedCount: 0,
        blockedValue: 0,
      };
      existing.blockedCount += 1;
      existing.blockedValue += Math.round((scholarship.amountMin + scholarship.amountMax) / 2);
      byField.set(rule.field, existing);
    }
  }

  return [...byField.values()].sort((a, b) => b.blockedValue - a.blockedValue);
}
