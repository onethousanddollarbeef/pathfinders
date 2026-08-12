import { describe, expect, it } from 'vitest';
import {
  buildComparison,
  estimateWinProbability,
  filterMatches,
  matchAll,
  matchScholarship,
  sortMatches,
  totalAwardValue,
} from '@/core/matching';
import { SEED_SCHOLARSHIPS } from '@/data/scholarships';
import { makeProfile, makeScholarship, NOW } from './helpers';

describe('totalAwardValue', () => {
  it('multiplies renewable awards across their renewal window', () => {
    expect(totalAwardValue(makeScholarship({ renewable: true, renewableYears: 4 }))).toBe(20000);
  });

  it('uses the midpoint of a ranged award', () => {
    expect(totalAwardValue(makeScholarship({ amountMin: 2000, amountMax: 4000 }))).toBe(3000);
  });
});

describe('estimateWinProbability', () => {
  it('is zero when the student is not eligible', () => {
    expect(estimateWinProbability(makeScholarship(), 90, 'not-eligible')).toBe(0);
  });

  it('rises with fit', () => {
    const low = estimateWinProbability(makeScholarship(), 20, 'eligible');
    const high = estimateWinProbability(makeScholarship(), 95, 'eligible');
    expect(high).toBeGreaterThan(low);
  });

  it('discounts unconfirmed eligibility', () => {
    const confirmed = estimateWinProbability(makeScholarship(), 80, 'eligible');
    const unconfirmed = estimateWinProbability(makeScholarship(), 80, 'needs-info');
    expect(unconfirmed).toBeLessThan(confirmed);
  });

  it('stays inside plausible bounds even for a lottery-sized pool', () => {
    const longShot = makeScholarship({ numberOfAwards: 1, estimatedApplicants: 500000 });
    expect(estimateWinProbability(longShot, 100, 'eligible')).toBeGreaterThan(0);
    expect(estimateWinProbability(longShot, 100, 'eligible')).toBeLessThan(0.01);
  });

  it('gives far better odds on a small local pool than a national one', () => {
    const local = makeScholarship({ numberOfAwards: 10, estimatedApplicants: 90 });
    const national = makeScholarship({ numberOfAwards: 10, estimatedApplicants: 20000 });
    expect(estimateWinProbability(local, 80, 'eligible')).toBeGreaterThan(
      estimateWinProbability(national, 80, 'eligible') * 50,
    );
  });
});

describe('matchScholarship', () => {
  it('reports days remaining and value per hour', () => {
    const match = matchScholarship(makeScholarship({ deadline: '2026-02-14' }), makeProfile(), NOW);
    expect(match.daysUntilDeadline).toBe(30);
    expect(match.expectedValuePerHour).toBe(Math.round(match.expectedValue / match.effort.hours));
  });

  it('rolls a passed annual deadline forward to the next cycle', () => {
    const match = matchScholarship(
      makeScholarship({ deadline: '2025-11-01', recurring: true }),
      makeProfile(),
      NOW,
    );
    expect(match.scholarship.deadline).toBe('2026-11-01');
    expect(match.daysUntilDeadline).toBeGreaterThan(0);
  });

  it('separates met, failed and unknown requirements', () => {
    const scholarship = makeScholarship({
      eligibility: [
        { id: 'gpa', field: 'academics.gpa', operator: 'gte', value: 3.0, label: '3.0 GPA', weight: 'required' },
        { id: 'state', field: 'state', operator: 'in', value: ['NY'], label: 'New York resident', weight: 'required' },
        { id: 'pell', field: 'financials.pellEligible', operator: 'is-true', value: true, label: 'Pell eligible', weight: 'preferred' },
      ],
    });
    const match = matchScholarship(scholarship, makeProfile(), NOW);
    expect(match.reasonsQualified.map((r) => r.rule.id)).toEqual(['gpa']);
    expect(match.reasonsDisqualified.map((r) => r.rule.id)).toEqual(['state']);
    expect(match.missingInfo.map((r) => r.rule.id)).toEqual(['pell']);
    expect(match.verdict).toBe('not-eligible');
  });

  it('prefers a cheap fast award over an expensive slow one on value per hour', () => {
    const fast = matchScholarship(
      makeScholarship({ id: 'fast', amountMin: 1000, amountMax: 1000, numberOfAwards: 40, estimatedApplicants: 2000 }),
      makeProfile(),
      NOW,
    );
    const slow = matchScholarship(
      makeScholarship({
        id: 'slow',
        amountMin: 5000,
        amountMax: 5000,
        numberOfAwards: 5,
        estimatedApplicants: 20000,
        requirements: {
          ...makeScholarship().requirements,
          essayCount: 3,
          essayWordCounts: [1000, 1000, 1000],
          essayTopics: ['a', 'b', 'c'],
          recommendationLetters: 3,
          interviewRequired: true,
        },
      }),
      makeProfile(),
      NOW,
    );
    expect(fast.expectedValuePerHour).toBeGreaterThan(slow.expectedValuePerHour);
  });
});

