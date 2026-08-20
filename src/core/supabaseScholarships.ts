import type { ApplicationRequirements, EligibilityRule, Scholarship, ScholarshipCategory } from './types';
import { REAL_SCHOLARSHIP_URL_OVERRIDES } from '../data/realScholarshipUrls';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase';

export interface SupabaseScholarshipRow {
  id: string;
  title: string;
  description: string;
  award_amount: number;
  deadline: string;
  eligibility: string | null;
  requirements: string | null;
  provider: string;
  application_url: string;
  min_gpa: number | null;
  majors: string[] | null;
  grade_levels: string[] | null;
  demographics: string[] | null;
  states: string[] | null;
  first_gen_required: boolean;
  fafsa_required: boolean;
  effort_level: string | null;
}

function emptyRequirements(): ApplicationRequirements {
  return {
    essayCount: 0,
    essayWordCounts: [],
    essayTopics: [],
    recommendationLetters: 0,
    transcriptRequired: false,
    fafsaRequired: false,
    portfolioRequired: false,
    interviewRequired: false,
    videoRequired: false,
    otherRequirements: [],
  };
}

function inferCategories(row: SupabaseScholarshipRow): ScholarshipCategory[] {
  const categories: ScholarshipCategory[] = [];
  if (row.first_gen_required) categories.push('need');
  if ((row.majors ?? []).some((major) => /engineer|computer|math|physics|biology|chemistry/i.test(major))) {
    categories.push('field-of-study');
  }
  if ((row.demographics ?? []).length > 0) categories.push('identity');
  if ((row.states ?? []).length > 0) categories.push('local');
  if (categories.length === 0) categories.push('merit');
  return categories;
}

function buildEligibility(row: SupabaseScholarshipRow): EligibilityRule[] {
  const rules: EligibilityRule[] = [];
  if (row.min_gpa != null) {
    rules.push({
      id: `gpa-${row.min_gpa}`,
      field: 'academics.gpa',
      operator: 'gte',
      value: row.min_gpa,
      label: `${row.min_gpa.toFixed(1)} GPA or higher`,
      weight: 'required',
    });
  }
  if (row.first_gen_required) {
    rules.push({
      id: 'first-gen',
      field: 'demographics.firstGeneration',
      operator: 'is-true',
      value: true,
      label: 'First-generation college student',
      weight: 'required',
    });
  }
  if (row.fafsa_required) {
    rules.push({
      id: 'fafsa',
      field: 'financials.fafsaFiled',
      operator: 'is-true',
      value: true,
      label: 'FAFSA filed',
      weight: 'required',
    });
  }
  if ((row.majors ?? []).length > 0) {
    rules.push({
      id: `major-${row.id}`,
      field: 'academics.intendedMajors',
      operator: 'includes-any',
      value: row.majors ?? [],
      label: `Studying ${(row.majors ?? []).join(', ')}`,
      weight: 'required',
    });
  }
  if ((row.states ?? []).length > 0) {
    rules.push({
      id: `state-${row.id}`,
      field: 'state',
      operator: 'in',
      value: row.states ?? [],
      label: `Resident of ${(row.states ?? []).join(' or ')}`,
      weight: 'required',
    });
  }
  return rules;
}

function resolveApplicationUrl(row: SupabaseScholarshipRow): string {
  const override = REAL_SCHOLARSHIP_URL_OVERRIDES[row.id];
  if (override) return override;
  if (row.application_url && !row.application_url.includes('example.org')) return row.application_url;
  return row.application_url;
}

export function mapSupabaseScholarship(row: SupabaseScholarshipRow): Scholarship {
  const requirements = emptyRequirements();
  requirements.fafsaRequired = row.fafsa_required;
  if (row.requirements) {
    const lower = row.requirements.toLowerCase();
    if (lower.includes('essay')) requirements.essayCount = 1;
    if (lower.includes('recommendation')) requirements.recommendationLetters = 1;
    if (lower.includes('transcript')) requirements.transcriptRequired = true;
    if (row.requirements) requirements.otherRequirements = [row.requirements];
  }
  if (row.effort_level === 'High') {
    requirements.essayCount = Math.max(requirements.essayCount, 2);
    requirements.recommendationLetters = Math.max(requirements.recommendationLetters, 2);
  }

  return {
    id: row.id,
    name: row.title,
    sponsor: row.provider,
    url: resolveApplicationUrl(row),
    amountMin: row.award_amount,
    amountMax: row.award_amount,
    renewable: false,
    deadline: row.deadline,
    recurring: true,
    categories: inferCategories(row),
    description: row.description,
    eligibility: buildEligibility(row),
    requirements,
    states: (row.states ?? []).map((state) => state.length === 2 ? state : state),
    tags: row.demographics ?? [],
    source: 'seed',
  };
}

export async function fetchCatalogScholarships(): Promise<Scholarship[]> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/scholarships?select=*&order=deadline.asc`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Could not load scholarships (${response.status})`);
  }
  const rows = (await response.json()) as SupabaseScholarshipRow[];
  return rows.map(mapSupabaseScholarship);
}
