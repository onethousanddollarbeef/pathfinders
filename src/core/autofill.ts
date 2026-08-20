/**
 * Form autofill.
 *
 * Scholarship portals are hand-rolled forms with no consistent markup, so the
 * matcher reads every signal a human would (autocomplete attribute, name/id,
 * `<label>`, placeholder, surrounding text) and scores them. Confidence is
 * surfaced to the student rather than hidden: low-confidence guesses are shown
 * for review instead of silently written.
 *
 * Sensitive inputs (passwords, SSN, payment) are never filled, at any confidence.
 */

import type { StudentProfile } from './types';

export type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export type FieldKey =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'preferredName'
  | 'email'
  | 'phone'
  | 'dateOfBirth'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'school'
  | 'educationLevel'
  | 'graduationYear'
  | 'gpa'
  | 'major'
  | 'satScore'
  | 'actScore'
  | 'enrollment'
  | 'citizenship'
  | 'gender'
  | 'ethnicity'
  | 'firstGeneration'
  | 'householdIncome'
  | 'householdSize'
  | 'pellEligible'
  | 'fafsaFiled'
  | 'activities'
  | 'careerGoals'
  | 'interests'
  | 'recommenderName'
  | 'recommenderEmail'
  | 'essay'
  | 'eligibilityYesNo';

interface FieldPattern {
  key: FieldKey;
  /** Value of the HTML `autocomplete` attribute that maps to this field. */
  autocomplete?: string[];
  /** Matched against name/id/label/placeholder text. */
  patterns: RegExp[];
  /** Any hit here disqualifies the field, e.g. "state" vs "statement". */
  negative?: RegExp[];
}

