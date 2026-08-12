import { describe, expect, it } from 'vitest';
import { evaluateEligibility, evaluateRule, getProfileValue } from '@/core/eligibility';
import { makeProfile } from './helpers';
import type { EligibilityRule } from '@/core/types';

const gpaRule: EligibilityRule = {
  id: 'gpa',
  field: 'academics.gpa',
  operator: 'gte',
  value: 3.0,
  label: '3.0 GPA or higher',
  weight: 'required',
};

describe('getProfileValue', () => {
  it('normalizes GPA onto the 4.0 scale rules are written against', () => {
    const profile = makeProfile({ academics: { gpa: 4.5, gpaScale: 5 } });
    expect(getProfileValue(profile, 'academics.gpa')).toBe(3.6);
  });

  it('leaves a 4.0-scale GPA untouched', () => {
    expect(getProfileValue(makeProfile({ academics: { gpa: 3.2 } }), 'academics.gpa')).toBe(3.2);
  });

  it('flattens activities into searchable keywords', () => {
    const profile = makeProfile({
      activities: [{ id: 'a', name: 'Food Bank', category: 'Volunteer', role: 'Team Captain' }],
    });
    expect(getProfileValue(profile, 'activities')).toEqual(['food bank', 'volunteer', 'team captain']);
  });

  it('treats empty strings as missing rather than as an answer', () => {
    expect(getProfileValue(makeProfile({ state: '  ' }), 'state')).toBeUndefined();
  });
});

describe('evaluateRule', () => {
  it('marks a met rule with an explanation naming both values', () => {
    const result = evaluateRule(gpaRule, makeProfile({ academics: { gpa: 3.6 } }));
    expect(result.status).toBe('met');
    expect(result.explanation).toContain('3.6');
    expect(result.explanation).toContain('3');
  });

  it('marks a failed rule and says what is required', () => {
    const result = evaluateRule(gpaRule, makeProfile({ academics: { gpa: 2.4 } }));
    expect(result.status).toBe('not-met');
    expect(result.explanation).toContain('3.0 GPA or higher');
  });

  it('reports unknown instead of guessing when the field is blank', () => {
    const result = evaluateRule(gpaRule, makeProfile({ academics: { gpa: undefined } }));
    expect(result.status).toBe('unknown');
    expect(result.explanation).toContain('We need your GPA');
  });

  it('matches list membership case-insensitively', () => {
    const rule: EligibilityRule = {
      id: 'level',
      field: 'academics.level',
      operator: 'in',
      value: ['high-school-senior', 'undergrad-freshman'],
      label: 'Seniors and freshmen',
      weight: 'required',
    };
    expect(evaluateRule(rule, makeProfile()).status).toBe('met');
  });

  it('matches partial keywords for majors', () => {
    const rule: EligibilityRule = {
      id: 'major',
      field: 'academics.intendedMajors',
      operator: 'includes-any',
      value: ['computer science'],
      label: 'CS majors',
      weight: 'required',
    };
    const profile = makeProfile({ academics: { intendedMajors: ['Computer Science, B.S.'] } });
    expect(evaluateRule(rule, profile).status).toBe('met');
  });

  it('does not treat a false boolean as unknown', () => {
    const rule: EligibilityRule = {
      id: 'first-gen',
      field: 'demographics.firstGeneration',
      operator: 'is-true',
      value: true,
      label: 'First-generation student',
      weight: 'required',
    };
    expect(evaluateRule(rule, makeProfile({ demographics: { firstGeneration: false } })).status).toBe('not-met');
    expect(evaluateRule(rule, makeProfile()).status).toBe('unknown');
  });

  it('honors upper bounds for income rules', () => {
    const rule: EligibilityRule = {
      id: 'income',
      field: 'financials.householdIncome',
      operator: 'lte',
      value: 60000,
      label: 'Income at or below $60,000',
      weight: 'required',
    };
    expect(evaluateRule(rule, makeProfile({ financials: { householdIncome: 45000 } })).status).toBe('met');
    expect(evaluateRule(rule, makeProfile({ financials: { householdIncome: 90000 } })).status).toBe('not-met');
  });
});

describe('evaluateEligibility', () => {
  const preferred: EligibilityRule = {
    id: 'sat',
    field: 'academics.satTotal',
    operator: 'gte',
    value: 1300,
    label: 'SAT 1300+',
    weight: 'preferred',
  };

  it('is eligible when every rule is answered and met', () => {
    const summary = evaluateEligibility([gpaRule], makeProfile({ academics: { gpa: 3.9 } }));
    expect(summary.verdict).toBe('eligible');
    expect(summary.fitScore).toBeGreaterThan(70);
  });

  it('is not eligible when a required rule fails, even with strong preferred rules', () => {
    const profile = makeProfile({ academics: { gpa: 2.0, satTotal: 1500 } });
    const summary = evaluateEligibility([gpaRule, preferred], profile);
    expect(summary.verdict).toBe('not-eligible');
    expect(summary.fitScore).toBe(0);
  });

  it('asks for info when a required rule cannot be evaluated', () => {
    const summary = evaluateEligibility([gpaRule], makeProfile({ academics: { gpa: undefined } }));
    expect(summary.verdict).toBe('needs-info');
  });

  it('stays likely-eligible when only a preferred rule is unanswered', () => {
    const summary = evaluateEligibility([gpaRule, preferred], makeProfile({ academics: { gpa: 3.5 } }));
    expect(summary.verdict).toBe('likely-eligible');
    expect(summary.confidence).toBeCloseTo(0.5);
  });

  it('scores a fully-met preferred rule above a merely eligible one', () => {
    const strong = evaluateEligibility([gpaRule, preferred], makeProfile({ academics: { gpa: 3.5, satTotal: 1450 } }));
    const weak = evaluateEligibility([gpaRule, preferred], makeProfile({ academics: { gpa: 3.5, satTotal: 1000 } }));
    expect(strong.fitScore).toBeGreaterThan(weak.fitScore);
  });

  it('treats an unrestricted scholarship as a solid but unremarkable fit', () => {
    expect(evaluateEligibility([], makeProfile()).verdict).toBe('eligible');
    expect(evaluateEligibility([], makeProfile()).fitScore).toBe(70);
  });
});
