import { describe, expect, it } from 'vitest';
import { estimateEffort, effortBand, estimateEssayHours, findReusableEssay, readinessGaps } from '@/core/effort';
import { makeProfile, makeScholarship, NOW } from './helpers';
import type { EssayAsset } from '@/core/types';

const essay = (overrides: Partial<EssayAsset> = {}): EssayAsset => ({
  id: 'essay-1',
  title: 'Why I build things',
  topic: 'personal story',
  wordCount: 650,
  text: 'lorem',
  updatedAt: NOW,
  ...overrides,
});

describe('estimateEssayHours', () => {
  it('scales with word count', () => {
    expect(estimateEssayHours(500)).toBe(2);
    expect(estimateEssayHours(1000)).toBe(4);
  });

  it('never estimates less than the floor for a tiny prompt', () => {
    expect(estimateEssayHours(50)).toBe(0.75);
  });
});

describe('findReusableEssay', () => {
  it('reuses an essay on the same topic that is long enough', () => {
    expect(findReusableEssay('personal story', 600, [essay()])?.id).toBe('essay-1');
  });

  it('will not reuse an essay that is far too short', () => {
    expect(findReusableEssay('personal story', 1500, [essay({ wordCount: 300 })])).toBeUndefined();
  });

  it('will not reuse an essay written for a different prompt', () => {
    expect(findReusableEssay('research proposal', 500, [essay()])).toBeUndefined();
  });
});

describe('estimateEffort', () => {
  it('counts a bare form as under an hour', () => {
    const effort = estimateEffort(makeScholarship(), makeProfile());
    expect(effort.hours).toBe(0.75);
  });

  it('adds writing time per essay', () => {
    const scholarship = makeScholarship({
      requirements: {
        ...makeScholarship().requirements,
        essayCount: 2,
        essayWordCounts: [500, 250],
        essayTopics: ['leadership', 'career goals'],
      },
    });
    const effort = estimateEffort(scholarship, makeProfile());
    expect(effort.hours).toBeCloseTo(0.75 + 2 + 1);
  });

  it('discounts an essay the student has already written', () => {
    const scholarship = makeScholarship({
      requirements: {
        ...makeScholarship().requirements,
        essayCount: 1,
        essayWordCounts: [600],
        essayTopics: ['personal story'],
      },
    });
    const withoutReuse = estimateEffort(scholarship, makeProfile());
    const withReuse = estimateEffort(scholarship, makeProfile({ essays: [essay()] }));
    expect(withReuse.hours).toBeLessThan(withoutReuse.hours);
    expect(withReuse.reusableEssayIds).toEqual(['essay-1']);
    expect(withReuse.hoursSavedByReuse).toBeGreaterThan(1);
  });

  it('charges the full FAFSA only when it is not already filed', () => {
    const scholarship = makeScholarship({
      requirements: { ...makeScholarship().requirements, fafsaRequired: true },
    });
    const notFiled = estimateEffort(scholarship, makeProfile());
    const filed = estimateEffort(scholarship, makeProfile({ financials: { fafsaFiled: true } }));
    expect(notFiled.hours - filed.hours).toBeCloseTo(1.85);
  });

  it('itemizes every requirement so the estimate is auditable', () => {
    const scholarship = makeScholarship({
      requirements: {
        ...makeScholarship().requirements,
        recommendationLetters: 2,
        transcriptRequired: true,
        interviewRequired: true,
        otherRequirements: ['Upload volunteer log'],
      },
    });
    const effort = estimateEffort(scholarship, makeProfile());
    const labels = effort.breakdown.map((item) => item.label).join(' | ');
    expect(labels).toContain('recommendation letter');
    expect(labels).toContain('transcript');
    expect(labels).toContain('Interview');
    expect(labels).toContain('Upload volunteer log');
    expect(effort.hours).toBeCloseTo(effort.breakdown.reduce((sum, item) => sum + item.hours, 0), 2);
  });
});

describe('effortBand', () => {
  it('bands hours for scanning', () => {
    expect(effortBand(1)).toBe('low');
    expect(effortBand(4)).toBe('medium');
    expect(effortBand(12)).toBe('high');
  });
});

describe('readinessGaps', () => {
  it('flags missing recommenders with counts', () => {
    const requirements = { ...makeScholarship().requirements, recommendationLetters: 2 };
    const gaps = readinessGaps(requirements, makeProfile());
    expect(gaps[0]).toContain('2 recommendation letter');
    expect(gaps[0]).toContain('you have 0');
  });

  it('says nothing when the student is ready', () => {
    const requirements = { ...makeScholarship().requirements, recommendationLetters: 1 };
    const profile = makeProfile({ recommenders: [{ id: 'r1', name: 'Ms. Diaz' }] });
    expect(readinessGaps(requirements, profile)).toEqual([]);
  });
});
