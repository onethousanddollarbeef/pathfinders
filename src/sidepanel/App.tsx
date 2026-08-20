import { useEffect, useState } from 'react';
import { useAppState } from './useAppState';
import { DashboardView } from './components/DashboardView';
import { ProfileView } from './components/ProfileView';
import { TrackerView } from './components/TrackerView';
import { ExploreView } from './components/ExploreView';
import { AccountView } from './components/AccountView';
import type { CapturedScholarship } from '../core/pageCapture';
import { PENDING_CAPTURE_KEY, takePendingCaptureReview } from '../shared/pendingCapture';

export type TabId = 'home' | 'explore' | 'profile' | 'tracker' | 'account';

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'explore', label: 'Explore' },
  { id: 'profile', label: 'Profile' },
  { id: 'tracker', label: 'Applications' },
  { id: 'account', label: 'Account' },
];

export function App() {
  const store = useAppState();
  const [tab, setTab] = useState<TabId>('home');
  const [captureReview, setCaptureReview] = useState<CapturedScholarship | undefined>();

  const applyCapture = (captured: CapturedScholarship) => {
    store.captureAndTrack(captured.draft);
    setCaptureReview(captured);
    setTab('tracker');
  };

  useEffect(() => {
    if (!store.state) return;

    const consumePending = () => {
      void takePendingCaptureReview().then((pending) => {
        if (pending) applyCapture(pending);
      });
    };

    consumePending();
    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[PENDING_CAPTURE_KEY]?.newValue) consumePending();
    };
    chrome.storage.session.onChanged.addListener(onChanged);
    return () => chrome.storage.session.onChanged.removeListener(onChanged);
  }, [store.state]);

  if (!store.state) {
    return (
      <div className="app">
        <div className="empty">Loading your profile…</div>
      </div>
    );
  }

  const activeCount = store.state.applications.filter(
    (application) => application.status === 'saved' || application.status === 'started',
  ).length;

  const badgeFor = (id: TabId): number | undefined => {
    if (id === 'tracker' && activeCount > 0) return activeCount;
    return undefined;
  };

  const continueToNextPage = () => {
    const currentIndex = TABS.findIndex((entry) => entry.id === tab);
    setTab(TABS[(currentIndex + 1) % TABS.length].id);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="logo-shell">
            <img className="app-logo" src="/logo.png" alt="Nexus" />
          </div>
          <div>
            <h1>Nexus</h1>
            <div className="tagline">Your scholarship application command center</div>
          </div>
        </div>
        <span className="spacer" />
        <a
          className="scholarship-sites"
          href="https://nexusnext.lovable.app/explore"
          target="_blank"
          rel="noreferrer"
        >
          Scholarship sites
        </a>
      </header>

      <nav className="tabs">
        {TABS.map((entry) => {
          const badge = badgeFor(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              className={`tab${tab === entry.id ? ' active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
              {badge !== undefined && <span className="badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      {tab === 'home' && (
        <DashboardView store={store} onNavigate={setTab} onCaptured={applyCapture} />
      )}
      {tab === 'explore' && <ExploreView store={store} />}
      {tab === 'profile' && <ProfileView store={store} />}
      {tab === 'tracker' && (
        <TrackerView
          store={store}
          captureReview={captureReview}
          onCaptureReviewDone={() => setCaptureReview(undefined)}
        />
      )}
      {tab === 'account' && <AccountView store={store} />}

      <footer className="continue-footer">
        <button type="button" className="btn primary continue-button" onClick={continueToNextPage}>
          Save and continue
        </button>
      </footer>
    </div>
  );
}
