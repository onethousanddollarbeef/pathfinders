import { describe, expect, it } from 'vitest';
import { createTrackedApplication, progress, resolveDeadline, setStatus, toggleTask, trackerStats } from '@/core/tracker';
import { makeProfile, makeScholarship, NOW } from './helpers';

const scholarship = makeScholarship({
  deadline: '2026-01-18',
  requirements: {
    ...makeScholarship().requirements,
    essayCount: 1,
    essayWordCounts: [500],
    essayTopics: ['leadership'],
    recommendationLetters: 1,
  },
});

describe('createTrackedApplication', () => {
  it('starts as saved with a generated checklist', () => {
    const application = createTrackedApplication(scholarship, makeProfile(), NOW);
    expect(application.status).toBe('saved');
    expect(application.savedAt).toBe(NOW);
    expect(application.tasks.length).toBeGreaterThan(2);
    expect(application.tasks.every((task) => !task.done)).toBe(true);
  });
});

describe('setStatus', () => {
  it('stamps the start time once and keeps it', () => {
    const saved = createTrackedApplication(scholarship, makeProfile(), NOW);
    const started = setStatus(saved, 'started', NOW);
    const again = setStatus(started, 'started', NOW + 10000);
    expect(started.startedAt).toBe(NOW);
    expect(again.startedAt).toBe(NOW);
  });

  it('completes the checklist on submit', () => {
    const submitted = setStatus(createTrackedApplication(scholarship, makeProfile(), NOW), 'submitted', NOW);
    expect(submitted.submittedAt).toBe(NOW);
    expect(submitted.startedAt).toBe(NOW);
    expect(submitted.tasks.every((task) => task.done)).toBe(true);
    expect(progress(submitted)).toBe(1);
  });

  it('records the amount won', () => {
    const submitted = setStatus(createTrackedApplication(scholarship, makeProfile(), NOW), 'submitted', NOW);
    const awarded = setStatus(submitted, 'awarded', NOW, 4200);
    expect(awarded.awardAmount).toBe(4200);
    expect(awarded.decidedAt).toBe(NOW);
  });

  it('does not mutate the original application', () => {
    const saved = createTrackedApplication(scholarship, makeProfile(), NOW);
    setStatus(saved, 'submitted', NOW);
    expect(saved.status).toBe('saved');
  });
});

describe('toggleTask', () => {
  it('promotes a saved application to started on the first checked task', () => {
    const saved = createTrackedApplication(scholarship, makeProfile(), NOW);
    const updated = toggleTask(saved, saved.tasks[0].id, NOW);
    expect(updated.status).toBe('started');
    expect(updated.tasks[0].done).toBe(true);
  });

  it('unchecking is reversible and leaves the status alone', () => {
    const saved = createTrackedApplication(scholarship, makeProfile(), NOW);
    const checked = toggleTask(saved, saved.tasks[0].id, NOW);
    const unchecked = toggleTask(checked, saved.tasks[0].id, NOW);
    expect(unchecked.tasks[0].done).toBe(false);
    expect(unchecked.status).toBe('started');
  });
});

describe('progress', () => {
  it('weighs progress by estimated hours rather than task count', () => {
    const saved = createTrackedApplication(scholarship, makeProfile(), NOW);
    const heaviest = [...saved.tasks].sort((a, b) => b.estimatedHours - a.estimatedHours)[0];
    const lightest = [...saved.tasks].sort((a, b) => a.estimatedHours - b.estimatedHours)[0];
    expect(progress(toggleTask(saved, heaviest.id))).toBeGreaterThan(progress(toggleTask(saved, lightest.id)));
  });
});

describe('resolveDeadline', () => {
  it('agrees with Discover by rolling a passed annual deadline forward', () => {
    const annual = makeScholarship({ deadline: '2025-03-01', recurring: true });
    const application = createTrackedApplication(annual, makeProfile(), NOW);
    expect(resolveDeadline(application, annual, NOW)).toBe('2026-03-01');
  });

  it('leaves a one-off deadline in the past so it reads as missed', () => {
    const once = makeScholarship({ deadline: '2025-03-01', recurring: false });
    const application = createTrackedApplication(once, makeProfile(), NOW);
    expect(resolveDeadline(application, once, NOW)).toBe('2025-03-01');
  });

  it('lets a student-entered date win', () => {
    const annual = makeScholarship({ deadline: '2025-03-01', recurring: true });
    const application = { ...createTrackedApplication(annual, makeProfile(), NOW), deadlineOverride: '2026-05-09' };
    expect(resolveDeadline(application, annual, NOW)).toBe('2026-05-09');
  });

  it('does not report a recurring award as overdue', () => {
    const annual = makeScholarship({ deadline: '2025-03-01', recurring: true });
    const stats = trackerStats([createTrackedApplication(annual, makeProfile(), NOW)], [annual], NOW);
    expect(stats.overdue).toHaveLength(0);
  });
});

describe('trackerStats', () => {
  it('counts the pipeline, money and hours', () => {
    const profile = makeProfile();
    const saved = createTrackedApplication(scholarship, profile, NOW);
    const submitted = setStatus(createTrackedApplication(makeScholarship({ id: 'b' }), profile, NOW), 'submitted', NOW);
    const awarded = setStatus(
      setStatus(createTrackedApplication(makeScholarship({ id: 'c' }), profile, NOW), 'submitted', NOW),
      'awarded',
      NOW,
      3000,
    );

    const stats = trackerStats(
      [saved, submitted, awarded],
      [scholarship, makeScholarship({ id: 'b' }), makeScholarship({ id: 'c' })],
      NOW,
    );

    expect(stats.saved).toBe(1);
    expect(stats.submitted).toBe(1);
    expect(stats.awarded).toBe(1);
    expect(stats.wonValue).toBe(3000);
    expect(stats.pendingValue).toBe(5000);
    expect(stats.hoursRemaining).toBeGreaterThan(0);
    expect(stats.hoursInvested).toBeGreaterThan(0);
  });

  it('surfaces deadlines that are close and ones already missed', () => {
    const profile = makeProfile();
    const dueSoon = createTrackedApplication(scholarship, profile, NOW);
    const late = createTrackedApplication(makeScholarship({ id: 'late', deadline: '2026-01-01' }), profile, NOW);
    const stats = trackerStats([dueSoon, late], [scholarship, makeScholarship({ id: 'late', deadline: '2026-01-01' })], NOW);

    expect(stats.dueSoon.map((entry) => entry.scholarship.id)).toEqual(['test-1']);
    expect(stats.dueSoon[0].days).toBe(3);
    expect(stats.overdue.map((entry) => entry.scholarship.id)).toEqual(['late']);
  });

  it('honors a deadline the student corrected by hand', () => {
    const profile = makeProfile();
    const application = { ...createTrackedApplication(scholarship, profile, NOW), deadlineOverride: '2026-06-01' };
    const stats = trackerStats([application], [scholarship], NOW);
    expect(stats.dueSoon).toHaveLength(0);
  });
});