const PATTERNS: FieldPattern[] = [
  { key: 'firstName', autocomplete: ['given-name'], patterns: [/\bfirst[\s_-]?name\b/i, /\bgiven[\s_-]?name\b/i, /\bfname\b/i] },
  { key: 'lastName', autocomplete: ['family-name'], patterns: [/\blast[\s_-]?name\b/i, /\bfamily[\s_-]?name\b/i, /\bsurname\b/i, /\blname\b/i] },
  { key: 'preferredName', patterns: [/\bpreferred[\s_-]?name\b/i, /\bnickname\b/i, /\bgoes[\s_-]?by\b/i] },
  {
    key: 'fullName',
    autocomplete: ['name'],
    patterns: [/\bfull[\s_-]?name\b/i, /\bstudent[\s_-]?name\b/i, /\byour[\s_-]?name\b/i, /^name$/i, /\blegal[\s_-]?name\b/i],
    negative: [/first/i, /last/i, /school/i, /parent/i, /recommend/i, /reference/i, /employer/i],
  },
  { key: 'email', autocomplete: ['email'], patterns: [/\be-?mail\b/i], negative: [/confirm/i, /recommend/i, /reference/i, /parent/i, /counselor/i] },
  { key: 'phone', autocomplete: ['tel'], patterns: [/\bphone\b/i, /\bmobile\b/i, /\bcell\b/i, /\btelephone\b/i] },
  { key: 'dateOfBirth', autocomplete: ['bday'], patterns: [/\bdate[\s_-]?of[\s_-]?birth\b/i, /\bbirth[\s_-]?date\b/i, /\bdob\b/i, /\bbirthday\b/i] },
  {
    key: 'addressLine1',
    autocomplete: ['address-line1', 'street-address'],
    patterns: [/\baddress[\s_-]?(line[\s_-]?)?1\b/i, /\bstreet[\s_-]?address\b/i, /\bmailing[\s_-]?address\b/i, /^address$/i],
    negative: [/e-?mail/i, /line[\s_-]?2/i, /school/i],
  },
  { key: 'addressLine2', autocomplete: ['address-line2'], patterns: [/\baddress[\s_-]?(line[\s_-]?)?2\b/i, /\bapt\b/i, /\bapartment\b/i, /\bsuite\b/i, /\bunit\b/i] },
  { key: 'city', autocomplete: ['address-level2'], patterns: [/\bcity\b/i, /\btown\b/i, /\bmunicipality\b/i], negative: [/school/i, /university/i] },
  {
    key: 'state',
    autocomplete: ['address-level1'],
    patterns: [/\bstate\b/i, /\bprovince\b/i, /\bstate\/province\b/i],
    negative: [/statement/i, /united states/i, /status/i, /estate/i],
  },
  { key: 'postalCode', autocomplete: ['postal-code'], patterns: [/\bzip\b/i, /\bzip[\s_-]?code\b/i, /\bpostal[\s_-]?code\b/i] },
  { key: 'country', autocomplete: ['country', 'country-name'], patterns: [/\bcountry\b/i] },
  {
    key: 'school',
    autocomplete: ['organization'],
    patterns: [/\b(high[\s_-]?)?school[\s_-]?name\b/i, /\bcurrent[\s_-]?school\b/i, /\bcollege[\s_-]?name\b/i, /\buniversity\b/i, /\binstitution\b/i, /^school$/i],
  },
  { key: 'educationLevel', patterns: [/\b(education|academic|class|grade|year)[\s_-]?(level|standing|in[\s_-]?school)\b/i, /\bclassification\b/i, /\bcurrent[\s_-]?grade\b/i, /\bacademic[\s_-]?year\b/i] },
  { key: 'graduationYear', patterns: [/\bgraduation[\s_-]?(year|date)\b/i, /\bgrad[\s_-]?year\b/i, /\bexpected[\s_-]?graduation\b/i, /\bclass[\s_-]?of\b/i] },
  { key: 'gpa', patterns: [/\bgpa\b/i, /\bgrade[\s_-]?point[\s_-]?average\b/i], negative: [/scale/i, /weighted[\s_-]?scale/i] },
  { key: 'major', patterns: [/\bmajor\b/i, /\bfield[\s_-]?of[\s_-]?study\b/i, /\bcourse[\s_-]?of[\s_-]?study\b/i, /\bintended[\s_-]?(major|program)\b/i, /\bdegree[\s_-]?program\b/i] },
  { key: 'satScore', patterns: [/\bsat\b/i, /\bsat[\s_-]?(score|total)\b/i] },
  { key: 'actScore', patterns: [/\bact\b/i, /\bact[\s_-]?(score|composite)\b/i], negative: [/activit/i, /contact/i, /exact/i, /character/i] },
  { key: 'enrollment', patterns: [/\benrollment[\s_-]?status\b/i, /\bfull[\s_-]?time\b/i, /\bpart[\s_-]?time\b/i] },
  { key: 'citizenship', patterns: [/\bcitizenship\b/i, /\bcitizen\b/i, /\bimmigration[\s_-]?status\b/i, /\bresidency[\s_-]?status\b/i, /\bvisa[\s_-]?status\b/i] },
  { key: 'gender', autocomplete: ['sex'], patterns: [/\bgender\b/i, /\bsex\b/i, /\bpronouns\b/i] },
  { key: 'ethnicity', patterns: [/\bethnicit(y|ies)\b/i, /\brace\b/i, /\bracial\b/i, /\bheritage\b/i] },
  { key: 'firstGeneration', patterns: [/\bfirst[\s_-]?gen(eration)?\b/i, /\bfirst[\s_-]?in[\s_-]?(your|the)[\s_-]?family\b/i] },
  { key: 'householdIncome', patterns: [/\bhousehold[\s_-]?income\b/i, /\bfamily[\s_-]?income\b/i, /\bannual[\s_-]?income\b/i, /\bagi\b/i] },
  { key: 'householdSize', patterns: [/\bhousehold[\s_-]?size\b/i, /\bfamily[\s_-]?size\b/i, /\bnumber[\s_-]?in[\s_-]?household\b/i, /\bdependents\b/i] },
  { key: 'pellEligible', patterns: [/\bpell\b/i] },
  { key: 'fafsaFiled', patterns: [/\bfafsa\b/i] },
  { key: 'activities', patterns: [/\bactivities\b/i, /\bextracurricular\b/i, /\bclubs?\b/i, /\bleadership[\s_-]?(roles|experience)\b/i, /\bvolunteer[\s_-]?(work|experience)\b/i, /\bhonors?[\s_-]?and[\s_-]?awards\b/i] },
  { key: 'careerGoals', patterns: [/\bcareer[\s_-]?(goal|plan|aspiration|objective)/i, /\bfuture[\s_-]?plans\b/i, /\bprofessional[\s_-]?goals\b/i] },
  { key: 'interests', patterns: [/\binterests\b/i, /\bhobbies\b/i, /\bareas?[\s_-]?of[\s_-]?interest\b/i] },
  { key: 'recommenderName', patterns: [/\b(recommender|reference|referee|counselor)[\s_-]?(name|full[\s_-]?name)?\b/i] },
  { key: 'recommenderEmail', patterns: [/\b(recommender|reference|referee|counselor)[\s_-]?e-?mail\b/i] },
  { key: 'essay', patterns: [/\bessay\b/i, /\bpersonal[\s_-]?statement\b/i, /\bstatement[\s_-]?of[\s_-]?purpose\b/i, /\btell[\s_-]?us[\s_-]?about\b/i, /\bwhy[\s_-]?do[\s_-]?you\b/i, /\bdescribe\b/i, /\bresponse\b/i] },
];

