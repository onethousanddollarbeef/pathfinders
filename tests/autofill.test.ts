import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyFill, buildFillValues, detectFields, guessField, scanPage } from '@/core/autofill';
import { makeProfile, NOW } from './helpers';

function render(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

const profile = makeProfile({
  firstName: 'Maya',
  lastName: 'Okafor',
  email: 'maya@example.com',
  phone: '555-0142',
  city: 'Fresno',
  state: 'CA',
  postalCode: '93701',
  academics: {
    level: 'high-school-senior',
    gpa: 3.6,
    intendedMajors: ['Computer Science'],
    graduationYear: 2026,
    currentSchool: 'Fresno High School',
    satTotal: 1380,
  },
  essays: [
    {
      id: 'essay-leader',
      title: 'Leading the robotics team',
      topic: 'leadership',
      wordCount: 520,
      text: 'When our robotics team lost its mentor…',
      updatedAt: NOW,
    },
  ],
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('buildFillValues', () => {
  it('derives a full name and drops empty fields', () => {
    const values = buildFillValues(profile);
    expect(values.fullName).toBe('Maya Okafor');
    expect(values.gpa).toBe('3.6');
    expect(values.educationLevel).toBe('High school senior');
    expect(values.careerGoals).toBeUndefined();
  });

  it('renders yes/no answers for booleans only when they are answered', () => {
    expect(buildFillValues(profile).firstGeneration).toBeUndefined();
    const answered = makeProfile({ demographics: { firstGeneration: true } });
    expect(buildFillValues(answered).firstGeneration).toBe('Yes');
  });
});

describe('guessField', () => {
  const signals = (patch: Partial<ReturnType<typeof emptySignals>>) => ({ ...emptySignals(), ...patch });
  function emptySignals() {
    return { autocomplete: '', name: '', id: '', placeholder: '', label: '', context: '' };
  }

  it('trusts the autocomplete attribute completely', () => {
    expect(guessField(signals({ autocomplete: 'given-name' }))).toEqual({
      key: 'firstName',
      confidence: 1,
      reason: 'autocomplete attribute',
    });
  });

  it('reads camelCase and snake_case field names', () => {
    expect(guessField(signals({ name: 'studentLastName' }))?.key).toBe('lastName');
    expect(guessField(signals({ name: 'postal_code' }))?.key).toBe('postalCode');
  });

  it('does not confuse a personal statement with the state field', () => {
    expect(guessField(signals({ label: 'Personal Statement' }))?.key).toBe('essay');
    expect(guessField(signals({ label: 'State' }))?.key).toBe('state');
  });

  it('does not read "activities" or "contact" as an ACT score', () => {
    expect(guessField(signals({ label: 'Extracurricular activities' }))?.key).toBe('activities');
    expect(guessField(signals({ label: 'Contact preference' }))?.key).not.toBe('actScore');
  });

  it('ranks a label above ambient page text', () => {
    const guess = guessField(signals({ label: 'Email', context: 'Enter your GPA below' }));
    expect(guess?.key).toBe('email');
    expect(guess?.confidence).toBeGreaterThan(0.9);
  });

  it('returns nothing for an unrecognizable field', () => {
    expect(guessField(signals({ name: 'xyzzy_42' }))).toBeUndefined();
  });
});

describe('detectFields', () => {
  it('matches inputs through their associated label', () => {
    render(`
      <form>
        <label for="fn">First Name</label><input id="fn" />
        <label for="ln">Last Name</label><input id="ln" />
        <label for="em">Email Address</label><input id="em" type="email" />
      </form>
    `);
    const fields = detectFields(document, profile);
    expect(fields.map((field) => field.key)).toEqual(['firstName', 'lastName', 'email']);
    expect(fields[0].value).toBe('Maya');
  });

  it('never touches passwords, SSNs or payment fields', () => {
    render(`
      <form>
        <label for="p">Password</label><input id="p" type="password" />
        <label for="s">Social Security Number</label><input id="s" />
        <label for="c">Credit Card Number</label><input id="c" />
        <input type="hidden" name="firstName" />
      </form>
    `);
    expect(detectFields(document, profile)).toHaveLength(0);
  });

  it('leaves answers the student already typed alone unless asked', () => {
    render(`<label for="fn">First Name</label><input id="fn" value="Prefilled" />`);
    expect(detectFields(document, profile)).toHaveLength(0);
    expect(detectFields(document, profile, { overwriteExisting: true })).toHaveLength(1);
  });

  it('resolves a select to a real option', () => {
    render(`
      <label for="st">State</label>
      <select id="st">
        <option value="">Choose</option>
        <option value="CA">California</option>
        <option value="NY">New York</option>
      </select>
    `);
    const [field] = detectFields(document, profile);
    expect(field.action).toBe('select-option');
    expect(field.value).toBe('CA');
  });

  it('reports a select with no usable option instead of guessing', () => {
    render(`
      <label for="st">State</label>
      <select id="st"><option value="TX">Texas</option></select>
    `);
    const [field] = detectFields(document, profile);
    expect(field.action).toBe('skip');
  });

  it('picks the matching radio in a group', () => {
    const withGender = makeProfile({ ...profile, demographics: { gender: 'Female' } });
    render(`
      <fieldset>
        <legend>Gender</legend>
        <label><input type="radio" name="gender" value="male" /> Male</label>
        <label><input type="radio" name="gender" value="female" /> Female</label>
      </fieldset>
    `);
    const fields = detectFields(document, withGender);
    expect(fields).toHaveLength(1);
    expect(fields[0].action).toBe('check-radio');
    expect((fields[0].element as HTMLInputElement).value).toBe('female');
  });

  it('flags recognized fields the profile cannot answer yet', () => {
    render(`<label for="inc">Household Income</label><input id="inc" />`);
    const [field] = detectFields(document, profile);
    expect(field.missingProfileValue).toBe(true);
    expect(field.action).toBe('skip');
  });

  it('drops an essay into a textarea whose prompt matches a saved essay', () => {
    render(`
      <label for="e1">Essay: describe a leadership experience</label>
      <textarea id="e1"></textarea>
    `);
    const [field] = detectFields(document, profile);
    expect(field.key).toBe('essay');
    expect(field.value).toContain('robotics team');
  });

  it('skips hidden fields', () => {
    render(`<label for="fn">First Name</label><input id="fn" style="display:none" />`);
    expect(detectFields(document, profile)).toHaveLength(0);
  });

  it('falls back to placeholder text when there is no label', () => {
    render(`<input placeholder="Your ZIP code" />`);
    const [field] = detectFields(document, profile);
    expect(field.key).toBe('postalCode');
    expect(field.value).toBe('93701');
  });
});

describe('applyFill', () => {
  it('writes values and fires the events frameworks listen for', () => {
    render(`<label for="fn">First Name</label><input id="fn" />`);
    const input = document.getElementById('fn') as HTMLInputElement;
    const onInput = vi.fn();
    const onChange = vi.fn();
    input.addEventListener('input', onInput);
    input.addEventListener('change', onChange);

    const report = applyFill(detectFields(document, profile));

    expect(input.value).toBe('Maya');
    expect(onInput).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    expect(report.filled).toHaveLength(1);
  });

  it('checks the selected radio', () => {
    const withGender = makeProfile({ ...profile, demographics: { gender: 'Female' } });
    render(`
      <fieldset>
        <legend>Gender</legend>
        <label><input type="radio" name="gender" value="female" /> Female</label>
      </fieldset>
    `);
    applyFill(detectFields(document, withGender));
    expect((document.querySelector('input[value="female"]') as HTMLInputElement).checked).toBe(true);
  });

  it('holds back low-confidence guesses for review', () => {
    render(`<div>Tell us your GPA<input name="q17" /></div>`);
    const fields = detectFields(document, profile);
    const report = applyFill(fields, { minConfidence: 0.6 });
    expect(report.filled).toHaveLength(0);
    expect(report.needsReview[0].reason).toContain('Low confidence');
    expect((document.querySelector('input[name="q17"]') as HTMLInputElement).value).toBe('');
  });

  it('separates what it filled, what needs review and what is missing', () => {
    render(`
      <label for="fn">First Name</label><input id="fn" />
      <label for="inc">Household Income</label><input id="inc" />
    `);
    const report = applyFill(detectFields(document, profile));
    expect(report.filled.map((item) => item.key)).toEqual(['firstName']);
    expect(report.missing.map((item) => item.key)).toEqual(['householdIncome']);
  });
});

describe('scanPage', () => {
  it('recognizes an application form', () => {
    render(`
      <form>
        <label for="fn">First Name</label><input id="fn" />
        <label for="ln">Last Name</label><input id="ln" />
        <label for="g">GPA</label><input id="g" />
        <label for="s">High School Name</label><input id="s" />
        <label for="e">Email</label><input id="e" />
      </form>
    `);
    const scan = scanPage(document, profile);
    expect(scan.looksLikeApplication).toBe(true);
    expect(scan.totalFields).toBe(5);
    expect(scan.fillableFields).toBeGreaterThanOrEqual(4);
  });

  it('does not mistake a login box for an application', () => {
    render(`
      <form>
        <label for="e">Email</label><input id="e" />
        <label for="p">Password</label><input id="p" type="password" />
      </form>
    `);
    expect(scanPage(document, profile).looksLikeApplication).toBe(false);
  });
});
