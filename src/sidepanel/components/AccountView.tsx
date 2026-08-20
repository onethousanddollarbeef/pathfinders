import { useState } from 'react';
import { isEmailVerified } from '../../core/supabase';
import type { AppStore } from '../useAppState';
import { PageView } from './PageView';

type AuthMode = 'sign-in' | 'create';

export function AccountView({ store }: { store: AppStore }) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [signupBlocked, setSignupBlocked] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMessage(undefined);
    setSignupBlocked(false);
    try {
      if (mode === 'sign-in') {
        await store.signIn(email.trim(), password);
        setMessage('Signed in. Your Nexus data is now synced.');
      } else {
        const result = await store.signUp(email.trim(), password);
        setSignupBlocked(!result.signedIn);
        setMessage(result.message);
        if (result.signedIn) setPassword('');
      }
      if (mode === 'sign-in') setPassword('');
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.toLowerCase().includes('email not confirmed')) {
        setSignupBlocked(true);
        setMessage(
          'This Supabase project still requires email confirmation before sign-in. Disable **Confirm email** under Authentication → Providers → Email for instant access, or verify your email first.',
        );
      } else {
        setMessage(text);
      }
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    const targetEmail = store.session?.user.email ?? email.trim();
    if (!targetEmail) return;
    setBusy(true);
    setMessage(undefined);
    try {
      setMessage(await store.resendConfirmation(targetEmail));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setMessage(undefined);
    setSignupBlocked(false);
    setPassword('');
  };

  const showVerifyPrompt = store.session && !isEmailVerified(store.session);

  return (
    <div className="view">
      <div className="card auth-card">
        {store.session ? (
          <>
            <h2 className="auth-title">Your account</h2>
            <p className="auth-subtitle small muted">Signed in and syncing with nexusnext.lovable.app</p>
            <p className="small" style={{ margin: '10px 0 4px' }}><strong>{store.session.user.email}</strong></p>
            <p className="small muted">
              Your profile, applications, settings, and saved scholarships stay in sync across the website and extension.
            </p>

            {showVerifyPrompt && (
              <div className="banner info" style={{ marginTop: 10 }}>
                <strong>Verify your email (optional)</strong>
                <p className="small" style={{ margin: '6px 0 8px' }}>
                  You can use Nexus without verifying, but confirming your email helps secure your account and matches the website.
                  Verification emails are sent by Supabase (usually <code>noreply@mail.app.supabase.io</code>) — check spam.
                </p>
                <button type="button" className="btn tiny" disabled={busy} onClick={() => void resendVerification()}>
                  Send verification email
                </button>
              </div>
            )}

            <div className={`banner${store.syncStatus === 'error' ? ' warn' : store.syncStatus === 'synced' ? ' success' : ' info'}`} style={{ marginTop: 10 }}>
              {store.syncStatus === 'syncing' ? 'Syncing…' : store.syncStatus === 'synced' ? 'Synced with Supabase' : store.syncError ?? 'Saved locally'}
            </div>
            {store.syncError && <p className="small muted">{store.syncError}</p>}
            <button type="button" className="btn" onClick={() => void store.signOut()}>Sign out</button>
          </>
        ) : (
          <>
            <h2 className="auth-title">{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="auth-subtitle small muted">
              {mode === 'sign-in'
                ? 'Sign in to see your scholarship matches and sync with the website.'
                : 'Create an account and start syncing immediately — email verification is optional afterward.'}
            </p>

            <div className="stack" style={{ marginTop: 12 }}>
              {mode === 'create' && (
                <p className="small muted" style={{ margin: 0 }}>
                  Use at least 8 characters. Avoid common or leaked passwords — Supabase will reject weak ones.
                </p>
              )}
              <label className="field">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="field">
                Password
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <button
                type="button"
                className="btn primary auth-submit"
                disabled={busy || !email || password.length < 8}
                onClick={() => void submit()}
              >
                {mode === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>

              {message && (
                <div
                  className={`banner${
                    signupBlocked ? ' warn' : message.includes('Signed in') || message.includes('signed in') ? ' success' : ''
                  }`}
                >
                  {message}
                </div>
              )}

              {signupBlocked && (
                <button type="button" className="btn subtle auth-switch" disabled={busy || !email} onClick={() => void resendVerification()}>
                  Send verification email
                </button>
              )}

              <button
                type="button"
                className="btn subtle auth-switch"
                onClick={() => switchMode(mode === 'sign-in' ? 'create' : 'sign-in')}
              >
                {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="combined-section">
        <div>
          <h2 className="section-heading">Current page tools</h2>
          <p className="small muted">Scan, autofill, or capture the scholarship open in your active tab.</p>
        </div>
        <PageView store={store} embedded />
      </div>
    </div>
  );
}
