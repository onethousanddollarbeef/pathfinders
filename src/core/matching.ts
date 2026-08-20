/**
 * Matching: joins a profile against the scholarship catalog and produces the
 * ranked, explained results the rest of the UI renders.
 */

import { daysUntil, effectiveDeadline } from './dates';
import { estimateEffort, readinessGaps } from './effort';
import { evaluateEligibility } from './eligibility';
import type { MatchResult, MatchVerdict, Scholarship, StudentProfile } from './types';

export function averageAward(scholarship: Scholarship): number {
  if (scholarship.amountUnknown) return 0;
  return Math.round((scholarship.amountMin + scholarship.amountMax) / 2);
}

/** Human-readable award string; shows TBD when the amount was not captured. */
export function formatAward(scholarship: Scholarship): string {
  if (scholarship.amountUnknown) return 'TBD';
  const value = totalAwardValue(scholarship);
  if (value <= 0 && scholarship.source === 'page-capture') return 'TBD';
  return `$${Math.round(value).toLocaleString()}`;
}

/** Renewable awards are worth their yearly value times the renewal window. */
export function totalAwardValue(scholarship: Scholarship): number {
  const yearly = averageAward(scholarship);
  if (!scholarship.renewable) return yearly;
  return yearly * Math.max(1, scholarship.renewableYears ?? 4);
}

/** Fallback pool size when a sponsor publishes no applicant numbers. */
function estimateApplicantPool(scholarship: Scholarship): number {
  const award = averageAward(scholarship);
  const local = scholarship.categories.includes('local') || scholarship.states.length > 0;
  let pool: number;
  if (award >= 20000) pool = 12000;
  else if (award >= 10000) pool = 7000;
  else if (award >= 5000) pool = 3500;
  else if (award >= 2500) pool = 1800;
  else if (award >= 1000) pool = 1000;
  else pool = 500;
  // A geographic restriction removes most of the field.
  if (local) pool = Math.round(pool * 0.15);
  // Every extra essay drives applicants away, which helps whoever stays.
  const essayDrag = 1 - Math.min(0.5, scholarship.requirements.essayCount * 0.15);
  return Math.max(25, Math.round(pool * essayDrag));
}

export function estimateWinProbability(
  scholarship: Scholarship,
  fitScore: number,
  verdict: MatchVerdict,
): number {
  if (verdict === 'not-eligible') return 0;
  const awards = Math.max(1, scholarship.numberOfAwards ?? 1);
  const applicants = Math.max(awards, scholarship.estimatedApplicants ?? estimateApplicantPool(scholarship));
  const baseRate = awards / applicants;
  // A stronger fit than the average applicant improves, but never guarantees, odds.
  const fitMultiplier = 0.5 + (fitScore / 100) * 1.2;
  // An unconfirmed eligibility answer could still disqualify the student.
  const confidenceMultiplier = verdict === 'needs-info' ? 0.75 : verdict === 'likely-eligible' ? 0.9 : 1;
  const probability = baseRate * fitMultiplier * confidenceMultiplier;
  return Math.min(0.85, Math.max(0.002, Number(probability.toFixed(4))));
}

export function matchScholarship(
  scholarship: Scholarship,
  profile: StudentProfile,
  now: number = Date.now(),
): MatchResult {
  const summary = evaluateEligibility(scholarship.eligibility, profile);
  const effort = estimateEffort(scholarship, profile);
  const winProbability = estimateWinProbability(scholarship, summary.fitScore, summary.verdict);
  const expectedValue = Math.round(totalAwardValue(scholarship) * winProbability);
  const expectedValuePerHour = Math.round(expectedValue / Math.max(0.25, effort.hours));
  const deadline = effectiveDeadline(scholarship.deadline, scholarship.recurring, now);

  return {
    scholarship: { ...scholarship, deadline },
    verdict: summary.verdict,
    fitScore: summary.fitScore,
    winProbability,
    effort,
    expectedValue,
    expectedValuePerHour,
    daysUntilDeadline: daysUntil(deadline, now),
    reasonsQualified: summary.met,
    reasonsDisqualified: summary.notMet,
    missingInfo: summary.unknown,
    readinessGaps: readinessGaps(scholarship.requirements, profile),
  };
}

export function matchAll(
  scholarships: Scholarship[],
  profile: StudentProfile,
  now: number = Date.now(),
): MatchResult[] {
  return scholarships.map((scholarship) => matchScholarship(scholarship, profile, now));
}

// ---------------------------------------------------------------------------
// Filtering and sorting for the Discover / Compare views
// ---------------------------------------------------------------------------

