import { useCallback, useEffect, useState } from 'react';
import { matchScholarship } from '../../core/matching';
import { Chip, EmptyState, money } from './common';
import type { AppStore } from '../useAppState';
import type { ContentResponse, FieldPreview, PanelToContentMessage } from '../../shared/messages';
import type { CapturedScholarship } from '../../core/pageCapture';
import type { FillReport, FormScan } from '../../core/autofill';

async function sendToActiveTab(message: PanelToContentMessage): Promise<ContentResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: 'No active tab.' };
  try {
    return (await chrome.tabs.sendMessage(tab.id, message)) as ContentResponse;
  } catch {
    return {
      ok: false,
      error: 'ScholarPath cannot read this page. Browser pages, the Chrome Web Store and PDFs are off limits — open the scholarship site in a normal tab and try again.',
    };
  }
}

/**
 * "This page" tab: scans the open tab, previews exactly what would be written
 * where, fills it, and can capture the listing into the catalog.
 */
export function PageView({ store }: { store: AppStore }) {
  const [scan, setScan] = useState<FormScan | undefined>();
  const [pageTitle, setPageTitle] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [previews, setPreviews] = useState<FieldPreview[]>([]);
  const [missing, setMissing] = useState<{ key: string; label: string }[]>([]);
  const [report, setReport] = useState<FillReport | undefined>();
  const [captured, setCaptured] = useState<CapturedScholarship | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const settings = store.state?.settings;

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    setReport(undefined);
    const scanResponse = await sendToActiveTab({ type: 'sp:scan-page' });
    if (!scanResponse.ok) {
      setError(scanResponse.error);
      setScan(undefined);
      setBusy(false);
      return;
    }
    if (scanResponse.type === 'scan') {
      setScan(scanResponse.scan);
      setPageTitle(scanResponse.pageTitle);
      setPageUrl(scanResponse.url);
    }
    const previewResponse = await sendToActiveTab({ type: 'sp:preview-fill' });
    if (previewResponse.ok && previewResponse.type === 'preview') {
      setPreviews(previewResponse.fields);
      setMissing(previewResponse.missing);
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fill = async () => {
    setBusy(true);
    const response = await sendToActiveTab({
      type: 'sp:autofill',
      overwriteExisting: false,
      minConfidence: settings?.strictAutofill ? 0.8 : 0.6,
    });
    if (!response.ok) setError(response.error);
    else if (response.type === 'fill') setReport(response.report);
    setBusy(false);
  };

  const capture = async () => {
    setBusy(true);
    const response = await sendToActiveTab({ type: 'sp:capture-scholarship' });
    if (!response.ok) setError(response.error);
    else if (response.type === 'capture') setCaptured(response.captured);
    setBusy(false);
  };

  return (
    <div className="view">
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>This page</h2>
          <button type="button" className="btn tiny" onClick={() => void refresh()} disabled={busy}>
            Rescan
          </button>
        </div>
        <p className="small muted" style={{ margin: '4px 0 0', wordBreak: 'break-all' }}>
          {pageTitle || pageUrl || 'Open a scholarship page in the active tab.'}
        </p>

        {error && (
          <div className="banner warn" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        {scan && (
          <>
            <div className="grid-3" style={{ marginTop: 8 }}>
              <div className="metric">
                <span className="value">{scan.totalFields}</span>
                <span className="label">Fields</span>
              </div>
              <div className="metric">
                <span className="value">{scan.fillableFields}</span>
                <span className="label">Fillable</span>
              </div>
              <div className="metric">
                <span className="value">{scan.looksLikeApplication ? 'Yes' : 'No'}</span>
                <span className="label">Application?</span>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <button type="button" className="btn primary tiny" onClick={() => void fill()} disabled={busy || scan.fillableFields === 0}>
                Fill {scan.fillableFields} field{scan.fillableFields === 1 ? '' : 's'}
              </button>
              <button type="button" className="btn tiny" onClick={() => void capture()} disabled={busy}>
                Capture scholarship
              </button>
            </div>
          </>
        )}
      </div>

      {report && (
        <div className="card">
          <h3>Filled {report.filled.length} field(s)</h3>
          {report.filled.length > 0 && (
            <ul className="reasons">
              {report.filled.map((item) => (
                <li key={`${item.key}-${item.label}`} className="met">
                  <span className="icon">✓</span>
                  <span>
                    <strong>{item.label}</strong> → {truncate(item.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report.needsReview.length > 0 && (
            <>
              <p className="section-title" style={{ marginTop: 8 }}>
                Check these yourself
              </p>
              <ul className="reasons">
                {report.needsReview.map((item) => (
                  <li key={`${item.key}-${item.label}`} className="unknown">
                    <span className="icon">!</span>
                    <span>
                      <strong>{item.label}</strong> — {item.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="banner info" style={{ marginTop: 8 }}>
            Nothing was submitted. Read every answer before you send the form.
          </div>
        </div>
      )}

      {previews.length > 0 && !report && (
        <div className="card">
          <h3>What would be filled</h3>
          <ul className="reasons">
            {previews.map((preview) => (
              <li key={`${preview.key}-${preview.label}`}>
                <span className="confidence-bar" style={{ marginTop: 4 }}>
                  <span className={preview.confidence < 0.6 ? 'low' : ''} style={{ width: `${preview.confidence * 100}%` }} />
                </span>
                <span>
                  <strong>{preview.label}</strong> → {truncate(preview.value)}
                  <span className="muted"> · matched by {preview.reason}</span>
                </span>
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <p className="small muted" style={{ marginTop: 8 }}>
              Recognized but empty in your profile: {missing.map((item) => item.label).join(', ')}.
            </p>
          )}
        </div>
      )}

      {scan && scan.totalFields === 0 && !error && (
        <EmptyState title="No form fields here" hint="Open the actual application form, then rescan." />
      )}

      {captured && <CaptureReview captured={captured} store={store} onDone={() => setCaptured(undefined)} />}

      <div className="card">
        <h3>Autofill settings</h3>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings?.autofillEnabled ?? true}
            onChange={(event) => store.updateSettings({ autofillEnabled: event.target.checked })}
          />
          Offer to fill forms automatically when a page looks like an application
        </label>
        <label className="checkbox" style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={settings?.strictAutofill ?? false}
            onChange={(event) => store.updateSettings({ strictAutofill: event.target.checked })}
          />
          Strict mode — only fill fields matched with high confidence
        </label>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Passwords, SSN, and payment fields are never filled. Existing answers are never overwritten.
        </p>
      </div>
    </div>
  );
}

function CaptureReview({
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

  return (
    <div className="card">
      <h3>Captured from this page</h3>
      {captured.uncertainFields.length > 0 && (
        <div className="banner warn" style={{ marginBottom: 8 }}>
          Could not confidently read: {captured.uncertainFields.join(', ')}. Check the values below before saving.
        </div>
      )}
      <div className="stack">
        <label className="field">
          Name
          <input type="text" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <div className="grid-2">
          <label className="field">
            Award (min)
            <input
              type="number"
              value={draft.amountMin}
              onChange={(event) => setDraft({ ...draft, amountMin: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            Award (max)
            <input
              type="number"
              value={draft.amountMax}
              onChange={(event) => setDraft({ ...draft, amountMax: Number(event.target.value) })}
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
            store.saveScholarship(draft.id);
            onDone();
          }}
        >
          Save and track
        </button>
        <button type="button" className="btn tiny" onClick={onDone}>
          Discard
        </button>
      </div>
    </div>
  );
}

function truncate(value: string, length = 60): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
