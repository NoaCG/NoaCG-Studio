import { useEffect, useRef, useState, type FormEvent } from 'react';
import { requestPasswordReset, signInWithGoogle, signInWithEmail, signUpWithEmail } from '../../backend/auth';
import { trackEvent } from '../../backend/events';
import { useAuthState } from './useAuthState';
import { useAuthUi } from './authUi';
import BrandLogo from '../BrandLogo';
import { useModalGate } from '../spaceKey';
import { ACCOUNT_IS_FOR, NO_ACCOUNT_NEEDED } from './accountCopy';

/**
 * The on-demand sign-in dialog (Era 5.6 — the open editor). The app is never walled behind it:
 * it opens over the workspace when the user clicks "Sign in" or hits an account-only feature
 * (cloud sync, community, AI). Google OAuth + email/password, with a sign-in / create-account
 * toggle. Signup is open (migration 0006); the server-side hook can re-close it to the
 * allowlist later without touching this dialog.
 */
/**
 * Google sign-in is BUILT but not PROVISIONED: the hosted project reports
 * `"google": false` from /auth/v1/settings, so the button can only ever error. It is hidden
 * rather than deleted — the code path, `[auth.external.google]` and the OAuth redirect are all
 * finished and correct, and the only missing piece is a Google Cloud OAuth client.
 *
 * FLIP THIS TO `true` in the same change that enables the provider on the hosted project.
 * The provisioning steps are docs/DEPLOYMENT.md, "Google sign-in"; step 7 there is the one
 * that makes this line safe to change.
 */
const GOOGLE_SIGN_IN_ENABLED: boolean = false;

