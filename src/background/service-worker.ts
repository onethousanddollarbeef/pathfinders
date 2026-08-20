/**
 * Background service worker.
 *
 * Owns the things a side panel cannot: opening the panel from a click or
 * shortcut, context menus, and the daily deadline check that turns saved
 * applications into notifications before it is too late to act on them.
 */

import { daysUntil } from '../core/dates';
import { SEED_SCHOLARSHIPS } from '../data/scholarships';
import { loadState } from '../core/storage';
import { resolveDeadline } from '../core/tracker';
import type { PanelToContentMessage } from '../shared/messages';
import { sendToTab as deliverToTab } from '../shared/tabMessaging';

const DEADLINE_ALARM = 'scholarpath:deadline-check';
const CONTEXT_AUTOFILL = 'scholarpath:autofill';
const CONTEXT_CAPTURE = 'scholarpath:capture';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  // Content scripts remember a per-site dismissal in session storage, which is
  // only readable from an untrusted context once the access level is widened.
  await chrome.storage.session
    .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch(() => {});

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_AUTOFILL,
      title: 'Fill this form with my Nexus profile',
      contexts: ['page', 'editable'],
    });
    chrome.contextMenus.create({
      id: CONTEXT_CAPTURE,
      title: 'Save this scholarship to Nexus',
      contexts: ['page', 'link', 'selection'],
    });
  });

  chrome.alarms.create(DEADLINE_ALARM, { periodInMinutes: 60 * 12 });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === CONTEXT_AUTOFILL) {
    const state = await loadState();
    await sendToTab(tab.id, {
      type: 'sp:autofill',
      overwriteExisting: false,
      minConfidence: state.settings.strictAutofill ? 0.8 : 0.6,
    });
  }
  if (info.menuItemId === CONTEXT_CAPTURE) {
    await openPanel(tab.windowId);
    await sendToTab(tab.id, { type: 'sp:capture-scholarship' });
  }
});

chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === 'autofill-page') {
    const state = await loadState();
    await sendToTab(tab.id, {
      type: 'sp:autofill',
      overwriteExisting: false,
      minConfidence: state.settings.strictAutofill ? 0.8 : 0.6,
    });
  }
  if (command === 'open-panel') await openPanel(tab.windowId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ct:open-panel') {
    void openPanel(sender.tab?.windowId);
    sendResponse({ ok: true });
    return true;
  }
  return undefined;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== DEADLINE_ALARM) return;
  await notifyUpcomingDeadlines();
});

async function openPanel(windowId?: number): Promise<void> {
  try {
    if (windowId !== undefined) await chrome.sidePanel.open({ windowId });
  } catch {
    // Opening requires a user gesture in some contexts; failing is non-fatal.
  }
}

async function sendToTab(tabId: number, message: PanelToContentMessage): Promise<void> {
  try {
    await deliverToTab(tabId, message);
  } catch {
    // The content script still cannot run on blocked pages after injection.
  }
}

/**
 * Warns once per day about anything saved or in progress that closes within a
 * week — the failure mode this extension exists to prevent.
 */
async function notifyUpcomingDeadlines(): Promise<void> {
  const state = await loadState();
  const catalog = [...SEED_SCHOLARSHIPS, ...state.customScholarships];
  const active = state.applications.filter((app) => app.status === 'saved' || app.status === 'started');
  if (active.length === 0) return;

  const urgent = active
    .map((app) => {
      const scholarship = catalog.find((entry) => entry.id === app.scholarshipId);
      if (!scholarship) return undefined;
      return { scholarship, days: daysUntil(resolveDeadline(app, scholarship)) };
    })
    .filter((entry): entry is { scholarship: (typeof catalog)[number]; days: number } => Boolean(entry))
    .filter((entry) => entry.days >= 0 && entry.days <= 7)
    .sort((a, b) => a.days - b.days);

  if (urgent.length === 0) return;

  const first = urgent[0];
  const extra = urgent.length > 1 ? ` (+${urgent.length - 1} more this week)` : '';
  await chrome.notifications.create(`scholarpath:deadline:${first.scholarship.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: first.days === 0 ? 'Due today' : `Due in ${first.days} day(s)`,
    message: `${first.scholarship.name}${extra}`,
    priority: 2,
  });
}

chrome.notifications?.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await openPanel(tab?.windowId);
});
