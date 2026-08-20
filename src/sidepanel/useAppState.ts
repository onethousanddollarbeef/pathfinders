/**
 * Single source of truth for the side panel.
 *
 * Reads state from `chrome.storage.local`, re-reads it whenever any surface
 * writes (so the overlay and the panel never disagree), and derives the match
 * list once per profile/catalog change.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { matchAll } from '../core/matching';
import { buildPlan } from '../core/planner';
import { createTrackedApplication, setStatus, toggleTask } from '../core/tracker';
import { loadState, saveState, subscribeToState } from '../core/storage';
import { getSession, pullState, pushState, resendConfirmationEmail, signIn, signOut, signUp, ensureRemoteProfile } from '../core/supabase';
import type { SupabaseSession } from '../core/supabase';
import type { AppState, Settings } from '../core/storage';
import type {
  ApplicationStatus,
  MatchResult,
  Plan,
  Scholarship,
  StudentProfile,
  TrackedApplication,
} from '../core/types';

export interface AppStore {
  state: AppState | undefined;
  catalog: Scholarship[];
  matches: MatchResult[];
  plan: Plan | undefined;
  updateProfile: (updater: (profile: StudentProfile) => StudentProfile) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  saveScholarship: (scholarshipId: string) => void;
  removeApplication: (scholarshipId: string) => void;
  changeStatus: (scholarshipId: string, status: ApplicationStatus, awardAmount?: number) => void;
  toggleApplicationTask: (scholarshipId: string, taskId: string) => void;
  setNotes: (scholarshipId: string, notes: string) => void;
  toggleComparison: (scholarshipId: string) => void;
  addCustomScholarship: (scholarship: Scholarship) => void;
  removeCustomScholarship: (scholarshipId: string) => void;
  dismiss: (scholarshipId: string) => void;
  session: SupabaseSession | undefined;
  syncStatus: 'local' | 'syncing' | 'synced' | 'error';
  syncError: string | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ message: string; signedIn: boolean }>;
  resendConfirmation: (email: string) => Promise<string>;
  signOut: () => Promise<void>;
}

export function useAppState(): AppStore {
  const [state, setState] = useState<AppState | undefined>(undefined);
  const [session, setSession] = useState<SupabaseSession | undefined>(undefined);
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'synced' | 'error'>('local');
  const [syncError, setSyncError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([loadState(), getSession()]).then(async ([loaded, restoredSession]) => {
      if (!active) return;
      setSession(restoredSession);
      if (!restoredSession) {
        setState(loaded);
        return;
      }
      setSyncStatus('syncing');
      try {
        const next = await pullState(restoredSession, loaded);
        await saveState(next);
        await pushState(restoredSession, next);
        if (active) {
          setState(next);
          setSyncStatus('synced');
        }
      } catch (error) {
        if (active) {
          setState(loaded);
          setSyncStatus('error');
          setSyncError('Could not load your account. You can keep working locally.');
        }
      }
    });
    const unsubscribe = subscribeToState((next) => setState(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const commit = useCallback((updater: (current: AppState) => AppState) => {
    setState((current) => {
      if (!current) return current;
      const next = updater(current);
      void saveState(next);
      if (session) {
        setSyncStatus('syncing');
        void pushState(session, next).then(() => {
          setSyncStatus('synced');
          setSyncError(undefined);
        }).catch((error: unknown) => {
          setSyncStatus('error');
          const raw = error instanceof Error ? error.message : String(error);
          setSyncError(raw.includes('Supabase') || raw.includes('request failed')
            ? 'Could not reach your account. Try again in a moment.'
            : raw);
        });
      }
      return next;
    });
  }, [session]);

  // The extension only tracks applications a student explicitly captures.
  // The illustrative seed data remains available to the pure engine tests, but
  // is intentionally never presented as an in-product scholarship catalog.
  const catalog = useMemo(() => state?.customScholarships ?? [], [state?.customScholarships]);

  const matches = useMemo(() => {
    if (!state) return [];
    const dismissed = new Set(state.settings.dismissedScholarshipIds);
    return matchAll(
      catalog.filter((scholarship) => !dismissed.has(scholarship.id)),
      state.profile,
    );
  }, [catalog, state]);

  const plan = useMemo(() => {
    if (!state) return undefined;
    return buildPlan(matches, state.profile, state.applications, {
      weeklyHours: state.settings.weeklyHoursOverride,
    });
  }, [matches, state]);

  const findScholarship = useCallback(
    (id: string) => catalog.find((scholarship) => scholarship.id === id),
    [catalog],
  );

  const updateApplication = useCallback(
    (scholarshipId: string, updater: (application: TrackedApplication) => TrackedApplication) => {
      commit((current) => ({
        ...current,
        applications: current.applications.map((application) =>
          application.scholarshipId === scholarshipId ? updater(application) : application,
        ),
      }));
    },
    [commit],
  );

  return {
    state,
    catalog,
    matches,
    plan,
    session,
    syncStatus,
    syncError,

    signIn: async (email, password) => {
      setSyncStatus('syncing');
      const nextSession = await signIn(email, password);
      const local = state ?? await loadState();
      const remote = await pullState(nextSession, local);
      const next = remote;
      await saveState(next);
      await pushState(nextSession, next);
      setSession(nextSession);
      setState(next);
      setSyncStatus('synced');
      setSyncError(undefined);
    },

    signUp: async (email, password) => {
      const result = await signUp(email, password);
      if (result.session) {
        const local = state ?? await loadState();
        await ensureRemoteProfile(result.session, local);
        await pushState(result.session, local);
        setSession(result.session);
        setSyncStatus('synced');
      }
      return { message: result.message, signedIn: result.signedIn };
    },

    resendConfirmation: async (email) => resendConfirmationEmail(email),

    signOut: async () => {
      await signOut(session);
      setSession(undefined);
      setSyncStatus('local');
      setSyncError(undefined);
    },

    updateProfile: useCallback(
      (updater) =>
        commit((current) => ({
          ...current,
          profile: { ...updater(current.profile), updatedAt: Date.now() },
        })),
      [commit],
    ),

    updateSettings: useCallback(
      (patch) => commit((current) => ({ ...current, settings: { ...current.settings, ...patch } })),
      [commit],
    ),

    saveScholarship: useCallback(
      (scholarshipId) =>
        commit((current) => {
          if (current.applications.some((application) => application.scholarshipId === scholarshipId)) {
            return current;
          }
          // Prefer the matched copy: its deadline has been rolled to the next
          // cycle, so the generated task due dates are not already in the past.
          const scholarship =
            matches.find((match) => match.scholarship.id === scholarshipId)?.scholarship ??
            findScholarship(scholarshipId);
          if (!scholarship) return current;
          return {
            ...current,
            applications: [...current.applications, createTrackedApplication(scholarship, current.profile)],
          };
        }),
      [commit, findScholarship, matches],
    ),

    removeApplication: useCallback(
      (scholarshipId) =>
        commit((current) => ({
          ...current,
          applications: current.applications.filter((a) => a.scholarshipId !== scholarshipId),
        })),
      [commit],
    ),

    changeStatus: useCallback(
      (scholarshipId, status, awardAmount) =>
        updateApplication(scholarshipId, (application) =>
          setStatus(application, status, Date.now(), awardAmount),
        ),
      [updateApplication],
    ),

    toggleApplicationTask: useCallback(
      (scholarshipId, taskId) =>
        updateApplication(scholarshipId, (application) => toggleTask(application, taskId)),
      [updateApplication],
    ),

    setNotes: useCallback(
      (scholarshipId, notes) => updateApplication(scholarshipId, (application) => ({ ...application, notes })),
      [updateApplication],
    ),

    toggleComparison: useCallback(
      (scholarshipId) =>
        commit((current) => {
          const selected = current.settings.comparisonIds;
          const next = selected.includes(scholarshipId)
            ? selected.filter((id) => id !== scholarshipId)
            : [...selected, scholarshipId].slice(-4); // Four columns is all that fits.
          return { ...current, settings: { ...current.settings, comparisonIds: next } };
        }),
      [commit],
    ),

    addCustomScholarship: useCallback(
      (scholarship) =>
        commit((current) => ({
          ...current,
          customScholarships: [
            ...current.customScholarships.filter((entry) => entry.id !== scholarship.id),
            scholarship,
          ],
        })),
      [commit],
    ),

    removeCustomScholarship: useCallback(
      (scholarshipId) =>
        commit((current) => ({
          ...current,
          customScholarships: current.customScholarships.filter((entry) => entry.id !== scholarshipId),
          applications: current.applications.filter((a) => a.scholarshipId !== scholarshipId),
        })),
      [commit],
    ),

    dismiss: useCallback(
      (scholarshipId) =>
        commit((current) => ({
          ...current,
          settings: {
            ...current.settings,
            dismissedScholarshipIds: [...new Set([...current.settings.dismissedScholarshipIds, scholarshipId])],
          },
        })),
      [commit],
    ),
  };
}
