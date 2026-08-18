import { useState } from 'react';
import type { AppStore } from '../useAppState';

export function AccountView({ store }: { store: AppStore }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const submit = async (mode: 'in' | 'up') => {
    setBusy(true);
    setMessage(undefined);
    try {
      if (mode === 'in') {
        await store.signIn(email.trim(), password);
        setMessage('Signed in. Your Supabase data is now synced.');
      } else {
        setMessage(await store.signUp(email.trim(), password));
      }
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view">
      <div className="card">
        <h2 style={{ margin: '0 0 6px' }}>Account & sync</h2>
        {store.session ? (
          <>
            <p className="small" style={{ margin: '6px 0' }}><strong>{store.session.user.email}</strong></p>
            <p className="small muted">
              Your profile, applications, settings, and saved scholarships are stored in Supabase and available to the
              website when you sign in with this same account.
            </p>
            <div className={`banner${store.syncStatus === 'error' ? ' warn' : ''}`}>
              {store.syncStatus === 'syncing' ? 'Syncing…' : store.syncStatus === 'synced' ? 'Synced with Supabase' : store.syncError ?? 'Saved locally'}
            </div>
            {store.syncError && <p className="small muted">{store.syncError}</p>}
            <button type="button" className="btn" onClick={() => void store.signOut()}>Sign out</button>
          </>
        ) : (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>
              Create an account or sign in to share your ScholarPath data with the website. Data remains cached on this device for offline use.
            </p>
            <label className="field">Email
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">Password
              <input type="password" autoComplete="current-password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <div className="row">
              <button type="button" className="btn primary" disabled={busy || !email || password.length < 6} onClick={() => void submit('in')}>Sign in</button>
              <button type="button" className="btn" disabled={busy || !email || password.length < 6} onClick={() => void submit('up')}>Create account</button>
            </div>
            {message && <div className="banner">{message}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
