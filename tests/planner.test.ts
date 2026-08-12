import { describe, expect, it } from 'vitest';
import { buildPlan, generateTasks } from '@/core/planner';
import { matchAll, matchScholarship } from '@/core/matching';
import { createTrackedApplication, setStatus } from '@/core/tracker';
import { SEED_SCHOLARSHIPS } from '@/data/scholarships';
import { makeProfile, makeScholarship, NOW } from './helpers';

const bigEssayRequirements = {
  ...makeScholarship().requirements,
  essayCount: 3,
  essayWordCounts: [1500, 1500, 1500],
  essayTopics: ['a', 'b', 'c'],
  recommendationLetters: 3,
  interviewRequired: true,
  portfolioRequired: true,
};

describe('buildPlan', () => {
  const profile = makeProfile({ weeklyHoursAvailable: 5 });

  it('ranks by value per hour and numbers the items', () => {
    const matches = matchAll(SEED_SCHOLARSHIPS, profile, NOW);
    const plan = buildPlan(matches, profile, [], { now: NOW });
    expect(plan.items[0].rank).toBe(1);
    expect(plan.items.length).toBeGreaterThan(0);
    for (let i = 1; i < plan.items.length; i += 1) {
      expect(plan.items[i].rank).toBe(i + 1);
    }
  });

  it('marks work that cannot fit before the deadline as not feasible', () => {
    const impossible = matchScholarship(
      makeScholarship({ deadline: '2026-01-17', requirements: bigEssayRequirements }),
      profile,
      NOW,
    );
    const plan = buildPlan([impossible], profile, [], { now: NOW });
    expect(plan.items[0].bucket).toBe('skip');
    expect(plan.items[0].rationale).toContain('Not feasible');
    expect(plan.warnings.join(' ')).toContain("can't realistically be finished");
  });

  it('puts an imminent, doable award in the do-now bucket', () => {
    const urgent = matchScholarship(makeScholarship({ deadline: '2026-01-22' }), profile, NOW);
    const plan = buildPlan([urgent], profile, [], { now: NOW });
    expect(plan.items[0].bucket).toBe('do-now');
    expect(plan.items[0].rationale).toContain('start today');
  });

  it('excludes anything already submitted or skipped', () => {
    const scholarship = makeScholarship();
    const match = matchScholarship(scholarship, profile, NOW);
    const submitted = setStatus(createTrackedApplication(scholarship, profile, NOW), 'submitted', NOW);
    const plan = buildPlan([match], profile, [submitted], { now: NOW });
    expect(plan.items).toHaveLength(0);
  });

  it('prioritizes an application that is already in progress', () => {
    const started = makeScholarship({ id: 'started', deadline: '2026-03-01' });
    const fresh = makeScholarship({ id: 'fresh', deadline: '2026-03-01' });
    const matches = matchAll([started, fresh], profile, NOW);
    const tracked = setStatus(createTrackedApplication(started, profile, NOW), 'started', NOW);
    const plan = buildPlan(matches, profile, [tracked], { now: NOW });
    expect(plan.items[0].match.scholarship.id).toBe('started');
  });

  it('respects a weekly-hours override when scheduling', () => {
    const matches = matchAll(SEED_SCHOLARSHIPS, profile, NOW);
    const light = buildPlan(matches, profile, [], { now: NOW, weeklyHours: 2 });
    const heavy = buildPlan(matches, profile, [], { now: NOW, weeklyHours: 20 });
    const scheduled = (plan: typeof light) => plan.items.reduce((sum, item) => sum + item.scheduledHours, 0);
    expect(scheduled(light)).toBeLessThanOrEqual(2);
    expect(scheduled(heavy)).toBeGreaterThan(scheduled(light));
    expect(light.weeklyHours).toBe(2);
  });

  it('warns when the funding goal is out of reach', () => {
    const goalProfile = makeProfile({ fundingGoal: 500000 });
    const plan = buildPlan(matchAll(SEED_SCHOLARSHIPS, goalProfile, NOW), goalProfile, [], { now: NOW });
    expect(plan.warnings.join(' ')).toContain('below your $500,000 goal');
  });

  it('suggests a start date with slack before the deadline', () => {
    const match = matchScholarship(makeScholarship({ deadline: '2026-06-01' }), profile, NOW);
    const plan = buildPlan([match], profile, [], { now: NOW });
    expect(plan.items[0].suggestedStartDate < '2026-06-01').toBe(true);
  });

  it('totals only the work it actually expects to be done', () => {
    const matches = matchAll(SEED_SCHOLARSHIPS, profile, NOW);
    const plan = buildPlan(matches, profile, [], { now: NOW });
    const activeHours = plan.items
      .filter((item) => item.bucket !== 'skip')
      .reduce((sum, item) => sum + item.match.effort.hours, 0);
    expect(plan.totalHours).toBeCloseTo(activeHours, 1);
    expect(plan.expectedAward).toBeLessThan(plan.totalPotentialAward);
  });
});

describe('generateTasks', () => {
  it('schedules long-lead items before short ones', () => {
    const scholarship = makeScholarship({
      deadline: '2026-04-01',
      requirements: {
        ...makeScholarship().requirements,
        essayCount: 1,
        essayWordCounts: [600],
        essayTopics: ['leadership'],
        recommendationLetters: 2,
        transcriptRequired: true,
      },
    });
    const tasks = generateTasks(scholarship, makeProfile(), NOW);
    const recommender = tasks.find((task) => task.label.includes('recommender'));
    const submit = tasks.find((task) => task.label.includes('submit'));
    expect(recommender?.dueDate).toBeDefined();
    expect(submit?.dueDate).toBeDefined();
    expect(recommender!.dueDate! < submit!.dueDate!).toBe(true);
    expect(tasks.at(-1)?.label).toContain('Proofread');
  });

  it('does not ask for a FAFSA the student already filed', () => {
    const scholarship = makeScholarship({
      requirements: { ...makeScholarship().requirements, fafsaRequired: true },
    });
    const withFafsa = generateTasks(scholarship, makeProfile({ financials: { fafsaFiled: true } }), NOW);
    const withoutFafsa = generateTasks(scholarship, makeProfile(), NOW);
    expect(withFafsa.some((task) => task.label.includes('FAFSA'))).toBe(false);
    expect(withoutFafsa.some((task) => task.label.includes('FAFSA'))).toBe(true);
  });

  it('always ends with a form and a proofread step', () => {
    const tasks = generateTasks(makeScholarship(), makeProfile(), NOW);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].label).toContain('application form');
  });
});
