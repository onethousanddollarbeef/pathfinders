import { createEmptyProfile } from '@/core/profile';
import type { Scholarship, StudentProfile } from '@/core/types';

/** Fixed clock so deadline math in tests never depends on the wall clock. */
export const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

export function makeProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  const base = createEmptyProfile(NOW);
  return {
    ...base,
    firstName: 'Maya',
    lastName: 'Okafor',
    email: 'maya@example.com',
    state: 'CA',
    citizenship: 'us-citizen',
    ...overrides,
    academics: { ...base.academics, level: 'high-school-senior', gpa: 3.6, ...(overrides.academics ?? {}) },
    financials: { ...base.financials, ...(overrides.financials ?? {}) },
    demographics: { ...base.demographics, ...(overrides.demographics ?? {}) },
  };
}

export function makeScholarship(overrides: Partial<Scholarship> = {}): Scholarship {
  return {
    id: 'test-1',
    name: 'Test Award',
    sponsor: 'Test Sponsor',
    url: 'https://example.org/test',
    amountMin: 5000,
    amountMax: 5000,
    renewable: false,
    numberOfAwards: 10,
    estimatedApplicants: 1000,
    deadline: '2026-03-01',
    recurring: false,
    categories: ['merit'],
    description: 'A test award.',
    eligibility: [],
    requirements: {
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
    },
    states: [],
    tags: [],
    ...overrides,
  };
}
