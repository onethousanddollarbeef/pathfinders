import type { AppStore } from '../useAppState';

/**
 * ScholarPath no longer ships a marketplace-style scholarship catalog. Students
 * find applications on the web and save the ones that matter from Account's
 * current-page tools; those applications then live in the tracker.
 */
export function DiscoverView({ store }: { store: AppStore }) {
  const applicationCount = store.state?.applications.length ?? 0;

  return (
    <div className="view">
      <div className="card">
        <h2 style={{ margin: 0 }}>Find applications on the web</h2>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          ScholarPath does not show a sponsored or preselected scholarship list. Browse application sites you trust,
          then open Account to scan the current page and save the application.
        </p>
      </div>

      <div className="card">
        <h3>Your application history</h3>
        <p className="small muted" style={{ margin: 0 }}>
          {applicationCount === 0
            ? 'No applications saved yet. Saved applications will appear under Applications.'
            : `${applicationCount} saved application${applicationCount === 1 ? '' : 's'}. You can mark each one complete under Applications.`}
        </p>
      </div>
    </div>
  );
}
