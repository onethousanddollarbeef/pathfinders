/**
 * Persistence.
 *
 * Everything lives in `chrome.storage.local` on the student's own machine — no
 * account, no server, no network calls. A memory fallback keeps the same API
 * working in tests and in any context where the extension APIs are absent.
 */

import { createEmptyProfile } from './profile';
import type { Scholarship, StudentProfile, TrackedApplication } from './types';

export interface Settings {
  autofillEnabled: boolean;
  /** Show the confirmation overlay before writing values into a page. */
  confirmBeforeFill: boolean;
  /** Skip fields the engine is not confident about. */
  strictAutofill: boolean;
  /** Weekly capacity override used by the planner's what-if slider. */
  weeklyHoursOverride?: number;
  dismissedScholarshipIds: string[];
  comparisonIds: string[];
  onboardingComplete: boolean;
}

export interface AppState {
  profile: StudentProfile;
  applications: TrackedApplication[];
  /** Scholarships the student added manually or captured from a page. */
  customScholarships: Scholarship[];
  settings: Settings;
}

export const STORAGE_KEY = 'scholarpath.state.v1';

export function defaultSettings(): Settings {
  return {
    autofillEnabled: true,
    confirmBeforeFill: true,
    strictAutofill: false,
    dismissedScholarshipIds: [],
    comparisonIds: [],
    onboardingComplete: false,
  };
}

export function defaultState(now: number = Date.now()): AppState {
  return {
    profile: createEmptyProfile(now),
    applications: [],
    customScholarships: [],
    settings: defaultSettings(),
  };
}

interface AsyncKeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local);
}

const memoryStore = new Map<string, unknown>();

const store: AsyncKeyValueStore = {
  async get(key) {
    if (!hasChromeStorage()) return memoryStore.get(key);
    const result = await chrome.storage.local.get(key);
    return result?.[key];
  },
  async set(key, value) {
    if (!hasChromeStorage()) {
      memoryStore.set(key, value);
      return;
    }
    await chrome.storage.local.set({ [key]: value });
  },
};

/** Fills in fields added by later versions so older saved state still loads. */
export function migrateState(raw: Partial<AppState> | undefined, now: number = Date.now()): AppState {
  const base = defaultState(now);
  if (!raw) return base;
  return {
    profile: { ...base.profile, ...(raw.profile ?? {}),
      demographics: { ...base.profile.demographics, ...(raw.profile?.demographics ?? {}) },
      academics: { ...base.profile.academics, ...(raw.profile?.academics ?? {}) },
      financials: { ...base.profile.financials, ...(raw.profile?.financials ?? {}) },
      interests: raw.profile?.interests ?? [],
      activities: raw.profile?.activities ?? [],
      essays: raw.profile?.essays ?? [],
      recommenders: raw.profile?.recommenders ?? [],
    },
    applications: raw.applications ?? [],
    customScholarships: raw.customScholarships ?? [],
    settings: { ...base.settings, ...(raw.settings ?? {}) },
  };
}

export async function loadState(): Promise<AppState> {
  const raw = (await store.get(STORAGE_KEY)) as Partial<AppState> | undefined;
  return migrateState(raw);
}

export async function saveState(state: AppState): Promise<void> {
  await store.set(STORAGE_KEY, state);
}

export async function updateState(updater: (state: AppState) => AppState): Promise<AppState> {
  const current = await loadState();
  const next = updater(current);
  await saveState(next);
  return next;
}

type Listener = (state: AppState) => void;

/** Keeps every open surface (side panel, overlay) in sync after a write. */
export function subscribeToState(listener: Listener): () => void {
  if (!hasChromeStorage() || !chrome.storage.onChanged) return () => {};
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    listener(migrateState(changes[STORAGE_KEY].newValue as Partial<AppState> | undefined));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

/** Test seam: resets the in-memory fallback between test cases. */
export function __resetMemoryStore(): void {
  memoryStore.clear();
}
