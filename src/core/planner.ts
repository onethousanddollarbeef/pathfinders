/**
 * The planner turns a pile of matches into an ordered "do this next" list.
 *
 * Ranking is expected dollars per hour, adjusted for deadline urgency and for
 * whether the application can physically be finished in the time remaining at
 * the student's stated weekly capacity.
 */

import { addDays, daysUntil, parseDate, toISODate } from './dates';
import { estimateEffort } from './effort';
import type {
  ApplicationTask,
  MatchResult,
  Plan,
  PlanItem,
  Scholarship,
  StudentProfile,
  TrackedApplication,
} from './types';

/** Deadlines this close get priority even at a lower dollars-per-hour rate. */
function urgencyMultiplier(days: number): number {
  if (days <= 3) return 1.8;
  if (days <= 7) return 1.6;
  if (days <= 14) return 1.35;
  if (days <= 30) return 1.15;
  if (days <= 60) return 1;
  return 0.85;
}

function hoursAvailableBefore(days: number, weeklyHours: number): number {
  // Reserve the final day for submission itself.
  return Math.max(0, ((days - 1) / 7) * weeklyHours);
}

export interface PlannerOptions {
  now?: number;
  /** Overrides `profile.weeklyHoursAvailable` when the student explores scenarios. */
  weeklyHours?: number;
  /** Cap on how many applications to actively plan. */
  maxItems?: number;
}

export function buildPlan(
  matches: MatchResult[],
  profile: StudentProfile,
  tracked: TrackedApplication[] = [],
  options: PlannerOptions = {},
): Plan {
  const now = options.now ?? Date.now();
  const weeklyHours = Math.max(1, options.weeklyHours ?? profile.weeklyHoursAvailable ?? 5);
  const maxItems = options.maxItems ?? 25;
  const trackedById = new Map(tracked.map((entry) => [entry.scholarshipId, entry]));
  const warnings: string[] = [];

  const candidates = matches.filter((match) => {
    const entry = trackedById.get(match.scholarship.id);
    if (entry && ['submitted', 'awarded', 'rejected', 'skipped'].includes(entry.status)) return false;
    if (match.verdict === 'not-eligible') return false;
    return match.daysUntilDeadline >= 0;
  });

  const scored = candidates
    .map((match) => {
      const capacity = hoursAvailableBefore(match.daysUntilDeadline, weeklyHours);
      const tracked = trackedById.get(match.scholarship.id);
      // Work already logged reduces what is left to do.
      const doneHours = tracked
        ? tracked.tasks.filter((task) => task.done).reduce((sum, task) => sum + task.estimatedHours, 0)
        : 0;
      const remainingHours = Math.max(0.25, match.effort.hours - doneHours);
      const feasible = remainingHours <= capacity;
      // Something already started carries sunk effort worth finishing.
      const momentumBonus = tracked?.status === 'started' ? 1.25 : 1;
      const score =
        match.expectedValuePerHour *
        urgencyMultiplier(match.daysUntilDeadline) *
        (feasible ? 1 : 0.3) *
        momentumBonus;
      return { match, tracked, remainingHours, feasible, score };
    })
    .sort((a, b) => b.score - a.score);

  const items: PlanItem[] = [];
  let weekBudget = weeklyHours;
  let rank = 0;

  for (const entry of scored.slice(0, maxItems)) {
    rank += 1;
    const { match, feasible, remainingHours } = entry;
    const days = match.daysUntilDeadline;

    let bucket: PlanItem['bucket'];
    if (!feasible) bucket = 'skip';
    else if (days <= 10 || entry.tracked?.status === 'started') bucket = 'do-now';
    else if (weekBudget - remainingHours >= 0 && days <= 30) bucket = 'this-week';
    else if (match.expectedValuePerHour < 40 && match.verdict !== 'eligible') bucket = 'stretch';
    else bucket = 'upcoming';

    let scheduledHours = 0;
    if (bucket === 'do-now' || bucket === 'this-week') {
      scheduledHours = Math.min(remainingHours, Math.max(0, weekBudget));
      weekBudget -= scheduledHours;
    }

    items.push({
      match,
      tracked: entry.tracked,
      rank,
      bucket,
      rationale: buildRationale(match, bucket, remainingHours, weeklyHours),
      suggestedStartDate: suggestedStartDate(match, remainingHours, weeklyHours, now),
      scheduledHours: Number(scheduledHours.toFixed(2)),
    });
  }

  const active = items.filter((item) => item.bucket !== 'skip');
  const totalHours = Number(active.reduce((sum, item) => sum + item.match.effort.hours, 0).toFixed(1));
  const totalPotentialAward = active.reduce((sum, item) => sum + item.match.scholarship.amountMax, 0);
  const expectedAward = Math.round(active.reduce((sum, item) => sum + item.match.expectedValue, 0));

  const urgentHours = items
    .filter((item) => item.bucket === 'do-now')
    .reduce((sum, item) => sum + item.match.effort.hours, 0);
  if (urgentHours > weeklyHours) {
    warnings.push(
      `Your urgent applications need about ${urgentHours.toFixed(1)} hours but you have ${weeklyHours} hours this week. Consider dropping the lowest value-per-hour item.`,
    );
  }
  const skipped = items.filter((item) => item.bucket === 'skip');
  if (skipped.length > 0) {
    warnings.push(
      `${skipped.length} match(es) can't realistically be finished before their deadline at ${weeklyHours} hrs/week.`,
    );
  }
  const needsInfo = matches.filter((match) => match.verdict === 'needs-info').length;
  if (needsInfo > 0) {
    warnings.push(`${needsInfo} scholarship(s) can't be confirmed until you fill in a few more profile fields.`);
  }
  if (profile.fundingGoal && expectedAward < profile.fundingGoal) {
    warnings.push(
      `This plan's expected award (~$${expectedAward.toLocaleString()}) is below your $${profile.fundingGoal.toLocaleString()} goal. Add more matches or widen your filters.`,
    );
  }

  return {
    generatedAt: now,
    items,
    totalHours,
    totalPotentialAward,
    expectedAward,
    weeklyHours,
    warnings,
  };
}

