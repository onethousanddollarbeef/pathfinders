/**
 * On-page overlay.
 *
 * Rendered into a shadow root so no host page CSS can leak in or out, and kept
 * deliberately small: a single card in the corner that offers to fill the form
 * and then reports exactly what it did.
 */

import type { FillReport } from '../core/autofill';

const HOST_ID = 'scholarpath-overlay-host';

const STYLES = `
  :host { all: initial; }
  .card {
    position: fixed;
    right: 16px;
    bottom: 16px;
    width: 320px;
    background: #ffffff;
    color: #111827;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    z-index: 2147483647;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: linear-gradient(135deg, #f97316, #c2410c);
    color: #ffffff;
    font-weight: 600;
  }
  .header .dot { width: 8px; height: 8px; border-radius: 50%; background: #a5f3fc; }
  .header .spacer { flex: 1; }
  .header button {
    background: transparent;
    border: none;
    color: #ffedd5;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 2px 4px;
  }
  .body { padding: 12px; }
  .body p { margin: 0 0 8px; }
  .muted { color: #6b7280; font-size: 12px; }
  .actions { display: flex; gap: 8px; margin-top: 10px; }
  button.primary {
    flex: 1;
    background: #ea580c;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 10px;
    font-weight: 600;
    cursor: pointer;
  }
  button.primary:hover { background: #c2410c; }
  button.ghost {
    background: #f3f4f6;
    color: #374151;
    border: none;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
  }
  ul { margin: 6px 0 0; padding-left: 16px; max-height: 140px; overflow-y: auto; }
  li { margin-bottom: 3px; }
  .pill {
    display: inline-block;
    background: #ffedd5;
    color: #9a3412;
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 11px;
    margin-right: 4px;
  }
  .warn { color: #92400e; }
`;

const HIGHLIGHT_CLASS = 'scholarpath-filled-highlight';

function ensureHighlightStyles(): void {
  if (document.getElementById('scholarpath-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 'scholarpath-highlight-styles';
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 2px solid #f97316 !important;
      outline-offset: 1px !important;
      background-color: rgba(249, 115, 22, 0.08) !important;
      transition: outline-color 1.2s ease-out;
    }
  `;
  document.documentElement.appendChild(style);
}

export interface OverlayHandlers {
  onFill: () => void;
  onOpenPanel: () => void;
  onDismiss: () => void;
}

export class Overlay {
  private root: ShadowRoot;
  private container: HTMLDivElement;

  constructor() {
    const existing = document.getElementById(HOST_ID);
    existing?.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);

    this.root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.root.appendChild(style);

    this.container = document.createElement('div');
    this.root.appendChild(this.container);
  }

  private render(bodyHtml: string): HTMLElement {
    this.container.innerHTML = `
      <div class="card">
        <div class="header">
          <span class="dot"></span>
          <span>ScholarPath</span>
          <span class="spacer"></span>
          <button data-action="close" aria-label="Close">×</button>
        </div>
        <div class="body">${bodyHtml}</div>
      </div>
    `;
    const close = this.container.querySelector('[data-action="close"]');
    close?.addEventListener('click', () => this.hide());
    return this.container;
  }

  showOffer(fillable: number, total: number, handlers: OverlayHandlers): void {
    this.render(`
      <p><strong>This looks like an application form.</strong></p>
      <p class="muted">${fillable} of ${total} field${total === 1 ? '' : 's'} match your saved profile.</p>
      <div class="actions">
        <button class="primary" data-action="fill">Fill ${fillable} field${fillable === 1 ? '' : 's'}</button>
        <button class="ghost" data-action="panel">Open panel</button>
      </div>
    `);
    this.container.querySelector('[data-action="fill"]')?.addEventListener('click', handlers.onFill);
    this.container.querySelector('[data-action="panel"]')?.addEventListener('click', handlers.onOpenPanel);
    this.container.querySelector('[data-action="close"]')?.addEventListener('click', handlers.onDismiss);
  }

  showReport(report: FillReport): void {
    const reviewList = report.needsReview
      .map((item) => `<li><span class="pill">${escapeHtml(item.label)}</span>${escapeHtml(item.reason)}</li>`)
      .join('');
    const missingList = report.missing
      .slice(0, 6)
      .map((item) => `<li>${escapeHtml(item.label)}</li>`)
      .join('');

    this.render(`
      <p><strong>Filled ${report.filled.length} field${report.filled.length === 1 ? '' : 's'}.</strong></p>
      ${report.needsReview.length > 0 ? `<p class="warn">Check these ${report.needsReview.length}:</p><ul>${reviewList}</ul>` : ''}
      ${report.missing.length > 0 ? `<p class="muted">Not in your profile yet:</p><ul class="muted">${missingList}</ul>` : ''}
      <p class="muted" style="margin-top:8px">Always reread before you submit — nothing is submitted for you.</p>
      <div class="actions"><button class="ghost" data-action="close">Done</button></div>
    `);
    this.container.querySelectorAll('[data-action="close"]').forEach((node) => {
      node.addEventListener('click', () => this.hide());
    });
  }

  showMessage(message: string): void {
    this.render(`<p>${escapeHtml(message)}</p>`);
    window.setTimeout(() => this.hide(), 4000);
  }

  hide(): void {
    this.container.innerHTML = '';
  }
}

export function highlightElements(elements: Element[]): void {
  ensureHighlightStyles();
  for (const element of elements) {
    element.classList.add(HIGHLIGHT_CLASS);
  }
  window.setTimeout(() => {
    for (const element of elements) element.classList.remove(HIGHLIGHT_CLASS);
  }, 6000);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
