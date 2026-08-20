import { useState } from 'react';
import { isEmailVerified, NEXUS_AUTH_REDIRECT_URL } from '../../core/supabase';
import type { AppStore } from '../useAppState';
import { PageView } from './PageView';

const NEXUS_WEB_URL = 'https://nexusnext.lovable.app';
const NEXUS_AUTH_URL = `${NEXUS_WEB_URL}/auth`;

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
        setMessage('Signed in. Your profile and applications are loading from Nexus.');
        setPassword('');
      } else {
        const result = await store.signUp(email.trim(), password);
        setSignupBlocked(!result.signedIn);
        setMessage(result.message);
        if (result.signedIn) setPassword('');
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.toLowerCase().includes('email not confirmed')) {
        setSignupBlocked(true);
        setMessage(
          'Your email is not confirmed yet. Open the confirmation link from your inbox (it opens nexusnext.lovable.app), then sign in here with the same email and password.',
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
              Your profile, applications, and saved scholarships stay in sync across the website and extension.
            </p>

            {showVerifyPrompt && (
              <div className="banner info" style={{ marginTop: 10 }}>
                <strong>Verify your email (optional)</strong>
                <p className="small" style={{ margin: '6px 0 8px' }}>
                  Confirming your email secures your account. The link opens on the website — that is normal.
                </p>
                <button type="button" className="btn tiny" disabled={busy} onClick={() => void resendVerification()}>
                  Send verification email
                </button>
              </div>
            )}

            <div className={`banner${store.syncStatus === 'error' ? ' warn' : store.syncStatus === 'synced' ? ' success' : ' info'}`} style={{ marginTop: 10 }}>
              {store.syncStatus === 'syncing' ? 'Syncing…' : store.syncStatus === 'synced' ? 'Synced with Nexus' : store.syncError ?? 'Saved locally'}
            </div>
            {store.syncError && <p className="small muted">{store.syncError}</p>}
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              <a className="btn tiny" href={NEXUS_WEB_URL} target="_blank" rel="noreferrer">
                Open website
              </a>
              <button type="button" className="btn" onClick={() => void store.signOut()}>Sign out</button>
            </div>
          </>
        ) : (
          <>
            <div className="website-first-card">
              <p className="section-title" style={{ margin: 0 }}>New to Nexus?</p>
              <h2 className="auth-title" style={{ marginTop: 4 }}>Start on the website</h2>
              <p className="small muted" style={{ margin: '6px 0 10px' }}>
                Create your account and build your profile at nexusnext.lovable.app first — confirmation emails and
                onboarding work best there. Then come back here and sign in with the same email and password to load
                your information.
              </p>
              <ol className="getting-started-steps">
                <li>
                  <a className="link" href={NEXUS_AUTH_URL} target="_blank" rel="noreferrer">
                    Create an account on Nexus
                  </a>{' '}
                  (confirm your email if prompted)
                </li>
                <li>Complete your profile on the website</li>
                <li>Return here and sign in below — your data will sync automatically</li>
              </ol>
              <a className="btn primary auth-submit" href={NEXUS_AUTH_URL} target="_blank" rel="noreferrer">
                Go to nexusnext.lovable.app
              </a>
            </div>

            <div className="auth-divider">
              <span>Already have an account?</span>
            </div>

            <h2 className="auth-title" style={{ marginTop: 0 }}>Sign in to the extension</h2>
            <p className="auth-subtitle small muted">
              Use the same email and password as the website to load your profile and applications.
            </p>

            <div className="stack" style={{ marginTop: 12 }}>
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
                    autoComplete="current-password"
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
                Sign in
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
                <>
                  <p className="small muted" style={{ margin: 0 }}>
                    Confirmation links open in your browser at {NEXUS_AUTH_REDIRECT_URL} — not inside the extension.
                    After confirming, sign in here again.
                  </p>
                  <button type="button" className="btn subtle auth-switch" disabled={busy || !email} onClick={() => void resendVerification()}>
                    Resend confirmation email
                  </button>
                </>
              )}

              <details className="create-here-details">
                <summary>Create an account in the extension instead</summary>
                <p className="small muted">
                  This uses the same Supabase account as the website, but confirmation emails open on the website.
                  If email does not arrive, create your account on the website instead.
                </p>
                {mode === 'create' ? (
                  <button type="button" className="btn tiny" onClick={() => switchMode('sign-in')}>
                    Back to sign in only
                  </button>
                ) : (
                  <button type="button" className="btn tiny" onClick={() => switchMode('create')}>
                    Show create-account form
                  </button>
                )}
              </details>

              {mode === 'create' && (
                <>
                  <p className="small muted" style={{ margin: 0 }}>
                    Use at least 8 characters. Avoid common or leaked passwords.
                  </p>
                  <button
                    type="button"
                    className="btn auth-submit"
                    disabled={busy || !email || password.length < 8}
                    onClick={() => void submit()}
                  >
                    Create account here
                  </button>
                </>
              )}
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