function buildRationale(
  match: MatchResult,
  bucket: PlanItem['bucket'],
  remainingHours: number,
  weeklyHours: number,
): string {
  const rate = `$${match.expectedValuePerHour.toLocaleString()}/hr expected`;
  const time = `${remainingHours.toFixed(1)} hrs of work left`;
  const due = match.daysUntilDeadline === 0 ? 'due today' : `due in ${match.daysUntilDeadline} days`;
  switch (bucket) {
    case 'do-now':
      return `${due} — start today. ${rate}, ${time}.`;
    case 'this-week':
      return `Strong return (${rate}) and it fits in this week's ${weeklyHours} hrs. ${due}.`;
    case 'upcoming':
      return `Worth doing (${rate}) but not urgent — ${due}. Block time once closer items are submitted.`;
    case 'stretch':
      return `Lower priority: ${rate} with unconfirmed eligibility. Do it only if you have time left.`;
    case 'skip':
    default:
      return `Not feasible: needs ${remainingHours.toFixed(1)} hrs but only ${match.daysUntilDeadline} day(s) remain at ${weeklyHours} hrs/week.`;
  }
}

function suggestedStartDate(
  match: MatchResult,
  remainingHours: number,
  weeklyHours: number,
  now: number,
): string {
  const deadline = parseDate(match.scholarship.deadline);
  const daysOfWork = Math.ceil((remainingHours / Math.max(1, weeklyHours)) * 7);
  // Two days of slack so a submission portal outage isn't fatal.
  const start = addDays(deadline, -(daysOfWork + 2));
  const today = new Date(now);
  return toISODate(start.getTime() < today.getTime() ? today : start);
}

// ---------------------------------------------------------------------------
// Task generation
// ---------------------------------------------------------------------------

/**
 * Breaks an application into checklist items with staggered due dates, working
 * backwards from the deadline so long-lead items (letters) come first.
 */
export function generateTasks(
  scholarship: Scholarship,
  profile: StudentProfile,
  now: number = Date.now(),
): ApplicationTask[] {
  const effort = estimateEffort(scholarship, profile);
  const requirements = scholarship.requirements;
  const totalDays = Math.max(1, daysUntil(scholarship.deadline, now));
  const deadline = parseDate(scholarship.deadline);

  const specs: { label: string; hours: number; leadDays: number }[] = [];

  if (requirements.recommendationLetters > 0) {
    specs.push({
      label: `Ask ${requirements.recommendationLetters} recommender(s) — give them at least 2 weeks`,
      hours: requirements.recommendationLetters * 0.4,
      leadDays: Math.min(totalDays, 21),
    });
  }
  if (requirements.transcriptRequired) {
    specs.push({ label: 'Request official transcript', hours: 0.3, leadDays: Math.min(totalDays, 14) });
  }
  if (requirements.fafsaRequired && profile.financials?.fafsaFiled !== true) {
    specs.push({ label: 'Complete and submit the FAFSA', hours: 2, leadDays: Math.min(totalDays, 14) });
  }

  const essayCount = Math.max(requirements.essayCount, requirements.essayWordCounts.length);
  for (let index = 0; index < essayCount; index += 1) {
    const words = requirements.essayWordCounts[index] ?? 500;
    const topic = requirements.essayTopics[index] ?? 'general';
    const reused = effort.reusableEssayIds.length > index;
    specs.push({
      label: reused
        ? `Adapt an existing essay for the ${topic} prompt (${words} words)`
        : `Draft the ${topic} essay (${words} words)`,
      hours: effort.breakdown.find((b) => b.label.includes(topic))?.hours ?? 2,
      leadDays: Math.min(totalDays, Math.round(10 - index * 2)),
    });
  }

  if (requirements.portfolioRequired) {
    specs.push({ label: 'Assemble and upload portfolio', hours: 5, leadDays: Math.min(totalDays, 10) });
  }
  if (requirements.videoRequired) {
    specs.push({ label: 'Record and edit video submission', hours: 3, leadDays: Math.min(totalDays, 10) });
  }
  for (const other of requirements.otherRequirements) {
    specs.push({ label: other, hours: 0.35, leadDays: Math.min(totalDays, 7) });
  }
  if (requirements.interviewRequired) {
    specs.push({ label: 'Prepare for the interview round', hours: 2.5, leadDays: Math.min(totalDays, 5) });
  }

  specs.push({ label: 'Fill out the application form', hours: 0.75, leadDays: Math.min(totalDays, 4) });
  specs.push({ label: 'Proofread everything and submit', hours: 0.5, leadDays: Math.min(totalDays, 2) });

  return specs.map((spec, index) => ({
    id: `${scholarship.id}-task-${index}`,
    label: spec.label,
    done: false,
    dueDate: toISODate(addDays(deadline, -spec.leadDays)),
    estimatedHours: Number(spec.hours.toFixed(2)),
  }));
}