export default function SignInDialog() {
  const open = useAuthUi((s) => s.signInOpen);
  const reason = useAuthUi((s) => s.reason);
  const intent = useAuthUi((s) => s.intent);
  const close = useAuthUi((s) => s.closeSignIn);
  const { signedIn, backendConfigured } = useAuthState();
  // This component stays mounted and renders null when closed, so the gate keys on the OPEN
  // state — gating on mount would disable every editor shortcut for the whole session.
  useModalGate(open && backendConfigured);

  // 'reset' = the forgot-password branch: email only, sends the reset link (docs/GOALS_ARCHIVE.md
  // "Student release" step 9 — the link's return trip is PasswordRecoveryPage's job). 'resume'
  // is not a form mode of its own — it signs back in through the ordinary signin form.
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Only dismiss on a backdrop click whose press ALSO began on the backdrop, so a drag that
  // selects text in the email/password field and releases outside never closes. See SaveDialogs.
  const pressedOnBackdrop = useRef(false);

  // Open on the half the caller asked for. Keyed on the OPEN transition (and on the intent
  // itself, so a second gate with a different answer re-aims the dialog), never on every
  // render — a manual toggle inside an open dialog must stick.
  useEffect(() => {
    if (!open) return;
    setMode(intent === 'resume' ? 'signin' : intent);
    setError(null);
    setNote(null);
  }, [open, intent]);

  // Close automatically the moment a session exists (email sign-in resolves in-page; the OAuth
  // path leaves the page entirely, so it never needs this).
  useEffect(() => {
    if (open && signedIn && backendConfigured) close();
  }, [open, signedIn, backendConfigured, close]);

  // Escape closes — signing in is always optional.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open || !backendConfigured) return null;

  const google = async () => {
    setBusy(true);
    setError(null);
    const { error } = await signInWithGoogle();
    // On success the page redirects to Google; only an error returns control here.
    if (error) {
      setError(error);
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    if (mode === 'reset') {
      const { error } = await requestPasswordReset(email.trim());
      setBusy(false);
      if (error) setError(error);
      else setNote('Check your email. The reset link brings you back here to set a new password.');
      return;
    }
    const fn = mode === 'signin' ? signInWithEmail : signUpWithEmail;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    // On sign-in, the auth subscription closes the dialog. On sign-up, confirm-email first.
    if (mode === 'signup') {
      // Counted here rather than in backend/auth so the funnel client keeps its one-way
      // dependency on auth (it reads the access token) instead of forming a cycle. Only the
      // email path can tell a NEW account from a returning one - an OAuth sign-in looks the
      // same either way, so it is deliberately not counted rather than counted wrongly.
      trackEvent('signup');
      setNote('Check your email to confirm your account, then sign in.');
    }
  };

  const toggle = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setNote(null);
  };

  // Whether a gate opened this dialog with a reason of its own. One test, read by both lines
  // below, so the two shapes cannot drift apart.
  const throughDoor = reason !== null;
  // A session that merely needs a refresh belongs to someone who already has an account — the
  // free-account sentence below is written for someone who has never signed in, so 'resume'
  // skips it and shows only the reason and the no-wall line. Keyed on `mode`, not just `intent`:
  // the reader can still toggle to "Create a free account" from this dialog (the button below is
  // not hidden for 'resume'), and once they have, they ARE the someone the sentence is for - the
  // suppression must track what is ON SCREEN, not only why the dialog first opened.
  const isResumeSignIn = intent === 'resume' && mode !== 'signup';

  return (
    <div
      className="auth-gate auth-overlay"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) close();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="auth-card" role="dialog" aria-modal="true" aria-label="Sign in">
        {/* The ✕ sits in a real header ROW, not absolutely positioned over the card
            (re-design/handoff.md §6): an out-of-flow button overlaps whatever grows under it,
            and it is the one control here whose position must never depend on the content. */}
        <div className="auth-head">
          <div className="spacer" />
          <button className="gallery-close" onClick={close} title="Close (keep working without an account)">✕</button>
        </div>
        <div className="auth-logo"><BrandLogo size={44} stacked /></div>
        {/* WHAT THE ACCOUNT IS FOR, said at the moment we ask and nowhere else. A gate's own
            reason ("Sign in to view this shared template.") says why NOW and leads when there is
            one; the account sentence then moves under it, so a reader who arrived through a door
            still learns what the account buys beyond that door. Opened from the topbar there is
            no door, and the sentence is the whole answer. The no-wall line closes both shapes. */}
        <p className="auth-tag" data-testid="auth-reason">{throughDoor ? reason : ACCOUNT_IS_FOR}</p>
        <p className="muted auth-sub" data-testid="auth-account-for">
          {throughDoor && !isResumeSignIn ? `${ACCOUNT_IS_FOR} ${NO_ACCOUNT_NEEDED}` : NO_ACCOUNT_NEEDED}
        </p>
        {!isResumeSignIn && <p className="muted auth-sub">Your account opens a separate cloud workspace. Local work stays on this browser; use export and import to transfer it deliberately.</p>}

        {mode === 'signup' && (
          <p className="auth-legal">
            By creating an account, you agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and acknowledge the{' '}
            <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
          </p>
        )}

        {GOOGLE_SIGN_IN_ENABLED && (
          <>
            <button className="primary auth-google" onClick={google} disabled={busy}>
              Continue with Google
            </button>

            <div className="auth-or"><span>or</span></div>
          </>
        )}

        <form onSubmit={submit}>
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {mode !== 'reset' && (
            <>
              <label htmlFor="auth-pass" style={{ marginTop: 10 }}>Password</label>
              <input
                id="auth-pass"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </>
          )}
          <button type="submit" className="primary auth-submit" disabled={busy}>
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        {error && <p className="auth-error">{error}</p>}
        {note && <p className="auth-note">{note}</p>}

        {mode === 'signin' && (
          <button
            className="auth-toggle"
            onClick={() => { setMode('reset'); setError(null); setNote(null); }}
            disabled={busy}
            data-testid="forgot-password"
          >
            Forgot your password?
          </button>
        )}
        <button className="auth-toggle" onClick={toggle} disabled={busy}>
          {mode === 'signin' ? 'New here? Create a free account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
