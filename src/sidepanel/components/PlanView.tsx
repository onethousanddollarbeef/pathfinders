import { Chip, DeadlineChip, EmptyState, WhyQualify, money } from './common';
import type { AppStore } from '../useAppState';
import type { PlanItem } from '../../core/types';

const BUCKET_TITLES: Record<PlanItem['bucket'], string> = {
  'do-now': 'Start today',
  'this-week': 'This week',
  upcoming: 'Upcoming',
  stretch: 'If you have time',
  skip: 'Not feasible',
};

const BUCKET_ORDER: PlanItem['bucket'][] = ['do-now', 'this-week', 'upcoming', 'stretch', 'skip'];

export function PlanView({ store, embedded = false }: { store: AppStore; embedded?: boolean }) {
  const plan = store.plan;
  const state = store.state;
  if (!plan || !state) return null;

  const savedIds = new Set(state.applications.map((application) => application.scholarshipId));
  const weeklyHours = state.settings.weeklyHoursOverride ?? state.profile.weeklyHoursAvailable;

  if (plan.items.length === 0) {
    return (
      <div className={embedded ? 'embedded-view' : 'view'}>
        <EmptyState
          title="No applications to plan yet"
          hint="Fill in your profile and save a few matches from Discover — the plan orders them by what earns the most per hour you spend."
        />
      </div>
    );
  }

  return (
    <div className={embedded ? 'embedded-view' : 'view'}>
      <div className="card">
        <h2 style={{ margin: 0 }}>Your application plan</h2>
        <p className="small muted" style={{ margin: '4px 0 8px' }}>
          Ranked by expected dollars per hour of work, then adjusted for deadlines and what fits in your week.
        </p>
        <div className="grid-3">
          <div className="metric">
            <span className="value">{money(plan.expectedAward)}</span>
            <span className="label">Expected</span>
          </div>
          <div className="metric">
            <span className="value">{money(plan.totalPotentialAward)}</span>
            <span className="label">If you win all</span>
          </div>
          <div className="metric">
            <span className="value">{plan.totalHours} hr</span>
            <span className="label">Total work</span>
          </div>
        </div>
        <label className="field" style={{ marginTop: 8 }}>
          <span>
            Hours per week: <strong>{weeklyHours}</strong>
          </span>
          <input
            type="range"
            min={1}
            max={25}
            value={weeklyHours}
            onChange={(event) => store.updateSettings({ weeklyHoursOverride: Number(event.target.value) })}
          />
        </label>
        {plan.warnings.map((warning) => (
          <div key={warning} className="banner warn" style={{ marginTop: 6 }}>
            {warning}
          </div>
        ))}
      </div>

      {BUCKET_ORDER.map((bucket) => {
        const items = plan.items.filter((item) => item.bucket === bucket);
        if (items.length === 0) return null;
        return (
          <div className="card" key={bucket}>
            <div className="bucket-title">
              {BUCKET_TITLES[bucket]}
              <Chip tone={bucket === 'do-now' ? 'amber' : 'default'}>{items.length}</Chip>
              <span className="small muted">
                {items.reduce((sum, item) => sum + item.match.effort.hours, 0).toFixed(1)} hrs
              </span>
            </div>
            {items.map((item) => (
              <PlanRow key={item.match.scholarship.id} item={item} saved={savedIds.has(item.match.scholarship.id)} store={store} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PlanRow({ item, saved, store }: { item: PlanItem; saved: boolean; store: AppStore }) {
  const { match } = item;
  return (
    <div className={`plan-item ${item.bucket}`}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <strong style={{ fontSize: 12.5 }}>
            {item.rank}. {match.scholarship.name}
          </strong>
          <div className="small muted">{match.scholarship.sponsor}</div>
        </div>
        <Chip tone="accent">{money(match.expectedValuePerHour)}/hr</Chip>
      </div>

      <div className="row wrap" style={{ gap: 4, margin: '4px 0' }}>
        <DeadlineChip deadline={match.scholarship.deadline} days={match.daysUntilDeadline} />
        <Chip>{match.effort.hours} hrs</Chip>
        {item.bucket !== 'skip' && <Chip tone="green">Start {item.suggestedStartDate}</Chip>}
      </div>

      <p className="small muted" style={{ margin: '0 0 4px' }}>
        {item.rationale}
      </p>

      <WhyQualify match={match} />

      <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
        {!saved && (
          <button type="button" className="btn tiny primary" onClick={() => store.saveScholarship(match.scholarship.id)}>
            Add to tracker
          </button>
        )}
        {saved && item.tracked?.status === 'saved' && (
          <button
            type="button"
            className="btn tiny primary"
            onClick={() => store.changeStatus(match.scholarship.id, 'started')}
          >
            Mark started
          </button>
        )}
        <a className="btn tiny" href={match.scholarship.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          Open application
        </a>
        <button type="button" className="btn tiny subtle" onClick={() => store.dismiss(match.scholarship.id)}>
          Drop
        </button>
      </div>
    </div>
  );
}
