import { useCallback, useEffect, useMemo, useState } from 'react';
import { matchAll } from '../../core/matching';
import { fetchCatalogScholarships } from '../../core/supabaseScholarships';
import { SCHOLARSHIP_SEARCH_SITES } from '../../data/realScholarshipUrls';
import type { MatchResult, Scholarship } from '../../core/types';
import { Chip, DeadlineChip, EmptyState, money } from './common';
import type { AppStore } from '../useAppState';

export function ExploreView({ store }: { store: AppStore }) {
  const [catalog, setCatalog] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>();

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const rows = await fetchCatalogScholarships();
      setCatalog(rows);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      setError('Could not load scholarships. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const matches = useMemo(() => {
    if (!store.state || catalog.length === 0) return [];
    return matchAll(catalog, store.state.profile);
  }, [catalog, store.state]);

  const save = (match: MatchResult) => {
    store.addCustomScholarship(match.scholarship);
    store.saveScholarship(match.scholarship.id);
  };

  const updatedLabel = lastUpdated
    ? `Last updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : undefined;

  return (
    <div className="view">
      <div className="card">
        <div className="spread">
          <h2 className="section-heading" style={{ margin: 0 }}>Suggested scholarships</h2>
          <button type="button" className="btn tiny" disabled={loading} onClick={() => void loadCatalog()}>
            Refresh
          </button>
        </div>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Pulled from the Nexus catalog when you open this tab{updatedLabel ? ` · ${updatedLabel}` : ''}. Tap Refresh
          for the latest list — not a live stream, but always current when you reload.
        </p>
      </div>

      {loading && <div className="empty">Loading scholarships…</div>}
      {error && <div className="banner warn">{error}</div>}

      {!loading && !error && matches.length === 0 && (
        <EmptyState title="No scholarships loaded" hint="Check your connection and tap Refresh." />
      )}

      {matches.map((match) => (
        <div key={match.scholarship.id} className="match-card">
          <div className="spread">
            <div>
              <h3>{match.scholarship.name}</h3>
              <div className="sponsor">{match.scholarship.sponsor}</div>
            </div>
            <Chip tone={match.verdict === 'not-eligible' ? 'red' : match.verdict === 'eligible' ? 'green' : 'amber'}>
              {match.fitScore}% fit
            </Chip>
          </div>
          <p className="small muted" style={{ margin: '6px 0' }}>{match.scholarship.description}</p>
          <div className="row wrap" style={{ gap: 4, marginBottom: 8 }}>
            <Chip tone="accent">{money(match.scholarship.amountMax)}</Chip>
            <DeadlineChip deadline={match.scholarship.deadline} days={match.daysUntilDeadline} />
            <Chip>{match.effort.hours} hrs</Chip>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <a className="btn tiny primary" href={match.scholarship.url} target="_blank" rel="noreferrer">
              View on site
            </a>
            <button type="button" className="btn tiny" onClick={() => save(match)}>
              Save to tracker
            </button>
          </div>
        </div>
      ))}

      <div className="card">
        <h2 className="section-heading">Scholarship search sites</h2>
        <p className="small muted" style={{ margin: '4px 0 10px' }}>
          These sites update their listings often. Browse there, then save anything you find here or on the Nexus website.
        </p>
        <div className="stack">
          {SCHOLARSHIP_SEARCH_SITES.map((site) => (
            <a key={site.url} className="explore-site-link" href={site.url} target="_blank" rel="noreferrer">
              <strong>{site.name}</strong>
              <span className="small muted">{site.description}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
