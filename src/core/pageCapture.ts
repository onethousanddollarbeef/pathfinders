/**
 * Page capture: turn a scholarship listing the student is looking at into a
 * catalog entry, so the seeded examples can be replaced with real programs.
 *
 * This is deliberately a text heuristic rather than a scraper for any specific
 * site: it reads the page's own words for award amounts, deadlines and
 * requirements, and everything it finds is presented as an editable draft.
 */

import { toISODate } from './dates';
import type { ApplicationRequirements, EligibilityRule, Scholarship, ScholarshipCategory } from './types';

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export interface CaptureInput {
  url: string;
  title: string;
  text: string;
  /** Optional meta description, which is often the cleanest summary. */
  description?: string;
}

export interface CapturedScholarship {
  draft: Scholarship;
  /** Which fields were inferred rather than found verbatim. */
  uncertainFields: string[];
  /** Snippets backing each inference, shown so the student can verify. */
  evidence: { field: string; snippet: string }[];
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function extractAmounts(text: string): { min: number; max: number } | undefined {
  const matches = [...text.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)]
    .map((match) => Number(match[1].replace(/,/g, '')))
    // Filter out prices and phone-like noise; awards are rarely under $100.
    .filter((value) => value >= 100 && value <= 500000);
  if (matches.length === 0) return undefined;
  return { min: Math.min(...matches), max: Math.max(...matches) };
}