describe('filterMatches', () => {
  const profile = makeProfile({
    academics: { level: 'high-school-senior', gpa: 3.6, intendedMajors: ['computer science'] },
  });
  const matches = matchAll(SEED_SCHOLARSHIPS, profile, NOW);

  it('hides ineligible awards by default and shows them on request', () => {
    const hidden = filterMatches(matches);
    const shown = filterMatches(matches, { includeIneligible: true });
    expect(hidden.every((match) => match.verdict !== 'not-eligible')).toBe(true);
    expect(shown.length).toBeGreaterThan(hidden.length);
  });

  it('filters by award floor, effort ceiling and deadline window', () => {
    const filtered = filterMatches(matches, { minAward: 5000, maxEffortHours: 6, withinDays: 400, includeIneligible: true });
    for (const match of filtered) {
      expect(match.scholarship.amountMax).toBeGreaterThanOrEqual(5000);
      expect(match.effort.hours).toBeLessThanOrEqual(6);
      expect(match.daysUntilDeadline).toBeLessThanOrEqual(400);
    }
  });

  it('searches names, sponsors and tags', () => {
    const results = filterMatches(matches, { query: 'nursing', includeIneligible: true });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].scholarship.name.toLowerCase()).toContain('nurse');
  });

  it('requires every search term to match', () => {
    expect(filterMatches(matches, { query: 'nursing zzzz', includeIneligible: true })).toHaveLength(0);
  });
});

describe('sortMatches', () => {
  const profile = makeProfile();
  const matches = matchAll(SEED_SCHOLARSHIPS, profile, NOW);

  it('sorts by each supported key', () => {
    const byAward = sortMatches(matches, 'award');
    expect(totalAwardValue(byAward[0].scholarship)).toBeGreaterThanOrEqual(totalAwardValue(byAward[1].scholarship));

    const byDeadline = sortMatches(matches, 'deadline');
    expect(byDeadline[0].daysUntilDeadline).toBeLessThanOrEqual(byDeadline[1].daysUntilDeadline);

    const byEffort = sortMatches(matches, 'effort');
    expect(byEffort[0].effort.hours).toBeLessThanOrEqual(byEffort[1].effort.hours);

    const byValue = sortMatches(matches, 'value-per-hour');
    expect(byValue[0].expectedValuePerHour).toBeGreaterThanOrEqual(byValue[1].expectedValuePerHour);
  });
});

describe('buildComparison', () => {
  it('marks the winning column per row, respecting direction', () => {
    const cheap = matchScholarship(makeScholarship({ id: 'a', amountMin: 1000, amountMax: 1000 }), makeProfile(), NOW);
    const rich = matchScholarship(makeScholarship({ id: 'b', amountMin: 9000, amountMax: 9000 }), makeProfile(), NOW);
    const rows = buildComparison([cheap, rich]);

    const award = rows.find((row) => row.key === 'award');
    expect(award?.bestIndexes).toEqual([1]);
    expect(award?.values).toEqual(['$1,000', '$9,000']);

    const deadline = rows.find((row) => row.key === 'deadline');
    expect(deadline?.bestIndexes).toEqual([0, 1]); // Same deadline: both win.
  });

  it('returns nothing to compare for an empty selection', () => {
    expect(buildComparison([])).toEqual([]);
  });
});
