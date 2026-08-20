import { useState } from 'react';
import { matchScholarship } from '../../core/matching';
import { Chip, money } from './common';
import type { AppStore } from '../useAppState';
import type { CapturedScholarship } from '../../core/pageCapture';

/** Lets the student confirm or edit details after a page capture. */
export function CaptureReview({
  captured,
  store,
  onDone,
}: {
  captured: CapturedScholarship;
  store: AppStore;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(captured.draft);
  const profile = store.state?.profile;
  const match = profile ? matchScholarship(draft, profile) : undefined;

  const discard = () => {
    store.removeCustomScholarship(draft.id);
    onDone();
  };

  return (
    <div className="card">
      <h3>Just captured — review details</h3>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>
        This scholarship is in your Applications list. Confirm the details below or remove it.
      </p>
      {captured.uncertainFields.length > 0 && (
        <div className="banner warn" style={{ marginBottom: 8 }}>
          Could not confidently read: {captured.uncertainFields.join(', ')}.
          {draft.amountUnknown
            ? ' The page link is saved — add the award amount later if you know it.'
            : ' Check the values below before saving.'}
        </div>
      )}
      <div className="stack">
        <label className="field">
          Page link
          <input type="url" readOnly value={draft.url} />
        </label>
        <label className="field">
          Name
          <input type="text" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <div className="grid-2">
          <label className="field">
            Award (min)
            <input
              type="number"
              placeholder={draft.amountUnknown ? 'Unknown' : undefined}
              value={draft.amountUnknown ? '' : draft.amountMin || ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  amountUnknown: false,
                  amountMin: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="field">
            Award (max)
            <input
              type="number"
              placeholder={draft.amountUnknown ? 'Unknown' : undefined}
              value={draft.amountUnknown ? '' : draft.amountMax || ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  amountUnknown: false,
                  amountMax: Number(event.target.value),
                })
              }
            />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            Deadline
            <input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
          </label>
          <label className="field">
            Essays required
            <input
              type="number"
              value={draft.requirements.essayCount}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  requirements: { ...draft.requirements, essayCount: Number(event.target.value) },
                })
              }
            />
          </label>
        </div>
      </div>

      {captured.evidence.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary>Where these came from</summary>
          <ul className="reasons">
            {captured.evidence.map((item) => (
              <li key={item.field}>
                <span className="icon">•</span>
                <span>
                  <strong>{item.field}:</strong> {item.snippet}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {match && (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Estimated {match.effort.hours} hrs of work · {money(match.expectedValuePerHour)}/hr expected ·{' '}
          <Chip tone={match.verdict === 'not-eligible' ? 'red' : 'green'}>{match.verdict}</Chip>
        </p>
      )}

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button
          type="button"
          className="btn primary tiny"
          onClick={() => {
            store.addCustomScholarship(draft);
            onDone();
          }}
        >
          Save details
        </button>
        {draft.amountUnknown && (
          <span className="small muted">Page link saved even without an award amount.</span>
        )}
        <button type="button" className="btn tiny" onClick={discard}>
          Remove from Applications
        </button>
      </div>
    </div>
  );
}
