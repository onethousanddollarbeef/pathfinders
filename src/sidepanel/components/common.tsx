import type { ReactNode } from 'react';
import { formatDeadline } from '../../core/dates';
import { effortBand } from '../../core/effort';
import { totalAwardValue } from '../../core/matching';
import type { MatchResult, MatchVerdict, RuleEvaluation } from '../../core/types';

export function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export function Chip({
  children,
  tone = 'default',
  onClick,
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'green' | 'amber' | 'red';
  onClick?: () => void;
  title?: string;
}) {
  const className = `chip${tone === 'default' ? '' : ` ${tone}`}${onClick ? ' removable' : ''}`;
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title} style={{ border: 'none' }}>
        {children}
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

const VERDICT_TONE: Record<MatchVerdict, 'green' | 'accent' | 'amber' | 'red'> = {
  eligible: 'green',
  'likely-eligible': 'accent',
  'needs-info': 'amber',
  'not-eligible': 'red',
};

const VERDICT_LABEL: Record<MatchVerdict, string> = {
  eligible: 'You qualify',
  'likely-eligible': 'Likely qualify',
  'needs-info': 'Needs info',
  'not-eligible': 'Not eligible',
};

export function VerdictBadge({ verdict }: { verdict: MatchVerdict }) {
  return <Chip tone={VERDICT_TONE[verdict]}>{VERDICT_LABEL[verdict]}</Chip>;
}

export function DeadlineChip({ deadline, days }: { deadline: string; days: number }) {
  const tone = days < 0 ? 'red' : days <= 10 ? 'amber' : 'default';
  return <Chip tone={tone}>{formatDeadline(deadline)}</Chip>;
}

export function EffortChip({ hours }: { hours: number }) {
  const band = effortBand(hours);
  const tone = band === 'low' ? 'green' : band === 'medium' ? 'default' : 'amber';
  return <Chip tone={tone}>{`${hours} hr${hours === 1 ? '' : 's'} effort`}</Chip>;
}

export function Progress({ value, green }: { value: number; green?: boolean }) {
  return (
    <div className={`progress${green ? ' green' : ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function ReasonList({ evaluations, kind }: { evaluations: RuleEvaluation[]; kind: 'met' | 'not-met' | 'unknown' }) {
  if (evaluations.length === 0) return null;
  const icon = kind === 'met' ? '✓' : kind === 'not-met' ? '✕' : '?';
  return (
    <ul className="reasons">
      {evaluations.map((evaluation) => (
        <li key={evaluation.rule.id} className={kind}>
          <span className="icon">{icon}</span>
          <span>{evaluation.explanation}</span>
        </li>
      ))}
    </ul>
  );
}

export function MatchMetrics({ match }: { match: MatchResult }) {
  return (
    <div className="metric-grid">
      <div className="metric">
        <span className="value">{money(totalAwardValue(match.scholarship))}</span>
        <span className="label">Award</span>
      </div>
      <div className="metric">
        <span className="value">{match.effort.hours} hr</span>
        <span className="label">Effort</span>
      </div>
      <div className="metric">
        <span className="value">{(match.winProbability * 100).toFixed(1)}%</span>
        <span className="label">Odds</span>
      </div>
      <div className="metric">
        <span className="value">{money(match.expectedValuePerHour)}</span>
        <span className="label">Per hour</span>
      </div>
    </div>
  );
}

/**
 * The "why do I qualify?" disclosure. Requirements met, requirements failed and
 * unanswered questions are listed separately so the reason for a verdict is
 * never a mystery.
 */
export function WhyQualify({ match }: { match: MatchResult }) {
  const { reasonsQualified, reasonsDisqualified, missingInfo, readinessGaps } = match;
  return (
    <details>
      <summary>
        Why this match? ({reasonsQualified.length} met
        {reasonsDisqualified.length > 0 ? `, ${reasonsDisqualified.length} failed` : ''}
        {missingInfo.length > 0 ? `, ${missingInfo.length} unknown` : ''})
      </summary>
      <div style={{ marginTop: 6 }}>
        <ReasonList evaluations={reasonsDisqualified} kind="not-met" />
        <ReasonList evaluations={missingInfo} kind="unknown" />
        <ReasonList evaluations={reasonsQualified} kind="met" />
        {match.effort.reusableEssayIds.length > 0 && (
          <p className="small" style={{ margin: '6px 0 0', color: 'var(--green)' }}>
            Reuses an essay you already wrote — saves about {match.effort.hoursSavedByReuse} hrs.
          </p>
        )}
        {readinessGaps.length > 0 && (
          <ul className="reasons" style={{ marginTop: 6 }}>
            {readinessGaps.map((gap) => (
              <li key={gap} className="unknown">
                <span className="icon">!</span>
                <span>{gap}</span>
              </li>
            ))}
          </ul>
        )}
        <details style={{ marginTop: 6 }}>
          <summary>Effort breakdown ({match.effort.hours} hrs)</summary>
          <ul className="reasons">
            {match.effort.breakdown.map((item) => (
              <li key={item.label}>
                <span className="icon">•</span>
                <span>
                  {item.label} — {item.hours} hr
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </details>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {hint && <div className="small">{hint}</div>}
    </div>
  );
}