export type SortKey = 'value-per-hour' | 'award' | 'deadline' | 'fit' | 'effort' | 'odds';

export interface DiscoverFilters {
  query?: string;
  categories?: string[];
  minAward?: number;
  maxEffortHours?: number;
  /** Only include awards closing within this many days. */
  withinDays?: number;
  includeIneligible?: boolean;
  /** Hide awards whose deadline has already passed. */
  hideExpired?: boolean;
  sortBy?: SortKey;
}

function matchesQuery(result: MatchResult, query: string): boolean {
  const haystack = [
    result.scholarship.name,
    result.scholarship.sponsor,
    result.scholarship.description,
    ...result.scholarship.tags,
    ...result.scholarship.categories,
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function sortMatches(matches: MatchResult[], sortBy: SortKey = 'value-per-hour'): MatchResult[] {
  const sorted = [...matches];
  switch (sortBy) {
    case 'award':
      sorted.sort((a, b) => totalAwardValue(b.scholarship) - totalAwardValue(a.scholarship));
      break;
    case 'deadline':
      sorted.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline);
      break;
    case 'fit':
      sorted.sort((a, b) => b.fitScore - a.fitScore);
      break;
    case 'effort':
      sorted.sort((a, b) => a.effort.hours - b.effort.hours);
      break;
    case 'odds':
      sorted.sort((a, b) => b.winProbability - a.winProbability);
      break;
    case 'value-per-hour':
    default:
      sorted.sort((a, b) => b.expectedValuePerHour - a.expectedValuePerHour);
      break;
  }
  return sorted;
}

export function filterMatches(matches: MatchResult[], filters: DiscoverFilters = {}): MatchResult[] {
  const {
    query,
    categories,
    minAward,
    maxEffortHours,
    withinDays,
    includeIneligible = false,
    hideExpired = true,
    sortBy = 'value-per-hour',
  } = filters;

  const filtered = matches.filter((result) => {
    if (!includeIneligible && result.verdict === 'not-eligible') return false;
    if (hideExpired && result.daysUntilDeadline < 0) return false;
    if (minAward !== undefined && result.scholarship.amountMax < minAward) return false;
    if (maxEffortHours !== undefined && result.effort.hours > maxEffortHours) return false;
    if (withinDays !== undefined && result.daysUntilDeadline > withinDays) return false;
    if (categories?.length && !categories.some((category) => result.scholarship.categories.includes(category as never))) {
      return false;
    }
    if (query && !matchesQuery(result, query)) return false;
    return true;
  });

  return sortMatches(filtered, sortBy);
}

/** Column-by-column comparison payload for the side-by-side compare view. */
export interface ComparisonRow {
  label: string;
  key: string;
  values: (string | number)[];
  /** Index of the winning column(s), for highlighting. */
  bestIndexes: number[];
}

export function buildComparison(matches: MatchResult[]): ComparisonRow[] {
  if (matches.length === 0) return [];

  const numericRow = (
    label: string,
    key: string,
    pick: (m: MatchResult) => number,
    format: (n: number) => string,
    higherIsBetter = true,
  ): ComparisonRow => {
    const raw = matches.map(pick);
    const best = higherIsBetter ? Math.max(...raw) : Math.min(...raw);
    return {
      label,
      key,
      values: raw.map(format),
      bestIndexes: raw.map((value, index) => (value === best ? index : -1)).filter((index) => index >= 0),
    };
  };

  return [
    numericRow('Award value', 'award', (m) => totalAwardValue(m.scholarship), (n) => `$${n.toLocaleString()}`),
    numericRow('Deadline', 'deadline', (m) => m.daysUntilDeadline, (n) => (n < 0 ? 'closed' : `${n} days`), false),
    numericRow('Eligibility fit', 'fit', (m) => m.fitScore, (n) => `${n}/100`),
    numericRow('Effort', 'effort', (m) => m.effort.hours, (n) => `${n} hrs`, false),
    numericRow('Estimated odds', 'odds', (m) => m.winProbability, (n) => `${(n * 100).toFixed(1)}%`),
    numericRow('Expected value', 'ev', (m) => m.expectedValue, (n) => `$${n.toLocaleString()}`),
    numericRow('Value per hour', 'evph', (m) => m.expectedValuePerHour, (n) => `$${n.toLocaleString()}/hr`),
    numericRow('Essays', 'essays', (m) => m.scholarship.requirements.essayCount, (n) => String(n), false),
    numericRow(
      'Recommendations',
      'recs',
      (m) => m.scholarship.requirements.recommendationLetters,
      (n) => String(n),
      false,
    ),
  ];
}