/** Anything matching these is never touched, regardless of score. */
const BLOCKED = [
  /password/i,
  /\bssn\b/i,
  /social[\s_-]?security/i,
  /credit[\s_-]?card/i,
  /\bcvv\b/i,
  /card[\s_-]?number/i,
  /routing[\s_-]?number/i,
  /account[\s_-]?number/i,
  /\bcaptcha\b/i,
  /security[\s_-]?(question|answer)/i,
  /\bpin\b/i,
];

const BLOCKED_INPUT_TYPES = new Set(['password', 'hidden', 'file', 'submit', 'button', 'reset', 'image', 'range', 'color']);

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  'high-school-freshman': 'High school freshman',
  'high-school-sophomore': 'High school sophomore',
  'high-school-junior': 'High school junior',
  'high-school-senior': 'High school senior',
  'undergrad-freshman': 'College freshman',
  'undergrad-sophomore': 'College sophomore',
  'undergrad-junior': 'College junior',
  'undergrad-senior': 'College senior',
  graduate: 'Graduate student',
  doctoral: 'Doctoral student',
  'non-traditional': 'Non-traditional student',
};

const CITIZENSHIP_LABELS: Record<string, string> = {
  'us-citizen': 'U.S. Citizen',
  'us-permanent-resident': 'Permanent Resident',
  daca: 'DACA Recipient',
  undocumented: 'Undocumented',
  international: 'International Student',
  other: 'Other',
};

/** Flattens the profile into the plain strings a form expects. */
export function buildFillValues(profile: StudentProfile): Partial<Record<FieldKey, string>> {
  const academics = profile.academics ?? {};
  const financials = profile.financials ?? {};
  const demographics = profile.demographics ?? {};
  const recommender = profile.recommenders?.[0];

  const values: Partial<Record<FieldKey, string>> = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    preferredName: profile.preferredName,
    fullName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || undefined,
    email: profile.email,
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    country: profile.country,
    school: academics.currentSchool,
    educationLevel: academics.level ? EDUCATION_LEVEL_LABELS[academics.level] : undefined,
    graduationYear: academics.graduationYear ? String(academics.graduationYear) : undefined,
    gpa: academics.gpa !== undefined ? String(academics.gpa) : undefined,
    major: academics.intendedMajors?.join(', '),
    satScore: academics.satTotal ? String(academics.satTotal) : undefined,
    actScore: academics.actComposite ? String(academics.actComposite) : undefined,
    enrollment: academics.enrollment ? academics.enrollment.replace('-', ' ') : undefined,
    citizenship: profile.citizenship ? CITIZENSHIP_LABELS[profile.citizenship] : undefined,
    gender: demographics.gender,
    ethnicity: demographics.ethnicities?.join(', '),
    firstGeneration: demographics.firstGeneration === undefined ? undefined : demographics.firstGeneration ? 'Yes' : 'No',
    householdIncome: financials.householdIncome !== undefined ? String(financials.householdIncome) : undefined,
    householdSize: financials.householdSize !== undefined ? String(financials.householdSize) : undefined,
    pellEligible: financials.pellEligible === undefined ? undefined : financials.pellEligible ? 'Yes' : 'No',
    fafsaFiled: financials.fafsaFiled === undefined ? undefined : financials.fafsaFiled ? 'Yes' : 'No',
    activities: formatActivities(profile),
    careerGoals: profile.careerGoals,
    interests: profile.interests?.join(', '),
    recommenderName: recommender?.name,
    recommenderEmail: recommender?.email,
  };

  for (const key of Object.keys(values) as FieldKey[]) {
    if (!values[key]) delete values[key];
  }
  return values;
}

