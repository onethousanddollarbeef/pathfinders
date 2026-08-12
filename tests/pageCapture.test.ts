import { describe, expect, it } from 'vitest';
import { captureScholarship, extractAmounts, extractDeadline, extractEligibility, extractRequirements } from '@/core/pageCapture';
import { NOW } from './helpers';

const LISTING = `
  Horizon Community Scholarship
  The Horizon Foundation awards $2,500 to graduating seniors each year.
  Application deadline: March 15, 2026. Applicants must have a minimum 3.25 GPA,
  be U.S. citizens, and submit one 500 word essay along with two letters of
  recommendation and an official transcript. Renewable for up to four years.
  Contact us at (555) 010-2000.
`;

describe('extractAmounts', () => {
  it('reads a dollar amount out of prose', () => {
    expect(extractAmounts(LISTING)).toEqual({ min: 2500, max: 2500 });
  });

  it('captures a range when several amounts appear', () => {
    expect(extractAmounts('Awards range from $1,000 to $10,000.')).toEqual({ min: 1000, max: 10000 });
  });

  it('ignores trivial amounts that are not awards', () => {
    expect(extractAmounts('A $25 application fee applies.')).toBeUndefined();
  });
});

describe('extractDeadline', () => {
  it('prefers a date next to the word deadline', () => {
    const text = 'Program starts January 5, 2026. Deadline: March 15, 2026.';
    expect(extractDeadline(text, NOW)).toBe('2026-03-15');
  });

  it('reads numeric dates', () => {
    expect(extractDeadline('Apply by 4/30/2026.', NOW)).toBe('2026-04-30');
  });

  it('assumes the next occurrence when no year is given', () => {
    expect(extractDeadline('Deadline: February 1', NOW)).toBe('2026-02-01');
    expect(extractDeadline('Deadline: January 5', NOW)).toBe('2027-01-05');
  });

  it('returns nothing rather than an invented date', () => {
    expect(extractDeadline('Applications are accepted on a rolling basis.', NOW)).toBeUndefined();
  });
});

describe('extractRequirements', () => {
  it('counts essays, letters and documents', () => {
    const requirements = extractRequirements(LISTING);
    expect(requirements.essayCount).toBe(1);
    expect(requirements.essayWordCounts).toEqual([500]);
    expect(requirements.recommendationLetters).toBe(2);
    expect(requirements.transcriptRequired).toBe(true);
    expect(requirements.interviewRequired).toBe(false);
  });

  it('does not double-count a word limit the page repeats', () => {
    const repeated = 'Submit one 500 word essay. Essay prompt (500 words): describe your leadership.';
    const requirements = extractRequirements(repeated);
    expect(requirements.essayCount).toBe(1);
    expect(requirements.essayWordCounts).toEqual([500]);
  });

  it('reads an explicitly stated essay count', () => {
    expect(extractRequirements('Applicants submit two essays of 400 words each.').essayCount).toBe(2);
  });

  it('recognizes portfolio and interview rounds', () => {
    const requirements = extractRequirements('Submit a portfolio; finalists complete an interview.');
    expect(requirements.portfolioRequired).toBe(true);
    expect(requirements.interviewRequired).toBe(true);
  });
});

describe('extractEligibility', () => {
  it('turns a stated GPA minimum into a rule', () => {
    const rules = extractEligibility(LISTING);
    const gpa = rules.find((rule) => rule.field === 'academics.gpa');
    expect(gpa?.value).toBe(3.25);
    expect(gpa?.weight).toBe('required');
  });

  it('states a fractional GPA minimum exactly as written', () => {
    const gpa = extractEligibility('Requires a minimum 3.25 GPA.').find((rule) => rule.field === 'academics.gpa');
    expect(gpa?.value).toBe(3.25);
    expect(gpa?.label).toBe('3.25 GPA or higher');
  });

  it('captures a citizenship restriction', () => {
    expect(extractEligibility(LISTING).some((rule) => rule.field === 'citizenship')).toBe(true);
  });

  it('finds nothing when the page states no criteria', () => {
    expect(extractEligibility('Open to everyone who loves learning.')).toEqual([]);
  });
});

describe('captureScholarship', () => {
  const captured = captureScholarship(
    { url: 'https://horizonfoundation.org/scholarship', title: 'Horizon Community Scholarship | Apply', text: LISTING },
    NOW,
  );

  it('builds a usable draft from the page', () => {
    expect(captured.draft.name).toBe('Horizon Community Scholarship');
    expect(captured.draft.sponsor).toBe('Horizonfoundation');
    expect(captured.draft.amountMax).toBe(2500);
    expect(captured.draft.deadline).toBe('2026-03-15');
    expect(captured.draft.renewable).toBe(true);
    expect(captured.draft.source).toBe('page-capture');
  });

  it('shows the text behind each inference', () => {
    expect(captured.evidence.some((item) => item.field === 'deadline')).toBe(true);
  });

  it('says which fields it could not read instead of inventing them', () => {
    const thin = captureScholarship({ url: 'https://example.org/x', title: 'Some Award', text: 'Apply now!' }, NOW);
    expect(thin.uncertainFields).toContain('amount');
    expect(thin.uncertainFields).toContain('deadline');
    expect(thin.draft.deadline > '2026-01-15').toBe(true);
  });
});
