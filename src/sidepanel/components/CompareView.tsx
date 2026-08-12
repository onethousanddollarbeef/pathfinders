import { buildComparison } from '../../core/matching';
import { EmptyState, VerdictBadge } from './common';
import type { AppStore } from '../useAppState';

/**
 * Side-by-side comparison. Best value in each row is highlighted so the
 * trade-off between a big award and a cheap one is visible at a glance.
 */
export function CompareView({ store }: { store: AppStore }) {
  const selectedIds = store.state?.settings.comparisonIds ?? [];
  const selected = selectedIds
    .map((id) => store.matches.find((match) => match.scholarship.id === id))
    .filter((match): match is NonNullable<typeof match> => Boolean(match));

  if (selected.length === 0) {
    return (
      <div className="view">
        <EmptyState
          title="Nothing to compare yet"
          hint="Tap Compare on any scholarship in Discover to line up to four side by side."
        />
      </div>
    );
  }

  const rows = buildComparison(selected);
  const bestOverall = [...selected].sort((a, b) => b.expectedValuePerHour - a.expectedValuePerHour)[0];

  return (
    <div className="view">
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Comparing {selected.length}</h2>
          <button
            type="button"
            className="btn tiny"
            onClick={() => selectedIds.forEach((id) => store.toggleComparison(id))}
          >
            Clear
          </button>
        </div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Best return for your time: <strong>{bestOverall.scholarship.name}</strong> at $
          {bestOverall.expectedValuePerHour.toLocaleString()}/hr. Expected value accounts for award size, your fit, and
          how many people typically apply.
        </p>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="compare">
          <thead>
            <tr>
              <th className="metric-label" />
              {selected.map((match) => (
                <th key={match.scholarship.id} className="col-head">
                  {match.scholarship.name}
                  <div style={{ marginTop: 4 }}>
                    <VerdictBadge verdict={match.verdict} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="metric-label">{row.label}</td>
                {row.values.map((value, index) => (
                  <td key={`${row.key}-${index}`} className={row.bestIndexes.includes(index) ? 'best' : undefined}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="metric-label">Requirements</td>
              {selected.map((match) => (
                <td key={`${match.scholarship.id}-req`}>
                  <ul style={{ margin: 0, paddingLeft: 14 }}>
                    {requirementList(match.scholarship.requirements).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
            <tr>
              <td className="metric-label">Blockers</td>
              {selected.map((match) => (
                <td key={`${match.scholarship.id}-block`}>
                  {match.reasonsDisqualified.length === 0 && match.missingInfo.length === 0 ? (
                    <span style={{ color: 'var(--green)' }}>None</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 14 }}>
                      {[...match.reasonsDisqualified, ...match.missingInfo].map((evaluation) => (
                        <li key={evaluation.rule.id}>{evaluation.rule.label}</li>
                      ))}
                    </ul>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Actions</h3>
        <div className="row wrap" style={{ gap: 6 }}>
          {selected.map((match) => (
            <button
              key={match.scholarship.id}
              type="button"
              className="btn tiny"
              onClick={() => store.saveScholarship(match.scholarship.id)}
            >
              Save {match.scholarship.name.slice(0, 22)}
              {match.scholarship.name.length > 22 ? '…' : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function requirementList(requirements: {
  essayCount: number;
  essayWordCounts: number[];
  recommendationLetters: number;
  transcriptRequired: boolean;
  fafsaRequired: boolean;
  portfolioRequired: boolean;
  interviewRequired: boolean;
  videoRequired: boolean;
  otherRequirements: string[];
}): string[] {
  const items: string[] = [];
  if (requirements.essayCount > 0) {
    items.push(
      `${requirements.essayCount} essay${requirements.essayCount === 1 ? '' : 's'}${
        requirements.essayWordCounts.length ? ` (${requirements.essayWordCounts.join(', ')} words)` : ''
      }`,
    );
  }
  if (requirements.recommendationLetters > 0) items.push(`${requirements.recommendationLetters} letter(s)`);
  if (requirements.transcriptRequired) items.push('Transcript');
  if (requirements.fafsaRequired) items.push('FAFSA');
  if (requirements.portfolioRequired) items.push('Portfolio');
  if (requirements.interviewRequired) items.push('Interview');
  if (requirements.videoRequired) items.push('Video');
  items.push(...requirements.otherRequirements);
  return items.length > 0 ? items : ['Form only'];
}
