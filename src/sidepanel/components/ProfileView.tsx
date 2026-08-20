import { useState } from 'react';
import { profileCompleteness, findHighImpactGaps } from '../../core/profile';
import { WEBSITE_GRADE_LEVELS } from '../../core/profileSchema';
import { Chip, Progress, money } from './common';
import type { AppStore } from '../useAppState';
import type {
  ActivityEntry,
  CitizenshipStatus,
  EssayAsset,
  RecommenderEntry,
  StudentProfile,
} from '../../core/types';
import { educationLevelToGradeLevel, gradeLevelToEducationLevel, joinFullName, splitFullName } from '../../core/profileSchema';

const LEVELS = WEBSITE_GRADE_LEVELS.map((label) => ({ value: label, label }));

const CITIZENSHIPS: { value: CitizenshipStatus; label: string }[] = [
  { value: 'us-citizen', label: 'U.S. citizen' },
  { value: 'us-permanent-resident', label: 'Permanent resident' },
  { value: 'daca', label: 'DACA recipient' },
  { value: 'undocumented', label: 'Undocumented' },
  { value: 'international', label: 'International student' },
  { value: 'other', label: 'Other' },
];

const ESSAY_TOPICS = [
  'personal story',
  'leadership',
  'community impact',
  'career goals',
  'research proposal',
  'artist statement',
  'general',
];

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <details className="card" open>
      <summary style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text)' }}>{title}</summary>
      {subtitle && (
        <p className="small muted" style={{ margin: '4px 0 8px' }}>
          {subtitle}
        </p>
      )}
      <div className="stack" style={{ marginTop: 8 }}>
        {children}
      </div>
    </details>
  );
}

