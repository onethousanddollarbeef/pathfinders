/** Message contract between the side panel, the background worker and content scripts. */

import type { CapturedScholarship } from '../core/pageCapture';
import type { FieldKey, FillReport, FormScan } from '../core/autofill';

export interface FieldPreview {
  key: FieldKey;
  label: string;
  value: string;
  confidence: number;
  reason: string;
}

export type PanelToContentMessage =
  | { type: 'sp:scan-page' }
  | { type: 'sp:preview-fill' }
  | { type: 'sp:autofill'; overwriteExisting: boolean; minConfidence: number }
  | { type: 'sp:capture-scholarship' }
  | { type: 'sp:highlight-field'; key: FieldKey };

export type ContentResponse =
  | { ok: true; type: 'scan'; scan: FormScan; pageTitle: string; url: string }
  | { ok: true; type: 'preview'; fields: FieldPreview[]; missing: { key: FieldKey; label: string }[] }
  | { ok: true; type: 'fill'; report: FillReport }
  | { ok: true; type: 'capture'; captured: CapturedScholarship }
  | { ok: false; error: string };

export type ContentToBackgroundMessage =
  | { type: 'ct:page-scanned'; scan: FormScan; url: string }
  | { type: 'ct:open-panel' };

export type BackgroundMessage =
  | { type: 'bg:open-panel' }
  | { type: 'bg:get-active-tab' };

export const CONTENT_SCRIPT_READY = 'ct:ready';