function formatActivities(profile: StudentProfile): string | undefined {
  if (!profile.activities?.length) return undefined;
  return profile.activities
    .map((activity) => {
      const parts = [activity.name];
      if (activity.role) parts.push(activity.role);
      if (activity.hoursPerWeek) parts.push(`${activity.hoursPerWeek} hrs/week`);
      if (activity.years) parts.push(`${activity.years} year(s)`);
      return parts.join(' — ');
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Field detection
// ---------------------------------------------------------------------------

/** `CSS.escape` is absent in some embedders, so fall back to a manual escape. */
function escapeAttributeValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function labelTextFor(element: FillableElement): string {
  const parts: string[] = [];
  const doc = element.ownerDocument;
  if (element.id) {
    const label = doc.querySelector(`label[for="${escapeAttributeValue(element.id)}"]`);
    if (label?.textContent) parts.push(label.textContent);
  }
  const wrapping = element.closest('label');
  if (wrapping?.textContent) parts.push(wrapping.textContent);
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const node = doc.getElementById(id);
      if (node?.textContent) parts.push(node.textContent);
    }
  }
  const fieldset = element.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend?.textContent) parts.push(legend.textContent);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Text of the closest wrapper, used when a portal has no real labels. */
function contextText(element: FillableElement): string {
  const container = element.closest('div, p, li, td, section') as HTMLElement | null;
  if (!container) return '';
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export interface FieldSignals {
  autocomplete: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  context: string;
}

export function collectSignals(element: FillableElement): FieldSignals {
  return {
    autocomplete: element.getAttribute('autocomplete') ?? '',
    name: element.getAttribute('name') ?? '',
    id: element.id ?? '',
    placeholder: element.getAttribute('placeholder') ?? '',
    label: labelTextFor(element),
    context: contextText(element),
  };
}

function humanize(value: string): string {
  return value.replace(/[_\-.[\]]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function isBlocked(signals: FieldSignals, element: FillableElement): boolean {
  if (element instanceof HTMLInputElement && BLOCKED_INPUT_TYPES.has(element.type)) return true;
  const haystack = [signals.autocomplete, humanize(signals.name), humanize(signals.id), signals.placeholder, signals.label].join(' ');
  return BLOCKED.some((pattern) => pattern.test(haystack));
}

export interface FieldGuess {
  key: FieldKey;
  confidence: number;
  reason: string;
}

/** Index of the earliest match among the patterns, or -1 if none match. */
function firstMatchIndex(patterns: RegExp[], text: string): number {
  let earliest = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (earliest < 0 || match.index < earliest) earliest = match.index;
  }
  return earliest;
}

/**
 * Scores every candidate field against the element's signals. Signals closer to
 * the developer's intent (the autocomplete attribute) outrank ambient page text.
 */
export function guessField(signals: FieldSignals): FieldGuess | undefined {
  // Strongest signal first: each candidate stops at its best-scoring evidence,
  // so checking a weak signal earlier would let it win on a tie it should lose.
  const weighted: { text: string; weight: number; source: string }[] = [
    { text: signals.label, weight: 0.95, source: 'label' },
    { text: humanize(signals.name), weight: 0.9, source: 'field name' },
    { text: humanize(signals.id), weight: 0.85, source: 'field id' },
    { text: signals.placeholder, weight: 0.7, source: 'placeholder' },
    { text: signals.context, weight: 0.45, source: 'nearby text' },
  ];

  let best: (FieldGuess & { position: number }) | undefined;

  for (const candidate of PATTERNS) {
    if (candidate.autocomplete?.includes(signals.autocomplete)) {
      if (!best || best.confidence < 1) {
        best = { key: candidate.key, confidence: 1, reason: 'autocomplete attribute', position: 0 };
      }
      continue;
    }
    for (const signal of weighted) {
      if (!signal.text) continue;
      if (candidate.negative?.some((pattern) => pattern.test(signal.text))) continue;
      const position = firstMatchIndex(candidate.patterns, signal.text);
      if (position < 0) continue;
      // A long blob of surrounding text is weaker evidence than a tight label.
      const lengthPenalty = signal.text.length > 120 ? 0.85 : 1;
      const confidence = Number((signal.weight * lengthPenalty).toFixed(2));
      // On a tie, trust whichever keyword the label leads with: "Essay: describe
      // a leadership experience" is an essay field, not an activities field.
      const wins = !best || confidence > best.confidence || (confidence === best.confidence && position < best.position);
      if (wins) best = { key: candidate.key, confidence, reason: signal.source, position };
      break;
    }
  }

  if (!best) return undefined;
  const { key, confidence, reason } = best;
  return { key, confidence, reason };
}

export type FillAction = 'set-value' | 'select-option' | 'check-radio' | 'skip';

export interface DetectedField {
  element: FillableElement;
  key: FieldKey;
  label: string;
  value: string;
  confidence: number;
  reason: string;
  action: FillAction;
  /** Set when the field was recognized but no profile value exists. */
  missingProfileValue?: boolean;
}

export interface DetectOptions {
  /** Fields below this confidence are reported but not auto-applied. */
  minConfidence?: number;
  /** Overwrite fields the student already typed into. */
  overwriteExisting?: boolean;
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

/** Radio/checkbox groups are handled as one logical field keyed by `name`. */
function normalizeYesNo(text: string): 'yes' | 'no' | undefined {
  const value = text.trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(value)) return 'yes';
  if (['no', 'n', 'false', '0'].includes(value)) return 'no';
  return undefined;
}

function optionLabelFor(input: HTMLInputElement): string {
  return (labelTextFor(input) || input.value || input.getAttribute('aria-label') || '').trim();
}

/** Pull the eligibility question text surrounding a Yes/No radio group. */
export function questionTextForRadioGroup(input: HTMLInputElement): string {
  const parts: string[] = [];
  const fieldset = input.closest('fieldset');
  const legend = fieldset?.querySelector('legend')?.textContent?.replace(/\s+/g, ' ').trim();
  if (legend && legend.length > 3) parts.push(legend);

  let container: Element | null = input.closest('div, li, tr, section, fieldset, form');
  while (container) {
    for (const child of container.children) {
      if (child.contains(input)) break;
      const tag = child.tagName;
      if (!/^(P|H1|H2|H3|H4|H5|H6|LABEL|SPAN|DIV|LEGEND)$/i.test(tag)) continue;
      const text = child.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text.length < 12) continue;
      if (/^(yes|no|eligibility)$/i.test(text)) continue;
      if (/^yes\s*no$/i.test(text.replace(/\s+/g, ' '))) continue;
      parts.push(text);
    }

    let sibling = container.previousElementSibling;
    while (sibling) {
      const text = sibling.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text.length >= 12 && !/^(yes|no)$/i.test(text)) parts.unshift(text);
      sibling = sibling.previousElementSibling;
    }
    container = container.parentElement;
    if (parts.join(' ').length >= 40) break;
  }

  return [...new Set(parts)]
    .join(' ')
    .replace(/\bYes\b\s*\bNo\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

interface YesNoInference {
  patterns: RegExp[];
  answer: (profile: StudentProfile) => boolean | undefined;
}

const YES_NO_INFERENCES: YesNoInference[] = [
  {
    patterns: [
      /high school diploma.*2026[-/ ]?2027/i,
      /earning your high school diploma/i,
      /graduate from high school.*2027/i,
    ],
    answer: (profile) => {
      const year = profile.academics.graduationYear;
      if (year === 2027 && profile.academics.level?.startsWith('high-school')) return true;
      if (year !== undefined && year !== 2027) return false;
      return undefined;
    },
  },
  {
    patterns: [/gpa.*3\.3.*4\.0/i, /weighted cumulative gpa/i, /gpa.*3\.3/i],
    answer: (profile) => (profile.academics.gpa !== undefined ? profile.academics.gpa >= 3.3 : undefined),
  },
  {
    patterns: [/us citizen or permanent resident/i, /u\.?s\.? citizen or permanent resident/i, /citizen or permanent resident/i],
    answer: (profile) => {
      if (!profile.citizenship) return undefined;
      return profile.citizenship === 'us-citizen' || profile.citizenship === 'us-permanent-resident';
    },
  },
  {
    patterns: [
      /full[- ]time.*4[- ]year degree/i,
      /enroll full[- ]time.*college or university/i,
      /fall of 2027/i,
      /accredited.*college or university/i,
    ],
    answer: (profile) => {
      if (profile.academics.enrollment === 'part-time') return false;
      if (profile.academics.enrollment === 'full-time') return true;
      if (profile.academics.level?.startsWith('undergrad') || profile.academics.level?.startsWith('high-school')) {
        return true;
      }
      return undefined;
    },
  },
  {
    patterns: [/first[\s_-]?gen(eration)?/i, /first in (your|the) family/i],
    answer: (profile) => profile.demographics.firstGeneration,
  },
  {
    patterns: [/\bpell\b/i, /pell grant/i],
    answer: (profile) => profile.financials.pellEligible,
  },
  {
    patterns: [/\bfafsa\b/i],
    answer: (profile) => profile.financials.fafsaFiled,
  },
];

/** Infer Yes/No from an eligibility question and the student profile. */
export function inferYesNoAnswer(question: string, profile: StudentProfile): boolean | undefined {
  const normalized = question.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;

  for (const rule of YES_NO_INFERENCES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.answer(profile);
    }
  }

  const guess = guessField({
    autocomplete: '',
    name: '',
    id: '',
    placeholder: '',
    label: normalized,
    context: normalized,
  });
  if (!guess) return undefined;

  const values = buildFillValues(profile);
  const raw = values[guess.key];
  if (raw === 'Yes') return true;
  if (raw === 'No') return false;

  if (guess.key === 'citizenship' && /citizen|resident/i.test(normalized)) {
    return profile.citizenship === 'us-citizen' || profile.citizenship === 'us-permanent-resident';
  }
  if (guess.key === 'gpa' && /gpa/i.test(normalized)) {
    const match = normalized.match(/(\d+(?:\.\d+)?)/);
    const threshold = match ? Number(match[1]) : undefined;
    if (profile.academics.gpa !== undefined && threshold !== undefined) {
      return profile.academics.gpa >= threshold;
    }
  }

  return undefined;
}

function detectRadioGroups(
  root: ParentNode,
  profile: StudentProfile,
  seenGroups: Set<string>,
): DetectedField[] {
  const radios = [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(isVisible);
  const grouped = new Map<string, HTMLInputElement[]>();

  for (const input of radios) {
    if (input.disabled || isBlocked(collectSignals(input), input)) continue;
    const name = input.name || input.id || optionLabelFor(input);
    const groupKey = `radio:${name}`;
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(input);
    grouped.set(groupKey, bucket);
  }

  const detected: DetectedField[] = [];

  for (const [groupKey, inputs] of grouped) {
    if (inputs.length < 2) continue;
    if (seenGroups.has(groupKey)) continue;

    const question = questionTextForRadioGroup(inputs[0]);
    const yesNoAnswer = inferYesNoAnswer(question, profile);

    if (yesNoAnswer !== undefined) {
      const target = yesNoAnswer ? 'yes' : 'no';
      const match = inputs.find((input) => normalizeYesNo(optionLabelFor(input)) === target);
      if (!match) continue;

      seenGroups.add(groupKey);
      const guess = guessField({
        autocomplete: '',
        name: '',
        id: '',
        placeholder: '',
        label: question,
        context: question,
      });

      detected.push({
        element: match,
        key: guess?.key ?? 'eligibilityYesNo',
        label: question.slice(0, 120) || optionLabelFor(match),
        value: yesNoAnswer ? 'Yes' : 'No',
        confidence: guess?.confidence ?? 0.75,
        reason: guess?.reason ?? 'eligibility question',
        action: 'check-radio',
      });
      continue;
    }

    const guess = guessField({
      autocomplete: '',
      name: '',
      id: '',
      placeholder: '',
      label: question,
      context: question,
    });
    if (!guess) continue;

    const rawValue = valuesFromProfile(guess.key, profile, question);
    if (!rawValue) continue;

    const match = inputs.find((input) => {
      const option = optionLabelFor(input).toLowerCase();
      const target = rawValue.trim().toLowerCase();
      return option === target || option.includes(target) || target.includes(option);
    });
    if (!match) continue;

    seenGroups.add(groupKey);
    detected.push({
      element: match,
      key: guess.key,
      label: question.slice(0, 120) || optionLabelFor(match),
      value: rawValue,
      confidence: guess.confidence,
      reason: guess.reason,
      action: 'check-radio',
    });
  }

  return detected;
}

function valuesFromProfile(key: FieldKey, profile: StudentProfile, question: string): string | undefined {
  if (key === 'essay') {
    return pickEssay(profile, {
      autocomplete: '',
      name: '',
      id: '',
      placeholder: '',
      label: question,
      context: question,
    });
  }
  return buildFillValues(profile)[key];
}

function bestOptionForValue(select: HTMLSelectElement, value: string): HTMLOptionElement | undefined {
  const target = value.trim().toLowerCase();
  const options = [...select.options];
  return (
    options.find((option) => option.value.trim().toLowerCase() === target) ??
    options.find((option) => option.text.trim().toLowerCase() === target) ??
    options.find((option) => option.text.trim().toLowerCase().includes(target) && target.length > 2) ??
    options.find((option) => target.includes(option.text.trim().toLowerCase()) && option.text.trim().length > 2)
  );
}

export function detectFields(
  root: ParentNode,
  profile: StudentProfile,
  options: DetectOptions = {},
): DetectedField[] {
  const { overwriteExisting = false } = options;
  const values = buildFillValues(profile);
  const elements = [...root.querySelectorAll<FillableElement>('input, textarea, select')];
  const detected: DetectedField[] = [];
  const seenRadioGroups = new Set<string>();

  detected.push(...detectRadioGroups(root, profile, seenRadioGroups));

  for (const element of elements) {
    if (!isVisible(element)) continue;
    if (element instanceof HTMLInputElement && element.type === 'radio') continue;
    if (element instanceof HTMLInputElement && BLOCKED_INPUT_TYPES.has(element.type)) continue;
    if (element.disabled || (element as HTMLInputElement).readOnly) continue;

    const signals = collectSignals(element);
    if (isBlocked(signals, element)) continue;

    const guess = guessField(signals);
    if (!guess) continue;

    const label = signals.label || signals.placeholder || humanize(signals.name) || humanize(signals.id) || guess.key;
    const isChoice = element instanceof HTMLInputElement && element.type === 'checkbox';
    const rawValue = guess.key === 'essay' ? pickEssay(profile, signals) : values[guess.key];

    if (!rawValue) {
      detected.push({
        element,
        key: guess.key,
        label,
        value: '',
        confidence: guess.confidence,
        reason: guess.reason,
        action: 'skip',
        missingProfileValue: true,
      });
      continue;
    }

    if (isChoice) {
      const input = element as HTMLInputElement;
      const groupKey = `${guess.key}:${input.name}`;
      if (seenRadioGroups.has(groupKey)) continue;
      const optionLabel = optionLabelFor(input).toLowerCase();
      const target = rawValue.trim().toLowerCase();
      const matches = normalizeYesNo(optionLabel) === normalizeYesNo(target)
        || optionLabel === target
        || optionLabel.includes(target)
        || target.includes(optionLabel);
      if (!matches) continue;
      seenRadioGroups.add(groupKey);
      detected.push({
        element,
        key: guess.key,
        label,
        value: rawValue,
        confidence: guess.confidence,
        reason: guess.reason,
        action: 'check-radio',
      });
      continue;
    }

    if (element instanceof HTMLSelectElement) {
      const option = bestOptionForValue(element, rawValue);
      detected.push({
        element,
        key: guess.key,
        label,
        value: option ? option.value : rawValue,
        confidence: option ? guess.confidence : Math.min(guess.confidence, 0.4),
        reason: guess.reason,
        action: option ? 'select-option' : 'skip',
        ...(option ? {} : { missingProfileValue: false }),
      });
      continue;
    }

    if (!overwriteExisting && element.value.trim() !== '') continue;

    detected.push({
      element,
      key: guess.key,
      label,
      value: rawValue,
      confidence: guess.confidence,
      reason: guess.reason,
      action: 'set-value',
    });
  }

  return detected;
}

/** Chooses the stored essay whose topic best overlaps the prompt on the page. */
function pickEssay(profile: StudentProfile, signals: FieldSignals): string | undefined {
  const essays = profile.essays ?? [];
  if (essays.length === 0) return undefined;
  const prompt = `${signals.label} ${signals.placeholder} ${signals.context}`.toLowerCase();
  const scored = essays
    .map((essay) => {
      const topicWords = essay.topic.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
      const titleWords = essay.title.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
      const score =
        topicWords.filter((word) => prompt.includes(word)).length * 2 +
        titleWords.filter((word) => prompt.includes(word)).length;
      return { essay, score };
    })
    .sort((a, b) => b.score - a.score);
  const winner = scored[0];
  if (!winner || winner.score === 0 || !winner.essay.text) return undefined;
  return winner.essay.text;
}

// ---------------------------------------------------------------------------
// Applying values
// ---------------------------------------------------------------------------

/**
 * Frameworks like React track input values on the DOM node, so assigning
 * `element.value` directly is silently reverted. Calling the native setter and
 * dispatching bubbling events is what makes controlled inputs accept the value.
 */
function setNativeValue(element: FillableElement, value: string): void {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export interface FillReport {
  filled: { key: FieldKey; label: string; value: string; confidence: number }[];
  needsReview: { key: FieldKey; label: string; value: string; confidence: number; reason: string }[];
  missing: { key: FieldKey; label: string }[];
}

export function applyFill(fields: DetectedField[], options: DetectOptions = {}): FillReport {
  const minConfidence = options.minConfidence ?? 0.6;
  const report: FillReport = { filled: [], needsReview: [], missing: [] };

  for (const field of fields) {
    if (field.missingProfileValue) {
      report.missing.push({ key: field.key, label: field.label });
      continue;
    }
    if (field.action === 'skip') {
      report.needsReview.push({
        key: field.key,
        label: field.label,
        value: field.value,
        confidence: field.confidence,
        reason: 'No matching option on this page — set it manually.',
      });
      continue;
    }
    if (field.confidence < minConfidence) {
      report.needsReview.push({
        key: field.key,
        label: field.label,
        value: field.value,
        confidence: field.confidence,
        reason: `Low confidence match (from ${field.reason}).`,
      });
      continue;
    }

    if (field.action === 'check-radio') {
      const input = field.element as HTMLInputElement;
      input.checked = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      setNativeValue(field.element, field.value);
    }
    report.filled.push({ key: field.key, label: field.label, value: field.value, confidence: field.confidence });
  }

  return report;
}

/** Quick page assessment used to decide whether to offer autofill at all. */
export interface FormScan {
  totalFields: number;
  fillableFields: number;
  looksLikeApplication: boolean;
  detectedKeys: FieldKey[];
}

export function scanPage(root: ParentNode, profile: StudentProfile): FormScan {
  const inputs = [...root.querySelectorAll<FillableElement>('input, textarea, select')].filter(
    (element) => !(element instanceof HTMLInputElement && BLOCKED_INPUT_TYPES.has(element.type)),
  );
  const detected = detectFields(root, profile, { overwriteExisting: true });
  const fillable = detected.filter((field) => field.action !== 'skip' && !field.missingProfileValue);
  const keys = [...new Set(detected.map((field) => field.key))];
  // A login box has an email field too; an application has identity + academics.
  const applicationSignals = keys.filter((key) =>
    ['firstName', 'lastName', 'fullName', 'gpa', 'major', 'school', 'graduationYear', 'essay', 'educationLevel'].includes(key),
  ).length;

  return {
    totalFields: inputs.length,
    fillableFields: fillable.length,
    looksLikeApplication: inputs.length >= 4 && applicationSignals >= 2,
    detectedKeys: keys,
  };
}
