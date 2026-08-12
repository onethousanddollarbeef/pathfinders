/**
 * Rule evaluation: the "why do I qualify?" engine.
 *
 * Every scholarship carries declarative rules instead of opaque match logic, so
 * each verdict can be traced back to a specific requirement, the profile value
 * it was compared against, and a sentence a student can actually read.
 */

import type {
  EligibilityRule,
  MatchVerdict,
  ProfileField,
  RuleEvaluation,
  RuleStatus,
  StudentProfile,
} from './types';

type FieldValue = string | number | boolean | string[] | undefined;

/** Human label for each profile field, used in explanations and gap prompts. */
export const FIELD_LABELS: Record<ProfileField, string> = {
  'academics.level': 'education level',
  'academics.gpa': 'GPA',
  'academics.satTotal': 'SAT score',
  'academics.actComposite': 'ACT score',
  'academics.intendedMajors': 'intended major',
  'academics.graduationYear': 'graduation year',
  'academics.enrollment': 'enrollment status',
  'financials.householdIncome': 'household income',
  'financials.pellEligible': 'Pell Grant eligibility',
  'financials.fafsaFiled': 'FAFSA filing status',
  citizenship: 'citizenship status',
  state: 'state of residence',
  'demographics.gender': 'gender',
  'demographics.ethnicities': 'ethnicity',
  'demographics.firstGeneration': 'first-generation college student status',
  'demographics.militaryAffiliation': 'military affiliation',
  'demographics.disability': 'disability status',
  'demographics.lgbtq': 'LGBTQ+ identity',
  interests: 'interests',
  activities: 'activities',
  essays: 'essay library',
};

function normalizeScalar(value: unknown): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed.toLowerCase();
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  return undefined;
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);
}

/** Activities are matched on their name, category and role combined. */
function activityKeywords(profile: StudentProfile): string[] {
  const keywords: string[] = [];
  for (const activity of profile.activities ?? []) {
    keywords.push(...[activity.name, activity.category, activity.role].filter(Boolean).map((s) => String(s).toLowerCase()));
  }
  return keywords;
}

export function getProfileValue(profile: StudentProfile, field: ProfileField): FieldValue {
  switch (field) {
    case 'academics.level':
      return normalizeScalar(profile.academics?.level);
    case 'academics.gpa': {
      const { gpa, gpaScale } = profile.academics ?? {};
      if (gpa === undefined || gpa === null) return undefined;
      // Normalize alternate scales (e.g. 5.0 weighted) onto the 4.0 scale rules use.
      const scale = gpaScale && gpaScale > 0 ? gpaScale : 4;
      return scale === 4 ? gpa : Number(((gpa / scale) * 4).toFixed(2));
    }
    case 'academics.satTotal':
      return normalizeScalar(profile.academics?.satTotal);
    case 'academics.actComposite':
      return normalizeScalar(profile.academics?.actComposite);
    case 'academics.intendedMajors':
      return normalizeList(profile.academics?.intendedMajors);
    case 'academics.graduationYear':
      return normalizeScalar(profile.academics?.graduationYear);
    case 'academics.enrollment':
      return normalizeScalar(profile.academics?.enrollment);
    case 'financials.householdIncome':
      return normalizeScalar(profile.financials?.householdIncome);
    case 'financials.pellEligible':
      return normalizeScalar(profile.financials?.pellEligible);
    case 'financials.fafsaFiled':
      return normalizeScalar(profile.financials?.fafsaFiled);
    case 'citizenship':
      return normalizeScalar(profile.citizenship);
    case 'state':
      return normalizeScalar(profile.state);
    case 'demographics.gender':
      return normalizeScalar(profile.demographics?.gender);
    case 'demographics.ethnicities':
      return normalizeList(profile.demographics?.ethnicities);
    case 'demographics.firstGeneration':
      return normalizeScalar(profile.demographics?.firstGeneration);
    case 'demographics.militaryAffiliation':
      return normalizeList(profile.demographics?.militaryAffiliation);
    case 'demographics.disability':
      return normalizeScalar(profile.demographics?.disability);
    case 'demographics.lgbtq':
      return normalizeScalar(profile.demographics?.lgbtq);
    case 'interests':
      return normalizeList(profile.interests);
    case 'activities':
      return activityKeywords(profile);
    case 'essays':
      return (profile.essays ?? []).map((essay) => essay.topic.toLowerCase());
    default:
      return undefined;
  }
}

function isMissing(value: FieldValue): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function formatValue(value: FieldValue): string {
  if (value === undefined) return 'not provided';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  return value;
}

function ruleTargets(rule: EligibilityRule): string[] {
  if (Array.isArray(rule.value)) return rule.value.map((entry) => String(entry).toLowerCase());
  if (rule.value === undefined) return [];
  return [String(rule.value).toLowerCase()];
}

function compare(rule: EligibilityRule, actual: FieldValue): boolean {
  const targets = ruleTargets(rule);
  switch (rule.operator) {
    case 'gte':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual >= rule.value;
    case 'lte':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual <= rule.value;
    case 'eq':
      if (typeof actual === 'boolean' || typeof rule.value === 'boolean') return actual === rule.value;
      return String(actual).toLowerCase() === String(rule.value).toLowerCase();
    case 'in':
      return !Array.isArray(actual) && targets.includes(String(actual).toLowerCase());
    case 'includes-any':
      return Array.isArray(actual) && actual.some((entry) => targets.some((target) => matchesKeyword(entry, target)));
    case 'includes-all':
      return Array.isArray(actual) && targets.every((target) => actual.some((entry) => matchesKeyword(entry, target)));
    case 'is-true':
      return actual === true;
    case 'exists':
      return !isMissing(actual);
    default:
      return false;
  }
}

