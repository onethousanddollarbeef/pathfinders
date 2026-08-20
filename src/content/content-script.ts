/**
 * Content script.
 *
 * Runs on every page the student visits so that (a) the side panel can ask what
 * is on the page and fill it, and (b) an application form can proactively offer
 * to fill itself. It reads the profile from local storage and never sends
 * anything anywhere.
 */

import { applyFill, detectFields, scanPage } from '../core/autofill';
import { captureScholarship } from '../core/pageCapture';
import { loadState } from '../core/storage';
import { Overlay, highlightElements } from './overlay';
import type { ContentResponse, FieldPreview, PanelToContentMessage } from '../shared/messages';
import { setPendingCaptureReview } from '../shared/pendingCapture';

const INIT_KEY = '__nexusContentScriptLoaded';

const INIT_KEY = '__nexusContentScriptLoaded';

const DISMISS_KEY = 'scholarpath:dismissed-origins';
let overlay: Overlay | undefined;

function getOverlay(): Overlay {
  if (!overlay) overlay = new Overlay();
  return overlay;
}

async function isDismissed(): Promise<boolean> {
  const stored = await chrome.storage.session?.get(DISMISS_KEY).catch(() => undefined);
  const list: string[] = stored?.[DISMISS_KEY] ?? [];
  return list.includes(location.host);
}

async function dismissForSession(): Promise<void> {
  const stored = await chrome.storage.session?.get(DISMISS_KEY).catch(() => undefined);
  const list: string[] = stored?.[DISMISS_KEY] ?? [];
  await chrome.storage.session?.set({ [DISMISS_KEY]: [...new Set([...list, location.host])] });
}

async function runAutofill(overwriteExisting: boolean, minConfidence: number): Promise<ContentResponse> {
  const state = await loadState();
  const fields = detectFields(document, state.profile, { overwriteExisting });
  const report = applyFill(fields, { minConfidence });
  const filledKeys = new Set(report.filled.map((item) => item.key));
  highlightElements(fields.filter((field) => filledKeys.has(field.key)).map((field) => field.element));
  getOverlay().showReport(report);
  return { ok: true, type: 'fill', report };
}

async function previewFill(): Promise<ContentResponse> {
  const state = await loadState();
  const fields = detectFields(document, state.profile, { overwriteExisting: true });
  const previews: FieldPreview[] = fields
    .filter((field) => !field.missingProfileValue && field.action !== 'skip')
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: field.value,
      confidence: field.confidence,
      reason: field.reason,
    }));
  const missing = fields
    .filter((field) => field.missingProfileValue)
    .map((field) => ({ key: field.key, label: field.label }));
  return { ok: true, type: 'preview', fields: previews, missing };
}

/** Visible text only — script/style content would poison the heuristics. */
function readablePageText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, noscript, svg, nav, footer').forEach((node) => node.remove());
  return clone.innerText ?? clone.textContent ?? '';
}

async function handleMessage(message: PanelToContentMessage): Promise<ContentResponse> {
  const state = await loadState();
  switch (message.type) {
    case 'sp:ping':
      return { ok: true, type: 'ping' };
    case 'sp:scan-page':
      return {
        ok: true,
        type: 'scan',
        scan: scanPage(document, state.profile),
        pageTitle: document.title,
        url: location.href,
      };
    case 'sp:preview-fill':
      return previewFill();
    case 'sp:autofill':
      return runAutofill(message.overwriteExisting, message.minConfidence);
    case 'sp:capture-scholarship': {
      const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? undefined;
      const captured = captureScholarship({
        url: location.href,
        title: document.title,
        text: readablePageText(),
        description,
      });
      await setPendingCaptureReview(captured);
      getOverlay().showMessage(`Saved "${captured.draft.name}" to Applications — open Nexus to review.`);
      return { ok: true, type: 'capture', captured };
    }
    case 'sp:highlight-field': {
      const fields = detectFields(document, state.profile, { overwriteExisting: true });
      const target = fields.find((field) => field.key === message.key);
      if (target) {
        target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightElements([target.element]);
      }
      return { ok: true, type: 'preview', fields: [], missing: [] };
    }
    default:
      return { ok: false, error: 'Unknown message' };
  }
}

/** Offers autofill once per host per session, only on pages that look like forms. */
async function maybeOfferAutofill(): Promise<void> {
  try {
    const state = await loadState();
    if (!state.settings.autofillEnabled) return;
    if (!state.profile.firstName && !state.profile.email) return;
    if (await isDismissed()) return;

    const scan = scanPage(document, state.profile);
    if (!scan.looksLikeApplication || scan.fillableFields < 3) return;

    getOverlay().showOffer(scan.fillableFields, scan.totalFields, {
      onFill: () => {
        void runAutofill(false, state.settings.strictAutofill ? 0.8 : 0.6);
      },
      onOpenPanel: () => {
        void chrome.runtime.sendMessage({ type: 'ct:open-panel' });
      },
      onDismiss: () => {
        void dismissForSession();
      },
    });
  } catch {
    // A page we cannot read is not an error worth surfacing to the student.
  }
}

if (!(globalThis as Record<string, unknown>)[INIT_KEY]) {
  (globalThis as Record<string, unknown>)[INIT_KEY] = true;

  chrome.runtime.onMessage.addListener((message: PanelToContentMessage, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void maybeOfferAutofill());
  } else {
    void maybeOfferAutofill();
  }
}
