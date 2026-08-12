import { beforeEach, describe, expect, it } from 'vitest';
import { __resetMemoryStore, defaultState, loadState, migrateState, saveState } from '@/core/storage';
import { effectiveDeadline, daysUntil, formatDeadline } from '@/core/dates';
import { findHighImpactGaps, profileCompleteness } from '@/core/profile';
import { SEED_SCHOLARSHIPS } from '@/data/scholarships';
import { makeProfile, NOW } from './helpers';

beforeEach(() => __resetMemoryStore());

describe('storage', () => {
  it('round-trips state through the store', async () => {
    const state = defaultState(NOW);
    state.profile.firstName = 'Maya';
    await saveState(state);
    expect((await loadState()).profile.firstName).toBe('Maya');
  });

  it('returns a usable default when nothing is stored', async () => {
    const state = await loadState();
    expect(state.applications).toEqual([]);
    expect(state.settings.autofillEnabled).toBe(true);
  });

  it('backfills fields missing from older saved state', () => {
    const migrated = migrateState({ profile: { firstName: 'Sam' } as never });
    expect(migrated.profile.firstName).toBe('Sam');
    expect(migrated.profile.activities).toEqual([]);
    expect(migrated.settings.comparisonIds).toEqual([]);
    expect(migrated.profile.weeklyHoursAvailable).toBeGreaterThan(0);
  });
});

describe('dates', () => {
  it('counts whole days to a deadline', () => {
    expect(daysUntil('2026-01-20', NOW)).toBe(5);
    expect(daysUntil('2026-01-15', NOW)).toBe(0);
    expect(daysUntil('2026-01-10', NOW)).toBe(-5);
  });

  it('rolls a recurring deadline forward but leaves one-offs alone', () => {
    expect(effectiveDeadline('2025-03-01', true, NOW)).toBe('2026-03-01');
    expect(effectiveDeadline('2025-03-01', false, NOW)).toBe('2025-03-01');
    expect(effectiveDeadline('2026-06-01', true, NOW)).toBe('2026-06-01');
  });

  it('formats deadlines the way a student reads them', () => {
    expect(formatDeadline('2026-01-15', NOW)).toContain('today');
    expect(formatDeadline('2026-01-16', NOW)).toContain('tomorrow');
    expect(formatDeadline('2026-02-01', NOW)).toContain('17 days');
    expect(formatDeadline('2026-01-01', NOW)).toContain('closed');
  });
});

describe('profile completeness', () => {
  it('grows as fields are answered', () => {
    const sparse = profileCompleteness(makeProfile({ firstName: undefined, lastName: undefined, state: undefined }));
    const full = profileCompleteness(
      makeProfile({
        financials: { householdIncome: 40000, pellEligible: true, fafsaFiled: true },
        demographics: { firstGeneration: true },
        interests: ['robotics'],
        activities: [{ id: 'a', name: 'Robotics club' }],
        essays: [{ id: 'e', title: 'x', topic: 'leadership', wordCount: 500, updatedAt: NOW }],
        academics: { level: 'high-school-senior', gpa: 3.6, intendedMajors: ['cs'], graduationYear: 2026, satTotal: 1380 },
      }),
    );
    expect(full.percent).toBeGreaterThan(sparse.percent);
    expect(full.missing.length).toBeLessThan(sparse.missing.length);
  });

  it('ranks the unanswered fields by the money they gate', () => {
    const gaps = findHighImpactGaps(makeProfile(), SEED_SCHOLARSHIPS);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].blockedValue).toBeGreaterThanOrEqual(gaps[gaps.length - 1].blockedValue);
    expect(gaps.every((gap) => gap.blockedCount > 0)).toBe(true);
  });

  it('has nothing to ask about once every rule can be evaluated', () => {
    const complete = makeProfile({
      academics: { level: 'high-school-senior', gpa: 3.6, intendedMajors: ['computer science'], enrollment: 'full-time', satTotal: 1400 },
      financials: { householdIncome: 50000, pellEligible: true, fafsaFiled: true },
      demographics: { firstGeneration: true, ethnicities: ['black'], gender: 'female', militaryAffiliation: ['none'], disability: false, lgbtq: false },
      interests: ['environment'],
      activities: [{ id: 'a', name: 'Volunteer' }],
    });
    expect(findHighImpactGaps(complete, SEED_SCHOLARSHIPS)).toEqual([]);
  });
});
