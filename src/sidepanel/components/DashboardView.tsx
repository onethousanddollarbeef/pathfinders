import { findHighImpactGaps, profileCompleteness } from '../../core/profile';
import { trackerStats } from '../../core/tracker';
import { Chip, DeadlineChip, Progress, money } from './common';
import type { AppStore } from '../useAppState';
import type { TabId } from '../App';

/** Landing view: what to do next, what is at risk, and what is missing. */
export function DashboardView({ store, onNavigate }: { store: AppStore; onNavigate: (tab: TabId) => void }) {
  const state = store.state;
  const plan = store.plan;
  if (!state || !plan) return null;

  const completeness = profileCompleteness(state.profile);
  const stats = trackerStats(state.applications, store.catalog);
  const gaps = findHighImpactGaps(state.profile, store.catalog).slice(0, 3);
  const nextUp = plan.items.filter((item) => item.bucket === 'do-now' || item.bucket === 'this-week').slice(0, 3);
  const isNew = completeness.percent < 25 && state.applications.length === 0;

  return (
    <div className="view">
      {isNew && (
        <div className="card">
          <h2 style={{ margin: 0 }}>Start on the website</h2>
          <p className="small muted" style={{ margin: '6px 0' }}>
            Create your account on the Nexus website first, then sign in here under Account to load your profile.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <a className="btn primary" href="https://nexusnext.lovable.app/auth" target="_blank" rel="noreferrer">
              Get started on Nexus
            </a>
            <button type="button" className="btn" onClick={() => onNavigate('account')}>
              Sign in
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Snapshot</h2>
          <Chip tone={completeness.percent >= 80 ? 'green' : 'amber'}>{completeness.percent}% profile</Chip>
        </div>
        <Progress value={completeness.percent / 100} green={completeness.percent >= 80} />
        <div className="grid-3" style={{ marginTop: 10 }}>
          <div className="metric">
            <span className="value">{state.applications.length}</span>
            <span className="label">Applications</span>
          </div>
          <div className="metric">
            <span className="value">{stats.submitted}</span>
            <span className="label">Submitted</span>
          </div>
          <div className="metric">
            <span className="value">{money(stats.wonValue)}</span>
            <span className="label">Won</span>
          </div>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Sign in under Account to keep your work backed up across devices.
        </p>
      </div>

      {nextUp.length > 0 && (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>Do next</h2>
            <button type="button" className="btn tiny subtle" onClick={() => onNavigate('tracker')}>
              Open applications →
            </button>
          </div>
          {nextUp.map((item) => (
            <div key={item.match.scholarship.id} className="plan-item" style={{ marginTop: 8 }}>
              <div className="spread">
                <strong style={{ fontSize: 12.5 }}>{item.match.scholarship.name}</strong>
                <Chip tone="accent">{money(item.match.expectedValuePerHour)}/hr</Chip>
              </div>
              <div className="row wrap" style={{ gap: 4, margin: '4px 0' }}>
                <DeadlineChip deadline={item.match.scholarship.deadline} days={item.match.daysUntilDeadline} />
                <Chip>{item.match.effort.hours} hrs</Chip>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {item.rationale}
              </p>
            </div>
          ))}
        </div>
      )}

      {(stats.dueSoon.length > 0 || stats.overdue.length > 0) && (
        <div className="card">
          <h2 style={{ margin: '0 0 6px' }}>Deadline watch</h2>
          {stats.overdue.map((entry) => (
            <div key={entry.scholarship.id} className="banner warn" style={{ marginBottom: 6 }}>
              {entry.scholarship.name} closed {Math.abs(entry.days)} day(s) ago and was never submitted.
            </div>
          ))}
          {stats.dueSoon.map((entry) => (
            <div key={entry.scholarship.id} className="spread" style={{ marginBottom: 4 }}>
              <span className="small">{entry.scholarship.name}</span>
              <Chip tone={entry.days <= 2 ? 'red' : 'amber'}>{entry.days}d</Chip>
            </div>
          ))}
          <button type="button" className="btn tiny" style={{ marginTop: 6 }} onClick={() => onNavigate('tracker')}>
            Open tracker
          </button>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="card">
          <h2 style={{ margin: '0 0 6px' }}>Answer these to unlock more</h2>
          {gaps.map((gap) => (
            <div key={gap.field} className="spread" style={{ marginBottom: 6 }}>
              <span className="small">
                Your <strong>{gap.label}</strong> gates {gap.blockedCount} award(s)
              </span>
              <Chip tone="accent">{money(gap.blockedValue)}</Chip>
            </div>
          ))}
          <button type="button" className="btn tiny" onClick={() => onNavigate('profile')}>
            Update profile
          </button>
        </div>
      )}

      <div className="card">
        <h2 style={{ margin: '0 0 6px' }}>Pipeline</h2>
        <div className="grid-3">
          <div className="metric">
            <span className="value">{stats.saved}</span>
            <span className="label">Saved</span>
          </div>
          <div className="metric">
            <span className="value">{stats.started}</span>
            <span className="label">Started</span>
          </div>
          <div className="metric">
            <span className="value">{stats.submitted}</span>
            <span className="label">Submitted</span>
          </div>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          {stats.hoursInvested} hrs invested · {stats.awarded} awarded · {money(stats.wonValue)} won
        </p>
      </div>
    </div>
  );
}
