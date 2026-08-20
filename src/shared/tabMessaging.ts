/** Reliable messaging from the side panel to the active web tab's content script. */

import type { ContentResponse, PanelToContentMessage } from './messages';

export function isReadableWebUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Resolve the student's scholarship tab (not chrome://, not the side panel). */
export async function getActiveWebTab(): Promise<chrome.tabs.Tab | undefined> {
  const candidates: chrome.tabs.Tab[] = [];

  const [lastFocused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (lastFocused) candidates.push(lastFocused);

  try {
    const window = await chrome.windows.getCurrent({ populate: true });
    const activeInWindow = window.tabs?.find((tab) => tab.active);
    if (activeInWindow) candidates.push(activeInWindow);
  } catch {
    // getCurrent can fail in some embedders; lastFocusedWindow above is enough.
  }

  for (const tab of candidates) {
    if (tab.id && isReadableWebUrl(tab.url)) return tab;
  }

  return undefined;
}

/** Ping the tab; inject `content.js` when the content script is not loaded yet. */
export async function ensureContentScript(tabId: number): Promise<void> {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: 'sp:ping' });
    if (pong?.ok) return;
  } catch {
    // Content script missing — inject below.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });

  // Give the injected script a moment to register its listener.
  await new Promise((resolve) => setTimeout(resolve, 50));
}

export async function sendToTab(tabId: number, message: PanelToContentMessage): Promise<ContentResponse> {
  await ensureContentScript(tabId);
  return (await chrome.tabs.sendMessage(tabId, message)) as ContentResponse;
}

export async function sendToActiveTab(message: PanelToContentMessage): Promise<ContentResponse> {
  const tab = await getActiveWebTab();
  if (!tab?.id) {
    return {
      ok: false,
      error:
        'No scholarship page found. Click the application tab in Chrome first, then tap Rescan.',
    };
  }

  if (!isReadableWebUrl(tab.url)) {
    return {
      ok: false,
      error:
        'This tab cannot be scanned. Open a normal scholarship website (http or https), not a Chrome settings page or PDF.',
    };
  }

  try {
    return await sendToTab(tab.id, message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Could not read this page. Refresh the tab, then tap Rescan. (${detail})`,
    };
  }
}
