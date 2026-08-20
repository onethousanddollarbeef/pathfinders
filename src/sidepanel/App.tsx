import { useState } from 'react';
import { useAppState } from './useAppState';
import { DashboardView } from './components/DashboardView';
import { ProfileView } from './components/ProfileView';
import { DiscoverView } from './components/DiscoverView';
import { TrackerView } from './components/TrackerView';
import { AccountView } from './components/AccountView';

export type TabId = 'home' | 'profile' | 'discover' | 'tracker' | 'account';

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'profile', label: 'Profile' },
  { id: 'discover', label: 'Discover' },
  { id: 'tracker', label: 'Applications' },
  { id: 'account', label: 'Account' },
];

export function App() {
  const store = useAppState();
  const [tab, setTab] = useState<TabId>('home');

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
        <div>
          <h1>ScholarPath</h1>
          <div className="tagline">Find it, plan it, submit it.</div>
        </div>
        <span className="spacer" />
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

      {tab === 'home' && <DashboardView store={store} onNavigate={setTab} />}
      {tab === 'profile' && <ProfileView store={store} />}
      {tab === 'discover' && <DiscoverView store={store} />}
      {tab === 'tracker' && <TrackerView store={store} />}
      {tab === 'account' && <AccountView store={store} />}

      <footer className="continue-footer">
        <button type="button" className="btn primary continue-button" onClick={continueToNextPage}>
          Save and continue
        </button>
      </footer>
    </div>
  );
}
