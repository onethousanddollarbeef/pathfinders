import { useState } from 'react';
import { isEmailVerified } from '../../core/supabase';
import type { AppStore } from '../useAppState';

const NEXUS_WEB_URL = 'https://nexusnext.lovable.app';

type AuthMode = 'sign-in' | 'create' | 'reset-password';

function syncLabel(status: AppStore['syncStatus'], error?: string): string {
  if (status === 'syncing') return 'Updating…';
  if (status === 'synced') return 'Up to date';
  if (status === 'error') return error ?? 'Could not reach your account';
  return 'Saved on this device';
}

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
        setMessage('Signed in. Loading your profile and applications…');
        setPassword('');
      } else {
        const result = await store.signUp(email.trim(), password);
        setSignupBlocked(!result.signedIn);
        setMessage(result.message);
        if (result.signedIn) setPassword('');
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.toLowerCase().includes('confirm')) {
        setSignupBlocked(true);
        setMessage('Confirm your email first — open the link we sent you, then sign in here.');
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
    if (next !== 'sign-in') setPassword('');
  };

  const sendPasswordReset = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) return;
    setBusy(true);
    setMessage(undefined);
    try {
      setMessage(await store.requestPasswordReset(targetEmail));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const showVerifyPrompt = store.session && !isEmailVerified(store.session);

  return (
    <div className="view">
      <div className="card auth-card">
        {store.session ? (
          <>
            <h2 className="auth-title">Your account</h2>
            <p className="auth-subtitle small muted">Signed in to Nexus</p>
            <p className="small" style={{ margin: '10px 0 4px' }}><strong>{store.session.user.email}</strong></p>
            <p className="small muted">
              Your profile and applications stay in sync between the website and this extension.
            </p>

            {showVerifyPrompt && (
              <div className="banner info" style={{ marginTop: 10 }}>
                <strong>Verify your email</strong>
                <p className="small" style={{ margin: '6px 0 8px' }}>
                  Optional, but recommended. We will send a link that opens in your browser.
                </p>
                <button type="button" className="btn tiny" disabled={busy} onClick={() => void resendVerification()}>
                  Send verification email
                </button>
              </div>
            )}

            <div className={`banner${store.syncStatus === 'error' ? ' warn' : store.syncStatus === 'synced' ? ' success' : ' info'}`} style={{ marginTop: 10 }}>
              {syncLabel(store.syncStatus, store.syncError)}
            </div>
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              <a className="btn tiny" href={NEXUS_WEB_URL} target="_blank" rel="noreferrer">
                Open website
              </a>
              <button type="button" className="btn" onClick={() => void store.signOut()}>Sign out</button>
            </div>
          </>
        ) : mode === 'reset-password' ? (
          <>
            <h2 className="auth-title">Reset your password</h2>
            <p className="auth-subtitle small muted">
              Enter your email and we will send a link to choose a new password. The link opens in your browser — same
              flow as the website.
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

              <button
                type="button"
                className="btn primary auth-submit"
                disabled={busy || !email.trim()}
                onClick={() => void sendPasswordReset()}
              >
                Send reset link
              </button>

              {message && (
                <div className={`banner${message.includes('sent to') ? ' success' : ''}`}>
                  {message}
                </div>
              )}

              <button type="button" className="btn subtle auth-switch" onClick={() => switchMode('sign-in')}>
                Back to sign in
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="auth-title">{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="auth-subtitle small muted">
              {mode === 'sign-in'
                ? 'Sign in to load your profile, applications, and scholarship matches.'
                : 'Create an account here or on the website — same email and password works everywhere.'}
            </p>

            <div className="stack" style={{ marginTop: 12 }}>
              {mode === 'create' && (
                <p className="small muted" style={{ margin: 0 }}>
                  Password tips: at least 8 characters, mix letters and numbers, avoid common words.
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

              {mode === 'sign-in' && (
                <button type="button" className="btn subtle auth-forgot" onClick={() => switchMode('reset-password')}>
                  Forgot password?
                </button>
              )}

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
                    signupBlocked ? ' warn' : message.includes('Signed in') || message.includes("You're in") ? ' success' : ''
                  }`}
                >
                  {message}
                </div>
              )}

              {signupBlocked && (
                <>
                  <p className="small muted" style={{ margin: 0 }}>
                    The confirmation link opens in your browser. After confirming, sign in here again.
                  </p>
                  <button type="button" className="btn subtle auth-switch" disabled={busy || !email} onClick={() => void resendVerification()}>
                    Resend confirmation email
                  </button>
                </>
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
    </div>
  );
}
