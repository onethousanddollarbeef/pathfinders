import { useMemo, useState } from 'react';
import { formatDeadline } from '../../core/dates';
import { averageAward } from '../../core/matching';
import { STATUS_LABELS, progress, trackerStats } from '../../core/tracker';
import { Chip, EmptyState, Progress, money } from './common';
import type { AppStore } from '../useAppState';
import type { ApplicationStatus, Scholarship, TrackedApplication } from '../../core/types';

const FILTERS: { value: ApplicationStatus | 'all' | 'active'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'saved', label: 'Saved' },
  { value: 'started', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'all', label: 'All' },
];

export function TrackerView({ store }: { store: AppStore }) {
  const [filter, setFilter] = useState<ApplicationStatus | 'all' | 'active'>('active');
  const state = store.state;

  const stats = useMemo(
    () => trackerStats(state?.applications ?? [], store.catalog),
    [state?.applications, store.catalog],
  );

  if (!state) return null;

  if (state.applications.length === 0) {
    return (
      <div className="view">
        <EmptyState
          title="No applications tracked yet"
          hint="Save a scholarship from Discover or the plan and it shows up here with a task checklist and deadline."
        />
      </div>
    );
  }

  const visible = state.applications
    .filter((application) => {
      if (filter === 'all') return true;
      if (filter === 'active') return application.status === 'saved' || application.status === 'started';
      return application.status === filter;
    })
    .map((application) => ({
      application,
      scholarship: store.catalog.find((entry) => entry.id === application.scholarshipId),
    }))
    .filter((entry): entry is { application: TrackedApplication; scholarship: Scholarship } => Boolean(entry.scholarship))
    .sort((a, b) => a.scholarship.deadline.localeCompare(b.scholarship.deadline));

  return (
    <div className="view">
      <div className="card">
        <h2 style={{ margin: 0 }}>Application tracker</h2>
        <div className="grid-3" style={{ marginTop: 8 }}>
          <div className="metric">
            <span className="value">{stats.saved + stats.started}</span>
            <span className="label">In flight</span>
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
          {stats.hoursInvested} hrs logged · {stats.hoursRemaining} hrs remaining · {money(stats.pendingValue)} awaiting a
          decision
        </p>
        {stats.overdue.length > 0 && (
          <div className="banner warn" style={{ marginTop: 8 }}>
            {stats.overdue.length} application(s) passed their deadline without being submitted.
          </div>
        )}
        {stats.dueSoon.length > 0 && (
          <div className="banner info" style={{ marginTop: 8 }}>
            Due within a week: {stats.dueSoon.map((entry) => `${entry.scholarship.name} (${entry.days}d)`).join(', ')}
          </div>
        )}
      </div>

      <div className="row wrap" style={{ gap: 4 }}>
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            tone={filter === option.value ? 'accent' : 'default'}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {visible.length === 0 && <EmptyState title="Nothing in this view" />}

      {visible.map(({ application, scholarship }) => (
        <ApplicationCard key={application.scholarshipId} application={application} scholarship={scholarship} store={store} />
      ))}
    </div>
  );
}

function ApplicationCard({
  application,
  scholarship,
  store,
}: {
  application: TrackedApplication;
  scholarship: Scholarship;
  store: AppStore;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const completion = progress(application);
  const remaining = application.tasks.filter((task) => !task.done);

  return (
    <div className="match-card">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3>{scholarship.name}</h3>
          <div className="sponsor">{formatDeadline(application.deadlineOverride ?? scholarship.deadline)}</div>
        </div>
        <Chip tone={statusTone(application.status)}>{STATUS_LABELS[application.status]}</Chip>
      </div>

      <div style={{ margin: '8px 0 4px' }}>
        <Progress value={completion} green={completion === 1} />
      </div>
      <div className="small muted">
        {Math.round(completion * 100)}% complete · {remaining.length} task(s) left ·{' '}
        {remaining.reduce((sum, task) => sum + task.estimatedHours, 0).toFixed(1)} hrs · worth {money(averageAward(scholarship))}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary>Checklist</summary>
        <div style={{ marginTop: 4 }}>
          {application.tasks.map((task) => (
            <div key={task.id} className={`task${task.done ? ' done' : ''}`}>
              <input
                type="checkbox"
                id={task.id}
                checked={task.done}
                onChange={() => store.toggleApplicationTask(application.scholarshipId, task.id)}
              />
              <label htmlFor={task.id}>
                {task.label}
                {task.dueDate && <span className="muted"> · by {task.dueDate}</span>}
              </label>
            </div>
          ))}
        </div>
      </details>

      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        {application.status === 'saved' && (
          <button
            type="button"
            className="btn tiny primary"
            onClick={() => store.changeStatus(application.scholarshipId, 'started')}
          >
            Start
          </button>
        )}
        {(application.status === 'saved' || application.status === 'started') && (
          <button
            type="button"
            className="btn tiny primary"
            onClick={() => store.changeStatus(application.scholarshipId, 'submitted')}
          >
            Mark submitted
          </button>
        )}
        {application.status === 'submitted' && (
          <>
            <button
              type="button"
              className="btn tiny"
              onClick={() => store.changeStatus(application.scholarshipId, 'awarded', averageAward(scholarship))}
            >
              Won it
            </button>
            <button
              type="button"
              className="btn tiny"
              onClick={() => store.changeStatus(application.scholarshipId, 'rejected')}
            >
              Not selected
            </button>
          </>
        )}
        <a className="btn tiny" href={scholarship.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          Open
        </a>
        <button type="button" className="btn tiny" onClick={() => setShowNotes((value) => !value)}>
          Notes
        </button>
        <button
          type="button"
          className="btn tiny subtle danger"
          onClick={() => store.removeApplication(application.scholarshipId)}
        >
          Remove
        </button>
      </div>

      {showNotes && (
        <textarea
          style={{ marginTop: 8 }}
          placeholder="Login details reminder, essay ideas, who you asked for a letter…"
          value={application.notes}
          onChange={(event) => store.setNotes(application.scholarshipId, event.target.value)}
        />
      )}
    </div>
  );
}

function statusTone(status: ApplicationStatus): 'default' | 'accent' | 'green' | 'amber' | 'red' {
  switch (status) {
    case 'started':
      return 'accent';
    case 'submitted':
      return 'amber';
    case 'awarded':
      return 'green';
    case 'rejected':
      return 'red';
    default:
      return 'default';
  }
}
