import { useMemo, useState } from 'react';
import { filterMatches, totalAwardValue } from '../../core/matching';
import { ALL_CATEGORIES } from '../../data/scholarships';
import { Chip, DeadlineChip, EffortChip, EmptyState, MatchMetrics, VerdictBadge, WhyQualify, money } from './common';
import type { AppStore } from '../useAppState';
import type { DiscoverFilters, SortKey } from '../../core/matching';
import type { MatchResult } from '../../core/types';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'value-per-hour', label: 'Best value per hour' },
  { value: 'award', label: 'Largest award' },
  { value: 'deadline', label: 'Closest deadline' },
  { value: 'fit', label: 'Best fit' },
  { value: 'effort', label: 'Least effort' },
  { value: 'odds', label: 'Best odds' },
];

export function DiscoverView({ store }: { store: AppStore }) {
  const [filters, setFilters] = useState<DiscoverFilters>({ sortBy: 'value-per-hour' });
  const [showFilters, setShowFilters] = useState(false);

  const results = useMemo(() => filterMatches(store.matches, filters), [store.matches, filters]);
  const savedIds = new Set(store.state?.applications.map((application) => application.scholarshipId) ?? []);
  const comparisonIds = store.state?.settings.comparisonIds ?? [];

  const patch = (next: Partial<DiscoverFilters>) => setFilters((current) => ({ ...current, ...next }));

  const eligibleCount = store.matches.filter((match) => match.verdict !== 'not-eligible').length;
  const totalValue = results.reduce((sum, match) => sum + totalAwardValue(match.scholarship), 0);

  return (
    <div className="view">
      <div className="card">
        <input
          type="text"
          placeholder="Search scholarships, sponsors, tags…"
          value={filters.query ?? ''}
          onChange={(event) => patch({ query: event.target.value })}
        />
        <div className="spread" style={{ marginTop: 8 }}>
          <select
            value={filters.sortBy ?? 'value-per-hour'}
            onChange={(event) => patch({ sortBy: event.target.value as SortKey })}
            style={{ width: 'auto', flex: 1 }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn tiny" onClick={() => setShowFilters((value) => !value)}>
            {showFilters ? 'Hide filters' : 'Filters'}
          </button>
        </div>

        {showFilters && (
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="grid-2">
              <label className="field">
                Minimum award
                <input
                  type="number"
                  value={filters.minAward ?? ''}
                  onChange={(event) => patch({ minAward: event.target.value ? Number(event.target.value) : undefined })}
                />
              </label>
              <label className="field">
                Max effort (hrs)
                <input
                  type="number"
                  value={filters.maxEffortHours ?? ''}
                  onChange={(event) =>
                    patch({ maxEffortHours: event.target.value ? Number(event.target.value) : undefined })
                  }
                />
              </label>
            </div>
            <label className="field">
              Closing within (days)
              <input
                type="number"
                value={filters.withinDays ?? ''}
                onChange={(event) => patch({ withinDays: event.target.value ? Number(event.target.value) : undefined })}
              />
            </label>
            <div className="row wrap" style={{ gap: 4 }}>
              {ALL_CATEGORIES.map((category) => {
                const active = filters.categories?.includes(category) ?? false;
                return (
                  <Chip
                    key={category}
                    tone={active ? 'accent' : 'default'}
                    onClick={() =>
                      patch({
                        categories: active
                          ? (filters.categories ?? []).filter((entry) => entry !== category)
                          : [...(filters.categories ?? []), category],
                      })
                    }
                  >
                    {category}
                  </Chip>
                );
              })}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={filters.includeIneligible ?? false}
                onChange={(event) => patch({ includeIneligible: event.target.checked })}
              />
              Show scholarships I do not qualify for
            </label>
          </div>
        )}

        <p className="small muted" style={{ margin: '8px 0 0' }}>
          {results.length} shown · {eligibleCount} of {store.matches.length} in catalog match your profile ·{' '}
          {money(totalValue)} on the table
        </p>
      </div>

      {results.length === 0 && (
        <EmptyState
          title="No scholarships match these filters"
          hint="Try clearing filters, or fill in more of your profile so more rules can be checked."
        />
      )}

      {results.map((match) => (
        <ScholarshipCard
          key={match.scholarship.id}
          match={match}
          saved={savedIds.has(match.scholarship.id)}
          comparing={comparisonIds.includes(match.scholarship.id)}
          store={store}
        />
      ))}
    </div>
  );
}

export function ScholarshipCard({
  match,
  saved,
  comparing,
  store,
}: {
  match: MatchResult;
  saved: boolean;
  comparing: boolean;
  store: AppStore;
}) {
  const { scholarship } = match;
  return (
    <div className="match-card">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3>{scholarship.name}</h3>
          <div className="sponsor">{scholarship.sponsor}</div>
        </div>
        <VerdictBadge verdict={match.verdict} />
      </div>

      <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
        <Chip tone="accent">{money(totalAwardValue(scholarship))}</Chip>
        <DeadlineChip deadline={scholarship.deadline} days={match.daysUntilDeadline} />
        <EffortChip hours={match.effort.hours} />
        {scholarship.renewable && <Chip tone="green">Renewable</Chip>}
        {scholarship.categories.slice(0, 2).map((category) => (
          <Chip key={category}>{category}</Chip>
        ))}
      </div>

      <MatchMetrics match={match} />

      <p className="small muted" style={{ margin: '0 0 6px' }}>
        {scholarship.description}
      </p>

      <WhyQualify match={match} />

      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <button
          type="button"
          className={`btn tiny${saved ? '' : ' primary'}`}
          disabled={saved}
          onClick={() => store.saveScholarship(scholarship.id)}
        >
          {saved ? 'Saved' : 'Save & plan'}
        </button>
        <button type="button" className="btn tiny" onClick={() => store.toggleComparison(scholarship.id)}>
          {comparing ? 'In comparison' : 'Compare'}
        </button>
        <a className="btn tiny" href={scholarship.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          Open site
        </a>
        <button type="button" className="btn tiny subtle" onClick={() => store.dismiss(scholarship.id)}>
          Not interested
        </button>
      </div>
    </div>
  );
}