/** Loose keyword match so "computer science, b.s." satisfies a "computer science" rule. */
function matchesKeyword(actual: string, target: string): boolean {
  if (actual === target) return true;
  return actual.includes(target) || target.includes(actual);
}

function explain(rule: EligibilityRule, status: RuleStatus, actual: FieldValue): string {
  const fieldLabel = FIELD_LABELS[rule.field] ?? rule.field;
  if (status === 'unknown') {
    return `We need your ${fieldLabel} to confirm "${rule.label}".`;
  }
  const shown = formatValue(actual);
  if (status === 'met') {
    switch (rule.operator) {
      case 'gte':
        return `Your ${fieldLabel} of ${shown} meets the minimum of ${rule.value}.`;
      case 'lte':
        return `Your ${fieldLabel} of ${shown} is within the limit of ${rule.value}.`;
      case 'is-true':
        return `You indicated ${fieldLabel} applies to you, which this award requires.`;
      case 'exists':
        return `You have ${fieldLabel} on file (${shown}), which this award requires.`;
      case 'includes-any':
      case 'includes-all':
        return `Your ${fieldLabel} (${shown}) matches the requirement "${rule.label}".`;
      default:
        return `Your ${fieldLabel} is ${shown}, which satisfies "${rule.label}".`;
    }
  }
  switch (rule.operator) {
    case 'gte':
      return `This award requires ${rule.label}, but your ${fieldLabel} is ${shown}.`;
    case 'lte':
      return `This award caps ${fieldLabel} at ${rule.value}; yours is ${shown}.`;
    case 'is-true':
      return `This award is limited to applicants with ${fieldLabel}, which you did not indicate.`;
    default:
      return `This award requires ${rule.label}; your ${fieldLabel} is ${shown}.`;
  }
}

export function evaluateRule(rule: EligibilityRule, profile: StudentProfile): RuleEvaluation {
  const actual = getProfileValue(profile, rule.field);
  let status: RuleStatus;
  if (isMissing(actual) && rule.operator !== 'exists') {
    status = 'unknown';
  } else {
    status = compare(rule, actual) ? 'met' : 'not-met';
  }
  const evaluation: RuleEvaluation = {
    rule,
    status,
    explanation: explain(rule, status, actual),
  };
  if (actual !== undefined) evaluation.actual = actual;
  return evaluation;
}

export interface EligibilitySummary {
  evaluations: RuleEvaluation[];
  met: RuleEvaluation[];
  notMet: RuleEvaluation[];
  unknown: RuleEvaluation[];
  verdict: MatchVerdict;
  /** 0-100: how well the profile fits, independent of award size or effort. */
  fitScore: number;
  /** Share of rules we could actually evaluate, 0-1. */
  confidence: number;
}

export function evaluateEligibility(
  rules: EligibilityRule[],
  profile: StudentProfile,
): EligibilitySummary {
  const evaluations = rules.map((rule) => evaluateRule(rule, profile));
  const met = evaluations.filter((e) => e.status === 'met');
  const notMet = evaluations.filter((e) => e.status === 'not-met');
  const unknown = evaluations.filter((e) => e.status === 'unknown');

  const requiredNotMet = notMet.filter((e) => e.rule.weight === 'required');
  const requiredUnknown = unknown.filter((e) => e.rule.weight === 'required');

  let verdict: MatchVerdict;
  if (requiredNotMet.length > 0) verdict = 'not-eligible';
  else if (requiredUnknown.length > 0) verdict = 'needs-info';
  else if (unknown.length > 0) verdict = 'likely-eligible';
  else verdict = 'eligible';

  const fitScore = computeFitScore(evaluations, verdict);
  const confidence = evaluations.length === 0 ? 1 : (evaluations.length - unknown.length) / evaluations.length;

  return { evaluations, met, notMet, unknown, verdict, fitScore, confidence };
}

function computeFitScore(evaluations: RuleEvaluation[], verdict: MatchVerdict): number {
  if (verdict === 'not-eligible') return 0;
  if (evaluations.length === 0) return 70; // Open to all: a solid but unremarkable fit.

  // Required rules establish the baseline; preferred rules are the upside that
  // separates a merely eligible applicant from a competitive one.
  const required = evaluations.filter((e) => e.rule.weight === 'required');
  const preferred = evaluations.filter((e) => e.rule.weight === 'preferred');

  const requiredScore = required.length === 0
    ? 1
    : required.filter((e) => e.status === 'met').length / required.length;
  const preferredScore = preferred.length === 0
    ? 0.5
    : preferred.filter((e) => e.status === 'met').length / preferred.length;

  const raw = 100 * (0.65 * requiredScore + 0.35 * preferredScore);
  // Unresolved requirements shouldn't look like a confirmed match.
  const unknownPenalty = evaluations.filter((e) => e.status === 'unknown').length * 4;
  return Math.max(0, Math.min(100, Math.round(raw - unknownPenalty)));
}
