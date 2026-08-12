/**
 * Effort estimation.
 *
 * "Award size" alone is a bad way to choose scholarships: a $20,000 award with
 * three essays and an interview can be worth less per hour than a $1,000 award
 * with a form. This module converts an application's requirements into hours,
 * and credits essays the student has already written.
 */

import type { ApplicationRequirements, EffortEstimate, EssayAsset, Scholarship, StudentProfile } from './types';

/** Sustainable drafting + revision pace for a polished scholarship essay. */
const WORDS_PER_HOUR = 250;
const MIN_ESSAY_HOURS = 0.75;

const HOURS = {
  baseForm: 0.5,
  account: 0.25,
  recommendationRequest: 0.4,
  transcript: 0.3,
  fafsaNew: 2,
  fafsaOnFile: 0.15,
  portfolio: 5,
  interview: 2.5,
  video: 3,
  otherRequirement: 0.35,
} as const;

/** Adapting an existing essay costs a fraction of writing one from scratch. */
const REUSE_DISCOUNT = 0.65;

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

/**
 * An essay is reusable when it answers the same canonical topic and is long
 * enough to trim or expand without a rewrite.
 */
export function findReusableEssay(
  topic: string,
  words: number,
  essays: EssayAsset[],
): EssayAsset | undefined {
  const target = normalizeTopic(topic);
  return essays.find((essay) => {
    const candidate = normalizeTopic(essay.topic);
    const topicMatches = candidate === target || candidate.includes(target) || target.includes(candidate);
    const lengthWorks = essay.wordCount >= words * 0.6;
    return topicMatches && lengthWorks;
  });
}

export function estimateEssayHours(words: number): number {
  return Math.max(MIN_ESSAY_HOURS, Number((words / WORDS_PER_HOUR).toFixed(2)));
}

export function estimateEffort(scholarship: Scholarship, profile: StudentProfile): EffortEstimate {
  const requirements = scholarship.requirements;
  const essays = profile.essays ?? [];
  const breakdown: { label: string; hours: number }[] = [];
  const reusableEssayIds: string[] = [];
  let hoursSavedByReuse = 0;

  breakdown.push({ label: 'Application form and account setup', hours: HOURS.baseForm + HOURS.account });

  const essayCount = Math.max(requirements.essayCount, requirements.essayWordCounts.length);
  for (let index = 0; index < essayCount; index += 1) {
    const words = requirements.essayWordCounts[index] ?? requirements.essayWordCounts[0] ?? 500;
    const topic = requirements.essayTopics[index] ?? requirements.essayTopics[0] ?? 'general';
    const fullHours = estimateEssayHours(words);
    const reusable = findReusableEssay(topic, words, essays);
    if (reusable) {
      const adaptedHours = Number((fullHours * (1 - REUSE_DISCOUNT)).toFixed(2));
      hoursSavedByReuse += fullHours - adaptedHours;
      reusableEssayIds.push(reusable.id);
      breakdown.push({
        label: `Adapt "${reusable.title}" for the ${topic} prompt (${words} words)`,
        hours: adaptedHours,
      });
    } else {
      breakdown.push({ label: `Write ${topic} essay (${words} words)`, hours: fullHours });
    }
  }

  if (requirements.recommendationLetters > 0) {
    breakdown.push({
      label: `Request ${requirements.recommendationLetters} recommendation letter(s)`,
      hours: Number((requirements.recommendationLetters * HOURS.recommendationRequest).toFixed(2)),
    });
  }
  if (requirements.transcriptRequired) {
    breakdown.push({ label: 'Order transcript', hours: HOURS.transcript });
  }
  if (requirements.fafsaRequired) {
    const filed = profile.financials?.fafsaFiled === true;
    breakdown.push({
      label: filed ? 'Attach existing FAFSA/SAR' : 'Complete the FAFSA',
      hours: filed ? HOURS.fafsaOnFile : HOURS.fafsaNew,
    });
  }
  if (requirements.portfolioRequired) breakdown.push({ label: 'Assemble portfolio', hours: HOURS.portfolio });
  if (requirements.interviewRequired) breakdown.push({ label: 'Interview prep and interview', hours: HOURS.interview });
  if (requirements.videoRequired) breakdown.push({ label: 'Record and edit video', hours: HOURS.video });
  for (const other of requirements.otherRequirements) {
    breakdown.push({ label: other, hours: HOURS.otherRequirement });
  }

  const hours = Number(breakdown.reduce((sum, item) => sum + item.hours, 0).toFixed(2));

  return {
    hours,
    hoursSavedByReuse: Number(hoursSavedByReuse.toFixed(2)),
    reusableEssayIds,
    breakdown,
  };
}

/** Coarse label for scanning a comparison table quickly. */
export function effortBand(hours: number): 'low' | 'medium' | 'high' {
  if (hours <= 2) return 'low';
  if (hours <= 6) return 'medium';
  return 'high';
}

/** Requirements the student cannot satisfy yet, phrased as next actions. */
export function readinessGaps(requirements: ApplicationRequirements, profile: StudentProfile): string[] {
  const gaps: string[] = [];
  const recommenders = profile.recommenders ?? [];
  if (requirements.recommendationLetters > recommenders.length) {
    gaps.push(
      `Needs ${requirements.recommendationLetters} recommendation letter(s); you have ${recommenders.length} recommender(s) listed.`,
    );
  }
  if (requirements.fafsaRequired && profile.financials?.fafsaFiled !== true) {
    gaps.push('Requires a completed FAFSA, which you have not marked as filed.');
  }
  if (requirements.interviewRequired) gaps.push('Includes an interview round — budget prep time.');
  if (requirements.portfolioRequired) gaps.push('Requires a portfolio submission.');
  if (requirements.videoRequired) gaps.push('Requires a video submission.');
  return gaps;
}
