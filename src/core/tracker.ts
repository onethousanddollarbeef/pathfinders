/**
 * Application tracking: saved → started → submitted → decided.
 *
 * All transitions are pure functions returning new objects so the side panel can
 * treat tracker state as immutable and persist it with a single write.
 */

import { daysUntil } from './dates';
import { generateTasks } from './planner';
import { averageAward } from './matching';
import type {
  ApplicationStatus,
  Scholarship,
  StudentProfile,
  TrackedApplication,
} from './types';

export const STATUS_ORDER: ApplicationStatus[] = ['saved', 'started', 'submitted', 'awarded', 'rejected', 'skipped'];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  started: 'In progress',
  submitted: 'Submitted',
  awarded: 'Awarded',
  rejected: 'Not selected',
  skipped: 'Skipped',
};

export function createTrackedApplication(
  scholarship: Scholarship,
  profile: StudentProfile,
  now: number = Date.now(),
): TrackedApplication {
  return {
    scholarshipId: scholarship.id,
    status: 'saved',
    savedAt: now,
    notes: '',
    tasks: generateTasks(scholarship, profile, now),
  };
}

export function setStatus(
  application: TrackedApplication,
  status: ApplicationStatus,
  now: number = Date.now(),
  awardAmount?: number,
): TrackedApplication {
  const next: TrackedApplication = { ...application, status };
  if (status === 'started' && !next.startedAt) next.startedAt = now;
  if (status === 'submitted') {
    next.submittedAt = now;
    if (!next.startedAt) next.startedAt = now;
    // Submitting implies the checklist is done; keep the record honest.
    next.tasks = next.tasks.map((task) => ({ ...task, done: true }));
  }
  if (status === 'awarded' || status === 'rejected') {
    next.decidedAt = now;
    if (!next.submittedAt) next.submittedAt = now;
  }
  if (status === 'awarded' && awardAmount !== undefined) next.awardAmount = awardAmount;
  return next;
}

export function toggleTask(
  application: TrackedApplication,
  taskId: string,
  now: number = Date.now(),
): TrackedApplication {
  const tasks = application.tasks.map((task) =>
    task.id === taskId ? { ...task, done: !task.done } : task,
  );
  const anyDone = tasks.some((task) => task.done);
  // Checking off the first task is the real signal that work has begun.
  const status: ApplicationStatus =
    application.status === 'saved' && anyDone ? 'started' : application.status;
  const next: TrackedApplication = { ...application, tasks, status };
  if (status === 'started' && !next.startedAt) next.startedAt = now;
  return next;
}

export function progress(application: TrackedApplication): number {
  if (application.status === 'submitted' || application.status === 'awarded' || application.status === 'rejected') {
    return 1;
  }
  if (application.tasks.length === 0) return application.status === 'started' ? 0.5 : 0;
  const doneHours = application.tasks.filter((t) => t.done).reduce((sum, t) => sum + t.estimatedHours, 0);
  const totalHours = application.tasks.reduce((sum, t) => sum + t.estimatedHours, 0);
  return totalHours === 0 ? 0 : Number((doneHours / totalHours).toFixed(2));
}

export interface TrackerStats {
  saved: number;
  started: number;
  submitted: number;
  awarded: number;
  rejected: number;
  skipped: number;
  /** Sum of average award value for everything submitted and still pending. */
  pendingValue: number;
  wonValue: number;
  hoursInvested: number;
  hoursRemaining: number;
  /** Applications closing in the next week that are not yet submitted. */
  dueSoon: { scholarship: Scholarship; application: TrackedApplication; days: number }[];
  overdue: { scholarship: Scholarship; application: TrackedApplication; days: number }[];
}

export function trackerStats(
  applications: TrackedApplication[],
  scholarships: Scholarship[],
  now: number = Date.now(),
): TrackerStats {
  const byId = new Map(scholarships.map((s) => [s.id, s]));
  const stats: TrackerStats = {
    saved: 0,
    started: 0,
    submitted: 0,
    awarded: 0,
    rejected: 0,
    skipped: 0,
    pendingValue: 0,
    wonValue: 0,
    hoursInvested: 0,
    hoursRemaining: 0,
    dueSoon: [],
    overdue: [],
  };

  for (const application of applications) {
    stats[application.status] += 1;
    const scholarship = byId.get(application.scholarshipId);
    const done = application.tasks.filter((t) => t.done);
    const pending = application.tasks.filter((t) => !t.done);
    stats.hoursInvested += done.reduce((sum, t) => sum + t.estimatedHours, 0);
    if (application.status === 'saved' || application.status === 'started') {
      stats.hoursRemaining += pending.reduce((sum, t) => sum + t.estimatedHours, 0);
    }
    if (!scholarship) continue;

    if (application.status === 'submitted') stats.pendingValue += averageAward(scholarship);
    if (application.status === 'awarded') stats.wonValue += application.awardAmount ?? averageAward(scholarship);

    if (application.status === 'saved' || application.status === 'started') {
      const deadline = application.deadlineOverride ?? scholarship.deadline;
      const days = daysUntil(deadline, now);
      if (days < 0) stats.overdue.push({ scholarship, application, days });
      else if (days <= 7) stats.dueSoon.push({ scholarship, application, days });
    }
  }

  stats.hoursInvested = Number(stats.hoursInvested.toFixed(1));
  stats.hoursRemaining = Number(stats.hoursRemaining.toFixed(1));
  stats.dueSoon.sort((a, b) => a.days - b.days);
  stats.overdue.sort((a, b) => a.days - b.days);
  return stats;
}
