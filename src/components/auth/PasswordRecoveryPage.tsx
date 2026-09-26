import { useEffect, useState, type FormEvent } from 'react';
import { requestPasswordReset, updatePassword } from '../../backend/auth';
import { isBackendConfigured } from '../../backend/config';
import { arrivingRecoveryLink } from '../../backend/recoveryLink';
import BrandLogo from '../BrandLogo';
import { useAuthState } from './useAuthState';

/**
 * The route-owned password recovery surface. Keeping it outside the studio gives valid and failed
 * links one clear destination, including an honest way forward when the provider rejects a link.
 *
 * App.tsx renders it INSTEAD of the studio on two keys: `?recovery=1` (what RECOVERY_REDIRECT
 * asks for) and a `type=recovery` fragment (what Supabase itself puts on every reset link,
 * including every one already in somebody's inbox). See the branch there.
 */
export default function PasswordRecoveryPage() {
  // Offline builds have no account surface at all. Split the configured body into its own
  // component so no auth-state hook or element is created on this path.
  if (!isBackendConfigured()) return null;
  return <ConfiguredPasswordRecoveryPage />;
}

/** This page's address with `?recovery=1` and the provider's fragment stripped off: the plain
 *  studio. Both ways out use it, so they cannot drift apart. */
const studioUrl = (): string =>
  typeof window === 'undefined' ? '/app' : window.location.origin + window.location.pathname;

/** The card's frame, the same one on all four states. Same shape as AgentAccessConsent's, and
 *  for the same reason: this renders INSTEAD of the studio, so it is a page on the app's own
 *  ground rather than an overlay over a workspace that is not there. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-gate" data-testid="password-recovery-page">
      <div className="auth-card">
        <div className="auth-logo"><BrandLogo size={44} stacked /></div>
        {children}
      </div>
    </div>
  );
}

/** Back to the plain studio. Every card carries it: this surface covers the whole window, and a
 *  reader who arrived by a stale link (or a bookmark of one) must never be stranded on it. */
function StudioLink() {
  return (
    <a className="auth-toggle" href={studioUrl()} data-testid="recovery-to-studio">
      Back to the studio
    </a>
  );
}

function ConfiguredPasswordRecoveryPage() {
  const { status } = useAuthState();
  const link = arrivingRecoveryLink();

  // The tab says what this page is. A reset link opens a new tab in most mail clients, so
  // "NoaCG Studio - Editor" would be the only label the reader ever got for it.
  useEffect(() => {
    document.title = 'NoaCG - reset your password';
  }, []);

  if (status === 'loading') {
    return (
      <Frame>
        <p className="auth-sub" data-testid="recovery-checking">Checking your reset link...</p>
      </Frame>
    );
  }

  // The provider REFUSED the link and said why. That is the only case we can call expired.
  if (link.kind === 'error') return <BlockedRecoveryCard reason="rejected" message={link.message} />;
  if (status === 'signed-in') return <NewPasswordCard />;
  // A real token that produced no session is NOT proof the link is dead, and saying so would be
  // a lie in the failure class this repo designs for: backend/auth.ts readSessionBounded gives
  // up after 6 s and reports signed-out on a network that black-holes *.supabase.co (the broadcaster
  // demo). Telling that reader their link expired sends them to request another one down the
  // same blocked path, which will also appear to work. So say what is actually known - the
  // check did not complete - and offer the cheap thing first.
  if (link.kind === 'token') return <BlockedRecoveryCard reason="unconfirmed" message={null} />;
  // No token, no session: somebody opened the route directly, or a link whose fragment was
  // already spent. Neither is an expired link either.
  return <BlockedRecoveryCard reason="absent" message={null} />;
}

/** What a card that is not the form has to say. Kept as three named cases rather than one
 *  shrug, because they call for three different next moves. */
const BLOCKED_COPY = {
  rejected: {
    lead: 'This reset link cannot be used.',
    body: 'It may have expired, been used already, or been opened after a newer reset link was requested. Nothing about your account has changed.',
  },
  unconfirmed: {
    lead: 'We could not check this reset link.',
    body: 'The link may have expired, or this browser could not reach the account service. Nothing about your account has changed, and trying again is safe.',
  },
  absent: {
    lead: 'This page needs a reset link.',
    body: 'Open the link from the password-reset email, or ask for a new one below. Nothing about your account has changed.',
  },
} as const;

function NewPasswordCard() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await updatePassword(password);
    setBusy(false);
    if (result.error) setError(result.error);
    else setDone(true);
  };

  return (
    <Frame>
      {done ? (
          <>
            <p className="auth-note">Password changed. You are signed in.</p>
            <button
              type="button"
              className="primary auth-submit"
              data-testid="recovery-continue"
              onClick={() => window.location.replace(studioUrl())}
            >
              Continue to the studio
            </button>
          </>
        ) : (
          <>
            <p className="auth-tag">Set a new password for your account.</p>
            <form onSubmit={submit}>
              <label htmlFor="recovery-password">New password</label>
              <input
                id="recovery-password"
                data-testid="recovery-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                autoFocus
              />
              <label htmlFor="recovery-confirm" style={{ marginTop: 10 }}>Repeat it</label>
              <input
                id="recovery-confirm"
                data-testid="recovery-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
                minLength={6}
              />
              <button
                type="submit"
                className="primary auth-submit"
                disabled={busy}
                data-testid="recovery-submit"
              >
                Save new password
              </button>
            </form>
            {error && <p className="auth-error">{error}</p>}
            <StudioLink />
          </>
        )}
    </Frame>
  );
}

function BlockedRecoveryCard({
  reason,
  message,
}: {
  reason: keyof typeof BLOCKED_COPY;
  message: string | null;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const copy = BLOCKED_COPY[reason];

  const resend = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResent(false);
    const result = await requestPasswordReset(email.trim());
    setBusy(false);
    if (result.error) setError(result.error);
    else setResent(true);
  };

  return (
    <Frame>
      <div data-testid="recovery-expired" data-recovery-reason={reason}>
        <p className="auth-tag">{copy.lead}</p>
        {message !== null && <p className="auth-sub">{message}</p>}
        <p className="auth-sub">{copy.body}</p>
        {reason === 'unconfirmed' && (
          // The cheap move first: a reload re-reads the same link, and on a slow or filtered
          // network that is usually all it needed. Asking for a NEW link would travel the same
          // blocked path and look like it worked. It takes the accent and the resend below
          // drops to a plain button, because two full-width primaries stacked say the two are
          // equally good moves, and they are not.
          <>
            <button
              type="button"
              className="primary auth-submit"
              data-testid="recovery-retry"
              onClick={() => window.location.reload()}
            >
              Try this link again
            </button>
            <div className="auth-or">or</div>
          </>
        )}
        <form onSubmit={resend}>
          <label htmlFor="recovery-resend-email">Email</label>
          <input
            id="recovery-resend-email"
            data-testid="recovery-resend-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button
            type="submit"
            className={reason === 'unconfirmed' ? 'auth-submit' : 'primary auth-submit'}
            disabled={busy}
            data-testid="recovery-resend"
          >
            Send a new reset link
          </button>
        </form>
        {error && <p className="auth-error">{error}</p>}
        {resent && (
          <p className="auth-note" data-testid="recovery-resent">
            If that address has an account, a new link is on its way.
          </p>
        )}
        <StudioLink />
      </div>
    </Frame>
  );
}