function TagInput({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder?: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!values.some((entry) => entry.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setDraft('');
  };
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label className="field">
        {label}
        <div className="row">
          <input
            type="text"
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn tiny" onClick={add}>
            Add
          </button>
        </div>
      </label>
      {values.length > 0 && (
        <div className="row wrap" style={{ gap: 4 }}>
          {values.map((value) => (
            <Chip key={value} tone="accent" onClick={() => onChange(values.filter((entry) => entry !== value))} title="Remove">
              {value} ×
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ProfileView({ store }: { store: AppStore }) {
  const profile = store.state?.profile;
  if (!profile) return null;

  const set = <K extends keyof StudentProfile>(key: K, value: StudentProfile[K]) =>
    store.updateProfile((current) => ({ ...current, [key]: value }));

  const setAcademics = (patch: Partial<StudentProfile['academics']>) =>
    store.updateProfile((current) => ({ ...current, academics: { ...current.academics, ...patch } }));

  const setFinancials = (patch: Partial<StudentProfile['financials']>) =>
    store.updateProfile((current) => ({ ...current, financials: { ...current.financials, ...patch } }));

  const setDemographics = (patch: Partial<StudentProfile['demographics']>) =>
    store.updateProfile((current) => ({ ...current, demographics: { ...current.demographics, ...patch } }));

  const completeness = profileCompleteness(profile);
  const gaps = findHighImpactGaps(profile, store.catalog).slice(0, 3);

  const numberOrUndefined = (value: string): number | undefined =>
    value.trim() === '' ? undefined : Number(value);

  const triState = (value: boolean | undefined): string =>
    value === undefined ? '' : value ? 'yes' : 'no';
  const parseTriState = (value: string): boolean | undefined =>
    value === '' ? undefined : value === 'yes';

  return (
    <div className="view">
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Profile {completeness.percent}% complete</h2>
          <span className="small muted">{completeness.missing.length} fields left</span>
        </div>
        <Progress value={completeness.percent / 100} green={completeness.percent >= 80} />
        {gaps.length > 0 && (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            Biggest gaps: {gaps.map((gap) => `${gap.label} (${gap.blockedCount} awards, ${money(gap.blockedValue)})`).join('; ')}.
          </p>
        )}
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          These fields match your Nexus website profile and sync when you are signed in. Extra sections below stay on
          this device to power autofill and planning.
        </p>
      </div>

      <Section title="Profile" subtitle="Synced with nexusnext.lovable.app when signed in.">
        <label className="field">
          Full name
          <input
            type="text"
            value={joinFullName(profile.firstName, profile.lastName) ?? ''}
            onChange={(e) => {
              const { firstName, lastName } = splitFullName(e.target.value);
              store.updateProfile((current) => ({ ...current, firstName, lastName }));
            }}
          />
        </label>
        <div className="grid-2">
          <label className="field">
            Email
            <input type="email" value={profile.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </label>
          <label className="field">
            Phone
            <input type="text" value={profile.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </label>
        </div>
        <label className="field">
          School
          <input
            type="text"
            value={profile.academics.currentSchool ?? ''}
            onChange={(e) => setAcademics({ currentSchool: e.target.value })}
          />
        </label>
        <div className="grid-2">
          <label className="field">
            GPA
            <input
              type="number"
              step="0.01"
              value={profile.academics.gpa ?? ''}
              onChange={(e) => setAcademics({ gpa: numberOrUndefined(e.target.value) })}
            />
          </label>
          <label className="field">
            Graduation year
            <input
              type="number"
              value={profile.academics.graduationYear ?? ''}
              onChange={(e) => setAcademics({ graduationYear: numberOrUndefined(e.target.value) })}
            />
          </label>
        </div>
        <label className="field">
          Major
          <input
            type="text"
            value={profile.academics.intendedMajors?.[0] ?? ''}
            onChange={(e) => setAcademics({ intendedMajors: e.target.value.trim() ? [e.target.value.trim()] : [] })}
          />
        </label>
        <label className="field">
          Bio
          <textarea value={profile.bio ?? ''} onChange={(e) => set('bio', e.target.value)} />
        </label>
        <div className="grid-2">
          <label className="field">
            Grade level
            <select
              value={educationLevelToGradeLevel(profile.academics.level) ?? ''}
              onChange={(e) => setAcademics({ level: gradeLevelToEducationLevel(e.target.value) })}
            >
              <option value="">Select…</option>
              {LEVELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            State
            <input
              type="text"
              placeholder="Washington"
              value={profile.state ?? ''}
              onChange={(e) => set('state', e.target.value)}
            />
          </label>
        </div>
        <TagInput
          label="Demographics"
          placeholder='e.g. Woman — same JSON array as the website'
          values={profile.demographics.tags ?? []}
          onChange={(next) => setDemographics({ tags: next, gender: next[0] })}
        />
        <div className="grid-3">
          <label className="field">
            First-generation
            <select
              value={triState(profile.demographics.firstGeneration)}
              onChange={(e) => setDemographics({ firstGeneration: parseTriState(e.target.value) })}
            >
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="field">
            Disability
            <select
              value={triState(profile.demographics.disability)}
              onChange={(e) => setDemographics({ disability: parseTriState(e.target.value) })}
            >
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="field">
            LGBTQ+
            <select value={triState(profile.demographics.lgbtq)} onChange={(e) => setDemographics({ lgbtq: parseTriState(e.target.value) })}>
              <option value="">Prefer not to say</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="Contact and citizenship" subtitle="Extension autofill — saved locally, not synced to the website yet.">
        <div className="grid-2">
          <label className="field">
            Preferred name
            <input type="text" value={profile.preferredName ?? ''} onChange={(e) => set('preferredName', e.target.value)} />
          </label>
          <label className="field">
            Date of birth
            <input type="date" value={profile.dateOfBirth ?? ''} onChange={(e) => set('dateOfBirth', e.target.value)} />
          </label>
        </div>
        <label className="field">
          Street address
          <input type="text" value={profile.addressLine1 ?? ''} onChange={(e) => set('addressLine1', e.target.value)} />
        </label>
        <div className="grid-3">
          <label className="field">
            City
            <input type="text" value={profile.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          </label>
          <label className="field">
            ZIP
            <input type="text" value={profile.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} />
          </label>
          <label className="field">
            Country
            <input type="text" value={profile.country ?? ''} onChange={(e) => set('country', e.target.value)} />
          </label>
        </div>
        <label className="field">
          Citizenship status
          <select value={profile.citizenship ?? ''} onChange={(e) => set('citizenship', (e.target.value || undefined) as CitizenshipStatus)}>
            <option value="">Select…</option>
            {CITIZENSHIPS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Academics (extension)" subtitle="Optional details for matching and autofill on this device.">
        <div className="grid-3">
          <label className="field">
            GPA scale
            <input
              type="number"
              step="0.1"
              value={profile.academics.gpaScale ?? 4}
              onChange={(e) => setAcademics({ gpaScale: numberOrUndefined(e.target.value) })}
            />
          </label>
          <label className="field">
            SAT total
            <input
              type="number"
              value={profile.academics.satTotal ?? ''}
              onChange={(e) => setAcademics({ satTotal: numberOrUndefined(e.target.value) })}
            />
          </label>
          <label className="field">
            ACT composite
            <input
              type="number"
              value={profile.academics.actComposite ?? ''}
              onChange={(e) => setAcademics({ actComposite: numberOrUndefined(e.target.value) })}
            />
          </label>
        </div>
        <label className="field">
          Enrollment
          <select
            value={profile.academics.enrollment ?? ''}
            onChange={(e) => setAcademics({ enrollment: (e.target.value || undefined) as 'full-time' })}
          >
            <option value="">Select…</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="not-enrolled">Not enrolled</option>
          </select>
        </label>
        <TagInput
          label="Additional majors"
          placeholder="e.g. economics"
          values={(profile.academics.intendedMajors ?? []).slice(1)}
          onChange={(next) =>
            setAcademics({
              intendedMajors: [profile.academics.intendedMajors?.[0], ...next].filter(Boolean) as string[],
            })
          }
        />
      </Section>

      <Section title="Financial" subtitle="Local only — helps match need-based awards in the extension.">
        <div className="grid-2">
          <label className="field">
            Household income
            <input
              type="number"
              value={profile.financials.householdIncome ?? ''}
              onChange={(e) => setFinancials({ householdIncome: numberOrUndefined(e.target.value) })}
            />
          </label>
          <label className="field">
            Household size
            <input
              type="number"
              value={profile.financials.householdSize ?? ''}
              onChange={(e) => setFinancials({ householdSize: numberOrUndefined(e.target.value) })}
            />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            Pell eligible
            <select value={triState(profile.financials.pellEligible)} onChange={(e) => setFinancials({ pellEligible: parseTriState(e.target.value) })}>
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="field">
            FAFSA filed
            <select value={triState(profile.financials.fafsaFiled)} onChange={(e) => setFinancials({ fafsaFiled: parseTriState(e.target.value) })}>
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="More background" subtitle="Local only — optional eligibility signals for scholarship matching.">
        <TagInput
          label="Ethnicity / heritage"
          values={profile.demographics.ethnicities ?? []}
          onChange={(next) => setDemographics({ ethnicities: next })}
        />
        <TagInput
          label="Military affiliation"
          placeholder="e.g. veteran, dependent"
          values={profile.demographics.militaryAffiliation ?? []}
          onChange={(next) => setDemographics({ militaryAffiliation: next })}
        />
      </Section>

      <Section title="Interests and activities" subtitle="Local only.">
        <TagInput
          label="Interests"
          placeholder="e.g. robotics, sustainability"
          values={profile.interests}
          onChange={(next) => set('interests', next)}
        />
        <label className="field">
          Career goals
          <textarea value={profile.careerGoals ?? ''} onChange={(e) => set('careerGoals', e.target.value)} />
        </label>
        <ActivityEditor
          activities={profile.activities}
          onChange={(next) => set('activities', next)}
        />
      </Section>

      <Section
        title="Essay library"
        subtitle="Saved essays get reused: the planner discounts effort and autofill can drop them into matching prompts."
      >
        <EssayEditor essays={profile.essays} onChange={(next) => set('essays', next)} />
      </Section>

      <Section title="Recommenders">
        <RecommenderEditor recommenders={profile.recommenders} onChange={(next) => set('recommenders', next)} />
      </Section>

      <Section title="Capacity and goals" subtitle="Drives how much the planner schedules per week.">
        <label className="field">
          <span>
            Hours per week for applications: <strong>{profile.weeklyHoursAvailable}</strong>
          </span>
          <input
            type="range"
            min={1}
            max={25}
            value={profile.weeklyHoursAvailable}
            onChange={(e) => set('weeklyHoursAvailable', Number(e.target.value))}
          />
        </label>
        <label className="field">
          Funding goal for the year
          <input
            type="number"
            value={profile.fundingGoal ?? ''}
            onChange={(e) => set('fundingGoal', numberOrUndefined(e.target.value))}
          />
        </label>
      </Section>
    </div>
  );
}

function ActivityEditor({
  activities,
  onChange,
}: {
  activities: ActivityEntry[];
  onChange: (next: ActivityEntry[]) => void;
}) {
  const update = (id: string, patch: Partial<ActivityEntry>) =>
    onChange(activities.map((activity) => (activity.id === id ? { ...activity, ...patch } : activity)));

  return (
    <div className="stack">
      <div className="spread">
        <span className="section-title" style={{ margin: 0 }}>
          Activities
        </span>
        <button
          type="button"
          className="btn tiny"
          onClick={() => onChange([...activities, { id: randomId('act'), name: '' }])}
        >
          + Add
        </button>
      </div>
      {activities.map((activity) => (
        <div key={activity.id} className="stack" style={{ gap: 4, borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>
          <div className="grid-2">
            <label className="field">
              Name
              <input type="text" value={activity.name} onChange={(e) => update(activity.id, { name: e.target.value })} />
            </label>
            <label className="field">
              Role
              <input type="text" value={activity.role ?? ''} onChange={(e) => update(activity.id, { role: e.target.value })} />
            </label>
          </div>
          <div className="grid-3">
            <label className="field">
              Category
              <input
                type="text"
                placeholder="volunteer"
                value={activity.category ?? ''}
                onChange={(e) => update(activity.id, { category: e.target.value })}
              />
            </label>
            <label className="field">
              Hrs/week
              <input
                type="number"
                value={activity.hoursPerWeek ?? ''}
                onChange={(e) => update(activity.id, { hoursPerWeek: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
            <label className="field">
              Years
              <input
                type="number"
                value={activity.years ?? ''}
                onChange={(e) => update(activity.id, { years: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn tiny danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => onChange(activities.filter((entry) => entry.id !== activity.id))}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function EssayEditor({ essays, onChange }: { essays: EssayAsset[]; onChange: (next: EssayAsset[]) => void }) {
  const update = (id: string, patch: Partial<EssayAsset>) =>
    onChange(essays.map((essay) => (essay.id === id ? { ...essay, ...patch, updatedAt: Date.now() } : essay)));

  return (
    <div className="stack">
      <button
        type="button"
        className="btn tiny"
        style={{ alignSelf: 'flex-start' }}
        onClick={() =>
          onChange([
            ...essays,
            { id: randomId('essay'), title: '', topic: 'personal story', wordCount: 0, text: '', updatedAt: Date.now() },
          ])
        }
      >
        + Add essay
      </button>
      {essays.map((essay) => (
        <div key={essay.id} className="stack" style={{ gap: 4, borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>
          <div className="grid-2">
            <label className="field">
              Title
              <input type="text" value={essay.title} onChange={(e) => update(essay.id, { title: e.target.value })} />
            </label>
            <label className="field">
              Prompt type
              <select value={essay.topic} onChange={(e) => update(essay.id, { topic: e.target.value })}>
                {ESSAY_TOPICS.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Text ({essay.wordCount} words)
            <textarea
              value={essay.text ?? ''}
              onChange={(e) =>
                update(essay.id, {
                  text: e.target.value,
                  wordCount: e.target.value.trim() ? e.target.value.trim().split(/\s+/).length : 0,
                })
              }
            />
          </label>
          <button
            type="button"
            className="btn tiny danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => onChange(essays.filter((entry) => entry.id !== essay.id))}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function RecommenderEditor({
  recommenders,
  onChange,
}: {
  recommenders: RecommenderEntry[];
  onChange: (next: RecommenderEntry[]) => void;
}) {
  const update = (id: string, patch: Partial<RecommenderEntry>) =>
    onChange(recommenders.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  return (
    <div className="stack">
      <button
        type="button"
        className="btn tiny"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...recommenders, { id: randomId('rec'), name: '' }])}
      >
        + Add recommender
      </button>
      {recommenders.map((recommender) => (
        <div key={recommender.id} className="grid-3" style={{ alignItems: 'end' }}>
          <label className="field">
            Name
            <input type="text" value={recommender.name} onChange={(e) => update(recommender.id, { name: e.target.value })} />
          </label>
          <label className="field">
            Relationship
            <input
              type="text"
              value={recommender.relationship ?? ''}
              onChange={(e) => update(recommender.id, { relationship: e.target.value })}
            />
          </label>
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              Email
              <input type="email" value={recommender.email ?? ''} onChange={(e) => update(recommender.id, { email: e.target.value })} />
            </label>
            <button
              type="button"
              className="btn tiny danger"
              onClick={() => onChange(recommenders.filter((entry) => entry.id !== recommender.id))}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
