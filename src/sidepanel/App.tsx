import { useState } from 'react';
import { useAppState } from './useAppState';
import { DashboardView } from './components/DashboardView';
import { ProfileView } from './components/ProfileView';
import { DiscoverView } from './components/DiscoverView';
import { CompareView } from './components/CompareView';
import { PlanView } from './components/PlanView';
import { TrackerView } from './components/TrackerView';
import { PageView } from './components/PageView';
import { AccountView } from './components/AccountView';

export type TabId = 'home' | 'profile' | 'discover' | 'compare' | 'plan' | 'tracker' | 'page' | 'account';

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'profile', label: 'Profile' },
  { id: 'discover', label: 'Discover' },
  { id: 'compare', label: 'Compare' },
  { id: 'plan', label: 'Plan' },
  { id: 'tracker', label: 'Tracker' },
  { id: 'page', label: 'Page' },
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
  const comparisonCount = store.state.settings.comparisonIds.length;

  const badgeFor = (id: TabId): number | undefined => {
    if (id === 'tracker' && activeCount > 0) return activeCount;
    if (id === 'compare' && comparisonCount > 0) return comparisonCount;
    return undefined;
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Nexus</h1>
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
      {tab === 'compare' && <CompareView store={store} />}
      {tab === 'plan' && <PlanView store={store} />}
      {tab === 'tracker' && <TrackerView store={store} />}
      {tab === 'page' && <PageView store={store} />}
      {tab === 'account' && <AccountView store={store} />}
    </div>
  );
}