export function extractDeadline(text: string, now: number = Date.now()): string | undefined {
  const lower = text.toLowerCase();
  const monthPattern = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'g');
  const numericPattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;

  // Prefer a date that appears near the word "deadline" or "due".
  const deadlineIndex = Math.max(lower.indexOf('deadline'), lower.indexOf('due date'), lower.indexOf('apply by'));
  const scopes = deadlineIndex >= 0 ? [lower.slice(deadlineIndex, deadlineIndex + 220), lower] : [lower];

  for (const scope of scopes) {
    monthPattern.lastIndex = 0;
    const monthMatch = monthPattern.exec(scope);
    if (monthMatch) {
      const month = MONTHS.indexOf(monthMatch[1]) + 1;
      const day = Number(monthMatch[2]);
      const year = monthMatch[3] ? Number(monthMatch[3]) : inferYear(month, day, now);
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    numericPattern.lastIndex = 0;
    const numericMatch = numericPattern.exec(scope);
    if (numericMatch) {
      const month = Number(numericMatch[1]);
      const day = Number(numericMatch[2]);
      const rawYear = Number(numericMatch[3]);
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return undefined;
}

/** A month/day with no year means the next occurrence of that date. */
function inferYear(month: number, day: number, now: number): number {
  const today = new Date(now);
  const year = today.getUTCFullYear();
  const candidate = Date.UTC(year, month - 1, day, 12);
  return candidate >= today.getTime() ? year : year + 1;
}

export function extractRequirements(text: string): ApplicationRequirements {
  const lower = text.toLowerCase();
  // A page usually repeats the same word limit (header and form label), so the
  // distinct limits are a better essay count than the raw number of mentions.
  const wordCounts = [
    ...new Set(
      [...lower.matchAll(/(\d{2,4})[\s-]*(?:word|words)\b/g)]
        .map((match) => Number(match[1]))
        .filter((count) => count >= 100 && count <= 5000),
    ),
  ];

  const essayMentioned = /\bessay|personal statement|written response|statement of purpose\b/.test(lower);
  // An explicit count ("submit one 500 word essay") overrides the inference.
  const statedCount = lower.match(/\b(one|two|three|four|1|2|3|4)\b[^.]{0,40}?\bessays?\b/);
  const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

  let essayCount = 0;
  if (statedCount) essayCount = NUMBER_WORDS[statedCount[1]] ?? Number(statedCount[1]);
  else if (wordCounts.length > 0) essayCount = wordCounts.length;
  else if (essayMentioned) essayCount = 1;

  const recMatch = lower.match(/\b(\d|one|two|three)\s+(?:letters?|recommendations?)\b/) ??
    lower.match(/\bletters? of recommendation\b/);
  let recommendationLetters = 0;
  if (recMatch) {
    const raw = recMatch[1];
    if (!raw) recommendationLetters = 1;
    else if (/one|1/.test(raw)) recommendationLetters = 1;
    else if (/two|2/.test(raw)) recommendationLetters = 2;
    else if (/three|3/.test(raw)) recommendationLetters = 3;
    else recommendationLetters = Number(raw) || 1;
  }

  return {
    essayCount,
    essayWordCounts: wordCounts.length > 0 ? wordCounts.slice(0, Math.max(1, essayCount)) : essayCount > 0 ? [500] : [],
    essayTopics: essayCount > 0 ? Array.from({ length: essayCount }, () => 'general') : [],
    recommendationLetters,
    transcriptRequired: /\btranscript\b/.test(lower),
    fafsaRequired: /\bfafsa\b|\bsar\b|\bfinancial aid form\b/.test(lower),
    portfolioRequired: /\bportfolio\b/.test(lower),
    interviewRequired: /\binterview\b/.test(lower),
    videoRequired: /\bvideo (submission|essay|response)\b/.test(lower),
    otherRequirements: [],
  };
}

export function extractEligibility(text: string): EligibilityRule[] {
  const lower = text.toLowerCase();
  const rules: EligibilityRule[] = [];

  const gpaMatch = lower.match(/\b(?:minimum|min\.?|at least|a)\s*(\d\.\d{1,2})\s*(?:cumulative\s*)?gpa\b/) ??
    lower.match(/\bgpa\s*(?:of|:)?\s*(\d\.\d{1,2})\s*(?:or (?:higher|above|better))?/);
  if (gpaMatch) {
    const value = Number(gpaMatch[1]);
    rules.push({
      id: 'captured-gpa',
      field: 'academics.gpa',
      operator: 'gte',
      value,
      // Not `toFixed(1)`: a stated 3.25 minimum must not be shown as 3.3.
      label: `${value} GPA or higher`,
      weight: 'required',
    });
  }

  if (/\bu\.?s\.? citizen|citizens? of the united states|permanent resident\b/.test(lower)) {
    rules.push({
      id: 'captured-citizenship',
      field: 'citizenship',
      operator: 'in',
      value: ['us-citizen', 'us-permanent-resident'],
      label: 'U.S. citizen or permanent resident',
      weight: 'required',
    });
  }

  if (/\bfirst[- ]generation\b/.test(lower)) {
    rules.push({
      id: 'captured-first-gen',
      field: 'demographics.firstGeneration',
      operator: 'is-true',
      value: true,
      label: 'First-generation college student',
      weight: /\bpreference|preferred\b/.test(lower) ? 'preferred' : 'required',
    });
  }

  if (/\bfull[- ]time\b/.test(lower)) {
    rules.push({
      id: 'captured-enrollment',
      field: 'academics.enrollment',
      operator: 'eq',
      value: 'full-time',
      label: 'Full-time enrollment',
      weight: 'required',
    });
  }

  return rules;
}

function guessCategories(text: string): ScholarshipCategory[] {
  const lower = text.toLowerCase();
  const categories: ScholarshipCategory[] = [];
  if (/\bmerit|academic achievement|top student\b/.test(lower)) categories.push('merit');
  if (/\bfinancial need|need-based|low[- ]income|fafsa\b/.test(lower)) categories.push('need');
  if (/\bessay contest|writing contest\b/.test(lower)) categories.push('essay-contest');
  if (/\bvolunteer|community service\b/.test(lower)) categories.push('service');
  if (/\bveteran|military|active duty\b/.test(lower)) categories.push('military');
  if (/\bemployee|associate of\b/.test(lower)) categories.push('employer');
  return categories.length > 0 ? categories : ['merit'];
}

function guessSponsor(url: string, title: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const base = host.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return title.split(/[-|–]/)[1]?.trim() || 'Unknown sponsor';
  }
}

export function captureScholarship(input: CaptureInput, now: number = Date.now()): CapturedScholarship {
  const text = cleanText(input.text).slice(0, 20000);
  const title = cleanText(input.title).replace(/\s*[|\-–]\s*.*$/, '') || 'Captured scholarship';
  const uncertainFields: string[] = [];
  const evidence: { field: string; snippet: string }[] = [];

  const amounts = extractAmounts(text);
  if (!amounts) uncertainFields.push('amount');
  else evidence.push({ field: 'amount', snippet: snippetAround(text, `$${amounts.max.toLocaleString()}`) ?? `$${amounts.max}` });

  const deadline = extractDeadline(text, now);
  if (!deadline) uncertainFields.push('deadline');
  else evidence.push({ field: 'deadline', snippet: snippetAround(text, 'deadline') ?? deadline });

  const requirements = extractRequirements(text);
  const eligibility = extractEligibility(text);
  if (eligibility.length === 0) uncertainFields.push('eligibility');

  const fallbackDeadline = toISODate(new Date(now + 60 * 24 * 60 * 60 * 1000));

  const draft: Scholarship = {
    id: `capture-${Date.now().toString(36)}`,
    name: title,
    sponsor: guessSponsor(input.url, input.title),
    url: input.url,
    amountMin: amounts?.min ?? 0,
    amountMax: amounts?.max ?? 0,
    renewable: /\brenewable\b/i.test(text),
    deadline: deadline ?? fallbackDeadline,
    recurring: /\bannual|every year|yearly\b/i.test(text),
    categories: guessCategories(text),
    description: cleanText(input.description ?? text.slice(0, 280)),
    eligibility,
    requirements,
    states: [],
    tags: ['captured'],
    source: 'page-capture',
  };

  return { draft, uncertainFields, evidence };
}

function snippetAround(text: string, needle: string): string | undefined {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return undefined;
  return `…${text.slice(Math.max(0, index - 60), index + 90).trim()}…`;
}
